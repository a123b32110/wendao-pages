// v42：包体压缩、坊市补货记账、配额满时新玩家仍能建号、落槌拍品折叠、补偿门槛
import test from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { pack, unpack, isTok } from "../tools/pack.mjs";
import { auctionOf, auxKey } from "../lib/game/shared.js";
import { HOUR, DAY } from "../lib/game/time.js";

test("压缩：任意文本（含中文、引号、反斜杠、重叠回溯）都能逐字解回，且载荷不会打断模板", () => {
  const samples = [
    "",
    "abc",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 重叠回溯（长度 > 偏移）
    "#wd .row{display:flex;gap:8px}#wd .row{display:flex;gap:8px}#wd .row{display:flex;gap:8px}",
    "问道问道问道问道问道问道问道问道问道问道问道问道问道问道问道问道，踏上仙路。踏上仙路。踏上仙路。",
    "var s='it\\'s';var r=/\\d+\\s*/g;\"quoted\" 'single' \\\\ backslash\nnewline\n\nvar s='it\\'s';var r=/\\d+\\s*/g;\"quoted\" 'single' \\\\ backslash\nnewline\n",
    "x".repeat(2000) + "y".repeat(2000) + "x".repeat(2000),
  ];
  for (const s of samples) {
    const p = pack(s);
    assert.equal(unpack(p), s);
    assert.ok(!p.includes("`") && !p.includes("${"), "载荷不能含反引号或 ${");
    assert.ok(!p.endsWith("\\"), "载荷不能以反斜杠收尾");
  }
  // 用了记号字的文本要拒绝，而不是悄悄解错
  assert.throws(() => pack("héllo Ā"), /token char/);
  assert.ok(isTok(0x100) && isTok(0x4ff) && !isTok(0x300) && !isTok(0x4e2d));
  // 真的省：重复的东西压得下去
  const big = samples[3].repeat(40);
  assert.ok(Buffer.byteLength(pack(big), "utf8") < Buffer.byteLength(big, "utf8") / 4);
});

test("配额满时新玩家照样能定下道号：档案那一键改成软写入，不再把整批存档顶回去", async () => {
  const s = new Site();
  for (let i = 0; i < 98; i++) s.shared.set(`junk:${i}`, { i });
  await s.call(7, "boot", {});
  const r = await s.call(7, "create", { name: "许闲" });
  assert.equal(r.ok, true, r.msg);
  assert.ok(s.char(7), "存档落盘了");
  assert.ok(!s.shared.has("p:7"), "共享区没地方时不写档案（暂时不上榜）");
  // 腾开之后，下一次请求把档案补上
  for (let i = 0; i < 20; i++) s.shared.delete(`junk:${i}`);
  await s.call(7, "home");
  assert.ok(s.shared.has("p:7"), "有地方了就补写档案");
});

test("落槌的拍品由 bot 折进 aux: 桶、散键被清扫；卖家买家照领，个人在拍名额照算", async () => {
  const s = new Site();
  await s.call(1, "boot", {}); await s.call(1, "create", { name: "卖家" });
  await s.call(2, "boot", {}); await s.call(2, "create", { name: "买家" });
  // 时间会跨过补偿线，把两人的建号时间挪到线后，免得礼包的灵石混进账里
  s.setChar(1, (c) => { c.r = 1; c.ls = 10000; c.inv.stack.m_lingcao = 50; c.created = Date.UTC(2026, 8, 10); });
  s.setChar(2, (c) => { c.r = 1; c.ls = 10000; c.created = Date.UTC(2026, 8, 10); });
  await s.call(1, "home"); await s.call(2, "home");
  let r = await s.call(1, "auction.create", { item: { id: "m_lingcao", n: 5 }, min: 100 });
  assert.equal(r.ok, true, r.msg);
  r = await s.call(2, "auction.bid", { aid: "1:1", amt: 300 });
  assert.equal(r.ok, true, r.msg);
  s.advance(25 * HOUR); await s.tick();
  assert.ok(s.shared.get("auction:1:1")?.settled, "先结算");
  s.advance(10 * 60_000); await s.tick(); // 下一轮：折进桶 + 清散键
  assert.ok(!s.shared.has("auction:1:1"), "散键被清扫");
  const rec = s.shared.get(auxKey(1))?.d?.["1:1"];
  assert.ok(rec && rec.settled && rec.settled.winner === 2, "桶里有完整记录");
  assert.equal(auctionOf(s.shared, "1:1"), rec);
  // 卖家从桶里领钱（任何一次请求都会顺手领），买家从桶里领货
  const ls1 = s.char(1).ls;
  await s.call(1, "home");
  assert.ok(s.char(1).ls >= ls1 + 300, "卖家收到成交价（另有当日登录赏）");
  assert.equal(s.char(1).aucDone["1:1"], 1);
  const before = s.char(2).inv.stack.m_lingcao ?? 0;
  await s.call(2, "home");
  assert.equal((s.char(2).inv.stack.m_lingcao ?? 0) - before, 5, "买家拿到货");
  assert.equal(s.char(2).escrow["1:1"], undefined);
  // 领完之后名额全空：能再上 5 件，第 6 件才拒
  s.setChar(1, (c) => { c.inv.stack.m_lingcao = 50; });
  for (let i = 0; i < 5; i++) { r = await s.call(1, "auction.create", { item: { id: "m_lingcao", n: 1 }, min: 10 }); assert.equal(r.ok, true, r.msg); }
  r = await s.call(1, "auction.create", { item: { id: "m_lingcao", n: 1 }, min: 10 });
  assert.equal(r.ok, false);
  assert.match(r.msg, /最多同时/);
  // 桶里的记录到期由 bot 请出去
  s.advance(31 * DAY); await s.tick(); s.advance(10 * 60_000); await s.tick();
  assert.equal(auctionOf(s.shared, "1:1"), null, "过了留存期桶里也不留");
});

test("补偿礼包：转过世的账号哪怕这一世是新建的也算老玩家", async () => {
  const { GIFTS } = await import("../lib/game/gift.js");
  const g = GIFTS[0];
  const s = new Site();
  await s.call(5, "boot", {});
  await s.call(5, "create", { name: "再世人" });
  s.advance(g.before - s.now + 60_000);
  s.setChar(5, (c) => { c.created = g.before + 1; });
  let v = await s.call(5, "home");
  assert.equal(v.gift, undefined, "线后新建、没转过世：不发");
  s.kv.get(5).set("legacy", { ...(s.kv.get(5).get("legacy") ?? {}), lives: 1 });
  v = await s.call(5, "home");
  assert.ok(v.gift, "转过世的账号照领");
});

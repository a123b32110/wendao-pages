// v34：玩家反馈那一批。拍卖名额、坊市补货、能量供奉、补偿礼包、渡劫/突破的惩罚与透明度。
import test from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";

const HOUR = 3600_000;

test("坊市：种子管够（至少两格、总数上得去），并且能花灵石请商队补货", async () => {
  const { SHOP_REFRESH_DAILY } = await import("../lib/game/shop.js");
  const s = new Site();
  await s.call(1, "boot", {});
  await s.call(1, "create", { name: "田舍郎" });
  s.setChar(1, (c) => { c.ls = 200000; });
  let v = await s.call(1, "shop");
  const seeds = v.data.shop.filter((x) => x.fx && x.fx.seed);
  assert.ok(seeds.length >= 2, `每天至少两格种子，实际 ${seeds.length}`);
  assert.ok(seeds.reduce((t, x) => t + x.n, 0) >= 10, "种子总数要够灵田种一天");
  assert.ok(v.data.shopRe.left === SHOP_REFRESH_DAILY && v.data.shopRe.cost > 0);
  // 补货换一批货
  const before = v.data.shop.map((x) => x.id).join(",");
  const ls0 = s.char(1).ls;
  const r = await s.call(1, "shop.refresh");
  assert.equal(r.ok, true, r.msg);
  assert.ok(s.char(1).ls < ls0, "补货要花灵石");
  assert.notEqual(r.data.shop.map((x) => x.id).join(","), before, "货架真的换了");
  assert.equal(r.data.shopRe.left, SHOP_REFRESH_DAILY - 1);
  // 用完就拒
  for (let i = 1; i < SHOP_REFRESH_DAILY; i++) assert.equal((await s.call(1, "shop.refresh")).ok, true);
  const no = await s.call(1, "shop.refresh");
  assert.equal(no.ok, false);
  assert.match(no.msg, /已请商队补货/);
});

test("坊市：补货后是满的一批新货，上一批买光的东西不再显示「余 0」", async () => {
  const s = new Site();
  await s.call(2, "boot", {});
  await s.call(2, "create", { name: "囤货郎" });
  s.setChar(2, (c) => { c.ls = 500000; });
  let v = await s.call(2, "shop");
  const target = v.data.shop.find((x) => x.left > 0);
  for (let i = 0; i < target.n; i++) await s.call(2, "buy", { idx: target.idx });
  assert.equal((s.char(2).daily.shop ?? {})[target.id], target.n, "买光了");
  assert.equal((await s.call(2, "shop")).data.shop.find((x) => x.id === target.id).left, 0, "刷新前这一件确实卖光");
  await s.call(2, "shop.refresh");
  const shop2 = (await s.call(2, "shop")).data.shop;
  assert.ok(shop2.every((x) => x.left === x.n), "补货后的每一格都是满的（玩家原话：怎么能刷出剩 0 个的）");
  const first = shop2[0];
  const r = await s.call(2, "buy", { idx: first.idx });
  assert.equal(r.ok, true, r.msg);
  assert.equal((await s.call(2, "shop")).data.shop[0].left, first.n - 1, "新批次按批次单独记账");
});

test("能量供奉：用 points.spend 真扣能量，每日封顶，余额不够干净地拒", async () => {
  const { ENERGY_DAILY, lsPerEnergy } = await import("../lib/game/energy.js");
  const s = new Site();
  await s.call(3, "boot", {});
  await s.call(3, "create", { name: "供奉者" });
  s.points.set(3, 10);
  let v = await s.call(3, "energy");
  assert.equal(v.data.energy.balance, 10);
  assert.equal(v.data.energy.left, ENERGY_DAILY);
  assert.equal(v.data.energy.rate, lsPerEnergy(s.char(3).r));
  const ls0 = s.char(3).ls;
  const r = await s.call(3, "energy.offer", { n: 2 });
  assert.equal(r.ok, true, r.msg);
  assert.equal(s.char(3).ls - ls0, 2 * lsPerEnergy(s.char(3).r), "灵石按汇率入账");
  assert.equal(s.points.get(3), 8, "论坛能量真的被扣掉了");
  // 平台要的是 points.spend + label + 幂等 request_id，不是负数 award（实测负数会被整批拒）
  const sp = s.log.filter((x) => x.spend).at(-1);
  assert.ok(sp && sp.spend.type === "points.spend" && sp.spend.amount === 2, "用的是 points.spend 正数");
  assert.match(sp.spend.request_id, /^wd-3-\d+$/, "每笔一个幂等键");
  assert.ok(sp.spend.label.length >= 1 && sp.spend.label.length <= 100, "label 必须 1-100 字");
  // 每日封顶
  const over = await s.call(3, "energy.offer", { n: ENERGY_DAILY });
  assert.equal(over.ok, false);
  assert.match(over.msg, /今日最多还能供奉/);
  // 余额不足
  s.points.set(3, 0);
  const broke = await s.call(3, "energy.offer", { n: 1 });
  assert.equal(broke.ok, false);
  assert.match(broke.msg, /只有 0 点能量/);
  assert.equal(s.char(3).ls - ls0, 2 * lsPerEnergy(s.char(3).r), "被拒时灵石一分不动");
});

test("补偿礼包：老玩家领一次，新号不发，转世后也不重发", async () => {
  const { GIFTS } = await import("../lib/game/gift.js");
  const g = GIFTS[0];
  const s = new Site();
  await s.call(4, "boot", {});
  await s.call(4, "create", { name: "苦主" });
  // 礼包上线前的时间点什么都领不到（测试里的固定日期都在这之前）
  let v = await s.call(4, "home");
  assert.equal(v.gift, undefined, "礼包还没上线");
  s.advance(g.before - s.now + 60_000);
  // 新建的号（创建时间在补偿线之后）不发
  s.setChar(4, (c) => { c.created = g.before + 1; });
  v = await s.call(4, "home");
  assert.equal(v.gift, undefined, "补偿线之后新建的号不该收到赔罪礼包");
  // 把创建时间挪到出事那会儿 —— 这才是受影响的老玩家
  s.setChar(4, (c) => { c.created = g.before - 1; c.tox = 60; c.hpP = 0.2; c.ls = 0; });
  v = await s.call(4, "home");
  assert.ok(v.gift, "老玩家该收到礼包");
  assert.ok(v.gift.lines.length >= 5, "礼包内容要有分量");
  assert.ok(s.char(4).ls >= 50000, `灵石到账，实际 ${s.char(4).ls}`);
  assert.equal(s.char(4).tox, 0, "丹毒清空");
  assert.equal(s.char(4).hpP, 1, "气血回满");
  assert.ok(s.char(4).inv.stack.t_bilei >= 5 && s.char(4).inv.stack.p_dingxin >= 5, "渡劫消耗品到账");
  // 只发一次
  const ls1 = s.char(4).ls;
  v = await s.call(4, "home");
  assert.equal(v.gift, undefined, "第二次不再发");
  assert.equal(s.char(4).ls, ls1);
});

test("突破失败不再赔掉大半天：掉一成修为、四小时迟滞，并当场告诉你下次多少", async () => {
  const { xpNeed } = await import("../lib/game/char.js");
  const s = new Site();
  await s.call(5, "boot", {});
  await s.call(5, "create", { name: "非酋" });
  s.setChar(5, (c) => { c.tutDone = true; c.xp = xpNeed(c); c.btStreak = 0; c.hpP = 1; });
  // 成功率不是 100%，所以反复重置到同一个关口，直到碰上一次失败
  let r = null, need = 0;
  for (let i = 0; i < 60; i++) {
    s.setChar(5, (c) => { c.r = 0; c.s = 0; c.btStreak = 0; c.dbf = {}; c.hpP = 1; c.xp = xpNeed(c); });
    need = xpNeed(s.char(5));
    r = await s.call(5, "bt");
    if (r.success === false) break;
  }
  assert.equal(r.success, false, "总能碰到一次失败");
  const c = s.char(5);
  assert.ok(c.xp >= need * 0.85, `只该掉一成修为，实际剩 ${Math.round(c.xp)}/${Math.round(need)}`);
  assert.ok(c.dbf.qi - s.now <= 4 * HOUR + 1000, "走火入魔压到四小时");
  assert.match(r.msg, /下次成功率 \d+%/, "要把下次的成功率直接说出来");
});

test("渡劫：面板给出每种应对的预估伤害，失败不跌境且下次减伤", async () => {
  const { stageNeed } = await import("../lib/data/realms.js");
  const s = new Site();
  await s.call(6, "boot", {});
  await s.call(6, "create", { name: "渡劫者" });
  s.setChar(6, (c) => { c.r = 0; c.s = 8; c.xp = stageNeed(0, 8); c.hpP = 1; c.mpP = 1; });
  const v = await s.call(6, "trib.start");
  assert.equal(v.ok, true, v.msg);
  const f = v.data.home.trib.forecast;
  assert.ok(f && f.tank > 0, "硬抗要给出预估掉血百分比");
  assert.ok(f.parry > 0 && f.parry < f.tank, "招架该比硬抗少掉血");
  assert.ok(f.dodge > 0 && f.dodge <= 100, "御剑给的是闪避成功率");
  // 一路硬抗到倒下
  let r = null;
  for (let i = 0; i < 20; i++) {
    r = await s.call(6, "trib.step", { act: "tank" });
    if (r.data && !r.data.home.trib) break;
  }
  const c = s.char(6);
  if (r.success === false) {
    assert.equal(c.s, 8, "失败不该跌小境界");
    assert.ok((c.tribStreak ?? 0) >= 1, "失败要累计减伤");
    assert.match(r.msg, /下次雷劫伤害 -\d+%/);
  }
});

test("v37 宗门贡献折叠进 sx: 桶：散键清掉后贡献、库藏、周结算全都还认得", async () => {
  const { scOf } = await import("../lib/game/shared.js");
  const s = new Site();
  const ids = [40, 41, 42];
  for (const uid of ids) {
    await s.call(uid, "boot", {});
    await s.call(uid, "create", { name: "宗徒" + uid });
    s.setChar(uid, (c) => { c.r = 2; c.ls = 60000; });
  }
  let r = await s.call(40, "sect.create", { name: "折叠宗", desc: "测试" });
  assert.equal(r.ok, true, r.msg);
  const sid = s.char(40).sect;
  for (const uid of [41, 42]) assert.equal((await s.call(uid, "sect.join", { sid })).ok, true);
  for (const uid of ids) assert.equal((await s.call(uid, "sect.donate", { amt: 1000 })).ok, true);
  const fundsBefore = ids.reduce((t, u) => t + (scOf(s.shared, u)?.pts ?? 0), 0);
  assert.ok(fundsBefore > 0, "捐献记下了贡献");
  // 折叠 + 冗余清扫（散键要过 1 小时才算冗余）
  s.advance(2 * HOUR);
  s.shared.set("world", { ...(s.shared.get("world") ?? {}), tickAt: s.now - 3 * HOUR });
  await s.tick();
  s.advance(600_000);
  s.shared.set("world", { ...(s.shared.get("world") ?? {}), tickAt: s.now - 3 * HOUR });
  await s.tick();
  for (const uid of ids) assert.equal(s.shared.has(`sc:${uid}`), false, `sc:${uid} 折叠后清掉`);
  for (const uid of ids) assert.ok(scOf(s.shared, uid)?.pts > 0, `uid ${uid} 的贡献还在桶里`);
  // 库藏与成员榜从桶里读得出来
  const v = await s.call(40, "sect");
  assert.equal(v.ok, true, v.msg);
  assert.ok(v.data.sect.treasury > 0, `库藏要认折叠值，实际 ${v.data.sect.treasury}`);
  // 再捐一次：以桶为底累加，旧贡献不丢
  const before = scOf(s.shared, 41).pts;
  assert.equal((await s.call(41, "sect.donate", { amt: 1000 })).ok, true);
  assert.ok(scOf(s.shared, 41).pts > before, "续捐从桶接种，旧贡献不丢");
});

test("v37 全站在拍闸门：顶到上限后礼貌拒绝，不让拍卖把共享区吃穿", async () => {
  const { AUC_GLOBAL_CAP } = await import("../lib/game/auction.js");
  const s = new Site();
  const day = 0;
  // 直接摆满在拍的坑位（模拟全站热闹）
  for (let i = 0; i < AUC_GLOBAL_CAP; i++) s.shared.set(`auction:900${i}:1`, { aid: `900${i}:1`, uid: 900 + i, n: "别人", item: { k: "mat", id: "m_lingcao", name: "灵草", n: 1, t: 0 }, min: 10, end: s.now + 3600_000, t: s.now });
  await s.call(50, "boot", {});
  await s.call(50, "create", { name: "晚来者" });
  s.setChar(50, (c) => { c.r = 2; c.ls = 50000; c.inv.stack.m_lingcao = 3; });
  const r = await s.call(50, "auction.create", { item: { id: "m_lingcao", n: 1 }, min: 100 });
  assert.equal(r.ok, false, "满了要拒绝");
  assert.match(r.msg, /坊市摊位已满/);
  assert.equal(s.char(50).inv.stack.m_lingcao, 3, "被拒时东西一件不少");
  // 落槌一件就腾出位子
  const k = `auction:9000:1`;
  s.shared.set(k, { ...s.shared.get(k), settled: { winner: null, price: 0 } });
  const ok = await s.call(50, "auction.create", { item: { id: "m_lingcao", n: 1 }, min: 100 });
  assert.equal(ok.ok, true, `腾出位子就该能上：${ok.msg}`);
});

test("v37 配额顶满时不许再新建桶键：整批被拒就永远腾不出地方（死锁）", async () => {
  const { JAN_KEY_CAP } = await import("../lib/game/janitor.js");
  const s = new Site();
  await s.call(60, "boot", {});
  await s.call(60, "create", { name: "堵门人" });
  const day = 0;
  // 把共享区塞到刚好满，且塞的全是「清扫删得掉」的旧棋局分
  let u = 5000;
  while (s.shared.size < JAN_KEY_CAP) s.shared.set(`wx:${day}:${u++}`, { uid: u, sc: 1 });
  assert.equal(s.shared.size, JAN_KEY_CAP);
  const newBuckets = () => [...s.shared.keys()].filter((k) => /^(px|ax|sx):/.test(k)).length;
  const before = newBuckets();
  s.shared.set("world", { ...(s.shared.get("world") ?? {}), tickAt: s.now - 3 * 3600_000 });
  const out = await s.tick();
  const fx = out.effects ?? [];
  const adds = fx.filter((e) => e.type === "kv.shared.set" && /^(px|ax|sx):/.test(e.key) && !s.shared.has(e.key));
  assert.equal(adds.length, 0, "满配额那一轮一个新桶键都不许建");
  assert.ok(fx.some((e) => e.type === "kv.shared.delete"), "但该删的照删，先把地方腾出来");
  assert.ok(s.shared.size < JAN_KEY_CAP, `腾出空位了：${s.shared.size}`);
  // 有了空位，下一轮才建桶
  s.shared.set("world", { ...(s.shared.get("world") ?? {}), tickAt: s.now - 3 * 3600_000 });
  await s.tick();
  assert.ok(newBuckets() >= before, "腾开之后折叠继续推进");
});

test("v39 配额顶满时折叠不能停：它是清扫的货源，停了键数就永远下不来", async () => {
  const { JAN_KEY_CAP } = await import("../lib/game/janitor.js");
  const s = new Site();
  // 一屋子「刚刚还在线」的档案散键：闲置清理动不了它们，只有「折进桶 → 当冗余删」这条路
  for (let i = 0; i < 30; i++) {
    const uid = 3000 + i * 8; // 全落 px:0
    s.shared.set(`p:${uid}`, { uid, n: "甲" + i, t: s.now, pw: 1 });
  }
  s.shared.set("px:0", { d: {} }); // 桶已存在（线上就是这样）：顶满时不许新建键，但已有的桶要继续更新
  let u = 9000;
  while (s.shared.size < JAN_KEY_CAP) s.shared.set(`sect:x${u++}`, { sid: "x", name: "占位", leader: u });
  assert.ok(s.shared.size >= JAN_KEY_CAP, "先把共享区顶满");
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  const out = await s.tick();
  const fx = out.effects ?? [];
  assert.ok(fx.some((e) => e.type === "kv.shared.set" && e.key === "px:0"), "已存在的桶还要继续折叠——它是清扫的货源");
  assert.ok(fx.filter((e) => e.type === "kv.shared.delete").length > 0, "清扫必须真的删到东西");
  assert.ok(s.shared.size < JAN_KEY_CAP, `键数要降下来：${s.shared.size}`);
  assert.ok(Object.keys(s.shared.get("px:0").d).length > 0, "被删的散键，人还在桶里");
});

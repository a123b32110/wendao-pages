// 宗门建设：库藏、四栋建筑、每日俸禄、每周宗务结算。
import { test } from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { DAY, weekKey } from "../lib/game/time.js";
import { SB_COST } from "../lib/game/sect.js";

async function create(site, uid, name) {
  await site.call(uid, "boot");
  const r = await site.call(uid, "create", { name });
  assert.equal(r.ok, true, r.msg);
  await site.call(uid, "home"); // 把入门奖励先结掉，后面数灵石才干净
}
async function makeSect(site, leader = 20, member = 21) {
  await create(site, leader, "掌门甲");
  await create(site, member, "弟子乙");
  site.setChar(leader, (c) => { c.r = 2; c.ls = 200000; });
  site.setChar(member, (c) => { c.r = 2; c.ls = 200000; });
  let v = await site.call(leader, "sect.create", { name: "青云剑宗", desc: "剑道" });
  assert.equal(v.ok, true, v.msg);
  v = await site.call(member, "sect.join", { sid: `s${leader}` });
  assert.equal(v.ok, true, v.msg);
  return `s${leader}`;
}
// 直接改共享区里的宗门记录（模拟已经建好的建筑），省掉攒贡献的过程
function setBld(site, sid, bld) {
  site.shared.set(`sect:${sid}`, { ...site.shared.get(`sect:${sid}`), bld });
}

test("sect: 捐献写进本周宗务，bot 汇总出库藏", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  let v = await site.call(21, "sect.donate", { amt: 3000 });
  assert.equal(v.ok, true, v.msg);
  const sc = site.shared.get("sc:21");
  assert.equal(sc.pts, 300);
  assert.equal(sc.wk.k, weekKey(site.now));
  assert.equal(sc.wk.don, 300, "本周捐献计入宗务");
  assert.equal(sc.wk.sb, 0);
  assert.equal(site.char(21).stats.dons, 1, "捐献次数入统计（悬赏读它）");
  // 库藏读时现算，不必等 bot
  v = await site.call(21, "sect");
  assert.equal(v.data.sect.treasury, 300);
  assert.equal(v.data.sect.spent, 0);
  assert.equal(v.data.sect.wk.cur.don, 300);
  assert.ok(v.data.sect.wk.daysLeft >= 1 && v.data.sect.wk.daysLeft <= 7);
  await site.tick();
  const agg = site.shared.get(`sectagg:${sid}`);
  assert.equal(agg.total, 300);
  assert.equal(agg.treasury, 300);
  assert.deepEqual(agg.bld, { cj: 0, df: 0, hs: 0, jl: 0 });
  assert.equal(agg.wk.don, 300);
});

test("sect: 只有掌门与长老能动库藏，升级扣库藏并立刻生效", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  await site.call(20, "sect.donate", { amt: 20000 }); // 2000 贡献
  // 弟子不行
  let v = await site.call(21, "sect.build", { b: "cj" });
  assert.equal(v.ok, false);
  assert.match(v.msg, /掌门与长老/);
  // 掌门可以
  const rate0 = (await site.call(20, "home")).me.stats.rate;
  v = await site.call(20, "sect.build", { b: "cj" });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.shared.get(`sect:${sid}`).bld.cj, 1);
  assert.equal(site.shared.get(`sect:${sid}`).spent, SB_COST[0]);
  assert.equal(v.data.sect.treasury, 2000 - SB_COST[0]);
  const rate1 = (await site.call(20, "home")).me.stats.rate;
  assert.ok(rate1 > rate0, `藏经阁提升修炼速度 ${rate0} -> ${rate1}`);
  assert.equal(site.char(21).sectB.cj, 0, "弟子还没上线，缓存还是旧的");
  await site.call(21, "home");
  assert.equal(site.char(21).sectB.cj, 1, "上线即刷新，全宗共享");
  // 长老可以
  v = await site.call(20, "sect.manage", { action: "appoint", uid: 21 });
  assert.equal(v.ok, true, v.msg);
  v = await site.call(21, "sect.build", { b: "jl" });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.shared.get(`sect:${sid}`).bld.jl, 1);
  assert.equal(site.shared.get(`sect:${sid}`).spent, SB_COST[0] * 2);
  // 库藏不够就免谈
  setBld(site, sid, { cj: 1, df: 0, hs: 0, jl: 1 });
  site.shared.set(`sect:${sid}`, { ...site.shared.get(`sect:${sid}`), spent: 1999 });
  v = await site.call(20, "sect.build", { b: "hs" });
  assert.equal(v.ok, false);
  assert.match(v.msg, /库藏不足/);
});

test("sect: 聚灵池俸禄一日一次", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  let v = await site.call(21, "sect.wage");
  assert.equal(v.ok, false, "没有聚灵池就没有俸禄");
  setBld(site, sid, { cj: 0, df: 0, hs: 0, jl: 2 });
  const view = (await site.call(21, "sect")).data.sect;
  assert.equal(view.wage.lv, 2);
  assert.equal(view.wage.amount, 100);
  assert.equal(view.wage.taken, false);
  const ls0 = site.char(21).ls;
  v = await site.call(21, "sect.wage");
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.char(21).ls, ls0 + 100);
  assert.equal(v.data.sect.wage.taken, true);
  v = await site.call(21, "sect.wage");
  assert.equal(v.ok, false, "一天只有一次");
  assert.equal(site.char(21).ls, ls0 + 100);
  site.advance(DAY);
  await site.call(21, "home"); // 新一天的入定灵石先结掉
  const ls1 = site.char(21).ls;
  v = await site.call(21, "sect.wage");
  assert.equal(v.ok, true, "第二天又能领");
  assert.equal(site.char(21).ls, ls1 + 100);
});

test("sect: 丹房把炼制成功率抬 2%/级", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  const p0 = (await site.call(21, "recipes")).data.recipes.pills.find((r) => r.id === "r_zhuji").p;
  setBld(site, sid, { cj: 0, df: 5, hs: 0, jl: 0 });
  const p1 = (await site.call(21, "recipes")).data.recipes.pills.find((r) => r.id === "r_zhuji").p;
  assert.ok(Math.abs(p1 - p0 - 0.1) < 1e-9, `丹房五级 +10%：${p0} -> ${p1}`);
});

test("sect: 护山大阵加宗门试炼伤害，也写进本周宗务", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  site.setChar(20, (c) => { c.r = 8; }); // 低境界打宗门 BOSS 的威能会被四舍五入抹成 0，这里只考倍率
  await site.call(20, "home");
  const wk = weekKey(site.now);
  const snapshot = structuredClone(site.char(20));
  let v = await site.call(20, "sect.boss");
  assert.equal(v.ok, true, v.msg);
  const d0 = site.shared.get(`sbd:${sid}:${wk}:20`).d;
  assert.ok(d0 > 0);
  assert.equal(site.shared.get("sc:20").wk.sb, 1, "试炼出手次数计入本周宗务");
  // 同一颗种子重来一次，只是这次宗门有了五级护山大阵
  site.kv.get(20).set("c", snapshot);
  site.shared.delete(`sbd:${sid}:${wk}:20`);
  setBld(site, sid, { cj: 0, df: 0, hs: 5, jl: 0 });
  v = await site.call(20, "sect.boss");
  assert.equal(v.ok, true, v.msg);
  const d1 = site.shared.get(`sbd:${sid}:${wk}:20`).d;
  assert.ok(d1 > d0 * 1.24 && d1 < d0 * 1.26, `+25% 伤害：${d0} -> ${d1}`);
});

test("sect: 周宗务只冻结一次，参与者得赏且不重复", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  // 两人的宗门，目标 don = 400；甲一个人捐够
  let v = await site.call(20, "sect.donate", { amt: 5000 });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.shared.get("sc:20").wk.don, 500);
  await site.tick();
  // 进入下一周：bot 把上周冻起来
  site.advance(7 * DAY);
  await site.tick();
  const agg = site.shared.get(`sectagg:${sid}`);
  assert.equal(agg.last.k, weekKey(site.now) - 1);
  assert.equal(agg.last.done, 1, "三条里达成一条");
  assert.deepEqual(agg.last.goals, { don: 400, sb: 16, aw: 10 }); // sb 记出手次数，不是威能
  const frozen = JSON.stringify(agg.last);
  // 参与者领赏
  // v37 起 sc: 散键会被折进 sx: 桶再当冗余删掉 —— 读贡献一律走 scOf（散键优先、桶兜底）
  const { scOf } = await import("../lib/game/shared.js");
  const ls0 = site.char(20).ls, pts0 = scOf(site.shared, 20).pts;
  v = await site.call(20, "home");
  const note = v.notes.find((n) => n.k === "sect" && /上周宗务/.test(n.v));
  assert.ok(note, "有结算提示");
  assert.match(note.v, /达成 1\/3/);
  assert.match(note.v, new RegExp(`${300 + 100 * 2} 灵石`)); // n×(300+100×境界)
  assert.ok(site.char(20).ls >= ls0 + 500, "灵石到账（同一次请求还带了当日入定的钱）");
  assert.equal(scOf(site.shared, 20).pts, pts0 + 30, "贡献 +30n");
  assert.equal(site.char(20).sectWeek, weekKey(site.now) - 1);
  // 不重复
  const ls1 = site.char(20).ls;
  v = await site.call(20, "home");
  assert.equal(site.char(20).ls, ls1);
  assert.equal(v.notes.some((n) => n.k === "sect" && /上周宗务/.test(n.v)), false);
  // 上周没出力的人没有（他这一趟拿到的只有当日入定与「入宗」成就的钱）
  v = await site.call(21, "home");
  assert.equal(v.notes.some((n) => n.k === "sect" && /上周宗务/.test(n.v)), false);
  assert.equal(site.char(21).sectWeek, weekKey(site.now) - 1, "照样打上游标，不会明天又来问一次");
  // 同一周再捐再 tick，冻结的那一周不许变
  site.advance(DAY);
  await site.call(20, "sect.donate", { amt: 9000 });
  await site.tick();
  assert.equal(JSON.stringify(site.shared.get(`sectagg:${sid}`).last), frozen, "已冻结的一周不再重算");
});

test("sect: 弟子退宗后库藏不会变成负数", async () => {
  const site = new Site();
  const sid = await makeSect(site);
  await site.call(21, "sect.donate", { amt: 10000 }); // 1000 贡献
  let v = await site.call(20, "sect.build", { b: "hs" });
  assert.equal(v.ok, true, v.msg);
  v = await site.call(21, "sect.leave");
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.shared.get("sc:21").pts, 0);
  assert.equal(site.char(21).sectB, null, "退宗后加成立刻清掉");
  v = await site.call(20, "sect");
  assert.equal(v.data.sect.treasury, 0, "花掉的比剩下的多，也只是零");
  assert.equal(v.data.sect.spent, SB_COST[0]);
  await site.tick();
  assert.equal(site.shared.get(`sectagg:${sid}`).treasury, 0);
});

test("sect: 论道胜场计入本周宗务，转世保留周结算游标", async () => {
  const site = new Site();
  await makeSect(site);
  // 21 打 20：拉开差距，胜负别靠运气
  site.setChar(21, (c) => { c.r = 6; });
  await site.call(20, "home"); await site.call(21, "home");
  let v = await site.call(21, "arena");
  const foe = v.data.arena.list.find((p) => String(p.uid) === "20");
  assert.ok(foe, "同宗也在候选里");
  const wins0 = site.char(21).stats.aw ?? 0;
  for (let i = 0; i < 5 && (site.char(21).stats.aw ?? 0) === wins0; i++) {
    await site.call(21, "arena.fight", { uid: 20 });
  }
  assert.ok((site.char(21).stats.aw ?? 0) > wins0, "至少赢了一场");
  const sc = site.shared.get("sc:21");
  assert.equal(sc.wk.aw ?? 0, site.char(21).stats.aw ?? 0, "胜场进本周宗务");
  // 转世：宗门周结算游标要带过去，免得重复领上周的赏
  site.setChar(21, (c) => { c.sectWeek = 99; c.r = 0; c.born = site.now - 400 * DAY; });
  await site.call(21, "home");
  v = await site.call(21, "rebirth", { name: "再来乙" });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.char(21).sectWeek, 99);
});

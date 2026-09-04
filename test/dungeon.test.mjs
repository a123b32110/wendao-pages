// 秘境探索: entry gates, seeded floors, loot escrow, banking, 机缘, weekly board.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { DAY } from "../lib/game/time.js";
import { DG_DIFFS } from "../lib/data/dungeon.js";
import { xpNeed } from "../lib/game/char.js";

async function create(site, uid, name) {
  await site.call(uid, "boot");
  const r = await site.call(uid, "create", { name });
  assert.equal(r.ok, true, r.msg);
}
// A cultivator strong enough that ordinary 秘境 monsters cannot win.
async function strong(site, uid, name, extra) {
  await create(site, uid, name);
  site.setChar(uid, (c) => { c.r = 8; c.s = 0; c.hpP = 1; c.mpP = 1; c.sk = "fixed"; c.inv.stack = {}; if (extra) extra(c); });
}
const run = (v) => v.data.dg.run;
const pickOf = (v, t) => run(v).opts.findIndex((o) => o.t === t);

test("秘境: daily entries are 2, 探险者 gets 3, and a run blocks a second entry", async () => {
  const site = new Site();
  await strong(site, 1, "秘境甲");
  let v = await site.call(1, "dg");
  assert.equal(v.data.dg.limit, 2);
  assert.equal(v.data.dg.left, 2);
  v = await site.call(1, "dg.enter", { diff: 0 });
  assert.equal(v.ok, true, v.msg);
  const again = await site.call(1, "dg.enter", { diff: 0 });
  assert.equal(again.ok, false);
  assert.match(again.msg, /已在秘境/);
  await site.call(1, "dg.leave");
  await site.call(1, "dg.enter", { diff: 0 });
  await site.call(1, "dg.leave");
  const third = await site.call(1, "dg.enter", { diff: 0 });
  assert.equal(third.ok, false);
  assert.match(third.msg, /次数已尽/);
  // 探险者 gets one more
  site.setChar(1, (c) => { c.sub = "tan"; });
  v = await site.call(1, "dg");
  assert.equal(v.data.dg.limit, 3);
  const fourth = await site.call(1, "dg.enter", { diff: 0 });
  assert.equal(fourth.ok, true, fourth.msg);
});

test("秘境: 气血不足五成 / 有未了事件 / 境界不足 都进不去", async () => {
  const site = new Site();
  await strong(site, 2, "秘境乙");
  site.setChar(2, (c) => { c.hpP = 0.3; });
  let r = await site.call(2, "dg.enter", { diff: 0 });
  assert.equal(r.ok, false);
  assert.match(r.msg, /气血/);
  site.setChar(2, (c) => { c.hpP = 1; c.ev = { id: "enc:w_yelang", region: "qingshan", seed: "x" }; });
  r = await site.call(2, "dg.enter", { diff: 0 });
  assert.equal(r.ok, false);
  assert.match(r.msg, /还没了结/);
  site.setChar(2, (c) => { c.ev = null; c.r = 0; c.s = 0; });
  r = await site.call(2, "dg.enter", { diff: 2 });
  assert.equal(r.ok, false);
  assert.match(r.msg, /境界不足/);
  assert.equal(site.char(2).daily.dg, undefined);
});

test("秘境: the floor's options are stable across reads and differ per secret key", async () => {
  const site = new Site();
  await strong(site, 3, "秘境丙");
  await site.call(3, "dg.enter", { diff: 1 });
  const a = await site.call(3, "dg");
  const b = await site.call(3, "dg");
  assert.deepEqual(run(a).opts, run(b).opts);
  assert.ok(run(a).opts.length >= 2 && run(a).opts.length <= 3);
  // a different seed gives a different dungeon
  const site2 = new Site();
  await strong(site2, 3, "秘境丙", (c) => { c.sk = "other"; });
  await site2.call(3, "dg.enter", { diff: 1 });
  const c2 = await site2.call(3, "dg");
  assert.notEqual(site.char(3).dg.sd, site2.char(3).dg.sd);
  assert.ok(JSON.stringify(run(a).opts) !== JSON.stringify(run(c2).opts) || run(a).f !== run(c2).f);
});

test("秘境: a won fight never heals, and its loot stays inside the run", async () => {
  const site = new Site();
  await strong(site, 4, "秘境丁");
  await site.call(4, "dg.enter", { diff: 0 });
  site.setChar(4, (c) => { c.dg.hp = 0.6; c.dg.sd = "fixed-mon"; });
  let v = await site.call(4, "dg");
  let i = pickOf(v, "mon");
  if (i < 0) { // force a monster floor when this seed did not roll one
    site.setChar(4, (c) => { c.dg.pend = null; });
    for (let k = 0; k < 40 && i < 0; k++) {
      site.setChar(4, (c) => { c.dg.sd = "mon-" + k; });
      v = await site.call(4, "dg");
      i = pickOf(v, "mon");
    }
  }
  assert.ok(i >= 0, "a monster option exists");
  const before = run(v).hp;
  const r = await site.call(4, "dg.pick", { i });
  assert.equal(r.ok, true, r.msg);
  assert.ok(r.data.battle, "battle replay returned");
  assert.equal(r.data.battle.win, true);
  assert.ok(r.data.dg.run.hp <= before + 0.1 + 1e-9, "at most the 10% post-victory breath inside 秘境 (no 20% explore heal)");
  assert.equal(Object.keys(site.char(4).inv.stack).length, 0, "loot is escrowed, not banked");
  assert.ok(r.data.dg.run.f === 2, "the floor advanced");
});

test("秘境: 收手 banks loot, xp is capped, hpP follows the run, dgBest is written", async () => {
  const site = new Site();
  await strong(site, 5, "秘境戊");
  await site.call(5, "dg.enter", { diff: 0 });
  site.setChar(5, (c) => {
    c.xp = xpNeed(c) * 1.4;
    c.dg.f = 4;
    c.dg.hp = 0.42;
    c.dg.loot.s.m_lingcao = 7;
    c.dg.loot.a.push({ id: "f_tiejian", q: 3, af: [] });
    c.dg.loot.b.push("g_qingfeng");
    c.dg.xp = xpNeed(c) * 5;
    c.dg.ls = 250;
    c.dg.t0 = site.now - 90 * 1000;
  });
  const ls0 = site.char(5).ls;
  const need = xpNeed(site.char(5));
  // an unresolved incident pins you in place
  site.setChar(5, (c) => { c.dg.pend = { t: "ev", e: 0 }; });
  const stuck = await site.call(5, "dg.leave");
  assert.equal(stuck.ok, false);
  assert.match(stuck.msg, /还没了结/);
  site.setChar(5, (c) => { c.dg.pend = null; });
  const r = await site.call(5, "dg.leave");
  assert.equal(r.ok, true, r.msg);
  const c = site.char(5);
  assert.equal(c.dg, null);
  assert.equal(c.inv.stack.m_lingcao, 7);
  assert.equal(c.inv.arts.length, 1);
  assert.equal(c.inv.stack.b_g_qingfeng, 1, "books come out as 秘籍 items on banking (v51)");
  assert.equal(c.ls, ls0 + 250);
  assert.ok(c.xp <= need * 1.5 + 0.001, "xp respects the realm cap");
  assert.equal(Math.round(c.hpP * 100), 42);
  assert.equal(c.dgBest.d, 3, "leaving on floor 4 means three cleared floors");
  assert.ok(c.dgBest.t >= 90 * 1000);
  assert.equal(c.stats.dg, 1);
  assert.equal(r.data.bank.depth, 3);
});

test("秘境: dying halves the loot and leaves you at two tenths of your blood", async () => {
  const site = new Site();
  await create(site, 6, "秘境己");
  site.setChar(6, (c) => { c.r = 0; c.s = 0; c.hpP = 1; c.sk = "weak"; c.inv.stack = {}; });
  await site.call(6, "dg.enter", { diff: 0 });
  site.setChar(6, (c) => {
    c.dg.hp = 0.02;
    c.dg.loot.s.m_lingcao = 7;
    c.dg.loot.a.push({ id: "f_tiejian", q: 3, af: [] }, { id: "f_bupao", q: 2, af: [] });
    c.dg.ls = 100;
    c.dg.sd = "die";
  });
  // walk floors until a fight kills the level-one cultivator
  let dead = false;
  for (let k = 0; k < 30 && !dead; k++) {
    const v = await site.call(6, "dg");
    if (!v.data.dg.run) break;
    let i = pickOf(v, "mon");
    if (i < 0) i = pickOf(v, "elite");
    if (i < 0) { site.setChar(6, (c) => { c.dg.sd = "die" + k; c.dg.pend = null; }); continue; }
    const r = await site.call(6, "dg.pick", { i });
    if (r.data.bank?.dead) dead = true;
  }
  assert.ok(dead, "the beginner died in there");
  const c = site.char(6);
  assert.equal(c.inv.stack.m_lingcao, 3, "stacks are halved, rounded down");
  assert.equal(c.inv.arts.length, 1, "half the artifacts survive");
  assert.equal(Math.round(c.hpP * 100), 20);
  assert.equal(c.dg, null);
});

test("秘境: 守护 saves you exactly once", async () => {
  const site = new Site();
  await create(site, 7, "秘境庚");
  site.setChar(7, (c) => { c.r = 0; c.s = 0; c.hpP = 1; c.sk = "guard"; });
  await site.call(7, "dg.enter", { diff: 0 });
  site.setChar(7, (c) => { c.dg.rel = ["shou"]; c.dg.hp = 0.05; c.dg.sd = "guard-run"; });
  let saved = false, died = false;
  for (let k = 0; k < 40 && !died; k++) {
    const v = await site.call(7, "dg");
    if (!v.data.dg.run) break;
    let i = pickOf(v, "mon");
    if (i < 0) i = pickOf(v, "elite");
    if (i < 0) { site.setChar(7, (c) => { c.dg.sd = "guard-" + k; c.dg.pend = null; }); continue; }
    const before = site.char(7).dg.sh;
    const r = await site.call(7, "dg.pick", { i });
    const after = site.char(7).dg?.sh;
    if (before === 0 && after === 1) { saved = true; assert.equal(Math.round(site.char(7).dg.hp * 100), 30); }
    if (r.data.bank?.dead) died = true;
    if (site.char(7).dg) site.setChar(7, (c) => { c.dg.hp = 0.01; });
  }
  assert.ok(saved, "守护 fired");
  assert.ok(died, "and only once — the next lethal hit ended the run");
});

test("秘境: 万钥 means no mimic and no empty chest over 50 seeds", async () => {
  const site = new Site();
  await strong(site, 8, "秘境辛");
  await site.call(8, "dg.enter", { diff: 0 });
  let chests = 0;
  for (let k = 0; k < 50; k++) {
    site.setChar(8, (c) => { c.dg.rel = ["yao"]; c.dg.f = 1; c.dg.pend = null; c.dg.sd = "chest-" + k; c.dg.loot = { s: {}, a: [], b: [] }; });
    const v = await site.call(8, "dg");
    const i = pickOf(v, "chest");
    if (i < 0) continue;
    chests++;
    const r = await site.call(8, "dg.pick", { i });
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.data.battle, null, "万钥 never meets a mimic");
    assert.ok(Object.keys(site.char(8).dg.loot.s).length >= 1, "and the chest is never empty");
  }
  assert.ok(chests >= 5, `enough chests sampled (${chests})`);
});

test("秘境: the boss floor pays a 晶核, a tier artifact, banks the run and writes the weekly board", async () => {
  const site = new Site();
  await strong(site, 9, "秘境壬");
  await site.call(9, "dg.enter", { diff: 0 });
  // a 秘境之主 is a real fight even at 渡劫: walk in with the machinery the run is meant to hand you
  site.setChar(9, (c) => { c.dg.f = c.dg.n; c.dg.pend = null; c.dg.rel = ["feng", "bi", "tu", "yan", "su", "xi"]; });
  let v = await site.call(9, "dg");
  assert.equal(run(v).opts.length, 1);
  assert.equal(run(v).opts[0].t, "boss");
  const arts0 = site.char(9).inv.arts.length;
  const r = await site.call(9, "dg.pick", { i: 0 });
  assert.equal(r.ok, true, r.msg);
  assert.equal(r.data.battle.win, true, "a 渡劫期 cultivator beats a 秘境之主");
  assert.ok(r.data.bank, "a cleared boss banks the run");
  assert.equal(r.data.bank.done, true);
  assert.equal(r.data.bank.depth, DG_DIFFS[0].n);
  assert.ok(r.data.bank.drops.some((d) => d.id === "m_jinghe"), "秘境晶核 dropped");
  assert.ok(site.char(9).inv.arts.length > arts0, "and a guaranteed artifact");
  assert.equal(site.char(9).dg, null);
  // the profile carries the weekly record and the board reads it back
  const prof = site.shared.get("p:9");
  assert.ok(Array.isArray(prof.dgw) && prof.dgw[1] === DG_DIFFS[0].n, "dgw written to the profile");
  const lb = await site.call(9, "lb", { type: "dg" });
  assert.equal(lb.data.lb.rows[0].uid, 9);
  assert.match(lb.data.lb.rows[0].v, /第 8 层/);
});

test("秘境: 服丹 is limited to two pills, once per floor, and the weekly board forgets last week", async () => {
  const site = new Site();
  await strong(site, 10, "秘境癸");
  site.setChar(10, (c) => { c.inv.stack.p_huixue = 3; c.inv.stack.p_juqi = 2; });
  await site.call(10, "dg.enter", { diff: 0 });
  site.setChar(10, (c) => { c.dg.hp = 0.2; });
  let r = await site.call(10, "dg.use", { id: "p_juqi" });
  assert.equal(r.ok, false);
  assert.match(r.msg, /回血丹与回灵丹/);
  r = await site.call(10, "dg.use", { id: "p_huixue" });
  assert.equal(r.ok, true, r.msg);
  assert.equal(Math.round(site.char(10).dg.hp * 100), 70);
  r = await site.call(10, "dg.use", { id: "p_huixue" });
  assert.equal(r.ok, false);
  assert.match(r.msg, /本层/);
  assert.equal(site.char(10).inv.stack.p_huixue, 2);
  await site.call(10, "dg.leave");
  // last week's record must not show on this week's board
  const lastWeek = { ...site.shared.get("p:10"), dgw: [0, 12, 1000] };
  site.shared.set("p:10", lastWeek);
  const lb = await site.call(10, "lb", { type: "dg" });
  assert.equal(lb.data.lb.rows.length, 0, "a stale week is filtered out");
  // and this week's, ordered by depth then by time
  site.shared.set("p:901", { uid: 901, n: "深", r: 2, s: 0, pw: 10, dgw: [site.char(10).dgBest.wk, 9, 5000] });
  site.shared.set("p:902", { uid: 902, n: "快", r: 2, s: 0, pw: 10, dgw: [site.char(10).dgBest.wk, 9, 1000] });
  site.shared.set("p:903", { uid: 903, n: "浅", r: 2, s: 0, pw: 10, dgw: [site.char(10).dgBest.wk, 2, 10] });
  const lb2 = await site.call(10, "lb", { type: "dg" });
  assert.deepEqual(lb2.data.lb.rows.map((x) => x.n).slice(0, 3), ["快", "深", "浅"], "deeper first, then faster");
});

test("秘境: dev.time shifts the run clock so a banked record keeps a sane duration", async () => {
  const site = new Site();
  process.env.WD_DEV_UID = "";
  await strong(site, 11, "秘境子");
  await site.call(11, "dg.enter", { diff: 0 });
  const t0 = site.char(11).dg.t0;
  site.advance(DAY);
  await site.call(11, "dg");
  assert.equal(site.char(11).dg.t0, t0, "the run clock is absolute, not reset by a settle");
  const r = await site.call(11, "dg.leave");
  assert.ok(r.data.bank.ms >= DAY, "the elapsed run time is measured from t0");
});

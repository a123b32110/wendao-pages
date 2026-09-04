// 灵田药圃: plots, deterministic growth events, harvest, and where seeds come from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { newCharacter } from "../lib/game/char.js";
import { HOUR } from "../lib/game/time.js";
import { itemOf } from "../lib/data/items.js";
import { shopView } from "../lib/game/shop.js";
import { fmEnsure, farmTick, farmView, farmPlant, farmTend, farmHarvest, farmClear, FM_SEED_BY_TIER, FM_EV_GRACE } from "../lib/game/farm.js";

const T0 = Date.UTC(2026, 8, 3, 8);
function mk(over = {}) {
  const c = newCharacter({ uid: 5, name: "药农", now: T0, seed: "farm", legacy: null });
  c.ls = 5000;
  Object.assign(c, over);
  return c;
}
function sow(c, i, seed, at) {
  fmEnsure(c);
  c.inv.stack[seed] = (c.inv.stack[seed] ?? 0) + 1;
  const r = farmPlant(c, i, seed, at);
  assert.equal(r.ok, true, r.msg);
  return c.farm.plots[i];
}

test("plot count follows realm and the nine-palace array", async () => {
  assert.equal(fmEnsure(mk()).plots.length, 2);
  assert.equal(fmEnsure(mk({ r: 1 })).plots.length, 3);
  assert.equal(fmEnsure(mk({ r: 2 })).plots.length, 4);
  assert.equal(fmEnsure(mk({ r: 2, array: 1 })).plots.length, 4, "the small array does not count");
  assert.equal(fmEnsure(mk({ r: 4, array: 2 })).plots.length, 5);
  // a plot that still holds a crop survives a re-count
  const c = mk({ r: 2 });
  sow(c, 3, "s_lingcao", T0);
  c.r = 0;
  assert.equal(fmEnsure(c).plots.length, 4, "the busy plot is not dropped");
  assert.ok(c.farm.plots[3]);
});

test("planting spends the seed, harvest yields 2-4 and empties the plot", async () => {
  const site = new Site();
  await site.call(6, "boot");
  await site.call(6, "create", { name: "种田客" });
  site.setChar(6, (c) => { c.inv.stack.s_lingcao = 2; c.sk = "farm-fixed-seed"; }); // 钉住种子：生长事件与收成都由 sk 派生，随机 sk 会偶发受损收 1 株
  const bad = await site.call(6, "farm.plant", { i: 0, seed: "m_lingcao" });
  assert.equal(bad.ok, false);
  const v = await site.call(6, "farm.plant", { i: 0, seed: "s_lingcao" });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.char(6).inv.stack.s_lingcao, 1);
  assert.equal(v.data.farm.plots[0].seed, "s_lingcao");
  assert.equal(v.data.farm.plots[0].ready, false);
  const busy = await site.call(6, "farm.plant", { i: 0, seed: "s_lingcao" });
  assert.equal(busy.ok, false);
  const early = await site.call(6, "farm.harvest", { i: 0 });
  assert.equal(early.ok, false);
  assert.match(early.msg, /还没到时候/);
  site.advance(2 * HOUR + 60000);
  const h = await site.call(6, "farm.harvest", { i: 0 });
  assert.equal(h.ok, true, h.msg);
  const n = site.char(6).inv.stack.m_lingcao - 3; // newCharacter starts with 3
  assert.ok(n >= 2 && n <= 4, "harvest of " + n);
  assert.equal(site.char(6).farm.plots[0], null, "the plot is empty again");
  assert.equal(site.char(6).stats.harvests, 1);
  assert.equal(h.data.drops[0].id, "m_lingcao");
  // a seed above your realm will not take
  site.setChar(6, (c) => { c.inv.stack.s_xianlu = 1; });
  const high = await site.call(6, "farm.plant", { i: 0, seed: "s_xianlu" });
  assert.equal(high.ok, false);
  assert.match(high.msg, /境界不足/);
});

test("growth events land on the same hours no matter how often you look", async () => {
  const a = mk({ r: 2 }), b = mk({ r: 2 });
  sow(a, 0, "s_leijing", T0);
  sow(b, 0, "s_leijing", T0);
  farmTick(a, T0 + 8 * HOUR, [], T0);
  for (let h = 1; h <= 8; h++) farmTick(b, T0 + h * HOUR, [], T0 + (h - 1) * HOUR);
  assert.deepEqual(a.farm.plots[0], b.farm.plots[0], "one long absence == eight hourly visits");
  // and a third rhythm, in irregular jumps
  const d = mk({ r: 2 });
  sow(d, 0, "s_leijing", T0);
  for (const h of [3, 5, 8]) farmTick(d, T0 + h * HOUR, [], T0);
  assert.deepEqual(a.farm.plots[0], d.farm.plots[0]);
  assert.ok(a.farm.plots[0].chk >= 7, "the cursor walked the whole growth");
});

test("an event left alone for two hours hurts the crop; twice withers it; tending clears it", async () => {
  const c = mk({ r: 2 });
  const p = sow(c, 0, "s_leijing", T0);
  p.ev = { k: "chong", at: T0 + HOUR, seen: 1 };
  p.chk = 1;
  farmTick(c, T0 + 2 * HOUR, [], T0);
  assert.ok(p.ev, "still inside the two-hour grace");
  assert.equal(p.hurt, 0);
  farmTick(c, T0 + 3 * HOUR, [], T0);
  assert.equal(p.ev, null, "expired");
  assert.equal(p.hurt, 1);
  p.ev = { k: "que", at: T0 + 4 * HOUR, seen: 1 };
  farmTick(c, T0 + 6 * HOUR, [], T0);
  assert.equal(p.hurt, 2);
  assert.equal(farmView(c, T0 + 6 * HOUR).plots[0].withered, true);
  assert.equal(farmHarvest(c, 0, T0 + 9 * HOUR, { int: () => 3, chance: () => false }).ok, false, "a withered crop cannot be harvested");
  assert.equal(farmClear(c, 0).ok, true);
  assert.equal(c.farm.plots[0], null);
  // tending inside the grace window removes the event for free (虫害)
  const p2 = sow(c, 1, "s_leijing", T0);
  p2.ev = { k: "chong", at: T0, seen: 1 };
  const t = farmTend(c, 1);
  assert.equal(t.ok, true, t.msg);
  assert.equal(p2.ev, null);
  assert.equal(farmTend(c, 1).ok, false, "nothing left to tend");
  assert.equal(FM_EV_GRACE, 2 * HOUR);
});

test("tending is refused when the fee is out of reach", async () => {
  const c = mk({ r: 2, ls: 0 });
  const p = sow(c, 0, "s_leijing", T0);
  p.ev = { k: "que", at: T0, seen: 1 }; // 灵雀偷食 costs 灵石 by tier
  const poor = farmTend(c, 0);
  assert.equal(poor.ok, false);
  assert.match(poor.msg, /灵石不足/);
  assert.ok(p.ev, "the event stays");
  c.ls = 500;
  assert.equal(farmTend(c, 0).ok, true);
  assert.equal(c.ls, 500 - 200, "tier 3 灵雀 costs 200");
  p.ev = { k: "luan", at: T0, seen: 1 }; // 灵气紊乱 costs 20% 灵力
  c.mpP = 0.05;
  const dry = farmTend(c, 0);
  assert.equal(dry.ok, false);
  assert.match(dry.msg, /灵力不足/);
  c.mpP = 1;
  assert.equal(farmTend(c, 0).ok, true);
  assert.ok(Math.abs(c.mpP - 0.8) < 1e-9);
});

test("丹修 harvests one extra, damage subtracts, and mutations show up", async () => {
  const flat = { int: () => 2, chance: () => false };
  const lucky = { int: () => 2, chance: () => true };
  const plain = mk({ r: 2 });
  sow(plain, 0, "s_longxue", T0);
  const r1 = farmHarvest(plain, 0, T0 + 99 * HOUR, flat);
  assert.equal(r1.ok, true, r1.msg);
  assert.equal(plain.inv.stack.m_longxue, 2);
  assert.equal(r1.drops.length, 1);

  const alch = mk({ r: 2, path: "dan" });
  sow(alch, 0, "s_longxue", T0);
  assert.equal(farmView(alch, T0).alch, true);
  const r2 = farmHarvest(alch, 0, T0 + 99 * HOUR, flat);
  assert.equal(alch.inv.stack.m_longxue, 3, "丹修 +1");
  assert.equal(r2.drops.length, 1);

  const hurt = mk({ r: 2 });
  const p = sow(hurt, 0, "s_longxue", T0);
  p.hurt = 1;
  farmHarvest(hurt, 0, T0 + 99 * HOUR, flat);
  assert.equal(hurt.inv.stack.m_longxue, 1, "damage costs one");

  const mut = mk({ r: 2 });
  sow(mut, 0, "s_longxue", T0);
  const r3 = farmHarvest(mut, 0, T0 + 99 * HOUR, lucky);
  assert.equal(r3.drops.length, 2);
  assert.equal(r3.drops[1].id, "m_leijing", "the mutation is one tier up");
  assert.equal(mut.inv.stack.m_leijing, 1);
});

test("a crop that ripened or fell ill while you were away shows up in 近况", async () => {
  const site = new Site();
  await site.call(7, "boot");
  await site.call(7, "create", { name: "候田人" });
  site.setChar(7, (c) => { c.inv.stack.s_lingcao = 1; });
  await site.call(7, "farm.plant", { i: 0, seed: "s_lingcao" });
  site.setChar(7, (c) => {
    const p = c.farm.plots[0];
    p.at = site.now - 4 * HOUR; p.ready = site.now - 2 * HOUR;
    c.last = site.now - 4 * HOUR;
  });
  const v = await site.call(7, "home");
  assert.equal(v.ok, true, v.msg);
  const note = v.notes.find((n) => n.k === "farm");
  assert.ok(note, "a farm note was pushed: " + JSON.stringify(v.notes));
  assert.match(note.v, /熟了|遭了/);
  assert.equal(v.me.farm.n, 2, "summary carries the badge");
  assert.equal(v.me.farm.ready + v.me.farm.alert, 1);
  const again = await site.call(7, "home");
  assert.equal(again.notes.filter((n) => n.k === "farm" && /熟了/.test(n.v)).length, 0, "the ripe note fires once");
  assert.ok(v.data.home.farm, "the home view carries the full 灵田 panel");
});

test("seeds reach players from the 坊市 pool and from won fights", async () => {
  const c = newCharacter({ uid: 8, name: "买种人", now: T0, seed: "shop", legacy: null });
  c.r = 3;
  let found = 0;
  for (let day = 0; day < 80; day++) {
    for (const s of shopView(c, day)) {
      if (!itemOf(s.id)?.fx?.seed) continue;
      found++;
      assert.ok(s.n >= 5 && s.n <= 10, `seed stock ${s.n}`); // v34 起一格 5-10 颗（旧的 2-5 颗玩家反馈「没天都不够种」）
    }
  }
  assert.ok(found > 0, "the shop stocks seeds");
  // a beaten monster leaves the seed of its own tier often enough to notice
  const site = new Site();
  await site.call(9, "boot");
  await site.call(9, "create", { name: "拾种客" });
  site.setChar(9, (c2) => { c2.r = 1; c2.s = 5; });
  let got = false;
  for (let i = 0; i < 80 && !got; i++) {
    site.setChar(9, (c2) => { c2.hpP = 1; c2.mpP = 1; c2.ev = { id: "enc:w_yelang", region: "qingshan", seed: "s" + i }; });
    await site.call(9, "choose", { opt: "fight" });
    got = Object.keys(site.char(9).inv.stack).some((id) => id === FM_SEED_BY_TIER[0]);
  }
  assert.equal(got, true, "a 15% seed drop landed within 80 fights");
});

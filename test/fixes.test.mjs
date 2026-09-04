// Regression tests for the audit findings (ascension crash, energy mint, auction minting/loss,
// listPublic failure, rebirth ledgers, 定心丹 sink) and for the second pass (pill xp cap,
// arena defence retention, shop counters, stable arena opponents, event gates, key table,
// dead daily rollover, sect boss guard).
import { test } from "node:test";
import { auctionOf } from "../lib/game/shared.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Site } from "./harness.mjs";
import * as app from "../lib/main.js";
import { HOUR, DAY } from "../lib/game/time.js";
import { xpNeed } from "../lib/game/char.js";
import { EVENTS } from "../lib/data/events.js";

async function create(site, uid, name) {
  await site.call(uid, "boot");
  const r = await site.call(uid, "create", { name });
  assert.equal(r.ok, true, r.msg);
}

test("ascended character can still open the home screen and rebirth", async () => {
  const site = new Site();
  await create(site, 1, "云中客");
  site.setChar(1, (c) => { c.r = 9; c.s = 0; c.ascended = true; });
  const v = await site.call(1, "home");
  assert.equal(v.ok, true, v.msg);
  assert.equal(v.err, undefined);
  assert.equal(v.data.end, true);
  const r = await site.call(1, "rebirth", { name: "转世客" });
  assert.equal(r.ok, true, r.msg);
  assert.equal(site.char(1).r, 0);
});

test("dead character does not re-award pending energy on every call", async () => {
  const site = new Site();
  await create(site, 1, "甲子");
  site.setChar(1, (c) => { c.dead = { cause: "寿尽", age: 100 }; });
  site.kv.get(1).set("legacy", { pts: 0, lives: 0, awards: { pending: ["feisheng"], lastDay: "2000-01-01" }, keep: {}, best: { r: 0, s: 0 }, history: [] });
  for (let i = 0; i < 4; i++) await site.call(1, "explore", { region: "qingshan" });
  assert.equal(site.points.get(1), 10, "feisheng awarded exactly once");
  const legacy = site.kv.get(1).get("legacy");
  assert.ok(legacy.awards.feisheng, "award persisted");
  assert.equal(legacy.awards.pending.length, 0);
});

test("auction: seller never deletes the key; full-bag winner keeps escrow until delivered; stale escrow forfeits", async () => {
  const site = new Site();
  await create(site, 1, "卖家");
  await create(site, 2, "买家");
  site.setChar(1, (c) => { c.r = 1; c.ic = 1; c.inv.arts.push({ iid: 1, id: "f_tiejian", q: 1, af: [] }); });
  site.setChar(2, (c) => { c.r = 1; c.ls = 10000; c.ic = 30; for (let i = 1; i <= 30; i++) c.inv.arts.push({ iid: i, id: "f_tiejian", q: 1, af: [] }); });
  await site.call(2, "home"); // flush login bonus so balances below are exact
  const ls0 = site.char(2).ls;
  let r = await site.call(1, "auction.create", { item: { iid: 1 }, min: 100 });
  assert.equal(r.ok, true, r.msg);
  r = await site.call(2, "auction.bid", { aid: "1:1", amt: 500 });
  assert.equal(r.ok, true, r.msg);
  assert.equal(site.char(2).ls, ls0 - 500);
  site.advance(25 * HOUR); await site.tick();
  assert.ok(site.shared.get("auction:1:1").settled, "bot settled");
  // seller claims, comes back 4 days later: key must still exist (only the bot prunes)
  await site.call(1, "home");
  assert.equal(site.char(1).ls >= 500, true);
  site.advance(4 * DAY); await site.call(1, "home");
  assert.ok(auctionOf(site.shared, "1:1"), "seller did not delete the auction record (the bot may have folded it into aux:)");
  // winner with a full 法宝匣: not marked done, escrow intact, no item yet
  await site.call(2, "home");
  let b = site.char(2);
  assert.equal(b.inv.arts.length, 30);
  assert.equal(b.aucDone["1:1"], undefined);
  assert.equal(b.escrow["1:1"], 500);
  // free a slot -> delivered and closed
  site.setChar(2, (c) => { c.inv.arts.pop(); });
  const lsBefore = site.char(2).ls;
  await site.call(2, "home");
  b = site.char(2);
  assert.equal(b.inv.arts.length, 30, "artifact delivered");
  assert.equal(b.aucDone["1:1"], 1);
  assert.equal(b.escrow["1:1"], undefined);
  assert.ok(b.ls - lsBefore < 500, "no refund beyond the price");
  // an escrow whose key vanished is never refunded; after the prune window it is forfeited
  site.setChar(2, (c) => { c.escrow["9:9"] = 300; c.escrowEnd = { "9:9": site.now }; });
  const before = site.char(2).ls;
  await site.call(2, "home");
  assert.equal(site.char(2).ls, before, "missing key must not refund");
  assert.equal(site.char(2).escrow["9:9"], 300);
  site.advance(31 * DAY); await site.call(2, "home");
  assert.equal(site.char(2).escrow["9:9"], undefined, "forfeited after the prune window");
  assert.ok(site.char(2).ls - before < 300, "forfeited escrow is not refunded");
});

test("rebirth carries claim ledgers, escrow, auction counter and season number", async () => {
  const site = new Site();
  await create(site, 1, "甲子");
  site.advance(31 * DAY); await site.call(1, "home"); // now in season 1
  assert.equal(site.char(1).season.n, 1);
  site.setChar(1, (c) => { c.dead = { cause: "寿尽", age: 100 }; c.bossClaim = 30000; c.aucN = 3; c.aucDone = { "1:2": 1 }; c.escrow = { "5:1": 40 }; c.escrowEnd = { "5:1": site.now }; });
  site.shared.set("auction:1:2", { aid: "1:2", uid: 1, end: site.now - 1, min: 1, item: { id: "m_lingcao", n: 1, name: "灵草", k: "mat" }, settled: { winner: null, price: 0 } });
  const r = await site.call(1, "rebirth", { name: "乙丑" });
  assert.equal(r.ok, true, r.msg);
  const c = site.char(1);
  assert.equal(c.bossClaim, 30000); assert.equal(c.season.n, 1); assert.equal(c.aucN, 3);
  assert.deepEqual(c.aucDone, { "1:2": 1 }); assert.deepEqual(c.escrow, { "5:1": 40 });
  assert.ok(c.sk, "secret key kept");
});

test("a failing listPublic fails the turn without effects", async () => {
  const site = new Site();
  await create(site, 1, "甲子");
  const api = site.api(1);
  api.kv.listPublic = async () => { throw new Error("boom"); };
  const out = await app.onMessage({ user: site.user(1), state: {}, method: "home", params: {}, now: site.now }, api);
  assert.equal(out.result.ok, false);
  assert.deepEqual(out.effects ?? [], []);
});

test("定心丹 outside a tribulation is refused, not consumed", async () => {
  const site = new Site();
  await create(site, 1, "甲子");
  site.setChar(1, (c) => { c.inv.stack.p_dingxin = 2; });
  const r = await site.call(1, "use", { id: "p_dingxin" });
  assert.equal(r.ok, false);
  assert.equal(site.char(1).inv.stack.p_dingxin, 2);
  assert.equal(site.char(1).tox, 0);
});

test("seeds include a per-character secret that the client never sees", async () => {
  const site = new Site();
  await create(site, 1, "甲子");
  const v = await site.call(1, "home");
  assert.ok(site.char(1).sk);
  assert.equal(JSON.stringify(v).includes(site.char(1).sk), false, "secret not echoed");
});


// ---------------------------------------------------------------- second audit pass

test("pill xp is clamped when the pill is used, not truncated later", async () => {
  const site = new Site();
  await create(site, 1, "丹童");
  const need = xpNeed(site.char(1));
  site.setChar(1, (c) => { c.xp = need * 1.5 - 10; c.inv.stack.p_juqi = 2; });
  let r = await site.call(1, "use", { id: "p_juqi" });
  assert.equal(r.ok, true, r.msg);
  assert.match(r.msg, /修为 \+10/, r.msg);
  assert.equal(site.char(1).xp, need * 1.5, "capped at need*1.5, no hidden overflow");
  r = await site.call(1, "use", { id: "p_juqi" });
  assert.equal(r.ok, false, "a pure xp pill at the cap is refused, not consumed");
  assert.match(r.msg, /修为已至此境上限/, r.msg);
  assert.equal(site.char(1).xp, need * 1.5);
  assert.equal(site.char(1).inv.stack.p_juqi, 1, "pill kept");
});

test("arena defence records survive a defender absent longer than three days", async () => {
  const site = new Site();
  await create(site, 1, "攻方");
  await create(site, 2, "守方");
  await site.call(1, "home");
  await site.call(2, "home"); // defender syncs, then stays away
  site.advance(HOUR);
  const r = await site.call(1, "arena.fight", { uid: 2 });
  assert.equal(r.ok, true, r.msg);
  const ar0 = site.char(2).season.ar;
  site.advance(10 * DAY);
  await site.tick(); // the bot used to drop the whole key after three days
  // v33 起散键会被折进 ax: 桶再当冗余删掉 —— 不变式是「账还找得到」，不是「散键还在」
  const reachable = site.shared.has("atk:1") || !!site.shared.get("ax:1")?.d?.["1"];
  assert.ok(reachable, "record kept inside the 14-day window (single or ax: fold)");
  await site.call(2, "home");
  const paid = site.char(2).season.ar;
  assert.notEqual(paid, ar0, "the absent defender still paid");
  assert.equal(paid < ar0, r.win, "the rating moved the way the fight went");
  site.advance(15 * DAY);
  await site.tick();
  assert.equal(site.shared.has("atk:1"), false, "dropped once nothing is younger than 14 days");
  assert.equal(site.shared.get("ax:1")?.d?.["1"], undefined, "the fold copy expires on the same clock");
});

test("shop purchase counters follow the item id, not the slot", async () => {
  const site = new Site();
  await create(site, 1, "商客");
  site.setChar(1, (c) => { c.ls = 100000; c.daily.shop = { 0: 99 }; }); // stale slot-keyed counter
  let v = await site.call(1, "shop");
  const before = v.data.shop;
  const first = before[0];
  assert.equal(first.left, first.n, "an old numeric key never sells anything out");
  const r = await site.call(1, "buy", { idx: 0 });
  assert.equal(r.ok, true, r.msg);
  assert.equal(site.char(1).daily.shop[first.id], 1);
  site.setChar(1, (c) => { c.r = 1; }); // a breakthrough mid-day re-seeds the stock
  v = await site.call(1, "shop");
  assert.notDeepEqual(v.data.shop.map((s) => s.id), before.map((s) => s.id), "slots really did remap");
  for (const s of v.data.shop) assert.equal(s.left, s.n - (s.id === first.id ? 1 : 0), `slot ${s.idx} (${s.id})`);
});

test("arena opponents stay valid when the rating moves between render and click", async () => {
  const site = new Site();
  await create(site, 1, "论道客");
  for (let i = 2; i <= 9; i++) {
    await create(site, i, `道友${"一二三四五六七八"[i - 2]}`);
    site.setChar(i, (c) => { c.season.ar = 900 + i * 40; });
    await site.call(i, "home"); // publish the profile with that rating
  }
  const first = (await site.call(1, "arena")).data.arena.list.map((p) => p.uid);
  assert.equal(first.length, 5);
  site.setChar(1, (c) => { c.season.ar = 2000; }); // as syncDefense would, between render and click
  const again = (await site.call(1, "arena")).data.arena.list.map((p) => p.uid);
  assert.deepEqual(again, first, "the day's opponents do not re-sort under the player");
  const r = await site.call(1, "arena.fight", { uid: first[4] });
  assert.equal(r.ok, true, r.msg);
  const rr = await site.call(1, "arena.refresh");
  assert.equal(rr.ok, true, rr.msg);
  assert.equal(site.char(1).daily.arenaPool.length, 5, "换一批 rebuilds the stored pool");
  assert.deepEqual(rr.data.arena.list.map((p) => String(p.uid)), site.char(1).daily.arenaPool);
});

test("stat-gated event options are reachable at the observed spd ceiling", () => {
  const optOf = (eid, oid) => EVENTS.find((e) => e.id === eid).opts.find((o) => o.id === oid);
  assert.deepEqual(optOf("bm_bingfeng", "jump").req.stat, ["spd", 120]);
  assert.deepEqual(optOf("sj_qiao", "rush").req.stat, ["spd", 200]);
  for (const e of EVENTS) for (const o of e.opts ?? []) {
    if (o.req?.stat?.[0] === "spd") assert.ok(o.req.stat[1] <= 240, `${e.id}.${o.id} wants spd ${o.req.stat[1]}, above the ~240 ceiling`);
  }
});

test("the shared-key table names the sect writer and act:<uid>", () => {
  const src = readFileSync(new URL("../lib/game/shared.js", import.meta.url), "utf8");
  const header = src.slice(0, src.indexOf("export function"));
  assert.match(header, /sect:s<founderUid>/);
  assert.match(header, /传位/, "says the writer changes after 传位");
  assert.match(header, /act:<uid>\s+onTrigger/);
});

test("a dead character's daily counters still roll over", async () => {
  const site = new Site();
  await create(site, 1, "亡者");
  site.setChar(1, (c) => { c.daily.arena = 5; c.daily.boss = 3; c.daily.login = true; c.dead = { t: site.now, age: 100, cause: "寿元耗尽" }; });
  const d0 = site.char(1).daily.d;
  site.advance(2 * DAY);
  const v = await site.call(1, "home");
  assert.equal(v.ok, true, v.msg);
  const c = site.char(1);
  assert.notEqual(c.daily.d, d0, "day key advanced");
  assert.equal(c.daily.arena, 0);
  assert.equal(c.daily.boss, 0);
  assert.equal(c.daily.login, false);
  assert.ok(c.dead, "still dead");
});

test("宗门试炼 is refused while an event is still open", async () => {
  const site = new Site();
  await create(site, 1, "宗主");
  site.setChar(1, (c) => { c.r = 2; c.ls = 20000; });
  let r = await site.call(1, "sect.create", { name: "问道宗", desc: "" });
  assert.equal(r.ok, true, r.msg);
  site.setChar(1, (c) => { c.ev = { id: "test_ev", opts: [] }; });
  r = await site.call(1, "sect.boss");
  assert.equal(r.ok, false);
  assert.equal(r.msg, "眼前的事还没了结");
  assert.equal(site.char(1).daily.sboss ?? 0, 0, "no attempt consumed");
});

test("first-day guide pays each step once and a bonus on completion; reborn characters skip it", async () => {
  const site = new Site();
  await create(site, 1, "新人");
  let v = await site.call(1, "home");
  assert.equal(v.data.home.tut.length, 3);
  assert.equal(v.data.home.tut.filter((s) => s.done).length, 0);
  const ls0 = site.char(1).ls;
  await site.call(1, "breathe");
  v = await site.call(1, "home");
  const afterBreath = site.char(1).ls;
  assert.ok(afterBreath - ls0 >= 30, "breathe step paid");
  await site.call(1, "home");
  assert.equal(site.char(1).ls, afterBreath, "not paid twice");
  site.setChar(1, (c) => { c.stats.explores = 1; c.s = 1; });
  v = await site.call(1, "home");
  assert.equal(v.data.home.tut, null, "guide gone after completion");
  assert.equal(site.char(1).ls - afterBreath, 30 + 30 + 60);
  assert.ok(site.char(1).tutDone);
  // reborn: legacy.lives > 0 -> no guide
  const site2 = new Site();
  await create(site2, 2, "老人");
  site2.kv.get(2).set("legacy", { pts: 0, lives: 1, awards: { pending: [], lastDay: "" }, keep: {}, best: { r: 0, s: 0 }, history: [] });
  v = await site2.call(2, "home");
  assert.equal(v.data.home.tut, null);
});

test("breakthrough mercy: each consecutive failure adds +15% to the shown and rolled chance, reset on success", async () => {
  const site = new Site();
  await create(site, 1, "非酋");
  site.setChar(1, (c) => { c.tutDone = true; c.xp = xpNeed(c); c.btStreak = 3; });
  let v = await site.call(1, "home");
  assert.ok(Math.abs(v.data.home.btChance - 0.98) < 1e-9, "90% + 45% capped at 98%: " + v.data.home.btChance);
  site.setChar(1, (c) => { c.btStreak = 1; c.dbf.qi = site.now + 1000000; });
  v = await site.call(1, "home");
  assert.ok(Math.abs(v.data.home.btChance - 0.85) < 1e-9, "90% - 20% qi + 15% streak: " + v.data.home.btChance);
  site.setChar(1, (c) => { c.btStreak = 9; });
  const r = await site.call(1, "bt");
  assert.equal(r.success, true, "98% with streak 9 (seeded)");
  assert.equal(site.char(1).btStreak, 0, "reset on success");
});

test("arena fights start at full HP/MP for the attacker and never drain them", async () => {
  const site = new Site();
  await create(site, 1, "攻方");
  await create(site, 2, "守方");
  site.setChar(2, (c) => { c.r = 1; c.s = 2; });
  await site.call(2, "home");
  site.setChar(1, (c) => { c.hpP = 0.12; c.mpP = 0.1; c.tutDone = true; });
  const v = await site.call(1, "arena");
  const foe = v.data.arena.list[0];
  const r = await site.call(1, "arena.fight", { uid: foe.uid });
  assert.equal(r.ok, true, r.msg);
  const b = r.data.battle ?? r.battle ?? r.data?.result?.battle;
  assert.ok(b, "battle returned");
  assert.equal(site.char(1).hpP, 0.12, "hp untouched by sparring");
  assert.equal(site.char(1).mpP, 0.1, "mp untouched by sparring");
});

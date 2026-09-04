import { test } from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { HOUR, DAY } from "../lib/game/time.js";
import { stageNeed, REALMS } from "../lib/data/realms.js";

const H = HOUR, D = DAY;

async function createPlayer(site, uid, name) {
  const v = await site.call(uid, "boot");
  assert.equal(v.need, "create");
  const r = await site.call(uid, "create", { name });
  assert.equal(r.ok, true, r.msg);
  return r;
}

test("guest sees leaderboard only", async () => {
  const site = new Site();
  const v = await site.call(null, "boot");
  assert.equal(v.guest, true);
  assert.ok(v.data.rows);
});

test("create, cultivate offline with cap, breathe, minor breakthrough", async () => {
  const site = new Site();
  await createPlayer(site, 1, "青云子");
  let v = await site.call(1, "home");
  assert.equal(v.me.realm, "炼气一层");
  assert.equal(v.ok, true);
  // 13h offline -> 12h counted
  site.advance(13 * H);
  v = await site.call(1, "home");
  assert.ok(v.notes.some((n) => n.k === "xp"), "offline note");
  const note = v.notes.find((n) => n.k === "xp").v;
  assert.match(note, /12\.0 小时/);
  assert.ok(v.me.xp > 0);
  // breathe twice: cooldown blocks the second
  const b1 = await site.call(1, "breathe");
  assert.equal(b1.ok, true);
  const b2 = await site.call(1, "breathe");
  assert.equal(b2.ok, false);
  // fill xp and break through (炼气一层 -> 二层 is minor)
  site.setChar(1, (c) => { c.xp = stageNeed(0, 0); });
  v = await site.call(1, "bt");
  assert.equal(v.ok, true);
  if (v.success) assert.equal(v.me.realm, "炼气二层");
  else assert.ok(v.me.dbf.qi > 0, "failure applies 走火入魔");
});

test("tribulation is decided server-side and replays deterministically", async () => {
  const site = new Site();
  await createPlayer(site, 2, "雷修");
  site.setChar(2, (c) => { c.r = 0; c.s = 8; c.xp = stageNeed(0, 8); c.hpP = 1; c.mpP = 1; });
  let v = await site.call(2, "bt");
  assert.equal(v.ok, false);
  assert.match(v.msg, /渡劫/);
  v = await site.call(2, "trib.start");
  assert.equal(v.ok, true, v.msg);
  assert.ok(v.data.home.trib);
  let done = false, guard = 0;
  while (!done && guard++ < 20) {
    const r = await site.call(2, "trib.step", { act: "parry" });
    assert.equal(r.ok, true, r.msg);
    done = !r.data.home.trib;
    if (done) {
      const c = site.char(2);
      if (r.success) { assert.equal(c.r, 1); assert.equal(site.points.get(2), 2, "筑基 milestone energy"); }
      else { assert.ok(c.dbf.injury > site.now); }
    }
  }
  assert.ok(done);
  // bogus action rejected
  site.setChar(2, (c) => { c.r = 0; c.s = 8; c.xp = stageNeed(0, 8); c.dbf = {}; });
  await site.call(2, "trib.start");
  const bad = await site.call(2, "trib.step", { act: "win" });
  assert.equal(bad.ok, false);
});

test("explore: event options, encounters, battles and chained events", async () => {
  const site = new Site();
  await createPlayer(site, 3, "游子");
  let v = await site.call(3, "regions");
  assert.equal(v.data.regions[0].open, true);
  assert.equal(v.data.regions[1].open, false);
  let fights = 0, chains = 0;
  for (let i = 0; i < 10; i++) {
    v = await site.call(3, "explore", { region: "qingshan" });
    if (!v.ok) break;
    const ev = v.data.event;
    assert.ok(ev && ev.opts.length >= 2);
    const opt = ev.opts.find((o) => o.ok) ?? ev.opts[0];
    const r = await site.call(3, "choose", { opt: opt.id });
    assert.equal(r.ok, true, r.msg);
    if (r.data.result?.battle) { fights++; assert.ok(r.data.result.battle.log.length > 1); }
    if (r.data.event) { chains++; const r2 = await site.call(3, "choose", { opt: r.data.event.opts.find((o) => o.ok).id }); assert.equal(r2.ok, true); }
  }
  assert.ok(site.char(3).st < 10, "stamina spent");
  let blocked = await site.call(3, "explore", { region: "qingshan" });
  while (blocked.ok) { const ev = blocked.data.event; await site.call(3, "choose", { opt: (ev.opts.find((o) => o.ok) ?? ev.opts[0]).id }); blocked = await site.call(3, "explore", { region: "qingshan" }); }
  assert.match(blocked.msg, /体力|伤势/);
  site.setChar(3, (c) => { c.st = 0; c.stAt = site.now; });
  site.advance(3 * H);
  v = await site.call(3, "home");
  assert.equal(v.me.st, 6, "半小时回 1 点：三小时应当回 6");
  site.setChar(3, (c) => { c.st = 0; c.stAt = site.now; });
  site.advance(24 * H);
  v = await site.call(3, "home");
  assert.equal(v.me.st, v.me.stMax, "放一天必然攒满，但攒不过上限");
  // locked region
  const locked = await site.call(3, "explore", { region: "beiming" });
  assert.equal(locked.ok, false);
});

test("inventory: use pill, toxicity cap, craft, equip, sell, skills", async () => {
  const site = new Site();
  await createPlayer(site, 4, "丹修");
  site.setChar(4, (c) => { c.inv.stack.m_lingcao = 30; c.inv.stack.m_tiekuang = 10; c.ls = 1000; c.tox = 98; c.inv.stack.p_juqi = 3; });
  let v = await site.call(4, "use", { id: "p_juqi" });
  assert.equal(v.ok, false, "toxicity blocks");
  site.setChar(4, (c) => { c.tox = 0; });
  v = await site.call(4, "use", { id: "p_juqi" });
  assert.equal(v.ok, true);
  assert.equal(site.char(4).tox, 5);
  v = await site.call(4, "craft", { id: "f_r_tiejian" });
  assert.equal(v.ok, true);
  if (v.success) {
    const art = site.char(4).inv.arts[0];
    assert.ok(art);
    v = await site.call(4, "equip", { iid: art.iid });
    assert.equal(v.ok, true);
    assert.ok(v.me.stats.atk > 0);
    v = await site.call(4, "unequip", { slot: "w" });
    assert.equal(v.ok, true);
    v = await site.call(4, "sellArt", { iid: art.iid });
    assert.equal(v.ok, true);
  }
  v = await site.call(4, "sell", { id: "m_lingcao", n: 5 });
  assert.equal(v.ok, true);
  v = await site.call(4, "arts", { ids: ["a_slash", "a_fire", "a_fire", "a_wood"] });
  assert.equal(v.ok, false, "unknown art rejected");
  v = await site.call(4, "arts", { ids: ["a_fire"] });
  assert.equal(v.ok, true);
  v = await site.call(4, "gongfa", { id: "g_wanjian" });
  assert.equal(v.ok, false);
});

test("paths: choose at 筑基, sub at 金丹, path-locked arts", async () => {
  const site = new Site();
  await createPlayer(site, 5, "择道者");
  let v = await site.call(5, "path", { id: "jian" });
  assert.equal(v.ok, false);
  site.setChar(5, (c) => { c.r = 1; c.arts.push("a_jianqi"); });
  v = await site.call(5, "arts", { ids: ["a_jianqi"] });
  assert.equal(v.ok, false, "locked before choosing path");
  v = await site.call(5, "path", { id: "jian" });
  assert.equal(v.ok, true);
  v = await site.call(5, "arts", { ids: ["a_jianqi"] });
  assert.equal(v.ok, true);
  v = await site.call(5, "sub", { id: "shang" });
  assert.equal(v.ok, false);
  site.setChar(5, (c) => { c.r = 2; c.ls = 10000; });
  v = await site.call(5, "sub", { id: "shang" });
  assert.equal(v.ok, true);
  v = await site.call(5, "path", { id: "xie" });
  assert.equal(v.ok, true, "respec at 金丹 with cost");
  assert.equal(site.char(5).ls, 7000);
});

test("arena: fight decided by handler, defender syncs, daily limit", async () => {
  const site = new Site();
  await createPlayer(site, 10, "甲子");
  await createPlayer(site, 11, "乙丑");
  site.setChar(10, (c) => { c.r = 2; c.s = 1; });
  await site.call(10, "home"); // publishes snapshot
  await site.call(11, "home");
  let v = await site.call(10, "arena");
  assert.equal(v.data.arena.list.length, 1);
  const before = site.char(11).season.ar;
  for (let i = 0; i < 5; i++) { v = await site.call(10, "arena.fight", { uid: 11 }); assert.equal(v.ok, true, v.msg); assert.ok(v.data.battle.log.length); }
  v = await site.call(10, "arena.fight", { uid: 11 });
  assert.equal(v.ok, false);
  v = await site.call(10, "arena.fight", { uid: 999 });
  assert.equal(v.ok, false);
  site.advance(1000);
  v = await site.call(11, "home");
  assert.ok(v.notes.some((n) => n.k === "arena"), "defender notified");
  assert.notEqual(site.char(11).season.ar, before);
  assert.ok(site.char(10).season.ss > 0);
});

test("sect: create, join, donate, aggregate via bot, ban, disband", async () => {
  const site = new Site();
  await createPlayer(site, 20, "掌门");
  await createPlayer(site, 21, "弟子");
  site.setChar(20, (c) => { c.r = 2; c.ls = 20000; });
  let v = await site.call(20, "sect.create", { name: "青云剑宗", desc: "剑道" });
  assert.equal(v.ok, true, v.msg);
  v = await site.call(21, "sect.join", { sid: "s20" });
  assert.equal(v.ok, true, v.msg);
  site.setChar(21, (c) => { c.ls = 5000; });
  v = await site.call(21, "sect.donate", { amt: 3000 });
  assert.equal(v.ok, true);
  await site.tick();
  v = await site.call(21, "sect");
  assert.equal(v.data.sect.memberCount, 2);
  assert.equal(v.data.sect.total, 300);
  assert.equal(v.data.sect.myRole, "弟子");
  v = await site.call(21, "sect.manage", { action: "ban", uid: 20 });
  assert.equal(v.ok, false, "only leader");
  v = await site.call(20, "sect.manage", { action: "ban", uid: 21 });
  assert.equal(v.ok, true);
  v = await site.call(21, "home");
  assert.equal(site.char(21).sect, null);
  assert.ok(v.notes.some((n) => n.k === "sect"));
  v = await site.call(20, "sect.manage", { action: "disband" });
  assert.equal(v.ok, true);
  assert.equal(site.shared.has("sect:s20"), false);
});

test("auction: escrow, bot settlement, winner and loser claims, no double claim", async () => {
  const site = new Site();
  await createPlayer(site, 30, "卖家");
  await createPlayer(site, 31, "买家A");
  await createPlayer(site, 32, "买家B");
  await site.call(30, "home"); await site.call(31, "home"); await site.call(32, "home");
  site.setChar(30, (c) => { c.r = 1; c.inv.stack.m_jiaolin = 5; c.ls = 100; c.tutDone = true; });
  site.setChar(31, (c) => { c.ls = 1000; });
  site.setChar(32, (c) => { c.ls = 1000; });
  let v = await site.call(30, "auction.create", { item: { id: "m_jiaolin", n: 3 }, min: 100 });
  assert.equal(v.ok, true, v.msg);
  assert.equal(site.char(30).inv.stack.m_jiaolin, 2);
  assert.equal(site.char(30).ls, 95, "5% fee");
  v = await site.call(31, "auction.bid", { aid: "30:1", amt: 50 });
  assert.equal(v.ok, false);
  v = await site.call(31, "auction.bid", { aid: "30:1", amt: 100 });
  assert.equal(v.ok, true);
  assert.equal(site.char(31).ls, 900);
  v = await site.call(32, "auction.bid", { aid: "30:1", amt: 104 });
  assert.equal(v.ok, false, "must outbid by 5%");
  v = await site.call(32, "auction.bid", { aid: "30:1", amt: 200 });
  assert.equal(v.ok, true);
  v = await site.call(31, "auction.bid", { aid: "30:1", amt: 300 });
  assert.equal(v.ok, true);
  assert.equal(site.char(31).ls, 700, "escrow tops up the difference");
  site.advance(25 * H);
  // 拨到「有点旧但没到 miniTick 的自愈线」：这条测试要验的是正牌 bot 的结算路径
  site.shared.set("world", { tickAt: site.now - 360_000 });
  // new day: everyone collects the login bonus first, then we compare deltas
  await site.call(30, "home"); await site.call(31, "home"); await site.call(32, "home");
  const ls30 = site.char(30).ls, ls31 = site.char(31).ls, ls32 = site.char(32).ls;
  v = await site.call(31, "home");
  assert.equal(site.char(31).ls, ls31, "nothing claimable before bot settles");
  await site.tick();
  assert.ok(site.shared.get("auction:30:1").settled);
  assert.equal(site.shared.has("bid:30:1:31"), false, "bids pruned after settlement");
  await site.call(31, "home");
  assert.equal(site.char(31).inv.stack.m_jiaolin, 3, "winner gets item");
  assert.equal(site.char(31).ls, ls31);
  await site.call(32, "home");
  assert.equal(site.char(32).ls, ls32 + 200, "loser refunded");
  await site.call(30, "home");
  assert.equal(site.char(30).ls, ls30 + 300, "seller paid");
  await site.call(30, "home");
  assert.equal(site.char(30).ls, ls30 + 300, "no double pay");
  await site.call(31, "home");
  assert.equal(site.char(31).inv.stack.m_jiaolin, 3, "no double claim");
});

test("world boss: damage keys, ranking reward next day, pruning", async () => {
  const site = new Site(Date.UTC(2026, 8, 3, 8)); // 钉住日期：当天的 BOSS 决定境界折算后谁排第一
  await createPlayer(site, 40, "猎手");
  await createPlayer(site, 41, "猎手二");
  site.setChar(40, (c) => { c.r = 2; });
  let v;
  for (let i = 0; i < 3; i++) { v = await site.call(40, "boss.attack"); assert.equal(v.ok, true, v.msg); }
  v = await site.call(40, "boss.attack");
  assert.equal(v.ok, false);
  await site.call(41, "boss.attack");
  v = await site.call(40, "boss");
  assert.equal(v.data.boss.board.length, 2);
  const ls = site.char(40).ls;
  site.advance(D);
  v = await site.call(40, "home");
  assert.ok(v.notes.some((n) => n.k === "boss" && /第 1/.test(n.v)), JSON.stringify(v.notes));
  assert.ok(site.char(40).ls > ls);
  site.advance(3 * D);
  await site.tick();
  assert.equal([...site.shared.keys()].filter((k) => k.startsWith("bd:")).length, 0);
});

test("season rollover freezes standings and pays rewards/energy once", async () => {
  const site = new Site(Date.UTC(2026, 8, 29, 8)); // 2 days before season 1
  await createPlayer(site, 50, "魁首");
  await createPlayer(site, 51, "次席");
  await site.call(50, "home"); await site.call(51, "home");
  for (let i = 0; i < 3; i++) await site.call(50, "arena.fight", { uid: 51 });
  assert.ok(site.char(50).season.ss > 0);
  site.advance(3 * D);
  await site.tick();
  assert.ok(site.shared.has("season:0:result"));
  let v = await site.call(50, "home");
  assert.ok(v.notes.some((n) => n.k === "season"), JSON.stringify(v.notes));
  assert.equal(site.char(50).season.n, 1);
  assert.equal(site.char(50).season.ss, 0);
  assert.equal(site.points.get(50), 5, "rank 1 energy");
  await site.call(50, "home");
  assert.equal(site.points.get(50), 5, "not paid twice");
});

test("lifespan: death by age, rebirth keeps legacy, ascension", async () => {
  const site = new Site();
  await createPlayer(site, 60, "短命");
  site.setChar(60, (c) => { c.born = site.now - 40 * D; c.gfs.push("g_taiyi"); });
  let v = await site.call(60, "home");
  assert.ok(v.me.dead, "100 years at 3y/day after 28 days");
  v = await site.call(60, "breathe");
  assert.equal(v.ok, false);
  v = await site.call(60, "rebirth", { name: "长生" });
  assert.equal(v.ok, true, v.msg);
  const c = site.char(60);
  assert.equal(c.lives, 2);
  assert.equal(c.name, "长生");
  assert.ok(c.gfs.includes("g_taiyi"), "kept gongfa");
  assert.equal(site.kv.get(60).get("legacy").lives, 1);
  // ascension
  site.setChar(60, (c2) => { c2.r = 8; c2.s = 0; c2.xp = stageNeed(8, 0); c2.wu = 50; });
  v = await site.call(60, "trib.start");
  assert.equal(v.ok, true, v.msg);
  let guard = 0, done = false;
  while (!done && guard++ < 30) { const r = await site.call(60, "trib.step", { act: "tank" }); done = !r.data.home.trib; if (done && r.success) assert.equal(site.char(60).ascended, true); }
});

test("forum trigger grants a daily bonus once", async () => {
  const site = new Site();
  await createPlayer(site, 70, "水友");
  await site.trigger(70);
  let v = await site.call(70, "home");
  assert.ok(v.notes.some((n) => n.k === "forum"));
  const wu = site.char(70).wu;
  await site.trigger(70);
  v = await site.call(70, "home");
  assert.equal(site.char(70).wu, wu);
});

test("shop stock is daily and purchases are bounded", async () => {
  const site = new Site();
  await createPlayer(site, 80, "买家");
  site.setChar(80, (c) => { c.ls = 100000; });
  let v = await site.call(80, "shop");
  const s = v.data.shop[0];
  for (let i = 0; i < s.n; i++) { v = await site.call(80, "buy", { idx: 0 }); assert.equal(v.ok, true, v.msg); }
  v = await site.call(80, "buy", { idx: 0 });
  assert.equal(v.ok, false);
  v = await site.call(80, "buy", { idx: 99 });
  assert.equal(v.ok, false);
});

test("kv payloads stay small and snapshot is compact", async () => {
  const site = new Site();
  await createPlayer(site, 90, "胖子");
  // 真正的满配角色：三十件带符纹的五星法宝、塞满的行囊、一轮进行中的秘境、种满的灵田、灵兽。
  // 平台单键上限是 64 KB，这里守 24 KB 是给后续模块留的余量（旧断言 16 KB 是 v6 之前的量级）。
  site.setChar(90, (c) => {
    for (const id of ["m_lingcao", "m_tiekuang", "m_shuijing", "m_hanlian", "m_yaodan", "m_longxue", "m_bingpo", "m_leijing", "m_xuanyuan", "m_xingchen"]) c.inv.stack[id] = 999;
    c.inv.arts = Array.from({ length: 30 }, (_, i) => ({
      iid: i + 1, id: "f_xingjian", q: 5,
      af: [{ st: "atk", v: 100, n: "锋锐" }, { st: "hp", v: 100, n: "厚血" }, { st: "crit", v: 0.02, n: "锐意" }],
      rn: [{ st: "atk", v: 60, id: "r_feng" }, { st: "def", v: 60, id: "r_shi" }, { st: "spell", v: 0.04, id: "r_yun" }],
    }));
    c.r = 7; c.ls = 99999999;
    c.pet = { id: "e_qilin", name: "麒麟", elem: "火", atk: 1, hp: 1.2, lv: 20, xp: 0, ev: 2, hpP: 1, trip: null };
    c.farm = { n: 5, plots: Array.from({ length: 5 }, () => ({ seed: "s_xianlu", at: site.now, ready: site.now + 8 * 3600000, ev: { k: "chong", at: site.now, seen: 1 }, hurt: 1, chk: 1 })) };
  });
  await site.call(90, "dg.enter", { diff: 2 });
  await site.call(90, "home");
  const c = JSON.stringify(site.char(90));
  assert.ok(c.length < 24000, `c is ${c.length}`);
  const p = JSON.stringify(site.shared.get("p:90"));
  assert.ok(p.length < 600, `profile is ${p.length}`);
});

test("unknown method and malformed params never throw", async () => {
  const site = new Site();
  await createPlayer(site, 99, "测试");
  for (const [m, p] of [["nope", {}], ["choose", { opt: null }], ["equip", { iid: "x" }], ["sell", { id: 5, n: -3 }], ["auction.bid", { aid: {}, amt: "a" }], ["sect.manage", { action: 1 }], ["arena.fight", {}], ["trib.step", {}], ["buy", { idx: "1e9" }], ["craft", { id: [] }]]) {
    const v = await site.call(99, m, p);
    assert.ok(v && typeof v.ok === "boolean", `${m} returned ${JSON.stringify(v)}`);
    assert.ok(!v.err, `${m} threw: ${v.err}`);
  }
});

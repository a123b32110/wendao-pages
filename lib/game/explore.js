import { dayEvent } from "./events2.js";
import { EVENTS, eventOf } from "../data/events.js";
import { REGIONS, regionOf } from "../data/regions.js";
import { MONSTERS, monsterOf, TIER_REALM } from "../data/monsters.js";
import { artOf } from "../data/skills.js";
import { itemOf } from "../data/items.js";
import { makeRng } from "./rng.js";
import { deriveStats, buildUnit, basePower } from "./stats.js";
import { battle } from "./battle.js";
import { addStack, rollArtifact, removeItems, countOf, learnGongfa, learnArt } from "./inventory.js";
import { xpNeed } from "./char.js";
import { FM_SEED_BY_TIER } from "./farm.js";
import { HOUR } from "./time.js";
import { vipMod } from "./vipmod.js";

export const EXPLORE_DAILY = 20;
export const exploreDaily = (c) => vipMod(c).exp;
// 秘籍掉落：妖兽会什么神通，就可能掉什么秘籍（普通 6%、BOSS 12%）；已学的就是拿去卖的
export const BOOK_P = (m) => (m.boss ? 0.12 : 0.06);
export function giveBook(c, sid, into) { const b = itemOf("b_" + sid); if (!b) return false; into.push({ id: b.id, n: 1, name: b.name, lost: !addStack(c, b.id, 1) }); return true; }

export function monsterUnit(id, rng, tierOverride) {
  const m = monsterOf(id);
  if (!m) return null;
  const t = tierOverride ?? m.t;
  // regular monsters sit a little under a mid-stage cultivator of the tier's realm; bosses a little over
  const P = basePower(TIER_REALM[t], 1) * (m.boss ? 0.85 : t === 0 ? 0.6 : 0.7);
  const hp = Math.round(10 * P * m.m.hp), mp = Math.round(3 * P);
  return {
    name: m.name, icon: m.icon, id: m.id, hp, maxHp: hp, mp, maxMp: mp,
    atk: Math.round(P * m.m.atk), def: Math.round(0.5 * P * m.m.def), spd: Math.round((10 + 6 * TIER_REALM[t]) * m.m.spd),
    crit: 0.05, spell: 1, elem: m.elem, arts: m.arts.map(artOf), pet: null, path: null, interrupt: 0, array: 0, talis: 1, tals: [],
  };
}

export function rollDrops(c, m, rng, into) {
  const mult = dayEvent(c._now ?? 0).drop * vipMod(c).drop; // 妖潮 × 会员
  for (const [id, p, n] of m.drops ?? []) {
    if (!rng.chance(Math.min(1, p * mult))) continue;
    const def = itemOf(id);
    if (def) {
      if (def.k === "art") { const it = rollArtifact(c, id, rng); if (it) into.push({ id, n: 1, name: def.name, q: it.q }); else into.push({ id, n: 0, name: def.name, lost: true }); }
      else if (addStack(c, id, n)) into.push({ id, n, name: def.name });
      else into.push({ id, n, name: def.name, lost: true });
    } else if (id.startsWith("g_") || id.startsWith("a_")) giveBook(c, id, into);
  }
  for (const a of m.arts ?? []) if (a !== "a_slash" && rng.chance(Math.min(1, BOOK_P(m) * mult))) giveBook(c, a, into);
}

function eligible(c, e, region) {
  if (e.w <= 0) return false;
  if (e.region !== "any" && e.region !== region) return false;
  if (e.realmMin !== undefined && c.r < e.realmMin) return false;
  if (e.realmMax !== undefined && c.r > e.realmMax) return false;
  if (e.once && c.once[e.id]) return false;
  if (e.flag && !c.flags[e.flag]) return false;
  return true;
}

export function regionsView(c) {
  return REGIONS.map((r) => ({ ...r, open: c.r >= r.realm }));
}

function reqOk(c, st, req) {
  if (!req) return true;
  if (req.path && c.path !== req.path) return false;
  if (req.sub && c.sub !== req.sub) return false;
  if (req.elem && !c.root.e.includes(req.elem)) return false;
  if (req.realm !== undefined && c.r < req.realm) return false;
  if (req.ls !== undefined && c.ls < req.ls) return false;
  if (req.item && countOf(c, req.item[0]) < req.item[1]) return false;
  if (req.stat && (st[req.stat[0]] ?? 0) < req.stat[1]) return false;
  if (req.flag && !c.flags[req.flag]) return false;
  return true;
}
function reqLabel(req) {
  if (!req) return "";
  const parts = [];
  if (req.path) parts.push("道途");
  if (req.sub) parts.push("副业");
  if (req.elem) parts.push(`${req.elem}灵根`);
  if (req.realm !== undefined) parts.push("境界");
  if (req.ls !== undefined) parts.push(`${req.ls} 灵石`);
  if (req.item) parts.push(itemOf(req.item[0])?.name ?? "物品");
  if (req.stat) parts.push(`${{ spd: "速度", atk: "攻击", def: "防御", hp: "气血" }[req.stat[0]] ?? req.stat[0]} ≥ ${req.stat[1]}`);
  return parts.join("·");
}

export function eventView(c, st) {
  if (!c.ev) return null;
  const e = eventOf(c.ev.id);
  if (!e) { c.ev = null; return null; }
  return {
    id: e.id, region: c.ev.region, text: e.text,
    opts: e.opts.map((o) => ({ id: o.id, label: o.label, ok: reqOk(c, st, o.req), req: reqLabel(o.req), hidden: !!o.hidden })),
  };
}

// Start an exploration: pick an event for the region.
export function explore(c, regionId, now, seed) {
  const region = regionOf(regionId);
  if (!region) return { ok: false, msg: "无此地域" };
  if (c.r < region.realm) return { ok: false, msg: "境界不足，此地对你太危险" };
  if (c.ev) return { ok: false, msg: "眼前的事还没了结" };
  if (c.trib) return { ok: false, msg: "天劫当前" };
  if (c.st < 1) return { ok: false, msg: "体力不支，歇息片刻" };
  if (c.daily.exp >= exploreDaily(c)) return { ok: false, msg: "今日游历已够，明日再来" };
  const st = deriveStats(c);
  if (c.hpP < 0.15) return { ok: false, msg: "伤势太重，先疗伤（服回血丹，或歇息一小时）" };
  const rng = makeRng(`${seed}:${c.uid}:${c.ac}`);
  c.ac++;
  c.st--;
  if (c.st === 0 || c.stAt === undefined) c.stAt = c.stAt ?? now;
  c.daily.exp++;
  c.stats.explores++;
  // 商人副业：每日首次游历必遇一桩行商买卖（兑现「每日一次行商奇遇」）
  if (c.sub === "shang" && !c.daily.trade) {
    c.daily.trade = 1;
    const te = rng.pick(EVENTS.filter((x) => x.id.startsWith("sh_trade_")));
    if (te) { c.ev = { id: te.id, region: regionId, seed: `${seed}:${c.ac}` }; return { ok: true, event: eventView(c, st) }; }
  }
  const pool = EVENTS.filter((e) => eligible(c, e, regionId));
  // 30%: a plain encounter instead of a story event（妖潮时 50%）
  if (!pool.length || rng.chance(dayEvent(now).enc)) {
    const ms = MONSTERS.filter((m) => m.t === region.tier && !m.boss);
    const m = rng.pick(ms);
    c.ev = { id: `enc:${m.id}`, region: regionId, seed: `${seed}:${c.ac}` };
    return { ok: true, event: encounterView(c, m) };
  }
  const e = rng.weighted(pool.map((x) => [x, x.w]));
  if (e.once) c.once[e.id] = 1;
  c.ev = { id: e.id, region: regionId, seed: `${seed}:${c.ac}` };
  return { ok: true, event: eventView(c, st) };
}

function fleeChance(st) { return 0.6 + st.spd / (st.spd + 100) * 0.3; }
function encounterView(c, m) {
  const st = deriveStats(c);
  return {
    id: `enc:${m.id}`, region: c.ev.region, enc: { id: m.id, name: m.name, icon: m.icon, elem: m.elem, desc: m.desc },
    text: `${m.icon} 你遇到了${m.name}。${m.desc}`,
    opts: [
      { id: "fight", label: "战", ok: true },
      { id: "flee", label: countOf(c, "t_dun") > 0 ? "避开（遁地符，必成）" : `避开（成功约 ${Math.round(fleeChance(st) * 100)}%，失败会被追上开打）`, ok: true, req: "" },
    ],
  };
}

function runBattle(c, st, monsterId, rng, env, out) {
  const me = buildUnit(c, st);
  me.tals = autoTalismans(c);
  const foe = monsterUnit(monsterId, rng);
  if (!foe) return false;
  const res = battle(me, foe, rng, env);
  c.stats.fights++;
  for (const t of me.tals) removeItems(c, [[t, 1]]);
  c.hpP = Math.max(0.05, res.a.hp / res.a.maxHp);
  c.mpP = Math.max(0, res.a.mp / res.a.maxMp);
  if (c.pet && res.a.petHp != null) { c.pet.hpP = Math.max(0, res.a.petHp); c.pet.restAt = c._now ?? c.last; }
  const m = monsterOf(monsterId);
  out.battle = { foe: { id: m.id, name: m.name, icon: m.icon, elem: m.elem, hp: foe.maxHp }, me: { name: c.name, r: c.r, hp: me.maxHp }, win: res.win, turns: res.turns, log: res.log };
  if (res.win) {
    c.stats.wins++; c.stats.kills++;
    // a won fight ends with a breath of recovery, so one victory never strands a beginner
    c.hpP = Math.min(1, c.hpP + 0.2);
    const drops = [];
    rollDrops(c, m, rng, drops);
    // 灵田: a beaten monster sometimes leaves a seed of its own tier
    const sid = FM_SEED_BY_TIER[Math.min(FM_SEED_BY_TIER.length - 1, m.t ?? 0)];
    if (sid && itemOf(sid) && rng.chance(0.15)) drops.push({ id: sid, n: 1, name: itemOf(sid).name, lost: !addStack(c, sid, 1) });
    out.drops = (out.drops ?? []).concat(drops);
    const xp = Math.round(xpNeed(c) * (m.boss ? 0.08 : 0.025) * (1 + (m.t - c.r) * 0.25));
    c.xp = Math.min(xpNeed(c) * 1.5, c.xp + Math.max(1, xp));
    out.xp = (out.xp ?? 0) + Math.max(1, xp);
    if (c.pet) petGain(c, Math.round((m.boss ? 30 : 10) * vipMod(c).pet), out);
  }
  return res.win;
}

function autoTalismans(c) {
  const list = [];
  for (const id of ["t_tianwang", "t_lei", "t_huo", "t_hu"]) {
    if (countOf(c, id) > 0 && list.length < 2) list.push(id);
  }
  return list;
}

export const PET_MAX_LV = 20;
export function petGain(c, xp, out) {
  if (!c.pet) return 0;
  if ((c.pet.lv ?? 0) >= PET_MAX_LV) { c.pet.xp = 0; return 0; } // 满级不再积历练，免得攒出「10950/350」这种读数
  c.pet.xp += xp;
  // 一次调用可能跨好几级：以前只升一级，剩下的历练就堆在 xp 里，进度条读数会超过需求
  let up = 0;
  while (c.pet.lv < PET_MAX_LV) {
    const need = 50 * (c.pet.lv + 1);
    if (c.pet.xp < need) break;
    c.pet.xp -= need; c.pet.lv++; up++;
  }
  if (c.pet.lv >= PET_MAX_LV) c.pet.xp = 0;
  if (up && out) {
    out.lines = out.lines ?? [];
    out.lines.push(`${c.pet.name}升到了 ${c.pet.lv} 级。`);
  }
  return up;
}

// Apply an outcome tree. Mutates c; appends to out.lines.
export function applyOutcome(c, st, o, rng, out, depth = 0) {
  if (!o || depth > 6) return;
  out.lines = out.lines ?? [];
  if (o.text) out.lines.push(o.text);
  if (o.xp) { const need = xpNeed(c); c.xp = Math.max(0, Math.min(need * 1.5, c.xp + o.xp)); out.xp = (out.xp ?? 0) + o.xp; }
  if (o.ls) { c.ls = Math.max(0, c.ls + o.ls); out.ls = (out.ls ?? 0) + o.ls; }
  if (o.wu) { c.wu = Math.max(0, c.wu + o.wu); out.wu = (out.wu ?? 0) + o.wu; }
  if (o.hp) { c.hpP = Math.max(0.05, Math.min(1, c.hpP + o.hp)); }
  if (o.mp) { c.mpP = Math.max(0, Math.min(1, c.mpP + o.mp)); }
  if (o.tox) { c.tox = Math.max(0, Math.min(100, c.tox + o.tox)); }
  if (o.life) { c.lifeBonus = (c.lifeBonus ?? 0) + o.life; }
  if (o.st) { c.st = Math.max(0, c.st + o.st); }
  if (o.injury) { c.dbf.injury = Math.max(c.dbf.injury ?? 0, c._now + 24 * HOUR); out.lines.push("你受了重伤。"); }
  if (o.heart) { c.dbf.heart = Math.max(c.dbf.heart ?? 0, c._now + 48 * HOUR); out.lines.push("心魔悄然滋生。"); }
  if (o.heartCure) { delete c.dbf.heart; }
  if (o.legacy) { c.legacyGain = (c.legacyGain ?? 0) + o.legacy; }
  if (o.flag) c.flags[o.flag] = 1;
  if (o.unflag) delete c.flags[o.unflag];
  if (o.items) {
    for (const [id, n] of o.items) {
      const def = itemOf(id);
      if (!def) continue;
      if (n < 0) { removeItems(c, [[id, -n]]); continue; }
      if (def.k === "art") { const it = rollArtifact(c, id, rng); (out.drops = out.drops ?? []).push({ id, n: 1, name: def.name, q: it?.q, lost: !it }); }
      else { const ok = addStack(c, id, n); (out.drops = out.drops ?? []).push({ id, n, name: def.name, lost: !ok }); }
    }
  }
  for (const [sid, learn] of [[o.gongfa, learnGongfa], [o.art, learnArt]]) {
    if (!sid) continue;
    const r = learn(c, sid);
    if (r.ok) out.lines.push(r.msg);
    else if (r.msg === "已习得" && giveBook(c, sid, (out.drops = out.drops ?? []))) out.lines.push("你早已会此技，便抄成了一册秘籍。");
    else out.lines.push(`（${r.msg}）`);
  }
  if (o.bio) (out.bio = out.bio ?? []).push(o.bio);
  if (o.chance) {
    const ok = rng.chance(o.chance.p);
    applyOutcome(c, st, ok ? o.chance.ok : o.chance.fail, rng, out, depth + 1);
  }
  if (o.battle) {
    const env = regionOf(c.ev?.region ?? "qingshan")?.env ?? "forest";
    const mid = typeof o.battle === "string" ? o.battle : rng.pick(MONSTERS.filter((m) => m.t === (o.battle.tier ?? 0) && !!m.boss === !!o.battle.boss)).id;
    const win = runBattle(c, st, mid, rng, env, out);
    applyOutcome(c, st, win ? o.win : o.lose, rng, out, depth + 1);
  }
  if (o.next) out.next = o.next;
}

export function choose(c, optId, now, seed) {
  if (!c.ev) return { ok: false, msg: "没有待处理的事件" };
  const st = deriveStats(c);
  const rng = makeRng(`${c.ev.seed}:${optId}`);
  const out = { lines: [] };
  const region = c.ev.region;
  if (c.ev.id.startsWith("enc:")) {
    const mid = c.ev.id.slice(4);
    const m = monsterOf(mid);
    if (optId === "flee") {
      c.ev = null;
      if (countOf(c, "t_dun") > 0) { removeItems(c, [["t_dun", 1]]); return { ok: true, result: { lines: ["你捏碎遁地符，身形没入土中。它只看见一缕尘烟。"] } }; }
      if (rng.chance(fleeChance(st))) return { ok: true, result: { lines: ["你悄然退走，它没有发现你。"] } };
      out.lines.push(`你想悄悄退走，却被${m.name}发现了。它追了上来——避无可避，只能一战。`);
    }
    const env = regionOf(region)?.env ?? "forest";
    const win = runBattle(c, st, mid, rng, env, out);
    out.lines.push(win ? `${m.name}倒下了。` : `你败给了${m.name}，仓皇逃离。`);
    if (!win) c.hpP = Math.max(0.05, c.hpP);
    c.ev = null;
    return { ok: true, result: out };
  }
  const e = eventOf(c.ev.id);
  if (!e) { c.ev = null; return { ok: false, msg: "事件已消散" }; }
  const opt = e.opts.find((o) => o.id === optId);
  if (!opt) return { ok: false, msg: "无此选择" };
  if (!reqOk(c, st, opt.req)) return { ok: false, msg: `条件不足：${reqLabel(opt.req)}` };
  // consume req costs that are costs (ls handled by outcome; item consumption handled by outcome items negative)
  const prevSeed = c.ev.seed;
  applyOutcome(c, st, opt.out, rng, out); // c.ev still set: outcome battles read the region's environment
  c.ev = null;
  if (out.next && eventOf(out.next)) {
    const ne = eventOf(out.next);
    if (ne.once) c.once[ne.id] = 1;
    c.ev = { id: ne.id, region, seed: `${prevSeed}:${out.next}:${c.ac++}` };
    out.nextEvent = eventView(c, deriveStats(c));
  }
  return { ok: true, result: out };
}

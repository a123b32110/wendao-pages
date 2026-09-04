// 秘境探索: a short roguelike run held entirely in `c.dg`. Every floor offers 2-3 options rolled
// from the run seed, so reloading the page never rerolls them; only the resolution consumes a
// derived seed. Loot stays inside the run until 收手 / 通关 — dying halves it.
import { dayEvent } from "./events2.js";
import { MONSTERS, monsterOf, TIER_OF_REALM, TIER_REALM } from "../data/monsters.js";
import { ITEMS, itemOf } from "../data/items.js";
import { gongfaOf, artOf } from "../data/skills.js";
import { DG_DIFFS, DG_RELICS, DG_EVENTS, DG_NODES, dgRelicOf } from "../data/dungeon.js";
import { makeRng, hashStr } from "./rng.js";
import { deriveStats, buildUnit, basePower, TOX_MAX } from "./stats.js";
import { battle } from "./battle.js";
import { monsterUnit, petGain } from "./explore.js";
import { addStack, rollArtifact, removeItems, countOf, learnGongfa, learnArt, ART_CAP } from "./inventory.js";
import { xpNeed } from "./char.js";
import { weekKey } from "./time.js";
import { profiles } from "./shared.js";

export const DG_ENTRIES = 2;
const DG_RELIC_CAP = 8;
const DG_LOOT_ARTS = 6;
// deepest tier that still has ordinary monsters — the data agent may add tier 5/6 later
const DG_MAX_TIER = MONSTERS.reduce((t, m) => (m.boss ? t : Math.max(t, m.t)), 0);

// 秘境里的战斗是不回血的连场消耗，所以内容层级比别处低半档（化神仍打 t3、渡劫仍打 t6）；
// 由此产生的强弱差由 dgFoe 里的 gap 补偿，不靠这张表。
const DG_TIER_OF_REALM = [0, 1, 2, 3, 3, 4, 5, 6, 6];
function dgTier(c) {
  const r = Math.max(0, Math.min(8, c.r | 0));
  return Math.max(0, Math.min(DG_MAX_TIER, DG_TIER_OF_REALM[r]));
}
function dgUnitLs(tier) {
  return 10 * (1 + tier); // 秘境以材料与法宝为主，灵石只是零头
}
function dgHas(dg, id) {
  return (dg.rel ?? []).indexOf(id) >= 0;
}
function dgMats(tier) {
  for (let t = tier; t >= 0; t--) {
    const list = ITEMS.filter((i) => i.k === "mat" && i.t === t);
    if (list.length) return list;
  }
  return ITEMS.filter((i) => i.k === "mat");
}
function dgArts(tier) {
  for (let t = tier; t >= 0; t--) {
    const list = ITEMS.filter((i) => i.k === "art" && i.t === t);
    if (list.length) return list;
  }
  return ITEMS.filter((i) => i.k === "art");
}
function dgPool(tier) {
  const list = MONSTERS.filter((m) => !m.boss && m.t <= tier);
  return list.length ? list : MONSTERS.filter((m) => !m.boss);
}
function dgBossPool(tier) {
  const list = MONSTERS.filter((m) => m.boss && m.t <= tier);
  return list.length ? list : MONSTERS.filter((m) => m.boss);
}
function dgLine(dg, s) {
  if (!s) return;
  dg.last = (dg.last ?? []).concat([s]).slice(-6);
}

// ---------------------------------------------------------------- floor options
// Seeded by the run seed alone: the same floor always shows the same doors.
export function dgFloorOpts(c, dg, f) {
  const tier = dgTier(c);
  const rng = makeRng(`${dg.sd}:o:${f}`);
  if (f >= dg.n) {
    const m = rng.pick(dgBossPool(tier));
    return [{ t: "boss", id: m.id, n: `秘境之主 · ${m.name}`, i: m.icon, elem: m.elem, d: m.desc }];
  }
  // 权重只看层数，不看当前气血：dg.use 会在不推进层数的情况下改 dg.hp，
  // 一旦血量跨过阈值，整层的门就会当着玩家的面重摇一遍（也能被当成刷新用）。
  const pool = DG_NODES.filter((x) => f >= x.f).map((x) => [x, x.w]);
  const want = 2 + (rng.chance(0.45) ? 1 : 0);
  const picked = [];
  let left = pool.slice();
  while (picked.length < want && left.length) {
    const node = rng.weighted(left);
    picked.push(node);
    left = left.filter((e) => e[0].t !== node.t);
  }
  return picked.map((node) => {
    if (node.t === "mon" || node.t === "elite") {
      const m = rng.pick(dgPool(tier));
      return { t: node.t, id: m.id, n: node.t === "elite" ? `精怪 · ${m.name}` : m.name, i: m.icon, elem: m.elem, d: m.desc };
    }
    if (node.t === "ev") return { t: "ev", e: Math.floor(rng.next() * DG_EVENTS.length), n: node.n, i: node.i, d: "前方有些说不清的东西。" };
    const d = { mon: "", chest: "撬开看看，多半有东西。", spring: "回复气血与灵力。", trap: "以速度硬闯，失手要挨一下。", shop: "路遇行商，可换些补给。", relic: "三样机缘，取其一。" }[node.t] ?? "";
    return { t: node.t, n: node.n, i: node.i, d };
  });
}

// ---------------------------------------------------------------- units
function dgApplyRelics(u, dg) {
  for (const id of dg.rel ?? []) {
    const r = dgRelicOf(id);
    if (!r) continue;
    if (r.k === "atk") u.atk = Math.round(u.atk * r.v);
    else if (r.k === "def") u.def = Math.round(u.def * r.v);
    else if (r.k === "crit") u.crit = +(u.crit + r.v).toFixed(3);
    else if (r.k === "spd") u.spd = Math.round(u.spd * r.v);
    else if (r.k === "spell") u.spell = +(u.spell * r.v).toFixed(2);
    else if (r.k === "hp") { u.maxHp = Math.round(u.maxHp * r.v); u.hp = Math.round(u.hp * r.v); }
    else if (r.k === "tal" && u.tals.length < 3) u.tals.push(r.v);
  }
  return u;
}
export function dgUnitFor(c, st, dg) {
  const u = buildUnit(c, st, { hpFrac: dg.hp, mpFrac: dg.mp });
  u.tals = [];
  return dgApplyRelics(u, dg);
}
// 层级表是离散的，境界表不是：TIER_REALM 在 t4 处从境界 3 直接跳到 5，t6 之后再没有更高的层级。
// 于是同一层级里，有的境界比内容强一大截（化神、渡劫白捡一档），有的正好同级（元婴、炼虚、合体
// 得跟同等力量的怪硬拼）—— 通关率就沿着境界锯齿。这里按「自身力量 ÷ 内容力量」把差距补回去，
// 指数 <1 保留一点越级轻松的手感。DG_REALM_ADJ 是扫完之后剩下的残差微调。
// 校准工具：tools/sim-dungeon.mjs（目标：寻幽 75-90%、绝境 15-40%）
const DG_GAP_POW = 0.8;
const DG_REALM_ADJ = [1, 1, 0.92, 0.85, 1.08, 0.66, 0.62, 0.66, 0.76];
function dgFoe(c, dg, id, rng, kind) {
  const tier = dgTier(c);
  const u = monsterUnit(id, rng, tier);
  if (!u) return null;
  const df = DG_DIFFS[dg.df] ?? DG_DIFFS[0];
  const r = Math.max(0, Math.min(8, c.r | 0));
  const gap = basePower(r, c.s ?? 0) / Math.max(1, basePower(TIER_REALM[tier] ?? r, c.s ?? 0));
  let m = (0.5 + 0.03 * dg.f) * df.fm * Math.pow(gap, DG_GAP_POW) * DG_REALM_ADJ[r];
  if (kind === "elite") m *= 1.2;
  // attack scales gentler than hp: a run is 8-12 fights of attrition with no free healing
  u.atk = Math.round(u.atk * m * (tier >= 4 ? 0.42 : 0.5));
  u.hp = Math.round(u.hp * m * 0.8 * (kind === "boss" ? 1.25 : 1));
  u.maxHp = u.hp;
  if (kind === "boss") u.def = Math.round(u.def * 0.8);
  return u;
}

// ---------------------------------------------------------------- loot (kept inside the run)
function dgRollLoot(c, dg, m, rng, times) {
  for (let k = 0; k < times; k++) {
    for (const [id, p, n] of m.drops ?? []) {
      if (!rng.chance(p)) continue;
      const def = itemOf(id);
      if (def && def.k === "art") {
        if (dg.loot.a.length >= DG_LOOT_ARTS) continue;
        const tmp = { inv: { arts: [] }, ic: 0, path: c.path };
        const it = rollArtifact(tmp, id, rng);
        if (it) dg.loot.a.push({ id, q: it.q, af: it.af });
      } else if (def) dg.loot.s[id] = (dg.loot.s[id] ?? 0) + n;
      else if (id.startsWith("g_")) { if (!c.gfs.includes(id) && dg.loot.b.indexOf(id) < 0) dg.loot.b.push(id); }
      else if (id.startsWith("a_")) { if (!c.arts.includes(id) && dg.loot.b.indexOf(id) < 0) dg.loot.b.push(id); }
    }
  }
}
function dgAddArt(c, dg, id, rng) {
  if (dg.loot.a.length >= DG_LOOT_ARTS) return;
  const tmp = { inv: { arts: [] }, ic: 0, path: c.path };
  const it = rollArtifact(tmp, id, rng);
  if (it) dg.loot.a.push({ id, q: it.q, af: it.af });
}
function dgBookName(id) {
  return (id.startsWith("g_") ? gongfaOf(id)?.name : artOf(id)?.name) ?? id;
}
function dgLootView(dg) {
  const list = [];
  for (const id of Object.keys(dg.loot.s)) { const d = itemOf(id); list.push({ id, n: dg.loot.s[id], name: d?.name ?? id, t: d?.t ?? 0 }); }
  for (const a of dg.loot.a) { const d = itemOf(a.id); list.push({ id: a.id, n: 1, q: a.q, name: d?.name ?? a.id, t: d?.t ?? 0 }); }
  for (const b of dg.loot.b) list.push({ id: b, n: 1, name: `《${dgBookName(b)}》`, book: 1, t: 3 });
  return { n: list.length, a: dg.loot.a.length, list: list.slice(0, 8) };
}
function dgGrantRelic(c, dg, rng, lines) {
  const own = dg.rel ?? [];
  if (own.length >= DG_RELIC_CAP) { lines.push("机缘已满，此物与你无缘。"); return null; }
  const pool = DG_RELICS.filter((r) => own.indexOf(r.id) < 0);
  if (!pool.length) return null;
  const r = rng.pick(pool);
  dg.rel.push(r.id);
  lines.push(`获得机缘「${r.n}」（${r.d}）。`);
  return r;
}
function dgRelicChoices(dg, rng, n) {
  const own = dg.rel ?? [];
  const pool = rng.shuffle(DG_RELICS.filter((r) => own.indexOf(r.id) < 0));
  return pool.slice(0, n).map((r) => r.id);
}

// ---------------------------------------------------------------- run flow
function dgAdvance(dg) {
  dg.pend = null;
  dg.pf = null;
  dg.f++;
  if (dgHas(dg, "chun")) dg.hp = Math.min(1, dg.hp + 0.1);
  if (dgHas(dg, "quan")) dg.mp = Math.min(1, dg.mp + 0.1);
}

// Bank the run: hand the loot over, write 周榜 best, clear `c.dg`.
export function dgBank(c, dg, now, opts = {}) {
  const dead = !!opts.dead, done = !!opts.done;
  const stack = {}, arts = dg.loot.a.slice(), books = dg.loot.b.slice();
  const halved = []; // 腰斩后归零的东西：只剩一件的法宝、只有一个的材料。不报出来玩家会以为是 bug
  for (const id of Object.keys(dg.loot.s)) {
    const full = dg.loot.s[id];
    const n = dead ? Math.floor(full / 2) : full;
    if (n > 0) stack[id] = n;
    else if (full > 0) halved.push({ id, n: full });
  }
  const keep = dead ? Math.floor(arts.length / 2) : arts.length;
  const keptArts = arts.slice(0, keep);
  for (const a of arts.slice(keep)) halved.push({ id: a.id, n: 1, q: a.q });
  const xp = Math.round(dead ? dg.xp / 2 : dg.xp);
  const ls = Math.round(dead ? dg.ls / 2 : dg.ls);
  const got = [];
  for (const id of Object.keys(stack)) {
    const d = itemOf(id);
    got.push({ id, n: stack[id], name: d?.name ?? id, t: d?.t ?? 0, lost: !addStack(c, id, stack[id]) });
  }
  for (const a of keptArts) {
    const d = itemOf(a.id);
    if (c.inv.arts.length >= ART_CAP) { got.push({ id: a.id, n: 1, q: a.q, name: d?.name ?? a.id, t: d?.t ?? 0, lost: true }); continue; }
    c.ic = (c.ic ?? 0) + 1;
    c.inv.arts.push({ iid: c.ic, id: a.id, q: a.q, af: a.af });
    got.push({ id: a.id, n: 1, q: a.q, name: d?.name ?? a.id, t: d?.t ?? 0 });
  }
  for (const x of halved) {
    const d = itemOf(x.id);
    got.push({ id: x.id, n: x.n, q: x.q, name: d?.name ?? x.id, t: d?.t ?? 0, halved: true });
  }
  const lines = [];
  for (const b of books) {
    const r = b.startsWith("g_") ? learnGongfa(c, b) : learnArt(c, b);
    if (r.ok) lines.push(r.msg);
  }
  let xpGot = 0;
  if (xp > 0) { const before = c.xp; c.xp = Math.min(xpNeed(c) * 1.5, c.xp + xp); xpGot = Math.round(c.xp - before); }
  if (xpGot < xp) lines.push("修为已至此境瓶颈，此行所得只入了一部分。");
  if (ls > 0) c.ls += ls;
  // 秘境里掉的血按「差额」结算，不把入场快照盖回去：开着秘境去讨伐 BOSS、嗑丹、挂机回气血的人
  // 原本会在收手那一刻被整个回档 —— 既白吃了丹药，也等于每天两次免费满血。
  const lostHp = Math.max(0, (dg.h0 ?? dg.hp) - dg.hp);
  const lostMp = Math.max(0, (dg.m0 ?? dg.mp) - dg.mp);
  c.hpP = dead ? 0.2 : Math.max(0.05, (c.hpP ?? 1) - lostHp);
  c.mpP = dead ? 0.2 : Math.max(0, (c.mpP ?? 1) - lostMp);
  const depth = done ? dg.n : Math.max(0, dg.f - 1);
  const used = Math.max(0, now - (dg.t0 ?? now));
  const wk = weekKey(now);
  const best = c.dgBest && c.dgBest.wk === wk ? c.dgBest : null;
  if (!best || depth > best.d || (depth === best.d && used < best.t)) c.dgBest = { wk, d: depth, t: used };
  c.stats.dg = (c.stats.dg ?? 0) + 1;
  c.dg = null;
  return { dead, done, depth, xp: xpGot, ls, drops: got, lines, ms: used };
}

// Shared resolution for 妖兽 / 精怪 / 秘境之主 / 拟态宝箱.
function dgFight(c, st, dg, kind, mid, rng, now, out) {
  const tier = dgTier(c);
  const me = dgUnitFor(c, st, dg);
  const foe = dgFoe(c, dg, mid, rng, kind === "mimic" ? "elite" : kind);
  if (!foe) return { ok: false, msg: "此路不通" };
  const res = battle(me, foe, rng, "arena");
  const m = monsterOf(mid);
  c.stats.fights++;
  dg.hp = Math.max(0, res.a.hp / res.a.maxHp);
  dg.mp = Math.max(0, res.a.mp / res.a.maxMp);
  if (c.pet && res.a.petHp != null) { c.pet.hpP = Math.max(0, res.a.petHp); c.pet.restAt = now; }
  out.battle = { foe: { id: m.id, name: kind === "mimic" ? "拟态宝箱" : m.name, icon: kind === "mimic" ? "🧰" : m.icon, elem: m.elem, hp: foe.maxHp }, me: { name: c.name, r: c.r, hp: me.maxHp }, win: res.win, turns: res.turns, log: res.log };
  const df = DG_DIFFS[dg.df] ?? DG_DIFFS[0];
  if (res.win) {
    c.stats.wins++; c.stats.kills++;
    // 战后调息：每胜一战缓回一成气血（游历是两成；秘境要靠药泉与丹药撑到底）
    dg.hp = Math.min(1, dg.hp + 0.1);
    let times = df.lm * (dgHas(dg, "bao") ? 2 : 1) * (kind === "elite" || kind === "boss" ? 2 : 1) * (kind === "mimic" ? 1.5 : 1);
    dgRollLoot(c, dg, m, rng, Math.max(1, Math.round(times)));
    const xp = xpNeed(c) * (kind === "boss" ? 0.1 : kind === "mon" ? 0.02 : 0.05) * (1 + 0.05 * dg.f) * (dgHas(dg, "wu") ? 1.5 : 1);
    dg.xp += xp;
    const u = dgUnitLs(tier);
    dg.ls += u * (kind === "boss" ? 8 : kind === "mon" ? 1 : 3) * (dgHas(dg, "ju") ? 1.5 : 1);
    if (c.pet) petGain(c, kind === "boss" ? 30 : 10, out);
    out.lines.push(`${kind === "mimic" ? "拟态" : m.name}倒下了。`);
    if (kind === "elite") dgGrantRelic(c, dg, rng, out.lines);
    if (kind === "boss") {
      dg.loot.s.m_jinghe = (dg.loot.s.m_jinghe ?? 0) + 1;
      dgAddArt(c, dg, rng.pick(dgArts(tier)).id, rng);
      out.lines.push("秘境之主伏诛，核心与遗宝尽归于你。");
      for (const l of out.lines) dgLine(dg, l);
      out.bank = dgBank(c, dg, now, { done: true });
      return { ok: true, msg: "秘境通关", ...out };
    }
    dgAdvance(dg);
    return { ok: true, ...out };
  }
  if (dgHas(dg, "shou") && !dg.sh) {
    dg.sh = 1;
    dg.hp = 0.3;
    out.lines.push("守护机缘应声而碎，你从鬼门关外爬了回来。");
    // 最后一层没打赢就别往前挪：挪了会变成「第 13/12 层」，周榜还会按通关深度记
    if (dg.f < dg.n) dgAdvance(dg);
    else { dg.pend = null; dg.pf = null; }
    return { ok: true, ...out };
  }
  out.lines.push("你倒在了这里。醒来时已在秘境之外，行囊轻了一半。");
  for (const l of out.lines) dgLine(dg, l);
  out.bank = dgBank(c, dg, now, { dead: true });
  return { ok: true, msg: "力竭而返", ...out };
}

// Run-scoped version of applyOutcome: nothing touches the bag until 收手.
function dgApplyOut(c, st, dg, o, rng, out, now, depth = 0) {
  if (!o || depth > 3) return null;
  const tier = dgTier(c);
  if (o.text) out.lines.push(o.text);
  if (o.hp) dg.hp = Math.max(0.05, Math.min(1, dg.hp + o.hp));
  if (o.mp) dg.mp = Math.max(0, Math.min(1, dg.mp + o.mp));
  if (o.ls) dg.ls = Math.max(0, dg.ls + o.ls * dgUnitLs(tier) * (o.ls > 0 && dgHas(dg, "ju") ? 1.5 : 1));
  if (o.xp) dg.xp += xpNeed(c) * o.xp * (dgHas(dg, "wu") ? 1.5 : 1);
  if (o.relic) dgGrantRelic(c, dg, rng, out.lines);
  if (o.item === "mat") { const m = rng.pick(dgMats(tier)); dg.loot.s[m.id] = (dg.loot.s[m.id] ?? 0) + 1; out.lines.push(`拾得${m.name}。`); }
  if (o.p) dgApplyOut(c, st, dg, rng.chance(o.p.chance) ? o.p.ok : o.p.fail, rng, out, now, depth + 1);
  if (o.battle) return dgFight(c, st, dg, "mon", rng.pick(dgPool(tier)).id, rng, now, out);
  return null;
}

// ---------------------------------------------------------------- methods
export function dgEnter(c, diff, now) {
  if (c.dg) return { ok: false, msg: "你已在秘境之中" };
  if (c.ev || c.trib) return { ok: false, msg: "眼前的事还没了结" };
  const d = DG_DIFFS[Number(diff) | 0];
  if (!d || Number(diff) !== d.id) return { ok: false, msg: "无此秘境" };
  if (c.r < d.realm) return { ok: false, msg: "境界不足，此境凶险" };
  if ((c.hpP ?? 1) < 0.5) return { ok: false, msg: "气血不足五成，先疗伤再进" };
  const limit = DG_ENTRIES + (c.sub === "tan" ? 1 : 0) + ((c.vip | 0) >= 3 ? 1 : 0) + dayEvent(now).dg;
  if ((c.daily.dg ?? 0) >= limit) return { ok: false, msg: "今日入秘境的次数已尽" };
  c.daily.dg = (c.daily.dg ?? 0) + 1;
  const sd = String(hashStr(`${c.uid}:${c.sk ?? ""}:${now}:${c.ac}`));
  c.ac++;
  c.dg = {
    // h0/m0 是入场时的气血灵力，收手时用来算「这一趟掉了多少」；见 dgBank
    sd, df: d.id, f: 1, n: d.n, hp: c.hpP, mp: c.mpP, h0: c.hpP, m0: c.mpP, rel: [], sh: 0, pf: null,
    loot: { s: {}, a: [], b: [] }, xp: 0, ls: 0, pend: null, last: [`踏入${d.name}秘境，身后石门缓缓合上。`], t0: now,
  };
  return { ok: true, msg: `入${d.name}秘境` };
}

export function dgLeave(c, now) {
  if (!c.dg) return { ok: false, msg: "你不在秘境中" };
  if (c.dg.pend && c.dg.pend.t === "ev") return { ok: false, msg: "眼前的事还没了结" };
  const bank = dgBank(c, c.dg, now, {});
  return { ok: true, msg: `收手而归，深入 ${bank.depth} 层`, bank };
}

export function dgUse(c, id, now, st) {
  if (!c.dg) return { ok: false, msg: "你不在秘境中" };
  if (id !== "p_huixue" && id !== "p_huiling") return { ok: false, msg: "秘境中只能服回血丹与回灵丹" };
  const dg = c.dg;
  if (dg.pf === dg.f) return { ok: false, msg: "本层已服过丹药" };
  if (countOf(c, id) < 1) return { ok: false, msg: "没有这件物品" };
  const def = itemOf(id);
  const pm = st?.pathMods?.pill ?? 1, tm = st?.pathMods?.toxin ?? 1;
  const tox = (def.fx?.tox ?? 0) * tm;
  if (c.tox + tox > TOX_MAX) return { ok: false, msg: "丹毒已深，再服必走火入魔" };
  removeItems(c, [[id, 1]]);
  c.tox = Math.min(TOX_MAX, c.tox + tox);
  c.stats.pills++;
  dg.pf = dg.f;
  if (def.fx?.heal) dg.hp = Math.min(1, dg.hp + def.fx.heal * pm);
  if (def.fx?.mp) dg.mp = Math.min(1, dg.mp + def.fx.mp * pm);
  dgLine(dg, `服下${def.name}。`);
  return { ok: true, msg: `服下${def.name}` };
}

function dgShopGoods(c, dg, rng) {
  const u = dgUnitLs(dgTier(c));
  // 机缘位满就别摆机缘了，摆出来也只能买了白花钱
  const relics = (dg.rel ?? []).length >= DG_RELIC_CAP ? [] : dgRelicChoices(dg, rng, 2);
  const goods = [{ k: "hp", ls: Math.round(2 * u) }, { k: "mp", ls: Math.round(1.5 * u) }].concat(relics.map((id) => ({ k: "relic", id, ls: Math.round(4 * u) })));
  return rng.shuffle(goods).slice(0, 3);
}

function dgResolvePend(c, st, dg, i, now, out) {
  const pend = dg.pend;
  const rng = makeRng(`${dg.sd}:p:${dg.f}:${i}`);
  if (pend.t === "shop") {
    if (i < 0) { out.lines.push("你摆手谢过，继续往里走。"); dgAdvance(dg); return { ok: true, ...out }; }
    const g = pend.g[i];
    if (!g) return { ok: false, msg: "无此货物" };
    // 先验货再收钱：机缘位满或已持有时旧版照扣灵石、什么也不给，还回一句「此物你已有了」
    if (g.k !== "hp" && g.k !== "mp") {
      const r0 = dgRelicOf(g.id);
      if (!r0) return { ok: false, msg: "无此货物" };
      if ((dg.rel ?? []).indexOf(r0.id) >= 0) return { ok: false, msg: `${r0.n}你已有了` };
      if ((dg.rel ?? []).length >= DG_RELIC_CAP) return { ok: false, msg: "机缘已满，此物买了也带不走" };
    }
    if (dg.ls < g.ls) return { ok: false, msg: "本次秘境所得不够付账" };
    dg.ls -= g.ls;
    if (g.k === "hp") { dg.hp = Math.min(1, dg.hp + 0.5); out.lines.push("你就地服下回血丹。"); }
    else if (g.k === "mp") { dg.mp = Math.min(1, dg.mp + 0.5); out.lines.push("你就地服下回灵丹。"); }
    else {
      const r = dgRelicOf(g.id);
      dg.rel.push(r.id);
      out.lines.push(`买下机缘「${r.n}」（${r.d}）。`);
    }
    dgAdvance(dg);
    return { ok: true, ...out };
  }
  if (pend.t === "relic") {
    if (i < 0) { out.lines.push("你看了两眼，终究没拿。"); dgAdvance(dg); return { ok: true, ...out }; }
    const id = pend.r[i];
    const r = dgRelicOf(id);
    if (!r) return { ok: false, msg: "无此机缘" };
    if (dg.rel.length >= DG_RELIC_CAP) out.lines.push("机缘已满，此物与你无缘。");
    else if (dg.rel.indexOf(id) < 0) { dg.rel.push(id); out.lines.push(`取得机缘「${r.n}」（${r.d}）。`); }
    dgAdvance(dg);
    return { ok: true, ...out };
  }
  // ev: the two-choice incident must be settled before anything else
  const e = DG_EVENTS[pend.e];
  const opt = e?.o?.[i];
  if (!opt) return { ok: false, msg: "无此选择" };
  const fight = dgApplyOut(c, st, dg, opt.out, rng, out, now);
  if (fight) return fight;
  dgAdvance(dg);
  return { ok: true, ...out };
}

export function dgPick(c, i, now) {
  if (!c.dg) return { ok: false, msg: "你不在秘境中" };
  const dg = c.dg;
  const st = deriveStats(c);
  const out = { lines: [] };
  const idx = Number.isFinite(Number(i)) ? Math.trunc(Number(i)) : -1;
  const finish = (r) => {
    if (r.ok && c.dg) for (const l of (r.lines ?? [])) dgLine(c.dg, l);
    return r;
  };
  if (dg.pend) {
    const r = dgResolvePend(c, st, dg, idx, now, out);
    return r.bank ? r : finish(r);
  }
  const opts = dgFloorOpts(c, dg, dg.f);
  if (idx < 0 || idx >= opts.length) return { ok: false, msg: "无此选择" };
  const o = opts[idx];
  const rng = makeRng(`${dg.sd}:r:${dg.f}:${idx}`);
  const tier = dgTier(c);
  const u = dgUnitLs(tier);
  if (o.t === "mon" || o.t === "elite" || o.t === "boss") {
    const r = dgFight(c, st, dg, o.t, o.id, rng, now, out);
    return r.bank ? r : finish(r);
  }
  if (o.t === "chest") {
    const key = dgHas(dg, "yao");
    const x = rng.next();
    if (!key && x < 0.15) {
      out.lines.push("箱盖翻开，里面长着牙。");
      const r = dgFight(c, st, dg, "mimic", rng.pick(dgPool(tier)).id, rng, now, out);
      return r.bank ? r : finish(r);
    }
    if (!key && x < 0.2) out.lines.push("箱子空空如也，只有一层浮灰。");
    else {
      const n = 1 + (rng.chance(0.5) ? 1 : 0) + (key ? 1 : 0);
      const mats = dgMats(tier);
      for (let k = 0; k < n; k++) {
        const m = rng.pick(mats);
        const cnt = rng.int(1, 3);
        dg.loot.s[m.id] = (dg.loot.s[m.id] ?? 0) + cnt;
        out.lines.push(`得${m.name}×${cnt}。`);
      }
      const ls = Math.round(2 * u * (1 + 0.1 * dg.f) * (dgHas(dg, "ju") ? 1.5 : 1));
      dg.ls += ls;
      out.lines.push(`箱底还压着 ${ls} 灵石。`);
    }
    dgAdvance(dg);
    return finish({ ok: true, ...out });
  }
  if (o.t === "spring") {
    dg.hp = Math.min(1, dg.hp + 0.5);
    dg.mp = Math.min(1, dg.mp + 0.5);
    out.lines.push("泉水清冽，气血与灵力都缓了过来。");
    dgAdvance(dg);
    return finish({ ok: true, ...out });
  }
  if (o.t === "trap") {
    if (dgHas(dg, "yu")) out.lines.push("轻羽在身，你踏着机关顶端走了过去。");
    else {
      const p = Math.min(0.95, st.spd / (st.spd + 25 * (1 + tier)) * 1.1);
      if (rng.chance(p)) { dg.ls += u; out.lines.push(`你贴着机关缝隙钻了过去，还顺走 ${u} 灵石。`); }
      else { dg.hp = Math.max(0.05, dg.hp - 0.25); out.lines.push("机括一响，你被刺了个正着。"); }
    }
    dgAdvance(dg);
    return finish({ ok: true, ...out });
  }
  if (o.t === "shop") {
    dg.pend = { t: "shop", g: dgShopGoods(c, dg, rng) };
    out.lines.push("一个背着货箱的人靠在石壁上：「买点什么？」");
    return finish({ ok: true, ...out });
  }
  if (o.t === "relic") {
    const r3 = dgRelicChoices(dg, rng, 3);
    if (!r3.length) { out.lines.push("此处机缘你已尽得。"); dgAdvance(dg); return finish({ ok: true, ...out }); }
    dg.pend = { t: "relic", r: r3 };
    out.lines.push("石台上浮着三样东西，只能取一。");
    return finish({ ok: true, ...out });
  }
  if (o.t === "ev") {
    dg.pend = { t: "ev", e: o.e };
    return finish({ ok: true, ...out });
  }
  return { ok: false, msg: "无此选择" };
}

// ---------------------------------------------------------------- views
export function dgBoard(shared, now) {
  const wk = weekKey(now);
  return profiles(shared).filter((p) => Array.isArray(p.dgw) && p.dgw[0] === wk)
    .sort((a, b) => (b.dgw[1] - a.dgw[1]) || (a.dgw[2] - b.dgw[2]))
    .slice(0, 10)
    .map((p, i) => ({ rank: i + 1, uid: p.uid, n: p.n, d: p.dgw[1], t: p.dgw[2] }));
}
function dgPendView(dg) {
  const p = dg.pend;
  if (!p) return null;
  if (p.t === "shop") return { t: "shop", g: p.g.map((g) => ({ ls: g.ls, n: g.k === "hp" ? "回血丹" : g.k === "mp" ? "回灵丹" : dgRelicOf(g.id)?.n ?? "机缘", d: g.k === "hp" ? "气血 +50%" : g.k === "mp" ? "灵力 +50%" : dgRelicOf(g.id)?.d ?? "" })) };
  if (p.t === "relic") return { t: "relic", r: p.r.map((id) => ({ id, n: dgRelicOf(id)?.n ?? id, d: dgRelicOf(id)?.d ?? "" })) };
  const e = DG_EVENTS[p.e];
  return { t: "ev", text: e?.t ?? "", o: (e?.o ?? []).map((x) => ({ l: x.l })) };
}
export function dungeonView(c, shared, now) {
  const limit = DG_ENTRIES + (c.sub === "tan" ? 1 : 0) + ((c.vip | 0) >= 3 ? 1 : 0) + dayEvent(now).dg;
  const wk = weekKey(now);
  const v = {
    left: Math.max(0, limit - (c.daily.dg ?? 0)), limit,
    diffs: DG_DIFFS.map((d) => ({ id: d.id, name: d.name, n: d.n, lm: d.lm, realm: d.realm, desc: d.desc, ok: c.r >= d.realm })),
    best: c.dgBest && c.dgBest.wk === wk ? { d: c.dgBest.d, t: c.dgBest.t } : null,
    board: dgBoard(shared, now), run: null,
  };
  if (!c.dg) return v;
  const dg = c.dg;
  v.run = {
    f: dg.f, n: dg.n, df: dg.df, diff: (DG_DIFFS[dg.df] ?? DG_DIFFS[0]).name,
    hp: +dg.hp.toFixed(3), mp: +dg.mp.toFixed(3), xp: Math.round(dg.xp), ls: Math.round(dg.ls),
    pillOk: dg.pf !== dg.f, sh: dg.sh ? 1 : 0, last: (dg.last ?? []).slice(-6),
    rel: (dg.rel ?? []).map((id) => ({ id, n: dgRelicOf(id)?.n ?? id, d: dgRelicOf(id)?.d ?? "" })),
    loot: dgLootView(dg), pend: dgPendView(dg),
    opts: dg.pend ? [] : dgFloorOpts(c, dg, dg.f).map((o) => ({ t: o.t, id: o.id ?? null, n: o.n, i: o.i, d: o.d ?? "", elem: o.elem ?? null })),
  };
  return v;
}

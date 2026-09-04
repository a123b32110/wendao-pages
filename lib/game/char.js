import { REALMS, ASCEND_REALM, stageNeed, realmName } from "../data/realms.js";
import { rollRoot } from "../data/roots.js";
import { makeRng } from "./rng.js";
import { HOUR, DAY, YEARS_PER_DAY, dayKey } from "./time.js";
import { deriveStats, offlineCapMs, STAMINA_REGEN_HOURS, TOX_DECAY_PER_DAY } from "./stats.js";

export const SCHEMA = 1;
export const START_AGE = 16;

const NAME_RE = /^[一-龥A-Za-z0-9_·]{2,8}$/;
export function validName(name) {
  return typeof name === "string" && NAME_RE.test(name);
}

export function newCharacter({ uid, name, now, seed, legacy }) {
  const rng = makeRng(seed);
  const root = rollRoot(rng);
  const lg = legacy ?? { pts: 0, lives: 0 };
  const c = {
    v: SCHEMA, uid, name, born: now, created: now,
    r: 0, s: 0, xp: 0, root, rerolls: 3,
    path: null, sub: null, respec: 0, wu: 0,
    hpP: 1, mpP: 1, tox: 0, toxAt: now,
    st: 10, stAt: now, ls: 50 + lg.pts * 20,
    last: now, breathAt: 0, breathN: 0,
    buffs: [], dbf: {}, lifeBonus: 0,
    gf: "g_tuna", gfs: ["g_tuna"], arts: ["a_slash", "a_fire"], eqArts: ["a_slash", "a_fire"],
    eq: { w: null, a: null, r: null }, inv: { stack: { p_huixue: 2, m_lingcao: 3 }, arts: [] }, ic: 0,
    pet: null, array: 0, flags: {}, once: {}, ev: null, trib: null, ac: 0,
    daily: { d: dayKey(now), exp: 0, arena: 0, boss: 0, breath: 0, login: false, claim: {}, bs: null, bo: null, br: null },
    stats: { fights: 0, wins: 0, kills: 0, explores: 0, pills: 0, crafts: 0, bt: 0, btFail: 0, tribs: 0, sells: 0, dons: 0, bossHits: 0, aw: 0 },
    season: { n: 0, ss: 0, ar: 1000, w: 0, l: 0, sync: now },
    sect: null, sectLv: 0, legacy: lg.pts, lives: (lg.lives ?? 0) + 1,
    dead: null, ascended: false, title: null,
  };
  if (lg.pts >= 5) c.inv.stack.p_xiqi = 2;
  if (lg.pts >= 10) c.gfs.push("g_qingfeng");
  if (lg.keep?.gf) for (const g of lg.keep.gf) if (!c.gfs.includes(g)) c.gfs.push(g);
  if (lg.keep?.arts) for (const a of lg.keep.arts) if (!c.arts.includes(a)) c.arts.push(a);
  return c;
}

export function ageOf(c, now) {
  return START_AGE + Math.floor(((now - c.born) / DAY) * YEARS_PER_DAY);
}
export function lifespanOf(c, st) {
  const base = c.r >= ASCEND_REALM ? 99999 : REALMS[c.r].life;
  return Math.round(base * (st?.lifeMult ?? 1)) + (c.lifeBonus ?? 0);
}
export function xpNeed(c) {
  if (c.r >= ASCEND_REALM) return 1;
  return stageNeed(c.r, c.s);
}

// Apply all elapsed-time effects. Mutates c. Returns a summary for the UI.
export function settle(c, now) {
  c._now = now;
  const out = { gained: 0, hours: 0, died: false, stamina: 0 };

  // daily rollover — before the dead check, so the counters a dead character still shows
  // (and anything read off c.daily while it waits for 转世) are never yesterday's
  const d = dayKey(now);
  if (c.daily.d !== d) {
    c.daily = { d, exp: 0, arena: 0, boss: 0, breath: 0, login: false, claim: {}, bs: null, bo: null, br: null };
  }
  if (c.dead) return out;
  const st = deriveStats(c);

  // cultivation: integrate rate over [last, now], capped; buffs apply over their overlap.
  const elapsed = Math.max(0, now - (c.last ?? now));
  const effective = Math.min(elapsed, offlineCapMs(c));
  if (effective > 0 && c.r < ASCEND_REALM) {
    const from = now - effective;
    const baseRate = REALMS[c.r].rate * st.rate;
    let hours = effective / HOUR;
    let bonusHours = 0;
    for (const b of c.buffs ?? []) {
      if (b.k !== "rate") continue;
      const s0 = Math.max(from, b.from ?? 0);
      const s1 = Math.min(now, b.until ?? 0);
      if (s1 > s0) bonusHours += ((s1 - s0) / HOUR) * (b.m - 1);
    }
    const gained = baseRate * (hours + bonusHours);
    const need = xpNeed(c);
    const cap = need * 1.5;
    const before = c.xp;
    c.xp = Math.min(cap, c.xp + gained);
    out.gained = Math.round(c.xp - before);
    out.hours = +hours.toFixed(2);
    out.capped = elapsed > effective;
  }
  c.last = now;
  c.buffs = (c.buffs ?? []).filter((b) => (b.until ?? 0) > now);

  // stamina
  const regenH = STAMINA_REGEN_HOURS / (st.subMods.stRegen ?? 1);
  const ticks = Math.floor((now - (c.stAt ?? now)) / (regenH * HOUR));
  if (ticks > 0) {
    const before = c.st;
    c.st = Math.min(st.staminaMax, c.st + ticks);
    c.stAt = (c.stAt ?? now) + ticks * regenH * HOUR;
    if (c.st >= st.staminaMax) c.stAt = now;
    out.stamina = c.st - before;
  }
  if (c.st > st.staminaMax) c.st = st.staminaMax;

  // toxicity decay
  const toxDays = (now - (c.toxAt ?? now)) / DAY;
  if (toxDays > 0 && c.tox > 0) {
    c.tox = Math.max(0, c.tox - toxDays * TOX_DECAY_PER_DAY);
  }
  c.toxAt = now;

  // 到期的减益直接删掉：留着空壳会让「状态」那一行一直挂在洞府卡上（显示成「—」），
  // 玩家看不出它到底还在不在。
  if (c.dbf) for (const k of Object.keys(c.dbf)) if ((c.dbf[k] ?? 0) <= now) delete c.dbf[k];

  // passive recovery: hp/mp regenerate fully over one hour of rest
  const restH = elapsed / HOUR;
  c.hpP = Math.min(1, (c.hpP ?? 1) + restH);
  c.mpP = Math.min(1, (c.mpP ?? 1) + restH);

  // lifespan
  const age = ageOf(c, now);
  const life = lifespanOf(c, st);
  if (age >= life && c.r < ASCEND_REALM) {
    c.dead = { t: now, age, cause: "寿元耗尽" };
    out.died = true;
  }
  return out;
}

export function summary(c, now) {
  const st = deriveStats(c);
  const need = xpNeed(c);
  return {
    uid: c.uid, name: c.name, r: c.r, s: c.s, realm: realmName(c.r, c.s), xp: Math.round(c.xp), need,
    pct: Math.min(100, Math.round((c.xp / need) * 100)), canBt: c.xp >= need,
    root: c.root, path: c.path, sub: c.sub, wu: c.wu, ls: Math.round(c.ls), st: c.st, stMax: st.staminaMax,
    hp: Math.round(st.hp * c.hpP), mp: Math.round(st.mp * c.mpP), stats: st,
    tox: Math.round(c.tox), age: ageOf(c, now), life: lifespanOf(c, st), lives: c.lives, legacy: c.legacy,
    gf: c.gf, eqArts: c.eqArts, eq: c.eq, pet: c.pet, array: c.array, sect: c.sect, sectLv: c.sectLv,
    daily: c.daily, dbf: c.dbf, buffs: c.buffs, dead: c.dead, ascended: c.ascended, title: c.title,
    season: c.season, trib: c.trib ? { n: c.trib.n, i: c.trib.i, hp: c.trib.hp, mp: c.trib.mp, target: c.trib.target } : null,
    ev: c.ev ? c.ev.id : null, rerolls: c.rerolls, breathAt: c.breathAt, now, vip: c.vip | 0,
    farm: farmBadge(c, now),
    dg: c.dg ? c.dg.f : 0, wx: c.wx && c.wx.d === dayKey(now) ? c.wx.sc : 0,
  };
}
// 灵田 badge for every screen (the full view comes from homeView). Kept here so char.js needs no import.
function farmBadge(c, now) {
  const plots = c.farm?.plots ?? [];
  let alert = 0, ready = 0;
  for (const p of plots) {
    if (!p) continue;
    if (p.ev || (p.hurt ?? 0) >= 2) alert++;
    else if (now >= p.ready) ready++;
  }
  return { n: plots.length, alert, ready };
}

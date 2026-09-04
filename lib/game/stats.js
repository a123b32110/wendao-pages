import { REALMS, ASCEND_REALM } from "../data/realms.js";
import { rootInfo } from "../data/roots.js";
import { pathOf, subOf } from "../data/paths.js";
import { gongfaOf, artOf } from "../data/skills.js";
import { itemOf } from "../data/items.js";
import { HOUR } from "./time.js";

export const OFFLINE_CAP_HOURS = [12, 24, 36];
export const STAMINA_MAX = 10;
export const STAMINA_REGEN_HOURS = 0.5;
export const TOX_DECAY_PER_DAY = 10;
export const STAMINA_PILL_DAILY = 2; // 辟谷丹一天最多两颗：10 点桶 + 10 点丹 = 正好够跑满 20 次
export const TOX_MAX = 100;

export function basePower(r, s) {
  if (r >= ASCEND_REALM) return REALMS[REALMS.length - 1].power * 3;
  return REALMS[r].power * (1 + 0.12 * s);
}

// 灵兽相对主人的攻击 / 气血倍率。远行中的灵兽不上场，倍率为 0。
export function petCombatMult(c, petMod = 1) {
  const p = c.pet;
  if (!p || p.trip) return { atk: 0, hp: 0 };
  const lvm = (1 + (p.lv ?? 0) * 0.1) * [1, 1.3, 1.69][Math.min(2, p.ev ?? 0)];
  return { atk: (p.atk ?? 0) * lvm * petMod, hp: (p.hp ?? 0) * lvm * petMod };
}
// 灵兽给战力的加成。系数由 tools/sim-pet.mjs 二分校准：一只刚孵的灵狐约 +1%，
// 满级化形的麒麟约 +60%。不算进战力的话，论道选人和榜单会低估带兽的人一大截。
export function petPowerBonus(c, petMod = 1) {
  const m = petCombatMult(c, petMod);
  return Math.max(0, Math.min(0.6, 0.11 * (m.atk + m.hp) / 2 - 0.05));
}

function mods(c) {
  const p = pathOf(c.path)?.mods ?? {};
  const sub = subOf(c.sub)?.mods ?? {};
  const gf = gongfaOf(c.gf);
  const gm = gf.mods ?? {};
  return { p, sub, gf, gm };
}

export function equipStats(c) {
  const out = { hp: 0, atk: 0, def: 0, mp: 0, spd: 0, crit: 0, rate: 0, spell: 0, bt: 0, trib: 0, elem: null };
  const artifactMult = pathOf(c.path)?.mods?.artifact ?? 1;
  for (const slot of ["w", "a", "r"]) {
    const iid = c.eq?.[slot];
    if (!iid) continue;
    const it = (c.inv?.arts ?? []).find((a) => a.iid === iid);
    if (!it) continue;
    const def = itemOf(it.id);
    if (!def) continue;
    const qm = 1 + (it.q - 1) * 0.08; // quality stars 1-5
    for (const [k, v] of Object.entries(def.st ?? {})) {
      if (k === "rate" || k === "crit" || k === "spell" || k === "bt") out[k] += v * qm;
      else out[k] += v * qm * artifactMult;
    }
    for (const af of it.af ?? []) {
      if (af.st === "rate" || af.st === "crit" || af.st === "spell") out[af.st] += af.v;
      else out[af.st] += af.v * artifactMult;
    }
    for (const rn of it.rn ?? []) {
      if (rn.st === "rate" || rn.st === "crit" || rn.st === "spell") out[rn.st] += rn.v;
      else out[rn.st] += rn.v * artifactMult;
    }
    if (def.trib) out.trib += def.trib;
    if (slot === "w" && def.elem) out.elem = def.elem;
  }
  return out;
}

// Full derived stats for the character. Pure; called on every request.
export function deriveStats(c) {
  const { p, sub, gf, gm } = mods(c);
  const P = basePower(c.r, c.s);
  const eq = equipStats(c);
  const legacyMult = 1 + Math.min(1.0, (c.legacy ?? 0) * 0.02);
  const wuMult = 1 + Math.min(0.5, (c.wu ?? 0) * 0.01);

  let hp = 10 * P * (p.hp ?? 1) * (gm.hp ?? 1) * legacyMult + eq.hp;
  let atk = P * (p.atk ?? 1) * (gm.atk ?? 1) * legacyMult + eq.atk;
  let def = 0.5 * P * (p.def ?? 1) * (gm.def ?? 1) * legacyMult + eq.def;
  let mp = 5 * P * (p.mp ?? 1) * (gm.mp ?? 1) + eq.mp;
  let spd = (10 + 6 * c.r + c.s) * (p.spd ?? 1) * (gm.spd ?? 1) + eq.spd;
  let crit = 0.05 + (p.crit ?? 0) + (gm.crit ?? 0) + eq.crit;
  let spell = 1 + ((p.spell ?? 1) - 1) + ((gm.spell ?? 1) - 1) + eq.spell;

  // debuffs
  const now = c._now ?? 0;
  const inj = (c.dbf?.injury ?? 0) > now;
  const heart = (c.dbf?.heart ?? 0) > now;
  if (inj) { hp *= 0.7; atk *= 0.7; def *= 0.7; }
  if (heart) { mp *= 0.7; crit = Math.max(0, crit - 0.03); }

  // cultivation rate multiplier
  const root = rootInfo(c.root);
  let rate = root.mult;
  let gfRate = gf.rate;
  if (gf.zaBonus && (c.root.t === "za" || c.root.t === "si")) gfRate *= gf.zaBonus;
  // an element-aligned gongfa with matching root resonates
  if (gf.elem && c.root.e.includes(gf.elem)) gfRate *= 1.1;
  rate *= gfRate;
  rate *= p.rate ?? 1;
  rate *= sub.rate ?? 1;
  rate *= 1 + eq.rate;
  rate *= [1, 1.05, 1.15][c.array ?? 0];
  rate *= wuMult * legacyMult;
  rate *= 1 + Math.min(0.2, (c.sectLv ?? 0) * 0.02) + (c.sectB?.cj ?? 0) * 0.01;
  if ((c.dbf?.qi ?? 0) > now) rate *= 0.5; // 走火入魔
  if (inj) rate *= 0.6;
  if (heart) rate *= 0.75;
  if ((c.tox ?? 0) > 70) rate *= 0.6;
  else if ((c.tox ?? 0) > 40) rate *= 0.85;

  const bt = (gf.bt ?? 0) + eq.bt + Math.min(0.1, (c.wu ?? 0) * 0.005);
  const trib = (gf.trib ?? 0) + eq.trib + (c.flags?.trib_insight ? 0.05 : 0);
  const lifeMult = (p.life ?? 1) * (gm.life ?? 1);
  const staminaMax = STAMINA_MAX + (sub.stamina ?? 0);

  const elem = eq.elem ?? gf.elem ?? c.root.e[0] ?? null;
  const power = Math.round((hp / 10 + atk * 2 + def * 2 + mp / 5 + spd * 3 + crit * 500) * (1 + petPowerBonus(c, p.pet ?? 1)));

  return {
    hp: Math.round(hp), atk: Math.round(atk), def: Math.round(def), mp: Math.round(mp), spd: Math.round(spd),
    crit: +crit.toFixed(3), spell: +spell.toFixed(2), rate: +rate.toFixed(3), ratePerHour: Math.round(REALMS[Math.min(c.r, REALMS.length - 1)].rate * rate),
    bt: +bt.toFixed(3), trib: +trib.toFixed(2), lifeMult, staminaMax, elem, power,
    pathMods: p, subMods: sub, injured: inj, heart, qi: (c.dbf?.qi ?? 0) > now,
  };
}

export function buildUnit(c, st, opts = {}) {
  const arts = (c.eqArts ?? ["a_slash"]).map(artOf);
  let pet = null;
  if (c.pet && !c.pet.trip) {
    const m = petCombatMult(c, st.pathMods.pet ?? 1);
    pet = {
      name: c.pet.name, elem: c.pet.elem,
      atk: Math.round(st.atk * m.atk),
      maxHp: Math.round(st.hp * m.hp),
    };
    pet.hp = Math.round(pet.maxHp * (opts.petFrac ?? c.pet.hpP ?? 1));
  }
  return {
    name: c.name, uid: c.uid,
    hp: Math.round(st.hp * (opts.hpFrac ?? c.hpP ?? 1)), maxHp: st.hp,
    mp: Math.round(st.mp * (opts.mpFrac ?? c.mpP ?? 1)), maxMp: st.mp,
    atk: st.atk, def: st.def, spd: st.spd, crit: st.crit, spell: st.spell, elem: st.elem,
    arts, pet, path: c.path, interrupt: st.pathMods.interrupt ?? 0, array: st.pathMods.array ?? 0,
    talis: st.pathMods.talis ?? 1,
  };
}

// Snapshot of a build for arena defenders (compact, stored in shared kv).
export function buildSnapshot(c, st) {
  const u = buildUnit(c, st, { hpFrac: 1, mpFrac: 1 });
  return {
    hp: u.maxHp, mp: u.maxMp, atk: u.atk, def: u.def, spd: u.spd, crit: u.crit, sp: u.spell, el: u.elem,
    ar: (c.eqArts ?? ["a_slash"]).slice(0, 3), pet: u.pet ? { n: u.pet.name, e: u.pet.elem, a: u.pet.atk, h: u.pet.maxHp } : null,
    pa: c.path ?? null, hs: c.sectB?.hs || undefined,
  };
}

export function unitFromSnapshot(p) {
  const b = p.b ?? {};
  const pet = b.pet ? { name: b.pet.n, elem: b.pet.e, atk: b.pet.a, hp: b.pet.h, maxHp: b.pet.h } : null;
  return {
    name: p.n, uid: p.uid, hp: b.hp ?? 100, maxHp: b.hp ?? 100, mp: b.mp ?? 50, maxMp: b.mp ?? 50,
    atk: b.atk ?? 10, def: Math.round((b.def ?? 5) * (1 + (b.hs ?? 0) * 0.01)), spd: b.spd ?? 10, crit: b.crit ?? 0.05, spell: b.sp ?? 1, elem: b.el ?? null,
    arts: (b.ar ?? ["a_slash"]).map(artOf), pet, path: b.pa ?? null, interrupt: 0, array: 0, talis: 1,
  };
}

export function offlineCapMs(c) {
  return (OFFLINE_CAP_HOURS[Math.min(2, c.array ?? 0)] + ((c.vip | 0) >= 2 ? 4 : 0)) * HOUR;
}

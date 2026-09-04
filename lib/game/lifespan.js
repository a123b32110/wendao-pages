import { ASCEND_REALM, realmName } from "../data/realms.js";
import { GONGFA } from "../data/skills.js";
import { newCharacter, ageOf } from "./char.js";

// Legacy persists across lives in the private key `legacy`.
export function legacyGain(c) {
  let pts = c.r * 2 + Math.floor(c.s / 2) + (c.legacyGain ?? 0) + (c.legacyBonus ?? 0);
  if (c.ascended) pts += 20;
  return pts;
}

export function canRebirth(c) {
  return !!c.dead || !!c.ascended;
}

// Build the next life. Returns { c: newChar, legacy: updatedLegacy, summary }.
export function rebirth(c, legacy, now, seed, name) {
  const gain = legacyGain(c);
  const best = legacy?.best ?? { r: 0, s: 0 };
  const bestNow = c.r > best.r || (c.r === best.r && c.s > best.s) ? { r: c.r, s: c.s } : best;
  // keep the two highest-grade non-path gongfa and every art learned
  const keepGf = c.gfs.map((id) => GONGFA.find((g) => g.id === id)).filter((g) => g && !g.path && !g.demon).sort((a, b) => b.grade - a.grade).slice(0, 2).map((g) => g.id);
  const keep = { gf: [...new Set([...(legacy?.keep?.gf ?? []), ...keepGf])].slice(0, 4), arts: [...new Set([...(legacy?.keep?.arts ?? []), ...c.arts])].slice(0, 12) };
  // 先摊开旧 legacy 再覆盖：礼包领取记录（gifts）、累计供奉（en）这些账号级的账不能在转世时丢——
  // v47 复审发现旧写法只列了几个字段，转世一次就把补偿礼包再领一遍。
  const nextLegacy = {
    ...(legacy ?? {}),
    pts: (legacy?.pts ?? 0) + gain, lives: (legacy?.lives ?? 0) + 1, best: bestNow, keep,
    awards: legacy?.awards ?? {}, history: [...(legacy?.history ?? []), { name: c.name, r: c.r, s: c.s, age: ageOf(c, now), t: now, asc: !!c.ascended, cause: c.dead?.cause ?? (c.ascended ? "飞升" : "转世") }].slice(-20),
    ach: legacy?.ach ?? {}, uid: c.uid, t: now,
  };
  const nc = newCharacter({ uid: c.uid, name, now, seed, legacy: nextLegacy });
  nc.legacy = nextLegacy.pts;
  // private ledgers that pair with shared keys (which survive rebirth) must survive too, or rewards double-claim
  nc.aucDone = c.aucDone ?? {}; nc.escrow = c.escrow ?? {}; nc.escrowEnd = c.escrowEnd ?? {}; nc.aucN = c.aucN ?? 0;
  nc.bossClaim = c.bossClaim ?? 0; nc.season.n = c.season?.n ?? 0; nc.sk = c.sk; nc.enN = c.enN ?? 0; nc.vip = c.vip ?? 0;
  // 悬赏连击与宗门周结算是跨世的账：转世不该白送一次连击，也不该重复领上周的宗务
  nc.bountyStreak = c.bountyStreak ?? 0; nc.bountyLast = c.bountyLast ?? 0; nc.sectWeek = c.sectWeek ?? -1;
  return { c: nc, legacy: nextLegacy, summary: { gain, total: nextLegacy.pts, lives: nextLegacy.lives, best: realmName(bestNow.r, bestNow.s) } };
}

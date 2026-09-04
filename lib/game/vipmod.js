// 会员数值表（v51）：白银/黄金/钻石/王者逐级递增，各处权益只读这一张表。
// 独立成文件是为了让 stats.js 也能引用而不与 inventory.js 成环。
export const VIP_MOD = [
  { rate: 1, off: 0, exp: 20, drop: 1, bt: 0, trib: 0, en: 5, enRate: 1, disc: 1, dg: 0, farm: 0, pet: 1, vs: 0, q: 1, gift: 0 },
  { rate: 1.05, off: 2, exp: 25, drop: 1, bt: 0, trib: 0, en: 5, enRate: 1, disc: 1, dg: 0, farm: 0, pet: 1, vs: 4, q: 2, gift: 300 },
  { rate: 1.1, off: 6, exp: 30, drop: 1.1, bt: 0.03, trib: 0, en: 6, enRate: 1.1, disc: 0.95, dg: 1, farm: 0, pet: 1.5, vs: 4, q: 2, gift: 1000 },
  { rate: 1.2, off: 12, exp: 40, drop: 1.25, bt: 0.05, trib: 0.1, en: 8, enRate: 1.25, disc: 0.9, dg: 1, farm: 1, pet: 1.5, vs: 6, q: 2, gift: 3000 },
  { rate: 1.35, off: 24, exp: 50, drop: 1.5, bt: 0.08, trib: 0.2, en: 10, enRate: 1.5, disc: 0.85, dg: 2, farm: 2, pet: 2, vs: 8, q: 3, gift: 8000 },
];
export const vipMod = (c) => VIP_MOD[Math.max(0, Math.min(VIP_MOD.length - 1, c?.vip | 0))];

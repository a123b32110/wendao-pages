import { ITEMS, itemOf } from "../data/items.js";
import { makeRng } from "./rng.js";
import { TIER_OF_REALM } from "../data/monsters.js";
import { addStack, rollArtifact } from "./inventory.js";

// 会员等级：按**累计供奉能量**（legacy.en，跨转世永久）升。平台不提供论坛会员等级
// （ctx.user 只有 id/username/avatar），所以「白银/黄金/钻石/王者」只能在游戏内自己记。
// 每天最多供奉 5 点 → 1 / 4 / 10 / 20 天可达。
export const VIP = [[0, "凡人"], [5, "白银"], [20, "黄金"], [50, "钻石"], [100, "王者"]];
export const VIP_PERKS = [
  [],
  ["坊市补货 +1 次/日", "每日多一张悬赏"],
  ["离线修炼上限 +4 小时", "拍卖手续费减半", "可佩戴会员称号"],
  ["秘境每日 +1 次", "灵田 +1 块", "坊市九五折"],
  ["能量兑换率 ×1.2", "榜单与顶栏金色徽记"],
];
export function vipLevel(en) {
  let lv = 0;
  for (let i = 0; i < VIP.length; i++) if ((en | 0) >= VIP[i][0]) lv = i;
  return lv;
}
// 请求开头把等级挂在 c.vip 上（每次重算，存档里带着也无妨），各处权益只看这一个数
export const vipOf = (c) => Math.max(0, Math.min(VIP.length - 1, c?.vip | 0));
export function vipView(c, legacy) {
  const en = legacy?.en | 0, lv = vipLevel(en);
  const next = lv + 1 < VIP.length ? VIP[lv + 1] : null;
  return { lv, name: VIP[lv][1], en, next: next ? next[1] : null, need: next ? next[0] : null, perks: VIP_PERKS.slice(1, lv + 1).flat(), all: VIP.map((v, i) => ({ lv: i, name: v[1], en: v[0], perks: VIP_PERKS[i] })) };
}
export const vipTitle = (lv) => (lv >= 2 ? `${VIP[lv][1]}道友` : null);

// 珍宝阁：按等级解锁的专属货架，每日 4 格，比坊市贵但保证有货。不占共享键。
export const VS_SLOTS = 4;
const VS_POOL = [
  [], // 凡人：无
  [["seed+1", 3], ["p_qingdu", 2], ["rune", 1]],
  [["p_xiqi", 3], ["t_dun", 2], ["egg+1", 1]],
  [["m_jinghe", 2], ["r_ji", 1], ["r_tu", 1]],
  [["art", 1]],
];
const tierOf = (c) => TIER_OF_REALM[Math.max(0, Math.min(8, c.r | 0))] ?? 0;
function resolve(spec, c, rng) {
  const t = tierOf(c);
  if (spec === "seed+1") { const p = ITEMS.filter((i) => i.fx?.seed && i.t === Math.min(5, t + 1)); return p.length ? rng.pick(p).id : null; }
  if (spec === "rune") { const p = ITEMS.filter((i) => i.fx?.rune && i.t <= Math.max(1, t)); return p.length ? rng.pick(p).id : null; }
  if (spec === "egg+1") { const p = ITEMS.filter((i) => i.k === "egg" && i.t <= Math.min(4, t + 1)); return p.length ? rng.pick(p).id : null; }
  if (spec === "art") { const p = ITEMS.filter((i) => i.k === "art" && i.t === Math.min(5, t)); return p.length ? rng.pick(p).id : null; }
  return spec;
}
export function vshopStock(c, day) {
  const lv = vipOf(c);
  const rng = makeRng(`vshop:${day}:${c.uid}:${c.r | 0}`);
  const pool = VS_POOL.slice(1, lv + 1).flat();
  const picks = [];
  const seen = new Set();
  let guard = 0;
  while (picks.length < VS_SLOTS && pool.length && guard++ < 40) {
    const [spec, n] = rng.pick(pool);
    const id = resolve(spec, c, rng);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const d = itemOf(id);
    picks.push({ idx: picks.length, id, n, price: Math.round(d.v * 1.6) });
  }
  return picks;
}
export function vshopView(c, day) {
  const lv = vipOf(c);
  const bought = c.daily.vshop ?? {};
  return {
    lv, name: VIP[lv][1], unlockAt: VIP[1][0],
    stock: vshopStock(c, day).map((s) => { const d = itemOf(s.id); return { ...s, left: Math.max(0, s.n - (bought[s.id] ?? 0)), name: d.name, k: d.k, t: d.t, desc: d.desc }; }),
  };
}
export function vshopBuy(c, idx, day, rng) {
  const s = vshopStock(c, day)[Number(idx)];
  if (!s) return { ok: false, msg: "没有这件珍宝" };
  c.daily.vshop = c.daily.vshop ?? {};
  if ((c.daily.vshop[s.id] ?? 0) >= s.n) return { ok: false, msg: "已售罄" };
  if (c.ls < s.price) return { ok: false, msg: "灵石不足" };
  const d = itemOf(s.id);
  if (d.k === "art") {
    const it = rollArtifact(c, s.id, rng);
    if (!it) return { ok: false, msg: "法宝匣已满" };
    if ((it.q ?? 1) < 2) it.q = 2; // 珍宝阁的法宝保底两星
  } else if (!addStack(c, s.id, 1)) return { ok: false, msg: "行囊已满" };
  c.ls -= s.price;
  c.daily.vshop[s.id] = (c.daily.vshop[s.id] ?? 0) + 1;
  return { ok: true, msg: `珍宝阁购得 ${d.name}，花费 ${s.price} 灵石` };
}

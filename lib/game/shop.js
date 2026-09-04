import { ITEMS, itemOf } from "../data/items.js";
import { makeRng } from "./rng.js";
import { subOf } from "../data/paths.js";
import { TIER_OF_REALM } from "../data/monsters.js";
import { addStack, rollArtifact } from "./inventory.js";

export const SHOP_SLOTS = 10;
export const SHOP_REFRESH_DAILY = 3;
// 刷新一次的价钱：按境界涨，且一次比一次贵
export const refreshCost = (c) => Math.round((80 + 60 * c.r) * ((c.daily.shopRe ?? 0) + 1));

// Daily system market, seeded per day and realm bracket so everyone of a realm sees the same stock.
// 补货次数（shopRe）也进种子：刷新过的人看到的是自己那一版货架。
export function shopStock(c, day) {
  const r = TIER_OF_REALM[Math.max(0, Math.min(8, c.r | 0))];
  const re = c.daily?.shopRe ?? 0;
  const rng = makeRng(`shop:${day}:${r}${re ? ":" + re + ":" + c.uid : ""}`);
  const maxT = Math.min(5, r + 1); // item tiers stop at 5
  const pool = ITEMS.filter((i) => i.t <= maxT && i.k !== "misc" || (i.k === "misc" && (i.fx?.array || i.fx?.seed) && i.t <= maxT));
  const weighted = pool.map((i) => [i, i.t === maxT ? 1 : i.t === maxT - 1 ? 3 : 2]);
  const picks = [];
  const seen = new Set();
  const add = (it) => {
    if (!it || seen.has(it.id)) return false;
    seen.add(it.id);
    const n = it.k === "mat" ? rng.int(3, 8) : it.k === "pill" || it.k === "tal" ? rng.int(2, 5) : it.fx?.seed ? rng.int(5, 10) : 1;
    picks.push({ idx: picks.length, id: it.id, n, left: n, price: Math.round(it.v * 1.25) });
    return true;
  };
  // 每天至少留两格给种子：一格 5-10 颗。灵田最多五块、两小时就熟一轮，
  // 旧的「一格 2-5 颗」连一天都不够种（玩家原话：「没天都不够种」）。
  const seeds = pool.filter((i) => i.fx?.seed);
  if (seeds.length) { add(rng.pick(seeds)); add(rng.pick(seeds)); }
  let guard = 0;
  while (picks.length < SHOP_SLOTS && guard++ < 60) add(rng.weighted(weighted));
  return picks;
}

// 已买数量按「哪一批货 + 物品 id」记：第一批就是物品 id 本身（老存档不用迁），补货后的批次带上批号。
// 旧写法只按物品 id 记，于是上一批买光的仙露在补货后的货架上直接显示「余 0」——
// 花了灵石请商队，卸下来的却是空格子（玩家原话：「怎么能刷出剩 0 个的」）。
const shopKey = (c, id) => ((c.daily.shopRe ?? 0) ? `${c.daily.shopRe}:${id}` : id);

export function shopView(c, day) {
  const stock = shopStock(c, day);
  const bought = c.daily.shop ?? {}; // stale numeric slot keys are simply ignored
  const disc = subOf(c.sub)?.mods?.discount ?? 1;
  return stock.map((s) => {
    const d = itemOf(s.id);
    return { ...s, left: Math.max(0, s.n - (bought[shopKey(c, s.id)] ?? 0)), price: Math.round(s.price * disc), name: d.name, k: d.k, t: d.t, desc: d.desc, fx: d.fx ?? null, st: d.st ?? null, slot: d.slot ?? null };
  });
}

// 换一批货：新批次的存货是满的（补货花的钱买的就是这个）。
export function shopRefresh(c) {
  const used = c.daily.shopRe ?? 0;
  if (used >= SHOP_REFRESH_DAILY) return { ok: false, msg: `今日已请商队补货 ${SHOP_REFRESH_DAILY} 次` };
  const cost = refreshCost(c);
  if (c.ls < cost) return { ok: false, msg: `请商队跑一趟需 ${cost} 灵石` };
  c.ls -= cost;
  c.daily.shopRe = used + 1;
  return { ok: true, msg: `商队又卸下一批货（花费 ${cost} 灵石，今日还可补货 ${SHOP_REFRESH_DAILY - used - 1} 次）` };
}

export function buy(c, idx, day, rng) {
  idx = Number(idx);
  const stock = shopStock(c, day);
  const s = stock[idx];
  if (!s) return { ok: false, msg: "没有这件货" };
  // counted per item id, not per slot: a breakthrough re-seeds the stock and remaps the slots mid-day
  c.daily.shop = c.daily.shop ?? {};
  const key = shopKey(c, s.id);
  if ((c.daily.shop[key] ?? 0) >= s.n) return { ok: false, msg: "已售罄" };
  const disc = subOf(c.sub)?.mods?.discount ?? 1;
  const price = Math.round(s.price * disc);
  if (c.ls < price) return { ok: false, msg: "灵石不足" };
  const d = itemOf(s.id);
  if (d.k === "art") {
    const it = rollArtifact(c, s.id, rng);
    if (!it) return { ok: false, msg: "法宝匣已满" };
  } else if (!addStack(c, s.id, 1)) return { ok: false, msg: "行囊已满" };
  c.ls -= price;
  c.daily.shop[key] = (c.daily.shop[key] ?? 0) + 1;
  return { ok: true, msg: `买下 ${d.name}，花费 ${price} 灵石` };
}

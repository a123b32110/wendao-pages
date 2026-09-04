// 灵田药圃: sow a seed, come back hours later. Growth events are rolled deterministically per
// elapsed hour from a seeded rng, so the result never depends on when the player happens to look.
// Imports stay limited to inventory/items/time/rng — explore.js pulls FM_SEED_BY_TIER from here.
import { itemOf } from "../data/items.js";
import { addStack, countOf, removeItems } from "./inventory.js";
import { makeRng } from "./rng.js";
import { HOUR } from "./time.js";

export const FM_MAX = 5;
export const FM_EV_CHANCE = 0.18;
export const FM_EV_GRACE = 2 * HOUR;
// a won fight drops the seed of its own tier 15% of the time (explore.js)
export const FM_SEED_BY_TIER = ["s_lingcao", "s_hanlian", "s_longxue", "s_leijing", "s_xianlu", "s_xianlu", "s_xianlu"];
// mutation: one tier above what the seed normally yields
export const FM_MUT = { m_lingcao: "m_hanlian", m_hanlian: "m_longxue", m_shuijing: "m_xuanjin", m_longxue: "m_leijing", m_leijing: "m_xianlu", m_xianlu: "m_gangfeng" };
export const FM_EVENTS = [
  { k: "chong", n: "虫害", cost: {}, fix: "你把叶背的虫卵一颗颗捻掉。" },
  { k: "han", n: "干旱", cost: { mp: 0.1 }, fix: "你引灵力化雨，田垄重新湿润。" },
  { k: "luan", n: "灵气紊乱", cost: { mp: 0.2 }, fix: "你压住乱窜的地气，灵脉复归平顺。" },
  { k: "que", n: "灵雀偷食", cost: { ls: [5, 20, 60, 200, 600] }, fix: "你撒了一把灵石碎屑，灵雀啄食过后飞走了。" },
];
export function fmEvOf(k) {
  return FM_EVENTS.find((e) => e.k === k) ?? FM_EVENTS[0];
}
function fmEvCost(e, t) {
  if (e.cost.ls) return { ls: e.cost.ls[Math.max(0, Math.min(e.cost.ls.length - 1, t | 0))] };
  if (e.cost.mp) return { mp: e.cost.mp };
  return {};
}
function fmCostLabel(cost) {
  if (cost.ls) return `${cost.ls} 灵石`;
  if (cost.mp) return `灵力 ${Math.round(cost.mp * 100)}%`;
  return "免费";
}
// plots unlock with realm and with the better 聚灵阵; a plot that still holds a crop is never dropped.
export function fmEnsure(c) {
  const f = (c.farm = c.farm ?? { n: 0, plots: [] });
  if (!Array.isArray(f.plots)) f.plots = [];
  const want = Math.min(FM_MAX, 2 + (c.r >= 1 ? 1 : 0) + (c.r >= 2 ? 1 : 0) + ((c.array ?? 0) >= 2 ? 1 : 0) + ((c.vip | 0) >= 3 ? 1 : 0));
  while (f.plots.length < want) f.plots.push(null);
  while (f.plots.length > want && f.plots[f.plots.length - 1] == null) f.plots.pop();
  f.n = f.plots.length;
  return f;
}
function fmPlot(c, i) {
  const f = fmEnsure(c);
  const k = Math.round(Number(i));
  if (!Number.isFinite(k) || k < 0 || k >= f.plots.length) return { f, k: -1, p: null };
  return { f, k, p: f.plots[k] };
}

// Runs in housekeeping right after settle(). `prevLast` is c.last before settle, so a crop that
// ripened while the player was away is announced exactly once.
export function farmTick(c, now, notes, prevLast) {
  // 已故的角色 settle 会提前返回，c.last 从此定格 —— 成熟通知的 (prevLast, now] 区间就永远成立，
  // 于是每一次请求都会再弹一遍。人都没了，田里的事也不必再报。
  if (c.dead) return;
  const f = fmEnsure(c);
  for (let i = 0; i < f.plots.length; i++) {
    const p = f.plots[i];
    if (!p) continue;
    p.hurt = p.hurt ?? 0;
    p.chk = p.chk ?? 0;
    const name = itemOf(p.seed)?.name ?? "作物";
    const totalH = Math.max(1, Math.round((p.ready - p.at) / HOUR));
    // 扫到成熟那一刻为止（而不是前一小时）：生在最后一个可扫描小时的事件否则永远等不到过期，
    // 于是 2 小时、4 小时的作物实测 0% 会枯萎 —— 卡片上「受损两次就枯了」对它们是句假话。
    const hmax = Math.min(Math.floor((now - p.at) / HOUR), totalH);
    for (let hh = p.chk + 1; hh <= hmax && p.hurt < 2; hh++) {
      const ts = p.at + hh * HOUR;
      // 处理期限最迟到收成那一刻：短生长期的作物不会因为「还没到两小时」而白拿豁免
      if (p.ev && ts >= Math.min(p.ev.at + FM_EV_GRACE, p.ready)) { p.ev = null; p.hurt++; }
      if (!p.ev && p.hurt < 2 && hh < totalH) {
        const rng = makeRng(`farm:${c.uid}:${p.at}:${hh}`);
        if (rng.chance(FM_EV_CHANCE)) {
          const e = FM_EVENTS[rng.int(0, FM_EVENTS.length - 1)];
          p.ev = { k: e.k, at: ts, seen: 1 };
          if (notes) notes.push({ k: "farm", v: `灵田 ${i + 1} 的${name}遭了${e.n}，两小时内不理会便会受损。` });
        }
      }
      p.chk = hh;
    }
    if (p.hurt >= 2) p.ev = null;
    else if (notes && p.ready > (prevLast ?? 0) && p.ready <= now) notes.push({ k: "farm", v: `灵田 ${i + 1} 的${name}熟了。` });
  }
}

export function farmView(c, now) {
  const f = fmEnsure(c);
  const plots = f.plots.map((p, i) => {
    if (!p) return { i, seed: null };
    const def = itemOf(p.seed);
    const t = def?.t ?? 0;
    const mat = def?.fx?.seed ?? null;
    const mdef = mat ? itemOf(mat) : null;
    const span = Math.max(1, p.ready - p.at);
    const withered = (p.hurt ?? 0) >= 2;
    const e = p.ev ? fmEvOf(p.ev.k) : null;
    return {
      i, seed: p.seed, name: def?.name ?? "作物", mat, matName: mdef?.name ?? "?", t,
      pct: Math.max(0, Math.min(100, Math.round(((now - p.at) / span) * 100))),
      left: Math.max(0, p.ready - now), ready: now >= p.ready && !withered,
      ev: e ? { k: e.k, n: e.n, left: Math.max(0, p.ev.at + FM_EV_GRACE - now), cost: fmCostLabel(fmEvCost(e, t)) } : null,
      hurt: p.hurt ?? 0, withered,
    };
  });
  const seeds = Object.entries(c.inv.stack).map(([id, n]) => ({ id, n, d: itemOf(id) }))
    .filter((x) => x.d && x.d.fx && x.d.fx.seed)
    .map((x) => ({ id: x.id, name: x.d.name, n: x.n, t: x.d.t, h: x.d.fx.h, mat: itemOf(x.d.fx.seed)?.name ?? "?" }));
  return { n: f.plots.length, plots, seeds, alch: c.path === "dan" };
}

export function farmPlant(c, i, seedId, now) {
  const { f, k, p } = fmPlot(c, i);
  if (k < 0) return { ok: false, msg: "没有这块灵田" };
  if (p) return { ok: false, msg: "这块地里还长着东西" };
  const def = itemOf(String(seedId));
  if (!def || !def.fx || !def.fx.seed) return { ok: false, msg: "这不是种子" };
  if (countOf(c, def.id) < 1) return { ok: false, msg: "没有这种种子" };
  if ((def.t ?? 0) > c.r + 1) return { ok: false, msg: "境界不足，此种养不活" };
  removeItems(c, [[def.id, 1]]);
  const h = Math.max(1, def.fx.h ?? 2);
  f.plots[k] = { seed: def.id, at: now, ready: now + h * HOUR, ev: null, hurt: 0, chk: 0 };
  return { ok: true, msg: `${def.name}已下地，${h} 小时后可收。` };
}

export function farmTend(c, i) {
  const { k, p } = fmPlot(c, i);
  if (k < 0 || !p) return { ok: false, msg: "没有这块灵田" };
  if ((p.hurt ?? 0) >= 2) return { ok: false, msg: "这一茬已经枯了，清理了吧" };
  if (!p.ev) return { ok: false, msg: "这块田眼下无事" };
  const e = fmEvOf(p.ev.k);
  const cost = fmEvCost(e, itemOf(p.seed)?.t ?? 0);
  if (cost.mp !== undefined) {
    if ((c.mpP ?? 1) < cost.mp) return { ok: false, msg: "灵力不足" };
    c.mpP = Math.max(0, (c.mpP ?? 1) - cost.mp);
  }
  if (cost.ls !== undefined) {
    if (c.ls < cost.ls) return { ok: false, msg: "灵石不足" };
    c.ls -= cost.ls;
  }
  p.ev = null;
  return { ok: true, msg: e.fix };
}

export function farmHarvest(c, i, now, rng) {
  const { f, k, p } = fmPlot(c, i);
  if (k < 0 || !p) return { ok: false, msg: "没有这块灵田" };
  if ((p.hurt ?? 0) >= 2) return { ok: false, msg: "这一茬已经枯了，清理了吧" };
  if (now < p.ready) return { ok: false, msg: "还没到时候" };
  const def = itemOf(p.seed);
  const mdef = def?.fx?.seed ? itemOf(def.fx.seed) : null;
  if (!mdef) { f.plots[k] = null; return { ok: false, msg: "这一茬什么也没长出来" }; }
  const n = Math.max(1, rng.int(2, 4) - (p.hurt ?? 0) + (c.path === "dan" ? 1 : 0));
  const drops = [];
  drops.push({ id: mdef.id, n, name: mdef.name, t: mdef.t, lost: !addStack(c, mdef.id, n) });
  const mut = FM_MUT[mdef.id] ? itemOf(FM_MUT[mdef.id]) : null;
  if (mut && rng.chance(0.1)) drops.push({ id: mut.id, n: 1, name: mut.name, t: mut.t, lost: !addStack(c, mut.id, 1) });
  f.plots[k] = null;
  c.stats.harvests = (c.stats.harvests ?? 0) + 1;
  return { ok: true, msg: `收了 ${mdef.name}×${n}${drops.length > 1 ? `，土里还翻出一株${drops[1].name}` : ""}`, drops };
}

export function farmClear(c, i) {
  const { f, k, p } = fmPlot(c, i);
  if (k < 0 || !p) return { ok: false, msg: "这块地本就是空的" };
  f.plots[k] = null;
  return { ok: true, msg: "枯茎败叶已经清干净了。" };
}

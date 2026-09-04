import { ITEMS } from "../data/items.js";
import { addStack } from "./inventory.js";
import { makeRng } from "./rng.js";
import { TIER_OF_REALM } from "../data/monsters.js";

// 补偿礼包。发放记录写在 legacy（跨转世保留），一个账号只领一次。
// 加新一轮补偿时：往 GIFTS 里加一条，键名换新的即可，老玩家会照领。
export const GIFTS = [
  {
    key: "v34",
    title: "天机阁赔罪",
    // 补偿只发给「出事那会儿已经在玩」的人：之后新建的号没受这些罪，也就不必补。
    // （顺带让测试里新建的角色不会平白多出一包东西。）
    // 门槛是 v34 修好上线的那一刻（2026-09-04 03:33 北京时间）。第一版写成 8 月 26 日，
    // 把之后一周多才入坑、同样挨过这些 bug 的人全漏掉了（论坛上「我也没领到补偿」就是他们）。
    before: Date.UTC(2026, 8, 3, 19, 40),
    // 这一轮赔的是：拍卖行点了没反应、渡劫堆血白堆、突破罚得太狠、坊市种子不够。
    ls: (r) => 50000 + 15000 * r,
    wu: 5,
    items: [["t_bilei", 5], ["p_dingxin", 5], ["p_huixue", 10], ["p_huiling", 10], ["p_bigu", 5]],
    mats: 3, // 另抽三种本境界材料，各 5 个
    matN: 5,
    heal: true,
  },
];

// 返回 null 或 { title, lines[], ls, wu }
export function claimGift(c, legacy, now) {
  legacy.gifts = legacy.gifts ?? {};
  // 转世会把 created 换成转世那一刻，所以「已经转过世」的账号一律算老玩家
  const born = (legacy.lives ?? 0) >= 1 ? 0 : c.created ?? c.born ?? 0;
  // 礼包从 before 那一刻起才存在：之前的时间点（测试里的固定日期）什么也领不到
  const g = GIFTS.find((x) => !legacy.gifts[x.key] && (!x.before || (born < x.before && now >= x.before)));
  if (!g) return null;
  legacy.gifts[g.key] = now;
  const lines = [];
  const ls = typeof g.ls === "function" ? g.ls(c.r) : g.ls ?? 0;
  if (ls) { c.ls += ls; lines.push(`灵石 +${ls}`); }
  if (g.wu) { c.wu = (c.wu ?? 0) + g.wu; lines.push(`悟性 +${g.wu}`); }
  for (const [id, n] of g.items ?? []) if (addStack(c, id, n)) lines.push(`${ITEMS.find((i) => i.id === id)?.name ?? id} ×${n}`);
  if (g.mats) {
    const t = Math.min(5, TIER_OF_REALM[Math.max(0, Math.min(8, c.r | 0))]);
    const pool = ITEMS.filter((i) => i.k === "mat" && i.t <= t && i.t >= Math.max(0, t - 1));
    const rng = makeRng(`gift:${g.key}:${c.uid}`);
    const picked = new Set();
    for (let i = 0; i < g.mats && pool.length; i++) {
      const m = rng.pick(pool);
      if (picked.has(m.id)) continue;
      picked.add(m.id);
      if (addStack(c, m.id, g.matN ?? 3)) lines.push(`${m.name} ×${g.matN ?? 3}`);
    }
  }
  if (g.heal) {
    c.hpP = 1; c.mpP = 1; c.tox = 0; c.dbf = {};
    c.st = Math.max(c.st ?? 0, 10);
    lines.push("气血灵力尽复，丹毒清空，伤势与走火入魔一并抹去");
  }
  return { key: g.key, title: g.title, lines, ls, wu: g.wu ?? 0 };
}

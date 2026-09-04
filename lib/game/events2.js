import { HOUR, DAY } from "./time.js";

// 每日/每周活动：全部由时间推导，不占共享键、不加 bot 任务。按北京时间（UTC+8）算星期与钟点。
const CST = 8 * HOUR;
const cst = (now) => { const d = new Date(now + CST); return { wd: d.getUTCDay(), h: d.getUTCHours() }; };
// 周一/周四 双修日：修炼 ×1.5；周三 坊市集：坊市八折；周六/日 秘境开放：秘境 +1 次；每天 20-22 时 妖潮：游历掉落 ×1.5
export const EV_DAY = {
  1: { id: "shuangxiu", name: "双修日", desc: "修炼 ×1.5", rate: 1.5 },
  4: { id: "shuangxiu", name: "双修日", desc: "修炼 ×1.5", rate: 1.5 },
  3: { id: "fangshi", name: "坊市集", desc: "坊市八折", disc: 0.8 },
  6: { id: "mijing", name: "秘境开放", desc: "秘境 +1 次", dg: 1 },
  0: { id: "mijing", name: "秘境开放", desc: "秘境 +1 次", dg: 1 },
};
export const EV_HOUR = { from: 20, to: 22, id: "yaochao", name: "妖潮", desc: "游历掉落 ×1.5", drop: 1.5 };

export function dayEvent(now) {
  const { wd, h } = cst(now);
  const list = [];
  if (EV_DAY[wd]) list.push(EV_DAY[wd]);
  const hot = h >= EV_HOUR.from && h < EV_HOUR.to;
  if (hot) list.push(EV_HOUR);
  return {
    list: list.map((e) => ({ id: e.id, name: e.name, desc: e.desc })),
    rate: EV_DAY[wd]?.rate ?? 1, disc: EV_DAY[wd]?.disc ?? 1, dg: EV_DAY[wd]?.dg ?? 0, drop: hot ? EV_HOUR.drop : 1,
    next: hot ? null : `${EV_HOUR.from}:00 妖潮`,
  };
}
// 把 [from, now] 内的双修日按小时折成「额外小时数」（settle 里与丹药加速同一口径）
export function eventBonusHours(from, now) {
  let bonus = 0;
  let t = from;
  while (t < now) {
    const dayStart = Math.floor((t + CST) / DAY) * DAY - CST;
    const dayEnd = dayStart + DAY;
    const seg = Math.min(now, dayEnd) - t;
    const r = EV_DAY[new Date(t + CST).getUTCDay()]?.rate ?? 1;
    if (r > 1) bonus += (seg / HOUR) * (r - 1);
    t = dayEnd;
  }
  return bonus;
}
// 商店只有 day（UTC 日序号）：取当天正午的活动（北京时间白天）
export const dayEventOfDay = (day) => dayEvent(day * DAY + 4 * HOUR);

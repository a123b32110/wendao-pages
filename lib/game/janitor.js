import { byPrefix, delShared, pxKey, axKey, sxKey, auxKey } from "./shared.js";
import { dayKey, weekKey, DAY } from "./time.js";
import { ATK_KEEP } from "./arena.js";

// 平台限额（2026-08-25 在试玩安装上实测）：共享区一共 100 个键，单值 8KB，
// 单次调用 effects 约 20 条。撞上键数配额后**任何**新键写入都被整批顶回来 ——
// 新玩家建不了角色（要写 p:<uid>）、论道写不了来袭记录、连珠上不了榜。
// 所以这里把总量按「最没用的先删」压在警戒线之下，并且每轮只发有限几条删除
// （effects 也有条数限额，删太多同样会整批被拒）。
export const JAN_KEY_CAP = 100; // 平台实测硬顶
export const JAN_SOFT_CAP = 88; // 警戒线：压到这以下，给白天的 bd:/wx:/act: 留出余地
export const JAN_BYTE_CAP = 160 * 1024;
export const JAN_BOARD_KEEP = 50; // 往日榜单只留榜上真的看得见的那些（bossBoard 就取前 50）
export const JAN_AUCTION_DAYS = 3; // 吃紧时把已结算拍品的留存从 PRUNE_DAYS 压到这个天数
export const JAN_IDLE_DAYS = 3; // 吃紧时，几天没上线的散修档案先请出去（回来自动重建）

// 从最没用的一类开始，逐类交出「可以删的键」。每一类都附一句为什么删得起。
// aggressive=false 时只交出「怎么算都没人读」的那几类，这些每轮都该扫；
// true 时才动那些「理论上还有人可能读」的（榜外名次、结算已久的拍品、闲置档案）。
function* expendable(shared, now, aggressive) {
  const day = dayKey(now), wk = weekKey(now);
  // 1. 往日的连珠分数：棋局榜只显示当天，过了今天没有任何地方读它，也没有回溯奖励
  for (const e of byPrefix(shared, "wx:")) if (Number(e.key.split(":")[1]) < day) yield e.key;
  // 2. 往日的论坛活跃度：当天用完即弃
  for (const e of byPrefix(shared, "act:")) if ((e.value?.day ?? 0) < day) yield e.key;
  // 3. 上周及更早的宗门试炼伤害：试炼榜只看本周
  for (const e of byPrefix(shared, "sbd:")) if (Number(e.key.split(":")[2]) < wk) yield e.key;
  // 4. 前天及更早的世界 BOSS 伤害：领赏只回溯到昨天
  for (const e of byPrefix(shared, "bd:")) if (Number(e.key.split(":")[1]) < day - 1) yield e.key;
  // 5. 已经没有有效记录的论道来袭表（过了 ATK_KEEP 的旧账不算数——守方躲了两周才回来的，论道值早随赛季衰减了）
  for (const e of byPrefix(shared, "atk:")) if (!(e.value?.list ?? []).some((x) => now - x.t < ATK_KEEP)) yield e.key;
  // 6′. 折叠过的散键是纯冗余，每轮都清（bot 每轮把 act/bd/wx 散键折叠成单键，见 main.js botWork）
  const fold = shared.get("act");
  if (fold && fold.d) for (const e of byPrefix(shared, "act:")) {
    const uid = e.key.slice(4);
    if (fold.d[uid] !== undefined && fold.d[uid] >= (e.value?.day ?? 0)) yield e.key;
  }
  for (const [pfx, fkPfx, field] of [["bd:", "bdx:", "d"], ["wx:", "wxb:", "sc"]]) {
    for (const e of byPrefix(shared, pfx)) {
      const parts = e.key.split(":"); // bd:<day>:<uid>
      if (parts.length !== 3) continue;
      const fv = shared.get(fkPfx + parts[1])?.d?.[parts[2]];
      if (fv && (fv[field] ?? 0) >= (e.value?.[field] ?? 0)) yield e.key;
    }
  }
  // 6‴. 折进桶的档案/来袭散键：桶里那份不比散键旧、且散键一小时没动过 —— 删。
  //    人还在桶里（榜单、论道、欠账都读得到），在线玩家的散键不动，免得删了下一个请求又建（键抖动白烧配额）。
  // 平时给在线玩家的散键留一小时缓冲，免得删了下个请求又建（键抖动白烧配额）；
  // 但顶到配额上限时，键抖动远比「整个游戏写不进新键」轻——这时立刻收，先把地方腾出来。
  const FOLD_IDLE = shared.size >= JAN_KEY_CAP - 5 ? 0 : 3600_000;
  for (const e of byPrefix(shared, "p:")) {
    const fv = e.value && shared.get(pxKey(e.value.uid))?.d?.[String(e.value.uid)];
    if (fv && (fv.t ?? 0) >= (e.value.t ?? 0) && now - (e.value.t ?? 0) >= FOLD_IDLE) yield e.key;
  }
  const maxT = (rec) => Math.max(0, ...(rec?.list ?? []).map((x) => x.t ?? 0));
  for (const e of byPrefix(shared, "atk:")) {
    const fv = e.value && shared.get(axKey(e.value.uid))?.d?.[String(e.value.uid)];
    if (fv && maxT(fv) >= maxT(e.value) && now - maxT(e.value) >= FOLD_IDLE) yield e.key;
  }
  for (const e of byPrefix(shared, "sc:")) {
    const fv = e.value && shared.get(sxKey(e.value.uid))?.d?.[String(e.value.uid)];
    if (fv && (fv.t ?? 0) >= (e.value.t ?? 0) && now - (e.value.t ?? 0) >= FOLD_IDLE) yield e.key;
  }
  // 折进桶的落槌拍品：落槌后没人再改这条记录，桶里有一份就立刻删散键
  for (const e of byPrefix(shared, "auction:")) {
    const a = e.value;
    if (a && a.aid && a.settled && shared.get(auxKey(a.uid))?.d?.[String(a.aid)]) yield e.key;
  }
  // 6″. 过期的折叠键本身：棋局只看当天，讨伐领赏只回溯到昨天
  for (const e of byPrefix(shared, "wxb:")) if (Number(e.key.slice(4)) < day) yield e.key;
  for (const e of byPrefix(shared, "bdx:")) if (Number(e.key.slice(4)) < day - 1) yield e.key;
  if (!aggressive) return;
  // --- 以下要吃紧了才动 ---
  // 6. 昨天榜上第 50 名之外的伤害：claimBossReward 在前 50 里找自己的名次，找不到就没有奖励，
  //    所以删掉这些人的键不会少发任何一份赏
  const y = byPrefix(shared, `bd:${day - 1}:`).filter((e) => e.value).sort((a, b) => (b.value.d ?? 0) - (a.value.d ?? 0));
  for (const e of y.slice(JAN_BOARD_KEEP)) yield e.key;
  // 7. 结算已久的拍品：留存期从 PRUNE_DAYS=30 压到 JAN_AUCTION_DAYS
  for (const e of byPrefix(shared, "auction:")) {
    const a = e.value;
    if (a && a.settled && now > (a.end ?? 0) + JAN_AUCTION_DAYS * DAY) yield e.key;
  }
  // 8. 闲置修士的档案：p:<uid> 每次上线自动重建，删了只是暂时从榜上消失。
  //    仙籍（asc）与掌门（sect 记录还指着他）不动 —— 那两个榜要的就是「人不在了名还在」。
  const leaders = new Set(byPrefix(shared, "sect:").map((e) => String(e.value?.leader ?? "")));
  // 先请 3 天没来的；共享区 100 键的天花板对日活人数就是硬约束，还不够就把线收到 1 天 ——
  // 「昨天玩过、今天还没来」的档案也请出去（回来那一刻自动重建，只是暂时不在榜上）。
  for (const days of [JAN_IDLE_DAYS, 1]) {
    const idle = byPrefix(shared, "p:")
      .filter((e) => e.value && !e.value.asc && !leaders.has(String(e.value.uid)) && now - (e.value.t ?? 0) > days * DAY)
      .sort((a, b) => (a.value.t ?? 0) - (b.value.t ?? 0)); // 最久没来的先请
    for (const e of idle) {
      yield e.key;
      // 随身的活跃度键一起清；atk: 不动 —— 那是他欠着的论道账，回来还得认（第 5 类到期自然清）
      const uid = e.value.uid;
      if (shared.has(`act:${uid}`)) yield `act:${uid}`;
    }
  }
}

// 返回 { keys, bytes, deleted, over }：keys/bytes 是清扫前的量，over 表示预算内没砍完、下一轮还得再来。
const sizeOf = (v) => { try { return JSON.stringify(v ?? null).length; } catch { return 0; } };
export function sharedBytes(shared) {
  let b = 0;
  for (const [k, v] of shared) b += k.length + sizeOf(v);
  return b;
}

export function janitorSweep(shared, now, effects, cap = JAN_SOFT_CAP, byteCap = JAN_BYTE_CAP, budget = Infinity) {
  const keys = shared.size;
  const bytes = sharedBytes(shared);
  let n = keys, b = bytes;
  const seen = new Set();
  let deleted = 0;
  const take = (key) => {
    if (seen.has(key) || deleted >= budget) return;
    seen.add(key);
    delShared(effects, key);
    deleted++;
    n--; b -= key.length + sizeOf(shared.get(key));
  };
  // 第一轮无条件扫：这几类怎么算都没人读，留着纯属占地方
  for (const key of expendable(shared, now, false)) { if (deleted >= budget) break; take(key); }
  // 还超标才动第二轮
  if (n > cap || b > byteCap) {
    for (const key of expendable(shared, now, true)) {
      if (deleted >= budget) break;
      take(key);
      if (n <= cap && b <= byteCap) break;
    }
  }
  return { keys, bytes, deleted, over: n > cap || b > byteCap };
}

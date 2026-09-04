import { VIP_MOD, vipMod } from "./vipmod.js";
// 能量供奉：拿论坛能量换灵石。
// 扣能量用 `points.spend`（平台文档只写了 points.award，这个是 2026-08-25 在试玩安装上探出来的）：
//   · 需要在 app.json 里申请 `points.spend` 权限，否则 E_SCOPE_DENIED
//   · 字段是 { amount, label(1-100 字), request_id(短 slug，幂等键) } —— 不是 reason
//   · 单次上限 100 点，超了 E_POINTS_QUOTA
//   · 负数的 points.award 是行不通的（E_INVALID_EFFECT: amount must be a positive integer）
// effects 是单事务：扣费被拒时，灵石入账一起回滚，玩家不会白掉能量。
export const ENERGY_DAILY = 5; // 每日最多供奉几点能量（平台单次上限 100，这里远低于）
export const ENERGY_MAX_PER_CALL = 100; // 平台硬限
// 一点能量换多少灵石：按境界给，折下来大约「六天的日常收入」。
// 低境界给 5000（≈7 天收入），化神给 25000（≈6 天），高低境界都值得换。
export const lsPerEnergy = (r, vip = 0) => Math.round((5000 + 5000 * Math.max(0, r | 0)) * (VIP_MOD[Math.max(0, Math.min(4, vip | 0))].enRate));
export const energyDaily = (c) => vipMod(c).en; // 会员每日上限更高

export function energyView(c, balance) {
  const used = c.daily.energy ?? 0;
  return {
    balance: Math.max(0, balance | 0),
    left: Math.max(0, energyDaily(c) - used),
    rate: lsPerEnergy(c.r, c.vip | 0),
    daily: energyDaily(c),
  };
}

// 返回 { ok, msg, effect? }：effect 由调用方 push 进 effects（负数 award = 扣除）
export function offerEnergy(c, balance, n, legacy = null) {
  n = Math.max(1, Math.floor(Number(n) || 0));
  const used = c.daily.energy ?? 0;
  const cap = energyDaily(c);
  if (used >= cap) return { ok: false, msg: `今日供奉已满 ${cap} 点能量，明日再来` };
  if (n > cap - used) return { ok: false, msg: `今日最多还能供奉 ${cap - used} 点能量` };
  if (n > ENERGY_MAX_PER_CALL) return { ok: false, msg: `一次最多供奉 ${ENERGY_MAX_PER_CALL} 点能量` };
  if ((balance | 0) < n) return { ok: false, msg: `你只有 ${Math.max(0, balance | 0)} 点能量` };
  const rate = lsPerEnergy(c.r, c.vip | 0);
  const ls = rate * n;
  c.ls += ls;
  c.daily.energy = used + n;
  if (legacy) legacy.en = (legacy.en | 0) + n; // 会员等级按累计供奉算，跨转世
  // request_id 是幂等键：同一个键重复提交平台只扣一次，所以每笔用一个自增号，
  // 网络重试不会把玩家的能量扣两遍。
  c.enN = (c.enN ?? 0) + 1;
  return {
    ok: true,
    msg: `供奉 ${n} 点能量，天机阁回赠灵石 +${ls}`,
    effect: { type: "points.spend", amount: n, label: `问道：供奉 ${n} 点能量换 ${ls} 灵石`.slice(0, 100), request_id: `wd-${c.uid}-${(legacy?.lives ?? c.lives ?? 0) | 0}-${c.enN}` },
  };
}

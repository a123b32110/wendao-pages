import { profiles, profileOf, scOf, scAll, byPrefix, setShared, delShared , sharedRoomFor } from "./shared.js";
import { weekKey, dayKey } from "./time.js";

export const CREATE_COST = 5000;
export const CREATE_REALM = 2;
export const MAX_ELDERS = 3;
const SECT_NAME_RE = /^[一-龥A-Za-z0-9]{2,8}$/;

// ---- 宗门建设：四栋建筑，等级 0-5，用库藏（全宗贡献 - 已用）升级。
// 效果读的是 c.sectB（validateMembership 每次刷新）：cj → stats.js 修炼倍率；df → craft.js 成功率；
// hs → 宗门试炼伤害 + 论道守御防御（buildSnapshot 写 hs）；jl → 每日俸禄。
export const SB_BUILD = [
  { k: "cj", name: "藏经阁", desc: "全宗修炼速度 +1%/级" },
  { k: "df", name: "丹房", desc: "炼丹炼器成功率 +2%/级" },
  { k: "hs", name: "护山大阵", desc: "宗门试炼伤害 +5%/级，论道守御防御 +1%/级" },
  { k: "jl", name: "聚灵池", desc: "每日俸禄 +50 灵石/级" },
];
export const SB_COST = [500, 1500, 4000, 9000, 20000];
export const SB_MAX = SB_COST.length;
// 本周宗务：三条目标按人头算，周结算时按达成条数发赏。
// sb 记的是「出手次数」而不是威能总量：试炼之兽一周才换一头，威能随抽到哪头相差数倍，
// 低境界的宗门更是怎么打都够不到一个写死的威能数 —— 次数才是全宗都能推进的东西。
export const SB_GOAL = { don: 200, sb: 8, aw: 5 };
const SB_ZERO = { cj: 0, df: 0, hs: 0, jl: 0 };

export function sectBld(s) {
  return { ...SB_ZERO, ...(s?.bld ?? {}) };
}
export function sbGoals(members) {
  const m = Math.max(1, members | 0);
  return { don: SB_GOAL.don * m, sb: SB_GOAL.sb * m, aw: SB_GOAL.aw * m };
}
function sbFreeze(w, members) {
  const g = sbGoals(members);
  const cur = { don: w?.don ?? 0, sb: w?.sb ?? 0, aw: w?.aw ?? 0 };
  return { k: w?.k ?? 0, ...cur, goals: g, done: (cur.don >= g.don ? 1 : 0) + (cur.sb >= g.sb ? 1 : 0) + (cur.aw >= g.aw ? 1 : 0) };
}
// 一处写 sc:<uid>：贡献 + 本周三项。上周的记录顺手挪到 wkp，周结算读它。
export function bumpSc(c, shared, effects, now, o = {}) {
  if (!c.sect) return null;
  const wk = weekKey(now);
  const cur = scOf(shared, c.uid); // 散键可能已折进 sx: 桶
  const same = !!(cur && cur.sect === c.sect);
  const pts = (same ? cur.pts ?? 0 : 0) + (o.pts ?? 0);
  const fresh = same && cur.wk && cur.wk.k === wk;
  const wkRec = fresh ? { ...cur.wk } : { k: wk, don: 0, sb: 0, aw: 0 };
  let wkp = same ? cur.wkp ?? null : null;
  if (same && cur.wk && cur.wk.k !== wk) wkp = cur.wk;
  if (o.wkKey) wkRec[o.wkKey] = (wkRec[o.wkKey] ?? 0) + (o.wkVal ?? 0);
  const rec = { uid: c.uid, n: c.name, sect: c.sect, pts, wk: wkRec, wkp, t: now };
  setShared(effects, `sc:${c.uid}`, rec);
  shared.set(`sc:${c.uid}`, rec); // 本次请求后续的 sectView 也要看得见
  c.sectPts = pts;
  return rec;
}

export function sectLevel(total) {
  return Math.min(10, Math.floor(Math.sqrt((total ?? 0) / 500)));
}
export function sectOf(shared, sid) {
  return sid ? shared.get(`sect:${sid}`) ?? null : null;
}
export function aggOf(shared, sid) {
  return sid ? shared.get(`sectagg:${sid}`) ?? { total: 0, members: 0, level: 0 } : { total: 0, members: 0, level: 0 };
}

// Keep membership consistent with the shared record. Returns a note if status changed.
export function validateMembership(c, shared) {
  if (!c.sect) { c.sectLv = 0; c.sectB = null; return null; }
  const s = sectOf(shared, c.sect);
  if (!s) { c.sect = null; c.sectLv = 0; c.sectB = null; return "你所在的宗门已解散，你又成了散修。"; }
  if ((s.banned ?? []).map(String).includes(String(c.uid))) { c.sect = null; c.sectLv = 0; c.sectB = null; return `你已被逐出${s.name}。`; }
  c.sectLv = aggOf(shared, c.sect).level ?? 0;
  c.sectB = sectBld(s); // 建筑加成的本地缓存：stats/craft/snapshot 都读它
  return null;
}

export function roleOf(c, s) {
  if (!s) return "散修";
  if (String(s.leader) === String(c.uid)) return "掌门";
  if ((s.elders ?? []).map(String).includes(String(c.uid))) return "长老";
  return "弟子";
}

export function createSect(c, shared, now, name, desc, effects) {
  if (!sharedRoomFor(shared, null)) return { ok: false, msg: "仙府典籍将满，暂不能开宗，请过一会儿再试" };
  if (c.sect) return { ok: false, msg: "已有宗门" };
  if (c.r < CREATE_REALM) return { ok: false, msg: "金丹之后方可开宗立派" };
  if (c.ls < CREATE_COST) return { ok: false, msg: `开宗需 ${CREATE_COST} 灵石` };
  name = String(name ?? "").trim();
  if (!SECT_NAME_RE.test(name)) return { ok: false, msg: "宗门名需 2-8 个汉字或字母" };
  const sid = `s${c.uid}`;
  if (shared.has(`sect:${sid}`)) return { ok: false, msg: "你已创立过宗门（一人一宗）" };
  for (const e of byPrefix(shared, "sect:")) if (e.value?.name === name) return { ok: false, msg: "宗门名已被占用" };
  c.ls -= CREATE_COST;
  c.sect = sid;
  const rec = { sid, name, desc: String(desc ?? "").slice(0, 80), leader: c.uid, leaderName: c.name, elders: [], banned: [], req: 0, t: now };
  setShared(effects, `sect:${sid}`, rec);
  return { ok: true, msg: `${name}立派于今日。` };
}
export function joinSect(c, shared, sid, effects) {
  if (!sharedRoomFor(shared, `sc:${c.uid}`)) return { ok: false, msg: "仙府典籍将满，暂不能入宗，请过一会儿再试" };
  if (c.sect) return { ok: false, msg: "先退出现有宗门" };
  const s = sectOf(shared, sid);
  if (!s) return { ok: false, msg: "无此宗门" };
  if ((s.banned ?? []).map(String).includes(String(c.uid))) return { ok: false, msg: "此宗不欢迎你" };
  if (c.r < (s.req ?? 0)) return { ok: false, msg: "境界不足，未达入门要求" };
  if ((c.sectCd ?? 0) > c._now) return { ok: false, msg: "叛门不久，各宗暂不收你" };
  c.sect = sid;
  c.sectLv = aggOf(shared, sid).level ?? 0;
  return { ok: true, msg: `你成为了${s.name}弟子。` };
}
export function leaveSect(c, shared, now, effects) {
  if (!c.sect) return { ok: false, msg: "你本就是散修" };
  const s = sectOf(shared, c.sect);
  if (s && String(s.leader) === String(c.uid)) return { ok: false, msg: "掌门需先传位或解散宗门" };
  c.sect = null; c.sectLv = 0; c.sectB = null;
  c.sectCd = now + 24 * 3600 * 1000;
  // contribution resets when you leave
  setShared(effects, `sc:${c.uid}`, { uid: c.uid, sect: null, pts: 0, wk: null, wkp: null, t: now });
  return { ok: true, msg: "你离开了宗门。一日之内各宗不会再收你。" };
}
export function donate(c, shared, now, amt, effects) {
  if (!c.sect) return { ok: false, msg: "你没有宗门" };
  amt = Math.floor(Number(amt) || 0);
  if (amt < 10) return { ok: false, msg: "至少捐献 10 灵石" };
  if (c.ls < amt) return { ok: false, msg: "灵石不足" };
  if ((c.daily.donate ?? 0) + amt > 100000) return { ok: false, msg: "今日捐献已达上限" };
  c.ls -= amt;
  c.daily.donate = (c.daily.donate ?? 0) + amt;
  c.stats.dons = (c.stats.dons ?? 0) + 1;
  const gain = Math.floor(amt / 10);
  bumpSc(c, shared, effects, now, { pts: gain, wkKey: "don", wkVal: gain });
  return { ok: true, msg: `捐献 ${amt} 灵石，宗门贡献 +${gain}` };
}
function leaderOnly(c, shared) {
  const s = sectOf(shared, c.sect);
  if (!s) return { err: "你没有宗门" };
  if (String(s.leader) !== String(c.uid)) return { err: "只有掌门可以这么做" };
  return { s };
}
export function manage(c, shared, now, action, params, effects) {
  const { s, err } = leaderOnly(c, shared);
  if (err) return { ok: false, msg: err };
  const uid = params?.uid !== undefined ? String(params.uid) : null;
  const rec = { ...s, elders: (s.elders ?? []).map(String), banned: (s.banned ?? []).map(String) };
  switch (action) {
    case "appoint":
      if (!uid || uid === String(c.uid)) return { ok: false, msg: "无效成员" };
      if (rec.elders.length >= MAX_ELDERS) return { ok: false, msg: "长老已满" };
      if (!rec.elders.includes(uid)) rec.elders.push(uid);
      break;
    case "dismiss":
      rec.elders = rec.elders.filter((x) => x !== uid);
      break;
    case "ban":
      if (!uid || uid === String(c.uid)) return { ok: false, msg: "无效成员" };
      rec.elders = rec.elders.filter((x) => x !== uid);
      if (!rec.banned.includes(uid)) rec.banned.push(uid);
      rec.banned = rec.banned.slice(-50);
      break;
    case "unban":
      rec.banned = rec.banned.filter((x) => x !== uid);
      break;
    case "transfer": {
      if (!uid) return { ok: false, msg: "无效成员" };
      const target = profileOf(shared, uid);
      if (!target || target.sect !== c.sect) return { ok: false, msg: "对方不是本宗弟子" };
      rec.leader = target.uid; rec.leaderName = target.n;
      rec.elders = rec.elders.filter((x) => x !== uid);
      break;
    }
    case "setReq":
      rec.req = Math.max(0, Math.min(8, Math.floor(Number(params?.req) || 0)));
      break;
    case "setDesc":
      rec.desc = String(params?.desc ?? "").slice(0, 80);
      break;
    case "disband":
      delShared(effects, `sect:${c.sect}`);
      c.sect = null; c.sectLv = 0;
      return { ok: true, msg: "宗门已解散。" };
    default:
      return { ok: false, msg: "无此操作" };
  }
  setShared(effects, `sect:${c.sect}`, rec);
  return { ok: true, msg: "已办妥" };
}

// 库藏 = 全宗贡献总额 - 已用。读时现算，捐完立刻能用，不必等 bot。
export function sectFunds(shared, sid, s) {
  let total = 0;
  for (const v of scAll(shared)) if (v && v.sect === sid) total += v.pts ?? 0;
  const spent = (s ?? sectOf(shared, sid))?.spent ?? 0;
  return { total, spent, treasury: Math.max(0, total - spent) };
}

// 掌门与长老都能动库藏（shared.js 的键表已注明 sect: 不止掌门一个写者）。
export function sectBuild(c, shared, now, b, effects) {
  const s = sectOf(shared, c.sect);
  if (!s) return { ok: false, msg: "你没有宗门" };
  const role = roleOf(c, s);
  if (role !== "掌门" && role !== "长老") return { ok: false, msg: "只有掌门与长老可以动用库藏" };
  const def = SB_BUILD.find((x) => x.k === String(b));
  if (!def) return { ok: false, msg: "无此建筑" };
  const bld = sectBld(s);
  const lv = bld[def.k] ?? 0;
  if (lv >= SB_MAX) return { ok: false, msg: `${def.name}已至顶` };
  const cost = SB_COST[lv];
  const f = sectFunds(shared, c.sect, s);
  if (f.treasury < cost) return { ok: false, msg: `库藏不足：需 ${cost}，现有 ${f.treasury}` };
  // sect:<sid> 是掌门 + 最多三名长老共写的一条整记录，平台又没有条件写，
  // 所以两人同一刻动土必然丢一次。v 是写入序号：客户端建完立刻重拉一次宗门页，
  // 丢掉的那次会当场显出真相，而不是挂着一个不存在的等级直到下次刷新。
  const rec = { ...s, bld: { ...bld, [def.k]: lv + 1 }, spent: (s.spent ?? 0) + cost, v: (s.v ?? 0) + 1 };
  setShared(effects, `sect:${c.sect}`, rec);
  shared.set(`sect:${c.sect}`, rec);
  c.sectB = sectBld(rec);
  return { ok: true, msg: `${def.name}修至 ${lv + 1} 级，耗库藏 ${cost} 贡献`, lv: lv + 1, cost, v: rec.v };
}

export function sectWage(c, shared, now) {
  const s = sectOf(shared, c.sect);
  if (!s) return { ok: false, msg: "你没有宗门" };
  const jl = sectBld(s).jl ?? 0;
  if (jl <= 0) return { ok: false, msg: "宗门尚未建起聚灵池" };
  c.daily.claim ??= {};
  if (c.daily.claim.wage) return { ok: false, msg: "今日俸禄已领" };
  const amt = 50 * jl;
  c.daily.claim.wage = 1;
  c.ls += amt;
  return { ok: true, msg: `聚灵池分润，俸禄 ${amt} 灵石入账`, ls: amt };
}

// housekeeping：上周的宗务在 bot 冻结之后结算一次，只发给上周真正出过力的人。
export function claimSectWeek(c, shared, now, effects) {
  if (!c.sect || c.dead) return null;
  const last = shared.get(`sectagg:${c.sect}`)?.last;
  if (!last || typeof last.k !== "number") return null;
  if (last.k !== weekKey(now) - 1) return null;
  if ((c.sectWeek ?? -1) >= last.k) return null;
  c.sectWeek = last.k;
  const sc = scOf(shared, c.uid);
  const mine = sc && sc.sect === c.sect ? (sc.wk?.k === last.k ? sc.wk : sc.wkp?.k === last.k ? sc.wkp : null) : null;
  if (!mine || (mine.don ?? 0) + (mine.sb ?? 0) + (mine.aw ?? 0) <= 0) return null;
  const n = last.done ?? 0;
  if (n <= 0) return null;
  const ls = n * (300 + 100 * c.r);
  c.ls += ls;
  const pts = 30 * n;
  bumpSc(c, shared, effects, now, { pts });
  return { n, ls, pts, k: last.k };
}

export function sectView(c, shared, sid, now = 0) {
  const s = sectOf(shared, sid);
  if (!s) return null;
  const agg = aggOf(shared, sid);
  const members = profiles(shared).filter((p) => p.sect === sid).sort((a, b) => (b.pw ?? 0) - (a.pw ?? 0)).slice(0, 50);
  const contrib = {};
  const wk = weekKey(now);
  const cur = { don: 0, sb: 0, aw: 0 };
  for (const v of scAll(shared)) {
    if (!v || v.sect !== sid) continue;
    contrib[String(v.uid)] = v.pts;
    if (v.wk && v.wk.k === wk) { cur.don += v.wk.don ?? 0; cur.sb += v.wk.sb ?? 0; cur.aw += v.wk.aw ?? 0; }
  }
  const f = sectFunds(shared, sid, s);
  const bld = sectBld(s);
  const role = roleOf(c, s);
  const memberCount = Math.max(members.length, agg.members ?? 0);
  return {
    sid, name: s.name, desc: s.desc, leader: s.leader, leaderName: s.leaderName, elders: (s.elders ?? []).map(String), req: s.req ?? 0, t: s.t,
    level: agg.level ?? 0, total: agg.total ?? 0, members: members.map((p) => ({ uid: p.uid, n: p.n, r: p.r, s: p.s, pw: p.pw, pa: p.pa, pts: contrib[String(p.uid)] ?? 0, role: String(s.leader) === String(p.uid) ? "掌门" : (s.elders ?? []).map(String).includes(String(p.uid)) ? "长老" : "弟子" })),
    memberCount: members.length, myRole: role, myPts: contrib[String(c.uid)] ?? 0, buff: Math.min(20, (agg.level ?? 0) * 2),
    bld, treasury: f.treasury, spent: f.spent,
    costs: SB_BUILD.map((b) => ({ k: b.k, name: b.name, desc: b.desc, lv: bld[b.k] ?? 0, max: SB_MAX, cost: (bld[b.k] ?? 0) >= SB_MAX ? null : SB_COST[bld[b.k] ?? 0] })),
    wk: { k: wk, goals: sbGoals(memberCount), cur, daysLeft: 7 - (dayKey(now) - wk * 7) },
    last: shared.get(`sectagg:${sid}`)?.last ?? null,
    wage: { lv: bld.jl ?? 0, amount: 50 * (bld.jl ?? 0), taken: !!c.daily?.claim?.wage },
    canBuild: role === "掌门" || role === "长老",
  };
}
export function sectList(shared) {
  return byPrefix(shared, "sect:").map((e) => e.value).filter(Boolean).map((s) => {
    const agg = aggOf(shared, s.sid);
    return { sid: s.sid, name: s.name, desc: s.desc, leaderName: s.leaderName, level: agg.level ?? 0, members: agg.members ?? 0, total: agg.total ?? 0, req: s.req ?? 0 };
  }).sort((a, b) => b.total - a.total);
}

// Bot: aggregate contributions, member counts, this week's 宗务 and last week's frozen result.
export function botAggregateSects(shared, effects, now = 0, budget = Infinity) {
  let used = 0;
  const wk = weekKey(now);
  const totals = {}, week = {}, prev = {};
  const bucket = (map, sid, k) => (map[sid] ??= { k, don: 0, sb: 0, aw: 0 });
  for (const v of scAll(shared)) {
    if (!v?.sect) continue;
    totals[v.sect] = (totals[v.sect] ?? 0) + (v.pts ?? 0);
    const w = bucket(week, v.sect, wk), p = bucket(prev, v.sect, wk - 1);
    if (v.wk?.k === wk) { w.don += v.wk.don ?? 0; w.sb += v.wk.sb ?? 0; w.aw += v.wk.aw ?? 0; }
    const old = v.wk?.k === wk - 1 ? v.wk : v.wkp?.k === wk - 1 ? v.wkp : null;
    if (old) { p.don += old.don ?? 0; p.sb += old.sb ?? 0; p.aw += old.aw ?? 0; }
  }
  const members = {};
  for (const p of profiles(shared)) if (p.sect) members[p.sect] = (members[p.sect] ?? 0) + 1;
  for (const e of byPrefix(shared, "sect:")) {
    const sid = e.value?.sid;
    if (!sid) continue;
    const total = totals[sid] ?? 0;
    const m = members[sid] ?? 0;
    const old = shared.get(`sectagg:${sid}`);
    // 上周结果只冻结一次：冻上了就再也不重算，之后的捐献改不了已经过去的那一周
    const last = old?.last?.k === wk - 1 ? old.last : sbFreeze(prev[sid] ?? (old?.wk?.k === wk - 1 ? old.wk : { k: wk - 1 }), m);
    const rec = { total, members: m, level: sectLevel(total), spent: e.value.spent ?? 0, treasury: Math.max(0, total - (e.value.spent ?? 0)), bld: sectBld(e.value), wk: week[sid] ?? { k: wk, don: 0, sb: 0, aw: 0 }, last };
    const same = (x) => JSON.stringify({ total: x?.total, members: x?.members, spent: x?.spent, bld: x?.bld, wk: x?.wk, last: x?.last });
    if (same(old) !== same(rec) && used < budget) { setShared(effects, `sectagg:${sid}`, rec); used++; }
  }
}

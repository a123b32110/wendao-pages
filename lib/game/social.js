import { profiles, profileOf } from "./shared.js";

// 师徒：零共享键。徒弟单方面拜师（写自己的私有 c.mentor），档案 p: 上带 m:<师父 uid>；
// 师父每次请求时从全服档案里数自己名下徒弟的境界，比上次多的按境界发赏（c.mentorPaid）。
export const MENTOR_MAX = 5;
export const mentorReward = (r) => 500 * Math.max(1, r);

export function mentorApply(c, shared, name, now) {
  if (c.mentor) return { ok: false, msg: "已有师父，一世只拜一次" };
  if (c.r >= 3) return { ok: false, msg: "元婴之后自成一派，不必拜师" };
  const nm = String(name ?? "").trim();
  const p = profiles(shared).find((x) => x.n === nm && !x.dead);
  if (!p) return { ok: false, msg: "找不到这位道友（须是上过榜的修士）" };
  if (String(p.uid) === String(c.uid)) return { ok: false, msg: "不能拜自己" };
  if ((p.r ?? 0) < 1 || (p.r ?? 0) <= c.r) return { ok: false, msg: "师父须已筑基且境界高于你" };
  const n = profiles(shared).filter((x) => String(x.m ?? "") === String(p.uid)).length;
  if (n >= MENTOR_MAX) return { ok: false, msg: "这位道友门下已满五人" };
  c.mentor = { uid: p.uid, n: p.n, r0: c.r, t: now };
  return { ok: true, msg: `你向${p.n}行了拜师礼。此后每次突破大境界，师徒各得灵石与悟性。` };
}
// 徒弟突破成功后由 main.js 调：小境界不算，只在跨大境界时发
export function apprenticeBreak(c, notes) {
  if (!c.mentor) return;
  const paid = c.mentor.paid ?? c.mentor.r0 ?? 0;
  if (c.r <= paid) return;
  const ls = mentorReward(c.r), wu = 1;
  c.ls += ls; c.wu = (c.wu ?? 0) + wu; c.mentor.paid = c.r;
  notes?.push({ k: "mentor", v: `师门相庆：灵石 +${ls}，悟性 +${wu}` });
}
// 师父侧：徒弟档案里的 r 比记账高就发
export function mentorSettle(c, shared, notes) {
  const kids = profiles(shared).filter((x) => String(x.m ?? "") === String(c.uid));
  if (!kids.length) return;
  c.mentorPaid = c.mentorPaid ?? {};
  for (const k of kids) {
    if (c.mentorPaid[k.uid] === undefined) c.mentorPaid[k.uid] = Math.min(k.r ?? 0, k.mr ?? k.r ?? 0); // 首次见到：从徒弟拜师时的境界起算，师父上线晚也不漏赏
    if ((k.r ?? 0) > c.mentorPaid[k.uid]) {
      const ls = mentorReward(k.r), wu = 1;
      c.ls += ls; c.wu = (c.wu ?? 0) + wu; c.mentorPaid[k.uid] = k.r;
      notes?.push({ k: "mentor", v: `徒弟${k.n}突破至新境界，为师得灵石 +${ls}，悟性 +${wu}` });
    }
  }
}
export function mentorView(c, shared) {
  const kids = profiles(shared).filter((x) => String(x.m ?? "") === String(c.uid)).map((x) => ({ uid: x.uid, n: x.n, r: x.r }));
  const master = c.mentor ? { ...c.mentor, live: profileOf(shared, c.mentor.uid)?.n ?? c.mentor.n } : null;
  return { master, kids, max: MENTOR_MAX, canApply: !c.mentor && c.r < 3, reward: mentorReward(Math.max(1, c.r + 1)) };
}

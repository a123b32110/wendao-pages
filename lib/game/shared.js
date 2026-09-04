// Helpers around the shared area. Handlers receive `listPublic()` as [{key, value}];
// we index it once per call. Every shared key has exactly one writer (see readme):
//   p:<uid>            owner           public profile + arena build snapshot（bot 折进 px: 桶后由清扫删）
//   px:<uid%8>         bot             档案折叠桶：{d:{uid:profile}}。读档案一律 profileOf（散键优先、桶兜底）
//   atk:<uid>          owner           last 20 arena attacks this member made（bot 折进 ax: 桶后由清扫删）
//   ax:<uid%4>         bot             来袭折叠桶：{d:{uid:{uid,list}}}。读来袭一律 atkOf/atkAll
//   sc:<uid>           owner           sect contribution + this week's 宗务 (`wk:{k,don,sb,aw}`, `wkp` = last week)
//   bd:<day>:<uid>     owner           world boss damage for the day
//   sbd:<sid>:<wk>:<uid> owner         sect boss damage for the week
//   bid:<aid>:<uid>    owner           auction bid (escrow lives in owner's private kv)
//   wx:<day>:<uid>     owner           that day's 五行连珠 score; the bot prunes anything older than 2 days
//   act:<uid>          onTrigger       that member's forum activity of the day; the bot prunes it
//   auction:<uid>:<n>  seller creates; bot writes `settled`; bot deletes after 7 days
//   sect:s<founderUid> current leader  sect record; the id keeps the founder's uid but the writer
//                                      is whoever holds 掌门 now — after 传位 the successor writes it.
//                                      一个例外：宗门建设（sect.build）长老也写此键，改的只有 bld/spent
//   sectagg:<sid>      bot             aggregated contribution / level / member count / spent /
//                                      treasury / bld / this week's 宗务 (`wk`) / last week frozen (`last`)
//   world              bot             boss of the day, weather, tick bookkeeping
//   season:<n>:result  bot             season final standings
export function indexShared(list) {
  const m = new Map();
  for (const e of list ?? []) if (e && typeof e.key === "string") m.set(e.key, e.value);
  return m;
}
export function byPrefix(shared, prefix) {
  const out = [];
  for (const [k, v] of shared) if (k.startsWith(prefix)) out.push({ key: k, value: v });
  return out;
}
export function setShared(effects, key, value) {
  effects.push({ type: "kv.shared.set", key, value });
}
export function delShared(effects, key) {
  effects.push({ type: "kv.shared.delete", key });
}
// 共享区满 100 键（平台实测）时，任何含新键写入的 effects 会整批被拒。
// 锦上添花的记录（来袭表、当日伤害、棋局分）宁可这一次不记，也别把玩家的整个操作顶回去。
// 已存在的键随便改写；只有「新键 + 快满了」才放弃。返回是否真的写了。
export const SHARED_KEY_CAP = 100;
export function setSharedSoft(effects, shared, key, value, margin = 3) {
  if (!shared.has(key) && shared.size >= SHARED_KEY_CAP - margin) return false;
  setShared(effects, key, value);
  return true;
}
// 明确要占一个新键的玩法（开宗、上拍、入宗记贡献）：满了就让调用方拒绝并说明白，
// 好过让玩家扣了灵石却什么都没落下。
export function sharedRoomFor(shared, key, margin = 2) {
  return shared.has(key) || shared.size < SHARED_KEY_CAP - margin;
}
// 档案与论道来袭是配额的两个大头（每个日活/攻击者各占一键），bot 把散键按 uid 折进固定几个桶。
// 散键永远不比桶里的旧（写入以桶为底、清扫只删「桶已覆盖」的散键），所以读取都是散键优先。
export const PX_BUCKETS = 8;
export const AX_BUCKETS = 4;
export const SX_BUCKETS = 4;
export const pxKey = (uid) => `px:${(Math.abs(Number(uid)) || 0) % PX_BUCKETS}`;
export const axKey = (uid) => `ax:${(Math.abs(Number(uid)) || 0) % AX_BUCKETS}`;
export const sxKey = (uid) => `sx:${(Math.abs(Number(uid)) || 0) % SX_BUCKETS}`;
// 宗门贡献：每个弟子一个 sc: 键，同样是「人数涨它就涨」的开销（v34 实测 27 个键，
// 是共享区顶满的两个大头之一）。折进 sx: 桶，读取一律散键优先、桶兜底。
export function scOf(shared, uid) {
  return shared.get(`sc:${uid}`) ?? shared.get(sxKey(uid))?.d?.[String(uid)] ?? null;
}
export function scAll(shared) {
  const m = new Map();
  for (let b = 0; b < SX_BUCKETS; b++) {
    const d = shared.get(`sx:${b}`)?.d;
    if (d) for (const u of Object.keys(d)) m.set(u, d[u]);
  }
  for (const e of byPrefix(shared, "sc:")) if (e.value && e.value.uid !== undefined) m.set(String(e.value.uid), e.value);
  return [...m.values()];
}
export function profileOf(shared, uid) {
  return shared.get(`p:${uid}`) ?? shared.get(pxKey(uid))?.d?.[String(uid)] ?? null;
}
export function atkOf(shared, uid) {
  return shared.get(`atk:${uid}`) ?? shared.get(axKey(uid))?.d?.[String(uid)] ?? null;
}
export function atkAll(shared) {
  const m = new Map();
  for (let b = 0; b < AX_BUCKETS; b++) {
    const d = shared.get(`ax:${b}`)?.d;
    if (d) for (const u of Object.keys(d)) m.set(u, d[u]);
  }
  for (const e of byPrefix(shared, "atk:")) if (e.value && e.value.uid !== undefined) m.set(String(e.value.uid), e.value);
  return [...m.values()];
}
export function profiles(shared) {
  const m = new Map();
  for (let b = 0; b < PX_BUCKETS; b++) {
    const d = shared.get(`px:${b}`)?.d;
    if (d) for (const u of Object.keys(d)) m.set(u, d[u]);
  }
  for (const e of byPrefix(shared, "p:")) if (e.value && e.value.uid !== undefined) m.set(String(e.value.uid), e.value);
  return [...m.values()].filter((p) => p && p.uid !== undefined);
}

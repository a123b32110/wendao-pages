import { ITEMS, itemOf } from "../data/items.js";
import { MONSTERS } from "../data/monsters.js";
import { REGIONS } from "../data/regions.js";

// 百科图鉴：把静态数据表按玩家看得懂的口径摊开（玩家原话：「能不能出一个百科图鉴，
// 可以专门查看丹药功能、妖怪装备属性等」）。纯静态，算一次缓存起来。
export const CODEX_KINDS = [["pill", "丹药"], ["mat", "材料"], ["art", "法宝"], ["tal", "符箓"], ["egg", "灵兽"], ["book", "典籍"], ["misc", "杂物"], ["mon", "妖兽"]];

const nameOf = (id) => itemOf(id)?.name ?? id;
const pct = (x) => `${Math.round(x * 100)}%`;
// 说明文字之外再补一句数字（desc 里通常不写丹毒、修为具体数）
function fxLine(i) {
  const f = i.fx ?? {};
  const out = [];
  if (f.xp) out.push(`修为 +${f.xp}`);
  if (f.heal) out.push(`回血 ${pct(f.heal)}`);
  if (f.mp) out.push(`回灵 ${pct(f.mp)}`);
  if (f.st) out.push(`体力 +${f.st}`);
  if (f.rate) out.push(`修炼 ×${f.rate.mult}（${f.rate.hours} 小时）`);
  if (f.bt) out.push(`突破 +${pct(f.bt)}`);
  if (f.life) out.push(`寿元 +${f.life}`);
  if (f.tox) out.push(`丹毒 +${f.tox}`);
  if (f.dmg) out.push(`开场一击 ×${f.dmg}${f.elem ? "（" + f.elem + "）" : ""}`);
  if (f.shield) out.push(`护盾 ${pct(f.shield)}`);
  if (f.stun) out.push(`眩晕 ${pct(f.stun)}`);
  if (f.seed) out.push(`种下 ${f.h ?? "?"} 小时得 ${nameOf(f.seed)}`);
  if (f.rune) out.push(`符纹：${f.rune}`);
  if (f.learn) {
    const sid = f.learn;
    const from = MONSTERS.filter((m) => (m.drops ?? []).some((d) => d[0] === sid) || (sid.startsWith("a_") && m.arts.includes(sid))).map((m) => m.name);
    out.push(from.length ? `出处：${from.join("、")}${from.length > 1 ? "" : ""}（妖兽会什么神通就可能掉什么秘籍；奇遇与秘境亦有）` : "出处：奇遇、秘境");
    out.push("用后习得；已学或道途不合的可去拍卖行上拍，也可在功法页把已学的封存成册");
  }
  return out.join(" · ");
}

let cache = null;
export function codexView() {
  if (cache) return cache;
  const items = ITEMS.map((i) => ({
    id: i.id, k: i.k, t: i.t ?? 0, name: i.name, v: i.v ?? 0, desc: i.desc ?? "",
    slot: i.slot ?? null, st: i.st ?? null,
    pet: i.pet ? { name: i.pet.name, elem: i.pet.elem, atk: i.pet.atk, hp: i.pet.hp } : null,
    fx: fxLine(i) || null,
  }));
  const mons = MONSTERS.map((m) => ({
    id: m.id, name: m.name, t: m.t ?? 0, elem: m.elem ?? null, icon: m.icon ?? "", boss: !!m.boss, desc: m.desc ?? "",
    m: m.m ?? null, region: REGIONS.filter((r) => r.tier === (m.t ?? 0)).map((r) => r.name).join("、") || null,
    drops: (m.drops ?? []).map(([id, p, n]) => ({ name: nameOf(id), p: Math.round(p * 100), n })),
  }));
  cache = { kinds: CODEX_KINDS, items, mons };
  return cache;
}

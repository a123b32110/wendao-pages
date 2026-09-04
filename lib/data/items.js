import { GONGFA, ARTS } from "./skills.js";
// Item catalogue. `k` kind: mat 材料 | pill 丹药 | art 法宝 | tal 符箓 | egg 灵兽 | book 功法/神通 | misc
// `t` tier 0-5 maps to regions. `v` base value in 灵石.
export const ITEMS = [
  // materials
  { id: "m_lingcao", k: "mat", t: 0, name: "灵草", v: 5, desc: "最常见的灵植，炼丹入门材料。" },
  { id: "m_tiekuang", k: "mat", t: 0, name: "精铁矿", v: 6, desc: "炼器的基础材料。" },
  { id: "m_yaopi", k: "mat", t: 0, name: "妖兽皮", v: 8, desc: "低阶妖兽的皮毛。" },
  { id: "m_shuijing", k: "mat", t: 1, name: "水灵晶", v: 25, desc: "云梦泽深处凝结的水属性晶石。" },
  { id: "m_jiaolin", k: "mat", t: 1, name: "蛟鳞", v: 40, desc: "水蛟褪下的鳞片，坚韧异常。" },
  { id: "m_hanlian", k: "mat", t: 1, name: "寒潭莲", v: 35, desc: "生于寒潭底，百年一开。" },
  { id: "m_yaodan", k: "mat", t: 2, name: "妖丹", v: 120, desc: "妖兽毕生修为所凝。" },
  { id: "m_longxue", k: "mat", t: 2, name: "龙血草", v: 150, desc: "万妖谷独产，炼制延寿丹的主药。" },
  { id: "m_xuanjin", k: "mat", t: 2, name: "玄金", v: 180, desc: "炼制上品法宝的主材。" },
  { id: "m_leijing", k: "mat", t: 3, name: "雷击木", v: 450, desc: "被天雷劈过千次而不死的古木。" },
  { id: "m_bingpo", k: "mat", t: 3, name: "万年冰魄", v: 600, desc: "北冥寒渊的精华。" },
  { id: "m_xuanyuan", k: "mat", t: 3, name: "玄元晶", v: 700, desc: "蕴含纯粹灵气的晶体。" },
  { id: "m_xingchen", k: "mat", t: 4, name: "星辰砂", v: 2000, desc: "上界坠落的星屑。" },
  { id: "m_xukong", k: "mat", t: 4, name: "虚空石", v: 3000, desc: "触之即感空间震颤。" },
  { id: "m_xianlu", k: "mat", t: 4, name: "仙露", v: 5000, desc: "据说是仙人遗泽。" },
  { id: "m_gangfeng", k: "mat", t: 5, name: "罡风晶", v: 9000, desc: "九天罡风被自己的锋刃绞成的晶粒。" },
  { id: "m_xianjin", k: "mat", t: 5, name: "仙金", v: 14000, desc: "上界铸兵所用的金属，凡火烧不软它。" },
  { id: "m_taixu", k: "mat", t: 5, name: "太虚砂", v: 20000, desc: "古战场磨碎的神兵与神骨，混在一起，分不出谁是谁。" },
  { id: "m_jinghe", k: "mat", t: 2, name: "秘境晶核", v: 300, desc: "秘境深处凝成的晶核，淬炼高阶法宝必需。" },
  // pills: fx = {xp, rate:{mult,hours}, heal, mp, st stamina, bt (+chance, realm limit), life years, tox toxicity, cure, detox, tribHeal}
  { id: "p_juqi", k: "pill", t: 0, name: "聚气丹", v: 30, fx: { xp: 30, tox: 5 }, desc: "炼气期常用，立刻增加少量修为。" },
  { id: "p_huixue", k: "pill", t: 0, name: "回血丹", v: 20, fx: { heal: 0.5, tox: 3 }, desc: "回复一半气血。" },
  { id: "p_huiling", k: "pill", t: 0, name: "回灵丹", v: 20, fx: { mp: 0.5, tox: 3 }, desc: "回复一半灵力。" },
  { id: "p_xiqi", k: "pill", t: 0, name: "吸气散", v: 60, fx: { rate: { mult: 1.3, hours: 6 }, tox: 8 }, desc: "六小时内修炼速度 +30%。" },
  { id: "p_bigu", k: "pill", t: 0, name: "辟谷丹", v: 80, fx: { st: 5, tox: 2 }, desc: "咽下便不觉饥乏，回复五点体力。每日至多两颗。" },
  { id: "p_zhuji", k: "pill", t: 1, name: "筑基丹", v: 400, fx: { bt: 0.2, realm: 0, tox: 15 }, desc: "筑基突破成功率 +20%。只对炼气期有效。" },
  { id: "p_ningyuan", k: "pill", t: 1, name: "凝元丹", v: 150, fx: { xp: 600, tox: 10 }, desc: "筑基期修士的日常。" },
  { id: "p_yangshen", k: "pill", t: 1, name: "养神丹", v: 120, fx: { cure: true, tox: 5 }, desc: "祛除走火入魔与重伤。" },
  { id: "p_jindan", k: "pill", t: 2, name: "结金丹", v: 2500, fx: { bt: 0.2, realm: 1, tox: 20 }, desc: "金丹突破成功率 +20%。只对筑基期有效。" },
  { id: "p_peiyuan", k: "pill", t: 2, name: "培元丹", v: 600, fx: { xp: 4000, tox: 12 }, desc: "金丹期补充修为。" },
  { id: "p_yanshou", k: "pill", t: 2, name: "延寿丹", v: 3000, fx: { life: 30, tox: 25 }, desc: "延寿三十年。丹毒极重。" },
  { id: "p_qingdu", k: "pill", t: 2, name: "清毒丹", v: 500, fx: { detox: 40 }, desc: "清除四十点丹毒。" },
  { id: "p_yuanying", k: "pill", t: 3, name: "化婴丹", v: 12000, fx: { bt: 0.2, realm: 2, tox: 25 }, desc: "元婴突破成功率 +20%。" },
  { id: "p_tianyuan", k: "pill", t: 3, name: "天元丹", v: 2500, fx: { xp: 25000, tox: 15 }, desc: "元婴期补充修为。" },
  { id: "p_dingxin", k: "pill", t: 3, name: "定心丹", v: 2000, fx: { tribHeal: 0.4, tox: 10 }, desc: "渡劫时服用，回复四成气血。" },
  { id: "p_huashen", k: "pill", t: 4, name: "化神丹", v: 50000, fx: { bt: 0.15, realm: 3, tox: 30 }, desc: "化神突破成功率 +15%。" },
  { id: "p_xianyuan", k: "pill", t: 4, name: "仙元丹", v: 12000, fx: { xp: 150000, tox: 20 }, desc: "化神以上修士所用。" },
  { id: "p_jiuzhuan", k: "pill", t: 4, name: "九转还魂丹", v: 80000, fx: { life: 200, tox: 40 }, desc: "延寿两百年，传说中的丹药。" },
  { id: "p_hunyuan", k: "pill", t: 5, name: "混元丹", v: 60000, fx: { xp: 800000, tox: 25 }, desc: "炼虚以上修士补充修为，一炉只出三粒。" },
  { id: "p_zaohua", k: "pill", t: 5, name: "太虚造化丹", v: 200000, fx: { bt: 0.15, realm: 5, tox: 35 }, desc: "合体突破成功率 +15%。只对炼虚期有效。" },
  // artifacts: slot w 武器 | a 护甲 | r 饰品. affixes rolled at acquisition.
  { id: "f_tiejian", k: "art", t: 0, slot: "w", name: "精铁剑", v: 50, st: { atk: 6 }, desc: "铁匠铺买来的剑。" },
  { id: "f_bupao", k: "art", t: 0, slot: "a", name: "青布道袍", v: 40, st: { def: 4, hp: 20 }, desc: "洗得发白。" },
  { id: "f_yupei", k: "art", t: 0, slot: "r", name: "养气玉佩", v: 60, st: { mp: 15 }, desc: "温润的玉佩。" },
  { id: "f_shuijian", k: "art", t: 1, slot: "w", name: "碧水剑", v: 350, st: { atk: 25, spd: 3 }, elem: "水", desc: "剑身如水波流转。" },
  { id: "f_jiaolinjia", k: "art", t: 1, slot: "a", name: "蛟鳞甲", v: 400, st: { def: 22, hp: 120 }, desc: "以蛟鳞缀成。" },
  { id: "f_lingzhu", k: "art", t: 1, slot: "r", name: "聚灵珠", v: 380, st: { mp: 60, rate: 0.05 }, desc: "修炼速度 +5%。" },
  { id: "f_huoyun", k: "art", t: 2, slot: "w", name: "火云扇", v: 1800, st: { atk: 80, spell: 0.15 }, elem: "火", desc: "一扇火云起。" },
  { id: "f_xuanjinjia", k: "art", t: 2, slot: "a", name: "玄金重甲", v: 2000, st: { def: 90, hp: 500 }, desc: "重得凡人扛不动。" },
  { id: "f_yaodanling", k: "art", t: 2, slot: "r", name: "妖丹项链", v: 1600, st: { atk: 30, crit: 0.05 }, desc: "串着七颗妖丹。" },
  { id: "f_leijian", k: "art", t: 3, slot: "w", name: "紫霄雷剑", v: 8000, st: { atk: 300, crit: 0.08 }, elem: "雷", desc: "劈开过一次天劫。渡劫时雷伤 -10%。", trib: 0.1 },
  { id: "f_bingjia", k: "art", t: 3, slot: "a", name: "冰魄寒甲", v: 8500, st: { def: 320, hp: 2000, mp: 300 }, desc: "寒气逼人。" },
  { id: "f_xuanyuanjing", k: "art", t: 3, slot: "r", name: "玄元镜", v: 9000, st: { mp: 600, rate: 0.1, spell: 0.1 }, desc: "镜中可见灵气流转。" },
  { id: "f_xingjian", k: "art", t: 4, slot: "w", name: "星辰剑", v: 40000, st: { atk: 1200, crit: 0.1, spd: 30 }, elem: "无", desc: "上界遗物。" },
  { id: "f_xukongyi", k: "art", t: 4, slot: "a", name: "虚空羽衣", v: 45000, st: { def: 1000, hp: 9000, spd: 20 }, desc: "轻若无物。" },
  { id: "f_xianyin", k: "art", t: 4, slot: "r", name: "仙印", v: 50000, st: { rate: 0.2, mp: 2500, bt: 0.05 }, desc: "印上刻着一个看不懂的字。" },
  { id: "f_taixujian", k: "art", t: 5, slot: "w", name: "太虚剑", v: 150000, st: { atk: 3600, crit: 0.12, spd: 55 }, elem: "无", desc: "古战场上折断过一次，又自己接了回来。" },
  // talismans: used automatically at battle start, or in tribulation
  { id: "t_huo", k: "tal", t: 0, name: "火符", v: 25, fx: { dmg: 1.5, elem: "火" }, desc: "战斗开始时掷出，造成一次伤害。" },
  { id: "t_dun", k: "tal", t: 1, name: "遁地符", v: 80, fx: { flee: true }, desc: "游历遇险时可逃离战斗。" },
  { id: "t_hu", k: "tal", t: 1, name: "护身符", v: 100, fx: { shield: 0.5 }, desc: "战斗开始时获得护盾。" },
  { id: "t_lei", k: "tal", t: 2, name: "五雷符", v: 400, fx: { dmg: 3.0, elem: "雷", stun: 0.5 }, desc: "五雷轰顶。" },
  { id: "t_bilei", k: "tal", t: 3, name: "避雷符", v: 1500, fx: { tribBlock: 1 }, desc: "渡劫时抵挡一道劫雷。" },
  { id: "t_tianwang", k: "tal", t: 4, name: "天罡符", v: 6000, fx: { dmg: 6.0, elem: "无" }, desc: "天罡正气，邪祟退散。" },
  // beast eggs -> pets
  { id: "e_linghu", k: "egg", t: 0, name: "灵狐幼崽", v: 200, pet: { name: "灵狐", elem: "火", atk: 0.3, hp: 0.3 }, desc: "机灵的小狐狸。" },
  { id: "e_shuijiao", k: "egg", t: 1, name: "水蛟卵", v: 800, pet: { name: "小水蛟", elem: "水", atk: 0.4, hp: 0.5 }, desc: "还没睁眼就会吐水。" },
  { id: "e_leiying", k: "egg", t: 2, name: "雷鹰蛋", v: 3000, pet: { name: "雷鹰", elem: "雷", atk: 0.6, hp: 0.35 }, desc: "蛋壳上有电光。" },
  { id: "e_xuanwu", k: "egg", t: 3, name: "玄武卵", v: 12000, pet: { name: "玄武", elem: "水", atk: 0.4, hp: 0.9 }, desc: "沉得像石头。" },
  { id: "e_qilin", k: "egg", t: 4, name: "麒麟卵", v: 60000, pet: { name: "麒麟", elem: "无", atk: 0.8, hp: 0.8 }, desc: "祥瑞之兽。" },
  // misc
  { id: "x_julingzhen", k: "misc", t: 1, name: "聚灵阵盘", v: 1500, fx: { array: 1 }, desc: "布于洞府，离线修炼上限延长至 24 小时。" },
  { id: "x_julingzhen2", k: "misc", t: 3, name: "九宫聚灵阵盘", v: 15000, fx: { array: 2 }, desc: "洞府灵气浓郁，修炼 +15%，离线上限 36 小时。" },
  { id: "x_chuancheng", k: "misc", t: 2, name: "传承玉简", v: 5000, fx: { legacy: 3 }, desc: "轮回时额外保留 3 点道统。" },
  // v48 新道具
  { id: "x_gaiming", k: "misc", t: 2, name: "改名玉牒", v: 3000, fx: { rename: true }, desc: "在天机阁改一次道号，年谱记上一笔。" },
  { id: "p_xisui", k: "pill", t: 2, name: "洗髓丹", v: 4000, fx: { reroot: true, tox: 20 }, desc: "洗筋伐髓，重定灵根一次。踏上仙路之后也可服。" },
  { id: "t_biguan", k: "tal", t: 1, name: "闭关符", v: 400, fx: { biguan: 24 }, desc: "贴于洞府，一日之内离线修炼上限 +12 小时。" },
  { id: "t_cuisheng", k: "tal", t: 1, name: "催生符", v: 300, fx: { ripen: true }, desc: "催熟灵田里最快熟的那一块。" },
  { id: "x_juling", k: "misc", t: 2, name: "聚灵香", v: 2500, fx: { rate: { mult: 1.2, hours: 24 } }, desc: "燃于洞府，一日之内修炼 +20%。" },
  { id: "x_jiecao", k: "misc", t: 0, name: "野果", v: 2, desc: "青山村后山的野果，能卖几个灵石。" },
  // runes: 淬炼 sinks one into a 法宝, adding its stat
  { id: "r_feng", k: "misc", t: 1, name: "锋锐纹", v: 200, fx: { rune: "atk" }, desc: "刻于法宝，攻击 +。" },
  { id: "r_shi", k: "misc", t: 1, name: "磐石纹", v: 200, fx: { rune: "def" }, desc: "刻于法宝，防御 +。" },
  { id: "r_yun", k: "misc", t: 2, name: "灵韵纹", v: 600, fx: { rune: "spell" }, desc: "刻于法宝，法术威力 +。" },
  { id: "r_ji", k: "misc", t: 2, name: "疾风纹", v: 600, fx: { rune: "spd" }, desc: "刻于法宝，速度 +。" },
  { id: "r_sha", k: "misc", t: 3, name: "血煞纹", v: 1500, fx: { rune: "crit" }, desc: "刻于法宝，暴击 +。" },
  { id: "r_tu", k: "misc", t: 3, name: "吐纳纹", v: 1500, fx: { rune: "rate" }, desc: "刻于法宝，修炼速度 +。" },
  // seeds: sown in 灵田, harvested after `h` hours
  { id: "s_lingcao", k: "misc", t: 0, name: "灵草种", v: 3, fx: { seed: "m_lingcao", h: 2 }, desc: "两小时便可收，新手灵田的第一茬。" },
  { id: "s_hanlian", k: "misc", t: 1, name: "寒潭莲子", v: 15, fx: { seed: "m_hanlian", h: 4 }, desc: "喜阴喜寒，四小时开花。" },
  { id: "s_shuijing", k: "misc", t: 1, name: "水灵晶苗", v: 12, fx: { seed: "m_shuijing", h: 4 }, desc: "种下去长出的是晶，不是草。" },
  { id: "s_longxue", k: "misc", t: 2, name: "龙血草籽", v: 60, fx: { seed: "m_longxue", h: 6 }, desc: "得用妖兽血浇，六小时见红。" },
  { id: "s_leijing", k: "misc", t: 3, name: "雷击木枝", v: 180, fx: { seed: "m_leijing", h: 8 }, desc: "插枝即活，只是引雷。" },
  { id: "s_xianlu", k: "misc", t: 4, name: "仙露苔", v: 800, fx: { seed: "m_xianlu", h: 8 }, desc: "贴着石头长，八小时凝出一滴。" },
];
// 典籍（v51）：功法/神通成为可堆叠、可上拍的物品，从 skills 表生成。用后习得；已学或道途不合的留着上拍。
const BOOK_T = (mp) => (mp <= 12 ? 0 : mp <= 20 ? 1 : mp <= 30 ? 2 : 3);
for (const g of GONGFA) ITEMS.push({ id: "b_" + g.id, k: "book", t: [0, 1, 3, 4][g.grade], name: `《${g.name}》`, v: [400, 2000, 8000, 25000][g.grade], fx: { learn: g.id }, desc: `${["黄", "玄", "地", "天"][g.grade]}阶功法，修炼 ×${g.rate}。${g.desc}` });
for (const a of ARTS) if (a.id !== "a_slash" && a.id !== "a_fire") ITEMS.push({ id: "b_" + a.id, k: "book", t: BOOK_T(a.mp), name: `《${a.name}》`, v: [300, 1200, 5000, 15000][BOOK_T(a.mp)], fx: { learn: a.id }, desc: `神通秘籍，威力 ×${a.mult}，耗灵 ${a.mp}。${a.desc}` });
export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export function itemOf(id) {
  return ITEM_MAP[id] ?? null;
}
// Affixes rolled onto artifacts. `base` is a fraction of the artifact's own main stat or a flat add.
export const AFFIXES = [
  { id: "sharp", name: "锋锐", st: "atk", base: 0.06 },
  { id: "solid", name: "坚固", st: "def", base: 0.06 },
  { id: "vital", name: "厚血", st: "hp", base: 0.06 },
  { id: "swift", name: "轻灵", st: "spd", base: 0.05 },
  { id: "keen", name: "锐意", st: "crit", base: 0.02 },
  { id: "spirit", name: "通灵", st: "mp", base: 0.08 },
  { id: "dao", name: "悟道", st: "rate", base: 0.02 },
];

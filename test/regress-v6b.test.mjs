// 玩家反馈的第二轮：年谱停在改命前的灵根、榜外自己那一行画不出来、丹毒无处可查、
// 行囊坊市看不见灵石余额。每条一颗钉子。
import test from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { pageJs, pageCss } from "../lib/ui/page.js";

const bioOf = (s, uid) => s.kv.get(uid)?.get("bio") ?? [];

test("逆天改命后，年谱里的「踏上仙路」记的是改命后的灵根", async () => {
  const s = new Site();
  await s.call(7, "boot", {});
  await s.call(7, "create", { name: "改命人" });
  const born0 = bioOf(s, 7).find((b) => b.k === "born");
  assert.ok(born0, "创角写下了出生那一行");
  assert.match(born0.v, /灵根：/);

  let changed = 0;
  for (let i = 0; i < 12; i++) {
    const before = s.char(7).root.e.join("");
    const r = await s.call(7, "reroll", {});
    if (!r.ok) break;
    const after = s.char(7).root.e.join("");
    const born = bioOf(s, 7).find((b) => b.k === "born");
    assert.equal(born.v, `改命人于今日踏上仙路，灵根：${after}`, "年谱跟着改命走");
    assert.equal(bioOf(s, 7).filter((b) => b.k === "born").length, 1, "只改写，不追加");
    if (before !== after) changed++;
  }
  assert.ok(changed > 0, "至少有一次真的换了灵根");
});

test("已上路便不能改命，年谱也不再被改写", async () => {
  const s = new Site();
  await s.call(8, "boot", {});
  await s.call(8, "create", { name: "上路人" });
  s.setChar(8, (c) => { c.stats.explores = 1; });
  const before = bioOf(s, 8).find((b) => b.k === "born").v;
  const r = await s.call(8, "reroll", {});
  assert.equal(r.ok, false);
  assert.equal(bioOf(s, 8).find((b) => b.k === "born").v, before, "年谱原样不动");
});

test("榜单：三座牌坊同底同心，文字共用一条基线", () => {
  const css = pageCss(), js = pageJs();
  // 坊心必须落在 .pods 三等分列的中线上（360 宽 → 60 / 180 / 300），否则名字会飘出自己的坊门
  const gates = [...js.matchAll(/gate\((\d+),(\d+),(\d+),(\d+),/g)].map((m) => m.slice(1).map(Number));
  assert.equal(gates.length, 3, "三座牌坊");
  assert.deepEqual(gates.map((g) => g[0]).sort((a, b) => a - b), [60, 180, 300]);
  // 底边 = top + height，三座必须相同
  const bases = new Set(gates.map((g) => g[1] + g[3]));
  assert.equal(bases.size, 1, `三座牌坊要同底，实为 ${[...bases]}`);
  // 一座比一座高
  const byX = Object.fromEntries(gates.map((g) => [g[0], g[3]]));
  assert.ok(byX[180] > byX[60] && byX[60] > byX[300], "壹 > 貳 > 叁");
  // 文字也只剩一条基线
  assert.match(css, /#wd \.pod\{[^}]*padding-bottom:[\d.]+%/);
  assert.equal(/\.pod\.p[123]\{padding-bottom/.test(css), false, "不再按名次各给各的下边距");
});

test("榜单：自己排在三名之外时，那一行被钉在榜尾（pin 不再被变量提升吃掉）", () => {
  const js = pageJs();
  const body = js.slice(js.indexOf("function lbCard("), js.indexOf("function lbCard(") + 900);
  const decl = body.indexOf("var pin=");
  const use = body.indexOf("if(pin)");
  assert.ok(decl > 0 && use > 0, "两处都在");
  assert.ok(decl < use, "pin 必须先声明再使用");
});

test("丹毒与灵石余额都在页面上有据可查", () => {
  const js = pageJs();
  assert.match(js, /丹毒：服丹积毒/, "根骨卡解释了丹毒的副作用");
  assert.match(js, /text:'丹毒'/, "根骨卡列出了当前丹毒");
  assert.match(js, /'◆ '\+fmt\(m\.ls\)\+' 灵石'/, "行囊显示灵石");
  assert.match(js, /'囊中 ◆ '\+fmt\(m\.ls\)/, "坊市与拍卖行显示灵石");
});

test("凡是挂着真实时长的文案都说「小时」——一时辰是两小时，不能拿来当小时用", () => {
  const js = pageJs(), css = pageCss();
  assert.equal(/时辰/.test(js + css), false, "客户端不再把小时写成时辰");
  // 叙事散文（events.js 里「他讲了两个时辰」之类）不受此限，因为不挂计时器
  const files = ["farm.js", "pet.js", "cultivate.js", "explore.js"].map((f) => `../lib/game/${f}`);
  return Promise.all(files.map(async (f) => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(new URL(f, import.meta.url), "utf8"));
    assert.equal(/时辰/.test(src), false, `${f} 里还留着时辰`);
  }));
});

test("dur() 把毫秒读成人话，不留小数尾巴", () => {
  const js = pageJs();
  const dur = new Function("return (" + js.slice(js.indexOf("function dur(ms)")).match(/^function dur\(ms\)\{.*?\}\n/s)[0] + ")")();
  assert.equal(dur(90 * 60 * 1000), "1 小时 30 分");
  assert.equal(dur(78 * 60 * 1000), "1 小时 18 分");
  assert.equal(dur(2 * 3600 * 1000), "2 小时");
  assert.equal(dur(30 * 60 * 1000), "30 分");
  assert.equal(dur(0), "1 分");
});

test("升星是有加成的，而且卡片上看得见：视图发的是实际生效的属性，不是词条表原值", async () => {
  const s = new Site();
  await s.call(31, "boot", {});
  await s.call(31, "create", { name: "炼器生" });
  s.setChar(31, (c) => { c.r = 2; c.ic = 2; c.inv.arts = [{ iid: 1, id: "f_tiejian", q: 1, af: [] }, { iid: 2, id: "f_tiejian", q: 5, af: [] }]; });
  const inv = (await s.call(31, "bag", {})).data.inv;
  const one = inv.arts.find((a) => a.iid === 1), five = inv.arts.find((a) => a.iid === 2);
  assert.equal(one.qm, 1);
  assert.equal(five.qm, 1.32, "五星 = 基础 ×1.32");
  const key = Object.keys(one.st).find((k) => one.st[k] >= 1);
  assert.ok(key, "有一条整数基础属性");
  assert.ok(five.st[key] > one.st[key], `${key}: 五星 ${five.st[key]} 必须高于一星 ${one.st[key]}`);
  // 而且要和 deriveStats 真正算进去的数一致
  const { equipStats } = await import("../lib/game/stats.js");
  const c = s.char(31);
  c.eq = { w: 2, a: null, r: null };
  const eq = equipStats(c);
  assert.equal(Math.round(eq[key]), five.st[key], "卡片上的数就是穿上身生效的数");
});

test("拍卖行显示自己出了多少、还领不领先，以及一共托管了多少灵石", async () => {
  const s = new Site();
  for (const uid of [32, 33, 34]) { await s.call(uid, "boot", {}); await s.call(uid, "create", { name: "拍客" + uid }); s.setChar(uid, (c) => { c.r = 2; c.ls = 100000; c.inv.stack.m_lingcao = 5; }); }
  const cr = await s.call(32, "auction.create", { item: { id: "m_lingcao", n: 1 }, min: 100 });
  assert.equal(cr.ok, true, cr.msg);
  const aid = (await s.call(33, "shop", {})).data.auctions.open[0].aid;
  await s.call(33, "auction.bid", { aid, amt: 200 });
  let v = (await s.call(33, "shop", {})).data.auctions;
  assert.equal(v.open[0].myBid, 200);
  assert.equal(v.open[0].top.amt, 200, "此刻我领先");
  assert.equal(Object.values(v.escrow).reduce((t, x) => t + x, 0), 200, "托管额可汇总");
  await s.call(34, "auction.bid", { aid, amt: 400 });
  v = (await s.call(33, "shop", {})).data.auctions;
  assert.equal(v.open[0].myBid, 200);
  assert.ok(v.open[0].top.amt > v.open[0].myBid, "被超价了，页面据此标红");
  const js = pageJs();
  assert.match(js, /已被超/);
  assert.match(js, /托管 ◆/);
});

test("地域解锁标签覆盖到大乘：太虚古战场 realm 7 不能渲染成「需undefined」", async () => {
  const js = pageJs();
  const { REGIONS } = await import("../lib/data/regions.js");
  const { REALMS } = await import("../lib/data/realms.js");
  const RN = js.match(/var RN=(\[[^\]]*\]);/)[1];
  const names = JSON.parse(RN.replace(/'/g, '"'));
  assert.equal(names.length, REALMS.length, "境界名表要跟 REALMS 一样长");
  for (const r of REGIONS) assert.ok(names[r.realm], `${r.name}（realm ${r.realm}）没有对应的境界名`);
  assert.equal(names[7], "大乘");
  // 全文件不许再出现第二份写死的境界表
  assert.equal((js.match(/'炼气','筑基'/g) ?? []).length, 1, "境界名表只应有一处定义");
});

test("状态栏说清楚还剩多久、扣的是什么，到期的减益不再挂在卡上", async () => {
  const js = pageJs();
  assert.match(js, /走火入魔.*修炼 ×0\.5/, "写明走火入魔的实际影响");
  assert.match(js, /' 余 '\+dur\(m\.dbf\[x\.k\]-m\.now\)/, "写明剩余时间");
  const s = new Site();
  await s.call(41, "boot", {});
  await s.call(41, "create", { name: "待愈人" });
  s.setChar(41, (c) => { c.dbf = { qi: s.now - 1000, injury: s.now + 3600000 }; });
  const me = (await s.call(41, "home", {})).me;
  assert.deepEqual(Object.keys(me.dbf), ["injury"], "过期的走火入魔被清掉，只剩还在生效的重伤");
});

test("拍卖行的响应大小不随全站在拍量增长——否则坊市与上拍会一起被平台顶回来", async () => {
  const s = new Site();
  await s.call(9, "boot", {});
  await s.call(9, "create", { name: "重度玩家" });
  s.setChar(9, (c) => { c.r = 4; c.ls = 500000; for (let i = 0; i < 60; i++) c.inv.stack["x" + i] = 99; });
  const seed = (n) => {
    s.shared.clear();
    for (let u = 100; u < 100 + n; u++) for (let k = 1; k <= 3; k++) {
      s.shared.set(`auction:${u}:${k}`, {
        aid: `${u}:${k}`, uid: u, n: "道友" + u, min: 1000, end: 2e12 + u, t: 1,
        item: { k: "art", id: "f_tiejian", name: "精铁剑", q: 5, t: 0, slot: "w", af: [{ st: "atk", v: 99, n: "锋锐" }, { st: "crit", v: 0.05, n: "凌厉" }], rn: [{ st: "atk", v: 50, id: "r_feng" }, { st: "def", v: 9, id: "r_shi" }] },
      });
    }
  };
  seed(10);
  const small = JSON.stringify(await s.call(9, "shop", {})).length;
  seed(600);
  const huge = await s.call(9, "shop", {});
  const big = JSON.stringify(huge).length;
  assert.ok(big < 32 * 1024, `1800 件在拍时响应 ${big} 字节，必须远低于平台单次上限`);
  assert.ok(big - small < 8 * 1024, `响应不该随在拍量线性膨胀（${small} → ${big}）`);
  const a = huge.data.auctions;
  assert.equal(a.open.length, 40, "只列最先落槌的 40 件");
  assert.equal(a.openTotal, 1800, "但总数如实报出");
  assert.equal(typeof a.open[0].item.rn, "number", "列表里的符纹只带个数");
  assert.ok(Array.isArray(a.open[0].item.af) && a.open[0].item.af.length === 2, "词缀进列表（玩家要看得见属性），但只带 st/v/n");
  assert.deepEqual(a.open[0].item.rns, ["atk", "def"], "符纹只带种类");
  // 落槌结算读的是共享记录本身，不是这个精简过的列表 —— 符纹必须还在
  assert.equal(s.shared.get("auction:100:1").item.rn.length, 2);
});

test("上拍五件都能成，第六件被干净地拒绝；领走货款后位子当场空出来", async () => {
  const { MAX_ACTIVE } = await import("../lib/game/auction.js");
  const s = new Site();
  await s.call(10, "boot", {});
  await s.call(10, "create", { name: "拍卖生" });
  s.setChar(10, (c) => { c.r = 2; c.ls = 100000; c.inv.stack.p_huixue = 9; });
  for (let i = 0; i < MAX_ACTIVE + 1; i++) {
    const r = await s.call(10, "auction.create", { item: { id: "p_huixue", n: 1 }, min: 100 });
    assert.equal(r.ok, i < MAX_ACTIVE, `第 ${i + 1} 件：${r.msg}`);
    if (i === MAX_ACTIVE) assert.match(r.msg, /最多同时 5 件/);
  }
  // 落槌 + bot 结算 + 卖家领取后，名额必须立刻回来（旧版要再等三天）
  s.advance(25 * 3600_000);
  await s.tick();
  await s.call(10, "home");
  assert.ok(Object.keys(s.char(10).aucDone ?? {}).length >= 1, "流拍的货已领回");
  const again = await s.call(10, "auction.create", { item: { id: "p_huixue", n: 1 }, min: 100 });
  assert.equal(again.ok, true, `领完就该能再上拍：${again.msg}`);
});

test("共享区闸门：日常到期先清，吃紧时闲置档案请出去，仙籍与掌门不动", async () => {
  const { janitorSweep, JAN_SOFT_CAP, JAN_IDLE_DAYS } = await import("../lib/game/janitor.js");
  const { dayKey, weekKey, DAY } = await import("../lib/game/time.js");
  const now = 1_800_000_000_000;
  const day = dayKey(now), wk = weekKey(now);
  const shared = new Map();
  // 10 个今天在玩的、80 个玩过一次就走了的（平台共享区只有 100 键，这正是真实安装满掉的样子）
  for (let u = 1; u <= 10; u++) {
    shared.set(`p:${u}`, { uid: u, t: now - 3600_000 });
    shared.set(`sc:${u}`, { pts: 1, sect: "s1" });
    shared.set(`bd:${day}:${u}`, { uid: u, d: u });
    shared.set(`wx:${day}:${u}`, { uid: u, sc: 1 });
    shared.set(`sbd:s1:${wk}:${u}`, { uid: u, d: 1 });
  }
  for (let u = 11; u <= 90; u++) shared.set(`p:${u}`, { uid: u, t: now - (JAN_IDLE_DAYS + 2) * DAY });
  // 例外两位：飞升的、以及还挂着掌门名分的，闲置也得留在典籍里
  shared.set("p:91", { uid: 91, asc: 1, t: now - 30 * DAY });
  shared.set("p:92", { uid: 92, t: now - 30 * DAY });
  shared.set("sect:s1", { sid: "s1", leader: 92 });
  shared.set(`atk:11`, { list: [{ t: now - 60 * DAY }] }); // 全是陈年旧账的来袭表
  shared.set(`atk:1`, { list: [{ t: now - 1000 }] });      // 今天挨的打，不能删
  shared.set("world", { tickAt: now });
  const before = shared.size;
  assert.ok(before > JAN_SOFT_CAP, `样本要先超标，实为 ${before}`);

  const effects = [];
  const r = janitorSweep(shared, now, effects);
  assert.equal(r.keys, before);
  assert.equal(r.over, false, "扫完应当降到闸门之下");
  assert.ok(effects.every((e) => e.type === "kv.shared.delete"), "清扫只发删除");
  const gone = new Set(effects.map((e) => e.key));
  for (let u = 1; u <= 10; u++) {
    assert.equal(gone.has(`p:${u}`), false, "今天在玩的档案不能删");
    assert.equal(gone.has(`sc:${u}`), false, "宗门贡献不能删");
    assert.equal(gone.has(`bd:${day}:${u}`), false, "今天的 BOSS 伤害不能删");
    assert.equal(gone.has(`wx:${day}:${u}`), false, "今天的棋局分不能删");
  }
  assert.ok(gone.has("p:11"), "闲置档案请出去（回来自动重建）");
  assert.equal(gone.has("p:91"), false, "仙籍不动");
  assert.equal(gone.has("p:92"), false, "掌门不动");
  assert.ok(gone.has("atk:11"), "全是过期记录的来袭表可删");
  assert.equal(gone.has("atk:1"), false, "今天挨的打还得认");

  // 预算：平台单次调用 ~20 条 effects，一轮最多只发这么几条删除，剩下的留给下一轮
  const fx2 = [];
  const r2 = janitorSweep(shared, now, fx2, undefined, undefined, 6);
  assert.equal(fx2.length, 6, "预算内只删 6 条");
  assert.equal(r2.over, true, "没砍完要如实上报，下一轮接着来");
});

test("共享区没超标时，闸门一个键都不动", async () => {
  const { janitorSweep } = await import("../lib/game/janitor.js");
  const shared = new Map();
  for (let u = 1; u <= 20; u++) shared.set(`p:${u}`, { uid: u });
  const effects = [];
  const r = janitorSweep(shared, 1_800_000_000_000, effects, 300);
  assert.equal(r.deleted, 0);
  assert.equal(r.over, false);
  assert.deepEqual(effects, []);
});

test("年谱不再是全 app 最占地方的东西，老存档读到就裁", async () => {
  const { pushBio, trimBio, BIO_MAX } = await import("../lib/game/bio.js");
  assert.ok(BIO_MAX <= 60, `BIO_MAX=${BIO_MAX}：一条约 60 字节，超过 60 条单人年谱就比角色本身还大`);
  let bio = [];
  for (let i = 0; i < 200; i++) bio = pushBio(bio, "突破至金丹中期，天雷散尽，识海一片清明第" + i + "次", 1_700_000_000_000 + i, "bt");
  assert.equal(bio.length, BIO_MAX);
  assert.ok(JSON.stringify(bio).length < 4096, `满员年谱 ${JSON.stringify(bio).length} 字节`);
  assert.match(bio[bio.length - 1].v, /第199次/, "留下的是最近的");
  // 上一版留下的长年谱，读到就裁（pushBio 只在有新事发生时才裁）
  const old = Array.from({ length: 120 }, (_, i) => ({ t: i, k: "e", v: "旧事 " + i }));
  const cut = trimBio(old);
  assert.equal(cut.length, BIO_MAX);
  assert.equal(cut[cut.length - 1].v, "旧事 119");
  assert.equal(trimBio([]).length, 0);
  assert.equal(trimBio(undefined).length, 0);

  // 端到端：读一次就该把存下来的那份裁短
  const s = new Site();
  await s.call(51, "boot", {});
  await s.call(51, "create", { name: "老修士" });
  s.kv.get(51).set("bio", old);
  await s.call(51, "home", {});
  assert.equal(s.kv.get(51).get("bio").length, BIO_MAX, "落盘的也裁了");
});

test("体力供给必须够得着每日游历上限——旧值 12/日 配 20 次上限，散修永远跑不满", async () => {
  const { STAMINA_MAX, STAMINA_REGEN_HOURS, STAMINA_PILL_DAILY } = await import("../lib/game/stats.js");
  const { EXPLORE_DAILY } = await import("../lib/game/explore.js");
  const perDay = 24 / STAMINA_REGEN_HOURS;
  assert.ok(perDay >= EXPLORE_DAILY, `每日恢复 ${perDay} 点，够不着 ${EXPLORE_DAILY} 次上限`);
  // 体力桶仍旧是「一趟走多远」的闸门：一次上线走不完当日份额，才有回头再来的理由
  assert.ok(STAMINA_MAX < EXPLORE_DAILY, "一次上线就能跑满的话，体力这个资源就没意义了");
  // 桶 + 当日丹药恰好覆盖上限，「跑满」是花钱能达成的目标而不是空话
  assert.ok(STAMINA_MAX + STAMINA_PILL_DAILY * 5 >= EXPLORE_DAILY, "桶 + 丹药要够跑满");
});

test("辟谷丹：回体力、每日两颗封顶、满体力时不许浪费", async () => {
  const s = new Site();
  await s.call(61, "boot", {});
  await s.call(61, "create", { name: "赶路人" });
  s.setChar(61, (c) => { c.st = 2; c.inv.stack.p_bigu = 5; });
  const a = await s.call(61, "use", { id: "p_bigu" });
  assert.equal(a.ok, true);
  assert.equal(s.char(61).st, 7);
  assert.equal(s.char(61).inv.stack.p_bigu, 4, "扣了一颗");
  // 只补到上限，不溢出
  const b = await s.call(61, "use", { id: "p_bigu" });
  assert.equal(b.ok, true);
  assert.equal(s.char(61).st, 10, "补到上限为止");
  assert.match(b.msg, /体力 \+3/, "如实报出实际回了多少");
  // 第三颗被每日限量挡下，且不该扣物品
  const c3 = await s.call(61, "use", { id: "p_bigu" });
  assert.equal(c3.ok, false);
  assert.match(c3.msg, /一日至多/);
  assert.equal(s.char(61).inv.stack.p_bigu, 3, "被拒时不能吞丹药");
  // 体力已满时也拒，同样不吞
  s.setChar(61, (c) => { c.daily.stp = 0; });
  const d = await s.call(61, "use", { id: "p_bigu" });
  assert.equal(d.ok, false);
  assert.match(d.msg, /体力正满/);
  assert.equal(s.char(61).inv.stack.p_bigu, 3);
  // 跨日重置：先过一天，再把体力压下去，否则挡住的会是「体力正满」
  s.advance(25 * 3600 * 1000);
  await s.call(61, "home", {});
  s.setChar(61, (c) => { c.st = 1; c.stAt = s.now; });
  const e = await s.call(61, "use", { id: "p_bigu" });
  assert.equal(e.ok, true, "隔天又能服");
});

test("事件不再只抽不补：有几处「睡了/吃了」会还回体力", async () => {
  const { EVENTS } = await import("../lib/data/events.js");
  const sts = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.st === "number") sts.push(o.st);
    for (const k of ["ok", "fail"]) if (o[k]) walk(o[k]);
    if (o.chance) walk(o.chance);
  };
  for (const e of EVENTS) for (const op of e.opts ?? []) walk(op.out);
  assert.ok(sts.some((v) => v > 0), "至少要有给回体力的选项——原来 21 个扣、0 个给");
  const gain = sts.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  assert.ok(gain >= 6, `回补总量 ${gain} 太少`);
});

test("渡劫专长真的生效：体修硬抗少受 25%，法修招架少受 10%", async () => {
  const { stageNeed } = await import("../lib/data/realms.js");
  const s = new Site();
  // 三个同境界的修士，只差道途；把劫的种子钉成同一个，雷就一模一样
  const setup = async (uid, path, act) => {
    await s.call(uid, "boot", {});
    await s.call(uid, "create", { name: "劫修" + uid });
    s.setChar(uid, (c) => { c.r = 0; c.s = 8; c.xp = stageNeed(0, 8); c.hpP = 1; c.mpP = 1; c.path = path; });
    const v = await s.call(uid, "trib.start");
    assert.equal(v.ok, true, v.msg);
    s.setChar(uid, (c) => { c.trib.seed = "pinned-trib-seed"; });
    const r = await s.call(uid, "trib.step", { act });
    assert.equal(r.ok, true, r.msg);
    return 1 - s.char(uid).trib.log[0].hp; // 第一道雷吃掉的气血比例
  };
  // v34 起雷伤按「同境界白板气血」落下、再除以你自己的气血，所以气血倍率也算进来：
  // 体修少受的 = 硬抗专长 25% × 气血 1.5 倍。两项都要对得上，缺一项都是回归。
  const { pathOf } = await import("../lib/data/paths.js");
  const exp = (id, perk) => (1 - (pathOf(id).trib?.[perk] ?? 0)) / (pathOf(id).mods?.hp ?? 1);
  const base = await setup(71, "dan", "tank");
  const ti = await setup(72, "ti", "tank");
  assert.ok(Math.abs(ti / base - exp("ti", "tank")) < 0.01, `体修硬抗比例应为 ${exp("ti", "tank").toFixed(3)}，实际 ${(ti / base).toFixed(3)}`);
  const baseP = await setup(73, "dan", "parry");
  const fa = await setup(74, "fa", "parry");
  assert.ok(Math.abs(fa / baseP - exp("fa", "ward")) < 0.01, `法修招架比例应为 ${exp("fa", "ward").toFixed(3)}，实际 ${(fa / baseP).toFixed(3)}`);
});

test("渡劫：气血堆得越厚，雷劫掉的比例越小（旧版气血被约掉，堆血完全没用）", async () => {
  const { stageNeed } = await import("../lib/data/realms.js");
  const s = new Site();
  const run = async (uid, bonusHp) => {
    await s.call(uid, "boot", {});
    await s.call(uid, "create", { name: "雷修" + uid });
    s.setChar(uid, (c) => {
      c.r = 0; c.s = 8; c.xp = stageNeed(0, 8); c.hpP = 1; c.mpP = 1; c.path = "dan";
      if (bonusHp) { c.ic = 1; c.inv.arts = [{ iid: 1, id: "f_tiejian", q: 1, af: [{ st: "hp", v: bonusHp, n: "厚血" }] }]; c.eq = { ...c.eq, w: 1 }; }
    });
    const v = await s.call(uid, "trib.start");
    assert.equal(v.ok, true, v.msg);
    s.setChar(uid, (c) => { c.trib.seed = "pinned-hp-seed"; });
    const r = await s.call(uid, "trib.step", { act: "tank" });
    assert.equal(r.ok, true, r.msg);
    return 1 - s.char(uid).trib.log[0].hp;
  };
  const thin = await run(81, 0);
  const thick = await run(82, 400); // 一件加了大量气血的法宝
  assert.ok(thick < thin * 0.9, `堆气血必须真的少掉血：白板 ${thin.toFixed(3)} vs 厚血 ${thick.toFixed(3)}`);
});

test("bot 一轮的 effects 决不超过平台 ~20 条的限额", async () => {
  const { Site } = await import("./harness.mjs");
  const s = new Site();
  // 堆一个最忙的世界：一堆到期拍品带竞价、几个宗门、几百个过期键
  const now = s.now;
  const { dayKey, weekKey } = await import("../lib/game/time.js");
  const day = dayKey(now), wk = weekKey(now);
  for (let i = 1; i <= 8; i++) {
    s.shared.set(`auction:9${i}:1`, { aid: `9${i}:1`, uid: 90 + i, n: "卖家" + i, item: { k: "mat", id: "m_lingcao", name: "灵草", n: 1, t: 0 }, min: 10, end: now - 1000, t: now - 90000000 });
    for (let b = 0; b < 4; b++) s.shared.set(`bid:9${i}:1:${200 + b}`, { uid: 200 + b, n: "买家" + b, amt: 10 + b, t: now - 5000 });
  }
  for (let u = 1; u <= 60; u++) {
    s.shared.set(`wx:${day - 1}:${u}`, { uid: u, sc: 1 });
    s.shared.set(`act:${u}`, { day: day - 2 });
    s.shared.set(`bd:${day - 3}:${u}`, { uid: u, d: 1 });
  }
  const out = await s.tick();
  const fx = out.effects ?? [];
  assert.ok(fx.length > 0 && fx.length <= 17, `一轮 ${fx.length} 条 effects，超过安全线`);
  // 多跑几轮，积压要能清完
  for (let i = 0; i < 40; i++) { s.advance(600_000); await s.tick(); }
  const leftovers = [...s.shared.keys()].filter((k) => /^(wx|act|bd):/ .test(k) && !k.includes(`:${day}:`));
  assert.equal([...s.shared.keys()].filter((k) => k.startsWith("wx:")).length, 0, "过期棋局分最终清完");
  assert.ok([...s.shared.keys()].filter((k) => k.startsWith("auction:")).every((k) => s.shared.get(k)?.settled), "拍品最终全部结算");
});

test("单个玩家的存档写不穿平台 8KB 的单值上限", async () => {
  const { Site } = await import("./harness.mjs");
  const s = new Site();
  await s.call(61, "boot", {});
  await s.call(61, "create", { name: "满档修士" });
  // 往最坏了堆：满法宝匣（带词缀符纹）、满一轮杂物、日常字段全点亮
  s.setChar(61, (c) => {
    c.r = 6; c.ls = 9_999_999; c.wu = 60;
    c.inv.arts = Array.from({ length: 30 }, (_, i) => ({ iid: i + 1, id: "f_taixujian", q: 5, af: [{ st: "atk", v: 5000 }, { st: "crit", v: 0.1 }, { st: "spd", v: 50 }], rn: [{ st: "atk", v: 100, id: "r_feng" }, { st: "def", v: 100, id: "r_shi" }, { st: "spell", v: 0.05, id: "r_yun" }] }));
    for (let i = 0; i < 82; i++) c.inv.stack["m_x" + i] = 999;
    c.aucDone = {}; c.escrow = {};
    for (let i = 0; i < 30; i++) { c.aucDone[`${i}:1`] = 1; c.escrow[`${i}:2`] = 99999; }
    c.farm = { n: 5, plots: Array.from({ length: 5 }, () => ({ seed: "s_xianlu", at: s.now, ready: s.now + 1, ev: { k: "虫害", at: s.now }, hurt: 1, chk: 3 })) };
  });
  await s.call(61, "home");
  // 平台限的是每个键的单值：分家后 c 与 arts 两个键都要各自留有余量
  const m = s.kv.get(61);
  const cSize = JSON.stringify(m.get("c")).length;
  const aSize = JSON.stringify(m.get("arts")).length;
  assert.ok(cSize < 7500, `存档 c 键 ${cSize}B，离 8192B 的平台上限太近`);
  assert.ok(aSize < 7500, `法宝匣 arts 键 ${aSize}B，离 8192B 的平台上限太近`);
  assert.equal(m.get("c").inv.arts.length, 0, "c 里不再冗余一份法宝匣");
  assert.equal(s.char(61).inv.arts.length, 30, "读档要能把法宝匣接回来");
});

test("世界时钟停摆时，随便哪个玩家的请求都能代跑一小步清扫", async () => {
  const { Site } = await import("./harness.mjs");
  const { dayKey } = await import("../lib/game/time.js");
  const s = new Site();
  await s.call(62, "boot", {});
  await s.call(62, "create", { name: "自愈修士" });
  const day = dayKey(s.now);
  // 时钟停在很久以前 + 一堆过期键 + 一件该结算的拍品
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  for (let u = 1; u <= 20; u++) s.shared.set(`wx:${day - 1}:${u}`, { uid: u, sc: 1 });
  s.shared.set("auction:9:1", { aid: "9:1", uid: 9, n: "卖家", item: { k: "mat", id: "m_lingcao", name: "灵草", n: 1, t: 0 }, min: 10, end: s.now - 1000, t: s.now - 90000000 });
  const v = await s.call(62, "home");
  assert.equal(v.ok, true);
  const stamped = s.shared.get("world").tickAt;
  assert.ok(s.now - stamped < 600_000, "时钟被玩家的请求推近当下（略旧，给正牌 bot 留门）");
  assert.ok(s.shared.get("auction:9:1").settled, "该结算的拍品顺手结了");
  assert.ok([...s.shared.keys()].filter((k) => k.startsWith("wx:")).length < 20, "过期棋局分开始被清");
  // 时钟新鲜时不代跑（同一请求里不重复干活）
  await s.call(62, "home");
  assert.equal(s.shared.get("world").tickAt, stamped, "时钟新鲜就不再动");
});

test("论坛活跃度折叠成单键：奖励照发、散键当冗余清掉", async () => {
  const { Site } = await import("./harness.mjs");
  const { dayKey } = await import("../lib/game/time.js");
  const s = new Site();
  await s.call(63, "boot", {});
  await s.call(63, "create", { name: "坛友" });
  await s.trigger(63); // 发了个帖
  assert.ok(s.shared.has("act:63"), "散键先落地");
  // 世界时钟拨旧，让下一个请求代跑一轮 bot（内含折叠）
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  const v = await s.call(63, "home");
  assert.ok(v.notes.some((n) => n.k === "forum"), "论坛奖励照发（不管读的是散键还是折叠键）");
  assert.equal(s.shared.get("act").d["63"], dayKey(s.now), "折叠键里记着今天");
  // 再来一轮：散键作为冗余被清
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  await s.call(63, "home");
  assert.equal(s.shared.has("act:63"), false, "散键清掉了");
  // 折叠键还在，第二个人的奖励从折叠键读也能发
  await s.call(64, "boot", {});
  await s.call(64, "create", { name: "坛友乙" });
  await s.trigger(64);
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  const v2 = await s.call(64, "home");
  assert.ok(v2.notes.some((n) => n.k === "forum"));
});

test("共享区顶满时，哪怕时钟新鲜，玩家请求也立刻清一小把", async () => {
  const { Site } = await import("./harness.mjs");
  const { dayKey } = await import("../lib/game/time.js");
  const s = new Site();
  await s.call(65, "boot", {});
  await s.call(65, "create", { name: "应急测试" });
  const day = dayKey(s.now);
  s.shared.set("world", { tickAt: s.now }); // 时钟新鲜：miniTick 的常规路径不跑
  let u = 1000;
  while (s.shared.size < 99) s.shared.set(`wx:${day - 1}:${u++}`, { uid: u, sc: 1 }); // 全是过期可删的
  const before = s.shared.size;
  await s.call(65, "home");
  assert.ok(s.shared.size < before, `应急清扫要立刻动手（${before} -> ${s.shared.size}）`);
});

test("BOSS 伤害与棋局分折叠成日键：伤害累积、榜单、领赏、防重玩全都认折叠值", async () => {
  const { Site } = await import("./harness.mjs");
  const { dayKey } = await import("../lib/game/time.js");
  const { bossBoard, bossMine } = await import("../lib/game/boss.js");
  const s = new Site();
  await s.call(66, "boot", {});
  await s.call(66, "create", { name: "折叠修士" });
  s.setChar(66, (c) => { c.r = 2; c.hpP = 1; c.mpP = 1; });
  const day = dayKey(s.now);
  // 打一次 BOSS，散键落地
  let v = await s.call(66, "boss.attack", {});
  assert.equal(v.ok, true, v.msg);
  const d1 = s.shared.get(`bd:${day}:66`).d;
  assert.ok(d1 > 0);
  // bot 折叠 + 清扫散键（跑两轮：先折，后删冗余）
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  await s.tick();
  s.advance(600_000); await s.tick();
  assert.equal(s.shared.has(`bd:${day}:66`), false, "散键折叠后被清");
  assert.equal(s.shared.get(`bdx:${day}`).d["66"].d, d1, "折叠键里伤害还在");
  assert.equal(bossMine(s.shared, day, 66).d, d1);
  // 再打一次：prev 从折叠键读，伤害要在 d1 之上累积
  v = await s.call(66, "boss.attack", {});
  assert.equal(v.ok, true, v.msg);
  const rec = s.shared.get(`bd:${day}:66`);
  assert.ok(rec.d > d1, `第二击要累积（${rec.d} > ${d1}）`);
  assert.equal(rec.k, 2, "出手次数也累积");
  assert.ok(bossBoard(s.shared, day).some((b) => String(b.uid) === "66"), "榜上有名");
  // 连珠：交卷 → 折叠 → 散键清掉 → 再交要被拒
  const { wxSim } = await import("../lib/game/wuxing.js");
  // 找一步合法走法
  const seed = `wx:${day}`;
  let mv = null;
  outer: for (let r = 0; r < 6; r++) for (let c2 = 0; c2 < 5; c2++) {
    const t = wxSim(seed, [[r, c2, r, c2 + 1]]);
    if (t.ok) { mv = [[r, c2, r, c2 + 1]]; break outer; }
  }
  assert.ok(mv, "总有一步能成连珠");
  v = await s.call(66, "wx.submit", { moves: mv });
  assert.equal(v.ok, true, v.msg);
  s.shared.set("world", { tickAt: s.now - 3 * 3600_000 });
  await s.tick();
  s.advance(600_000); await s.tick();
  assert.equal(s.shared.has(`wx:${day}:66`), false, "棋局散键折叠后被清");
  // 转世同日也别想再来一局（守卫认折叠键）
  s.setChar(66, (c) => { c.daily.wx = 0; });
  v = await s.call(66, "wx.submit", { moves: mv });
  assert.equal(v.ok, false, "折叠键也算「今日已下过」");
});

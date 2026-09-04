// v48：每日/每周活动、新道具、师徒
import test from "node:test";
import assert from "node:assert/strict";
import { Site } from "./harness.mjs";
import { HOUR, DAY } from "../lib/game/time.js";
import { dayEvent, eventBonusHours } from "../lib/game/events2.js";
import { offlineCapMs } from "../lib/game/stats.js";

const CST = 8 * HOUR;
const at = (y, m, d, h) => Date.UTC(y, m, d, h) - CST; // 北京时间
const setup = async (s, uid, name, fn) => { await s.call(uid, "boot", {}); await s.call(uid, "create", { name }); s.setChar(uid, (c) => { c.created = Date.UTC(2026, 8, 20); if (fn) fn(c); }); await s.call(uid, "home"); };

test("活动：按北京时间的星期与钟点推导，双修日按小时折成额外修炼", () => {
  const mon = at(2026, 8, 7, 10); // 周一 10:00
  assert.equal(dayEvent(mon).rate, 1.5); assert.equal(dayEvent(mon).list[0].name, "双修日");
  const wed = at(2026, 8, 9, 12);
  assert.equal(dayEvent(wed).disc, 0.8);
  const sat = at(2026, 8, 12, 12);
  assert.equal(dayEvent(sat).dg, 1);
  const tueNight = at(2026, 8, 8, 21);
  assert.equal(dayEvent(tueNight).drop, 1.5); assert.equal(dayEvent(tueNight).list[0].name, "妖潮");
  const tueDay = at(2026, 8, 8, 12);
  assert.equal(dayEvent(tueDay).list.length, 0);
  // 周日 23:00 → 周一 03:00：只有周一那 3 小时算双修
  assert.equal(+eventBonusHours(at(2026, 8, 6, 23), at(2026, 8, 7, 3)).toFixed(2), 1.5);
  assert.equal(eventBonusHours(at(2026, 8, 8, 1), at(2026, 8, 8, 9)), 0);
});

test("活动生效：双修日修为多涨、坊市集打折、周末秘境多一次、妖潮掉落翻倍", async () => {
  const s = new Site(at(2026, 8, 6, 23)); // 周日 23:00
  await setup(s, 1, "赶集人", (c) => { c.r = 1; c.ls = 100000; });
  const xp0 = s.char(1).xp;
  s.advance(4 * HOUR); // 跨进周一
  await s.call(1, "home");
  const gain = s.char(1).xp - xp0;
  const s2 = new Site(at(2026, 8, 8, 23)); // 周二 23:00 → 周三 03:00，无双修
  await setup(s2, 1, "赶集人", (c) => { c.r = 1; c.ls = 100000; });
  const x0 = s2.char(1).xp; s2.advance(4 * HOUR); await s2.call(1, "home");
  assert.ok(gain > (s2.char(1).xp - x0) * 1.2, `双修日多涨 ${gain} vs ${s2.char(1).xp - x0}`);
  // 坊市集
  const s3 = new Site(at(2026, 8, 9, 12));
  await setup(s3, 1, "赶集人", (c) => { c.r = 1; });
  const wed = (await s3.call(1, "shop")).data.shop[0];
  const s4 = new Site(at(2026, 8, 10, 12));
  await setup(s4, 1, "赶集人", (c) => { c.r = 1; });
  const thu = (await s4.call(1, "shop")).data.shop[0];
  assert.ok(wed.price < thu.price, `坊市集打折 ${wed.price} < ${thu.price}`);
  // 周末秘境
  const s5 = new Site(at(2026, 8, 12, 12));
  await setup(s5, 1, "赶集人");
  assert.equal((await s5.call(1, "dg")).data.dg.limit, 3);
  const v = await s5.call(1, "home");
  assert.equal(v.data.home.event.list[0].name, "秘境开放", "首页横幅");
});

test("新道具：改名玉牒、洗髓丹、闭关符、催生符、聚灵香", async () => {
  const s = new Site();
  await setup(s, 2, "旧名", (c) => { c.inv.stack.x_gaiming = 1; c.inv.stack.p_xisui = 1; c.inv.stack.t_biguan = 1; c.inv.stack.t_cuisheng = 1; c.inv.stack.x_juling = 1; c.inv.stack.s_lingcao = 1; c.stats.explores = 5; });
  let r = await s.call(2, "rename", { name: "新名" });
  assert.equal(r.ok, true, r.msg);
  assert.equal(s.char(2).name, "新名"); assert.equal(s.char(2).inv.stack.x_gaiming, undefined);
  r = await s.call(2, "rename", { name: "再新" }); assert.equal(r.ok, false);
  const root0 = JSON.stringify(s.char(2).root);
  r = await s.call(2, "use", { id: "p_xisui" });
  assert.equal(r.ok, true, r.msg);
  assert.match(r.msg, /灵根重定/, "走的是洗髓分支，不是普通丹药分支");
  assert.equal(s.char(2).inv.stack.p_xisui, undefined);
  const cap0 = offlineCapMs(s.char(2));
  r = await s.call(2, "use", { id: "t_biguan" });
  assert.equal(r.ok, true, r.msg);
  const c = s.char(2); c._now = s.now;
  assert.equal(offlineCapMs(c) - cap0, 12 * HOUR);
  r = await s.call(2, "farm.plant", { i: 0, seed: "s_lingcao" });
  assert.equal(r.ok, true, r.msg);
  r = await s.call(2, "use", { id: "t_cuisheng" });
  assert.equal(r.ok, true, r.msg);
  r = await s.call(2, "farm.harvest", { i: 0 });
  assert.equal(r.ok, true, "催熟后立刻可收：" + r.msg);
  r = await s.call(2, "use", { id: "x_juling" });
  assert.equal(r.ok, true, r.msg);
  assert.ok(s.char(2).buffs.some((b) => b.k === "rate" && b.m === 1.2));
});

test("师徒：徒弟拜师、大境界突破师徒各得赏、门下五人封顶", async () => {
  const s = new Site();
  await setup(s, 10, "老祖", (c) => { c.r = 4; c.ls = 0; });
  await setup(s, 11, "徒儿", (c) => { c.r = 0; c.ls = 0; });
  let v = await s.call(11, "home");
  assert.equal(v.data.home.mentor.canApply, true);
  let r = await s.call(11, "mentor.apply", { name: "没这人" }); assert.equal(r.ok, false);
  r = await s.call(11, "mentor.apply", { name: "老祖" });
  assert.equal(r.ok, true, r.msg);
  r = await s.call(11, "mentor.apply", { name: "老祖" }); assert.equal(r.ok, false);
  const ls0m = s.char(10).ls; // 师父这次不上线，稍后才看到徒弟：也要按拜师时境界补赏
  // 徒弟跨大境界
  s.setChar(11, (c) => { c.r = 1; c.s = 0; c.mentor.paid = 0; });
  const { apprenticeBreak } = await import("../lib/game/social.js");
  const notes = [];
  const kid = s.char(11); const ls0k = kid.ls; apprenticeBreak(kid, notes);
  assert.equal(kid.ls, ls0k + 500); assert.equal(kid.wu, 1); assert.equal(notes.length, 1);
  s.setChar(11, (c) => { c.ls = kid.ls; c.wu = kid.wu; c.mentor = kid.mentor; });
  await s.call(11, "home"); // 档案更新
  await s.call(10, "home");
  assert.equal(s.char(10).ls, ls0m + 500, "师父得赏"); assert.equal(s.char(10).wu, 1);
  await s.call(10, "home");
  assert.equal(s.char(10).ls, ls0m + 500, "不重复");
  v = await s.call(10, "home");
  assert.equal(v.data.home.mentor.kids.length, 1);
  // 门下封顶
  for (let u = 12; u <= 16; u++) { await setup(s, u, "徒" + u, (c) => { c.r = 0; }); const rr = await s.call(u, "mentor.apply", { name: "老祖" }); if (u <= 15) assert.equal(rr.ok, true, rr.msg); else { assert.equal(rr.ok, false); assert.match(rr.msg, /已满/); } }
});

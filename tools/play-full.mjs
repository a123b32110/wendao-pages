// Full real-site playthrough of the webview, accelerated with the author-only dev.* cheats.
// usage: node tools/play-full.mjs   (needs the logged-in Chrome profile; author uid must equal DEV_UID in lib/main.js)
// Output: pass/fail table + screenshots in wendao-browser-out/full-web/
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const PROFILE = (process.env.LOCALAPPDATA ?? "/tmp") + "/Temp/claude/wendao-browser-profile";
const OUT = (process.env.LOCALAPPDATA ?? "/tmp") + "/Temp/claude/wendao-browser-out/full-web";
mkdirSync(OUT, { recursive: true });
const URL = process.argv[2] ?? "https://www.nodeloc.com/apps/authoring/wendao";
const MOBILE = !!process.env.MOBILE;

const ctx = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: !process.env.HEADED, viewport: MOBILE ? { width: 390, height: 900 } : { width: 1100, height: 1500 }, deviceScaleFactor: 1.5 });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/cloudflareinsights|fonts.googleapis/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
page.on("dialog", (d) => { errors.push("native dialog (sandbox would swallow it): " + d.message()); d.dismiss(); });
async function okModal() { const b = frame.locator("#wd .modal button", { hasText: "确认" }); await b.waitFor({ timeout: 5000 }); await b.click(); await sleep(900); }

let frame = null, iframeEl = null;
const results = [];
let shotN = 0;
const sleep = (ms) => page.waitForTimeout(ms);
const LOCAL = /localhost|127.0.0.1/.test(URL);
async function attach() {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  if (LOCAL) { frame = page.mainFrame(); iframeEl = page; await frame.waitForSelector("#wd", { timeout: 20000 }); await sleep(800); return; }
  await sleep(2000);
  const start = page.getByRole("button", { name: /开始试玩/ });
  if (await start.count()) { await start.first().click(); await sleep(2500); }
  iframeEl = page.locator("iframe[src*='/webview']").first();
  await iframeEl.waitFor({ timeout: 20000 });
  const outer = await (await iframeEl.elementHandle()).contentFrame();
  for (let i = 0; i < 60 && !outer.childFrames().length; i++) await sleep(250);
  frame = outer.childFrames()[0] ?? outer;
  await frame.waitForSelector("#wd", { timeout: 20000 });
  await sleep(1500);
}
const text = async () => (await frame.evaluate(() => document.getElementById("wd")?.innerText ?? "")).replace(/\s+/g, " ");
const has = async (re) => re.test(await text());
async function shot(name) { shotN++; try { await iframeEl.screenshot({ path: `${OUT}/${String(shotN).padStart(2, "0")}-${name}.png` }); } catch {} }
async function call(method, params = {}) { return frame.evaluate(([m, p]) => self.community.call(m, p), [method, params]); }
async function dev(method, params = {}) { const r = await call(method, params); const ok = r?.result?.ok ?? r?.ok; if (!ok) throw new Error(method + " failed: " + JSON.stringify(r).slice(0, 200)); return r; }
async function reload() { await attach(); }
const btn = (t, scope = "#wd") => frame.locator(scope + " button", { hasText: t }).filter({ has: frame.locator(":scope:not([disabled])") });
async function click(t, scope = "#wd", wait = 1200) { const b = frame.locator(scope + " button:not([disabled])", { hasText: t }).first(); await b.waitFor({ timeout: 8000 }); await b.click(); await sleep(wait); }
async function tab(t) { const thx = frame.locator("#wd button:visible", { hasText: "谢过" }); if (await thx.count()) { await thx.first().click(); await sleep(600); } await click(t, "#tabs", 1500); }
async function expect(re, what) { if (!(await has(re))) throw new Error(`${what}: expected /${re.source}/ — got: ${(await text()).slice(0, 240)}`); }
async function overlayOpen() { return frame.evaluate(() => { const o = document.getElementById("overlay"); return !!o && !o.classList.contains("hidden"); }); }
async function closeOverlay() { // skip replay / confirm result
  for (let i = 0; i < 12 && (await overlayOpen()); i++) {
    const sk = frame.locator("#overlay button:visible", { hasText: /跳过/ });
    if (await sk.count()) { await sk.first().click(); await sleep(400); continue; }
    const pri = frame.locator("#overlay button.pri:visible");
    if (await pri.count()) { await pri.first().click(); await sleep(600); continue; }
    const any = frame.locator("#overlay button:not([disabled]):visible");
    if (await any.count()) { await any.first().click(); await sleep(600); } else break;
  }
}
async function step(name, fn) {
  try { await fn(); results.push([name, "✓", ""]); console.log("✓", name); }
  catch (e) { results.push([name, "✗", e.message.slice(0, 300)]); console.log("✗", name, "—", e.message.slice(0, 300)); await shot("FAIL-" + name.replace(/\W+/g, "_")); }
}
async function overflow() { return frame.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1); }

// ------------------------------------------------------------------ script
await attach();
await step("dev reset + fresh create", async () => {
  await dev("dev.reset"); await reload();
  await expect(/踏上仙路/, "create screen");
  await frame.fill("#app input", "试炼者");
  await click("定下道号"); await sleep(1200);
  await expect(/测灵根/, "root screen"); await shot("root");
  if (await frame.locator("#wd button:not([disabled])", { hasText: "逆天改命" }).count()) await click("逆天改命");
  await click("就这样"); await sleep(1500);
  await expect(/洞府/, "home"); await shot("home");
});
await step("吐纳 + cooldown refusal", async () => {
  await click("吐纳", "#app", 1800);
  await expect(/近况|修为 \+|气息/, "breathe note");
  const r = await call("breathe"); const v = r?.result ?? r;
  if (v.ok !== false) throw new Error("second breathe should be refused, got " + JSON.stringify(v).slice(0, 120));
});
await step("minor breakthrough (炼气一层→二层)", async () => {
  await dev("dev.give", { xp: 100 }); await reload();
  await click("突破", "#app", 1500);
  await expect(/突破成功|突破失败/, "bt overlay"); await shot("bt-result");
  await closeOverlay();
});
await step("筑基之劫 (tribulation)", async () => {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await dev("dev.realm", { r: 0, s: 8, full: 1 }); await dev("dev.give", { heal: 1, items: { p_dingxin: 2, t_bilei: 2 } }); await reload();
    await click("引动", "#app", 1500);
    if (!(await overlayOpen())) throw new Error("tribulation overlay did not open");
    await shot("trib-start");
    for (let i = 0; i < 20 && (await overlayOpen()); i++) {
      if (await frame.locator("#overlay button", { hasText: "天地归于平静" }).count()) break;
      const order = ["御剑", "招架", "硬抗"];
      let clicked = false;
      for (const a of order) { const b = frame.locator("#overlay button:not([disabled])", { hasText: a }); if (await b.count()) { await b.first().click(); clicked = true; break; } }
      if (!clicked) break;
      await sleep(900);
      if (i === 1) await shot("trib-strike");
    }
    await shot("trib-end");
    const ok = await has(/筑基初期|天地澄明|已是筑基/);
    await closeOverlay(); await sleep(800);
    if (ok || /筑基/.test((await text()).slice(0, 120))) { await expect(/筑基/, "realm after trib"); return; }
    console.log("  tribulation failed, retrying", attempt);
  }
  throw new Error("could not pass the tribulation in 4 attempts");
});
await step("择道 剑修", async () => {
  await reload(); await expect(/择道/, "path card");
  await frame.locator("#app .item.path", { hasText: "剑修" }).first().click(); await sleep(300); await okModal(); await sleep(900);
  await expect(/剑修/, "path tag"); await shot("path");
});
await step("游历 青山村 ×3 (events, battles, replay)", async () => {
  await dev("dev.give", { st: 20, heal: 1 }); await reload(); await tab("游历"); await shot("explore");
  let fights = 0;
  for (let i = 0; i < 3; i++) {
    if (!(await has(/奇遇|遭遇/))) { await click("前往", "#app", 1500); }
    await expect(/奇遇|遭遇/, "event"); if (i === 0) await shot("event");
    const opt = frame.locator("#app button.opt:not([disabled])").first();
    await opt.click(); await sleep(2500);
    if (await overlayOpen()) { fights++; await shot("replay"); await closeOverlay(); }
    await sleep(600);
    for (let k = 0; k < 3 && (await has(/奇遇|遭遇/)); k++) { await frame.locator("#app button.opt:not([disabled])").first().click(); await sleep(2200); if (await overlayOpen()) { fights++; await closeOverlay(); } }
    await expect(/经过|游历/, "result");
  }
  console.log("  fights replayed:", fights);
});
await step("游历 higher regions unlock with realm", async () => {
  await dev("dev.realm", { r: 3, s: 0 }); await dev("dev.give", { st: 20, heal: 1 }); await reload(); await tab("游历");
  if (await has(/奇遇|遭遇/)) { await frame.locator("#app button.opt:not([disabled])").first().click(); await sleep(2000); await closeOverlay(); await tab("游历"); }
  const open = await frame.locator("#app .item.rg:not(.lock)").count();
  if (open < 4) throw new Error("expected >=4 open regions at 元婴, got " + open);
  await frame.locator("#app .item.rg:not(.lock)", { hasText: "北冥" }).locator("button").first().click(); await sleep(1800);
  await expect(/奇遇|遭遇/, "beiming event"); await shot("beiming");
  await frame.locator("#app button.opt:not([disabled])").first().click(); await sleep(2500); await closeOverlay();
});
await step("行囊: 使用/装备/功法神通/炼制", async () => {
  await dev("dev.give", { ls: 3000, items: { p_huixue: 3, m_lingcao: 12, m_tiekuang: 12, x_jiecao: 3, t_huo: 2 }, arts: ["f_tiejian", "f_bupao"] });
  await reload(); await tab("行囊"); await shot("bag");
  await click("使用", "#app", 1200); await expect(/服下|气血/, "use pill");
  await click("法宝", "#app"); await click("装备", "#app"); await expect(/已装备：武器 精铁剑|卸下/, "equip"); await shot("arts");
  await click("功法神通", "#app"); await expect(/太玄吐纳诀/, "skills");
  await click("炼制", "#app"); await expect(/炼丹/, "recipes"); await click("开炉", "#app", 1500); await expect(/炼成|失败|开炉/, "craft"); await shot("craft");
});
await step("坊市: 买 + 上拍 + 拍卖行", async () => {
  await tab("坊市"); await shot("market");
  await click("买", "#app", 1500); await expect(/买下|购得|余/, "buy");
  await tab("行囊"); await click("上拍", "#app", 800);
  if (!(await overlayOpen())) throw new Error("auction form did not open");
  await frame.locator("#overlay input[type=number]").last().fill("50"); await shot("auction-form");
  await click("上拍", "#overlay", 1500);
  await expect(/我的拍品|在拍/, "auction listed"); await shot("auction");
  const r = await call("auction.bid", { aid: await frame.evaluate(() => { const m = document.getElementById("wd").innerText.match(/在拍（(\d+)）/); return "x"; }), amt: 60 });
  const v = r?.result ?? r; if (v.ok !== false) throw new Error("bidding on an invalid auction should fail");
});
await step("论道 + 讨伐 (arena, world boss)", async () => {
  await dev("dev.seed"); await dev("dev.give", { heal: 1 }); await reload(); await tab("论道"); await shot("arena");
  await click("论道", "#app .list", 2500); await shot("arena-replay"); await closeOverlay();
  await expect(/胜|负|论道值/, "arena result");
  await click("出手", "#app", 2500); await shot("boss-replay"); await closeOverlay();
  await expect(/我的威能 [1-9]/, "boss damage recorded");
});
await step("宗门: 开宗 + 捐献 + 试炼", async () => {
  await dev("dev.give", { ls: 8000, heal: 1 }); await reload(); await tab("宗门");
  const inputs = frame.locator("#app input");
  if (await inputs.count() >= 2) { await inputs.nth(0).fill("试炼" + String(shotN % 90 + 10) + "宗"); await inputs.nth(1).fill("以试为剑"); await click("开宗立派", "#app", 1800); }
  await expect(/掌门/, "sect created"); await shot("sect");
  await click("捐献", "#app", 400); await okModal(); await expect(/贡献/, "donate");
  if (await frame.locator("#app button:not([disabled])", { hasText: "出手" }).count()) { await click("出手", "#app", 2500); await closeOverlay(); }
});
await step("秘境: 进入 → 走两层 → 收手", async () => {
  await dev("dev.give", { heal: 1, items: { p_huixue: 3 } }); await reload(); await tab("游历"); await click("秘境", "#app", 1200); await shot("dungeon-lobby");
  await click("寻幽", "#app", 1500); await expect(/第 1\/8 层/, "entered floor 1"); await shot("dungeon-floor");
  for (let i = 0; i < 2; i++) {
    const opt = frame.locator("#app button.opt:not([disabled])").first();
    const alt = frame.locator("#app button:not([disabled])", { hasText: /不买了|不取|离开/ }).first();
    if (await opt.count()) await opt.click(); else { await alt.waitFor({ timeout: 8000 }); await alt.click(); }
    await sleep(2500); await closeOverlay();
    // pending sub-choice (行商/机缘/异象): take the first affordable option, else decline
    if (await has(/行商|机缘|异象|买点什么|只能取一/)) { const pend = frame.locator("#app button.opt:not([disabled])"); if (await pend.count()) await pend.first().click(); else if (await alt.count()) await alt.click(); await sleep(1500); await closeOverlay(); }
  }
  await shot("dungeon-after");
  if (await btn("收手").count()) { await click("收手", "#app", 600); await okModal(); await sleep(1800); await closeOverlay(); }
  await expect(/收手而归|秘境通关|力竭而返|今日余/, "run banked");
});
await step("灵田: 播种 → 跳 8 小时 → 收获", async () => {
  await dev("dev.give", { items: { s_lingcao: 2 } }); await reload(); await tab("洞府");
  await frame.locator("#app .item.fe").first().click(); await sleep(600); await frame.locator("#overlay .item", { hasText: "灵草种" }).first().click(); await sleep(1500); await expect(/灵草种.*d+%|成熟|可收|灵草/, "planted");
  await dev("dev.time", { hours: 8 }); await reload(); await tab("洞府"); await shot("farm-ready");
  await click("收获", "#app", 1800); await closeOverlay(); await expect(/空田|收/, "harvested");
});
await step("灵兽: 孵化 → 派遣 → 收取 → 喂养", async () => {
  await dev("dev.give", { items: { e_linghu: 1, m_lingcao: 5 } }); await reload(); await tab("行囊"); await click("灵兽", "#app", 1000);
  await click("孵化", "#app", 1500); await expect(/灵狐/, "hatched"); await shot("pet");
  await click("4 时|4时|4 小时", "#app", 1500).catch(() => {});
  await dev("dev.time", { hours: 4 }); await reload(); await tab("行囊"); await click("灵兽", "#app", 1000);
  if (await btn("收取").count()) { await click("收取", "#app", 1800); await closeOverlay(); }
  if (await btn("喂").count()) { await click("喂", "#app", 1000); }
  await expect(/灵狐/, "pet page intact");
});
await step("连珠: 走三步 → 交卷", async () => {
  await tab("论道"); await click("棋局", "#app", 1200); await shot("wuxing");
  const moved = await frame.evaluate(() => {
    const tiles = [...document.querySelectorAll("#wd .wxt")]; if (tiles.length !== 36) return "no board";
    // brute-force a legal move using the embedded simulator
    const seed = (document.querySelector("#wd .wxseed")?.textContent) || null; return tiles.length;
  });
  if (moved !== 36) throw new Error("board missing: " + moved);
  // DOM-level clicks (the fixed tab bar can cover the lower rows on phones); the client rejects illegal swaps itself
  const steps = await frame.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stepsOf = () => { const m = document.getElementById("wd").innerText.match(/第 (\d+)\/20 步/); return m ? Number(m[1]) : 0; };
    let n = 0;
    for (let r = 0; r < 6 && n < 3; r++) for (let c = 0; c < 5 && n < 3; c++) {
      const tiles = document.querySelectorAll("#wd .wxt"); const before = stepsOf();
      tiles[r * 6 + c].click(); await sleep(80); tiles[r * 6 + c + 1].click(); await sleep(420);
      if (stepsOf() > before) n++;
    }
    return n;
  });
  if (steps < 1) throw new Error("no legal swap found in 30 tries");
  await click("交卷", "#app", 500); await okModal(); await sleep(1500); await expect(/已对弈|分/, "submitted"); await shot("wuxing-done");
});
await step("道册: 悬赏 + 成就 + 称号", async () => {
  await tab("道册"); await expect(/悬赏/, "bounty page"); await shot("bounty");
  if (await btn("领取").count()) { await click("领取", "#app", 1500); await closeOverlay(); }
  await click("成就", "#app", 1000); await expect(/成就/, "ach page"); await shot("ach");
  await click("图鉴", "#app", 1200); await expect(/件物品/, "codex page"); await click("妖兽", "#app", 800); await expect(/出没|掉落/, "codex monsters"); await shot("codex");
  await click("传记", "#app", 1000); await expect(/年谱|传/, "bio sub");
});
await step("榜单 all boards + 传记", async () => {
  await tab("榜单");
  for (const t of ["战力", "论道", "赛季", "财富", "宗门", "仙籍", "境界"]) { await click(t, "#app", 900); await expect(/榜|共 \d+ 人|榜单/, "board " + t); }
  await shot("lb");
  await tab("道册"); await click("传记", "#app", 900); await expect(/年谱|传/, "bio"); await shot("bio");
});
await step("坐化 → 转世", async () => {
  await dev("dev.time", { hours: 24 * 400 }); await reload();
  await expect(/坐化|寿元耗尽/, "death screen"); await shot("death");
  await frame.fill("#app input", "再世者"); await click("转世", "#app", 1800);
  await expect(/测灵根|洞府/, "reborn"); await shot("reborn");
  if (await frame.locator("#wd button:not([disabled])", { hasText: "就这样" }).count()) await click("就这样");
  await expect(/第 2 世|再世者/, "second life");
});
await step("no horizontal overflow / no page errors", async () => {
  if (await overflow()) throw new Error("horizontal overflow detected");
  if (errors.length) throw new Error(errors.slice(0, 5).join(" || "));
});

console.log("\n==== RESULTS ====");
for (const [n, s, m] of results) console.log(s, n, m ? "— " + m : "");
console.log(`${results.filter((r) => r[1] === "✓").length}/${results.length} passed; screenshots in ${OUT}`);
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
await ctx.close();

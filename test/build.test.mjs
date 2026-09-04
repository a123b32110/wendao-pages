// The bundle (src/main.js) must behave exactly like lib/: the build stripper may only remove
// comments/indentation outside strings and template literals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as lib from "../lib/main.js";

test("build: bundle imports, templates untouched, size under cap", async () => {
  execFileSync(process.execPath, ["tools/build.mjs"], { stdio: "pipe" });
  const src = readFileSync("src/main.js", "utf8");
  assert.ok(Buffer.byteLength(src, "utf8") < 512 * 1024, "bundle under 512 KB");
  const comments = [...src.replace(/`[\s\S]*?`/g, "``").matchAll(/^[ \t]*\/\/.*$/gm)].map((x) => x[0]).filter((l) => !/^\/\/ (----|GENERATED)/.test(l));
  assert.deepEqual(comments, [], "no line comments left outside templates");
  const m = await import("../src/main.js?" + Date.now());
  assert.equal(typeof m.webview, "function");
  const ctx = { user: { id: 1, username: "u1" } };
  const a = await m.webview(ctx), b = await lib.webview(ctx);
  // 平台对 webview 输出也有 512 KB 上限，超了整张卡片 404（2026-09-04 v48 全服进不去）。留足余量。
  assert.ok(Buffer.byteLength(a.html + a.css + a.js, "utf8") < 400 * 1024, `webview 输出 ${Buffer.byteLength(a.html + a.css + a.js, "utf8")} 字节，必须远低于平台 512 KB 上限`);
  assert.equal(a.html, b.html);
  assert.equal(a.css, b.css, "pageCss verbatim");
  // the client embeds wxSim via Function#toString, whose whitespace the stripper legitimately changes
  const norm = (s) => s.replace(/var wxSim=function[\s\S]*?\n\};/, "var wxSim=<fn>;").replace(/\s+/g, " ");
  assert.equal(norm(a.js), norm(b.js), "pageJs (client source + assets) verbatim apart from wxSim whitespace");
  assert.ok(a.js.includes("var wxSim=function") && b.js.includes("var wxSim=function"), "wxSim embedded");
});

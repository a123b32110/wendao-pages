import * as app from "./src/main.js";

const STORAGE_KEY = "wendao.github-pages.v1";
const PLAYER_UID = 1;
const PLAYER = { id: PLAYER_UID, username: "local-player", avatar_url: null };
const clone = (value) => value === undefined ? undefined : structuredClone(value);

function freshState() {
  return {
    version: 1,
    users: {},
    shared: {},
    points: {},
    schedules: {},
    meta: { rivalsSeeded: false },
  };
}

function validState(value) {
  return value && value.version === 1 && value.users && value.shared && value.points && value.schedules && value.meta;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return freshState();
  try {
    const parsed = JSON.parse(raw);
    return validState(parsed) ? parsed : freshState();
  } catch {
    return freshState();
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    throw new Error(`瀏覽器無法保存存檔：${error?.message ?? error}`);
  }
}

function userStore(uid) {
  const key = String(uid);
  state.users[key] ??= {};
  return state.users[key];
}

function apiFor(uid) {
  const priv = uid === null ? {} : userStore(uid);
  return {
    kv: {
      get: async (key) => clone(priv[key] ?? null),
      list: async () => Object.entries(priv).map(([key, value]) => ({ key, value: clone(value) })),
      listPublic: async () => Object.entries(state.shared).map(([key, value]) => ({ key, value: clone(value) })),
    },
    points: {
      balance: async () => Number(state.points[String(uid)] ?? 0),
    },
  };
}

function applyEffects(uid, effects = []) {
  const priv = uid === null ? null : userStore(uid);
  for (const effect of effects) {
    switch (effect.type) {
      case "kv.set":
        if (!priv) throw new Error("排程不可寫入玩家私有存檔");
        priv[effect.key] = clone(effect.value);
        break;
      case "kv.delete":
        if (!priv) throw new Error("排程不可刪除玩家私有存檔");
        delete priv[effect.key];
        break;
      case "kv.shared.set":
        state.shared[effect.key] = clone(effect.value);
        break;
      case "kv.shared.delete":
        delete state.shared[effect.key];
        break;
      case "points.award": {
        const key = String(uid);
        state.points[key] = Number(state.points[key] ?? 0) + Number(effect.amount ?? 0);
        break;
      }
      case "schedule.add":
        state.schedules[effect.job_key] = Date.now() + Math.max(0, Number(effect.in_seconds ?? 0)) * 1000;
        break;
      case "schedule.cancel":
        delete state.schedules[effect.job_key];
        break;
      case "rt.publish":
      case "ui.toast":
      case "ui.navigate":
        break;
      default:
        throw new Error(`不支援的平台效果：${effect.type}`);
    }
  }
}

function userFor(uid, username = `u${uid}`) {
  return { id: uid, username, avatar_url: null };
}

async function callFor(uid, username, method, params = {}) {
  const out = await app.onMessage({
    install_id: 1,
    version: 1,
    locale: "zh_CN",
    config: {},
    topic_id: 1,
    post_id: 1,
    category_id: 1,
    user: userFor(uid, username),
    state: {},
    method,
    params,
    now: Date.now(),
  }, apiFor(uid));
  applyEffects(uid, out.effects ?? []);
  return out;
}

async function seedRivals() {
  if (state.meta.rivalsSeeded) return;
  const rivals = [
    [11, "青雲子", 1, 2, 7700, "jian", 1153],
    [12, "赤霞仙子", 2, 0, 8400, "fa", 1176],
    [13, "鐵牛", 1, 1, 9100, "ti", 1199],
    [14, "顧寒", 3, 2, 9800, "xie", 1222],
    [15, "白衣客", 2, 1, 10500, "dan", 1245],
    [16, "老壇主", 0, 2, 11200, null, 1268],
  ];

  for (const [uid, name, realm, stage, stones, path, rating] of rivals) {
    const store = userStore(uid);
    if (!store.c) await callFor(uid, name, "create", { name });
    const character = store.c;
    if (!character) continue;
    character.r = realm;
    character.s = stage;
    character.ls = stones;
    character.path = realm >= 1 ? path : null;
    character.season = { ...(character.season ?? {}), ar: rating, ss: uid * 7, w: uid % 5, l: 1, sync: Date.now() };
    await callFor(uid, name, "home");
  }

  state.meta.rivalsSeeded = true;
  saveState();
}

async function runDueSchedules() {
  let runs = 0;
  while (runs < 3) {
    const now = Date.now();
    const due = Object.entries(state.schedules).find(([, at]) => Number(at) <= now);
    if (!due) break;
    const [jobKey] = due;
    delete state.schedules[jobKey];
    const out = await app.onSchedule({ now, job_key: jobKey }, apiFor(null));
    applyEffects(null, out.effects ?? []);
    runs += 1;
  }
  if (runs) saveState();
}

async function playerCall(method, params = {}) {
  await runDueSchedules();
  const out = await app.onMessage({
    install_id: 1,
    version: 1,
    locale: "zh_CN",
    config: {},
    topic_id: 1,
    post_id: 1,
    category_id: 1,
    user: PLAYER,
    state: {},
    method,
    params,
    now: Date.now(),
  }, apiFor(PLAYER_UID));
  applyEffects(PLAYER_UID, out.effects ?? []);
  saveState();
  return out;
}

let serial = Promise.resolve();
function enqueue(task) {
  const next = serial.then(task, task);
  serial = next.catch(() => {});
  return next;
}

function showFatal(error) {
  const root = document.querySelector("#game-root");
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal";
  box.textContent = `無法啟動遊戲\n${error?.stack ?? error}`;
  root.append(box);
}

function downloadSave() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `wendao-save-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function mount() {
  await seedRivals();
  await runDueSchedules();

  window.community = {
    call(method, params) {
      return enqueue(() => playerCall(String(method ?? "boot"), params && typeof params === "object" ? params : {}));
    },
  };

  const page = await app.webview({ user: PLAYER, state: {} }, apiFor(PLAYER_UID));
  const root = document.querySelector("#game-root");
  root.innerHTML = page.html;

  const style = document.createElement("style");
  style.textContent = page.css;
  document.head.append(style);

  const script = document.createElement("script");
  script.textContent = page.js;
  document.body.append(script);

  document.querySelector("#export-save").addEventListener("click", downloadSave);
  document.querySelector("#reset-save").addEventListener("click", () => {
    if (!window.confirm("確定清除這個瀏覽器內的《問道》單機存檔？此操作無法復原。")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  window.addEventListener("pagehide", () => {
    try { saveState(); } catch {}
  });
  setInterval(() => enqueue(runDueSchedules).catch(console.error), 30_000);
}

mount().catch(showFatal);

// A tiny stand-in for the platform: private kv per user, one shared area, effects applied like the site would.
// WD_BUNDLE=1 runs the same suite against the built bundle (src/main.js) to verify the build transforms.
const app = await import(process.env.WD_BUNDLE ? "../src/main.js" : "../lib/main.js");
export { app };

export class Site {
  constructor(start = Date.UTC(2026, 8, 3, 8)) {
    this.now = start;
    this.shared = new Map();
    this.kv = new Map(); // uid -> Map
    this.points = new Map();
    this.schedule = [];
    this.log = [];
  }
  advance(ms) { this.now += ms; }
  user(uid, username = `u${uid}`) { return { id: uid, username, avatar_url: null }; }
  api(uid) {
    const priv = uid === null ? new Map() : (this.kv.get(uid) ?? (this.kv.set(uid, new Map()), this.kv.get(uid)));
    const shared = this.shared;
    return {
      kv: {
        get: async (k) => structuredClone(priv.get(k) ?? null),
        list: async () => [...priv].map(([key, value]) => ({ key, value: structuredClone(value) })),
        listPublic: async () => [...shared].map(([key, value]) => ({ key, value: structuredClone(value) })),
      },
      points: { balance: async () => this.points.get(uid) ?? 0 },
    };
  }
  apply(uid, effects) {
    const priv = uid === null ? null : this.kv.get(uid);
    for (const e of effects) {
      switch (e.type) {
        case "kv.set": priv.set(e.key, structuredClone(e.value)); break;
        case "kv.delete": priv.delete(e.key); break;
        case "kv.shared.set": this.shared.set(e.key, structuredClone(e.value)); break;
        case "kv.shared.delete": this.shared.delete(e.key); break;
        case "points.award": this.points.set(uid, (this.points.get(uid) ?? 0) + e.amount); this.log.push({ uid, award: e }); break;
        // 平台实测规格（2026-08-25 探针）：需 points.spend 权限，字段 {amount,label(1-100),request_id}，
        // 单次上限 100，同 request_id 幂等。任一条不满足平台整批拒收。
        case "points.spend": {
          if (!(Number.isInteger(e.amount) && e.amount > 0 && e.amount <= 100)) throw new Error("E_POINTS_QUOTA");
          if (!e.label || e.label.length < 1 || e.label.length > 100) throw new Error("E_INVALID_EFFECT: label");
          if (!/^[a-zA-Z0-9-]{1,64}$/.test(String(e.request_id ?? ""))) throw new Error("E_INVALID_EFFECT: request_id");
          this.spent = this.spent ?? new Set();
          if (this.spent.has(e.request_id)) break; // 幂等：同键只扣一次
          this.spent.add(e.request_id);
          if ((this.points.get(uid) ?? 0) < e.amount) throw new Error("E_POINTS_QUOTA: balance");
          this.points.set(uid, (this.points.get(uid) ?? 0) - e.amount);
          this.log.push({ uid, spend: e });
          break;
        }
        case "schedule.add": this.schedule.push(e); break;
        case "schedule.cancel": break;
        case "rt.publish": case "ui.toast": case "ui.navigate": break;
        default: throw new Error(`unknown effect ${e.type}`);
      }
      if (e.type.startsWith("kv.") && JSON.stringify(e.value ?? "").length > 64 * 1024) throw new Error(`kv value too large: ${e.key}`);
    }
  }
  async call(uid, method, params = {}) {
    const ctx = { install_id: 1, version: 1, locale: "zh_CN", config: {}, topic_id: 1, post_id: 1, category_id: 1, user: uid === null ? null : this.user(uid), state: {}, method, params, now: this.now };
    const out = await app.onMessage(ctx, this.api(uid));
    this.apply(uid, out.effects ?? []);
    const v = out.result;
    if (v?.ok === false && process.env.HARNESS_VERBOSE) console.log("✗", method, v.msg, v.err ?? "");
    return v;
  }
  // blocks surface: render once, then drive actions; `state` round-trips like the platform's signed token
  async render(uid) {
    const ctx = { user: uid === null ? null : this.user(uid), state: this.uiState ?? {}, now: this.now };
    const out = await app.render(ctx, this.api(uid));
    this.apply(uid, out.effects ?? []);
    this.uiState = out.state;
    return out.blocks;
  }
  async action(uid, actionId, inputs = {}) {
    const ctx = { user: uid === null ? null : this.user(uid), state: this.uiState ?? {}, action_id: actionId, inputs, now: this.now };
    const out = await app.onAction(ctx, this.api(uid));
    this.apply(uid, out.effects ?? []);
    this.uiState = out.state;
    return out.blocks;
  }
  async tick() {
    const out = await app.onSchedule({ now: this.now, job_key: "tick" }, this.api(null));
    this.apply(null, out.effects ?? []);
    return out;
  }
  async trigger(uid) {
    const out = await app.onTrigger({ now: this.now, user: this.user(uid) }, this.api(null));
    this.apply(null, out.effects ?? []);
  }
  // 法宝匣在真实存储里分家到 "arts" 键（单值 8KB 上限）；这里保持同样的读写规则
  char(uid) {
    const m = this.kv.get(uid);
    const c = m?.get("c");
    const a = m?.get("arts");
    if (c && a && Array.isArray(a.list)) c.inv.arts = a.list;
    return c;
  }
  setChar(uid, fn) {
    const c = this.char(uid);
    fn(c);
    const m = this.kv.get(uid);
    m.set("arts", { list: c.inv.arts ?? [] });
    m.set("c", c);
  }
}

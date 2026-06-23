var Ea = Object.defineProperty;
var Ia = (t, e, a) => e in t ? Ea(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var L = (t, e, a) => Ia(t, typeof e != "symbol" ? e + "" : e, a);
import { app as xe, ipcMain as Ut, BrowserWindow as ka } from "electron";
import T from "node:path";
import { fileURLToPath as Ft } from "node:url";
import Aa from "@ngrok/ngrok";
import { config as Ca } from "dotenv";
import { z as s } from "zod";
import Pa from "pino";
import Ra from "obs-websocket-js";
import La from "bottleneck";
import { Redis as et } from "ioredis";
import Ta from "cors";
import He from "express";
import Da from "helmet";
import Na from "node:http";
import { Server as Ma } from "socket.io";
import v, { existsSync as ot } from "node:fs";
import { exec as va } from "node:child_process";
import { promisify as xa } from "node:util";
import { mkdir as Ha, writeFile as Te, access as ja, readFile as be } from "node:fs/promises";
import Bt from "node:https";
const Oa = T.dirname(Ft(import.meta.url));
Ca({ path: T.resolve(Oa, "../.env") });
const Ua = s.object({
  NODE_ENV: s.enum(["development", "test", "production"]).default("development"),
  PORT: s.coerce.number().default(8080),
  BROADCAST_SECRET: s.string().min(8),
  CORS_ORIGINS: s.string().default("http://localhost:3000,http://localhost:5173"),
  STATE_BACKEND: s.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: s.string().optional(),
  REDIS_STATE_KEY: s.string().default("bpc:broadcast:v1"),
  REDIS_UNAVAILABLE_FALLBACK_MEMORY: s.coerce.boolean().default(!1),
  OPENDOTA_RATE_PER_MINUTE: s.coerce.number().default(45),
  GSI_TOKEN: s.string().optional(),
  /** OpenDota league ID — required; all player stats are league-scoped only */
  LEAGUE_ID: s.coerce.number().int().positive(),
  /** Re-fetch league stats from Steam when API starts (if CSV missing). Prefer CSV + manual refresh. */
  LEAGUE_AUTO_AGGREGATE: s.coerce.boolean().default(!1),
  /** Directory for league_{id}_heroes.csv and league_{id}_player_heroes.csv */
  LEAGUE_STATS_DIR: s.string().optional(),
  /** Steam Web API key — required to list amateur/private league matches */
  STEAM_WEB_API_KEY: s.string().optional(),
  /** Optional comma/space-separated match IDs (merged with Steam league history) */
  LEAGUE_MATCH_IDS: s.string().optional(),
  REPLAY_DB_FILE: s.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\replay_db.csv"),
  REPLAY_MATCH_FILE: s.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\active_match.txt"),
  REPLAY_LAST_COMPLETED_FILE: s.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\last_completed_match.txt"),
  REPLAY_PLAYBACK_DIR: s.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\Playback"),
  REPLAY_FOLDER: s.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\Replays")
}), w = Ua.parse(process.env);
function it() {
  return w.CORS_ORIGINS.split(",").map((t) => t.trim()).filter(Boolean);
}
const S = Pa({
  level: process.env.LOG_LEVEL ?? "info"
});
class Fa {
  constructor() {
    L(this, "client", new Ra());
    L(this, "settings", null);
    L(this, "reconnectTimer", null);
  }
  configure(e) {
    this.settings = e;
  }
  /** obs-websocket-js internal flag indicates identified session */
  isConnected() {
    try {
      return !!this.client.identified;
    } catch {
      return !1;
    }
  }
  async connect(e) {
    if (e && (this.settings = e), !this.settings)
      return { ok: !1, error: "OBS settings not configured" };
    try {
      return this.isConnected() && await this.client.disconnect(), await this.client.connect(
        `ws://${this.settings.host}:${this.settings.port}`,
        this.settings.password
      ), S.info("OBS websocket connected"), { ok: !0 };
    } catch (a) {
      return S.error(a, "OBS websocket connect failed"), {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async disconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.isConnected() && await this.client.disconnect().catch(() => {
    }), S.info("OBS websocket disconnected");
  }
  async listScenes() {
    return ((await this.client.call("GetSceneList")).scenes ?? []).map((r) => r.sceneName ?? "").filter(Boolean);
  }
  async setProgramScene(e) {
    try {
      return await this.client.call("SetCurrentProgramScene", { sceneName: e }), { ok: !0 };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async setSourceVisible(e) {
    try {
      const n = ((await this.client.call("GetSceneItemList", {
        sceneName: e.sceneName
      })).sceneItems ?? []).find(
        (i) => typeof i.sceneItemId == "number" && i.sourceName === e.sourceName
      );
      return n ? (await this.client.call("SetSceneItemEnabled", {
        sceneName: e.sceneName,
        sceneItemId: n.sceneItemId,
        sceneItemEnabled: e.visible
      }), { ok: !0 }) : { ok: !1, error: "Scene item not found" };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async triggerHotkeyByName(e) {
    try {
      return await this.client.call("TriggerHotkeyByName", { hotkeyName: e }), { ok: !0 };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async triggerHotkeyBySequence(e, a) {
    try {
      return await this.client.call("TriggerHotkeyByKeySequence", { keyId: e, keyModifiers: a }), { ok: !0 };
    } catch (r) {
      return {
        ok: !1,
        error: r instanceof Error ? r.message : String(r)
      };
    }
  }
  async setInputSettings(e, a) {
    try {
      return await this.client.call("SetInputSettings", { inputName: e, inputSettings: a }), { ok: !0 };
    } catch (r) {
      return {
        ok: !1,
        error: r instanceof Error ? r.message : String(r)
      };
    }
  }
  async restartMediaInput(e) {
    try {
      return await this.client.call("TriggerMediaInputAction", {
        inputName: e,
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
      }), { ok: !0 };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async setCurrentScene(e) {
    try {
      return await this.client.call("SetCurrentProgramScene", { sceneName: e }), { ok: !0 };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  scheduleReconnect(e = 3e3) {
    this.reconnectTimer && clearTimeout(this.reconnectTimer), this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, e);
  }
}
const Ba = "https://api.opendota.com/api";
function $a(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class Ka {
  constructor(e = 600) {
    L(this, "limiter");
    L(this, "memory", /* @__PURE__ */ new Map());
    L(this, "redis", null);
    this.ttlSeconds = e;
    const a = w.OPENDOTA_RATE_PER_MINUTE, r = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new La({
      minTime: r,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new et(e);
  }
  async shutdown() {
    var e;
    await ((e = this.redis) == null ? void 0 : e.quit().catch(() => {
    }));
  }
  async getCached(e, a) {
    const r = Date.now(), n = this.memory.get(e);
    if (n && n.expiry > r) return n.body;
    if (this.redis)
      try {
        const l = await this.redis.get(`opendota:${e}`);
        if (l)
          return { ...JSON.parse(l), stale: !0 };
      } catch (l) {
        S.warn(l, "Redis OpenDota read failed");
      }
    const i = await this.fetchLive(a);
    return i.ok && (this.memory.set(e, {
      expiry: r + this.ttlSeconds * 1e3,
      body: i
    }), this.redis && await this.redis.setex(`opendota:${e}`, this.ttlSeconds, JSON.stringify(i)).catch(() => {
    })), i;
  }
  async fetchLive(e, a = "GET") {
    return this.limiter.schedule(async () => {
      try {
        const r = await fetch(`${Ba}${e}`, {
          method: a,
          signal: AbortSignal.timeout(9e4)
        }), n = await r.text();
        if (!r.ok)
          return {
            ok: !1,
            status: r.status,
            error: n.slice(0, 280)
          };
        try {
          return {
            ok: !0,
            status: r.status,
            data: JSON.parse(n)
          };
        } catch {
          return { ok: !1, status: r.status, error: "invalid json" };
        }
      } catch (r) {
        return {
          ok: !1,
          status: 0,
          error: r instanceof Error ? r.message : String(r)
        };
      }
    });
  }
  async playerProfile(e) {
    return this.getCached(
      `players:${e}:profile`,
      `/players/${e}`
    );
  }
  async playerHeroStats(e) {
    return this.getCached(
      `players:${e}:heroes`,
      `/players/${e}/heroes`
    );
  }
  async heroMatchups(e) {
    return this.getCached(
      `heroes:${e}:matchups`,
      `/heroes/${e}/matchups`
    );
  }
  async leagueMatches(e) {
    return this.getCached(
      `leagues:${e}:matches`,
      `/leagues/${e}/matches`
    );
  }
  async leagueInfo(e) {
    return this.getCached(
      `leagues:${e}:info`,
      `/leagues/${e}`
    );
  }
  async requestMatchParse(e) {
    return this.fetchLive(`/request/${e}`, "POST");
  }
  async matchDetails(e) {
    return this.getCached(
      `matches:${e}:detail`,
      `/matches/${e}`
    );
  }
  async heroesConstants() {
    return this.getCached("constants:heroes", "/heroes");
  }
  /** Head-to-head between two heroes using OpenDota matchups response */
  async matchupBetween(e, a) {
    const r = await this.heroMatchups(e);
    if (!r.ok || r.data === void 0 || r.data === null)
      return {
        ok: !1,
        status: r.status,
        error: r.error ?? "matchup unavailable"
      };
    const n = Array.isArray(r.data) ? r.data : [];
    let i = {};
    for (const l of n)
      if (l && typeof l == "object" && "hero_id" in l) {
        const o = l.hero_id;
        if (typeof o == "number" && o === a) {
          i = l;
          break;
        }
      }
    return {
      ok: !0,
      status: r.status ?? 200,
      data: i
    };
  }
  purgeMemory() {
    this.memory.clear();
  }
}
const J = "Game starting in", $t = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), Ga = $t.partial();
function Se(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Va(t, e, a = Date.now()) {
  if (e.running === !0) {
    const n = e.secondsRemaining ?? (t ? Se(t, a) : 0), i = Math.max(0, Math.floor(n));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? J,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const n = e.secondsRemaining ?? (t ? Se(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? J,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(n))
    };
  }
  const r = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? J,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? Se(t, a) : 0)
  };
  if (r.running && !r.endsAt) {
    const n = Math.max(0, r.secondsRemaining);
    return {
      ...r,
      endsAt: new Date(a + n * 1e3).toISOString()
    };
  }
  return r.running ? r : { ...r, endsAt: null };
}
function lt(t, e = J) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function ct(t, e = J) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const Wa = {
  windrunner: "windranger",
  skeleton_king: "wraith_king",
  shredder: "timbersaw",
  obsidian_destroyer: "outworld_destroyer",
  zuus: "zeus",
  rattletrap: "clockwerk",
  furion: "natures_prophet",
  life_stealer: "lifestealer",
  doom_bringer: "doom",
  abyssal_underlord: "underlord"
};
function qa(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (Wa[e] ?? e);
}
function O(t) {
  return qa(t.replace(/^npc_dota_hero_/, "").trim());
}
function Ya(t) {
  if (!t)
    return {};
  const e = O(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Kt(e)
  } : {};
}
function Kt(t, e) {
  const a = O(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function za(t, e) {
  const a = O(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function Ja(t, e) {
  const a = O(t);
  if (!a)
    return {};
  const r = Kt(a), n = za(a);
  return {
    staticUrl: r,
    staticFallbackUrl: r,
    animatedUrl: n
  };
}
function Gt(t) {
  return `/teams/${t}.png`;
}
function je(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function Qa(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Map();
  for (const n of t) {
    const i = O(n.name);
    if (!i)
      continue;
    e.set(n.id, i), a.add(i), r.set(je(n.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    r.set(je(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: r };
}
function Xa(t, e) {
  const { heroId: a, heroClass: r, heroName: n, urlSlug: i } = t;
  if (i) {
    const l = O(i);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "url" };
  }
  if (a != null && a > 0) {
    const l = e.byId.get(a);
    if (l)
      return { slug: l, source: "id" };
  }
  if (r) {
    const l = O(r);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [n, r]) {
    if (!l)
      continue;
    const o = je(l), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (r) {
    const l = O(r);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function Re(t, e, a) {
  var n, i;
  const r = e === "radiant" ? (n = t == null ? void 0 : t.pickPlayers) == null ? void 0 : n.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!r || a < 0 || a >= r.length))
    return r[a] ?? null;
}
function Za(t, e, a) {
  var n, i;
  const r = Re(t == null ? void 0 : t.matchSetup, e, a);
  if (!(r == null || !((n = t == null ? void 0 : t.roster) != null && n.length)))
    return (i = t.roster.find((l) => l.steam32 === r)) == null ? void 0 : i.displayName;
}
function Vt(t, e, a) {
  const r = a == null ? void 0 : a.find((n) => n.type === "pick" && n.heroId === e);
  return r == null ? void 0 : r.order;
}
function er(t, e) {
  return `${t}:${e}`;
}
function Oe(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let r = 0, n = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (r += l.games, n += l.wins);
  return { games: r, wins: n };
}
function Wt(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[er(e, a)];
}
function Ue(t, e) {
  if (Oe(t, e).games <= 0)
    return;
  const a = `${e}:`, r = {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    heroDamage: 0,
    goldPerMin: 0,
    lastHits: 0,
    maxKills: 0,
    laneWins: 0,
    laneDraws: 0,
    laneLosses: 0
  };
  for (const [l, o] of Object.entries(t ?? {}))
    !l.startsWith(a) || o.games <= 0 || (r.games += o.games, r.wins += o.wins, r.kills += o.avgKills * o.games, r.deaths += o.avgDeaths * o.games, r.assists += o.avgAssists * o.games, r.heroDamage += o.avgHeroDamage * o.games, r.goldPerMin += o.avgGpm * o.games, r.lastHits += o.avgLastHits * o.games, r.maxKills = Math.max(r.maxKills, o.maxKills), r.laneWins += o.laneWins ?? 0, r.laneDraws += o.laneDraws ?? 0, r.laneLosses += o.laneLosses ?? 0);
  const n = r.games, i = r.deaths > 0 ? (r.kills + r.assists) / r.deaths : r.kills + r.assists;
  return {
    games: n,
    wins: r.wins,
    winRate: r.wins / n,
    avgKills: r.kills / n,
    avgDeaths: r.deaths / n,
    avgAssists: r.assists / n,
    avgKda: i,
    maxKills: r.maxKills,
    avgHeroDamage: r.heroDamage / n,
    avgGpm: r.goldPerMin / n,
    avgLastHits: r.lastHits / n,
    laneWins: r.laneWins,
    laneDraws: r.laneDraws,
    laneLosses: r.laneLosses
  };
}
const tr = [
  "draft",
  "game",
  "lowerthird",
  "playerstats",
  "herostats",
  "matchup",
  "pause",
  "startingsoon",
  "postgame",
  "sponsors",
  "versus",
  "replay",
  "global_kill_switch"
], ar = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), qt = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  ar
]), rr = s.object({
  teamA: s.string(),
  teamB: s.string(),
  scoreA: s.number(),
  scoreB: s.number(),
  logoUrlA: s.string().optional(),
  logoUrlB: s.string().optional(),
  /** Series format set in admin (1, 3, or 5) */
  bestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).optional(),
  /** Current game in the series (1-based), set in admin */
  gameNumber: s.number().int().min(1).max(5).optional()
}), nr = s.object({
  steam32: s.number(),
  displayName: s.string(),
  teamName: s.string().optional(),
  teamKey: s.string().optional(),
  /** Brand hex from roster CSV (e.g. `#1e4d8c`) */
  teamColor: s.string().optional(),
  /** Steam avatar; optional CSV column or filled from OpenDota on roster upload */
  avatarUrl: s.string().optional(),
  /** @deprecated use leagueConfig.matchSetup instead */
  side: s.enum(["radiant", "dire", "A", "B"]).optional()
}), Yt = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), zt = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: Yt.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional()
}), Jt = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(nr).default([]),
  matchSetup: zt.nullable().optional(),
  /** Brand colors keyed by CSV `teamKey` (hex, e.g. `#1e4d8c`) */
  teamColors: s.record(s.string(), s.string()).optional(),
  aggregatedAt: s.string().optional(),
  aggregationStatus: s.enum(["idle", "running", "ready", "error"]).default("idle"),
  aggregationProgress: s.number().min(0).max(100).optional(),
  aggregationError: s.string().optional(),
  aggregationMatchTotal: s.number().optional(),
  aggregationMatchDone: s.number().optional(),
  /** Where stats were last loaded from */
  aggregationSource: s.enum(["csv", "api"]).optional(),
  statsCsvDir: s.string().optional()
}), Qt = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  picks: s.number().default(0),
  bans: s.number().default(0),
  wins: s.number().default(0),
  losses: s.number().default(0),
  games: s.number().default(0),
  pickRate: s.number().optional(),
  banRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional()
}), Xt = s.object({
  games: s.number(),
  wins: s.number(),
  winRate: s.number(),
  avgKills: s.number(),
  avgDeaths: s.number(),
  avgAssists: s.number(),
  avgKda: s.number(),
  maxKills: s.number(),
  avgHeroDamage: s.number(),
  avgGpm: s.number(),
  avgLastHits: s.number(),
  /** Lane phase W/D/L in league (EFF@10 vs lane opponent) */
  laneWins: s.number().optional(),
  laneDraws: s.number().optional(),
  laneLosses: s.number().optional()
}), Zt = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), Fe = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(Zt),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), ea = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), sr = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), or = s.object({
  order: s.number(),
  type: s.enum(["pick", "ban"]),
  heroId: s.number().nullable(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  /** Steam CDN render WebM for draft pick cards */
  heroPortraitAnimatedUrl: s.string().optional(),
  playerName: s.string().optional(),
  /** Steam account id (32-bit) for roster CSV lookup */
  steam32: s.number().optional()
}), ut = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(or).optional(),
  bonusTime: s.number().optional()
}), ir = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), Be = s.object({
  series: rr,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(sr).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: ut.optional(),
  dire: ut.optional(),
  lastPick: ir.optional()
}), $e = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), lr = s.object({
  match: s.number(),
  replayId: s.number(),
  file: s.string(),
  favorite: s.boolean(),
  duration: s.number(),
  filename: s.string()
});
s.object({
  currentMatch: s.number(),
  lastCompletedMatch: s.number(),
  replays: s.array(lr)
});
const Ke = s.object({
  steam32: s.number().optional(),
  playerLabel: s.string(),
  heroId: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  statLines: s.array(s.object({
    label: s.string(),
    value: s.string()
  })).optional(),
  notes: s.string().optional()
}), cr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), ur = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), Ge = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: ur.optional(),
  steam32: s.number().optional(),
  playerLabel: s.string(),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  /** Steam profile picture when showing player league stats */
  playerAvatarUrl: s.string().optional(),
  /** Team logo watermark for league-aggregate player cards (`/teams/{teamKey}.png`) */
  teamLogoUrl: s.string().optional(),
  /** Brand hex from roster for league-aggregate theming */
  teamColor: s.string().optional(),
  tournament: cr.optional(),
  playerHero: s.object({
    games: s.number().optional(),
    wins: s.number().optional(),
    losses: s.number().optional(),
    winRate: s.number().optional(),
    avgKills: s.number().optional(),
    avgDeaths: s.number().optional(),
    avgAssists: s.number().optional(),
    avgKda: s.number().optional(),
    maxKills: s.number().optional(),
    avgHeroDamage: s.number().optional(),
    avgGpm: s.number().optional(),
    avgLastHits: s.number().optional()
  }).optional(),
  statSlides: s.array(Zt).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
}), Ve = s.object({
  heroAId: s.number(),
  heroBId: s.number(),
  heroAName: s.string().optional(),
  heroBName: s.string().optional(),
  heroAPortraitSlug: s.string().optional(),
  heroBPortraitSlug: s.string().optional(),
  heroAPortraitUrl: s.string().optional(),
  heroBPortraitUrl: s.string().optional(),
  matchup: s.record(s.any()).optional(),
  statLines: s.array(s.object({ label: s.string(), value: s.string() })).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
}), We = s.object({
  banners: s.array(s.object({
    title: s.string(),
    subtitle: s.string().optional(),
    imageUrl: s.string().optional(),
    durationSeconds: s.number().positive()
  })),
  activeIndex: s.number().nonnegative(),
  startedAt: s.number().optional()
}), dr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: $t.optional()
}), ta = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(qt).default({}),
  sceneHints: ta.optional(),
  leagueConfig: Jt.optional(),
  tournamentHeroIndex: s.record(Qt).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(Xt).optional(),
  production: ea.optional(),
  statCarousel: Fe.nullable().optional(),
  draft: Be.nullable().optional(),
  lowerThirds: $e.nullable().optional(),
  playerStatsCard: Ke.nullable().optional(),
  heroStatsCard: Ge.nullable().optional(),
  matchupCard: Ve.nullable().optional(),
  sponsor: We.nullable().optional(),
  timers: dr.optional()
});
const mr = s.object({
  overlayVisibility: s.record(qt).optional(),
  leagueConfig: Jt.partial().optional(),
  tournamentHeroIndex: s.record(Qt).optional(),
  playerHeroIndex: s.record(Xt).optional(),
  production: ea.partial().optional(),
  statCarousel: s.union([Fe, Fe.partial(), s.null()]).optional(),
  draft: s.union([Be, Be.partial(), s.null()]).optional(),
  lowerThirds: s.union([$e, $e.partial(), s.null()]).optional(),
  playerStatsCard: s.union([Ke, Ke.partial(), s.null()]).optional(),
  heroStatsCard: s.union([Ge, Ge.partial(), s.null()]).optional(),
  matchupCard: s.union([Ve, Ve.partial(), s.null()]).optional(),
  sponsor: s.union([
    We,
    We.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: Ga.optional()
  }).partial().optional(),
  sceneHints: ta.partial().optional()
});
function gr() {
  const t = {};
  for (const e of tr)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function fr() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function aa() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: gr(),
    sceneHints: {},
    leagueConfig: fr(),
    tournamentHeroIndex: {},
    playerHeroIndex: {},
    production: {
      gsiManualOverride: !1,
      autoShowStatsOnPick: !1,
      gsiConnected: !1,
      playerMappingPublished: !1,
      overlayDraftEpoch: 0
    },
    statCarousel: null,
    draft: null,
    lowerThirds: null,
    playerStatsCard: null,
    heroStatsCard: null,
    matchupCard: null,
    sponsor: null,
    timers: {}
  };
}
const $ = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, K = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function _(t, e, a) {
  let r;
  const n = t.headers.authorization;
  if (n != null && n.startsWith("Bearer ") ? r = n.slice(7).trim() : typeof t.query.token == "string" && (r = t.query.token), !r) {
    e.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (r !== w.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function hr(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function dt(t, e) {
  if (!e)
    return t;
  if (!(t != null && t.length))
    return e;
  const a = new Map(t.map((r) => [`${r.type}:${r.order}`, r]));
  return e.map((r) => {
    const n = a.get(`${r.type}:${r.order}`);
    return !(n != null && n.playerName) && (n == null ? void 0 : n.steam32) === void 0 ? r : {
      ...r,
      playerName: r.playerName ?? n.playerName,
      steam32: r.steam32 ?? n.steam32
    };
  });
}
function pr(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const r = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, n = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return r != null && r.slots && (r.slots = dt((i = t.radiant) == null ? void 0 : i.slots, r.slots)), n != null && n.slots && (n.slots = dt((l = t.dire) == null ? void 0 : l.slots, n.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: r,
    dire: n,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function ee(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function yr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function br(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function ra(t, e) {
  var b;
  const a = e.overlayVisibility !== void 0 ? hr(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let r = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: y, ...I } = e.timers;
    r = {
      ...t.timers ?? {},
      ...I
    }, y !== void 0 && (r = {
      ...r,
      gameStartCountdown: Va((b = t.timers) == null ? void 0 : b.gameStartCountdown, y)
    });
  }
  const n = pr(t.draft, e.draft), i = yr(t.leagueConfig, e.leagueConfig), l = br(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let u = ee(t.heroStatsCard ?? void 0, e.heroStatsCard), h = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const g = ee(t.lowerThirds ?? void 0, e.lowerThirds), c = ee(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let d = ee(t.matchupCard ?? void 0, e.matchupCard), f = ee(t.sponsor ?? void 0, e.sponsor), p = ee(t.statCarousel ?? void 0, e.statCarousel);
  if (u && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const y = e.heroStatsCard;
    y.fetchedAt ? u = { ...y } : u = {
      ...u,
      ...y,
      tournament: y.tournament ? { ...u.tournament ?? {}, ...y.tournament } : u.tournament,
      playerHero: y.playerHero ? { ...u.playerHero ?? {}, ...y.playerHero } : u.playerHero,
      statSlides: y.statSlides ?? u.statSlides
    };
  }
  if (d && e.matchupCard && typeof e.matchupCard == "object") {
    const y = e.matchupCard;
    d = {
      ...d,
      ...y,
      matchup: y.matchup ? { ...d.matchup ?? {}, ...y.matchup } : d.matchup
    };
  }
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: m ?? t.playerHeroIndex,
    production: l ?? t.production,
    statCarousel: p === void 0 ? t.statCarousel : p,
    draft: n === void 0 ? t.draft : n,
    lowerThirds: g === void 0 ? t.lowerThirds : g,
    playerStatsCard: c === void 0 ? t.playerStatsCard : c,
    heroStatsCard: u === void 0 ? t.heroStatsCard : u,
    matchupCard: d === void 0 ? t.matchupCard : d,
    sponsor: f === void 0 ? t.sponsor : f,
    timers: r ?? t.timers,
    sceneHints: h
  };
}
function mt(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = ra(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function Sr(t) {
  const e = new et(t.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(n) {
      return Math.min(n * 200, 2e3);
    }
  });
  let a = !1;
  async function r() {
    if (a)
      return;
    await e.connect().catch(() => {
    }), a = !0, await e.get(t.key) || await e.set(t.key, JSON.stringify(t.seed));
  }
  return {
    async getState() {
      await r();
      const n = await e.get(t.key);
      if (!n)
        throw new Error("Redis state missing");
      return JSON.parse(n);
    },
    async patchState(n) {
      await r();
      let i = 0;
      for (; i++ < 8; ) {
        await e.watch(t.key);
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, m = ra(o, n);
        if (await e.multi().set(t.key, JSON.stringify(m)).exec())
          return m;
      }
      throw new Error("Redis optimistic lock exhaustion");
    },
    async replaceState(n) {
      return await r(), await e.set(t.key, JSON.stringify(n)), structuredClone(n);
    },
    async shutdown() {
      await e.quit();
    }
  };
}
async function wr() {
  const t = aa();
  if (w.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), mt(t);
  if (!w.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new et(w.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: w.REDIS_STATE_KEY }, "State backend: redis"), Sr({
      url: w.REDIS_URL,
      key: w.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), w.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), mt(t);
    throw e;
  }
}
function _r(t) {
  return mr.parse(t);
}
const gt = xa(va);
class Er {
  constructor() {
    L(this, "dbFile", w.REPLAY_DB_FILE);
    L(this, "matchFile", w.REPLAY_MATCH_FILE);
    L(this, "lastCompletedFile", w.REPLAY_LAST_COMPLETED_FILE);
    L(this, "playbackDir", w.REPLAY_PLAYBACK_DIR);
    L(this, "replayFolder", w.REPLAY_FOLDER);
    // Temp folder for browser mp4 previews (inside build output or root)
    L(this, "previewCacheDir", T.resolve(process.cwd(), "public-preview-cache"));
    if (!v.existsSync(this.previewCacheDir))
      try {
        v.mkdirSync(this.previewCacheDir, { recursive: !0 });
      } catch (e) {
        S.error(e, "Failed to create preview cache directory");
      }
  }
  getPreviewCacheDir() {
    return this.previewCacheDir;
  }
  async getReplayState() {
    let e = 1, a = 0;
    const r = [];
    try {
      if (v.existsSync(this.matchFile)) {
        const n = v.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (e = i);
      }
    } catch (n) {
      S.error(n, "Failed to read active match file");
    }
    try {
      if (v.existsSync(this.lastCompletedFile)) {
        const n = v.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (a = i);
      }
    } catch (n) {
      S.error(n, "Failed to read last completed match file");
    }
    try {
      if (v.existsSync(this.dbFile)) {
        const i = v.readFileSync(this.dbFile, "utf-8").split(/\r?\n/);
        for (let l = 1; l < i.length; l++) {
          const o = i[l].trim();
          if (!o) continue;
          const m = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (m) {
            const u = m[3];
            r.push({
              match: parseInt(m[1], 10),
              replayId: parseInt(m[2], 10),
              file: u,
              favorite: parseInt(m[4], 10) === 1,
              duration: parseInt(m[5], 10),
              filename: T.basename(u)
            });
          }
        }
      }
    } catch (n) {
      S.error(n, "Failed to read or parse replay database CSV");
    }
    return r.sort((n, i) => i.replayId - n.replayId), {
      currentMatch: e,
      lastCompletedMatch: a,
      replays: r
    };
  }
  async toggleFavorite(e, a) {
    try {
      if (!v.existsSync(this.dbFile))
        return !1;
      const n = v.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      n.length > 0 && i.push(n[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let m = 1; m < n.length; m++) {
        const u = n[m].trim();
        if (!u) continue;
        const h = u.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        h && h[3] === e ? (i.push(`${h[1]},${h[2]},"${h[3]}",${o},${h[5]}`), l = !0) : i.push(u);
      }
      return v.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (r) {
      return S.error(r, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!v.existsSync(e))
        return { ok: !1, error: "File not found" };
      const n = (await this.getReplayState()).replays.find((g) => g.file === e), i = n ? n.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await gt(l), m = parseFloat(o.stdout.trim()) || 40, u = Math.max(0, m - i);
      let h = e;
      if (u > 1) {
        v.existsSync(this.playbackDir) || v.mkdirSync(this.playbackDir, { recursive: !0 }), h = T.join(this.playbackDir, "current_replay.mp4");
        const g = `ffmpeg -y -ss ${u} -i "${e}" -t ${i} -c copy "${h}"`;
        S.info({ cmd: g }, "Running ffmpeg slice command"), await gt(g);
      }
      if (a.isConnected()) {
        const g = await a.setInputSettings("ReplayPlayer", {
          local_file: h
        });
        if (!g.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${g.error}` };
        const c = await a.restartMediaInput("ReplayPlayer");
        if (!c.ok)
          return { ok: !1, error: `Failed to restart OBS media input: ${c.error}` };
        const d = await a.setCurrentScene("Replay");
        return d.ok || S.error({ error: d.error }, "Failed to switch OBS scene"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (r) {
      return S.error(r, "Failed to play replay"), { ok: !1, error: r instanceof Error ? r.message : String(r) };
    }
  }
  async generatePreview(e) {
    try {
      if (!v.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = T.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return S.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
function Ir(t) {
  const { app: e, state: a, io: r, broadcast: n, obs: i, opendota: l } = t, o = new Er();
  e.use(
    "/api/replays/media",
    _,
    He.static(w.REPLAY_FOLDER)
  ), e.get("/health/live", (g, c) => {
    c.json({
      ok: !0,
      service: "broadcast-api",
      /** Bump when deploying; used to confirm apply-player-mapping route is live */
      build: "2026-05-30",
      routes: {
        applyPlayerMapping: "POST /api/match/apply-player-mapping",
        matchSetup: "POST /api/match/setup",
        gameStartTimerStart: "POST /api/timers/game-start/start"
      }
    });
  }), e.get("/health/ready", async (g, c) => {
    try {
      await a.getState(), c.json({ ok: !0 });
    } catch {
      c.status(503).json({ ok: !1 });
    }
  }), e.get("/api/state", _, async (g, c) => {
    const d = await a.getState();
    c.json(d);
  }), e.patch("/api/state", _, async (g, c) => {
    try {
      const d = _r(g.body), f = await a.patchState(d);
      await n.broadcastFull(f), c.json(f);
    } catch (d) {
      S.error(d, "state patch failed"), c.status(400).json({
        error: d instanceof Error ? d.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", _, async (g, c) => {
    const d = aa(), f = await a.replaceState(d);
    await n.broadcastFull(f), c.json(f);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function u(g) {
    const c = await a.patchState({
      timers: { gameStartCountdown: g }
    });
    return await n.broadcastFull(c), c;
  }
  e.post(
    "/api/timers/game-start/start",
    _,
    async (g, c) => {
      var y, I;
      const d = m.safeParse(g.body);
      if (!d.success)
        return c.status(400).json({ error: d.error.flatten() });
      const f = ((y = d.data.label) == null ? void 0 : y.trim()) || J, p = lt(
        d.data.seconds,
        f
      ), b = await u(p);
      c.json({ ok: !0, gameStartCountdown: (I = b.timers) == null ? void 0 : I.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    _,
    async (g, c) => {
      var E, C, A, k;
      const f = (E = (await a.getState()).timers) == null ? void 0 : E.gameStartCountdown, p = (typeof ((C = g.body) == null ? void 0 : C.label) == "string" ? g.body.label.trim() : "") || (f == null ? void 0 : f.label) || J, b = typeof ((A = g.body) == null ? void 0 : A.seconds) == "number" ? g.body.seconds : Se(f), y = ct(b, p), I = await u(y);
      c.json({ ok: !0, gameStartCountdown: (k = I.timers) == null ? void 0 : k.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    _,
    async (g, c) => {
      var E, C, A;
      const d = m.safeParse(g.body);
      if (!d.success)
        return c.status(400).json({ error: d.error.flatten() });
      const p = (E = (await a.getState()).timers) == null ? void 0 : E.gameStartCountdown, b = ((C = d.data.label) == null ? void 0 : C.trim()) || (p == null ? void 0 : p.label) || J, y = p != null && p.running ? lt(d.data.seconds, b) : ct(d.data.seconds, b), I = await u(y);
      c.json({ ok: !0, gameStartCountdown: (A = I.timers) == null ? void 0 : A.gameStartCountdown });
    }
  );
  const h = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", _, (g, c) => {
    const d = h.safeParse(g.body);
    if (!d.success) return c.status(400).json({ error: d.error.flatten() });
    i.configure(d.data), r.of(K.PRODUCER).emit($.ACK, {
      kind: "obs:config",
      ok: !0
    }), c.json({ ok: !0 });
  }), e.post("/api/obs/connect", _, async (g, c) => {
    const d = g.body;
    if (d && typeof d == "object" && Object.keys(d).length) {
      const p = h.safeParse(d);
      if (!p.success)
        return c.status(400).json({ error: p.error.flatten() });
      i.configure(p.data);
    }
    const f = await i.connect();
    r.of(K.PRODUCER).emit($.ACK, {
      kind: "obs:connect",
      ok: f.ok,
      error: f.error
    }), c.json(f);
  }), e.post("/api/obs/disconnect", _, async (g, c) => {
    await i.disconnect(), r.of(K.PRODUCER).emit($.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), c.json({ ok: !0 });
  }), e.get("/api/obs/scenes", _, async (g, c) => {
    try {
      const d = await i.listScenes();
      c.json({ ok: !0, scenes: d });
    } catch (d) {
      c.status(500).json({
        ok: !1,
        error: d instanceof Error ? d.message : String(d)
      });
    }
  }), e.post("/api/obs/program-scene", _, async (g, c) => {
    const f = s.object({ sceneName: s.string() }).safeParse(g.body);
    if (!f.success)
      return c.status(400).json({ error: f.error.flatten() });
    const p = await i.setProgramScene(f.data.sceneName);
    r.of(K.PRODUCER).emit($.ACK, {
      kind: "obs:setProgramScene",
      ok: p.ok,
      sceneName: f.data.sceneName,
      error: p.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: f.data.sceneName }
    });
    const b = await a.getState();
    await n.broadcastFull(b), c.json(p);
  }), e.post(
    "/api/obs/scene-source",
    _,
    async (g, c) => {
      const f = s.object({
        sceneName: s.string(),
        sourceName: s.string(),
        visible: s.boolean()
      }).safeParse(g.body);
      if (!f.success)
        return c.status(400).json({ error: f.error.flatten() });
      const p = await i.setSourceVisible(f.data);
      c.json(p);
    }
  ), e.post(
    "/api/opendota/heroes/constants",
    _,
    async (g, c) => {
      const d = await l.heroesConstants();
      c.json(d);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    _,
    async (g, c) => {
      const d = await l.playerHeroStats(g.params.accountId);
      c.json(d);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    _,
    async (g, c) => {
      const d = await l.heroMatchups(Number(g.params.heroId));
      c.json(d);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    _,
    async (g, c) => {
      const f = s.object({
        heroA: s.number(),
        heroB: s.number()
      }).safeParse(g.body);
      if (!f.success)
        return c.status(400).json({ error: f.error.flatten() });
      const p = await l.matchupBetween(
        f.data.heroA,
        f.data.heroB
      );
      c.json(p);
    }
  ), e.post("/api/opendota/compose/hero-card", _, async (g, c) => {
    const f = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(g.body);
    if (!f.success)
      return c.status(400).json({ error: f.error.flatten() });
    const p = await a.getState(), b = f.data.accountId !== void 0 ? Wt(
      p.playerHeroIndex,
      f.data.accountId,
      f.data.heroId
    ) : void 0;
    let y = "league", I;
    if (b && b.games > 0)
      I = {
        games: b.games,
        wins: b.wins,
        losses: b.games - b.wins
      };
    else if (f.data.accountId !== void 0) {
      y = "opendota_cached";
      const C = await l.playerHeroStats(f.data.accountId);
      if (C.ok && Array.isArray(C.data)) {
        const A = C.data.find(
          (k) => k && typeof k == "object" && k.hero_id === f.data.heroId
        );
        A && typeof A.games == "number" && (I = {
          games: A.games,
          wins: typeof A.win == "number" ? A.win : 0,
          losses: A.games - (typeof A.win == "number" ? A.win : 0)
        });
      }
      C.ok || (y = "stale");
    }
    const E = {
      playerLabel: f.data.playerLabel,
      heroId: f.data.heroId,
      playerHero: I,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: y
    };
    if (f.data.persist) {
      const C = await a.patchState({ heroStatsCard: E });
      return await n.broadcastFull(C), c.json({ ok: !0, card: E, persisted: C });
    }
    return c.json({ ok: !0, card: E });
  }), e.post("/api/opendota/compose/matchup-card", _, async (g, c) => {
    const f = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(g.body);
    if (!f.success)
      return c.status(400).json({ error: f.error.flatten() });
    const p = await l.matchupBetween(
      f.data.heroAId,
      f.data.heroBId
    ), b = {
      heroAId: f.data.heroAId,
      heroBId: f.data.heroBId,
      matchup: p.ok ? p.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: p.ok ? "opendota_cached" : "stale"
    };
    if (f.data.persist) {
      const y = await a.patchState({ matchupCard: b });
      return await n.broadcastFull(y), c.json({ ok: !0, upstream: p, matchupCard: b, persisted: y });
    }
    return c.json({ ok: !0, upstream: p, matchupCard: b });
  }), e.post("/api/opendota/cache/clear-memory", _, (g, c) => {
    l.purgeMemory(), c.json({ ok: !0 });
  }), e.get("/api/replays", _, async (g, c) => {
    try {
      const d = await o.getReplayState();
      c.json(d);
    } catch (d) {
      c.status(500).json({ error: d instanceof Error ? d.message : String(d) });
    }
  }), e.post("/api/replays/hotkey", _, async (g, c) => {
    const f = s.object({ hotkeyName: s.string() }).safeParse(g.body);
    if (!f.success) return c.status(400).json({ error: f.error.flatten() });
    const p = await i.triggerHotkeyByName(f.data.hotkeyName);
    c.json(p);
  }), e.post("/api/replays/hotkey-sequence", _, async (g, c) => {
    const f = s.object({
      keyId: s.string(),
      keyModifiers: s.object({
        shift: s.boolean().optional(),
        control: s.boolean().optional(),
        alt: s.boolean().optional(),
        command: s.boolean().optional()
      }).optional()
    }).safeParse(g.body);
    if (!f.success) return c.status(400).json({ error: f.error.flatten() });
    const p = await i.triggerHotkeyBySequence(f.data.keyId, f.data.keyModifiers || {});
    c.json(p);
  }), e.post("/api/replays/favorite", _, async (g, c) => {
    const f = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(g.body);
    if (!f.success) return c.status(400).json({ error: f.error.flatten() });
    const p = await o.toggleFavorite(f.data.file, f.data.favorite);
    c.json({ ok: p });
  }), e.post("/api/replays/play", _, async (g, c) => {
    const f = s.object({ file: s.string() }).safeParse(g.body);
    if (!f.success) return c.status(400).json({ error: f.error.flatten() });
    const p = await o.playReplay(f.data.file, i);
    c.json(p);
  }), e.post("/api/replays/generate-preview", _, async (g, c) => {
    const f = s.object({ file: s.string() }).safeParse(g.body);
    if (!f.success) return c.status(400).json({ error: f.error.flatten() });
    const p = await o.generatePreview(f.data.file);
    c.json(p);
  });
}
let q = null, Z = /* @__PURE__ */ new Map(), Ie = null;
function kr() {
  if (!(q != null && q.length)) {
    Ie = null;
    return;
  }
  Ie = Qa(q);
}
async function Q(t) {
  if (Z.size > 0) return Z;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (q = e.data, Z = new Map(q.map((a) => [a.id, a])), kr()), Z;
}
function ke(t) {
  if (Ie) return Xa(t, Ie);
  if (t.heroId != null && t.heroId > 0) {
    const e = Z.get(t.heroId);
    if (e) {
      const a = O(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = O(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Ar(t) {
  return ke(t).slug;
}
function Cr(t, e) {
  const a = ke({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const r = Z.get(t);
  if (r)
    return O(r.name) || void 0;
}
function me(t, e) {
  return Ya(
    Cr(t, e)
  );
}
function Pr(t, e) {
  return me(t, e).heroPortraitUrl;
}
function ne(t) {
  const e = Z.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function Rr(t) {
  if (t)
    return Gt(t);
}
function W(t, e) {
  return t.find((a) => a.steam32 === e);
}
function Lr() {
  return q ? [...q].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function Tr() {
  var e;
  const t = (e = w.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Dr(t, e) {
  var l, o, m, u;
  const a = (l = w.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
  if (!a) return [];
  const r = [];
  let n;
  for (; r.length < e; ) {
    const h = new URLSearchParams({
      key: a,
      league_id: String(t),
      matches_requested: String(Math.min(100, e - r.length))
    });
    n !== void 0 && h.set("start_at_match_id", String(n));
    const g = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${h}`, c = await fetch(g);
    if (!c.ok) {
      const y = await c.text();
      throw new Error(`Steam match history HTTP ${c.status}: ${y.slice(0, 200)}`);
    }
    const d = await c.json(), f = (o = d.result) == null ? void 0 : o.status, p = ((m = d.result) == null ? void 0 : m.matches) ?? [];
    if (f !== void 0 && f !== 1 && p.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${f} for league ${t} (no matches in response)`
      );
    if (p.length === 0) break;
    for (const y of p)
      typeof y.match_id == "number" && y.match_id > 0 && r.push(y.match_id);
    const b = (u = p[p.length - 1]) == null ? void 0 : u.match_id;
    if (b === void 0 || p.length < 100) break;
    n = b - 1;
  }
  const i = [...new Set(r)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function Nr(t, e = 80) {
  var o, m;
  const a = Tr(), r = [];
  if (!((o = w.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let n = [];
  if ((m = w.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      n = await Dr(t, e);
    } catch (u) {
      const h = u instanceof Error ? u.message : String(u);
      S.warn({ err: u, leagueId: t }, "Steam league match history failed"), r.push(h);
    }
  else a.length === 0 && r.push("STEAM_WEB_API_KEY is not set — cannot load match list from Steam.");
  const i = [.../* @__PURE__ */ new Set([...a, ...n])].slice(0, e);
  if (i.length === 0)
    return {
      matchIds: [],
      source: a.length > 0 ? "env" : "steam",
      warning: r.join(" ") || `No matches returned for league ${t}. Add LEAGUE_MATCH_IDS or verify the Steam key and league ID.`
    };
  let l = "steam";
  return a.length > 0 && n.length > 0 ? l = "mixed" : a.length > 0 && n.length === 0 && (l = "env"), n.length === 0 && a.length > 0 && r.push(`Using ${a.length} match ID(s) from LEAGUE_MATCH_IDS only.`), {
    matchIds: i,
    source: l,
    warning: r.length > 0 ? r.join(" ") : void 0
  };
}
const Mr = 10;
function ft(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function ht(t) {
  return t !== void 0 && t < 128;
}
function vr(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function xr(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (n) => vr(n.account_id) && typeof n.lane == "number" && n.lane > 0 && !n.is_roaming
  ), r = [...new Set(a.map((n) => n.lane))];
  for (const n of r) {
    const i = a.filter((d) => d.lane === n), l = i.filter((d) => ht(d.player_slot)), o = i.filter((d) => !ht(d.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...l.map(ft)), u = Math.max(0, ...o.map(ft)), h = m - u;
    let g;
    Math.abs(h) <= Mr ? g = "draw" : g = h > 0 ? "win" : "loss";
    const c = g === "draw" ? "draw" : g === "win" ? "loss" : "win";
    for (const d of l) e.set(d.account_id, g);
    for (const d of o) e.set(d.account_id, c);
  }
  return e;
}
function Hr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function De() {
  return [
    T.resolve(process.cwd(), "data/league-stats"),
    T.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function G() {
  var a;
  const t = (a = w.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return T.isAbsolute(t) ? t : T.resolve(process.cwd(), t);
  const e = w.LEAGUE_ID;
  for (const r of De())
    if (ot(T.join(r, `league_${e}_heroes.csv`)))
      return r;
  for (const r of De())
    if (ot(r)) return r;
  return De()[0];
}
function pt(t) {
  const e = G(), a = he(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function yt(t, e) {
  const a = G(), r = he(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [r.heroes, r.playerHeroes],
    statsStorage: e
  };
}
function he(t) {
  const e = G();
  return {
    dir: e,
    heroes: T.join(e, `league_${t}_heroes.csv`),
    playerHeroes: T.join(e, `league_${t}_player_heroes.csv`),
    meta: T.join(e, `league_${t}_meta.json`)
  };
}
async function re(t) {
  try {
    return await ja(t), !0;
  } catch {
    return !1;
  }
}
function jr(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function Or(t) {
  const e = [];
  let a = "", r = !1;
  for (let n = 0; n < t.length; n++) {
    const i = t[n];
    r ? i === '"' ? t[n + 1] === '"' ? (a += '"', n++) : r = !1 : a += i : i === '"' ? r = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function bt(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(Or);
}
function D(t, e, a = 0) {
  const r = Number(t[e]);
  return Number.isFinite(r) ? r : a;
}
function pe(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function Ur(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, r = t.assists ?? 0;
  return !(e === 0 && a === 0 && r === 0 || (t.leaver_status ?? 0) >= 3);
}
function na(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function Fr(t) {
  return t.filter((e) => !na(e));
}
function sa(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || na(a)) continue;
    const r = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
    e[`${a.steam32}:${a.heroId}`] = {
      games: a.games,
      wins: a.wins,
      winRate: a.wins / a.games,
      avgKills: a.kills / a.games,
      avgDeaths: a.deaths / a.games,
      avgAssists: a.assists / a.games,
      avgKda: r,
      maxKills: a.maxKills,
      avgHeroDamage: a.heroDamage / a.games,
      avgGpm: a.goldPerMin / a.games,
      avgLastHits: a.lastHits / a.games,
      laneWins: a.laneWins,
      laneDraws: a.laneDraws,
      laneLosses: a.laneLosses
    };
  }
  return e;
}
async function Br(t) {
  const e = he(t);
  if (!await re(e.heroes))
    return null;
  try {
    const a = await be(e.heroes, "utf8"), r = bt(a);
    if (r.length < 2) return null;
    const n = {};
    for (const o of r.slice(1)) {
      const m = D(o, 0);
      m <= 0 || (n[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: D(o, 2),
        bans: D(o, 3),
        wins: D(o, 4),
        losses: D(o, 5),
        games: D(o, 6),
        pickRate: pe(o, 7),
        banRate: pe(o, 8),
        winRate: pe(o, 9),
        contestRate: pe(o, 10)
      });
    }
    let i = [];
    if (await re(e.playerHeroes)) {
      const o = await be(e.playerHeroes, "utf8"), m = bt(o);
      for (const u of m.slice(1)) {
        const h = D(u, 0), g = D(u, 1);
        h <= 0 || g <= 0 || i.push({
          steam32: h,
          heroId: g,
          games: D(u, 2),
          wins: D(u, 3),
          kills: D(u, 4),
          deaths: D(u, 5),
          assists: D(u, 6),
          heroDamage: D(u, 7),
          goldPerMin: D(u, 8),
          lastHits: D(u, 9),
          maxKills: D(u, 10),
          laneWins: D(u, 11),
          laneDraws: D(u, 12),
          laneLosses: D(u, 13)
        });
      }
      i = Fr(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await re(e.meta)) {
      const o = JSON.parse(await be(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: n, playerHeroes: i, meta: l };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function $r(t) {
  const { leagueId: e } = t.meta, a = he(e);
  await Ha(a.dir, { recursive: !0 });
  const n = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, u) => m.heroId - u.heroId
  ))
    n.push(
      [
        o.heroId,
        jr(o.heroName ?? ""),
        o.picks,
        o.bans,
        o.wins,
        o.losses,
        o.games,
        o.pickRate ?? "",
        o.banRate ?? "",
        o.winRate ?? "",
        o.contestRate ?? ""
      ].join(",")
    );
  await Te(a.heroes, `# BPC league hero stats — league ${e}
${n.join(`
`)}
`, "utf8");
  const l = ["steam32,heroId,games,wins,kills,deaths,assists,heroDamage,goldPerMin,lastHits,maxKills,laneWins,laneDraws,laneLosses"];
  for (const o of t.playerHeroes.sort(
    (m, u) => m.steam32 - u.steam32 || m.heroId - u.heroId
  ))
    l.push(
      [
        o.steam32,
        o.heroId,
        o.games,
        o.wins,
        o.kills,
        o.deaths,
        o.assists,
        o.heroDamage,
        o.goldPerMin,
        o.lastHits,
        o.maxKills,
        o.laneWins,
        o.laneDraws,
        o.laneLosses
      ].join(",")
    );
  return await Te(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${l.join(`
`)}
`,
    "utf8"
  ), await Te(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function le(t) {
  const e = he(t), [a, r, n] = await Promise.all([
    re(e.heroes),
    re(e.playerHeroes),
    re(e.meta)
  ]);
  return {
    dir: e.dir,
    heroesPath: e.heroes,
    playerHeroesPath: e.playerHeroes,
    metaPath: e.meta,
    heroesExists: a,
    playerHeroesExists: r,
    metaExists: n,
    ready: a
  };
}
const Kr = 4294967295;
function Gr(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= Kr))
    return e;
}
class Vr {
  constructor() {
    L(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    L(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    L(this, "running", !1);
  }
  getProgress() {
    return { ...this.progress, heroIndex: { ...this.progress.heroIndex } };
  }
  /** True while aggregateLeague() is actively executing (use for API guards). */
  isBusy() {
    return this.running;
  }
  getPlayerHeroStats(e, a) {
    var n;
    const r = (n = this.playerLeagueHeroes.get(e)) == null ? void 0 : n.get(a);
    if (!(!r || r.games === 0))
      return this.accToPlayerHeroStats(r);
  }
  /** Aggregate all hero rows for a player in the current league. */
  getPlayerLeagueStats(e) {
    const a = this.playerLeagueHeroes.get(e);
    if (!a || a.size === 0) return;
    const r = {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      heroDamage: 0,
      goldPerMin: 0,
      lastHits: 0,
      maxKills: 0,
      laneWins: 0,
      laneDraws: 0,
      laneLosses: 0
    };
    for (const n of a.values())
      this.isLeaverLikePlayerHeroAcc(n) || (r.games += n.games, r.wins += n.wins, r.kills += n.kills, r.deaths += n.deaths, r.assists += n.assists, r.heroDamage += n.heroDamage, r.goldPerMin += n.goldPerMin, r.lastHits += n.lastHits, r.maxKills = Math.max(r.maxKills, n.maxKills), r.laneWins += n.laneWins, r.laneDraws += n.laneDraws, r.laneLosses += n.laneLosses);
    if (r.games !== 0)
      return this.accToPlayerHeroStats(r);
  }
  accToPlayerHeroStats(e) {
    const a = e.games, r = e.deaths > 0 ? (e.kills + e.assists) / e.deaths : e.kills + e.assists;
    return {
      games: a,
      wins: e.wins,
      winRate: e.wins / a,
      avgKills: e.kills / a,
      avgDeaths: e.deaths / a,
      avgAssists: e.assists / a,
      avgKda: r,
      maxKills: e.maxKills,
      avgHeroDamage: e.heroDamage / a,
      avgGpm: e.goldPerMin / a,
      avgLastHits: e.lastHits / a,
      laneWins: e.laneWins ?? 0,
      laneDraws: e.laneDraws ?? 0,
      laneLosses: e.laneLosses ?? 0
    };
  }
  /** Restore in-memory player stats + hero index from CSV (no API calls). */
  hydrateFromSnapshot(e, a, r, n) {
    this.playerLeagueHeroes.clear();
    for (const i of a) {
      let l = this.playerLeagueHeroes.get(i.steam32);
      l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(i.steam32, l)), l.set(i.heroId, {
        games: i.games,
        wins: i.wins,
        kills: i.kills,
        deaths: i.deaths,
        assists: i.assists,
        heroDamage: i.heroDamage,
        goldPerMin: i.goldPerMin,
        lastHits: i.lastHits,
        maxKills: i.maxKills,
        laneWins: i.laneWins,
        laneDraws: i.laneDraws,
        laneLosses: i.laneLosses
      });
    }
    this.progress = {
      status: "ready",
      progress: 100,
      matchTotal: r,
      matchDone: n,
      heroIndex: { ...e }
    };
  }
  exportPlayerHeroRows() {
    const e = [];
    for (const [a, r] of this.playerLeagueHeroes)
      for (const [n, i] of r)
        e.push({ steam32: a, heroId: n, ...i });
    return e;
  }
  async aggregateLeague(e, a, r = 80, n) {
    var i, l;
    if (this.running)
      throw new Error("Aggregation already running");
    this.running = !0, this.playerLeagueHeroes.clear(), this.progress = {
      status: "running",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    };
    try {
      await Q(a);
      const o = await Nr(e, r), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && S.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const u = /* @__PURE__ */ new Map();
      let h = 0;
      for (let c = 0; c < m.length; c++) {
        const d = m[c];
        if (d === void 0) continue;
        S.info(
          { matchId: d, index: c + 1, total: m.length },
          "Aggregating league match"
        );
        let f = await a.matchDetails(d);
        (!f.ok || !((l = (i = f.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(d), f = await a.matchDetails(d)), f.ok && f.data && (f.data.leagueid != null && f.data.leagueid !== 0 && f.data.leagueid !== e ? S.warn(
          {
            matchId: d,
            expectedLeague: e,
            actualLeague: f.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(f.data, u), h += 1)), this.progress.matchDone = c + 1, this.progress.progress = Math.round(
          (c + 1) / Math.max(1, m.length) * 100
        ), n == null || n(this.getProgress());
      }
      if (h === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const g = {};
      for (const [c, d] of u) {
        const f = d.wins + d.losses, p = h > 0 ? d.picks / h : 0, b = h > 0 ? d.bans / h : 0, y = p + b, I = f > 0 ? d.wins / f : void 0;
        g[String(c)] = {
          heroId: c,
          heroName: ne(c),
          picks: d.picks,
          bans: d.bans,
          wins: d.wins,
          losses: d.losses,
          games: f,
          pickRate: p,
          banRate: b,
          winRate: I,
          contestRate: y
        };
      }
      return this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: m.length,
        matchDone: m.length,
        heroIndex: g
      }, g;
    } catch (o) {
      const m = o instanceof Error ? o.message : String(o);
      throw this.progress = {
        ...this.progress,
        status: "error",
        error: m
      }, o;
    } finally {
      this.running = !1;
    }
  }
  ingestMatch(e, a) {
    const r = e.radiant_win === !0, n = xr(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = Gr(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && r || i.player_slot !== void 0 && i.player_slot >= 128 && !r, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, Ur(i) && this.trackPlayerHero(l, i.hero_id, o, i, n.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, r, n, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof n.kills == "number" ? n.kills : 0, m = typeof n.deaths == "number" ? n.deaths : 0, u = typeof n.assists == "number" ? n.assists : 0, h = typeof n.hero_damage == "number" ? n.hero_damage : 0, g = typeof n.gold_per_min == "number" ? n.gold_per_min : 0, c = typeof n.last_hits == "number" ? n.last_hits : 0, d = l.get(a) ?? {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      heroDamage: 0,
      goldPerMin: 0,
      lastHits: 0,
      maxKills: 0,
      laneWins: 0,
      laneDraws: 0,
      laneLosses: 0
    };
    d.games += 1, r && (d.wins += 1), i === "win" ? d.laneWins += 1 : i === "draw" ? d.laneDraws += 1 : i === "loss" && (d.laneLosses += 1), d.kills += o, d.deaths += m, d.assists += u, d.heroDamage += h, d.goldPerMin += g, d.lastHits += c, o > d.maxKills && (d.maxKills = o), l.set(a, d);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = $a(e);
    if (a.length > 0) return a;
    const r = [];
    for (const n of e.players ?? [])
      typeof n.hero_id == "number" && r.push({
        is_pick: !0,
        hero_id: n.hero_id,
        team: n.player_slot !== void 0 && n.player_slot >= 128 ? 1 : 0,
        order: 0
      });
    return r;
  }
  getAcc(e, a) {
    let r = e.get(a);
    return r || (r = { picks: 0, bans: 0, wins: 0, losses: 0 }, e.set(a, r)), r;
  }
}
const H = new Vr();
async function Wr(t) {
  const { leagueId: e, state: a, broadcast: r, source: n } = t, i = n === "csv" ? await Br(e) : null;
  if (!i) return !1;
  H.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: sa(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: n,
      statsCsvDir: G()
    }
  });
  return await r.broadcastFull(l), !0;
}
async function qe(t) {
  const e = await Wr({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: G() },
    "League stats loaded from CSV"
  ), e;
}
async function oa(t) {
  const { leagueId: e, state: a, opendota: r, broadcast: n } = t;
  if (H.isBusy()) {
    S.info("League aggregation already running");
    return;
  }
  const i = await a.patchState({
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "running",
      aggregationProgress: 0,
      aggregationMatchTotal: 0,
      aggregationMatchDone: 0,
      aggregationError: void 0
    }
  });
  await n.broadcastFull(i);
  try {
    const l = await H.aggregateLeague(
      e,
      r,
      80,
      async (h) => {
        const g = await a.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: h.progress,
            aggregationMatchTotal: h.matchTotal,
            aggregationMatchDone: h.matchDone
          }
        });
        await n.broadcastFull(g);
      }
    ), o = H.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await $r({
      heroIndex: l,
      playerHeroes: H.exportPlayerHeroRows(),
      meta: {
        leagueId: e,
        matchTotal: o.matchTotal,
        matchDone: o.matchDone,
        aggregatedAt: m,
        source: "api"
      }
    });
    const u = await a.patchState({
      tournamentHeroIndex: l,
      playerHeroIndex: sa(
        H.exportPlayerHeroRows()
      ),
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "ready",
        aggregatedAt: m,
        aggregationProgress: 100,
        aggregationMatchTotal: o.matchTotal,
        aggregationMatchDone: o.matchDone,
        aggregationError: void 0,
        aggregationSource: "api",
        statsCsvDir: G()
      }
    });
    await n.broadcastFull(u), S.info(
      { leagueId: e, matches: o.matchTotal, dir: G() },
      "League aggregation ready — saved to CSV"
    );
  } catch (l) {
    const o = l instanceof Error ? l.message : String(l);
    S.error({ err: l, leagueId: e }, "League aggregation failed");
    const m = await a.patchState({
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "error",
        aggregationError: o
      }
    });
    await n.broadcastFull(m);
  }
}
async function qr(t) {
  var c, d, f, p;
  const { state: e, opendota: a, broadcast: r } = t, n = w.LEAGUE_ID, i = await e.getState();
  if ((((c = i.leagueConfig) == null ? void 0 : c.leagueId) !== n || ((d = i.leagueConfig) == null ? void 0 : d.leagueId) === null || ((f = i.leagueConfig) == null ? void 0 : f.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: n, aggregationStatus: "idle" }
  }), await qe({
    leagueId: n,
    state: e,
    broadcast: r
  })) return;
  const u = ((p = (await e.getState()).leagueConfig) == null ? void 0 : p.aggregationStatus) === "ready", h = H.getProgress().status === "ready";
  w.LEAGUE_AUTO_AGGREGATE && (!u || !h) && H.getProgress().status !== "running" ? (S.info({ leagueId: n }, "Starting league aggregation (Steam match list + OpenDota details)"), oa({ leagueId: n, state: e, opendota: a, broadcast: r })) : S.info(
    { leagueId: n, dir: G() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function St() {
  return {
    leagueId: w.LEAGUE_ID,
    autoAggregate: w.LEAGUE_AUTO_AGGREGATE,
    statsDir: G()
  };
}
class we extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function Yr(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && H.getProgress().status === "ready";
}
function te(t) {
  var a, r;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new we(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new we(
      ((r = t.leagueConfig) == null ? void 0 : r.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!Yr(t))
    throw new we(
      "League stats not ready — run tournament aggregate first"
    );
}
function ia(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function zr(t) {
  var i;
  const e = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (e.length === 0) return [];
  let a = 0;
  const r = ((i = e[0]) == null ? void 0 : i.toLowerCase()) ?? "";
  (r.includes("steam") || r.includes("display")) && (a = 1);
  const n = [];
  for (let l = a; l < e.length; l++) {
    const o = e[l];
    if (!o) continue;
    const m = o.split(",").map((p) => p.trim());
    if (m.length < 2) continue;
    const u = m[0] ?? "Player", h = Number(m[1]);
    if (!Number.isFinite(h)) continue;
    let g, c, d, f;
    if (m.length >= 4) {
      if (g = m[2] || void 0, c = m[3] || void 0, m.length >= 5) {
        const p = m[4] ?? "";
        p.startsWith("http://") || p.startsWith("https://") ? f = p : d = ia(p);
      }
      if (m.length >= 6) {
        const p = m[5] ?? "";
        (p.startsWith("http://") || p.startsWith("https://")) && (f = p);
      }
    } else m.length === 3 && (c = m[2] || void 0, g = c == null ? void 0 : c.replace(/_/g, " "));
    n.push({ displayName: u, steam32: h, teamName: g, teamKey: c, teamColor: d, avatarUrl: f });
  }
  return n;
}
function wt(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function Ye(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const r = a.teamKey ?? Jr(a.teamName ?? "unknown"), n = a.teamName ?? Qr(r), i = e.get(r);
    i ? (i.players.push(a), a.teamName && !i.teamName && (i.teamName = a.teamName)) : e.set(r, {
      teamKey: r,
      teamName: n,
      players: [a]
    });
  }
  return [...e.values()].sort(
    (a, r) => a.teamName.localeCompare(r.teamName)
  );
}
function ze(t, e) {
  return Ye(t).find((a) => a.teamKey === e);
}
function ce(t) {
  return Gt(t);
}
function Jr(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Qr(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function _t(t, e, a) {
  return t && t.map((r) => {
    if (r.type !== "pick") return r;
    const n = Re(a.matchSetup, e, r.order), i = Za(a, e, r.order);
    if (n == null && !i) {
      const { playerName: l, steam32: o, ...m } = r;
      return m;
    }
    return {
      ...r,
      steam32: n ?? void 0,
      playerName: i
    };
  });
}
function Xr(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: _t(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: _t(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Et(t, e, a) {
  var i, l, o, m;
  const r = ze(e, t.radiantTeamKey), n = ze(e, t.direTeamKey);
  if (!r || !n)
    throw new Error("One or both teams not found in roster");
  if (t.radiantTeamKey === t.direTeamKey)
    throw new Error("Radiant and dire must be different teams");
  return {
    series: {
      teamA: r.teamName,
      teamB: n.teamName,
      scoreA: t.scoreA ?? ((i = a == null ? void 0 : a.series) == null ? void 0 : i.scoreA) ?? 0,
      scoreB: t.scoreB ?? ((l = a == null ? void 0 : a.series) == null ? void 0 : l.scoreB) ?? 0,
      bestOf: t.seriesBestOf,
      gameNumber: t.seriesGame,
      logoUrlA: ce(r.teamKey),
      logoUrlB: ce(n.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: r.teamName,
      logoUrl: ce(r.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: n.teamName,
      logoUrl: ce(n.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const It = /* @__PURE__ */ new Map();
async function la(t, e) {
  var l, o, m;
  if (e <= 0) return;
  const a = It.get(e);
  if (a) return a;
  const r = await t.playerProfile(e);
  if (!r.ok || !r.data) return;
  const n = r.data, i = ((l = n.profile) == null ? void 0 : l.avatarfull) ?? n.avatarfull ?? ((o = n.profile) == null ? void 0 : o.avatarmedium) ?? n.avatarmedium ?? ((m = n.profile) == null ? void 0 : m.avatar) ?? n.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return It.set(e, i), i;
}
async function kt(t, e) {
  var r;
  const a = [];
  for (const n of t) {
    if ((r = n.avatarUrl) != null && r.trim()) {
      a.push(n);
      continue;
    }
    try {
      const i = await la(e, n.steam32);
      a.push(i ? { ...n, avatarUrl: i } : n);
    } catch (i) {
      S.warn({ err: i, steam32: n.steam32 }, "avatar fetch failed"), a.push(n);
    }
  }
  return a;
}
function Zr(t, e) {
  return new Promise((a) => {
    const r = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    Bt.get(r, (n) => {
      if (n.statusCode !== 200) {
        a(null);
        return;
      }
      let i = "";
      n.on("data", (l) => {
        i += l;
      }), n.on("end", () => {
        try {
          const l = JSON.parse(i);
          if (l.response && l.response.success === 1 && l.response.steamid) {
            const o = BigInt(l.response.steamid), m = Number(o - BigInt("76561197960265728"));
            a(m);
          } else
            a(null);
        } catch {
          a(null);
        }
      });
    }).on("error", () => {
      a(null);
    });
  });
}
async function en(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a && a[1]) {
    const n = BigInt(a[1]);
    return Number(n - BigInt("76561197960265728"));
  }
  const r = t.match(/\/id\/([^/]+)/);
  if (r && r[1]) {
    const n = r[1].trim();
    if (e)
      return Zr(n, e);
    S.warn({ vanity: n }, "Custom Steam ID found but STEAM_WEB_API_KEY is not configured in .env");
  }
  return null;
}
function ge(t) {
  return new Promise((e, a) => {
    Bt.get(t, (r) => {
      if (r.statusCode !== 200) {
        a(new Error(`BPC League API returned HTTP ${r.statusCode} for ${t}`));
        return;
      }
      let n = "";
      r.on("data", (i) => {
        n += i;
      }), r.on("end", () => {
        try {
          e(JSON.parse(n));
        } catch (i) {
          a(i);
        }
      });
    }).on("error", a);
  });
}
async function tn(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await ge("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const n = await ge(`https://api.bpcleague.in/api/public/seasons/${e}`);
      n.snapshot && n.snapshot.teams ? a = n.snapshot.teams : n.tournament && n.tournament.teams ? a = n.tournament.teams : n.participations && (a = n.participations.map((i) => i.team).filter(Boolean));
    }
  } catch (n) {
    throw S.error(n, "Failed to fetch season/tournament data from bpcleague.in"), n;
  }
  if (!a || a.length === 0)
    return S.warn("No teams found in bpcleague.in API response"), [];
  const r = [];
  for (const n of a) {
    const i = n.name.trim(), l = n.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), o = ia(n.accentColor) || "#ffffff", m = n.players || [];
    for (const u of m) {
      const h = u.displayName || u.name || "Player", g = u.steamProfile || "";
      let c = 0;
      if (g) {
        const d = await en(g, t.steamApiKey);
        d && (c = d);
      }
      c > 0 ? r.push({
        displayName: h,
        steam32: c,
        teamName: i,
        teamKey: l,
        teamColor: o
      }) : S.warn({ displayName: h, profileUrl: g }, "Could not resolve steam32 for player; skipping");
    }
  }
  return S.info({ count: r.length }, "Completed roster sync from bpcleague.in"), r;
}
async function an(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let r;
    e === "latest" || e === "active" ? r = await ge("https://api.bpcleague.in/api/public/tournament") : r = await ge(`https://api.bpcleague.in/api/public/seasons/${e}`);
    let n = [];
    return r.snapshot && r.snapshot.matches || r.tournament && ((a = r.snapshot) != null && a.matches) ? n = r.snapshot.matches : r.tournament && r.tournament.matches ? n = r.tournament.matches : r.matches && (n = r.matches), n.map((i) => {
      var l, o, m;
      return {
        id: i.id,
        team1: i.team1,
        team2: i.team2,
        winner: i.winner || null,
        status: i.status || "pending",
        stageKey: i.stageKey || "",
        seriesType: ((l = i.meta) == null ? void 0 : l.seriesType) || "bo3",
        team1Score: ((o = i.meta) == null ? void 0 : o.team1Score) ?? 0,
        team2Score: ((m = i.meta) == null ? void 0 : m.team2Score) ?? 0
      };
    });
  } catch (r) {
    return S.error(r, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function rn() {
  S.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await ge("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return S.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
function j(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function Y(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function ca(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function fe(t, e) {
  return `${t}W / ${e}L`;
}
function Ae(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, r = t.laneLosses ?? 0;
  return e + a + r === 0 ? null : {
    label: "Lane",
    value: Hr(e, a, r),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function ua(t, e, a) {
  var n;
  const r = (n = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : n.avatarUrl;
  return r != null && r.trim() ? r : la(t, e);
}
function nn(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : fe(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${j(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${j(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${j(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? j(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function sn(t, e, a, r) {
  if (!a || a.games === 0)
    return [
      {
        label: `${t} on ${e}`,
        value: "No league games",
        sublabel: "This player hasn't played this hero in the league yet"
      },
      ...r ? [
        {
          label: "Hero pick rate",
          value: String(r.picks),
          sublabel: `${j(r.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: j(r.winRate),
          sublabel: fe(r.wins, r.losses)
        }
      ] : []
    ];
  const n = a.games - a.wins, i = `${Y(a.avgKills)} / ${Y(a.avgDeaths)} / ${Y(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: fe(a.wins, n),
      sublabel: `${j(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: Y(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: ca(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ae(a) ? [Ae(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...r ? [
      {
        label: "Hero in league",
        value: String(r.picks),
        sublabel: `${j(r.pickRate)} pick · ${j(r.winRate)} WR`
      }
    ] : []
  ];
}
function on(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, r = `${Y(e.avgKills)} / ${Y(e.avgDeaths)} / ${Y(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: fe(e.wins, a),
      sublabel: `${j(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: Y(e.avgKda),
      sublabel: `${r} per game`
    },
    {
      label: "Hero damage",
      value: ca(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ae(e) ? [Ae(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function da(t) {
  return !t || t.games === 0 ? { games: 0, wins: 0, losses: 0 } : {
    games: t.games,
    wins: t.wins,
    losses: t.games - t.wins,
    winRate: t.winRate,
    avgKills: t.avgKills,
    avgDeaths: t.avgDeaths,
    avgAssists: t.avgAssists,
    avgKda: t.avgKda,
    maxKills: t.maxKills,
    avgHeroDamage: t.avgHeroDamage,
    avgGpm: t.avgGpm,
    avgLastHits: t.avgLastHits,
    laneWins: t.laneWins,
    laneDraws: t.laneDraws,
    laneLosses: t.laneLosses
  };
}
async function ue(t, e, a) {
  await Q(t);
  const r = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, n = r.heroName ?? ne(e), i = me(e, n);
  return {
    statsCardKind: "tournament-hero",
    playerLabel: n,
    heroId: e,
    heroName: n,
    ...i,
    tournament: {
      pickRate: r.pickRate,
      winRate: r.winRate,
      contestRate: r.contestRate,
      banRate: r.banRate,
      picks: r.picks,
      bans: r.bans,
      wins: r.wins,
      losses: r.losses,
      games: r.games
    },
    statSlides: nn(r),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function de(t, e, a, r, n, i, l) {
  await Q(t);
  const o = Wt(
    l,
    e,
    a
  ), m = n[String(a)], u = ne(a), h = me(a, u), g = await ua(
    t,
    e,
    i
  );
  return {
    statsCardKind: "player-hero",
    steam32: e,
    playerLabel: r,
    heroId: a,
    heroName: u,
    ...h,
    playerAvatarUrl: g,
    tournament: m ? {
      pickRate: m.pickRate,
      winRate: m.winRate,
      contestRate: m.contestRate,
      banRate: m.banRate,
      picks: m.picks,
      bans: m.bans,
      wins: m.wins,
      losses: m.losses,
      games: m.games
    } : void 0,
    playerHero: da(o),
    statSlides: sn(r, u, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function ln(t, e) {
  return Ue(e, t);
}
async function ma(t, e, a, r, n) {
  await Q(t);
  const i = ln(e, r), l = await ua(
    t,
    e,
    n
  ), o = W(n ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: Rr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: da(i),
    statSlides: on(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function ga(t, e, a) {
  await Q(t);
  const r = await t.matchupBetween(e, a), n = r.ok && r.data && typeof r.data == "object" ? r.data : {}, i = typeof n.games_played == "number" ? n.games_played : void 0, l = typeof n.wins == "number" ? n.wins : typeof n.win == "number" ? n.win : void 0, o = [
    {
      label: "Games sampled",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: "Hero A wins",
      value: l !== void 0 ? String(l) : "—"
    }
  ], m = me(e), u = me(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: ne(e),
    heroBName: ne(a),
    heroAPortraitSlug: m.heroPortraitSlug,
    heroBPortraitSlug: u.heroPortraitSlug,
    heroAPortraitUrl: m.heroPortraitUrl,
    heroBPortraitUrl: u.heroPortraitUrl,
    matchup: n,
    statLines: o,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: r.ok ? "opendota_cached" : "stale"
  };
}
function tt(t, e = 4e3) {
  var r, n, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: j((r = t.tournament) == null ? void 0 : r.winRate),
      sublabel: t.tournament ? fe(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((n = t.tournament) == null ? void 0 : n.picks) ?? "—"),
      sublabel: j((i = t.tournament) == null ? void 0 : i.pickRate)
    }
  ];
  return {
    heroId: t.heroId,
    heroName: t.heroName,
    heroPortraitSlug: t.heroPortraitSlug,
    heroPortraitUrl: t.heroPortraitUrl,
    playerLabel: t.playerLabel,
    slides: a,
    activeIndex: 0,
    slideDurationMs: e,
    startedAt: Date.now()
  };
}
async function cn(t) {
  return await Q(t), Lr();
}
class un {
  constructor() {
    L(this, "timer", null);
    L(this, "state", null);
    L(this, "opendota", null);
    L(this, "broadcast", null);
    L(this, "config", {
      enabled: !1,
      intervalMinutes: 5,
      durationSeconds: 12,
      cardTypes: ["player-league", "player-hero", "tournament-hero", "matchup"]
    });
  }
  getConfig() {
    return { ...this.config };
  }
  isActive() {
    return this.timer !== null;
  }
  async triggerNow() {
    S.info("Manual autopilot trigger requested"), await this.triggerRandomCard();
  }
  configure(e, a) {
    this.config = { ...this.config, ...e }, a && (this.state = a.state, this.opendota = a.opendota, this.broadcast = a.broadcast), this.config.enabled ? this.startTimer() : this.stopTimer();
  }
  startTimer() {
    if (this.stopTimer(), !this.state || !this.opendota || !this.broadcast) {
      S.warn("Autopilot cannot start: state, opendota or broadcast functions not configured.");
      return;
    }
    const e = this.config.intervalMinutes * 60 * 1e3;
    S.info({ intervalMinutes: this.config.intervalMinutes }, "Starting stats autopilot timer"), this.timer = setInterval(() => {
      this.triggerRandomCard();
    }, e);
  }
  stopTimer() {
    this.timer && (S.info("Stopping stats autopilot timer"), clearInterval(this.timer), this.timer = null);
  }
  async triggerRandomCard() {
    var e, a, r, n, i, l;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          S.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const u = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let h = m;
        u != null && u.radiantTeamKey && (u != null && u.direTeamKey) && (h = m.filter(
          (f) => f.teamKey === u.radiantTeamKey || f.teamKey === u.direTeamKey
        )), h.length === 0 && (h = m);
        const g = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], c = g[Math.floor(Math.random() * g.length)];
        S.info({ cardType: c }, "Autopilot: Triggering random stats card");
        const d = Date.now() + this.config.durationSeconds * 1e3;
        if (c === "player-league") {
          const f = h[Math.floor(Math.random() * h.length)], p = await ma(
            this.opendota,
            f.steam32,
            f.displayName,
            o.playerHeroIndex,
            m
          ), b = await this.state.patchState({
            heroStatsCard: p,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(b), S.info({ player: f.displayName }, "Autopilot: Displayed player league stats");
        } else if (c === "player-hero") {
          const f = h[Math.floor(Math.random() * h.length)], p = o.playerHeroIndex ?? {}, b = `${f.steam32}:`, y = Object.keys(p).filter((k) => k.startsWith(b)).map((k) => Number(k.split(":")[1]));
          let I = 1;
          if (y.length > 0)
            I = y[Math.floor(Math.random() * y.length)];
          else {
            const k = Object.keys(o.tournamentHeroIndex ?? {});
            k.length > 0 && (I = Number(k[Math.floor(Math.random() * k.length)]));
          }
          const E = await de(
            this.opendota,
            f.steam32,
            I,
            f.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), C = tt(E, 4e3), A = await this.state.patchState({
            heroStatsCard: E,
            statCarousel: C,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(A), S.info({ player: f.displayName, heroId: I }, "Autopilot: Displayed player-hero stats carousel");
        } else if (c === "tournament-hero") {
          const f = Object.keys(o.tournamentHeroIndex ?? {});
          if (f.length === 0) return;
          const p = Number(f[Math.floor(Math.random() * f.length)]), b = await ue(
            this.opendota,
            p,
            o.tournamentHeroIndex ?? {}
          ), y = await this.state.patchState({
            heroStatsCard: b,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(y), S.info({ heroId: p }, "Autopilot: Displayed tournament hero stats");
        } else if (c === "matchup") {
          const f = [
            ...((n = (r = o.draft) == null ? void 0 : r.radiant) == null ? void 0 : n.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
          ].filter((E) => E.heroId && E.heroId > 0);
          let p = 1, b = 2;
          if (f.length >= 2) {
            const E = f[Math.floor(Math.random() * f.length)];
            let C = f[Math.floor(Math.random() * f.length)];
            for (; C.heroId === E.heroId && f.length > 1; )
              C = f[Math.floor(Math.random() * f.length)];
            p = E.heroId, b = C.heroId;
          } else {
            const E = Object.keys(o.tournamentHeroIndex ?? {});
            if (E.length >= 2)
              for (p = Number(E[Math.floor(Math.random() * E.length)]), b = Number(E[Math.floor(Math.random() * E.length)]); b === p; )
                b = Number(E[Math.floor(Math.random() * E.length)]);
          }
          const y = await ga(this.opendota, p, b), I = await this.state.patchState({
            matchupCard: y,
            overlayVisibility: {
              matchup: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(I), S.info({ heroA: p, heroB: b }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        S.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const X = new un();
function ye(t, e) {
  return e instanceof we ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function dn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  X.configure({}, { state: a, opendota: n, broadcast: r }), e.get("/api/league/info", _, async (l, o) => {
    var h;
    const m = await a.getState(), u = await le(w.LEAGUE_ID);
    o.json({
      ...St(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: u,
      steamApiConfigured: !!w.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((h = w.LEAGUE_MATCH_IDS) != null && h.trim())
    });
  }), e.post("/api/league/config", _, async (l, o) => {
    o.status(400).json({
      error: `League ID is set via LEAGUE_ID env (${w.LEAGUE_ID}). Update .env and restart the API.`
    });
  }), e.post("/api/league/aggregate", _, async (l, o) => {
    var u;
    if (H.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    ((u = (await a.getState()).leagueConfig) == null ? void 0 : u.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: w.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), oa({
      leagueId: w.LEAGUE_ID,
      state: a,
      opendota: n,
      broadcast: r
    }), o.json({ ok: !0, started: !0, leagueId: w.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    _,
    async (l, o) => {
      if (!await qe({
        leagueId: w.LEAGUE_ID,
        state: a,
        broadcast: r
      })) {
        const h = await le(w.LEAGUE_ID), g = h.heroesExists ? yt(w.LEAGUE_ID, h) : { ...pt(w.LEAGUE_ID), statsStorage: h };
        return o.status(422).json(g);
      }
      const u = await a.getState();
      o.json({ ok: !0, leagueConfig: u.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    _,
    async (l, o) => {
      var h, g;
      const m = await le(w.LEAGUE_ID), u = await a.getState();
      o.json({
        ...m,
        statsDir: St().statsDir,
        aggregationSource: (h = u.leagueConfig) == null ? void 0 : h.aggregationSource,
        aggregatedAt: (g = u.leagueConfig) == null ? void 0 : g.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    _,
    async (l, o) => {
      const m = H.getProgress(), u = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: H.isBusy(),
        leagueId: w.LEAGUE_ID,
        leagueConfig: u.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", _, async (l, o) => {
    const u = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const h = zr(u.data.csv), g = await kt(h, n), c = wt(g), d = await a.patchState({
      leagueConfig: { roster: g, teamColors: c, leagueId: w.LEAGUE_ID }
    });
    await r.broadcastFull(d), o.json({ ok: !0, count: g.length, teamColors: c, roster: g });
  }), e.post("/api/roster/sync-bpcleague", _, async (l, o) => {
    const u = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    try {
      const h = u.data.seasonSlug || "season-1", g = await tn({
        seasonSlug: h,
        steamApiKey: w.STEAM_WEB_API_KEY
      }), c = await kt(g, n), d = wt(c), f = await a.patchState({
        leagueConfig: { roster: c, teamColors: d, leagueId: w.LEAGUE_ID, seasonSlug: h }
      });
      await r.broadcastFull(f), o.json({ ok: !0, count: c.length, teamColors: d, roster: c });
    } catch (h) {
      o.status(500).json({
        error: h instanceof Error ? h.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", _, async (l, o) => {
    var u;
    const m = await a.getState();
    o.json(((u = m.leagueConfig) == null ? void 0 : u.roster) ?? []);
  }), e.get("/api/teams", _, async (l, o) => {
    var h;
    const u = ((h = (await a.getState()).leagueConfig) == null ? void 0 : h.roster) ?? [];
    o.json(Ye(u));
  }), e.post("/api/match/setup", _, async (l, o) => {
    var d;
    const m = zt.safeParse(l.body);
    if (!m.success)
      return o.status(400).json({ error: m.error.flatten() });
    const u = await a.getState(), h = ((d = u.leagueConfig) == null ? void 0 : d.roster) ?? [];
    if (h.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: g, seriesGame: c } = m.data;
    if (c > g)
      return o.status(400).json({
        error: `Game ${c} is invalid for a BO${g} series`
      });
    try {
      const f = m.data, p = Et(
        f,
        h,
        u.draft
      ), b = await a.patchState({
        leagueConfig: { matchSetup: f },
        draft: p,
        production: {
          playerMappingPublished: !1
        }
      });
      await r.broadcastFull(b), o.json({
        ok: !0,
        matchSetup: f,
        teams: Ye(h),
        draft: b.draft
      });
    } catch (f) {
      o.status(400).json({
        error: f instanceof Error ? f.message : String(f)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    _,
    async (l, o) => {
      var E, C;
      const u = ((E = (await a.getState()).leagueConfig) == null ? void 0 : E.roster) ?? [];
      if (u.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const h = await le(w.LEAGUE_ID);
      if (!await qe({
        leagueId: w.LEAGUE_ID,
        state: a,
        broadcast: r
      })) {
        const A = h.heroesExists ? yt(w.LEAGUE_ID, h) : { ...pt(w.LEAGUE_ID), statsStorage: h };
        return o.status(422).json(A);
      }
      const c = await a.getState(), d = c.playerHeroIndex ?? {}, f = Object.keys(d).length, p = [];
      for (const A of u) {
        const k = `${A.steam32}:`;
        Object.keys(d).some((x) => x.startsWith(k)) || p.push(A.steam32);
      }
      const b = new Set(
        Object.keys(d).map((A) => Number(A.split(":")[0]))
      ), y = (C = u[0]) == null ? void 0 : C.steam32, I = y != null ? Oe(d, y).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: u.length,
        csvPlayerCount: b.size,
        indexKeyCount: f,
        matchedRosterCount: u.length - p.length,
        missingSteam32: p,
        statsStorage: h,
        indexEmpty: f === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: I,
        leagueConfig: c.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    _,
    async (l, o) => {
      var y;
      const m = Number(l.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const u = await a.getState(), h = u.playerHeroIndex ?? {}, g = `${m}:`, c = Object.entries(h).filter(([I]) => I.startsWith(g)).map(([I, E]) => ({
        heroId: Number(I.split(":")[1]),
        games: E.games,
        wins: E.wins
      })), d = Oe(h, m), f = await le(w.LEAGUE_ID);
      let p = [];
      try {
        p = (await be(f.playerHeroesPath, "utf8")).split(/\r?\n/).filter((E) => E.startsWith(`${m},`));
      } catch {
        p = [];
      }
      const b = p.reduce(
        (I, E) => I + (Number(E.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: w.LEAGUE_ID,
        gamesInIndex: d.games,
        winsInIndex: d.wins,
        heroRows: c,
        csvRowCount: p.length,
        csvGamesSum: b,
        aggregationMatchTotal: (y = u.leagueConfig) == null ? void 0 : y.aggregationMatchTotal,
        hint: d.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : d.games < b ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    _,
    async (l, o) => {
      var I, E, C, A, k;
      const m = s.object({ pickPlayers: Yt.optional() }).safeParse(l.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const u = await a.getState(), h = (I = u.leagueConfig) == null ? void 0 : I.matchSetup, g = ((E = u.leagueConfig) == null ? void 0 : E.roster) ?? [], c = u.draft;
      if (!h)
        return o.status(400).json({ error: "save match setup first" });
      if (!c)
        return o.status(400).json({ error: "no draft state" });
      if (c.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const d = m.data.pickPlayers, f = d ? {
        ...h,
        pickPlayers: {
          radiant: d.radiant ?? ((C = h.pickPlayers) == null ? void 0 : C.radiant),
          dire: d.dire ?? ((A = h.pickPlayers) == null ? void 0 : A.dire)
        }
      } : h, p = {
        ...u.leagueConfig,
        roster: g,
        matchSetup: f
      }, b = Xr(c, p), y = await a.patchState({
        leagueConfig: { matchSetup: f },
        draft: b,
        production: {
          playerMappingPublished: !0
        }
      });
      await r.broadcastFull(y), o.json({
        ok: !0,
        matchSetup: (k = y.leagueConfig) == null ? void 0 : k.matchSetup,
        draft: y.draft,
        production: y.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    _,
    async (l, o) => {
      var f, p, b;
      const m = await a.getState(), u = ((f = m.leagueConfig) == null ? void 0 : f.roster) ?? [], h = (p = m.leagueConfig) == null ? void 0 : p.matchSetup, g = (((b = m.production) == null ? void 0 : b.overlayDraftEpoch) ?? 0) + 1;
      let c = null;
      h && u.length > 0 && (c = Et(
        h,
        u,
        null
      ));
      const d = await a.patchState({
        draft: c,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: g
        }
      });
      await r.broadcastFull(d), o.json({
        ok: !0,
        overlayDraftEpoch: g,
        draft: d.draft
      });
    }
  ), e.post("/api/league/team-colors", _, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", _, async (l, o) => {
    const m = await cn(n);
    o.json(m);
  }), e.post("/api/stats/player-hero", _, async (l, o) => {
    var f;
    const u = s.object({
      steam32: s.number(),
      heroId: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const h = await a.getState();
    try {
      te(h);
    } catch (p) {
      if (ye(o, p)) return;
      throw p;
    }
    const g = ((f = h.leagueConfig) == null ? void 0 : f.roster) ?? [], c = W(g, u.data.steam32) ?? {
      steam32: u.data.steam32,
      displayName: u.data.displayName ?? `Player ${u.data.steam32}`
    }, d = await de(
      n,
      u.data.steam32,
      u.data.heroId,
      c.displayName,
      h.tournamentHeroIndex ?? {},
      g,
      h.playerHeroIndex
    );
    if (u.data.persist) {
      const p = await a.patchState({
        heroStatsCard: d,
        statCarousel: null
      });
      return await r.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post("/api/stats/player-league", _, async (l, o) => {
    var f;
    const u = s.object({
      steam32: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const h = await a.getState();
    try {
      te(h);
    } catch (p) {
      if (ye(o, p)) return;
      throw p;
    }
    const g = ((f = h.leagueConfig) == null ? void 0 : f.roster) ?? [], c = W(g, u.data.steam32) ?? {
      steam32: u.data.steam32,
      displayName: u.data.displayName ?? `Player ${u.data.steam32}`
    }, d = await ma(
      n,
      u.data.steam32,
      c.displayName,
      h.playerHeroIndex,
      g
    );
    if (u.data.persist) {
      const p = await a.patchState({
        heroStatsCard: d,
        statCarousel: null
      });
      return await r.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post(
    "/api/stats/tournament-hero",
    _,
    async (l, o) => {
      const u = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(l.body);
      if (!u.success)
        return o.status(400).json({ error: u.error.flatten() });
      const h = await a.getState();
      try {
        te(h);
      } catch (c) {
        if (ye(o, c)) return;
        throw c;
      }
      const g = await ue(
        n,
        u.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
      if (u.data.persist) {
        const c = await a.patchState({
          heroStatsCard: g,
          statCarousel: null
        });
        return await r.broadcastFull(c), o.json({ ok: !0, card: g, persisted: c });
      }
      o.json({ ok: !0, card: g });
    }
  ), e.post("/api/stats/matchup", _, async (l, o) => {
    const u = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error });
    await a.getState();
    const h = await ga(
      n,
      u.data.heroAId,
      u.data.heroBId
    );
    if (u.data.persist) {
      const g = await a.patchState({ matchupCard: h });
      return await r.broadcastFull(g), o.json({ ok: !0, card: h, persisted: g });
    }
    o.json({ ok: !0, card: h });
  }), e.post("/api/producer/h2h", _, async (l, o) => {
    var y;
    const u = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error });
    const h = await a.getState(), g = ((y = h.leagueConfig) == null ? void 0 : y.roster) ?? [], c = W(g, u.data.player1Steam32), d = W(g, u.data.player2Steam32);
    if (!c || !d)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      te(h);
    } catch (I) {
      return o.status(503).json({ error: I.message });
    }
    const f = Ue(h.playerHeroIndex, u.data.player1Steam32), p = Ue(h.playerHeroIndex, u.data.player2Steam32), b = {
      player1: { ...c, stats: f },
      player2: { ...d, stats: p }
    };
    i.of("/overlay").emit("SHOW_H2H", b), o.json({ ok: !0, payload: b });
  }), e.post("/api/stats/carousel", _, async (l, o) => {
    var p, b, y, I, E, C, A;
    const u = s.object({
      type: s.enum(["player-hero", "tournament-hero", "last-pick"]),
      heroId: s.number().optional(),
      steam32: s.number().optional(),
      slideDurationMs: s.number().optional(),
      overlaySeconds: s.number().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const h = await a.getState();
    try {
      te(h);
    } catch (k) {
      if (ye(o, k)) return;
      throw k;
    }
    const g = ((p = h.leagueConfig) == null ? void 0 : p.roster) ?? [];
    let c;
    if (u.data.type === "last-pick") {
      const k = (b = h.draft) == null ? void 0 : b.lastPick;
      if (!k) return o.status(400).json({ error: "no last pick" });
      const B = k.side === "dire" || k.side === "B" ? "dire" : "radiant", x = B === "radiant" ? (I = (y = h.draft) == null ? void 0 : y.radiant) == null ? void 0 : I.slots : (C = (E = h.draft) == null ? void 0 : E.dire) == null ? void 0 : C.slots, U = Vt(B, k.heroId, x), F = U !== void 0 ? Re((A = h.leagueConfig) == null ? void 0 : A.matchSetup, B, U) : void 0, V = F != null && F > 0 ? W(g, F) : void 0;
      c = V && F ? await de(
        n,
        F,
        k.heroId,
        V.displayName,
        h.tournamentHeroIndex ?? {},
        g,
        h.playerHeroIndex
      ) : await ue(
        n,
        k.heroId,
        h.tournamentHeroIndex ?? {}
      );
    } else if (u.data.type === "player-hero") {
      if (u.data.heroId === void 0 || u.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const k = W(g, u.data.steam32);
      c = await de(
        n,
        u.data.steam32,
        u.data.heroId,
        (k == null ? void 0 : k.displayName) ?? "Player",
        h.tournamentHeroIndex ?? {},
        g,
        h.playerHeroIndex
      );
    } else {
      if (u.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      c = await ue(
        n,
        u.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
    }
    const d = tt(
      c,
      u.data.slideDurationMs ?? 4e3
    ), f = Date.now() + (u.data.overlaySeconds ?? 12) * 1e3;
    if (u.data.persist !== !1) {
      const k = await a.patchState({
        heroStatsCard: c,
        statCarousel: d,
        overlayVisibility: {
          herostats: { mode: "timed", until: f }
        }
      });
      return await r.broadcastFull(k), o.json({ ok: !0, card: c, carousel: d, persisted: k });
    }
    o.json({ ok: !0, card: c, carousel: d });
  }), e.post("/api/stats/stop", _, async (l, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await r.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", _, async (l, o) => {
    const u = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const h = await a.patchState({ production: u.data });
    await r.broadcastFull(h), o.json(h.production);
  }), e.get("/api/league/bpc-matches", _, async (l, o) => {
    const m = l.query.seasonSlug, u = await an(m);
    o.json(u);
  }), e.get("/api/league/bpc-seasons", _, async (l, o) => {
    const m = await rn();
    o.json(m);
  }), e.get("/api/autopilot/config", _, (l, o) => {
    o.json({
      config: X.getConfig(),
      isActive: X.isActive()
    });
  }), e.post("/api/autopilot/config", _, (l, o) => {
    const u = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    X.configure(u.data), o.json({
      config: X.getConfig(),
      isActive: X.isActive()
    });
  }), e.post("/api/autopilot/trigger", _, async (l, o) => {
    await X.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const mn = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function R(t) {
  return t && typeof t == "object" ? t : null;
}
function Je(t) {
  const e = R(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const r = Number(a);
    if (Number.isFinite(r) && r > 0) return r;
  }
  return null;
}
function _e(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const At = /* @__PURE__ */ new Set();
function gn() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function fn(t, e, a, r) {
  gn() && (At.has(t) || (At.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: r.slug,
    source: r.source
  })));
}
function fa(t, e, a, r) {
  const n = ke({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  r && fn(r, t, e, n);
  const i = n.slug ?? Ar({ heroId: t, heroClass: e });
  if (i)
    return { ...Ja(i), slug: i };
  if (t) {
    const l = Pr(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: ke({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Ce(t, e) {
  if (t) return ne(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function Ct(t, e, a) {
  const r = `${e}${a}`, n = M(t[`${r}_id`]), i = _e(t[`${r}_class`]);
  if (!n && !i)
    return null;
  const l = {};
  return n > 0 && (l.hero_id = n), i && (l.class = i), l;
}
function Pt(t, e) {
  var i;
  const a = [], r = /* @__PURE__ */ new Set(), n = (l, o, m, u) => {
    const h = `${l}-${o}`;
    if (r.has(h) || (r.add(h), !m && !u)) return;
    const g = fa(
      m,
      u,
      Ce(m, u),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: m,
      heroName: Ce(m, u),
      heroPortraitSlug: g.slug,
      heroPortraitUrl: g.staticUrl,
      heroPortraitAnimatedUrl: g.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(l);
    if (!m) continue;
    const u = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", h = Number(m[2]), g = Je(o), c = R(o), d = _e((c == null ? void 0 : c.class) ?? (c == null ? void 0 : c.hero_class));
    n(u, h, g, d);
  }
  for (let l = 0; l < 7; l++) {
    const o = Ct(t, "ban", l);
    o && n(
      "ban",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      _e(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = Ct(t, "pick", l);
    o && n(
      "pick",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      _e(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function Rt(t, e) {
  return (e === "radiant" ? R(t.radiant) ?? R(t.team2) : R(t.dire) ?? R(t.team3)) ?? {};
}
function hn(t) {
  const e = t.activeteam ?? t.active_team;
  return e === 2 || e === "2" || e === "radiant" ? "radiant" : e === 3 || e === "3" || e === "dire" ? "dire" : null;
}
function M(t) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const e = Number(t);
    if (Number.isFinite(e)) return e;
  }
  return 0;
}
function pn(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function yn(t, e) {
  const a = R(t.team2), r = R(t.team3), n = M(t.radiant_bonus_time) || M(a == null ? void 0 : a.bonus_time), i = M(t.dire_bonus_time) || M(r == null ? void 0 : r.bonus_time);
  return e === "radiant" ? n : e === "dire" ? i : Math.max(n, i);
}
const Lt = 7, Tt = 5;
function z(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Pe(t, e) {
  return z(t, "pick") >= Tt && z(e, "pick") >= Tt;
}
function Qe(t, e) {
  return z(t, "ban") > 0 || z(e, "ban") > 0 || z(t, "pick") > 0 || z(e, "pick") > 0;
}
function bn(t, e, a) {
  const r = M(t == null ? void 0 : t.clock_time), n = M(
    a.activeteam_time_remaining ?? a.active_team_time_remaining
  ), i = () => {
    if (r < 0) return Math.max(0, Math.round(-r));
    if (r > 0 && r <= 120) return Math.round(r);
  };
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME")
    return i() ?? (n > 0 ? n : void 0);
  if (e === "DOTA_GAMERULES_STATE_PRE_GAME")
    return i();
  if (e === "DOTA_GAMERULES_STATE_HERO_SELECTION")
    return n > 0 ? n : i();
}
function Sn(t, e, a, r, n) {
  if (!t || Pe(a, r))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !Qe(a, r) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !Qe(a, r) && !n)
    return "starting";
  const i = z(a, "ban"), l = z(r, "ban");
  return i < Lt || l < Lt ? "bans" : "picks";
}
function Dt(t) {
  const e = R(t);
  if (!e) return null;
  const a = R(e.hero);
  if (a) {
    const r = Je(a);
    if (r) return r;
  }
  return Je(t);
}
function wn(t, e) {
  const a = /* @__PURE__ */ new Map(), r = R(t.player), n = R(t.hero), i = e === "radiant" ? R(n == null ? void 0 : n.team2) ?? R(n == null ? void 0 : n.radiant) : R(n == null ? void 0 : n.team3) ?? R(n == null ? void 0 : n.dire), l = e === "radiant" ? R(r == null ? void 0 : r.team2) ?? R(r == null ? void 0 : r.radiant) : R(r == null ? void 0 : r.team3) ?? R(r == null ? void 0 : r.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const u = /^player(\d+)$/i.exec(o);
      if (!u) continue;
      const h = Number(u[1]), g = Dt(m);
      if (g && g > 0 && Number.isFinite(h)) {
        let c;
        if (l) {
          const d = R(l[o]);
          if (d != null && d.accountid) {
            const f = parseInt(String(d.accountid), 10);
            Number.isFinite(f) && f > 0 && (c = f);
          }
        }
        a.set(h, { heroId: g, steam32: c });
      }
    }
  if (l)
    for (const [o, m] of Object.entries(l)) {
      const u = /^player(\d+)$/i.exec(o);
      if (!u) continue;
      const h = Number(u[1]), g = a.get(h);
      if (g != null && g.heroId) continue;
      const c = Dt(m);
      if (c && c > 0 && Number.isFinite(h)) {
        const d = R(m);
        let f;
        if (d != null && d.accountid) {
          const p = parseInt(String(d.accountid), 10);
          Number.isFinite(p) && p > 0 && (f = p);
        }
        a.set(h, { heroId: c, steam32: f });
      }
    }
  return a;
}
function Nt(t, e, a) {
  const r = wn(a, e);
  return t.map((n) => {
    if (n.type !== "pick") return n;
    const i = r.get(n.order);
    if (!i || !i.heroId || i.heroId <= 0) return n;
    const l = fa(
      i.heroId,
      void 0,
      Ce(i.heroId, void 0),
      `${e}-player${n.order}`
    );
    return {
      ...n,
      heroId: i.heroId,
      steam32: i.steam32,
      heroName: Ce(i.heroId, void 0),
      heroPortraitSlug: l.slug,
      heroPortraitUrl: l.staticUrl,
      heroPortraitAnimatedUrl: l.animatedUrl
    };
  });
}
const _n = [
  { side: "radiant", order: 0 },
  { side: "dire", order: 0 },
  { side: "dire", order: 1 },
  { side: "radiant", order: 1 },
  { side: "radiant", order: 2 },
  { side: "dire", order: 2 },
  { side: "dire", order: 3 },
  { side: "radiant", order: 3 },
  { side: "radiant", order: 4 },
  { side: "dire", order: 4 }
], En = [
  { side: "dire", order: 0 },
  { side: "radiant", order: 0 },
  { side: "radiant", order: 1 },
  { side: "dire", order: 1 },
  { side: "dire", order: 2 },
  { side: "radiant", order: 2 },
  { side: "radiant", order: 3 },
  { side: "dire", order: 3 },
  { side: "dire", order: 4 },
  { side: "radiant", order: 4 }
];
function Mt(t, e, a) {
  const n = (a === "dire_first_pick" ? En : _n).findIndex((i) => i.side === t && i.order === e);
  return n >= 0 ? n : e;
}
function vt(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function Ne(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function xt(t, e) {
  let a = t[0], r = Mt(a.side, a.slot.order, e);
  for (const n of t.slice(1)) {
    const i = Mt(n.side, n.slot.order, e);
    i > r && (a = n, r = i);
  }
  return a;
}
function In(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function kn(t, e, a) {
  var m, u, h, g;
  const r = [];
  for (const c of t)
    c.type === "pick" && c.heroId && r.push({ side: "radiant", slot: c });
  for (const c of e)
    c.type === "pick" && c.heroId && r.push({ side: "dire", slot: c });
  if (r.length === 0) return;
  const n = /* @__PURE__ */ new Set();
  for (const c of ["radiant", "dire"]) {
    const d = c === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (u = a == null ? void 0 : a.dire) == null ? void 0 : u.slots;
    for (const f of d ?? []) {
      const p = vt(c, f);
      p && n.add(p);
    }
  }
  const i = r.filter(
    ({ side: c, slot: d }) => !n.has(vt(c, d))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Pe(t, e) && a && !Pe(((h = a.radiant) == null ? void 0 : h.slots) ?? [], ((g = a.dire) == null ? void 0 : g.slots) ?? [])) {
      const c = xt(r, l), d = Ne(c.side, c.slot);
      if (In(a.lastPick, d)) return d;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const c = i[0];
    return Ne(c.side, c.slot);
  }
  const o = xt(i, l);
  return Ne(o.side, o.slot);
}
function Ht(t, e, a, r, n) {
  var o, m;
  if (!t)
    return {
      name: r,
      logoUrl: e === "radiant" ? ((o = n == null ? void 0 : n.radiant) == null ? void 0 : o.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlA) : ((m = n == null ? void 0 : n.dire) == null ? void 0 : m.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = ze(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: ce(l.teamKey)
  } : { name: r };
}
function An(t, e, a, r) {
  var V, se;
  const n = R(t.map), i = typeof (n == null ? void 0 : n.game_state) == "string" ? n.game_state : "", l = mn.has(i), o = R(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (n == null ? void 0 : n.team_name_radiant) == "string" ? n.team_name_radiant : "Radiant", u = typeof (n == null ? void 0 : n.team_name_dire) == "string" ? n.team_name_dire : "Dire", h = Ht(
    r,
    "radiant",
    a,
    m,
    e
  ), g = Ht(
    r,
    "dire",
    a,
    u,
    e
  ), c = o ?? {}, d = Rt(c, "radiant"), f = Rt(c, "dire");
  let p = Pt(d, "radiant"), b = Pt(f, "dire");
  Pe(p, b) && (p = Nt(p, "radiant", t), b = Nt(b, "dire", t));
  const I = o ? hn(c) : null, E = M(
    c.activeteam_time_remaining ?? c.active_team_time_remaining
  ), C = o ? pn(c) : void 0, A = o ? yn(c, I) : 0, k = [
    ...p.map((N) => ({
      team: "A",
      heroId: N.heroId,
      player: N.playerName,
      isBan: N.type === "ban",
      order: N.order,
      heroName: N.heroName,
      heroPortraitUrl: N.heroPortraitUrl
    })),
    ...b.map((N) => ({
      team: "B",
      heroId: N.heroId,
      player: N.playerName,
      isBan: N.type === "ban",
      order: N.order,
      heroName: N.heroName,
      heroPortraitUrl: N.heroPortraitUrl
    }))
  ], B = kn(p, b, e), x = Sn(
    l,
    i,
    p,
    b,
    I
  );
  let U = bn(n, i, c);
  x === "starting" && U === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? U = e.startSecondsRemaining : E > 0 && !Qe(p, b) && (U = E));
  const F = {
    source: "gsi",
    phase: x,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(A)),
    activeTeam: x === "starting" ? null : I,
    turnAction: x === "starting" ? void 0 : C,
    startSecondsRemaining: x === "starting" ? Math.max(
      0,
      Math.round(
        U ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: x === "starting" ? void 0 : Math.max(0, Math.round(E)),
    series: {
      teamA: h.name,
      teamB: g.name,
      scoreA: (e == null ? void 0 : e.series.scoreA) ?? 0,
      scoreB: (e == null ? void 0 : e.series.scoreB) ?? 0,
      bestOf: e == null ? void 0 : e.series.bestOf,
      gameNumber: e == null ? void 0 : e.series.gameNumber,
      logoUrlA: h.logoUrl ?? (e == null ? void 0 : e.series.logoUrlA),
      logoUrlB: g.logoUrl ?? (e == null ? void 0 : e.series.logoUrlB)
    },
    radiant: {
      name: h.name,
      logoUrl: h.logoUrl,
      slots: p,
      bonusTime: Math.max(0, Math.round(M(c.radiant_bonus_time) || M((V = R(c.team2)) == null ? void 0 : V.bonus_time) || 0))
    },
    dire: {
      name: g.name,
      logoUrl: g.logoUrl,
      slots: b,
      bonusTime: Math.max(0, Math.round(M(c.dire_bonus_time) || M((se = R(c.team3)) == null ? void 0 : se.bonus_time) || 0))
    },
    picksBansOrder: k,
    lastPick: B
  };
  return { inDraft: l || !!o, draftPatch: F };
}
const Me = /* @__PURE__ */ new Map(), jt = {
  item_blink: "CRITICAL MOBILITY: BLINK DAGGER",
  item_black_king_bar: "MAGIC IMMUNITY: BKB ONLINE",
  item_rapier: "ALL IN: DIVINE RAPIER",
  item_radiance: "FARMING ACCELERATOR: RADIANCE",
  item_manta: "ILLUSIONS READY: MANTA STYLE",
  item_ultimate_scepter: "AGHANIM'S SCEPTER SECURED",
  item_bfury: "CLEAVE ACTIVE: BATTLE FURY",
  item_heart: "MASSIVE SURVIVABILITY: HEART",
  item_monkey_king_bar: "TRUE STRIKE: MKB ONLINE",
  item_bloodthorn: "SILENCE READY: BLOODTHORN",
  item_refresher: "DOUBLE ULTIMATE: REFRESHER",
  item_sheepstick: "HEX READY: SCYTHE OF VYSE"
};
function Cn(t, e, a) {
  var r, n;
  try {
    return ((n = (r = t == null ? void 0 : t.items) == null ? void 0 : r[e]) == null ? void 0 : n[a]) || {};
  } catch {
    return {};
  }
}
function Pn(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.hero) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "unknown_hero";
  } catch {
    return "unknown_hero";
  }
}
function Rn(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.player) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function Ln(t, e) {
  var n;
  if (!(t != null && t.items) || (((n = t == null ? void 0 : t.map) == null ? void 0 : n.clock_time) || 0) < 0) return;
  const r = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, u = Cn(t, i, m), h = Rn(t, i, m);
      if (!h || h === "Unknown Player") continue;
      Me.has(h) || Me.set(h, /* @__PURE__ */ new Set());
      const g = Me.get(h), c = /* @__PURE__ */ new Set();
      for (const d in u) {
        const f = (l = u[d]) == null ? void 0 : l.name;
        f && f !== "empty" && c.add(f);
      }
      for (const d of c)
        if (!g.has(d) && (g.add(d), jt[d])) {
          const f = Pn(t, i, m), p = jt[d];
          S.info({ playerName: h, heroName: f, item: d, hypeText: p }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: h,
            heroName: f,
            item: d,
            hypeText: p
          });
        }
    }
  };
  r("team2"), r("team3");
}
let ae = 0, ve = null;
function Tn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var p, b;
    const m = typeof l.query.token == "string" ? l.query.token : void 0;
    if (w.GSI_TOKEN && m !== w.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const u = l.body;
    ae = Date.now(), await Q(n);
    try {
      Ln(u, i);
    } catch (y) {
      S.error(y, "Power spike evaluation failed");
    }
    const h = await a.getState(), g = ((p = h.leagueConfig) == null ? void 0 : p.roster) ?? [], c = ((b = h.leagueConfig) == null ? void 0 : b.matchSetup) ?? null, d = An(
      u,
      h.draft ?? null,
      g,
      c
    ), f = async () => {
      var C, A, k, B, x, U, F, V, se, N;
      const y = await a.getState();
      let I = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      d.draftPatch && (I = {
        ...I,
        draft: {
          ...y.draft ?? {
            series: {
              teamA: "Radiant",
              teamB: "Dire",
              scoreA: 0,
              scoreB: 0
            },
            side: "radiant_first_pick",
            phase: "picks",
            reserveSeconds: 0
          },
          ...d.draftPatch
        }
      });
      const E = await a.patchState(I);
      if (await r.broadcastFull(E), (C = y.production) != null && C.autoShowStatsOnPick && ((A = d.draftPatch) != null && A.lastPick)) {
        try {
          te(y);
        } catch {
          return;
        }
        const oe = d.draftPatch.lastPick, Le = oe.side === "dire" || oe.side === "B" ? "dire" : "radiant", ba = Le === "radiant" ? ((k = d.draftPatch.radiant) == null ? void 0 : k.slots) ?? ((x = (B = y.draft) == null ? void 0 : B.radiant) == null ? void 0 : x.slots) : ((U = d.draftPatch.dire) == null ? void 0 : U.slots) ?? ((V = (F = y.draft) == null ? void 0 : F.dire) == null ? void 0 : V.slots), at = Vt(Le, oe.heroId, ba), ie = at !== void 0 ? Re((se = y.leagueConfig) == null ? void 0 : se.matchSetup, Le, at) : void 0, rt = ((N = y.leagueConfig) == null ? void 0 : N.roster) ?? [], nt = ie != null && ie > 0 ? W(rt, ie) : void 0, st = nt && ie ? await de(
          n,
          ie,
          oe.heroId,
          nt.displayName,
          y.tournamentHeroIndex ?? {},
          rt,
          y.playerHeroIndex
        ) : await ue(
          n,
          oe.heroId,
          y.tournamentHeroIndex ?? {}
        ), Sa = tt(st), wa = Date.now() + 12e3, _a = await a.patchState({
          heroStatsCard: st,
          statCarousel: Sa,
          overlayVisibility: {
            herostats: { mode: "timed", until: wa }
          }
        });
        await r.broadcastFull(_a);
      }
    };
    ve && clearTimeout(ve), ve = setTimeout(() => {
      f().catch((y) => S.error(y, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: d.inDraft });
  }), e.get("/gsi/status", (l, o) => {
    o.json({
      lastSeen: ae ? new Date(ae).toISOString() : null,
      connected: Date.now() - ae < 5e3
    });
  });
}
function Dn(t, e, a) {
  var r, n;
  (n = (r = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - ae > 8e3 && ae > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || n.call(r);
}
function Ot(t, e) {
  var n, i;
  const a = e;
  let r = "";
  return typeof ((n = a.auth) == null ? void 0 : n.token) == "string" ? r = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (r = a.query.token), r ? r === w.BROADCAST_SECRET : t === "overlay" && w.NODE_ENV === "development";
}
async function Nn(t) {
  const { state: e, obs: a, opendota: r } = t, n = He();
  n.use(Da({ crossOriginResourcePolicy: !1 })), n.disable("x-powered-by"), n.use(
    Ta({
      origin: w.NODE_ENV === "production" ? it() : !0,
      credentials: !0
    })
  ), n.use(He.json({ limit: "1mb" }));
  const i = Na.createServer(n), l = new Ma(i, {
    cors: w.NODE_ENV === "production" ? { origin: it() } : { origin: !0 },
    transports: ["websocket", "polling"]
  }), o = {
    async broadcastFull(g) {
      const c = g ?? await e.getState();
      l.of(K.OVERLAY).emit($.STATE_FULL, c), l.of(K.PRODUCER).emit(
        $.STATE_FULL,
        c
      ), S.debug({ seq: c.seq }, "Emitted state snapshot");
    }
  };
  Ir({
    app: n,
    state: e,
    io: l,
    broadcast: o,
    obs: a,
    opendota: r
  }), dn({
    app: n,
    state: e,
    io: l,
    broadcast: o,
    opendota: r
  }), Tn({
    app: n,
    state: e,
    broadcast: o,
    opendota: r,
    io: l
  }), Dn(e, o);
  const m = l.of(K.PRODUCER), u = l.of(K.OVERLAY);
  m.use((g, c) => {
    const d = Ot("producer", g.handshake);
    c(d ? void 0 : new Error("unauthorized producer"));
  }), u.use((g, c) => {
    const d = Ot("overlay", g.handshake);
    c(d ? void 0 : new Error("unauthorized overlay"));
  }), m.on("connection", (g) => {
    S.info({ id: g.id }, "producer connected"), e.getState().then((c) => {
      g.emit($.STATE_FULL, c);
    });
  }), u.on("connection", (g) => {
    S.info({ id: g.id }, "overlay viewer connected"), e.getState().then((c) => {
      g.emit($.STATE_FULL, c);
    });
  });
  const h = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(h) && h > 500) {
    const g = setInterval(() => {
      e.getState().then((c) => {
        l.of(K.OVERLAY).emit($.STATE_FULL, c);
      });
    }, h);
    typeof g.unref == "function" && g.unref();
  }
  return { app: n, httpServer: i, io: l, broadcast: o };
}
async function ha() {
  const t = await wr(), e = new Fa(), a = new Ka();
  w.REDIS_URL && a.attachRedis(w.REDIS_URL), Q(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  );
  const r = await Nn({ state: t, obs: e, opendota: a });
  await qr({
    state: t,
    opendota: a,
    broadcast: r.broadcast
  }), r.httpServer.listen(w.PORT, () => {
    S.info(
      { port: w.PORT, leagueId: w.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const n = async () => {
    var i;
    S.info("Shutting down"), await r.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), r.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void n()), process.on("SIGTERM", () => void n()), { obs: e, opendota: a, state: t, shutdown: n };
}
import.meta.url === `file://${process.argv[1]}` && ha().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
const pa = T.dirname(Ft(import.meta.url));
process.env.APP_ROOT = T.join(pa, "..");
process.env.BPC_NO_EXIT = "1";
const Xe = process.env.VITE_DEV_SERVER_URL, ts = T.join(process.env.APP_ROOT, "dist-electron"), ya = T.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = Xe ? T.join(process.env.APP_ROOT, "public") : ya;
let P, Ee = null;
async function Mn() {
  P = new ka({
    width: 800,
    height: 600,
    webPreferences: {
      preload: T.join(pa, "preload.js")
    }
  }), Xe ? P.loadURL(Xe) : P.loadFile(T.join(ya, "index.html"));
}
xe.on("window-all-closed", () => {
  process.platform !== "darwin" && (xe.quit(), P = null);
});
let Ze = null;
xe.whenReady().then(async () => {
  Mn();
  try {
    Ze = await ha(), P == null || P.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (t) {
    P == null || P.webContents.send("log", "Error starting API: " + t);
  }
  try {
    Ee = (await Aa.forward({ addr: 8080, authtoken: "25ZebxW6Y4x5PWoRwLhfY_6Qcr75LEn1PPifYovuxU3" })).url() ?? null, P == null || P.webContents.send("ngrok-url", Ee), P == null || P.webContents.send("log", "Ngrok tunnel established: " + Ee);
  } catch (t) {
    P == null || P.webContents.send("log", "Error starting Ngrok: " + t);
  }
});
Ut.handle("get-tunnel-url", () => Ee);
Ut.handle("obs-connect", async (t, e, a, r) => {
  if (!Ze) return { ok: !1, error: "API not started" };
  try {
    P == null || P.webContents.send("log", `Connecting OBS to ${e}:${a}...`);
    const n = await Ze.obs.connect({ host: e, port: a, password: r });
    return n.ok ? P == null || P.webContents.send("log", "OBS Connected successfully.") : P == null || P.webContents.send("log", "OBS Connection failed: " + n.error), n;
  } catch (n) {
    return { ok: !1, error: String(n) };
  }
});
export {
  ts as MAIN_DIST,
  ya as RENDERER_DIST,
  Xe as VITE_DEV_SERVER_URL
};

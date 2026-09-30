var Ja = Object.defineProperty;
var Qa = (t, e, a) => e in t ? Ja(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var D = (t, e, a) => Qa(t, typeof e != "symbol" ? e + "" : e, a);
import P from "node:path";
import { fileURLToPath as nt } from "node:url";
import { config as Xa } from "dotenv";
import { z as s } from "zod";
import Za from "pino";
import en from "obs-websocket-js";
import tn from "bottleneck";
import { Redis as rt } from "ioredis";
import an from "cors";
import fe from "express";
import nn from "helmet";
import rn from "node:http";
import { Server as sn } from "socket.io";
import R, { existsSync as Ot } from "node:fs";
import { exec as on } from "node:child_process";
import { promisify as ln } from "node:util";
import { mkdir as ba, writeFile as Ae, access as cn, readFile as Ee } from "node:fs/promises";
import Sa from "node:https";
const un = P.dirname(nt(import.meta.url));
Xa({ path: P.resolve(un, "../.env") });
const dn = s.object({
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
  REPLAY_DB_FILE: s.string().default(P.resolve(process.cwd(), "../../data/system/replay_db.csv")),
  REPLAY_MATCH_FILE: s.string().default(P.resolve(process.cwd(), "../../data/system/active_match.txt")),
  REPLAY_LAST_COMPLETED_FILE: s.string().default(P.resolve(process.cwd(), "../../data/system/last_completed_match.txt")),
  REPLAY_PLAYBACK_DIR: s.string().default(P.resolve(process.cwd(), "../../data/playback")),
  REPLAY_FOLDER: s.string().default(P.resolve(process.cwd(), "../../data/replays")),
  HIGHLIGHTS_FOLDER: s.string().default(P.resolve(process.cwd(), "../../data/highlights")),
  ROSTER_CSV_PATH: s.string().default("data/roster/players_roster_prepared.csv")
}), I = dn.parse(process.env);
function Ut() {
  return I.CORS_ORIGINS.split(",").map((t) => t.trim()).filter(Boolean);
}
const S = Za({
  level: process.env.LOG_LEVEL ?? "info"
});
class mn {
  constructor() {
    D(this, "client", new en());
    D(this, "settings", null);
    D(this, "reconnectTimer", null);
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
    return ((await this.client.call("GetSceneList")).scenes ?? []).map((n) => n.sceneName ?? "").filter(Boolean);
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
  async getCurrentProgramScene() {
    try {
      return { ok: !0, sceneName: (await this.client.call("GetCurrentProgramScene")).currentProgramSceneName };
    } catch (e) {
      return {
        ok: !1,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
  async setSourceVisible(e) {
    try {
      const r = ((await this.client.call("GetSceneItemList", {
        sceneName: e.sceneName
      })).sceneItems ?? []).find(
        (i) => typeof i.sceneItemId == "number" && i.sourceName === e.sourceName
      );
      return r ? (await this.client.call("SetSceneItemEnabled", {
        sceneName: e.sceneName,
        sceneItemId: r.sceneItemId,
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
    } catch (n) {
      return {
        ok: !1,
        error: n instanceof Error ? n.message : String(n)
      };
    }
  }
  async setInputSettings(e, a) {
    try {
      return await this.client.call("SetInputSettings", { inputName: e, inputSettings: a }), { ok: !0 };
    } catch (n) {
      return {
        ok: !1,
        error: n instanceof Error ? n.message : String(n)
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
  async saveReplayBuffer() {
    try {
      return await this.client.call("SaveReplayBuffer"), { ok: !0 };
    } catch (e) {
      return {
        ok: !1,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }
  on(e, a) {
    this.client.on(e, a);
  }
}
const gn = "https://api.opendota.com/api";
function fn(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class hn {
  constructor(e = 600) {
    D(this, "limiter");
    D(this, "memory", /* @__PURE__ */ new Map());
    D(this, "redis", null);
    this.ttlSeconds = e;
    const a = I.OPENDOTA_RATE_PER_MINUTE, n = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new tn({
      minTime: n,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new rt(e);
  }
  async shutdown() {
    var e;
    await ((e = this.redis) == null ? void 0 : e.quit().catch(() => {
    }));
  }
  async getCached(e, a) {
    const n = Date.now(), r = this.memory.get(e);
    if (r && r.expiry > n) return r.body;
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
      expiry: n + this.ttlSeconds * 1e3,
      body: i
    }), this.redis && await this.redis.setex(`opendota:${e}`, this.ttlSeconds, JSON.stringify(i)).catch(() => {
    })), i;
  }
  async fetchLive(e, a = "GET") {
    return this.limiter.schedule(async () => {
      try {
        const n = await fetch(`${gn}${e}`, {
          method: a,
          signal: AbortSignal.timeout(9e4)
        }), r = await n.text();
        if (!n.ok)
          return {
            ok: !1,
            status: n.status,
            error: r.slice(0, 280)
          };
        try {
          return {
            ok: !0,
            status: n.status,
            data: JSON.parse(r)
          };
        } catch {
          return { ok: !1, status: n.status, error: "invalid json" };
        }
      } catch (n) {
        return {
          ok: !1,
          status: 0,
          error: n instanceof Error ? n.message : String(n)
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
    const n = await this.heroMatchups(e);
    if (!n.ok || n.data === void 0 || n.data === null)
      return {
        ok: !1,
        status: n.status,
        error: n.error ?? "matchup unavailable"
      };
    const r = Array.isArray(n.data) ? n.data : [];
    let i = {};
    for (const l of r)
      if (l && typeof l == "object" && "hero_id" in l) {
        const o = l.hero_id;
        if (typeof o == "number" && o === a) {
          i = l;
          break;
        }
      }
    return {
      ok: !0,
      status: n.status ?? 200,
      data: i
    };
  }
  purgeMemory() {
    this.memory.clear();
  }
}
const Z = "Game starting in", wa = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), pn = wa.partial();
function Pe(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function yn(t, e, a = Date.now()) {
  if (e.running === !0) {
    const r = e.secondsRemaining ?? (t ? Pe(t, a) : 0), i = Math.max(0, Math.floor(r));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const r = e.secondsRemaining ?? (t ? Pe(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(r))
    };
  }
  const n = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? Pe(t, a) : 0)
  };
  if (n.running && !n.endsAt) {
    const r = Math.max(0, n.secondsRemaining);
    return {
      ...n,
      endsAt: new Date(a + r * 1e3).toISOString()
    };
  }
  return n.running ? n : { ...n, endsAt: null };
}
function $t(t, e = Z) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function Bt(t, e = Z) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const bn = {
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
function Sn(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (bn[e] ?? e);
}
function U(t) {
  return Sn(t.replace(/^npc_dota_hero_/, "").trim());
}
function wn(t) {
  if (!t)
    return {};
  const e = U(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: _a(e)
  } : {};
}
function _a(t, e) {
  const a = U(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function _n(t, e) {
  const a = U(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function kn(t, e) {
  const a = U(t);
  if (!a)
    return {};
  const n = _a(a), r = _n(a);
  return {
    staticUrl: n,
    staticFallbackUrl: n,
    animatedUrl: r
  };
}
function ka(t) {
  return `/teams/${t}.png`;
}
function Be(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function In(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map();
  for (const r of t) {
    const i = U(r.name);
    if (!i)
      continue;
    e.set(r.id, i), a.add(i), n.set(Be(r.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    n.set(Be(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: n };
}
function Cn(t, e) {
  const { heroId: a, heroClass: n, heroName: r, urlSlug: i } = t;
  if (i) {
    const l = U(i);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "url" };
  }
  if (a != null && a > 0) {
    const l = e.byId.get(a);
    if (l)
      return { slug: l, source: "id" };
  }
  if (n) {
    const l = U(n);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [r, n]) {
    if (!l)
      continue;
    const o = Be(l), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (n) {
    const l = U(n);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function He(t, e, a) {
  var r, i;
  const n = e === "radiant" ? (r = t == null ? void 0 : t.pickPlayers) == null ? void 0 : r.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!n || a < 0 || a >= n.length))
    return n[a] ?? null;
}
function An(t, e, a) {
  var r, i;
  const n = He(t == null ? void 0 : t.matchSetup, e, a);
  if (!(n == null || !((r = t == null ? void 0 : t.roster) != null && r.length)))
    return (i = t.roster.find((l) => l.steam32 === n)) == null ? void 0 : i.displayName;
}
function Ia(t, e, a) {
  const n = a == null ? void 0 : a.find((r) => r.type === "pick" && r.heroId === e);
  return n == null ? void 0 : n.order;
}
function En(t, e) {
  return `${t}:${e}`;
}
function Ge(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let n = 0, r = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (n += l.games, r += l.wins);
  return { games: n, wins: r };
}
function Ca(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[En(e, a)];
}
function Ke(t, e) {
  if (Ge(t, e).games <= 0)
    return;
  const a = `${e}:`, n = {
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
    !l.startsWith(a) || o.games <= 0 || (n.games += o.games, n.wins += o.wins, n.kills += o.avgKills * o.games, n.deaths += o.avgDeaths * o.games, n.assists += o.avgAssists * o.games, n.heroDamage += o.avgHeroDamage * o.games, n.goldPerMin += o.avgGpm * o.games, n.lastHits += o.avgLastHits * o.games, n.maxKills = Math.max(n.maxKills, o.maxKills), n.laneWins += o.laneWins ?? 0, n.laneDraws += o.laneDraws ?? 0, n.laneLosses += o.laneLosses ?? 0);
  const r = n.games, i = n.deaths > 0 ? (n.kills + n.assists) / n.deaths : n.kills + n.assists;
  return {
    games: r,
    wins: n.wins,
    winRate: n.wins / r,
    avgKills: n.kills / r,
    avgDeaths: n.deaths / r,
    avgAssists: n.assists / r,
    avgKda: i,
    maxKills: n.maxKills,
    avgHeroDamage: n.heroDamage / r,
    avgGpm: n.goldPerMin / r,
    avgLastHits: n.lastHits / r,
    laneWins: n.laneWins,
    laneDraws: n.laneDraws,
    laneLosses: n.laneLosses
  };
}
const Pn = [
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
  "liveplayercard",
  "rankmedals",
  "global_kill_switch"
], Rn = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), Aa = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  Rn
]), vn = s.object({
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
}), Dn = s.object({
  steam32: s.number(),
  displayName: s.string(),
  teamName: s.string().optional(),
  teamKey: s.string().optional(),
  /** Brand hex from roster CSV (e.g. `#1e4d8c`) */
  teamColor: s.string().optional(),
  /** Steam avatar; optional CSV column or filled from OpenDota on roster upload */
  avatarUrl: s.string().optional(),
  /** @deprecated use leagueConfig.matchSetup instead */
  side: s.enum(["radiant", "dire", "A", "B"]).optional(),
  /** Preferred roles synced from BPC League */
  roles: s.array(s.string()).optional(),
  /** Player MMR from BPCL API for dynamic rank medals */
  mmr: s.number().optional()
}), Ea = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), Pa = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: Ea.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => De)).optional()
}), Ra = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(Dn).default([]),
  matchSetup: Pa.nullable().optional(),
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
}), va = s.object({
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
}), Da = s.object({
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
}), La = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), Ve = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(La),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), Ta = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Ln = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Tn = s.object({
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
}), Gt = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Tn).optional(),
  bonusTime: s.number().optional()
}), Nn = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), De = s.object({
  series: vn,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Ln).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: Gt.optional(),
  dire: Gt.optional(),
  lastPick: Nn.optional()
}), We = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), Mn = s.object({
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
  replays: s.array(Mn)
});
const qe = s.object({
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
}), xn = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), Hn = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), le = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: Hn.optional(),
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
  tournament: xn.optional(),
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
  statSlides: s.array(La).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
}), Ye = s.object({
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
}), ze = s.object({
  banners: s.array(s.object({
    title: s.string(),
    subtitle: s.string().optional(),
    imageUrl: s.string().optional(),
    durationSeconds: s.number().positive(),
    isCoSponsor: s.boolean().optional(),
    color: s.string().optional()
  })),
  activeIndex: s.number().nonnegative(),
  startedAt: s.number().optional()
}), jn = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: wa.optional()
}), Na = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), Ma = s.object({
  roshanState: s.string().optional(),
  roshanRespawnTimer: s.number().optional(),
  tormentorRadiant: s.string().optional(),
  tormentorRadiantRespawnTimer: s.number().optional(),
  tormentorDire: s.string().optional(),
  tormentorDireRespawnTimer: s.number().optional(),
  radiantScanActive: s.boolean().optional(),
  radiantScanCooldown: s.number().optional(),
  direScanActive: s.boolean().optional(),
  direScanCooldown: s.number().optional(),
  radiantGlyphActive: s.boolean().optional(),
  radiantGlyphCooldown: s.number().optional(),
  direGlyphActive: s.boolean().optional(),
  direGlyphCooldown: s.number().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(Aa).default({}),
  sceneHints: Na.optional(),
  leagueConfig: Ra.optional(),
  tournamentHeroIndex: s.record(va).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(Da).optional(),
  production: Ta.optional(),
  statCarousel: Ve.nullable().optional(),
  draft: De.nullable().optional(),
  lowerThirds: We.nullable().optional(),
  playerStatsCard: qe.nullable().optional(),
  heroStatsCard: le.nullable().optional(),
  livePlayerCard: le.nullable().optional(),
  matchupCard: Ye.nullable().optional(),
  sponsor: ze.nullable().optional(),
  timers: jn.optional(),
  minimapState: Ma.optional()
});
const Fn = s.object({
  overlayVisibility: s.record(Aa).optional(),
  leagueConfig: Ra.partial().optional(),
  tournamentHeroIndex: s.record(va).optional(),
  playerHeroIndex: s.record(Da).optional(),
  production: Ta.partial().optional(),
  minimapState: Ma.partial().optional(),
  statCarousel: s.union([Ve, Ve.partial(), s.null()]).optional(),
  draft: s.union([De, De.partial(), s.null()]).optional(),
  lowerThirds: s.union([We, We.partial(), s.null()]).optional(),
  playerStatsCard: s.union([qe, qe.partial(), s.null()]).optional(),
  heroStatsCard: s.union([le, le.partial(), s.null()]).optional(),
  livePlayerCard: s.union([le, le.partial(), s.null()]).optional(),
  matchupCard: s.union([Ye, Ye.partial(), s.null()]).optional(),
  sponsor: s.union([
    ze,
    ze.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: pn.optional()
  }).partial().optional(),
  sceneHints: Na.partial().optional()
});
function On() {
  const t = {};
  for (const e of Pn)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function Un() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function xa() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: On(),
    sceneHints: {},
    leagueConfig: Un(),
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
    livePlayerCard: null,
    matchupCard: null,
    sponsor: null,
    timers: {},
    minimapState: {}
  };
}
const V = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, W = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function k(t, e, a) {
  let n;
  const r = t.headers.authorization;
  if (r != null && r.startsWith("Bearer ") ? n = r.slice(7).trim() : typeof t.query.token == "string" && (n = t.query.token), !n) {
    e.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (n !== I.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function $n(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function Kt(t, e) {
  if (!e)
    return t;
  if (!(t != null && t.length))
    return e;
  const a = new Map(t.map((n) => [`${n.type}:${n.order}`, n]));
  return e.map((n) => {
    const r = a.get(`${n.type}:${n.order}`);
    return !(r != null && r.playerName) && (r == null ? void 0 : r.steam32) === void 0 ? n : {
      ...n,
      playerName: n.playerName ?? r.playerName,
      steam32: n.steam32 ?? r.steam32
    };
  });
}
function Bn(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const n = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, r = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return n != null && n.slots && (n.slots = Kt((i = t.radiant) == null ? void 0 : i.slots, n.slots)), r != null && r.slots && (r.slots = Kt((l = t.dire) == null ? void 0 : l.slots, r.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: n,
    dire: r,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function ae(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function Gn(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function Kn(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function Ha(t, e) {
  var w;
  const a = e.overlayVisibility !== void 0 ? $n(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let n = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: b, ..._ } = e.timers;
    n = {
      ...t.timers ?? {},
      ..._
    }, b !== void 0 && (n = {
      ...n,
      gameStartCountdown: yn((w = t.timers) == null ? void 0 : w.gameStartCountdown, b)
    });
  }
  const r = Bn(t.draft, e.draft), i = Gn(t.leagueConfig, e.leagueConfig), l = Kn(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let c = ae(t.heroStatsCard ?? void 0, e.heroStatsCard), h = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const f = ae(t.lowerThirds ?? void 0, e.lowerThirds), u = ae(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let d = ae(t.matchupCard ?? void 0, e.matchupCard), g = ae(t.sponsor ?? void 0, e.sponsor), p = ae(t.statCarousel ?? void 0, e.statCarousel);
  if (c && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const b = e.heroStatsCard;
    b.fetchedAt ? c = { ...b } : c = {
      ...c,
      ...b,
      tournament: b.tournament ? { ...c.tournament ?? {}, ...b.tournament } : c.tournament,
      playerHero: b.playerHero ? { ...c.playerHero ?? {}, ...b.playerHero } : c.playerHero,
      statSlides: b.statSlides ?? c.statSlides
    };
  }
  if (d && e.matchupCard && typeof e.matchupCard == "object") {
    const b = e.matchupCard;
    d = {
      ...d,
      ...b,
      matchup: b.matchup ? { ...d.matchup ?? {}, ...b.matchup } : d.matchup
    };
  }
  let y = ae(t.livePlayerCard ?? void 0, e.livePlayerCard);
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
    draft: r === void 0 ? t.draft : r,
    lowerThirds: f === void 0 ? t.lowerThirds : f,
    playerStatsCard: u === void 0 ? t.playerStatsCard : u,
    heroStatsCard: c === void 0 ? t.heroStatsCard : c,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: d === void 0 ? t.matchupCard : d,
    sponsor: g === void 0 ? t.sponsor : g,
    timers: n ?? t.timers,
    sceneHints: h,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState
  };
}
function Vt(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = Ha(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function Vn(t) {
  const e = new rt(t.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(r) {
      return Math.min(r * 200, 2e3);
    }
  });
  let a = !1;
  async function n() {
    if (a)
      return;
    await e.connect().catch(() => {
    }), a = !0, await e.get(t.key) || await e.set(t.key, JSON.stringify(t.seed));
  }
  return {
    async getState() {
      await n();
      const r = await e.get(t.key);
      if (!r)
        throw new Error("Redis state missing");
      return JSON.parse(r);
    },
    async patchState(r) {
      await n();
      let i = 0;
      for (; i++ < 8; ) {
        await e.watch(t.key);
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, m = Ha(o, r);
        if (await e.multi().set(t.key, JSON.stringify(m)).exec())
          return m;
      }
      throw new Error("Redis optimistic lock exhaustion");
    },
    async replaceState(r) {
      return await n(), await e.set(t.key, JSON.stringify(r)), structuredClone(r);
    },
    async shutdown() {
      await e.quit();
    }
  };
}
async function Wn() {
  const t = xa();
  if (I.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), Vt(t);
  if (!I.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new rt(I.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: I.REDIS_STATE_KEY }, "State backend: redis"), Vn({
      url: I.REDIS_URL,
      key: I.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), I.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), Vt(t);
    throw e;
  }
}
function qn(t) {
  return Fn.parse(t);
}
const ke = ln(on);
class Yn {
  constructor() {
    D(this, "dbFile", I.REPLAY_DB_FILE);
    D(this, "matchFile", I.REPLAY_MATCH_FILE);
    D(this, "lastCompletedFile", I.REPLAY_LAST_COMPLETED_FILE);
    D(this, "playbackDir", I.REPLAY_PLAYBACK_DIR);
    D(this, "replayFolder", I.REPLAY_FOLDER);
    D(this, "highlightsDir", I.HIGHLIGHTS_FOLDER || P.resolve(process.cwd(), "../../data/highlights"));
    D(this, "pendingDuration", null);
    D(this, "playbackState", "IDLE");
    D(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    D(this, "previewCacheDir", P.resolve(process.cwd(), "public-preview-cache"));
    if (!R.existsSync(this.previewCacheDir))
      try {
        R.mkdirSync(this.previewCacheDir, { recursive: !0 });
      } catch (e) {
        S.error(e, "Failed to create preview cache directory");
      }
  }
  getPreviewCacheDir() {
    return this.previewCacheDir;
  }
  init(e) {
    e.on("ReplayBufferSaved", async (a) => {
      const n = a.savedReplayPath;
      n && await this.handleReplaySaved(n);
    }), e.on("CurrentProgramSceneChanged", (a) => {
      const n = a.sceneName;
      this.playbackState !== "IDLE" && n !== "Replay Stinger" && n !== "Replay" && (S.info(`Manual scene switch to ${n} detected. Cancelling replay sequence.`), this.playbackState = "IDLE", this.originalScene = null);
    }), e.on("MediaInputPlaybackEnded", async (a) => {
      const n = a.inputName;
      this.playbackState === "STINGER_IN" && n === "Stinger" ? (S.info("Stinger In ended, switching to Replay"), this.playbackState = "REPLAYING", await e.setCurrentScene("Replay"), await e.restartMediaInput("ReplayPlayer")) : this.playbackState === "REPLAYING" && n === "ReplayPlayer" ? (S.info("Replay ended, switching to Stinger Out"), this.playbackState = "STINGER_OUT", await e.setCurrentScene("Replay Stinger"), await e.restartMediaInput("Stinger")) : this.playbackState === "STINGER_OUT" && n === "Stinger" && (S.info("Stinger Out ended, restoring original scene"), this.playbackState = "IDLE", this.originalScene && (await e.setCurrentScene(this.originalScene), this.originalScene = null));
    });
  }
  async triggerSaveReplay(e, a) {
    this.pendingDuration = e;
    const n = await a.saveReplayBuffer();
    return n.ok || (this.pendingDuration = null), n;
  }
  async handleReplaySaved(e) {
    try {
      if (!e || !R.existsSync(e)) {
        S.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      R.existsSync(this.replayFolder) || R.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = P.basename(e), n = P.join(this.replayFolder, a);
      e !== n && (R.copyFileSync(e, n), R.unlinkSync(e));
      let r = 30, i = !1;
      this.pendingDuration !== null && (r = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const f = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${n}"`, u = await ke(f), d = parseFloat(u.stdout.trim());
        !isNaN(d) && !i && (r = Math.round(d));
      } catch (f) {
        S.error(f, "Failed to probe duration of new replay");
      }
      const l = await this.getReplayState(), o = l.currentMatch;
      let m = 0;
      for (const f of l.replays)
        f.replayId > m && (m = f.replayId);
      const c = m + 1, h = `${o},${c},"${n}",0,${r}
`;
      if (!R.existsSync(this.dbFile)) {
        const f = P.dirname(this.dbFile);
        R.existsSync(f) || R.mkdirSync(f, { recursive: !0 }), R.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      R.appendFileSync(this.dbFile, h, "utf-8"), S.info({ newPath: n, currentMatch: o, newReplayId: c }, "Saved new replay");
    } catch (a) {
      S.error(a, "Failed to handle saved replay");
    }
  }
  async getReplayState() {
    let e = 1, a = 0;
    const n = [];
    try {
      if (R.existsSync(this.matchFile)) {
        const r = R.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (e = i);
      }
    } catch (r) {
      S.error(r, "Failed to read active match file");
    }
    try {
      if (R.existsSync(this.lastCompletedFile)) {
        const r = R.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (a = i);
      }
    } catch (r) {
      S.error(r, "Failed to read last completed match file");
    }
    try {
      if (R.existsSync(this.dbFile)) {
        const i = R.readFileSync(this.dbFile, "utf-8").split(/\r?\n/);
        for (let l = 1; l < i.length; l++) {
          const o = i[l].trim();
          if (!o) continue;
          const m = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (m) {
            const c = m[3];
            n.push({
              match: parseInt(m[1], 10),
              replayId: parseInt(m[2], 10),
              file: c,
              favorite: parseInt(m[4], 10) === 1,
              duration: parseInt(m[5], 10),
              filename: P.basename(c)
            });
          }
        }
      }
    } catch (r) {
      S.error(r, "Failed to read or parse replay database CSV");
    }
    return n.sort((r, i) => i.replayId - r.replayId), {
      currentMatch: e,
      lastCompletedMatch: a,
      replays: n
    };
  }
  async toggleFavorite(e, a) {
    try {
      if (!R.existsSync(this.dbFile))
        return !1;
      const r = R.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      r.length > 0 && i.push(r[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let m = 1; m < r.length; m++) {
        const c = r[m].trim();
        if (!c) continue;
        const h = c.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        h && h[3] === e ? (i.push(`${h[1]},${h[2]},"${h[3]}",${o},${h[5]}`), l = !0) : i.push(c);
      }
      return R.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (n) {
      return S.error(n, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: "File not found" };
      const r = (await this.getReplayState()).replays.find((f) => f.file === e), i = r ? r.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await ke(l), m = parseFloat(o.stdout.trim()) || 40, c = Math.max(0, m - i);
      let h = e;
      if (c > 1) {
        R.existsSync(this.playbackDir) || R.mkdirSync(this.playbackDir, { recursive: !0 }), h = P.join(this.playbackDir, "current_replay.mp4");
        const f = `ffmpeg -y -ss ${c} -i "${e}" -t ${i} -c copy "${h}"`;
        S.info({ cmd: f }, "Running ffmpeg slice command"), await ke(f);
      }
      if (a.isConnected()) {
        const f = await a.setInputSettings("ReplayPlayer", {
          local_file: h
        });
        if (!f.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${f.error}` };
        const u = await a.getCurrentProgramScene();
        u.ok && u.sceneName && u.sceneName !== "Replay Stinger" && u.sceneName !== "Replay" && (this.originalScene = u.sceneName), this.playbackState = "STINGER_IN";
        const d = await a.setCurrentScene("Replay Stinger");
        return d.ok || S.error({ error: d.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (n) {
      return S.error(n, "Failed to play replay"), { ok: !1, error: n instanceof Error ? n.message : String(n) };
    }
  }
  async generatePreview(e) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = P.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return S.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
  async nextMatch() {
    try {
      const a = (await this.getReplayState()).currentMatch;
      R.existsSync(P.dirname(this.lastCompletedFile)) || R.mkdirSync(P.dirname(this.lastCompletedFile), { recursive: !0 }), R.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((r) => {
        S.error(r, "Failed to generate highlights in background");
      });
      const n = a + 1;
      return R.writeFileSync(this.matchFile, n.toString(), "utf-8"), S.info(`Advanced to match ${n}`), { ok: !0, currentMatch: n };
    } catch (e) {
      return S.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const n = (await this.getReplayState()).replays.filter((m) => m.match === e && m.favorite);
      if (n.length === 0)
        return S.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      R.existsSync(this.highlightsDir) || R.mkdirSync(this.highlightsDir, { recursive: !0 }), n.sort((m, c) => m.replayId - c.replayId);
      const r = P.join(this.highlightsDir, `concat_${e}.txt`), i = n.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      R.writeFileSync(r, i.join(`
`) + `
`, "utf-8");
      const l = P.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${r}" -c copy "${l}"`;
      return S.info({ cmd: o }, "Generating highlights"), await ke(o), S.info(`Generated highlights: ${l}`), { ok: !0, file: l };
    } catch (a) {
      return S.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
function zn(t) {
  const { app: e, state: a, io: n, broadcast: r, obs: i, opendota: l } = t, o = new Yn();
  o.init(i), e.use(
    "/api/replays/media",
    k,
    fe.static(I.REPLAY_FOLDER)
  ), e.get("/health/live", (f, u) => {
    u.json({
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
  }), e.get("/health/ready", async (f, u) => {
    try {
      await a.getState(), u.json({ ok: !0 });
    } catch {
      u.status(503).json({ ok: !1 });
    }
  }), e.get("/api/state", k, async (f, u) => {
    const d = await a.getState();
    u.json(d);
  }), e.patch("/api/state", k, async (f, u) => {
    try {
      const d = qn(f.body), g = await a.patchState(d);
      await r.broadcastFull(g), u.json(g);
    } catch (d) {
      S.error(d, "state patch failed"), u.status(400).json({
        error: d instanceof Error ? d.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", k, async (f, u) => {
    const d = xa(), g = await a.replaceState(d);
    await r.broadcastFull(g), u.json(g);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function c(f) {
    const u = await a.patchState({
      timers: { gameStartCountdown: f }
    });
    return await r.broadcastFull(u), u;
  }
  e.post(
    "/api/timers/game-start/start",
    k,
    async (f, u) => {
      var w, b;
      const d = m.safeParse(f.body);
      if (!d.success)
        return u.status(400).json({ error: d.error.flatten() });
      const g = ((w = d.data.label) == null ? void 0 : w.trim()) || Z, p = $t(
        d.data.seconds,
        g
      ), y = await c(p);
      u.json({ ok: !0, gameStartCountdown: (b = y.timers) == null ? void 0 : b.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    k,
    async (f, u) => {
      var _, A, E, C;
      const g = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, p = (typeof ((A = f.body) == null ? void 0 : A.label) == "string" ? f.body.label.trim() : "") || (g == null ? void 0 : g.label) || Z, y = typeof ((E = f.body) == null ? void 0 : E.seconds) == "number" ? f.body.seconds : Pe(g), w = Bt(y, p), b = await c(w);
      u.json({ ok: !0, gameStartCountdown: (C = b.timers) == null ? void 0 : C.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    k,
    async (f, u) => {
      var _, A, E;
      const d = m.safeParse(f.body);
      if (!d.success)
        return u.status(400).json({ error: d.error.flatten() });
      const p = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, y = ((A = d.data.label) == null ? void 0 : A.trim()) || (p == null ? void 0 : p.label) || Z, w = p != null && p.running ? $t(d.data.seconds, y) : Bt(d.data.seconds, y), b = await c(w);
      u.json({ ok: !0, gameStartCountdown: (E = b.timers) == null ? void 0 : E.gameStartCountdown });
    }
  );
  const h = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", k, (f, u) => {
    const d = h.safeParse(f.body);
    if (!d.success) return u.status(400).json({ error: d.error.flatten() });
    i.configure(d.data), n.of(W.PRODUCER).emit(V.ACK, {
      kind: "obs:config",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.post("/api/obs/connect", k, async (f, u) => {
    const d = f.body;
    if (d && typeof d == "object" && Object.keys(d).length) {
      const p = h.safeParse(d);
      if (!p.success)
        return u.status(400).json({ error: p.error.flatten() });
      i.configure(p.data);
    }
    const g = await i.connect();
    n.of(W.PRODUCER).emit(V.ACK, {
      kind: "obs:connect",
      ok: g.ok,
      error: g.error
    }), u.json(g);
  }), e.post("/api/obs/disconnect", k, async (f, u) => {
    await i.disconnect(), n.of(W.PRODUCER).emit(V.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.get("/api/obs/scenes", k, async (f, u) => {
    try {
      const d = await i.listScenes();
      u.json({ ok: !0, scenes: d });
    } catch (d) {
      u.status(500).json({
        ok: !1,
        error: d instanceof Error ? d.message : String(d)
      });
    }
  }), e.post("/api/obs/program-scene", k, async (f, u) => {
    const g = s.object({ sceneName: s.string() }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await i.setProgramScene(g.data.sceneName);
    n.of(W.PRODUCER).emit(V.ACK, {
      kind: "obs:setProgramScene",
      ok: p.ok,
      sceneName: g.data.sceneName,
      error: p.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: g.data.sceneName }
    });
    const y = await a.getState();
    await r.broadcastFull(y), u.json(p);
  }), e.post(
    "/api/obs/scene-source",
    k,
    async (f, u) => {
      const g = s.object({
        sceneName: s.string(),
        sourceName: s.string(),
        visible: s.boolean()
      }).safeParse(f.body);
      if (!g.success)
        return u.status(400).json({ error: g.error.flatten() });
      const p = await i.setSourceVisible(g.data);
      u.json(p);
    }
  ), e.post(
    "/api/opendota/heroes/constants",
    k,
    async (f, u) => {
      const d = await l.heroesConstants();
      u.json(d);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    k,
    async (f, u) => {
      const d = await l.playerHeroStats(f.params.accountId);
      u.json(d);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    k,
    async (f, u) => {
      const d = await l.heroMatchups(Number(f.params.heroId));
      u.json(d);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    k,
    async (f, u) => {
      const g = s.object({
        heroA: s.number(),
        heroB: s.number()
      }).safeParse(f.body);
      if (!g.success)
        return u.status(400).json({ error: g.error.flatten() });
      const p = await l.matchupBetween(
        g.data.heroA,
        g.data.heroB
      );
      u.json(p);
    }
  ), e.post("/api/opendota/compose/hero-card", k, async (f, u) => {
    const g = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await a.getState(), y = g.data.accountId !== void 0 ? Ca(
      p.playerHeroIndex,
      g.data.accountId,
      g.data.heroId
    ) : void 0;
    let w = "league", b;
    if (y && y.games > 0)
      b = {
        games: y.games,
        wins: y.wins,
        losses: y.games - y.wins
      };
    else if (g.data.accountId !== void 0) {
      w = "opendota_cached";
      const A = await l.playerHeroStats(g.data.accountId);
      if (A.ok && Array.isArray(A.data)) {
        const E = A.data.find(
          (C) => C && typeof C == "object" && C.hero_id === g.data.heroId
        );
        E && typeof E.games == "number" && (b = {
          games: E.games,
          wins: typeof E.win == "number" ? E.win : 0,
          losses: E.games - (typeof E.win == "number" ? E.win : 0)
        });
      }
      A.ok || (w = "stale");
    }
    const _ = {
      playerLabel: g.data.playerLabel,
      heroId: g.data.heroId,
      playerHero: b,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: w
    };
    if (g.data.persist) {
      const A = await a.patchState({ heroStatsCard: _ });
      return await r.broadcastFull(A), u.json({ ok: !0, card: _, persisted: A });
    }
    return u.json({ ok: !0, card: _ });
  }), e.post("/api/opendota/compose/matchup-card", k, async (f, u) => {
    const g = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await l.matchupBetween(
      g.data.heroAId,
      g.data.heroBId
    ), y = {
      heroAId: g.data.heroAId,
      heroBId: g.data.heroBId,
      matchup: p.ok ? p.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: p.ok ? "opendota_cached" : "stale"
    };
    if (g.data.persist) {
      const w = await a.patchState({ matchupCard: y });
      return await r.broadcastFull(w), u.json({ ok: !0, upstream: p, matchupCard: y, persisted: w });
    }
    return u.json({ ok: !0, upstream: p, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", k, (f, u) => {
    l.purgeMemory(), u.json({ ok: !0 });
  }), e.get("/api/replays", k, async (f, u) => {
    try {
      const d = await o.getReplayState();
      u.json(d);
    } catch (d) {
      u.status(500).json({ error: d instanceof Error ? d.message : String(d) });
    }
  }), e.post("/api/replays/save", k, async (f, u) => {
    const g = s.object({ duration: s.number().nullable().optional() }).safeParse(f.body), p = g.success && g.data.duration || null, y = await o.triggerSaveReplay(p, i);
    u.json(y);
  }), e.post("/api/replays/next-match", k, async (f, u) => {
    const d = await o.nextMatch();
    u.json(d);
  }), e.post("/api/replays/generate-highlights", k, async (f, u) => {
    const g = s.object({ matchId: s.number() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.generateHighlights(g.data.matchId);
    u.json(p);
  }), e.post("/api/replays/hotkey", k, async (f, u) => {
    const g = s.object({ hotkeyName: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await i.triggerHotkeyByName(g.data.hotkeyName);
    u.json(p);
  }), e.post("/api/replays/hotkey-sequence", k, async (f, u) => {
    const g = s.object({
      keyId: s.string(),
      keyModifiers: s.object({
        shift: s.boolean().optional(),
        control: s.boolean().optional(),
        alt: s.boolean().optional(),
        command: s.boolean().optional()
      }).optional()
    }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await i.triggerHotkeyBySequence(g.data.keyId, g.data.keyModifiers || {});
    u.json(p);
  }), e.post("/api/replays/favorite", k, async (f, u) => {
    const g = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.toggleFavorite(g.data.file, g.data.favorite);
    u.json({ ok: p });
  }), e.post("/api/replays/play", k, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.playReplay(g.data.file, i);
    u.json(p);
  }), e.post("/api/replays/generate-preview", k, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.generatePreview(g.data.file);
    u.json(p);
  });
}
let J = null, se = /* @__PURE__ */ new Map(), Le = null;
function Jn() {
  if (!(J != null && J.length)) {
    Le = null;
    return;
  }
  Le = In(J);
}
async function ee(t) {
  if (se.size > 0) return se;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (J = e.data, se = new Map(J.map((a) => [a.id, a])), Jn()), se;
}
function Te(t) {
  if (Le) return Cn(t, Le);
  if (t.heroId != null && t.heroId > 0) {
    const e = se.get(t.heroId);
    if (e) {
      const a = U(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = U(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Qn(t) {
  return Te(t).slug;
}
function Xn(t, e) {
  const a = Te({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const n = se.get(t);
  if (n)
    return U(n.name) || void 0;
}
function be(t, e) {
  return wn(
    Xn(t, e)
  );
}
function Zn(t, e) {
  return be(t, e).heroPortraitUrl;
}
function q(t) {
  const e = se.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function er(t) {
  if (t)
    return ka(t);
}
function K(t, e) {
  return t.find((a) => a.steam32 === e);
}
function tr() {
  return J ? [...J].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function ar() {
  var e;
  const t = (e = I.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function nr(t, e) {
  var l, o, m, c;
  const a = (l = I.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
  if (!a) return [];
  const n = [];
  let r;
  for (; n.length < e; ) {
    const h = new URLSearchParams({
      key: a,
      league_id: String(t),
      matches_requested: String(Math.min(100, e - n.length))
    });
    r !== void 0 && h.set("start_at_match_id", String(r));
    const f = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${h}`, u = await fetch(f);
    if (!u.ok) {
      const w = await u.text();
      throw new Error(`Steam match history HTTP ${u.status}: ${w.slice(0, 200)}`);
    }
    const d = await u.json(), g = (o = d.result) == null ? void 0 : o.status, p = ((m = d.result) == null ? void 0 : m.matches) ?? [];
    if (g !== void 0 && g !== 1 && p.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${g} for league ${t} (no matches in response)`
      );
    if (p.length === 0) break;
    for (const w of p)
      typeof w.match_id == "number" && w.match_id > 0 && n.push(w.match_id);
    const y = (c = p[p.length - 1]) == null ? void 0 : c.match_id;
    if (y === void 0 || p.length < 100) break;
    r = y - 1;
  }
  const i = [...new Set(n)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function rr(t, e = 80) {
  var o, m;
  const a = ar(), n = [];
  if (!((o = I.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let r = [];
  if ((m = I.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      r = await nr(t, e);
    } catch (c) {
      const h = c instanceof Error ? c.message : String(c);
      S.warn({ err: c, leagueId: t }, "Steam league match history failed"), n.push(h);
    }
  else a.length === 0 && n.push("STEAM_WEB_API_KEY is not set — cannot load match list from Steam.");
  const i = [.../* @__PURE__ */ new Set([...a, ...r])].slice(0, e);
  if (i.length === 0)
    return {
      matchIds: [],
      source: a.length > 0 ? "env" : "steam",
      warning: n.join(" ") || `No matches returned for league ${t}. Add LEAGUE_MATCH_IDS or verify the Steam key and league ID.`
    };
  let l = "steam";
  return a.length > 0 && r.length > 0 ? l = "mixed" : a.length > 0 && r.length === 0 && (l = "env"), r.length === 0 && a.length > 0 && n.push(`Using ${a.length} match ID(s) from LEAGUE_MATCH_IDS only.`), {
    matchIds: i,
    source: l,
    warning: n.length > 0 ? n.join(" ") : void 0
  };
}
const sr = 10;
function Wt(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function qt(t) {
  return t !== void 0 && t < 128;
}
function or(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function ir(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (r) => or(r.account_id) && typeof r.lane == "number" && r.lane > 0 && !r.is_roaming
  ), n = [...new Set(a.map((r) => r.lane))];
  for (const r of n) {
    const i = a.filter((d) => d.lane === r), l = i.filter((d) => qt(d.player_slot)), o = i.filter((d) => !qt(d.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...l.map(Wt)), c = Math.max(0, ...o.map(Wt)), h = m - c;
    let f;
    Math.abs(h) <= sr ? f = "draw" : f = h > 0 ? "win" : "loss";
    const u = f === "draw" ? "draw" : f === "win" ? "loss" : "win";
    for (const d of l) e.set(d.account_id, f);
    for (const d of o) e.set(d.account_id, u);
  }
  return e;
}
function lr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function Fe() {
  return [
    P.resolve(process.cwd(), "data/league-stats"),
    P.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function Y() {
  var a;
  const t = (a = I.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return P.isAbsolute(t) ? t : P.resolve(process.cwd(), t);
  const e = I.LEAGUE_ID;
  for (const n of Fe())
    if (Ot(P.join(n, `league_${e}_heroes.csv`)))
      return n;
  for (const n of Fe())
    if (Ot(n)) return n;
  return Fe()[0];
}
function Yt(t) {
  const e = Y(), a = we(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function zt(t, e) {
  const a = Y(), n = we(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [n.heroes, n.playerHeroes],
    statsStorage: e
  };
}
function we(t) {
  const e = Y();
  return {
    dir: e,
    heroes: P.join(e, `league_${t}_heroes.csv`),
    playerHeroes: P.join(e, `league_${t}_player_heroes.csv`),
    meta: P.join(e, `league_${t}_meta.json`)
  };
}
async function ue(t) {
  try {
    return await cn(t), !0;
  } catch {
    return !1;
  }
}
function cr(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function ur(t) {
  const e = [];
  let a = "", n = !1;
  for (let r = 0; r < t.length; r++) {
    const i = t[r];
    n ? i === '"' ? t[r + 1] === '"' ? (a += '"', r++) : n = !1 : a += i : i === '"' ? n = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function Jt(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(ur);
}
function T(t, e, a = 0) {
  const n = Number(t[e]);
  return Number.isFinite(n) ? n : a;
}
function Ie(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function dr(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, n = t.assists ?? 0;
  return !(e === 0 && a === 0 && n === 0 || (t.leaver_status ?? 0) >= 3);
}
function ja(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function mr(t) {
  return t.filter((e) => !ja(e));
}
function Fa(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || ja(a)) continue;
    const n = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
    e[`${a.steam32}:${a.heroId}`] = {
      games: a.games,
      wins: a.wins,
      winRate: a.wins / a.games,
      avgKills: a.kills / a.games,
      avgDeaths: a.deaths / a.games,
      avgAssists: a.assists / a.games,
      avgKda: n,
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
async function gr(t) {
  const e = we(t);
  if (!await ue(e.heroes))
    return null;
  try {
    const a = await Ee(e.heroes, "utf8"), n = Jt(a);
    if (n.length < 2) return null;
    const r = {};
    for (const o of n.slice(1)) {
      const m = T(o, 0);
      m <= 0 || (r[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: T(o, 2),
        bans: T(o, 3),
        wins: T(o, 4),
        losses: T(o, 5),
        games: T(o, 6),
        pickRate: Ie(o, 7),
        banRate: Ie(o, 8),
        winRate: Ie(o, 9),
        contestRate: Ie(o, 10)
      });
    }
    let i = [];
    if (await ue(e.playerHeroes)) {
      const o = await Ee(e.playerHeroes, "utf8"), m = Jt(o);
      for (const c of m.slice(1)) {
        const h = T(c, 0), f = T(c, 1);
        h <= 0 || f <= 0 || i.push({
          steam32: h,
          heroId: f,
          games: T(c, 2),
          wins: T(c, 3),
          kills: T(c, 4),
          deaths: T(c, 5),
          assists: T(c, 6),
          heroDamage: T(c, 7),
          goldPerMin: T(c, 8),
          lastHits: T(c, 9),
          maxKills: T(c, 10),
          laneWins: T(c, 11),
          laneDraws: T(c, 12),
          laneLosses: T(c, 13)
        });
      }
      i = mr(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await ue(e.meta)) {
      const o = JSON.parse(await Ee(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: r, playerHeroes: i, meta: l };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function fr(t) {
  const { leagueId: e } = t.meta, a = we(e);
  await ba(a.dir, { recursive: !0 });
  const r = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, c) => m.heroId - c.heroId
  ))
    r.push(
      [
        o.heroId,
        cr(o.heroName ?? ""),
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
  await Ae(a.heroes, `# BPC league hero stats — league ${e}
${r.join(`
`)}
`, "utf8");
  const l = ["steam32,heroId,games,wins,kills,deaths,assists,heroDamage,goldPerMin,lastHits,maxKills,laneWins,laneDraws,laneLosses"];
  for (const o of t.playerHeroes.sort(
    (m, c) => m.steam32 - c.steam32 || m.heroId - c.heroId
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
  return await Ae(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${l.join(`
`)}
`,
    "utf8"
  ), await Ae(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function ge(t) {
  const e = we(t), [a, n, r] = await Promise.all([
    ue(e.heroes),
    ue(e.playerHeroes),
    ue(e.meta)
  ]);
  return {
    dir: e.dir,
    heroesPath: e.heroes,
    playerHeroesPath: e.playerHeroes,
    metaPath: e.meta,
    heroesExists: a,
    playerHeroesExists: n,
    metaExists: r,
    ready: a
  };
}
const hr = 4294967295;
function pr(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= hr))
    return e;
}
class yr {
  constructor() {
    D(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    D(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    D(this, "running", !1);
  }
  getProgress() {
    return { ...this.progress, heroIndex: { ...this.progress.heroIndex } };
  }
  /** True while aggregateLeague() is actively executing (use for API guards). */
  isBusy() {
    return this.running;
  }
  getPlayerHeroStats(e, a) {
    var r;
    const n = (r = this.playerLeagueHeroes.get(e)) == null ? void 0 : r.get(a);
    if (!(!n || n.games === 0))
      return this.accToPlayerHeroStats(n);
  }
  /** Aggregate all hero rows for a player in the current league. */
  getPlayerLeagueStats(e) {
    const a = this.playerLeagueHeroes.get(e);
    if (!a || a.size === 0) return;
    const n = {
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
    for (const r of a.values())
      this.isLeaverLikePlayerHeroAcc(r) || (n.games += r.games, n.wins += r.wins, n.kills += r.kills, n.deaths += r.deaths, n.assists += r.assists, n.heroDamage += r.heroDamage, n.goldPerMin += r.goldPerMin, n.lastHits += r.lastHits, n.maxKills = Math.max(n.maxKills, r.maxKills), n.laneWins += r.laneWins, n.laneDraws += r.laneDraws, n.laneLosses += r.laneLosses);
    if (n.games !== 0)
      return this.accToPlayerHeroStats(n);
  }
  accToPlayerHeroStats(e) {
    const a = e.games, n = e.deaths > 0 ? (e.kills + e.assists) / e.deaths : e.kills + e.assists;
    return {
      games: a,
      wins: e.wins,
      winRate: e.wins / a,
      avgKills: e.kills / a,
      avgDeaths: e.deaths / a,
      avgAssists: e.assists / a,
      avgKda: n,
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
  hydrateFromSnapshot(e, a, n, r) {
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
      matchTotal: n,
      matchDone: r,
      heroIndex: { ...e }
    };
  }
  exportPlayerHeroRows() {
    const e = [];
    for (const [a, n] of this.playerLeagueHeroes)
      for (const [r, i] of n)
        e.push({ steam32: a, heroId: r, ...i });
    return e;
  }
  async aggregateLeague(e, a, n = 80, r) {
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
      await ee(a);
      const o = await rr(e, n), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && S.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const c = /* @__PURE__ */ new Map();
      let h = 0;
      for (let u = 0; u < m.length; u++) {
        const d = m[u];
        if (d === void 0) continue;
        S.info(
          { matchId: d, index: u + 1, total: m.length },
          "Aggregating league match"
        );
        let g = await a.matchDetails(d);
        (!g.ok || !((l = (i = g.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(d), g = await a.matchDetails(d)), g.ok && g.data && (g.data.leagueid != null && g.data.leagueid !== 0 && g.data.leagueid !== e ? S.warn(
          {
            matchId: d,
            expectedLeague: e,
            actualLeague: g.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(g.data, c), h += 1)), this.progress.matchDone = u + 1, this.progress.progress = Math.round(
          (u + 1) / Math.max(1, m.length) * 100
        ), r == null || r(this.getProgress());
      }
      if (h === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const f = {};
      for (const [u, d] of c) {
        const g = d.wins + d.losses, p = h > 0 ? d.picks / h : 0, y = h > 0 ? d.bans / h : 0, w = p + y, b = g > 0 ? d.wins / g : void 0;
        f[String(u)] = {
          heroId: u,
          heroName: q(u),
          picks: d.picks,
          bans: d.bans,
          wins: d.wins,
          losses: d.losses,
          games: g,
          pickRate: p,
          banRate: y,
          winRate: b,
          contestRate: w
        };
      }
      return this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: m.length,
        matchDone: m.length,
        heroIndex: f
      }, f;
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
    const n = e.radiant_win === !0, r = ir(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = pr(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && n || i.player_slot !== void 0 && i.player_slot >= 128 && !n, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, dr(i) && this.trackPlayerHero(l, i.hero_id, o, i, r.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, n, r, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof r.kills == "number" ? r.kills : 0, m = typeof r.deaths == "number" ? r.deaths : 0, c = typeof r.assists == "number" ? r.assists : 0, h = typeof r.hero_damage == "number" ? r.hero_damage : 0, f = typeof r.gold_per_min == "number" ? r.gold_per_min : 0, u = typeof r.last_hits == "number" ? r.last_hits : 0, d = l.get(a) ?? {
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
    d.games += 1, n && (d.wins += 1), i === "win" ? d.laneWins += 1 : i === "draw" ? d.laneDraws += 1 : i === "loss" && (d.laneLosses += 1), d.kills += o, d.deaths += m, d.assists += c, d.heroDamage += h, d.goldPerMin += f, d.lastHits += u, o > d.maxKills && (d.maxKills = o), l.set(a, d);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = fn(e);
    if (a.length > 0) return a;
    const n = [];
    for (const r of e.players ?? [])
      typeof r.hero_id == "number" && n.push({
        is_pick: !0,
        hero_id: r.hero_id,
        team: r.player_slot !== void 0 && r.player_slot >= 128 ? 1 : 0,
        order: 0
      });
    return n;
  }
  getAcc(e, a) {
    let n = e.get(a);
    return n || (n = { picks: 0, bans: 0, wins: 0, losses: 0 }, e.set(a, n)), n;
  }
}
const F = new yr();
async function br(t) {
  const { leagueId: e, state: a, broadcast: n, source: r } = t, i = r === "csv" ? await gr(e) : null;
  if (!i) return !1;
  F.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: Fa(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: r,
      statsCsvDir: Y()
    }
  });
  return await n.broadcastFull(l), !0;
}
async function Je(t) {
  const e = await br({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: Y() },
    "League stats loaded from CSV"
  ), e;
}
async function Oa(t) {
  const { leagueId: e, state: a, opendota: n, broadcast: r } = t;
  if (F.isBusy()) {
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
  await r.broadcastFull(i);
  try {
    const l = await F.aggregateLeague(
      e,
      n,
      80,
      async (h) => {
        const f = await a.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: h.progress,
            aggregationMatchTotal: h.matchTotal,
            aggregationMatchDone: h.matchDone
          }
        });
        await r.broadcastFull(f);
      }
    ), o = F.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await fr({
      heroIndex: l,
      playerHeroes: F.exportPlayerHeroRows(),
      meta: {
        leagueId: e,
        matchTotal: o.matchTotal,
        matchDone: o.matchDone,
        aggregatedAt: m,
        source: "api"
      }
    });
    const c = await a.patchState({
      tournamentHeroIndex: l,
      playerHeroIndex: Fa(
        F.exportPlayerHeroRows()
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
        statsCsvDir: Y()
      }
    });
    await r.broadcastFull(c), S.info(
      { leagueId: e, matches: o.matchTotal, dir: Y() },
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
    await r.broadcastFull(m);
  }
}
async function Sr(t) {
  var u, d, g, p;
  const { state: e, opendota: a, broadcast: n } = t, r = I.LEAGUE_ID, i = await e.getState();
  if ((((u = i.leagueConfig) == null ? void 0 : u.leagueId) !== r || ((d = i.leagueConfig) == null ? void 0 : d.leagueId) === null || ((g = i.leagueConfig) == null ? void 0 : g.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: r, aggregationStatus: "idle" }
  }), await Je({
    leagueId: r,
    state: e,
    broadcast: n
  })) return;
  const c = ((p = (await e.getState()).leagueConfig) == null ? void 0 : p.aggregationStatus) === "ready", h = F.getProgress().status === "ready";
  I.LEAGUE_AUTO_AGGREGATE && (!c || !h) && F.getProgress().status !== "running" ? (S.info({ leagueId: r }, "Starting league aggregation (Steam match list + OpenDota details)"), Oa({ leagueId: r, state: e, opendota: a, broadcast: n })) : S.info(
    { leagueId: r, dir: Y() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function Qt() {
  return {
    leagueId: I.LEAGUE_ID,
    autoAggregate: I.LEAGUE_AUTO_AGGREGATE,
    statsDir: Y()
  };
}
class Re extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function wr(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && F.getProgress().status === "ready";
}
function ie(t) {
  var a, n;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new Re(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new Re(
      ((n = t.leagueConfig) == null ? void 0 : n.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!wr(t))
    throw new Re(
      "League stats not ready — run tournament aggregate first"
    );
}
function Ua(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function _r(t) {
  var i;
  const e = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (e.length === 0) return [];
  let a = 0;
  const n = ((i = e[0]) == null ? void 0 : i.toLowerCase()) ?? "";
  (n.includes("steam") || n.includes("display")) && (a = 1);
  const r = [];
  for (let l = a; l < e.length; l++) {
    const o = e[l];
    if (!o) continue;
    const m = o.split(",").map((p) => p.trim());
    if (m.length < 2) continue;
    const c = m[0] ?? "Player", h = Number(m[1]);
    if (!Number.isFinite(h)) continue;
    let f, u, d, g;
    if (m.length >= 4) {
      if (f = m[2] || void 0, u = m[3] || void 0, m.length >= 5) {
        const p = m[4] ?? "";
        p.startsWith("http://") || p.startsWith("https://") ? g = p : d = Ua(p);
      }
      if (m.length >= 6) {
        const p = m[5] ?? "";
        (p.startsWith("http://") || p.startsWith("https://")) && (g = p);
      }
    } else m.length === 3 && (u = m[2] || void 0, f = u == null ? void 0 : u.replace(/_/g, " "));
    r.push({ displayName: c, steam32: h, teamName: f, teamKey: u, teamColor: d, avatarUrl: g });
  }
  return r;
}
function kr(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function Ir(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (n) => [
      n.displayName,
      String(n.steam32),
      n.teamName ?? "",
      n.teamKey ?? "",
      n.teamColor ?? "",
      n.avatarUrl ?? ""
    ].map(kr).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function Xt(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function Qe(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const n = a.teamKey ?? Cr(a.teamName ?? "unknown"), r = a.teamName ?? Ar(n), i = e.get(n);
    i ? (i.players.push(a), a.teamName && !i.teamName && (i.teamName = a.teamName)) : e.set(n, {
      teamKey: n,
      teamName: r,
      players: [a]
    });
  }
  return [...e.values()].sort(
    (a, n) => a.teamName.localeCompare(n.teamName)
  );
}
function Xe(t, e) {
  return Qe(t).find((a) => a.teamKey === e);
}
function he(t) {
  return ka(t);
}
function Cr(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Ar(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function Zt(t, e, a) {
  return t && t.map((n) => {
    if (n.type !== "pick") return n;
    const r = He(a.matchSetup, e, n.order), i = An(a, e, n.order);
    if (r == null && !i) {
      const { playerName: l, steam32: o, ...m } = n;
      return m;
    }
    return {
      ...n,
      steam32: r ?? void 0,
      playerName: i
    };
  });
}
function Er(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: Zt(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: Zt(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function ea(t, e, a) {
  var i, l, o, m;
  const n = Xe(e, t.radiantTeamKey), r = Xe(e, t.direTeamKey);
  if (!n || !r)
    throw new Error("One or both teams not found in roster");
  if (t.radiantTeamKey === t.direTeamKey)
    throw new Error("Radiant and dire must be different teams");
  return {
    series: {
      teamA: n.teamName,
      teamB: r.teamName,
      scoreA: t.scoreA ?? ((i = a == null ? void 0 : a.series) == null ? void 0 : i.scoreA) ?? 0,
      scoreB: t.scoreB ?? ((l = a == null ? void 0 : a.series) == null ? void 0 : l.scoreB) ?? 0,
      bestOf: t.seriesBestOf,
      gameNumber: t.seriesGame,
      logoUrlA: he(n.teamKey),
      logoUrlB: he(r.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: n.teamName,
      logoUrl: he(n.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: r.teamName,
      logoUrl: he(r.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const ta = /* @__PURE__ */ new Map();
async function $a(t, e) {
  var l, o, m;
  if (e <= 0) return;
  const a = ta.get(e);
  if (a) return a;
  const n = await t.playerProfile(e);
  if (!n.ok || !n.data) return;
  const r = n.data, i = ((l = r.profile) == null ? void 0 : l.avatarfull) ?? r.avatarfull ?? ((o = r.profile) == null ? void 0 : o.avatarmedium) ?? r.avatarmedium ?? ((m = r.profile) == null ? void 0 : m.avatar) ?? r.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return ta.set(e, i), i;
}
async function aa(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var n;
      if ((n = a.avatarUrl) != null && n.trim()) return a;
      try {
        const r = await $a(e, a.steam32);
        return r ? { ...a, avatarUrl: r } : a;
      } catch (r) {
        return S.warn({ err: r, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const Ze = P.join(process.cwd(), "steam32-vanity-cache.json");
let ne = null;
function Pr() {
  if (ne) return ne;
  try {
    if (R.existsSync(Ze))
      return ne = JSON.parse(R.readFileSync(Ze, "utf-8")), S.info({ count: Object.keys(ne).length }, "[steam32] Loaded vanity cache from disk"), ne;
  } catch {
  }
  return ne = {}, ne;
}
function Rr(t) {
  try {
    R.writeFileSync(Ze, JSON.stringify(t, null, 2));
  } catch (e) {
    S.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function vr(t, e) {
  return new Promise((a) => {
    const n = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    Sa.get(n, (r) => {
      if (r.statusCode !== 200) {
        a(null);
        return;
      }
      let i = "";
      r.on("data", (l) => {
        i += l;
      }), r.on("end", () => {
        var l;
        try {
          const o = JSON.parse(i);
          if (((l = o.response) == null ? void 0 : l.success) === 1 && o.response.steamid) {
            const m = Number(BigInt(o.response.steamid) - BigInt("76561197960265728"));
            a(m);
          } else
            a(null);
        } catch {
          a(null);
        }
      });
    }).on("error", () => a(null));
  });
}
async function Dr(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const n = t.match(/\/id\/([^/?#]+)/);
  if (n != null && n[1]) {
    const r = n[1].trim().toLowerCase(), i = Pr();
    if (i[r] != null)
      return S.debug({ vanity: r, steam32: i[r] }, "[steam32] Cache hit"), i[r];
    if (!e)
      return S.warn({ vanity: r }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await vr(r, e);
    return l != null && l > 0 ? (i[r] = l, Rr(i), S.info({ vanity: r, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : S.warn({ vanity: r }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return S.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function oe(t) {
  return new Promise((e, a) => {
    Sa.get(t, (n) => {
      if (n.statusCode !== 200) {
        a(new Error(`BPC League API returned HTTP ${n.statusCode} for ${t}`));
        return;
      }
      let r = "";
      n.on("data", (i) => {
        r += i;
      }), n.on("end", () => {
        try {
          e(JSON.parse(r));
        } catch (i) {
          a(i);
        }
      });
    }).on("error", a);
  });
}
async function Lr(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await oe("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const l = await oe(`https://api.bpcleague.in/api/public/seasons/${e}`);
      l.snapshot && l.snapshot.teams ? a = l.snapshot.teams : l.tournament && l.tournament.teams ? a = l.tournament.teams : l.participations && (a = l.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (l) {
    throw S.error(l, "Failed to fetch season/tournament data from bpcleague.in"), l;
  }
  if (!a || a.length === 0)
    return S.warn("No teams found in bpcleague.in API response"), [];
  const n = [];
  for (const l of a) {
    const o = l.name.trim(), m = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), c = Ua(l.accentColor) || "#ffffff";
    for (const h of l.players || [])
      n.push({ teamName: o, teamKey: m, teamColor: c, player: h });
  }
  S.info({ total: n.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const r = await Promise.all(
    n.map(
      ({ player: l }) => Dr(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < n.length; l++) {
    const { teamName: o, teamKey: m, teamColor: c, player: h } = n[l], f = r[l], u = h.displayName || h.name || "Player", d = h.roles || [], g = h.mmr;
    f != null && f > 0 ? i.push({ displayName: u, steam32: f, teamName: o, teamKey: m, teamColor: c, roles: d, mmr: g }) : S.warn({ displayName: u, url: h.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return S.info({ count: i.length, total: n.length }, "Completed roster sync from bpcleague.in"), i;
}
async function Tr(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let n;
    e === "latest" || e === "active" ? n = await oe("https://api.bpcleague.in/api/public/tournament") : n = await oe(`https://api.bpcleague.in/api/public/seasons/${e}`);
    let r = [];
    return n.snapshot && n.snapshot.matches || n.tournament && ((a = n.snapshot) != null && a.matches) ? r = n.snapshot.matches : n.tournament && n.tournament.matches ? r = n.tournament.matches : n.matches && (r = n.matches), r.map((i) => {
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
  } catch (n) {
    return S.error(n, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function Nr() {
  S.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await oe("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return S.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function Mr(t) {
  const e = t.trim().toLowerCase();
  S.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await oe("https://api.bpcleague.in/api/public/tournament") : a = await oe(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return S.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
function O(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function Q(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function Ba(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function Se(t, e) {
  return `${t}W / ${e}L`;
}
function Ne(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, n = t.laneLosses ?? 0;
  return e + a + n === 0 ? null : {
    label: "Lane",
    value: lr(e, a, n),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function Ga(t, e, a) {
  var r;
  const n = (r = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : r.avatarUrl;
  return n != null && n.trim() ? n : $a(t, e);
}
function xr(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : Se(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${O(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${O(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${O(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? O(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function Hr(t, e, a, n) {
  if (!a || a.games === 0)
    return [
      {
        label: `${t} on ${e}`,
        value: "No league games",
        sublabel: "This player hasn't played this hero in the league yet"
      },
      ...n ? [
        {
          label: "Hero pick rate",
          value: String(n.picks),
          sublabel: `${O(n.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: O(n.winRate),
          sublabel: Se(n.wins, n.losses)
        }
      ] : []
    ];
  const r = a.games - a.wins, i = `${Q(a.avgKills)} / ${Q(a.avgDeaths)} / ${Q(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Se(a.wins, r),
      sublabel: `${O(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: Q(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: Ba(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ne(a) ? [Ne(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...n ? [
      {
        label: "Hero in league",
        value: String(n.picks),
        sublabel: `${O(n.pickRate)} pick · ${O(n.winRate)} WR`
      }
    ] : []
  ];
}
function jr(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, n = `${Q(e.avgKills)} / ${Q(e.avgDeaths)} / ${Q(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Se(e.wins, a),
      sublabel: `${O(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: Q(e.avgKda),
      sublabel: `${n} per game`
    },
    {
      label: "Hero damage",
      value: Ba(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ne(e) ? [Ne(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function Ka(t) {
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
async function pe(t, e, a) {
  await ee(t);
  const n = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, r = n.heroName ?? q(e), i = be(e, r);
  return {
    statsCardKind: "tournament-hero",
    playerLabel: r,
    heroId: e,
    heroName: r,
    ...i,
    tournament: {
      pickRate: n.pickRate,
      winRate: n.winRate,
      contestRate: n.contestRate,
      banRate: n.banRate,
      picks: n.picks,
      bans: n.bans,
      wins: n.wins,
      losses: n.losses,
      games: n.games
    },
    statSlides: xr(n),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function ye(t, e, a, n, r, i, l) {
  await ee(t);
  const o = Ca(
    l,
    e,
    a
  ), m = r[String(a)], c = q(a), h = be(a, c), f = await Ga(
    t,
    e,
    i
  );
  return {
    statsCardKind: "player-hero",
    steam32: e,
    playerLabel: n,
    heroId: a,
    heroName: c,
    ...h,
    playerAvatarUrl: f,
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
    playerHero: Ka(o),
    statSlides: Hr(n, c, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function Fr(t, e) {
  return Ke(e, t);
}
async function Va(t, e, a, n, r) {
  await ee(t);
  const i = Fr(e, n), l = await Ga(
    t,
    e,
    r
  ), o = K(r ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: er(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: Ka(i),
    statSlides: jr(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Wa(t, e, a) {
  await ee(t);
  const n = await t.matchupBetween(e, a), r = n.ok && n.data && typeof n.data == "object" ? n.data : {}, i = typeof r.games_played == "number" ? r.games_played : void 0, l = typeof r.wins == "number" ? r.wins : typeof r.win == "number" ? r.win : void 0, o = q(e) || `Hero ${e}`, m = q(a) || `Hero ${a}`, c = l ?? 0, h = i !== void 0 ? i - c : 0;
  let f = o, u = m, d = c, g = h;
  h > c && (f = m, u = o, d = h, g = c);
  const p = [
    {
      label: "Games Played",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: `${f} Won`,
      value: i !== void 0 ? String(d) : "—"
    },
    {
      label: `${u} Won`,
      value: i !== void 0 ? String(g) : "—"
    }
  ], y = be(e), w = be(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: q(e),
    heroBName: q(a),
    heroAPortraitSlug: y.heroPortraitSlug,
    heroBPortraitSlug: w.heroPortraitSlug,
    heroAPortraitUrl: y.heroPortraitUrl,
    heroBPortraitUrl: w.heroPortraitUrl,
    matchup: r,
    statLines: p,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: n.ok ? "opendota_cached" : "stale"
  };
}
function st(t, e = 4e3) {
  var n, r, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: O((n = t.tournament) == null ? void 0 : n.winRate),
      sublabel: t.tournament ? Se(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((r = t.tournament) == null ? void 0 : r.picks) ?? "—"),
      sublabel: O((i = t.tournament) == null ? void 0 : i.pickRate)
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
async function Or(t) {
  return await ee(t), tr();
}
class Ur {
  constructor() {
    D(this, "timer", null);
    D(this, "state", null);
    D(this, "opendota", null);
    D(this, "broadcast", null);
    D(this, "config", {
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
    var e, a, n, r, i, l;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          S.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const c = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let h = m;
        c != null && c.radiantTeamKey && (c != null && c.direTeamKey) && (h = m.filter(
          (g) => g.teamKey === c.radiantTeamKey || g.teamKey === c.direTeamKey
        )), h.length === 0 && (h = m);
        const f = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], u = f[Math.floor(Math.random() * f.length)];
        S.info({ cardType: u }, "Autopilot: Triggering random stats card");
        const d = Date.now() + this.config.durationSeconds * 1e3;
        if (u === "player-league") {
          const g = h[Math.floor(Math.random() * h.length)], p = await Va(
            this.opendota,
            g.steam32,
            g.displayName,
            o.playerHeroIndex,
            m
          ), y = await this.state.patchState({
            heroStatsCard: p,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(y), S.info({ player: g.displayName }, "Autopilot: Displayed player league stats");
        } else if (u === "player-hero") {
          const g = h[Math.floor(Math.random() * h.length)], p = o.playerHeroIndex ?? {}, y = `${g.steam32}:`, w = Object.keys(p).filter((C) => C.startsWith(y)).map((C) => Number(C.split(":")[1]));
          let b = 1;
          if (w.length > 0)
            b = w[Math.floor(Math.random() * w.length)];
          else {
            const C = Object.keys(o.tournamentHeroIndex ?? {});
            C.length > 0 && (b = Number(C[Math.floor(Math.random() * C.length)]));
          }
          const _ = await ye(
            this.opendota,
            g.steam32,
            b,
            g.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), A = st(_, 4e3), E = await this.state.patchState({
            heroStatsCard: _,
            statCarousel: A,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(E), S.info({ player: g.displayName, heroId: b }, "Autopilot: Displayed player-hero stats carousel");
        } else if (u === "tournament-hero") {
          const g = Object.keys(o.tournamentHeroIndex ?? {});
          if (g.length === 0) return;
          const p = Number(g[Math.floor(Math.random() * g.length)]), y = await pe(
            this.opendota,
            p,
            o.tournamentHeroIndex ?? {}
          ), w = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(w), S.info({ heroId: p }, "Autopilot: Displayed tournament hero stats");
        } else if (u === "matchup") {
          const g = [
            ...((r = (n = o.draft) == null ? void 0 : n.radiant) == null ? void 0 : r.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
          ].filter((_) => _.heroId && _.heroId > 0);
          let p = 1, y = 2;
          if (g.length >= 2) {
            const _ = g[Math.floor(Math.random() * g.length)];
            let A = g[Math.floor(Math.random() * g.length)];
            for (; A.heroId === _.heroId && g.length > 1; )
              A = g[Math.floor(Math.random() * g.length)];
            p = _.heroId, y = A.heroId;
          } else {
            const _ = Object.keys(o.tournamentHeroIndex ?? {});
            if (_.length >= 2)
              for (p = Number(_[Math.floor(Math.random() * _.length)]), y = Number(_[Math.floor(Math.random() * _.length)]); y === p; )
                y = Number(_[Math.floor(Math.random() * _.length)]);
          }
          const w = await Wa(this.opendota, p, y), b = await this.state.patchState({
            matchupCard: w,
            overlayVisibility: {
              matchup: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(b), S.info({ heroA: p, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        S.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const re = new Ur();
function Ce(t, e) {
  return e instanceof Re ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function $r(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  re.configure({}, { state: a, opendota: r, broadcast: n }), e.get("/api/league/info", k, async (l, o) => {
    var h;
    const m = await a.getState(), c = await ge(I.LEAGUE_ID);
    o.json({
      ...Qt(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: c,
      steamApiConfigured: !!I.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((h = I.LEAGUE_MATCH_IDS) != null && h.trim())
    });
  }), e.post("/api/league/config", k, async (l, o) => {
    const c = s.object({ leagueId: s.number() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = await a.patchState({
      leagueConfig: { ...h.leagueConfig, leagueId: c.data.leagueId }
    });
    await n.broadcastFull(f), o.json({ ok: !0, leagueConfig: f.leagueConfig });
  }), e.post("/api/league/aggregate", k, async (l, o) => {
    var c, h, f;
    if (F.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const m = await a.getState();
    ((c = m.leagueConfig) == null ? void 0 : c.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: I.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), Oa({
      leagueId: ((h = m.leagueConfig) == null ? void 0 : h.leagueId) ?? I.LEAGUE_ID,
      state: a,
      opendota: r,
      broadcast: n
    }), o.json({ ok: !0, started: !0, leagueId: ((f = m.leagueConfig) == null ? void 0 : f.leagueId) ?? I.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    k,
    async (l, o) => {
      var f;
      const m = (f = (await a.getState()).leagueConfig) == null ? void 0 : f.leagueId;
      if (!await Je({
        leagueId: m ?? I.LEAGUE_ID,
        state: a,
        broadcast: n
      })) {
        const u = await ge(m ?? I.LEAGUE_ID), d = u.heroesExists ? zt(m ?? I.LEAGUE_ID, u) : { ...Yt(m ?? I.LEAGUE_ID), statsStorage: u };
        return o.status(422).json(d);
      }
      const h = await a.getState();
      o.json({ ok: !0, leagueConfig: h.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    k,
    async (l, o) => {
      var h, f;
      const m = await ge(I.LEAGUE_ID), c = await a.getState();
      o.json({
        ...m,
        statsDir: Qt().statsDir,
        aggregationSource: (h = c.leagueConfig) == null ? void 0 : h.aggregationSource,
        aggregatedAt: (f = c.leagueConfig) == null ? void 0 : f.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    k,
    async (l, o) => {
      const m = F.getProgress(), c = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: F.isBusy(),
        leagueId: I.LEAGUE_ID,
        leagueConfig: c.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", k, async (l, o) => {
    const c = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = _r(c.data.csv), f = await aa(h, r), u = Xt(f), d = await a.patchState({
      leagueConfig: { roster: f, teamColors: u, leagueId: I.LEAGUE_ID }
    });
    await n.broadcastFull(d), o.json({ ok: !0, count: f.length, teamColors: u, roster: f });
  }), e.post("/api/roster/sync-bpcleague", k, async (l, o) => {
    var h, f;
    const c = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    try {
      const u = c.data.seasonSlug || "season-1", d = await Lr({
        seasonSlug: u,
        steamApiKey: I.STEAM_WEB_API_KEY
      }), g = await aa(d, r), p = Xt(g), y = I.ROSTER_CSV_PATH;
      await ba(P.dirname(y), { recursive: !0 });
      const w = Ir(g);
      await Ae(y, w, "utf8");
      const b = await Mr(u);
      let _ = [];
      b && b.sponsorsConfig && Array.isArray(b.sponsorsConfig.sponsors) && (_ = b.sponsorsConfig.sponsors.map((C) => ({
        title: C.title || C.name || "",
        subtitle: C.subtitle || "",
        imageUrl: C.imageUrl || C.logoUrl || C.logo || "",
        color: C.color || "#ffffff",
        isCoSponsor: C.isCoSponsor || !1
      }))), _.length === 0 && (_ = [
        { title: "BPC", subtitle: "Gaming", isCoSponsor: !0, color: "#ffffff", imageUrl: "" },
        { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: !1, color: "#ff0000", imageUrl: "" }
      ]);
      const A = await a.getState(), E = await a.patchState({
        leagueConfig: { roster: g, teamColors: p, leagueId: ((h = A.leagueConfig) == null ? void 0 : h.leagueId) ?? I.LEAGUE_ID, seasonSlug: u },
        sponsor: { banners: _, activeIndex: ((f = A.sponsor) == null ? void 0 : f.activeIndex) ?? 0 }
      });
      await n.broadcastFull(E), o.json({ ok: !0, count: g.length, teamColors: p, roster: g });
    } catch (u) {
      o.status(500).json({
        error: u instanceof Error ? u.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", k, async (l, o) => {
    var c;
    const m = await a.getState();
    o.json(((c = m.leagueConfig) == null ? void 0 : c.roster) ?? []);
  }), e.get("/api/teams", k, async (l, o) => {
    var h;
    const c = ((h = (await a.getState()).leagueConfig) == null ? void 0 : h.roster) ?? [];
    o.json(Qe(c));
  }), e.post("/api/match/setup", k, async (l, o) => {
    var d, g;
    const m = Pa.safeParse(l.body);
    if (!m.success)
      return o.status(400).json({ error: m.error.flatten() });
    const c = await a.getState(), h = ((d = c.leagueConfig) == null ? void 0 : d.roster) ?? [];
    if (h.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: f, seriesGame: u } = m.data;
    if (u > f)
      return o.status(400).json({
        error: `Game ${u} is invalid for a BO${f} series`
      });
    try {
      const p = { ...m.data }, y = (g = c.leagueConfig) == null ? void 0 : g.matchSetup;
      !p.previousDrafts && (y != null && y.previousDrafts) && (p.previousDrafts = [...y.previousDrafts]), y && p.seriesGame > y.seriesGame && c.draft && (p.previousDrafts = p.previousDrafts ?? [], p.previousDrafts.push(c.draft)), p.seriesGame === 1 && (p.previousDrafts = []);
      const w = ea(
        p,
        h,
        c.draft
      ), b = await a.patchState({
        leagueConfig: { matchSetup: p },
        draft: w,
        production: {
          playerMappingPublished: !1
        }
      });
      await n.broadcastFull(b), o.json({
        ok: !0,
        matchSetup: p,
        teams: Qe(h),
        draft: b.draft
      });
    } catch (p) {
      o.status(400).json({
        error: p instanceof Error ? p.message : String(p)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    k,
    async (l, o) => {
      var A, E, C;
      const m = await a.getState(), c = ((A = m.leagueConfig) == null ? void 0 : A.roster) ?? [];
      if (c.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const h = ((E = m.leagueConfig) == null ? void 0 : E.leagueId) ?? I.LEAGUE_ID, f = await ge(h);
      if (!await Je({
        leagueId: h,
        state: a,
        broadcast: n
      })) {
        const x = f.heroesExists ? zt(h, f) : { ...Yt(h), statsStorage: f };
        return o.status(422).json(x);
      }
      const d = await a.getState(), g = d.playerHeroIndex ?? {}, p = Object.keys(g).length, y = [];
      for (const x of c) {
        const H = `${x.steam32}:`;
        Object.keys(g).some((j) => j.startsWith(H)) || y.push(x.steam32);
      }
      const w = new Set(
        Object.keys(g).map((x) => Number(x.split(":")[0]))
      ), b = (C = c[0]) == null ? void 0 : C.steam32, _ = b != null ? Ge(g, b).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: c.length,
        csvPlayerCount: w.size,
        indexKeyCount: p,
        matchedRosterCount: c.length - y.length,
        missingSteam32: y,
        statsStorage: f,
        indexEmpty: p === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: _,
        leagueConfig: d.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    k,
    async (l, o) => {
      var b, _;
      const m = Number(l.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const c = await a.getState(), h = c.playerHeroIndex ?? {}, f = `${m}:`, u = Object.entries(h).filter(([A]) => A.startsWith(f)).map(([A, E]) => ({
        heroId: Number(A.split(":")[1]),
        games: E.games,
        wins: E.wins
      })), d = Ge(h, m), g = ((b = c.leagueConfig) == null ? void 0 : b.leagueId) ?? I.LEAGUE_ID, p = await ge(g);
      let y = [];
      try {
        y = (await Ee(p.playerHeroesPath, "utf8")).split(/\r?\n/).filter((E) => E.startsWith(`${m},`));
      } catch {
        y = [];
      }
      const w = y.reduce(
        (A, E) => A + (Number(E.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: g,
        gamesInIndex: d.games,
        winsInIndex: d.wins,
        heroRows: u,
        csvRowCount: y.length,
        csvGamesSum: w,
        aggregationMatchTotal: (_ = c.leagueConfig) == null ? void 0 : _.aggregationMatchTotal,
        hint: d.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : d.games < w ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    k,
    async (l, o) => {
      var b, _, A, E, C;
      const m = s.object({ pickPlayers: Ea.optional() }).safeParse(l.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const c = await a.getState(), h = (b = c.leagueConfig) == null ? void 0 : b.matchSetup, f = ((_ = c.leagueConfig) == null ? void 0 : _.roster) ?? [], u = c.draft;
      if (!h)
        return o.status(400).json({ error: "save match setup first" });
      if (!u)
        return o.status(400).json({ error: "no draft state" });
      if (u.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const d = m.data.pickPlayers, g = d ? {
        ...h,
        pickPlayers: {
          radiant: d.radiant ?? ((A = h.pickPlayers) == null ? void 0 : A.radiant),
          dire: d.dire ?? ((E = h.pickPlayers) == null ? void 0 : E.dire)
        }
      } : h, p = {
        ...c.leagueConfig,
        roster: f,
        matchSetup: g
      }, y = Er(u, p), w = await a.patchState({
        leagueConfig: { matchSetup: g },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await n.broadcastFull(w), o.json({
        ok: !0,
        matchSetup: (C = w.leagueConfig) == null ? void 0 : C.matchSetup,
        draft: w.draft,
        production: w.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    k,
    async (l, o) => {
      var g, p, y;
      const m = await a.getState(), c = ((g = m.leagueConfig) == null ? void 0 : g.roster) ?? [], h = (p = m.leagueConfig) == null ? void 0 : p.matchSetup, f = (((y = m.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let u = null;
      h && c.length > 0 && (u = ea(
        h,
        c,
        null
      ));
      const d = await a.patchState({
        draft: u,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: f
        }
      });
      await n.broadcastFull(d), o.json({
        ok: !0,
        overlayDraftEpoch: f,
        draft: d.draft
      });
    }
  ), e.post("/api/league/team-colors", k, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", k, async (l, o) => {
    const m = await Or(r);
    o.json(m);
  }), e.post("/api/stats/player-hero", k, async (l, o) => {
    var g;
    const c = s.object({
      steam32: s.number(),
      heroId: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.getState();
    try {
      ie(h);
    } catch (p) {
      if (Ce(o, p)) return;
      throw p;
    }
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = K(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, d = await ye(
      r,
      c.data.steam32,
      c.data.heroId,
      u.displayName,
      h.tournamentHeroIndex ?? {},
      f,
      h.playerHeroIndex
    );
    if (c.data.persist) {
      const p = await a.patchState({
        heroStatsCard: d,
        statCarousel: null
      });
      return await n.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post("/api/stats/player-league", k, async (l, o) => {
    var g;
    const c = s.object({
      steam32: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.getState();
    try {
      ie(h);
    } catch (p) {
      if (Ce(o, p)) return;
      throw p;
    }
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = K(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, d = await Va(
      r,
      c.data.steam32,
      u.displayName,
      h.playerHeroIndex,
      f
    );
    if (c.data.persist) {
      const p = await a.patchState({
        heroStatsCard: d,
        statCarousel: null
      });
      return await n.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post(
    "/api/stats/tournament-hero",
    k,
    async (l, o) => {
      const c = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(l.body);
      if (!c.success)
        return o.status(400).json({ error: c.error.flatten() });
      const h = await a.getState();
      try {
        ie(h);
      } catch (u) {
        if (Ce(o, u)) return;
        throw u;
      }
      const f = await pe(
        r,
        c.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
      if (c.data.persist) {
        const u = await a.patchState({
          heroStatsCard: f,
          statCarousel: null
        });
        return await n.broadcastFull(u), o.json({ ok: !0, card: f, persisted: u });
      }
      o.json({ ok: !0, card: f });
    }
  ), e.post("/api/stats/matchup", k, async (l, o) => {
    const c = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    await a.getState();
    const h = await Wa(
      r,
      c.data.heroAId,
      c.data.heroBId
    );
    if (c.data.persist) {
      const f = await a.patchState({ matchupCard: h });
      return await n.broadcastFull(f), o.json({ ok: !0, card: h, persisted: f });
    }
    o.json({ ok: !0, card: h });
  }), e.post("/api/producer/h2h", k, async (l, o) => {
    var w;
    const c = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = ((w = h.leagueConfig) == null ? void 0 : w.roster) ?? [], u = K(f, c.data.player1Steam32), d = K(f, c.data.player2Steam32);
    if (!u || !d)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      ie(h);
    } catch (b) {
      return o.status(503).json({ error: b.message });
    }
    const g = Ke(h.playerHeroIndex, c.data.player1Steam32), p = Ke(h.playerHeroIndex, c.data.player2Steam32), y = {
      player1: { ...u, stats: g },
      player2: { ...d, stats: p }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", k, async (l, o) => {
    var p, y, w, b, _, A, E;
    const c = s.object({
      type: s.enum(["player-hero", "tournament-hero", "last-pick"]),
      heroId: s.number().optional(),
      steam32: s.number().optional(),
      slideDurationMs: s.number().optional(),
      overlaySeconds: s.number().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.getState();
    try {
      ie(h);
    } catch (C) {
      if (Ce(o, C)) return;
      throw C;
    }
    const f = ((p = h.leagueConfig) == null ? void 0 : p.roster) ?? [];
    let u;
    if (c.data.type === "last-pick") {
      const C = (y = h.draft) == null ? void 0 : y.lastPick;
      if (!C) return o.status(400).json({ error: "no last pick" });
      const x = C.side === "dire" || C.side === "B" ? "dire" : "radiant", H = x === "radiant" ? (b = (w = h.draft) == null ? void 0 : w.radiant) == null ? void 0 : b.slots : (A = (_ = h.draft) == null ? void 0 : _.dire) == null ? void 0 : A.slots, $ = Ia(x, C.heroId, H), j = $ !== void 0 ? He((E = h.leagueConfig) == null ? void 0 : E.matchSetup, x, $) : void 0, z = j != null && j > 0 ? K(f, j) : void 0;
      u = z && j ? await ye(
        r,
        j,
        C.heroId,
        z.displayName,
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      ) : await pe(
        r,
        C.heroId,
        h.tournamentHeroIndex ?? {}
      );
    } else if (c.data.type === "player-hero") {
      if (c.data.heroId === void 0 || c.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const C = K(f, c.data.steam32);
      u = await ye(
        r,
        c.data.steam32,
        c.data.heroId,
        (C == null ? void 0 : C.displayName) ?? "Player",
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      );
    } else {
      if (c.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      u = await pe(
        r,
        c.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
    }
    const d = st(
      u,
      c.data.slideDurationMs ?? 4e3
    ), g = Date.now() + (c.data.overlaySeconds ?? 12) * 1e3;
    if (c.data.persist !== !1) {
      const C = await a.patchState({
        heroStatsCard: u,
        statCarousel: d,
        overlayVisibility: {
          herostats: { mode: "timed", until: g }
        }
      });
      return await n.broadcastFull(C), o.json({ ok: !0, card: u, carousel: d, persisted: C });
    }
    o.json({ ok: !0, card: u, carousel: d });
  }), e.post("/api/stats/stop", k, async (l, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await n.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", k, async (l, o) => {
    const c = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.patchState({ production: c.data });
    await n.broadcastFull(h), o.json(h.production);
  }), e.get("/api/league/bpc-matches", k, async (l, o) => {
    const m = l.query.seasonSlug, c = await Tr(m);
    o.json(c);
  }), e.get("/api/league/bpc-seasons", k, async (l, o) => {
    const m = await Nr();
    o.json(m);
  }), e.get("/api/autopilot/config", k, (l, o) => {
    o.json({
      config: re.getConfig(),
      isActive: re.isActive()
    });
  }), e.post("/api/autopilot/config", k, (l, o) => {
    const c = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    re.configure(c.data), o.json({
      config: re.getConfig(),
      isActive: re.isActive()
    });
  }), e.post("/api/autopilot/trigger", k, async (l, o) => {
    await re.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const Br = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function v(t) {
  return t && typeof t == "object" ? t : null;
}
function et(t) {
  const e = v(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function ve(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const na = /* @__PURE__ */ new Set();
function Gr() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function Kr(t, e, a, n) {
  Gr() && (na.has(t) || (na.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: n.slug,
    source: n.source
  })));
}
function Vr(t, e, a, n) {
  const r = Te({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  n && Kr(n, t, e, r);
  const i = r.slug ?? Qn({ heroId: t, heroClass: e });
  if (i)
    return { ...kn(i), slug: i };
  if (t) {
    const l = Zn(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: Te({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function ra(t, e) {
  if (t) return q(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function sa(t, e, a) {
  const n = `${e}${a}`, r = M(t[`${n}_id`]), i = ve(t[`${n}_class`]);
  if (!r && !i)
    return null;
  const l = {};
  return r > 0 && (l.hero_id = r), i && (l.class = i), l;
}
function oa(t, e) {
  var i;
  const a = [], n = /* @__PURE__ */ new Set(), r = (l, o, m, c) => {
    const h = `${l}-${o}`;
    if (n.has(h) || (n.add(h), !m && !c)) return;
    const f = Vr(
      m,
      c,
      ra(m, c),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: m,
      heroName: ra(m, c),
      heroPortraitSlug: f.slug,
      heroPortraitUrl: f.staticUrl,
      heroPortraitAnimatedUrl: f.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(l);
    if (!m) continue;
    const c = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", h = Number(m[2]), f = et(o), u = v(o), d = ve((u == null ? void 0 : u.class) ?? (u == null ? void 0 : u.hero_class));
    r(c, h, f, d);
  }
  for (let l = 0; l < 7; l++) {
    const o = sa(t, "ban", l);
    o && r(
      "ban",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      ve(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = sa(t, "pick", l);
    o && r(
      "pick",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      ve(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function ia(t, e) {
  return (e === "radiant" ? v(t.radiant) ?? v(t.team2) : v(t.dire) ?? v(t.team3)) ?? {};
}
function Wr(t) {
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
function qr(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function Yr(t, e) {
  const a = v(t.team2), n = v(t.team3), r = M(t.radiant_bonus_time) || M(a == null ? void 0 : a.bonus_time), i = M(t.dire_bonus_time) || M(n == null ? void 0 : n.bonus_time);
  return e === "radiant" ? r : e === "dire" ? i : Math.max(r, i);
}
const la = 7, ca = 5;
function X(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Me(t, e) {
  return X(t, "pick") >= ca && X(e, "pick") >= ca;
}
function tt(t, e) {
  return X(t, "ban") > 0 || X(e, "ban") > 0 || X(t, "pick") > 0 || X(e, "pick") > 0;
}
function zr(t, e, a) {
  const n = M(t == null ? void 0 : t.clock_time), r = M(
    a.activeteam_time_remaining ?? a.active_team_time_remaining
  ), i = () => {
    if (n < 0) return Math.max(0, Math.round(-n));
    if (n > 0 && n <= 120) return Math.round(n);
  };
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME")
    return i() ?? (r > 0 ? r : void 0);
  if (e === "DOTA_GAMERULES_STATE_PRE_GAME")
    return i();
  if (e === "DOTA_GAMERULES_STATE_HERO_SELECTION")
    return r > 0 ? r : i();
}
function Jr(t, e, a, n, r) {
  if (!t || Me(a, n))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !tt(a, n) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !tt(a, n) && !r)
    return "starting";
  const i = X(a, "ban"), l = X(n, "ban");
  return i < la || l < la ? "bans" : "picks";
}
function ua(t) {
  const e = v(t);
  if (!e) return null;
  const a = v(e.hero);
  if (a) {
    const n = et(a);
    if (n) return n;
  }
  return et(t);
}
function Qr(t, e) {
  const a = /* @__PURE__ */ new Map(), n = v(t.player), r = v(t.hero), i = e === "radiant" ? v(r == null ? void 0 : r.team2) ?? v(r == null ? void 0 : r.radiant) : v(r == null ? void 0 : r.team3) ?? v(r == null ? void 0 : r.dire), l = e === "radiant" ? v(n == null ? void 0 : n.team2) ?? v(n == null ? void 0 : n.radiant) : v(n == null ? void 0 : n.team3) ?? v(n == null ? void 0 : n.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]) % 5, f = ua(m);
      if (f && f > 0 && Number.isFinite(h)) {
        let u;
        if (l) {
          const d = v(l[o]);
          if (d != null && d.accountid) {
            const g = parseInt(String(d.accountid), 10);
            Number.isFinite(g) && g > 0 && (u = g);
          }
        }
        a.set(h, { heroId: f, steam32: u });
      }
    }
  if (l)
    for (const [o, m] of Object.entries(l)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]) % 5, f = a.get(h);
      if (f != null && f.heroId) continue;
      const u = ua(m);
      if (u && u > 0 && Number.isFinite(h)) {
        const d = v(m);
        let g;
        if (d != null && d.accountid) {
          const p = parseInt(String(d.accountid), 10);
          Number.isFinite(p) && p > 0 && (g = p);
        }
        a.set(h, { heroId: u, steam32: g });
      }
    }
  return a;
}
function da(t, e, a) {
  const n = Array.from(Qr(a, e).values());
  return t.map((r) => {
    if (r.type !== "pick" || !r.heroId) return r;
    const i = n.find((l) => l.heroId === r.heroId);
    return i ? {
      ...r,
      steam32: i.steam32 ?? r.steam32
    } : r;
  });
}
const Xr = [
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
], Zr = [
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
function ma(t, e, a) {
  const r = (a === "dire_first_pick" ? Zr : Xr).findIndex((i) => i.side === t && i.order === e);
  return r >= 0 ? r : e;
}
function ga(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function Oe(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function fa(t, e) {
  let a = t[0], n = ma(a.side, a.slot.order, e);
  for (const r of t.slice(1)) {
    const i = ma(r.side, r.slot.order, e);
    i > n && (a = r, n = i);
  }
  return a;
}
function es(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function ts(t, e, a) {
  var m, c, h, f;
  const n = [];
  for (const u of t)
    u.type === "pick" && u.heroId && n.push({ side: "radiant", slot: u });
  for (const u of e)
    u.type === "pick" && u.heroId && n.push({ side: "dire", slot: u });
  if (n.length === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const u of ["radiant", "dire"]) {
    const d = u === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (c = a == null ? void 0 : a.dire) == null ? void 0 : c.slots;
    for (const g of d ?? []) {
      const p = ga(u, g);
      p && r.add(p);
    }
  }
  const i = n.filter(
    ({ side: u, slot: d }) => !r.has(ga(u, d))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Me(t, e) && a && !Me(((h = a.radiant) == null ? void 0 : h.slots) ?? [], ((f = a.dire) == null ? void 0 : f.slots) ?? [])) {
      const u = fa(n, l), d = Oe(u.side, u.slot);
      if (es(a.lastPick, d)) return d;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const u = i[0];
    return Oe(u.side, u.slot);
  }
  const o = fa(i, l);
  return Oe(o.side, o.slot);
}
function ha(t, e, a, n, r) {
  var o, m;
  if (!t)
    return {
      name: n,
      logoUrl: e === "radiant" ? ((o = r == null ? void 0 : r.radiant) == null ? void 0 : o.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlA) : ((m = r == null ? void 0 : r.dire) == null ? void 0 : m.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = Xe(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: he(l.teamKey)
  } : { name: n };
}
function as(t, e, a, n) {
  var z, de;
  const r = v(t.map), i = typeof (r == null ? void 0 : r.game_state) == "string" ? r.game_state : "", l = Br.has(i), o = v(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (r == null ? void 0 : r.team_name_radiant) == "string" ? r.team_name_radiant : "Radiant", c = typeof (r == null ? void 0 : r.team_name_dire) == "string" ? r.team_name_dire : "Dire", h = ha(
    n,
    "radiant",
    a,
    m,
    e
  ), f = ha(
    n,
    "dire",
    a,
    c,
    e
  ), u = o ?? {}, d = ia(u, "radiant"), g = ia(u, "dire");
  let p = oa(d, "radiant"), y = oa(g, "dire");
  Me(p, y) && (p = da(p, "radiant", t), y = da(y, "dire", t));
  const b = o ? Wr(u) : null, _ = M(
    u.activeteam_time_remaining ?? u.active_team_time_remaining
  ), A = o ? qr(u) : void 0, E = o ? Yr(u, b) : 0, C = [
    ...p.map((N) => ({
      team: "A",
      heroId: N.heroId,
      player: N.playerName,
      isBan: N.type === "ban",
      order: N.order,
      heroName: N.heroName,
      heroPortraitUrl: N.heroPortraitUrl
    })),
    ...y.map((N) => ({
      team: "B",
      heroId: N.heroId,
      player: N.playerName,
      isBan: N.type === "ban",
      order: N.order,
      heroName: N.heroName,
      heroPortraitUrl: N.heroPortraitUrl
    }))
  ], x = ts(p, y, e), H = Jr(
    l,
    i,
    p,
    y,
    b
  );
  let $ = zr(r, i, u);
  H === "starting" && $ === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? $ = e.startSecondsRemaining : _ > 0 && !tt(p, y) && ($ = _));
  const j = {
    source: "gsi",
    phase: H,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(E)),
    activeTeam: H === "starting" ? null : b,
    turnAction: H === "starting" ? void 0 : A,
    startSecondsRemaining: H === "starting" ? Math.max(
      0,
      Math.round(
        $ ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: H === "starting" ? void 0 : Math.max(0, Math.round(_)),
    series: {
      teamA: h.name,
      teamB: f.name,
      scoreA: (e == null ? void 0 : e.series.scoreA) ?? 0,
      scoreB: (e == null ? void 0 : e.series.scoreB) ?? 0,
      bestOf: e == null ? void 0 : e.series.bestOf,
      gameNumber: e == null ? void 0 : e.series.gameNumber,
      logoUrlA: h.logoUrl ?? (e == null ? void 0 : e.series.logoUrlA),
      logoUrlB: f.logoUrl ?? (e == null ? void 0 : e.series.logoUrlB)
    },
    radiant: {
      name: h.name,
      logoUrl: h.logoUrl,
      slots: p,
      bonusTime: Math.max(0, Math.round(M(u.radiant_bonus_time) || M((z = v(u.team2)) == null ? void 0 : z.bonus_time) || 0))
    },
    dire: {
      name: f.name,
      logoUrl: f.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(M(u.dire_bonus_time) || M((de = v(u.team3)) == null ? void 0 : de.bonus_time) || 0))
    },
    picksBansOrder: C,
    lastPick: x
  };
  return { inDraft: l || !!o, draftPatch: j };
}
const xe = {};
let pa = !1;
async function ns() {
  if (pa) return;
  pa = !0;
  const t = Object.keys(at).map((e) => e.replace("item_", ""));
  S.info({ items: t.length }, "Preloading average item timings from OpenDota..."), (async () => {
    for (const e of t)
      try {
        const a = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?item=${e}`, {
          signal: AbortSignal.timeout(3e4)
          // 30s timeout per item
        });
        if (!a.ok) {
          S.warn({ item: e, status: a.status }, "Failed to fetch item timing from OpenDota");
          continue;
        }
        const n = await a.json(), r = {};
        for (const i of n) {
          if (!i.hero_id || !i.time || !i.games) continue;
          const l = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          r[l] || (r[l] = { sum: 0, totalGames: 0 }), r[l].sum += o * m, r[l].totalGames += m;
        }
        xe[e] = {};
        for (const [i, l] of Object.entries(r))
          l.totalGames > 0 && (xe[e][Number(i)] = Math.round(l.sum / l.totalGames));
        S.debug({ item: e, heroesIndexed: Object.keys(r).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        S.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    S.info("Finished preloading average item timings.");
  })();
}
function rs(t, e) {
  const a = e.replace("item_", "");
  return xe[a] ? xe[a][t] ?? null : null;
}
const Ue = /* @__PURE__ */ new Map(), at = {
  item_blink: { name: "Blink Dagger", category: "CRITICAL MOBILITY" },
  item_black_king_bar: { name: "Black King Bar", category: "MAGIC IMMUNITY" },
  item_rapier: { name: "Divine Rapier", category: "ALL IN" },
  item_gem: { name: "Gem of True Sight", category: "TRUE SIGHT" },
  item_radiance: { name: "Radiance", category: "FARMING ACCELERATOR" },
  item_manta: { name: "Manta Style", category: "ILLUSIONS READY" },
  item_ultimate_scepter: { name: "Aghanim's Scepter", category: "ULTIMATE UPGRADE" },
  item_bfury: { name: "Battle Fury", category: "CLEAVE ACTIVE" },
  item_heart: { name: "Heart of Tarrasque", category: "MASSIVE SURVIVABILITY" },
  item_monkey_king_bar: { name: "Monkey King Bar", category: "TRUE STRIKE" },
  item_bloodthorn: { name: "Bloodthorn", category: "SILENCE READY" },
  item_refresher: { name: "Refresher Orb", category: "DOUBLE ULTIMATE" },
  item_sheepstick: { name: "Scythe of Vyse", category: "HEX READY" }
};
function ss(t, e, a) {
  var n, r;
  try {
    return ((r = (n = t == null ? void 0 : t.items) == null ? void 0 : n[e]) == null ? void 0 : r[a]) || {};
  } catch {
    return {};
  }
}
function os(t, e, a) {
  var n, r;
  try {
    const i = (r = (n = t == null ? void 0 : t.hero) == null ? void 0 : n[e]) == null ? void 0 : r[a];
    return i ? {
      id: Number(i.hero_id ?? i.id ?? 0),
      name: i.name || "unknown_hero"
    } : { id: 0, name: "unknown_hero" };
  } catch {
    return { id: 0, name: "unknown_hero" };
  }
}
function is(t, e, a) {
  var n, r, i;
  try {
    return ((i = (r = (n = t == null ? void 0 : t.player) == null ? void 0 : n[e]) == null ? void 0 : r[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function ls(t, e) {
  var r;
  if (!(t != null && t.items)) return;
  const a = ((r = t == null ? void 0 : t.map) == null ? void 0 : r.clock_time) || 0;
  if (a < 0) return;
  const n = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, c = ss(t, i, m), h = is(t, i, m);
      if (!h || h === "Unknown Player") continue;
      Ue.has(h) || Ue.set(h, /* @__PURE__ */ new Set());
      const f = Ue.get(h), u = /* @__PURE__ */ new Set();
      for (const d in c) {
        const g = (l = c[d]) == null ? void 0 : l.name;
        g && g !== "empty" && u.add(g);
      }
      for (const d of u)
        if (!f.has(d) && (f.add(d), at[d])) {
          const g = os(t, i, m), p = g.id > 0 ? q(g.id) : g.name, y = at[d], w = rs(g.id, d);
          let b = null;
          w !== null && a > 0 && (b = a - w), S.info({ playerName: h, cleanHeroName: p, item: d, hypeData: y, clockTime: a, averageTime: w, timingDiff: b }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: h,
            heroName: p,
            item: d,
            cleanItemName: y.name,
            categoryText: y.category,
            clockTime: a,
            averageTime: w,
            timingDiff: b
          });
        }
    }
  };
  n("team2"), n("team3");
}
function cs(t) {
  if (!t || typeof t != "object") return null;
  const e = t.player, a = t.hero;
  if (e && typeof e == "object" && a && typeof a == "object" && e.accountid && (a.hero_id || a.heroid || a.id)) {
    const r = parseInt(String(e.accountid), 10), i = a.hero_id ?? a.heroid ?? a.id;
    let l = null;
    if (typeof i == "number" && i > 0)
      l = i;
    else if (typeof i == "string") {
      const o = Number(i);
      Number.isFinite(o) && o > 0 && (l = o);
    }
    if (Number.isFinite(r) && r > 0 && l) {
      let o = "Unknown";
      return typeof e.name == "string" && (o = e.name), { steam32: r, heroId: l, playerName: o };
    }
  }
  const n = (r) => {
    var o, m;
    const i = (o = t.hero) == null ? void 0 : o[r], l = (m = t.player) == null ? void 0 : m[r];
    if (!i || !l) return null;
    for (let c = 0; c <= 9; c++) {
      const h = `player${c}`, f = i[h], u = l[h];
      if (f && typeof f == "object" && f.selected_unit === !0) {
        let d = null;
        const g = f.hero_id ?? f.heroid ?? f.id;
        if (typeof g == "number" && g > 0)
          d = g;
        else if (typeof g == "string") {
          const w = Number(g);
          Number.isFinite(w) && w > 0 && (d = w);
        }
        let p = null;
        if (u && typeof u == "object" && u.accountid) {
          const w = parseInt(String(u.accountid), 10);
          Number.isFinite(w) && w > 0 && (p = w);
        }
        let y = "Unknown";
        if (u && typeof u == "object" && typeof u.name == "string" && (y = u.name), d && p)
          return { steam32: p, heroId: d, playerName: y };
      }
    }
    return null;
  };
  return n("team2") || n("team3");
}
let ce = 0, $e = null;
function us(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var y, w;
    const m = typeof l.query.token == "string" ? l.query.token : void 0;
    if (I.GSI_TOKEN && m !== I.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const c = l.body;
    ce = Date.now(), await ee(r);
    try {
      ls(c, i);
    } catch (b) {
      S.error(b, "Power spike evaluation failed");
    }
    const h = await a.getState(), f = ((y = h.leagueConfig) == null ? void 0 : y.roster) ?? [], u = ((w = h.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, d = as(
      c,
      h.draft ?? null,
      f,
      u
    ), g = cs(c);
    g && (d.focusedPlayerSteam32 = g.steam32, d.focusedPlayerHeroId = g.heroId, d.focusedPlayerName = g.playerName);
    const p = async () => {
      var j, z, de, N, ot, it, lt, ct, ut, dt, mt, gt, ft, ht, pt, yt, bt, St, wt, _t, kt, It, Ct, At, Et, Pt, Rt, vt, Dt, Lt, Tt, Nt, Mt, xt, Ht, jt;
      const b = await a.getState();
      let _ = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      d.draftPatch && (_ = {
        ..._,
        draft: {
          ...b.draft ?? {
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
      const A = ((j = c == null ? void 0 : c.map) == null ? void 0 : j.radiant_scan_cooldown) ?? 0, E = ((z = c == null ? void 0 : c.map) == null ? void 0 : z.dire_scan_cooldown) ?? 0, C = ((de = c == null ? void 0 : c.map) == null ? void 0 : de.radiant_glyph_cooldown) ?? 0, x = ((N = c == null ? void 0 : c.map) == null ? void 0 : N.dire_glyph_cooldown) ?? 0;
      if (_.minimapState = {
        roshanState: (ot = c == null ? void 0 : c.map) == null ? void 0 : ot.roshan_state,
        roshanRespawnTimer: (it = c == null ? void 0 : c.map) == null ? void 0 : it.roshan_state_end_seconds,
        tormentorRadiant: (ut = (ct = (lt = c == null ? void 0 : c.game) == null ? void 0 : lt.pits) == null ? void 0 : ct.find((L) => L.team === "radiant")) == null ? void 0 : ut.state,
        tormentorRadiantRespawnTimer: (gt = (mt = (dt = c == null ? void 0 : c.game) == null ? void 0 : dt.pits) == null ? void 0 : mt.find((L) => L.team === "radiant")) == null ? void 0 : gt.respawn_time,
        tormentorDire: (pt = (ht = (ft = c == null ? void 0 : c.game) == null ? void 0 : ft.pits) == null ? void 0 : ht.find((L) => L.team === "dire")) == null ? void 0 : pt.state,
        tormentorDireRespawnTimer: (St = (bt = (yt = c == null ? void 0 : c.game) == null ? void 0 : yt.pits) == null ? void 0 : bt.find((L) => L.team === "dire")) == null ? void 0 : St.respawn_time,
        radiantScanActive: A === 0,
        radiantScanCooldown: A,
        direScanActive: E === 0,
        direScanCooldown: E,
        radiantGlyphActive: C === 0,
        radiantGlyphCooldown: C,
        direGlyphActive: x === 0,
        direGlyphCooldown: x
      }, g) {
        const L = d.focusedPlayerSteam32, B = d.focusedPlayerHeroId, je = d.focusedPlayerName;
        if (L && B) {
          const me = ((wt = b.livePlayerCard) == null ? void 0 : wt.steam32) !== L || ((_t = b.livePlayerCard) == null ? void 0 : _t.heroId) !== B, te = ((kt = b.overlayVisibility) == null ? void 0 : kt.liveplayercard) !== "visible";
          if (me || te) {
            const G = K(f, L), _e = (G == null ? void 0 : G.displayName) || je || "Unknown";
            _ = {
              ..._,
              ...me ? {
                livePlayerCard: {
                  steam32: L,
                  heroId: B,
                  playerLabel: _e,
                  playerAvatarUrl: G == null ? void 0 : G.avatarUrl,
                  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  source: "manual"
                }
              } : {},
              overlayVisibility: {
                ..._.overlayVisibility || {},
                liveplayercard: "visible"
              }
            };
          }
        }
      } else {
        const L = ((It = b.overlayVisibility) == null ? void 0 : It.liveplayercard) === "visible", B = b.livePlayerCard !== null && b.livePlayerCard !== void 0;
        (L || B) && (_ = {
          ..._,
          livePlayerCard: null,
          overlayVisibility: {
            ..._.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const H = await a.patchState(_);
      await n.broadcastFull(H);
      const $ = ((Ct = d.draftPatch) == null ? void 0 : Ct.lastPick) && (!((At = b.draft) != null && At.lastPick) || d.draftPatch.lastPick.heroId !== b.draft.lastPick.heroId || d.draftPatch.lastPick.side !== b.draft.lastPick.side);
      if ((Et = b.production) != null && Et.autoShowStatsOnPick && $) {
        try {
          ie(b);
        } catch {
          return;
        }
        const L = (Pt = d.draftPatch) == null ? void 0 : Pt.lastPick;
        if (!L) return;
        const B = L.side === "dire" || L.side === "B" ? "dire" : "radiant", je = B === "radiant" ? ((vt = (Rt = d.draftPatch) == null ? void 0 : Rt.radiant) == null ? void 0 : vt.slots) ?? ((Lt = (Dt = b.draft) == null ? void 0 : Dt.radiant) == null ? void 0 : Lt.slots) : ((Nt = (Tt = d.draftPatch) == null ? void 0 : Tt.dire) == null ? void 0 : Nt.slots) ?? ((xt = (Mt = b.draft) == null ? void 0 : Mt.dire) == null ? void 0 : xt.slots), me = Ia(B, L.heroId, je), te = me !== void 0 ? He((Ht = b.leagueConfig) == null ? void 0 : Ht.matchSetup, B, me) : void 0, G = ((jt = b.leagueConfig) == null ? void 0 : jt.roster) ?? [], _e = te != null && te > 0 ? K(G, te) : void 0, Ft = _e && te ? await ye(
          r,
          te,
          L.heroId,
          _e.displayName,
          b.tournamentHeroIndex ?? {},
          G,
          b.playerHeroIndex
        ) : await pe(
          r,
          L.heroId,
          b.tournamentHeroIndex ?? {}
        ), qa = st(Ft), Ya = Date.now() + 12e3, za = await a.patchState({
          heroStatsCard: Ft,
          statCarousel: qa,
          overlayVisibility: {
            herostats: { mode: "timed", until: Ya }
          }
        });
        await n.broadcastFull(za);
      }
    };
    $e && clearTimeout($e), $e = setTimeout(() => {
      p().catch((b) => S.error(b, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: d.inDraft });
  }), e.get("/gsi/status", (l, o) => {
    o.json({
      lastSeen: ce ? new Date(ce).toISOString() : null,
      connected: Date.now() - ce < 5e3
    });
  });
}
function ds(t, e, a) {
  var n, r;
  (r = (n = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - ce > 8e3 && ce > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || r.call(n);
}
function ya(t, e) {
  var r, i;
  const a = e.handshake;
  let n = "";
  return typeof ((r = a.auth) == null ? void 0 : r.token) == "string" ? n = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (n = a.query.token), n ? n === I.BROADCAST_SECRET : t === "overlay";
}
async function ms(t) {
  const { state: e, obs: a, opendota: n } = t, r = fe();
  r.use(nn({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), r.disable("x-powered-by"), r.use(
    an({
      origin: I.NODE_ENV === "production" ? Ut() : !0,
      credentials: !0
    })
  ), r.use(fe.json({ limit: "1mb" }));
  const i = P.dirname(nt(import.meta.url)), l = P.join(i, "../../overlay-web/dist"), o = P.join(i, "../../admin-web/dist");
  r.use("/overlay", fe.static(l)), r.use("/admin", fe.static(o)), r.get("/admin", (g, p) => {
    const y = P.join(o, "index.html");
    p.sendFile(y, (w) => {
      w && p.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/admin/*", (g, p, y) => {
    if (g.path.includes(".")) return y();
    const w = P.join(o, "index.html");
    p.sendFile(w, (b) => {
      b && p.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  }), r.get("/overlay", (g, p) => {
    const y = P.join(l, "index.html");
    p.sendFile(y, (w) => {
      w && p.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/overlay/*", (g, p, y) => {
    if (g.path.includes(".")) return y();
    const w = P.join(l, "index.html");
    p.sendFile(w, (b) => {
      b && p.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  });
  const m = rn.createServer(r), c = new sn(m, {
    cors: I.NODE_ENV === "production" ? { origin: Ut() } : { origin: !0 },
    transports: ["websocket", "polling"]
  }), h = {
    async broadcastFull(g) {
      const p = g ?? await e.getState();
      c.of(W.OVERLAY).emit(V.STATE_FULL, p), c.of(W.PRODUCER).emit(
        V.STATE_FULL,
        p
      ), S.debug({ seq: p.seq }, "Emitted state snapshot");
    }
  };
  zn({
    app: r,
    state: e,
    io: c,
    broadcast: h,
    obs: a,
    opendota: n
  }), $r({
    app: r,
    state: e,
    io: c,
    broadcast: h,
    opendota: n
  }), us({
    app: r,
    state: e,
    broadcast: h,
    opendota: n,
    io: c
  }), ds(e, h);
  const f = c.of(W.PRODUCER), u = c.of(W.OVERLAY);
  f.use((g, p) => {
    const y = ya("producer", g);
    p(y ? void 0 : new Error("unauthorized producer"));
  }), u.use((g, p) => {
    const y = ya("overlay", g);
    p(y ? void 0 : new Error("unauthorized overlay"));
  }), f.on("connection", (g) => {
    S.info({ id: g.id }, "producer connected"), e.getState().then((p) => {
      g.emit(V.STATE_FULL, p);
    });
  }), u.on("connection", (g) => {
    S.info({ id: g.id }, "overlay viewer connected"), e.getState().then((p) => {
      g.emit(V.STATE_FULL, p);
    });
  });
  const d = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(d) && d > 500) {
    const g = setInterval(() => {
      e.getState().then((p) => {
        c.of(W.OVERLAY).emit(V.STATE_FULL, p);
      });
    }, d);
    typeof g.unref == "function" && g.unref();
  }
  return { app: r, httpServer: m, io: c, broadcast: h };
}
async function gs() {
  const t = await Wn(), e = new mn(), a = new hn();
  I.REDIS_URL && a.attachRedis(I.REDIS_URL), ee(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  ), ns().catch(
    (i) => S.warn(i, "item timings preload deferred")
  );
  const n = await ms({ state: t, obs: e, opendota: a });
  await Sr({
    state: t,
    opendota: a,
    broadcast: n.broadcast
  }), n.httpServer.listen(I.PORT, () => {
    S.info(
      { port: I.PORT, leagueId: I.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const r = async () => {
    var i;
    S.info("Shutting down"), await n.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), n.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void r()), process.on("SIGTERM", () => void r()), { obs: e, opendota: a, state: t, shutdown: r };
}
process.argv[1] && nt(import.meta.url) === process.argv[1] && gs().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
export {
  gs as bootstrapBroadcastServer
};

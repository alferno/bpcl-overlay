var Cn = Object.defineProperty;
var An = (t, e, a) => e in t ? Cn(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var M = (t, e, a) => An(t, typeof e != "symbol" ? e + "" : e, a);
import v from "node:path";
import { fileURLToPath as St } from "node:url";
import { config as En } from "dotenv";
import { z as s } from "zod";
import Pn from "pino";
import vn from "obs-websocket-js";
import Rn from "bottleneck";
import { Redis as wt } from "ioredis";
import Tn from "cors";
import Ee from "express";
import Ln from "helmet";
import Nn from "node:http";
import { Server as Mn } from "socket.io";
import R, { existsSync as ra } from "node:fs";
import { exec as xn } from "node:child_process";
import { promisify as Hn } from "node:util";
import { mkdir as Ga, writeFile as je, access as jn, readFile as Fe } from "node:fs/promises";
import Ba from "node:https";
const Fn = v.dirname(St(import.meta.url));
En({ path: v.resolve(Fn, "../.env") });
const Dn = s.object({
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
  REPLAY_DB_FILE: s.string().default(v.resolve(process.cwd(), "../../data/system/replay_db.csv")),
  REPLAY_MATCH_FILE: s.string().default(v.resolve(process.cwd(), "../../data/system/active_match.txt")),
  REPLAY_LAST_COMPLETED_FILE: s.string().default(v.resolve(process.cwd(), "../../data/system/last_completed_match.txt")),
  REPLAY_PLAYBACK_DIR: s.string().default(v.resolve(process.cwd(), "../../data/playback")),
  REPLAY_FOLDER: s.string().default(v.resolve(process.cwd(), "../../data/replays")),
  HIGHLIGHTS_FOLDER: s.string().default(v.resolve(process.cwd(), "../../data/highlights")),
  ROSTER_CSV_PATH: s.string().default("data/roster/players_roster_prepared.csv")
}), E = Dn.parse(process.env), S = Pn({
  level: process.env.LOG_LEVEL ?? "info"
});
class On {
  constructor() {
    M(this, "client", new vn());
    M(this, "settings", null);
    M(this, "reconnectTimer", null);
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
const Un = "https://api.opendota.com/api";
function $n(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class Gn {
  constructor(e = 600) {
    M(this, "limiter");
    M(this, "memory", /* @__PURE__ */ new Map());
    M(this, "redis", null);
    this.ttlSeconds = e;
    const a = E.OPENDOTA_RATE_PER_MINUTE, n = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new Rn({
      minTime: n,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new wt(e);
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
        const c = await this.redis.get(`opendota:${e}`);
        if (c)
          return { ...JSON.parse(c), stale: !0 };
      } catch (c) {
        S.warn(c, "Redis OpenDota read failed");
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
        const n = await fetch(`${Un}${e}`, {
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
    for (const c of r)
      if (c && typeof c == "object" && "hero_id" in c) {
        const o = c.hero_id;
        if (typeof o == "number" && o === a) {
          i = c;
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
const ge = "Game starting in", Ka = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), Bn = Ka.partial();
function De(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Kn(t, e, a = Date.now()) {
  if (e.running === !0) {
    const r = e.secondsRemaining ?? (t ? De(t, a) : 0), i = Math.max(0, Math.floor(r));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? ge,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const r = e.secondsRemaining ?? (t ? De(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? ge,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(r))
    };
  }
  const n = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? ge,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? De(t, a) : 0)
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
function sa(t, e = ge) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function oa(t, e = ge) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const Wn = {
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
function Vn(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (Wn[e] ?? e);
}
function X(t) {
  return Vn(t.replace(/^npc_dota_hero_/, "").trim());
}
function qn(t) {
  if (!t)
    return {};
  const e = X(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Wa(e)
  } : {};
}
function Wa(t, e) {
  const a = X(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function Yn(t, e) {
  const a = X(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function zn(t, e) {
  const a = X(t);
  if (!a)
    return {};
  const n = Wa(a), r = Yn(a);
  return {
    staticUrl: n,
    staticFallbackUrl: n,
    animatedUrl: r
  };
}
function Va(t) {
  return `/teams/${t}.png`;
}
function nt(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function Jn(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map();
  for (const r of t) {
    const i = X(r.name);
    if (!i)
      continue;
    e.set(r.id, i), a.add(i), n.set(nt(r.localized_name), i);
    const c = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    n.set(nt(c), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: n };
}
function Xn(t, e) {
  const { heroId: a, heroClass: n, heroName: r, urlSlug: i } = t;
  if (i) {
    const c = X(i);
    if (c && e.byInternalSlug.has(c))
      return { slug: c, source: "url" };
  }
  if (a != null && a > 0) {
    const c = e.byId.get(a);
    if (c)
      return { slug: c, source: "id" };
  }
  if (n) {
    const c = X(n);
    if (c && e.byInternalSlug.has(c))
      return { slug: c, source: "class" };
  }
  for (const c of [r, n]) {
    if (!c)
      continue;
    const o = nt(c), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (n) {
    const c = X(n);
    if (c)
      return { slug: c, source: "fallback" };
  }
  return { source: "none" };
}
function Ye(t, e, a) {
  var r, i;
  const n = e === "radiant" ? (r = t == null ? void 0 : t.pickPlayers) == null ? void 0 : r.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!n || a < 0 || a >= n.length))
    return n[a] ?? null;
}
function Qn(t, e, a) {
  var r, i;
  const n = Ye(t == null ? void 0 : t.matchSetup, e, a);
  if (!(n == null || !((r = t == null ? void 0 : t.roster) != null && r.length)))
    return (i = t.roster.find((c) => c.steam32 === n)) == null ? void 0 : i.displayName;
}
function qa(t, e, a) {
  const n = a == null ? void 0 : a.find((r) => r.type === "pick" && r.heroId === e);
  return n == null ? void 0 : n.order;
}
function Zn(t, e) {
  return `${t}:${e}`;
}
function rt(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let n = 0, r = 0;
  for (const [i, c] of Object.entries(t))
    !i.startsWith(a) || c.games <= 0 || (n += c.games, r += c.wins);
  return { games: n, wins: r };
}
function Ya(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[Zn(e, a)];
}
function st(t, e) {
  if (rt(t, e).games <= 0)
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
  for (const [c, o] of Object.entries(t ?? {}))
    !c.startsWith(a) || o.games <= 0 || (n.games += o.games, n.wins += o.wins, n.kills += o.avgKills * o.games, n.deaths += o.avgDeaths * o.games, n.assists += o.avgAssists * o.games, n.heroDamage += o.avgHeroDamage * o.games, n.goldPerMin += o.avgGpm * o.games, n.lastHits += o.avgLastHits * o.games, n.maxKills = Math.max(n.maxKills, o.maxKills), n.laneWins += o.laneWins ?? 0, n.laneDraws += o.laneDraws ?? 0, n.laneLosses += o.laneLosses ?? 0);
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
const er = [
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
  "standoutplayer",
  "global_kill_switch"
], tr = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), za = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  tr
]), ar = s.object({
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
  side: s.enum(["radiant", "dire", "A", "B"]).optional(),
  /** Preferred roles synced from BPC League */
  roles: s.array(s.string()).optional(),
  /** Player MMR from BPCL API for dynamic rank medals */
  mmr: s.number().optional()
}), Ja = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), Xa = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: Ja.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => $e)).optional()
}), Qa = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(nr).default([]),
  matchSetup: Xa.nullable().optional(),
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
}), Za = s.object({
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
}), en = s.object({
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
}), tn = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), ot = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(tn),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), an = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), rr = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), sr = s.object({
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
}), ia = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(sr).optional(),
  bonusTime: s.number().optional()
}), or = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), $e = s.object({
  series: ar,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(rr).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: ia.optional(),
  dire: ia.optional(),
  lastPick: or.optional()
}), it = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), ir = s.object({
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
  replays: s.array(ir)
});
const lt = s.object({
  /** Player display name */
  playerLabel: s.string(),
  heroId: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  steam32: s.number().optional(),
  // ── Left column ──────────────────────────────────────────────────────────
  xpm: s.number(),
  gpm: s.number(),
  networth: s.number(),
  /** OpenDota ability IDs for base skills (4–6, no innate).  Used to render
   *  skill icons from the Dota 2 CDN. */
  abilityIds: s.array(s.number()).optional(),
  // ── Center column ────────────────────────────────────────────────────────
  kills: s.number(),
  deaths: s.number(),
  assists: s.number(),
  // ── Right column ─────────────────────────────────────────────────────────
  heroDamage: s.number(),
  lastHits: s.number(),
  /** Total team kills — used client-side to compute kill participation % */
  teamKills: s.number(),
  /** 10-slot item id array: indices 0-5 = main inventory, 6 = neutral,
   *  7-9 = backpack.  Use 0 for empty slots. */
  items: s.array(s.number()).length(10).optional(),
  hasScepter: s.boolean().optional(),
  hasShard: s.boolean().optional()
}), ct = s.object({
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
}), lr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), cr = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), Se = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: cr.optional(),
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
  tournament: lr.optional(),
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
  statSlides: s.array(tn).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional(),
  abilityCount: s.number().optional()
}), ut = s.object({
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
}), dt = s.object({
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
}), ur = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: Ka.optional()
}), nn = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), rn = s.object({
  roshanState: s.string().optional(),
  roshanRespawnTimer: s.coerce.number().optional(),
  tormentorRadiant: s.string().optional(),
  tormentorRadiantRespawnTimer: s.coerce.number().optional(),
  tormentorDire: s.string().optional(),
  tormentorDireRespawnTimer: s.coerce.number().optional(),
  radiantScanActive: s.boolean().optional(),
  radiantScanCooldown: s.coerce.number().optional(),
  direScanActive: s.boolean().optional(),
  direScanCooldown: s.coerce.number().optional(),
  radiantGlyphActive: s.boolean().optional(),
  radiantGlyphCooldown: s.coerce.number().optional(),
  direGlyphActive: s.boolean().optional(),
  direGlyphCooldown: s.coerce.number().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(za).default({}),
  sceneHints: nn.optional(),
  leagueConfig: Qa.optional(),
  tournamentHeroIndex: s.record(Za).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(en).optional(),
  production: an.optional(),
  statCarousel: ot.nullable().optional(),
  draft: $e.nullable().optional(),
  lowerThirds: it.nullable().optional(),
  playerStatsCard: ct.nullable().optional(),
  heroStatsCard: Se.nullable().optional(),
  livePlayerCard: Se.nullable().optional(),
  matchupCard: ut.nullable().optional(),
  sponsor: dt.nullable().optional(),
  timers: ur.optional(),
  minimapState: rn.optional(),
  standoutPlayerCard: lt.nullable().optional()
});
const dr = s.object({
  overlayVisibility: s.record(za).optional(),
  leagueConfig: Qa.partial().optional(),
  tournamentHeroIndex: s.record(Za).optional(),
  playerHeroIndex: s.record(en).optional(),
  production: an.partial().optional(),
  minimapState: rn.partial().optional(),
  statCarousel: s.union([ot, ot.partial(), s.null()]).optional(),
  draft: s.union([$e, $e.partial(), s.null()]).optional(),
  lowerThirds: s.union([it, it.partial(), s.null()]).optional(),
  playerStatsCard: s.union([ct, ct.partial(), s.null()]).optional(),
  heroStatsCard: s.union([Se, Se.partial(), s.null()]).optional(),
  livePlayerCard: s.union([Se, Se.partial(), s.null()]).optional(),
  matchupCard: s.union([ut, ut.partial(), s.null()]).optional(),
  sponsor: s.union([
    dt,
    dt.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: Bn.optional()
  }).partial().optional(),
  sceneHints: nn.partial().optional(),
  standoutPlayerCard: s.union([
    lt,
    lt.partial(),
    s.null()
  ]).optional()
});
function mr() {
  const t = {};
  for (const e of er)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function gr() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function sn() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: mr(),
    sceneHints: {},
    leagueConfig: gr(),
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
    minimapState: {},
    standoutPlayerCard: null
  };
}
const te = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, ae = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function C(t, e, a) {
  let n;
  const r = t.headers.authorization;
  if (r != null && r.startsWith("Bearer ") ? n = r.slice(7).trim() : typeof t.query.token == "string" && (n = t.query.token), !n) {
    e.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (n !== E.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function fr(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function la(t, e) {
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
function hr(t, e) {
  var i, c;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const n = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, r = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return n != null && n.slots && (n.slots = la((i = t.radiant) == null ? void 0 : i.slots, n.slots)), r != null && r.slots && (r.slots = la((c = t.dire) == null ? void 0 : c.slots, r.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: n,
    dire: r,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function le(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function pr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function yr(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function on(t, e) {
  var b;
  const a = e.overlayVisibility !== void 0 ? fr(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let n = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: _, ...k } = e.timers;
    n = {
      ...t.timers ?? {},
      ...k
    }, _ !== void 0 && (n = {
      ...n,
      gameStartCountdown: Kn((b = t.timers) == null ? void 0 : b.gameStartCountdown, _)
    });
  }
  const r = hr(t.draft, e.draft), i = pr(t.leagueConfig, e.leagueConfig), c = yr(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let l = le(t.heroStatsCard ?? void 0, e.heroStatsCard), p = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const h = le(t.lowerThirds ?? void 0, e.lowerThirds), d = le(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let g = le(t.matchupCard ?? void 0, e.matchupCard), u = le(t.sponsor ?? void 0, e.sponsor), f = le(t.statCarousel ?? void 0, e.statCarousel);
  if (l && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const _ = e.heroStatsCard;
    _.fetchedAt ? l = { ..._ } : l = {
      ...l,
      ..._,
      tournament: _.tournament ? { ...l.tournament ?? {}, ..._.tournament } : l.tournament,
      playerHero: _.playerHero ? { ...l.playerHero ?? {}, ..._.playerHero } : l.playerHero,
      statSlides: _.statSlides ?? l.statSlides
    };
  }
  if (g && e.matchupCard && typeof e.matchupCard == "object") {
    const _ = e.matchupCard;
    g = {
      ...g,
      ..._,
      matchup: _.matchup ? { ...g.matchup ?? {}, ..._.matchup } : g.matchup
    };
  }
  let y = le(t.livePlayerCard ?? void 0, e.livePlayerCard), w = le(t.standoutPlayerCard ?? void 0, e.standoutPlayerCard);
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: m ?? t.playerHeroIndex,
    production: c ?? t.production,
    statCarousel: f === void 0 ? t.statCarousel : f,
    draft: r === void 0 ? t.draft : r,
    lowerThirds: h === void 0 ? t.lowerThirds : h,
    playerStatsCard: d === void 0 ? t.playerStatsCard : d,
    heroStatsCard: l === void 0 ? t.heroStatsCard : l,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: g === void 0 ? t.matchupCard : g,
    sponsor: u === void 0 ? t.sponsor : u,
    timers: n ?? t.timers,
    sceneHints: p,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState,
    standoutPlayerCard: w === void 0 ? t.standoutPlayerCard : w
  };
}
function ca(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = on(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function br(t) {
  const e = new wt(t.url, {
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
        const c = await e.get(t.key), o = c ? JSON.parse(c) : t.seed, m = on(o, r);
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
async function Sr() {
  const t = sn();
  if (E.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), ca(t);
  if (!E.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new wt(E.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: E.REDIS_STATE_KEY }, "State backend: redis"), br({
      url: E.REDIS_URL,
      key: E.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), E.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), ca(t);
    throw e;
  }
}
function wr(t) {
  return dr.parse(t);
}
const Ne = Hn(xn);
class _r {
  constructor() {
    M(this, "dbFile", E.REPLAY_DB_FILE);
    M(this, "matchFile", E.REPLAY_MATCH_FILE);
    M(this, "lastCompletedFile", E.REPLAY_LAST_COMPLETED_FILE);
    M(this, "playbackDir", E.REPLAY_PLAYBACK_DIR);
    M(this, "replayFolder", E.REPLAY_FOLDER);
    M(this, "highlightsDir", E.HIGHLIGHTS_FOLDER || v.resolve(process.cwd(), "../../data/highlights"));
    M(this, "pendingDuration", null);
    M(this, "playbackState", "IDLE");
    M(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    M(this, "previewCacheDir", v.resolve(process.cwd(), "public-preview-cache"));
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
      const a = v.basename(e), n = v.join(this.replayFolder, a);
      e !== n && (R.copyFileSync(e, n), R.unlinkSync(e));
      let r = 30, i = !1;
      this.pendingDuration !== null && (r = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const h = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${n}"`, d = await Ne(h), g = parseFloat(d.stdout.trim());
        !isNaN(g) && !i && (r = Math.round(g));
      } catch (h) {
        S.error(h, "Failed to probe duration of new replay");
      }
      const c = await this.getReplayState(), o = c.currentMatch;
      let m = 0;
      for (const h of c.replays)
        h.replayId > m && (m = h.replayId);
      const l = m + 1, p = `${o},${l},"${n}",0,${r}
`;
      if (!R.existsSync(this.dbFile)) {
        const h = v.dirname(this.dbFile);
        R.existsSync(h) || R.mkdirSync(h, { recursive: !0 }), R.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      R.appendFileSync(this.dbFile, p, "utf-8"), S.info({ newPath: n, currentMatch: o, newReplayId: l }, "Saved new replay");
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
        for (let c = 1; c < i.length; c++) {
          const o = i[c].trim();
          if (!o) continue;
          const m = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (m) {
            const l = m[3];
            n.push({
              match: parseInt(m[1], 10),
              replayId: parseInt(m[2], 10),
              file: l,
              favorite: parseInt(m[4], 10) === 1,
              duration: parseInt(m[5], 10),
              filename: v.basename(l)
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
      let c = !1;
      const o = a ? "1" : "0";
      for (let m = 1; m < r.length; m++) {
        const l = r[m].trim();
        if (!l) continue;
        const p = l.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        p && p[3] === e ? (i.push(`${p[1]},${p[2]},"${p[3]}",${o},${p[5]}`), c = !0) : i.push(l);
      }
      return R.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), c;
    } catch (n) {
      return S.error(n, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: "File not found" };
      const r = (await this.getReplayState()).replays.find((h) => h.file === e), i = r ? r.duration : 30, c = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await Ne(c), m = parseFloat(o.stdout.trim()) || 40, l = Math.max(0, m - i);
      let p = e;
      if (l > 1) {
        R.existsSync(this.playbackDir) || R.mkdirSync(this.playbackDir, { recursive: !0 }), p = v.join(this.playbackDir, "current_replay.mp4");
        const h = `ffmpeg -y -ss ${l} -i "${e}" -t ${i} -c copy "${p}"`;
        S.info({ cmd: h }, "Running ffmpeg slice command"), await Ne(h);
      }
      if (a.isConnected()) {
        const h = await a.setInputSettings("ReplayPlayer", {
          local_file: p
        });
        if (!h.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${h.error}` };
        const d = await a.getCurrentProgramScene();
        d.ok && d.sceneName && d.sceneName !== "Replay Stinger" && d.sceneName !== "Replay" && (this.originalScene = d.sceneName), this.playbackState = "STINGER_IN";
        const g = await a.setCurrentScene("Replay Stinger");
        return g.ok || S.error({ error: g.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
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
      const a = v.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return S.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
  async nextMatch() {
    try {
      const a = (await this.getReplayState()).currentMatch;
      R.existsSync(v.dirname(this.lastCompletedFile)) || R.mkdirSync(v.dirname(this.lastCompletedFile), { recursive: !0 }), R.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((r) => {
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
      R.existsSync(this.highlightsDir) || R.mkdirSync(this.highlightsDir, { recursive: !0 }), n.sort((m, l) => m.replayId - l.replayId);
      const r = v.join(this.highlightsDir, `concat_${e}.txt`), i = n.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      R.writeFileSync(r, i.join(`
`) + `
`, "utf-8");
      const c = v.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${r}" -c copy "${c}"`;
      return S.info({ cmd: o }, "Generating highlights"), await Ne(o), S.info(`Generated highlights: ${c}`), { ok: !0, file: c };
    } catch (a) {
      return S.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
const ln = {
  kda: 2.5,
  killParticipation: 2,
  gpm: 1.8,
  xpm: 1.2,
  networthShare: 1.5,
  damagePm: 1.6,
  healingPm: 0.6,
  lastHits: 1,
  denies: 0.4,
  laneEfficiency: 0.8,
  winBonus: 1
};
function kr(t) {
  const e = Math.min(...t), n = Math.max(...t) - e;
  return n === 0 ? t.map(() => 0.5) : t.map((r) => (r - e) / n);
}
function Ce(t, e) {
  return e === 0 ? 0 : t / e;
}
function Ir(t, e = ln) {
  const a = t.players ?? [];
  if (a.length === 0) return [];
  const n = Math.max(1, (t.duration ?? 1800) / 60), r = (u) => (u.player_slot ?? 0) < 128, i = a.filter(r), c = a.filter((u) => !r(u)), o = i.reduce((u, f) => u + (f.kills ?? 0), 0), m = c.reduce((u, f) => u + (f.kills ?? 0), 0), l = i.reduce((u, f) => u + (f.net_worth ?? 0), 0), p = c.reduce((u, f) => u + (f.net_worth ?? 0), 0), h = a.map((u) => {
    const f = r(u) ? "radiant" : "dire", y = f === "radiant" ? o : m, w = f === "radiant" ? l : p, b = u.kills ?? 0, _ = u.deaths ?? 0, k = u.assists ?? 0;
    return {
      kda: Ce(b + k, _ + 1),
      killParticipation: Ce(b + k, Math.max(1, y)),
      gpm: u.gold_per_min ?? 0,
      xpm: u.xp_per_min ?? 0,
      networthShare: Ce(u.net_worth ?? 0, Math.max(1, w)),
      damagePm: Ce(u.hero_damage ?? 0, n),
      healingPm: Ce(u.hero_healing ?? 0, n),
      lastHits: u.last_hits ?? 0,
      denies: u.denies ?? 0,
      laneEfficiency: u.lane_efficiency ?? 0,
      winBonus: (t.radiant_win ? f === "radiant" : f === "dire") ? 1 : 0,
      leaver: (u.leaver_status ?? 0) > 0
    };
  }), d = [
    "kda",
    "killParticipation",
    "gpm",
    "xpm",
    "networthShare",
    "damagePm",
    "healingPm",
    "lastHits",
    "denies",
    "laneEfficiency"
  ], g = {};
  for (const u of d)
    g[u] = kr(h.map((f) => f[u]));
  return g.winBonus = h.map((u) => u.winBonus), a.map((u, f) => {
    if (h[f].leaver)
      return ua(u, t, 0, Cr());
    const w = {
      kda: g.kda[f] * e.kda,
      killParticipation: g.killParticipation[f] * e.killParticipation,
      gpm: g.gpm[f] * e.gpm,
      xpm: g.xpm[f] * e.xpm,
      networthShare: g.networthShare[f] * e.networthShare,
      damagePm: g.damagePm[f] * e.damagePm,
      healingPm: g.healingPm[f] * e.healingPm,
      lastHits: g.lastHits[f] * e.lastHits,
      denies: g.denies[f] * e.denies,
      laneEfficiency: g.laneEfficiency[f] * e.laneEfficiency,
      winBonus: g.winBonus[f] * e.winBonus
    }, b = Object.values(w).reduce((_, k) => _ + k, 0);
    return ua(u, t, b, w);
  });
}
function Cr() {
  return {
    kda: 0,
    killParticipation: 0,
    gpm: 0,
    xpm: 0,
    networthShare: 0,
    damagePm: 0,
    healingPm: 0,
    lastHits: 0,
    denies: 0,
    laneEfficiency: 0,
    winBonus: 0
  };
}
function ua(t, e, a, n, r) {
  const i = (t.player_slot ?? 0) < 128 ? "radiant" : "dire", c = (e.players ?? []).filter((l) => (l.player_slot ?? 0) < 128), o = (e.players ?? []).filter((l) => (l.player_slot ?? 0) >= 128), m = i === "radiant" ? c.reduce((l, p) => l + (p.kills ?? 0), 0) : o.reduce((l, p) => l + (p.kills ?? 0), 0);
  return {
    accountId: t.account_id,
    personaname: t.personaname,
    heroId: t.hero_id,
    heroName: t.hero_name,
    playerSlot: t.player_slot ?? 0,
    side: i,
    won: e.radiant_win ? i === "radiant" : i === "dire",
    mvpScore: a,
    breakdown: n,
    raw: {
      kills: t.kills ?? 0,
      deaths: t.deaths ?? 0,
      assists: t.assists ?? 0,
      heroDamage: t.hero_damage ?? 0,
      gpm: t.gold_per_min ?? 0,
      xpm: t.xp_per_min ?? 0,
      networth: t.net_worth ?? 0,
      lastHits: t.last_hits ?? 0,
      teamKills: m,
      items: [
        t.item_0 ?? 0,
        t.item_1 ?? 0,
        t.item_2 ?? 0,
        t.item_3 ?? 0,
        t.item_4 ?? 0,
        t.item_5 ?? 0,
        t.item_neutral ?? 0,
        t.backpack_0 ?? 0,
        t.backpack_1 ?? 0,
        t.backpack_2 ?? 0
      ],
      hasScepter: (t.aghanims_scepter ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((l) => [108, 271, 127, 256].includes(l ?? 0)),
      hasShard: (t.aghanims_shard ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((l) => [609, 125].includes(l ?? 0))
    }
  };
}
function cn(t, e) {
  return [...Ir(t, e)].sort((r, i) => i.mvpScore - r.mvpScore).map((r, i) => ({ ...r, rank: i + 1 }));
}
let ue = null, pe = /* @__PURE__ */ new Map(), Ge = null;
function Ar() {
  if (!(ue != null && ue.length)) {
    Ge = null;
    return;
  }
  Ge = Jn(ue);
}
async function oe(t) {
  if (pe.size > 0) return pe;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (ue = e.data, pe = new Map(ue.map((a) => [a.id, a])), Ar()), pe;
}
function Be(t) {
  if (Ge) return Xn(t, Ge);
  if (t.heroId != null && t.heroId > 0) {
    const e = pe.get(t.heroId);
    if (e) {
      const a = X(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = X(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Er(t) {
  return Be(t).slug;
}
function Pr(t, e) {
  const a = Be({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const n = pe.get(t);
  if (n)
    return X(n.name) || void 0;
}
function re(t, e) {
  return qn(
    Pr(t, e)
  );
}
function vr(t, e) {
  return re(t, e).heroPortraitUrl;
}
function ne(t) {
  const e = pe.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function Rr(t) {
  if (t)
    return Va(t);
}
function V(t, e) {
  return t.find((a) => a.steam32 === e);
}
function Tr() {
  return ue ? [...ue].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function Lr(t) {
  const { app: e, state: a, io: n, broadcast: r, obs: i, opendota: c } = t, o = new _r();
  o.init(i), e.use(
    "/api/replays/media",
    C,
    Ee.static(E.REPLAY_FOLDER)
  ), e.get("/health/live", (h, d) => {
    d.json({
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
  }), e.get("/health/ready", async (h, d) => {
    try {
      await a.getState(), d.json({ ok: !0 });
    } catch {
      d.status(503).json({ ok: !1 });
    }
  }), e.get("/api/state", C, async (h, d) => {
    const g = await a.getState();
    d.json(g);
  }), e.patch("/api/state", C, async (h, d) => {
    try {
      const g = wr(h.body), u = await a.patchState(g);
      await r.broadcastFull(u), d.json(u);
    } catch (g) {
      S.error(g, "state patch failed"), d.status(400).json({
        error: g instanceof Error ? g.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", C, async (h, d) => {
    const g = sn(), u = await a.replaceState(g);
    await r.broadcastFull(u), d.json(u);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function l(h) {
    const d = await a.patchState({
      timers: { gameStartCountdown: h }
    });
    return await r.broadcastFull(d), d;
  }
  e.post(
    "/api/timers/game-start/start",
    C,
    async (h, d) => {
      var w, b;
      const g = m.safeParse(h.body);
      if (!g.success)
        return d.status(400).json({ error: g.error.flatten() });
      const u = ((w = g.data.label) == null ? void 0 : w.trim()) || ge, f = sa(
        g.data.seconds,
        u
      ), y = await l(f);
      d.json({ ok: !0, gameStartCountdown: (b = y.timers) == null ? void 0 : b.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    C,
    async (h, d) => {
      var _, k, I, A;
      const u = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, f = (typeof ((k = h.body) == null ? void 0 : k.label) == "string" ? h.body.label.trim() : "") || (u == null ? void 0 : u.label) || ge, y = typeof ((I = h.body) == null ? void 0 : I.seconds) == "number" ? h.body.seconds : De(u), w = oa(y, f), b = await l(w);
      d.json({ ok: !0, gameStartCountdown: (A = b.timers) == null ? void 0 : A.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    C,
    async (h, d) => {
      var _, k, I;
      const g = m.safeParse(h.body);
      if (!g.success)
        return d.status(400).json({ error: g.error.flatten() });
      const f = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, y = ((k = g.data.label) == null ? void 0 : k.trim()) || (f == null ? void 0 : f.label) || ge, w = f != null && f.running ? sa(g.data.seconds, y) : oa(g.data.seconds, y), b = await l(w);
      d.json({ ok: !0, gameStartCountdown: (I = b.timers) == null ? void 0 : I.gameStartCountdown });
    }
  );
  const p = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", C, (h, d) => {
    const g = p.safeParse(h.body);
    if (!g.success) return d.status(400).json({ error: g.error.flatten() });
    i.configure(g.data), n.of(ae.PRODUCER).emit(te.ACK, {
      kind: "obs:config",
      ok: !0
    }), d.json({ ok: !0 });
  }), e.post("/api/obs/connect", C, async (h, d) => {
    const g = h.body;
    if (g && typeof g == "object" && Object.keys(g).length) {
      const f = p.safeParse(g);
      if (!f.success)
        return d.status(400).json({ error: f.error.flatten() });
      i.configure(f.data);
    }
    const u = await i.connect();
    n.of(ae.PRODUCER).emit(te.ACK, {
      kind: "obs:connect",
      ok: u.ok,
      error: u.error
    }), d.json(u);
  }), e.post("/api/obs/disconnect", C, async (h, d) => {
    await i.disconnect(), n.of(ae.PRODUCER).emit(te.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), d.json({ ok: !0 });
  }), e.get("/api/obs/scenes", C, async (h, d) => {
    try {
      const g = await i.listScenes();
      d.json({ ok: !0, scenes: g });
    } catch (g) {
      d.status(500).json({
        ok: !1,
        error: g instanceof Error ? g.message : String(g)
      });
    }
  }), e.post("/api/obs/program-scene", C, async (h, d) => {
    const u = s.object({ sceneName: s.string() }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const f = await i.setProgramScene(u.data.sceneName);
    n.of(ae.PRODUCER).emit(te.ACK, {
      kind: "obs:setProgramScene",
      ok: f.ok,
      sceneName: u.data.sceneName,
      error: f.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: u.data.sceneName }
    });
    const y = await a.getState();
    await r.broadcastFull(y), d.json(f);
  }), e.post(
    "/api/obs/scene-source",
    C,
    async (h, d) => {
      const u = s.object({
        sceneName: s.string(),
        sourceName: s.string(),
        visible: s.boolean()
      }).safeParse(h.body);
      if (!u.success)
        return d.status(400).json({ error: u.error.flatten() });
      const f = await i.setSourceVisible(u.data);
      d.json(f);
    }
  ), e.post(
    "/api/opendota/heroes/constants",
    C,
    async (h, d) => {
      const g = await c.heroesConstants();
      d.json(g);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    C,
    async (h, d) => {
      const g = await c.playerHeroStats(h.params.accountId);
      d.json(g);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    C,
    async (h, d) => {
      const g = await c.heroMatchups(Number(h.params.heroId));
      d.json(g);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    C,
    async (h, d) => {
      const u = s.object({
        heroA: s.number(),
        heroB: s.number()
      }).safeParse(h.body);
      if (!u.success)
        return d.status(400).json({ error: u.error.flatten() });
      const f = await c.matchupBetween(
        u.data.heroA,
        u.data.heroB
      );
      d.json(f);
    }
  ), e.post("/api/opendota/compose/hero-card", C, async (h, d) => {
    const u = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const f = await a.getState(), y = u.data.accountId !== void 0 ? Ya(
      f.playerHeroIndex,
      u.data.accountId,
      u.data.heroId
    ) : void 0;
    let w = "league", b;
    if (y && y.games > 0)
      b = {
        games: y.games,
        wins: y.wins,
        losses: y.games - y.wins
      };
    else if (u.data.accountId !== void 0) {
      w = "opendota_cached";
      const k = await c.playerHeroStats(u.data.accountId);
      if (k.ok && Array.isArray(k.data)) {
        const I = k.data.find(
          (A) => A && typeof A == "object" && A.hero_id === u.data.heroId
        );
        I && typeof I.games == "number" && (b = {
          games: I.games,
          wins: typeof I.win == "number" ? I.win : 0,
          losses: I.games - (typeof I.win == "number" ? I.win : 0)
        });
      }
      k.ok || (w = "stale");
    }
    const _ = {
      playerLabel: u.data.playerLabel,
      heroId: u.data.heroId,
      playerHero: b,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: w
    };
    if (u.data.persist) {
      const k = await a.patchState({ heroStatsCard: _ });
      return await r.broadcastFull(k), d.json({ ok: !0, card: _, persisted: k });
    }
    return d.json({ ok: !0, card: _ });
  }), e.post("/api/opendota/compose/matchup-card", C, async (h, d) => {
    const u = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const f = await c.matchupBetween(
      u.data.heroAId,
      u.data.heroBId
    ), y = {
      heroAId: u.data.heroAId,
      heroBId: u.data.heroBId,
      matchup: f.ok ? f.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: f.ok ? "opendota_cached" : "stale"
    };
    if (u.data.persist) {
      const w = await a.patchState({ matchupCard: y });
      return await r.broadcastFull(w), d.json({ ok: !0, upstream: f, matchupCard: y, persisted: w });
    }
    return d.json({ ok: !0, upstream: f, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", C, (h, d) => {
    c.purgeMemory(), d.json({ ok: !0 });
  }), e.get("/api/replays", C, async (h, d) => {
    try {
      const g = await o.getReplayState();
      d.json(g);
    } catch (g) {
      d.status(500).json({ error: g instanceof Error ? g.message : String(g) });
    }
  }), e.post("/api/replays/save", C, async (h, d) => {
    const u = s.object({ duration: s.number().nullable().optional() }).safeParse(h.body), f = u.success && u.data.duration || null, y = await o.triggerSaveReplay(f, i);
    d.json(y);
  }), e.post("/api/replays/next-match", C, async (h, d) => {
    const g = await o.nextMatch();
    d.json(g);
  }), e.post("/api/replays/generate-highlights", C, async (h, d) => {
    const u = s.object({ matchId: s.number() }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await o.generateHighlights(u.data.matchId);
    d.json(f);
  }), e.post("/api/replays/hotkey", C, async (h, d) => {
    const u = s.object({ hotkeyName: s.string() }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await i.triggerHotkeyByName(u.data.hotkeyName);
    d.json(f);
  }), e.post("/api/replays/hotkey-sequence", C, async (h, d) => {
    const u = s.object({
      keyId: s.string(),
      keyModifiers: s.object({
        shift: s.boolean().optional(),
        control: s.boolean().optional(),
        alt: s.boolean().optional(),
        command: s.boolean().optional()
      }).optional()
    }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await i.triggerHotkeyBySequence(u.data.keyId, u.data.keyModifiers || {});
    d.json(f);
  }), e.post("/api/replays/favorite", C, async (h, d) => {
    const u = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await o.toggleFavorite(u.data.file, u.data.favorite);
    d.json({ ok: f });
  }), e.post("/api/replays/play", C, async (h, d) => {
    const u = s.object({ file: s.string() }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await o.playReplay(u.data.file, i);
    d.json(f);
  }), e.post("/api/replays/generate-preview", C, async (h, d) => {
    const u = s.object({ file: s.string() }).safeParse(h.body);
    if (!u.success) return d.status(400).json({ error: u.error.flatten() });
    const f = await o.generatePreview(u.data.file);
    d.json(f);
  }), e.post("/api/standout/compute", C, async (h, d) => {
    var z;
    const u = s.object({
      matchId: s.number().int().positive(),
      weights: s.object({
        kda: s.number().optional(),
        killParticipation: s.number().optional(),
        gpm: s.number().optional(),
        xpm: s.number().optional(),
        networthShare: s.number().optional(),
        damagePm: s.number().optional(),
        healingPm: s.number().optional(),
        lastHits: s.number().optional(),
        denies: s.number().optional(),
        laneEfficiency: s.number().optional(),
        winBonus: s.number().optional()
      }).optional(),
      persist: s.boolean().optional()
    }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const { matchId: f, persist: y } = u.data, w = { ...ln, ...u.data.weights ?? {} }, b = await c.matchDetails(f);
    if (!b.ok || !b.data)
      return d.status(502).json({
        error: `OpenDota match fetch failed: ${b.error ?? "no data"}`
      });
    const _ = b.data;
    if (Array.isArray(_.players) && _.duration)
      for (const $ of _.players)
        $.duration = _.duration;
    if (await oe(c), Array.isArray(_.players)) {
      for (const $ of _.players)
        if ($.hero_id && !$.hero_name) {
          const F = re($.hero_id);
          $.hero_name = F.heroPortraitSlug ?? String($.hero_id);
        }
    }
    const k = cn(_, w), I = k[0];
    if (!I)
      return d.status(422).json({ error: "No players found in match" });
    const H = ((z = (await a.getState()).leagueConfig) == null ? void 0 : z.roster) ?? [], L = I.accountId ? V(H, I.accountId) : void 0, G = I.heroId ? re(I.heroId, I.heroName) : {}, O = {
      playerLabel: (L == null ? void 0 : L.displayName) ?? I.personaname ?? `Player ${I.accountId ?? "?"}`,
      heroId: I.heroId,
      heroName: I.heroName,
      steam32: I.accountId,
      ...G,
      xpm: I.raw.xpm,
      gpm: I.raw.gpm,
      networth: I.raw.networth,
      kills: I.raw.kills,
      deaths: I.raw.deaths,
      assists: I.raw.assists,
      heroDamage: I.raw.heroDamage,
      lastHits: I.raw.lastHits,
      teamKills: I.raw.teamKills,
      items: I.raw.items,
      hasScepter: I.raw.hasScepter,
      hasShard: I.raw.hasShard
    };
    if (y) {
      const $ = await a.patchState({
        standoutPlayerCard: O,
        overlayVisibility: { standoutplayer: "visible" }
      });
      return await r.broadcastFull($), d.json({ ok: !0, winner: I, ranked: k, standoutCard: O, persisted: !0 });
    }
    return d.json({ ok: !0, winner: I, ranked: k, standoutCard: O, persisted: !1 });
  }), e.post("/api/standout/push", C, async (h, d) => {
    var I;
    const u = s.object({
      card: s.record(s.unknown()),
      show: s.boolean().optional().default(!0)
    }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const f = u.data.card;
    if (f.heroPortraitSlug = void 0, f.heroPortraitUrl = void 0, typeof f.heroId == "number") {
      const A = re(
        f.heroId,
        typeof f.heroName == "string" ? f.heroName : void 0
      );
      Object.assign(f, A);
    }
    const w = ((I = (await a.getState()).leagueConfig) == null ? void 0 : I.roster) ?? [], b = typeof f.steam32 == "number" ? V(w, f.steam32) : void 0;
    f.playerLabel = (b == null ? void 0 : b.displayName) ?? (typeof f.personaname == "string" ? f.personaname : void 0) ?? `Player ${f.steam32 ?? "?"}`;
    const _ = {
      standoutPlayerCard: f
    };
    u.data.show && (_.overlayVisibility = { standoutplayer: "visible" });
    const k = await a.patchState(_);
    await r.broadcastFull(k), d.json({ ok: !0, standoutPlayerCard: k.standoutPlayerCard });
  }), e.post("/api/standout/hide", C, async (h, d) => {
    const g = await a.patchState({
      overlayVisibility: { standoutplayer: "hidden" }
    });
    await r.broadcastFull(g), d.json({ ok: !0 });
  });
}
function Nr() {
  var e;
  const t = (e = E.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Mr(t, e) {
  var c, o, m, l;
  const a = (c = E.STEAM_WEB_API_KEY) == null ? void 0 : c.trim();
  if (!a) return [];
  const n = [];
  let r;
  for (; n.length < e; ) {
    const p = new URLSearchParams({
      key: a,
      league_id: String(t),
      matches_requested: String(Math.min(100, e - n.length))
    });
    r !== void 0 && p.set("start_at_match_id", String(r));
    const h = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${p}`, d = await fetch(h);
    if (!d.ok) {
      const w = await d.text();
      throw new Error(`Steam match history HTTP ${d.status}: ${w.slice(0, 200)}`);
    }
    const g = await d.json(), u = (o = g.result) == null ? void 0 : o.status, f = ((m = g.result) == null ? void 0 : m.matches) ?? [];
    if (u !== void 0 && u !== 1 && f.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${u} for league ${t} (no matches in response)`
      );
    if (f.length === 0) break;
    for (const w of f)
      typeof w.match_id == "number" && w.match_id > 0 && n.push(w.match_id);
    const y = (l = f[f.length - 1]) == null ? void 0 : l.match_id;
    if (y === void 0 || f.length < 100) break;
    r = y - 1;
  }
  const i = [...new Set(n)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function xr(t, e = 80) {
  var o, m;
  const a = Nr(), n = [];
  if (!((o = E.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let r = [];
  if ((m = E.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      r = await Mr(t, e);
    } catch (l) {
      const p = l instanceof Error ? l.message : String(l);
      S.warn({ err: l, leagueId: t }, "Steam league match history failed"), n.push(p);
    }
  else a.length === 0 && n.push("STEAM_WEB_API_KEY is not set — cannot load match list from Steam.");
  const i = [.../* @__PURE__ */ new Set([...a, ...r])].slice(0, e);
  if (i.length === 0)
    return {
      matchIds: [],
      source: a.length > 0 ? "env" : "steam",
      warning: n.join(" ") || `No matches returned for league ${t}. Add LEAGUE_MATCH_IDS or verify the Steam key and league ID.`
    };
  let c = "steam";
  return a.length > 0 && r.length > 0 ? c = "mixed" : a.length > 0 && r.length === 0 && (c = "env"), r.length === 0 && a.length > 0 && n.push(`Using ${a.length} match ID(s) from LEAGUE_MATCH_IDS only.`), {
    matchIds: i,
    source: c,
    warning: n.length > 0 ? n.join(" ") : void 0
  };
}
const Hr = 10;
function da(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function ma(t) {
  return t !== void 0 && t < 128;
}
function jr(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function Fr(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (r) => jr(r.account_id) && typeof r.lane == "number" && r.lane > 0 && !r.is_roaming
  ), n = [...new Set(a.map((r) => r.lane))];
  for (const r of n) {
    const i = a.filter((g) => g.lane === r), c = i.filter((g) => ma(g.player_slot)), o = i.filter((g) => !ma(g.player_slot));
    if (c.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...c.map(da)), l = Math.max(0, ...o.map(da)), p = m - l;
    let h;
    Math.abs(p) <= Hr ? h = "draw" : h = p > 0 ? "win" : "loss";
    const d = h === "draw" ? "draw" : h === "win" ? "loss" : "win";
    for (const g of c) e.set(g.account_id, h);
    for (const g of o) e.set(g.account_id, d);
  }
  return e;
}
function Dr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function Qe() {
  return [
    v.resolve(process.cwd(), "data/league-stats"),
    v.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function se() {
  var a;
  const t = (a = E.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return v.isAbsolute(t) ? t : v.resolve(process.cwd(), t);
  const e = E.LEAGUE_ID;
  for (const n of Qe())
    if (ra(v.join(n, `league_${e}_heroes.csv`)))
      return n;
  for (const n of Qe())
    if (ra(n)) return n;
  return Qe()[0];
}
function ga(t) {
  const e = se(), a = Le(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function fa(t, e) {
  const a = se(), n = Le(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [n.heroes, n.playerHeroes],
    statsStorage: e
  };
}
function Le(t) {
  const e = se();
  return {
    dir: e,
    heroes: v.join(e, `league_${t}_heroes.csv`),
    playerHeroes: v.join(e, `league_${t}_player_heroes.csv`),
    meta: v.join(e, `league_${t}_meta.json`)
  };
}
async function _e(t) {
  try {
    return await jn(t), !0;
  } catch {
    return !1;
  }
}
function Or(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function Ur(t) {
  const e = [];
  let a = "", n = !1;
  for (let r = 0; r < t.length; r++) {
    const i = t[r];
    n ? i === '"' ? t[r + 1] === '"' ? (a += '"', r++) : n = !1 : a += i : i === '"' ? n = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function ha(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(Ur);
}
function x(t, e, a = 0) {
  const n = Number(t[e]);
  return Number.isFinite(n) ? n : a;
}
function Me(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function $r(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, n = t.assists ?? 0;
  return !(e === 0 && a === 0 && n === 0 || (t.leaver_status ?? 0) >= 3);
}
function un(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function Gr(t) {
  return t.filter((e) => !un(e));
}
function dn(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || un(a)) continue;
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
async function Br(t) {
  const e = Le(t);
  if (!await _e(e.heroes))
    return null;
  try {
    const a = await Fe(e.heroes, "utf8"), n = ha(a);
    if (n.length < 2) return null;
    const r = {};
    for (const o of n.slice(1)) {
      const m = x(o, 0);
      m <= 0 || (r[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: x(o, 2),
        bans: x(o, 3),
        wins: x(o, 4),
        losses: x(o, 5),
        games: x(o, 6),
        pickRate: Me(o, 7),
        banRate: Me(o, 8),
        winRate: Me(o, 9),
        contestRate: Me(o, 10)
      });
    }
    let i = [];
    if (await _e(e.playerHeroes)) {
      const o = await Fe(e.playerHeroes, "utf8"), m = ha(o);
      for (const l of m.slice(1)) {
        const p = x(l, 0), h = x(l, 1);
        p <= 0 || h <= 0 || i.push({
          steam32: p,
          heroId: h,
          games: x(l, 2),
          wins: x(l, 3),
          kills: x(l, 4),
          deaths: x(l, 5),
          assists: x(l, 6),
          heroDamage: x(l, 7),
          goldPerMin: x(l, 8),
          lastHits: x(l, 9),
          maxKills: x(l, 10),
          laneWins: x(l, 11),
          laneDraws: x(l, 12),
          laneLosses: x(l, 13)
        });
      }
      i = Gr(i);
    }
    let c = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await _e(e.meta)) {
      const o = JSON.parse(await Fe(e.meta, "utf8"));
      c = { ...c, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: r, playerHeroes: i, meta: c };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function Kr(t) {
  const { leagueId: e } = t.meta, a = Le(e);
  await Ga(a.dir, { recursive: !0 });
  const r = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, l) => m.heroId - l.heroId
  ))
    r.push(
      [
        o.heroId,
        Or(o.heroName ?? ""),
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
  await je(a.heroes, `# BPC league hero stats — league ${e}
${r.join(`
`)}
`, "utf8");
  const c = ["steam32,heroId,games,wins,kills,deaths,assists,heroDamage,goldPerMin,lastHits,maxKills,laneWins,laneDraws,laneLosses"];
  for (const o of t.playerHeroes.sort(
    (m, l) => m.steam32 - l.steam32 || m.heroId - l.heroId
  ))
    c.push(
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
  return await je(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${c.join(`
`)}
`,
    "utf8"
  ), await je(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function Ae(t) {
  const e = Le(t), [a, n, r] = await Promise.all([
    _e(e.heroes),
    _e(e.playerHeroes),
    _e(e.meta)
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
const Wr = 4294967295;
function Vr(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= Wr))
    return e;
}
class qr {
  constructor() {
    M(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    M(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    M(this, "running", !1);
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
      let c = this.playerLeagueHeroes.get(i.steam32);
      c || (c = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(i.steam32, c)), c.set(i.heroId, {
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
    var i, c;
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
      await oe(a);
      const o = await xr(e, n), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && S.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const l = /* @__PURE__ */ new Map();
      let p = 0;
      for (let d = 0; d < m.length; d++) {
        const g = m[d];
        if (g === void 0) continue;
        S.info(
          { matchId: g, index: d + 1, total: m.length },
          "Aggregating league match"
        );
        let u = await a.matchDetails(g);
        (!u.ok || !((c = (i = u.data) == null ? void 0 : i.players) != null && c.length)) && (await a.requestMatchParse(g), u = await a.matchDetails(g)), u.ok && u.data && (u.data.leagueid != null && u.data.leagueid !== 0 && u.data.leagueid !== e ? S.warn(
          {
            matchId: g,
            expectedLeague: e,
            actualLeague: u.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(u.data, l), p += 1)), this.progress.matchDone = d + 1, this.progress.progress = Math.round(
          (d + 1) / Math.max(1, m.length) * 100
        ), r == null || r(this.getProgress());
      }
      if (p === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const h = {};
      for (const [d, g] of l) {
        const u = g.wins + g.losses, f = p > 0 ? g.picks / p : 0, y = p > 0 ? g.bans / p : 0, w = f + y, b = u > 0 ? g.wins / u : void 0;
        h[String(d)] = {
          heroId: d,
          heroName: ne(d),
          picks: g.picks,
          bans: g.bans,
          wins: g.wins,
          losses: g.losses,
          games: u,
          pickRate: f,
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
        heroIndex: h
      }, h;
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
    const n = e.radiant_win === !0, r = Fr(e.players);
    for (const i of this.resolvePickBans(e)) {
      const c = this.getAcc(a, i.hero_id);
      i.is_pick ? c.picks += 1 : c.bans += 1;
    }
    for (const i of e.players ?? []) {
      const c = Vr(i);
      if (c === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && n || i.player_slot !== void 0 && i.player_slot >= 128 && !n, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, $r(i) && this.trackPlayerHero(c, i.hero_id, o, i, r.get(c));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, n, r, i) {
    let c = this.playerLeagueHeroes.get(e);
    c || (c = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, c));
    const o = typeof r.kills == "number" ? r.kills : 0, m = typeof r.deaths == "number" ? r.deaths : 0, l = typeof r.assists == "number" ? r.assists : 0, p = typeof r.hero_damage == "number" ? r.hero_damage : 0, h = typeof r.gold_per_min == "number" ? r.gold_per_min : 0, d = typeof r.last_hits == "number" ? r.last_hits : 0, g = c.get(a) ?? {
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
    g.games += 1, n && (g.wins += 1), i === "win" ? g.laneWins += 1 : i === "draw" ? g.laneDraws += 1 : i === "loss" && (g.laneLosses += 1), g.kills += o, g.deaths += m, g.assists += l, g.heroDamage += p, g.goldPerMin += h, g.lastHits += d, o > g.maxKills && (g.maxKills = o), c.set(a, g);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = $n(e);
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
const q = new qr();
async function Yr(t) {
  const { leagueId: e, state: a, broadcast: n, source: r } = t, i = r === "csv" ? await Br(e) : null;
  if (!i) return !1;
  q.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const c = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: dn(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: r,
      statsCsvDir: se()
    }
  });
  return await n.broadcastFull(c), !0;
}
async function mt(t) {
  const e = await Yr({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: se() },
    "League stats loaded from CSV"
  ), e;
}
async function mn(t) {
  const { leagueId: e, state: a, opendota: n, broadcast: r } = t;
  if (q.isBusy()) {
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
    const c = await q.aggregateLeague(
      e,
      n,
      80,
      async (p) => {
        const h = await a.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: p.progress,
            aggregationMatchTotal: p.matchTotal,
            aggregationMatchDone: p.matchDone
          }
        });
        await r.broadcastFull(h);
      }
    ), o = q.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await Kr({
      heroIndex: c,
      playerHeroes: q.exportPlayerHeroRows(),
      meta: {
        leagueId: e,
        matchTotal: o.matchTotal,
        matchDone: o.matchDone,
        aggregatedAt: m,
        source: "api"
      }
    });
    const l = await a.patchState({
      tournamentHeroIndex: c,
      playerHeroIndex: dn(
        q.exportPlayerHeroRows()
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
        statsCsvDir: se()
      }
    });
    await r.broadcastFull(l), S.info(
      { leagueId: e, matches: o.matchTotal, dir: se() },
      "League aggregation ready — saved to CSV"
    );
  } catch (c) {
    const o = c instanceof Error ? c.message : String(c);
    S.error({ err: c, leagueId: e }, "League aggregation failed");
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
async function zr(t) {
  var d, g, u, f;
  const { state: e, opendota: a, broadcast: n } = t, r = E.LEAGUE_ID, i = await e.getState();
  if ((((d = i.leagueConfig) == null ? void 0 : d.leagueId) !== r || ((g = i.leagueConfig) == null ? void 0 : g.leagueId) === null || ((u = i.leagueConfig) == null ? void 0 : u.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: r, aggregationStatus: "idle" }
  }), await mt({
    leagueId: r,
    state: e,
    broadcast: n
  })) return;
  const l = ((f = (await e.getState()).leagueConfig) == null ? void 0 : f.aggregationStatus) === "ready", p = q.getProgress().status === "ready";
  E.LEAGUE_AUTO_AGGREGATE && (!l || !p) && q.getProgress().status !== "running" ? (S.info({ leagueId: r }, "Starting league aggregation (Steam match list + OpenDota details)"), mn({ leagueId: r, state: e, opendota: a, broadcast: n })) : S.info(
    { leagueId: r, dir: se() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function pa() {
  return {
    leagueId: E.LEAGUE_ID,
    autoAggregate: E.LEAGUE_AUTO_AGGREGATE,
    statsDir: se()
  };
}
class Oe extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function Jr(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && q.getProgress().status === "ready";
}
function be(t) {
  var a, n;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new Oe(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new Oe(
      ((n = t.leagueConfig) == null ? void 0 : n.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!Jr(t))
    throw new Oe(
      "League stats not ready — run tournament aggregate first"
    );
}
function gn(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function Xr(t) {
  var i;
  const e = t.split(/\r?\n/).map((c) => c.trim()).filter(Boolean);
  if (e.length === 0) return [];
  let a = 0;
  const n = ((i = e[0]) == null ? void 0 : i.toLowerCase()) ?? "";
  (n.includes("steam") || n.includes("display")) && (a = 1);
  const r = [];
  for (let c = a; c < e.length; c++) {
    const o = e[c];
    if (!o) continue;
    const m = o.split(",").map((f) => f.trim());
    if (m.length < 2) continue;
    const l = m[0] ?? "Player", p = Number(m[1]);
    if (!Number.isFinite(p)) continue;
    let h, d, g, u;
    if (m.length >= 4) {
      if (h = m[2] || void 0, d = m[3] || void 0, m.length >= 5) {
        const f = m[4] ?? "";
        f.startsWith("http://") || f.startsWith("https://") ? u = f : g = gn(f);
      }
      if (m.length >= 6) {
        const f = m[5] ?? "";
        (f.startsWith("http://") || f.startsWith("https://")) && (u = f);
      }
    } else m.length === 3 && (d = m[2] || void 0, h = d == null ? void 0 : d.replace(/_/g, " "));
    r.push({ displayName: l, steam32: p, teamName: h, teamKey: d, teamColor: g, avatarUrl: u });
  }
  return r;
}
function Qr(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function Zr(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (n) => [
      n.displayName,
      String(n.steam32),
      n.teamName ?? "",
      n.teamKey ?? "",
      n.teamColor ?? "",
      n.avatarUrl ?? ""
    ].map(Qr).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function ya(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function gt(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const n = a.teamKey ?? es(a.teamName ?? "unknown"), r = a.teamName ?? ts(n), i = e.get(n);
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
function ft(t, e) {
  return gt(t).find((a) => a.teamKey === e);
}
function Pe(t) {
  return Va(t);
}
function es(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function ts(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function ba(t, e, a) {
  return t && t.map((n) => {
    if (n.type !== "pick") return n;
    const r = Ye(a.matchSetup, e, n.order), i = Qn(a, e, n.order);
    if (r == null && !i) {
      const { playerName: c, steam32: o, ...m } = n;
      return m;
    }
    return {
      ...n,
      steam32: r ?? void 0,
      playerName: i
    };
  });
}
function as(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: ba(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: ba(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Sa(t, e, a) {
  var i, c, o, m;
  const n = ft(e, t.radiantTeamKey), r = ft(e, t.direTeamKey);
  if (!n || !r)
    throw new Error("One or both teams not found in roster");
  if (t.radiantTeamKey === t.direTeamKey)
    throw new Error("Radiant and dire must be different teams");
  return {
    series: {
      teamA: n.teamName,
      teamB: r.teamName,
      scoreA: t.scoreA ?? ((i = a == null ? void 0 : a.series) == null ? void 0 : i.scoreA) ?? 0,
      scoreB: t.scoreB ?? ((c = a == null ? void 0 : a.series) == null ? void 0 : c.scoreB) ?? 0,
      bestOf: t.seriesBestOf,
      gameNumber: t.seriesGame,
      logoUrlA: Pe(n.teamKey),
      logoUrlB: Pe(r.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: n.teamName,
      logoUrl: Pe(n.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: r.teamName,
      logoUrl: Pe(r.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const wa = /* @__PURE__ */ new Map();
async function fn(t, e) {
  var c, o, m;
  if (e <= 0) return;
  const a = wa.get(e);
  if (a) return a;
  const n = await t.playerProfile(e);
  if (!n.ok || !n.data) return;
  const r = n.data, i = ((c = r.profile) == null ? void 0 : c.avatarfull) ?? r.avatarfull ?? ((o = r.profile) == null ? void 0 : o.avatarmedium) ?? r.avatarmedium ?? ((m = r.profile) == null ? void 0 : m.avatar) ?? r.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return wa.set(e, i), i;
}
async function _a(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var n;
      if ((n = a.avatarUrl) != null && n.trim()) return a;
      try {
        const r = await fn(e, a.steam32);
        return r ? { ...a, avatarUrl: r } : a;
      } catch (r) {
        return S.warn({ err: r, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const ht = v.join(process.cwd(), "steam32-vanity-cache.json");
let fe = null;
function ns() {
  if (fe) return fe;
  try {
    if (R.existsSync(ht))
      return fe = JSON.parse(R.readFileSync(ht, "utf-8")), S.info({ count: Object.keys(fe).length }, "[steam32] Loaded vanity cache from disk"), fe;
  } catch {
  }
  return fe = {}, fe;
}
function rs(t) {
  try {
    R.writeFileSync(ht, JSON.stringify(t, null, 2));
  } catch (e) {
    S.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function ss(t, e) {
  return new Promise((a) => {
    const n = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    Ba.get(n, (r) => {
      if (r.statusCode !== 200) {
        a(null);
        return;
      }
      let i = "";
      r.on("data", (c) => {
        i += c;
      }), r.on("end", () => {
        var c;
        try {
          const o = JSON.parse(i);
          if (((c = o.response) == null ? void 0 : c.success) === 1 && o.response.steamid) {
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
async function os(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const n = t.match(/\/id\/([^/?#]+)/);
  if (n != null && n[1]) {
    const r = n[1].trim().toLowerCase(), i = ns();
    if (i[r] != null)
      return S.debug({ vanity: r, steam32: i[r] }, "[steam32] Cache hit"), i[r];
    if (!e)
      return S.warn({ vanity: r }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const c = await ss(r, e);
    return c != null && c > 0 ? (i[r] = c, rs(i), S.info({ vanity: r, steam32: c }, "[steam32] Resolved & cached vanity → steam32")) : S.warn({ vanity: r }, "[steam32] Steam API could not resolve vanity URL"), c;
  }
  return S.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function ye(t) {
  return new Promise((e, a) => {
    Ba.get(t, (n) => {
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
async function is(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await ye("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const c = await ye(`https://api.bpcleague.in/api/public/seasons/${e}`);
      c.snapshot && c.snapshot.teams ? a = c.snapshot.teams : c.tournament && c.tournament.teams ? a = c.tournament.teams : c.participations && (a = c.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (c) {
    throw S.error(c, "Failed to fetch season/tournament data from bpcleague.in"), c;
  }
  if (!a || a.length === 0)
    return S.warn("No teams found in bpcleague.in API response"), [];
  const n = [];
  for (const c of a) {
    const o = c.name.trim(), m = c.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), l = gn(c.accentColor) || "#ffffff";
    for (const p of c.players || [])
      n.push({ teamName: o, teamKey: m, teamColor: l, player: p });
  }
  S.info({ total: n.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const r = await Promise.all(
    n.map(
      ({ player: c }) => os(c.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let c = 0; c < n.length; c++) {
    const { teamName: o, teamKey: m, teamColor: l, player: p } = n[c], h = r[c], d = p.displayName || p.name || "Player", g = p.roles || [], u = p.mmr;
    h != null && h > 0 ? i.push({ displayName: d, steam32: h, teamName: o, teamKey: m, teamColor: l, roles: g, mmr: u }) : S.warn({ displayName: d, url: p.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return S.info({ count: i.length, total: n.length }, "Completed roster sync from bpcleague.in"), i;
}
async function ls(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let n;
    e === "latest" || e === "active" ? n = await ye("https://api.bpcleague.in/api/public/tournament") : n = await ye(`https://api.bpcleague.in/api/public/seasons/${e}`);
    let r = [];
    return n.snapshot && n.snapshot.matches || n.tournament && ((a = n.snapshot) != null && a.matches) ? r = n.snapshot.matches : n.tournament && n.tournament.matches ? r = n.tournament.matches : n.matches && (r = n.matches), r.map((i) => {
      var c, o, m;
      return {
        id: i.id,
        team1: i.team1,
        team2: i.team2,
        winner: i.winner || null,
        status: i.status || "pending",
        stageKey: i.stageKey || "",
        seriesType: ((c = i.meta) == null ? void 0 : c.seriesType) || "bo3",
        team1Score: ((o = i.meta) == null ? void 0 : o.team1Score) ?? 0,
        team2Score: ((m = i.meta) == null ? void 0 : m.team2Score) ?? 0
      };
    });
  } catch (n) {
    return S.error(n, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function cs() {
  S.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await ye("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return S.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function us(t) {
  const e = t.trim().toLowerCase();
  S.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await ye("https://api.bpcleague.in/api/public/tournament") : a = await ye(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return S.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
function Y(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function de(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function hn(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function Te(t, e) {
  return `${t}W / ${e}L`;
}
function Ke(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, n = t.laneLosses ?? 0;
  return e + a + n === 0 ? null : {
    label: "Lane",
    value: Dr(e, a, n),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function pn(t, e, a) {
  var r;
  const n = (r = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : r.avatarUrl;
  return n != null && n.trim() ? n : fn(t, e);
}
function ds(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : Te(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${Y(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${Y(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${Y(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? Y(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function ms(t, e, a, n) {
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
          sublabel: `${Y(n.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: Y(n.winRate),
          sublabel: Te(n.wins, n.losses)
        }
      ] : []
    ];
  const r = a.games - a.wins, i = `${de(a.avgKills)} / ${de(a.avgDeaths)} / ${de(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Te(a.wins, r),
      sublabel: `${Y(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: de(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: hn(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ke(a) ? [Ke(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...n ? [
      {
        label: "Hero in league",
        value: String(n.picks),
        sublabel: `${Y(n.pickRate)} pick · ${Y(n.winRate)} WR`
      }
    ] : []
  ];
}
function gs(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, n = `${de(e.avgKills)} / ${de(e.avgDeaths)} / ${de(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Te(e.wins, a),
      sublabel: `${Y(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: de(e.avgKda),
      sublabel: `${n} per game`
    },
    {
      label: "Hero damage",
      value: hn(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ke(e) ? [Ke(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function yn(t) {
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
async function ve(t, e, a) {
  await oe(t);
  const n = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, r = n.heroName ?? ne(e), i = re(e, r);
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
    statSlides: ds(n),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Re(t, e, a, n, r, i, c) {
  await oe(t);
  const o = Ya(
    c,
    e,
    a
  ), m = r[String(a)], l = ne(a), p = re(a, l), h = await pn(
    t,
    e,
    i
  );
  return {
    statsCardKind: "player-hero",
    steam32: e,
    playerLabel: n,
    heroId: a,
    heroName: l,
    ...p,
    playerAvatarUrl: h,
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
    playerHero: yn(o),
    statSlides: ms(n, l, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function fs(t, e) {
  return st(e, t);
}
async function bn(t, e, a, n, r) {
  await oe(t);
  const i = fs(e, n), c = await pn(
    t,
    e,
    r
  ), o = V(r ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: c,
    teamLogoUrl: Rr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: yn(i),
    statSlides: gs(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Sn(t, e, a) {
  await oe(t);
  const n = await t.matchupBetween(e, a), r = n.ok && n.data && typeof n.data == "object" ? n.data : {}, i = typeof r.games_played == "number" ? r.games_played : void 0, c = typeof r.wins == "number" ? r.wins : typeof r.win == "number" ? r.win : void 0, o = ne(e) || `Hero ${e}`, m = ne(a) || `Hero ${a}`, l = c ?? 0, p = i !== void 0 ? i - l : 0;
  let h = o, d = m, g = l, u = p;
  p > l && (h = m, d = o, g = p, u = l);
  const f = [
    {
      label: "Games Played",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: `${h} Won`,
      value: i !== void 0 ? String(g) : "—"
    },
    {
      label: `${d} Won`,
      value: i !== void 0 ? String(u) : "—"
    }
  ], y = re(e), w = re(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: ne(e),
    heroBName: ne(a),
    heroAPortraitSlug: y.heroPortraitSlug,
    heroBPortraitSlug: w.heroPortraitSlug,
    heroAPortraitUrl: y.heroPortraitUrl,
    heroBPortraitUrl: w.heroPortraitUrl,
    matchup: r,
    statLines: f,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: n.ok ? "opendota_cached" : "stale"
  };
}
function _t(t, e = 4e3) {
  var n, r, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: Y((n = t.tournament) == null ? void 0 : n.winRate),
      sublabel: t.tournament ? Te(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((r = t.tournament) == null ? void 0 : r.picks) ?? "—"),
      sublabel: Y((i = t.tournament) == null ? void 0 : i.pickRate)
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
async function hs(t) {
  return await oe(t), Tr();
}
class ps {
  constructor() {
    M(this, "timer", null);
    M(this, "state", null);
    M(this, "opendota", null);
    M(this, "broadcast", null);
    M(this, "config", {
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
    var e, a, n, r, i, c;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          S.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const l = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let p = m;
        l != null && l.radiantTeamKey && (l != null && l.direTeamKey) && (p = m.filter(
          (u) => u.teamKey === l.radiantTeamKey || u.teamKey === l.direTeamKey
        )), p.length === 0 && (p = m);
        const h = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], d = h[Math.floor(Math.random() * h.length)];
        S.info({ cardType: d }, "Autopilot: Triggering random stats card");
        const g = Date.now() + this.config.durationSeconds * 1e3;
        if (d === "player-league") {
          const u = p[Math.floor(Math.random() * p.length)], f = await bn(
            this.opendota,
            u.steam32,
            u.displayName,
            o.playerHeroIndex,
            m
          ), y = await this.state.patchState({
            heroStatsCard: f,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: g }
            }
          });
          await this.broadcast.broadcastFull(y), S.info({ player: u.displayName }, "Autopilot: Displayed player league stats");
        } else if (d === "player-hero") {
          const u = p[Math.floor(Math.random() * p.length)], f = o.playerHeroIndex ?? {}, y = `${u.steam32}:`, w = Object.keys(f).filter((A) => A.startsWith(y)).map((A) => Number(A.split(":")[1]));
          let b = 1;
          if (w.length > 0)
            b = w[Math.floor(Math.random() * w.length)];
          else {
            const A = Object.keys(o.tournamentHeroIndex ?? {});
            A.length > 0 && (b = Number(A[Math.floor(Math.random() * A.length)]));
          }
          const _ = await Re(
            this.opendota,
            u.steam32,
            b,
            u.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), k = _t(_, 4e3), I = await this.state.patchState({
            heroStatsCard: _,
            statCarousel: k,
            overlayVisibility: {
              herostats: { mode: "timed", until: g }
            }
          });
          await this.broadcast.broadcastFull(I), S.info({ player: u.displayName, heroId: b }, "Autopilot: Displayed player-hero stats carousel");
        } else if (d === "tournament-hero") {
          const u = Object.keys(o.tournamentHeroIndex ?? {});
          if (u.length === 0) return;
          const f = Number(u[Math.floor(Math.random() * u.length)]), y = await ve(
            this.opendota,
            f,
            o.tournamentHeroIndex ?? {}
          ), w = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: g }
            }
          });
          await this.broadcast.broadcastFull(w), S.info({ heroId: f }, "Autopilot: Displayed tournament hero stats");
        } else if (d === "matchup") {
          const u = [
            ...((r = (n = o.draft) == null ? void 0 : n.radiant) == null ? void 0 : r.slots) ?? [],
            ...((c = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : c.slots) ?? []
          ].filter((_) => _.heroId && _.heroId > 0);
          let f = 1, y = 2;
          if (u.length >= 2) {
            const _ = u[Math.floor(Math.random() * u.length)];
            let k = u[Math.floor(Math.random() * u.length)];
            for (; k.heroId === _.heroId && u.length > 1; )
              k = u[Math.floor(Math.random() * u.length)];
            f = _.heroId, y = k.heroId;
          } else {
            const _ = Object.keys(o.tournamentHeroIndex ?? {});
            if (_.length >= 2)
              for (f = Number(_[Math.floor(Math.random() * _.length)]), y = Number(_[Math.floor(Math.random() * _.length)]); y === f; )
                y = Number(_[Math.floor(Math.random() * _.length)]);
          }
          const w = await Sn(this.opendota, f, y), b = await this.state.patchState({
            matchupCard: w,
            overlayVisibility: {
              matchup: { mode: "timed", until: g }
            }
          });
          await this.broadcast.broadcastFull(b), S.info({ heroA: f, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        S.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const he = new ps();
function xe(t, e) {
  return e instanceof Oe ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function ys(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  he.configure({}, { state: a, opendota: r, broadcast: n }), e.get("/api/league/info", C, async (c, o) => {
    var p;
    const m = await a.getState(), l = await Ae(E.LEAGUE_ID);
    o.json({
      ...pa(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: l,
      steamApiConfigured: !!E.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((p = E.LEAGUE_MATCH_IDS) != null && p.trim())
    });
  }), e.post("/api/league/config", C, async (c, o) => {
    const l = s.object({ leagueId: s.number() }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    const p = await a.getState(), h = await a.patchState({
      leagueConfig: { ...p.leagueConfig, leagueId: l.data.leagueId }
    });
    await n.broadcastFull(h), o.json({ ok: !0, leagueConfig: h.leagueConfig });
  }), e.post("/api/league/aggregate", C, async (c, o) => {
    var l, p, h;
    if (q.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const m = await a.getState();
    ((l = m.leagueConfig) == null ? void 0 : l.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: E.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), mn({
      leagueId: ((p = m.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID,
      state: a,
      opendota: r,
      broadcast: n
    }), o.json({ ok: !0, started: !0, leagueId: ((h = m.leagueConfig) == null ? void 0 : h.leagueId) ?? E.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    C,
    async (c, o) => {
      var h;
      const m = (h = (await a.getState()).leagueConfig) == null ? void 0 : h.leagueId;
      if (!await mt({
        leagueId: m ?? E.LEAGUE_ID,
        state: a,
        broadcast: n
      })) {
        const d = await Ae(m ?? E.LEAGUE_ID), g = d.heroesExists ? fa(m ?? E.LEAGUE_ID, d) : { ...ga(m ?? E.LEAGUE_ID), statsStorage: d };
        return o.status(422).json(g);
      }
      const p = await a.getState();
      o.json({ ok: !0, leagueConfig: p.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    C,
    async (c, o) => {
      var p, h;
      const m = await Ae(E.LEAGUE_ID), l = await a.getState();
      o.json({
        ...m,
        statsDir: pa().statsDir,
        aggregationSource: (p = l.leagueConfig) == null ? void 0 : p.aggregationSource,
        aggregatedAt: (h = l.leagueConfig) == null ? void 0 : h.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    C,
    async (c, o) => {
      const m = q.getProgress(), l = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: q.isBusy(),
        leagueId: E.LEAGUE_ID,
        leagueConfig: l.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", C, async (c, o) => {
    const l = s.object({ csv: s.string().min(1) }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = Xr(l.data.csv), h = await _a(p, r), d = ya(h), g = await a.patchState({
      leagueConfig: { roster: h, teamColors: d, leagueId: E.LEAGUE_ID }
    });
    await n.broadcastFull(g), o.json({ ok: !0, count: h.length, teamColors: d, roster: h });
  }), e.post("/api/roster/sync-bpcleague", C, async (c, o) => {
    var p, h;
    const l = s.object({ seasonSlug: s.string().optional() }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    try {
      const d = l.data.seasonSlug || "season-1", g = await is({
        seasonSlug: d,
        steamApiKey: E.STEAM_WEB_API_KEY
      }), u = await _a(g, r), f = ya(u), y = E.ROSTER_CSV_PATH;
      await Ga(v.dirname(y), { recursive: !0 });
      const w = Zr(u);
      await je(y, w, "utf8");
      const b = await us(d);
      let _ = [];
      b && b.sponsorsConfig && Array.isArray(b.sponsorsConfig.sponsors) && (_ = b.sponsorsConfig.sponsors.map((A) => ({
        title: A.title || A.name || "",
        subtitle: A.subtitle || "",
        imageUrl: A.imageUrl || A.logoUrl || A.logo || "",
        color: A.color || "#ffffff",
        isCoSponsor: A.isCoSponsor || !1
      }))), _.length === 0 && (_ = [
        { title: "BPC", subtitle: "Gaming", isCoSponsor: !0, color: "#ffffff", imageUrl: "" },
        { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: !1, color: "#ff0000", imageUrl: "" }
      ]);
      const k = await a.getState(), I = await a.patchState({
        leagueConfig: { roster: u, teamColors: f, leagueId: ((p = k.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID, seasonSlug: d },
        sponsor: { banners: _, activeIndex: ((h = k.sponsor) == null ? void 0 : h.activeIndex) ?? 0 }
      });
      await n.broadcastFull(I), o.json({ ok: !0, count: u.length, teamColors: f, roster: u });
    } catch (d) {
      o.status(500).json({
        error: d instanceof Error ? d.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", C, async (c, o) => {
    var l;
    const m = await a.getState();
    o.json(((l = m.leagueConfig) == null ? void 0 : l.roster) ?? []);
  }), e.get("/api/teams", C, async (c, o) => {
    var p;
    const l = ((p = (await a.getState()).leagueConfig) == null ? void 0 : p.roster) ?? [];
    o.json(gt(l));
  }), e.post("/api/match/setup", C, async (c, o) => {
    var g, u;
    const m = Xa.safeParse(c.body);
    if (!m.success)
      return o.status(400).json({ error: m.error.flatten() });
    const l = await a.getState(), p = ((g = l.leagueConfig) == null ? void 0 : g.roster) ?? [];
    if (p.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: h, seriesGame: d } = m.data;
    if (d > h)
      return o.status(400).json({
        error: `Game ${d} is invalid for a BO${h} series`
      });
    try {
      const f = { ...m.data }, y = (u = l.leagueConfig) == null ? void 0 : u.matchSetup;
      !f.previousDrafts && (y != null && y.previousDrafts) && (f.previousDrafts = [...y.previousDrafts]), y && f.seriesGame > y.seriesGame && l.draft && (f.previousDrafts = f.previousDrafts ?? [], f.previousDrafts.push(l.draft)), f.seriesGame === 1 && (f.previousDrafts = []);
      const w = Sa(
        f,
        p,
        l.draft
      ), b = await a.patchState({
        leagueConfig: { matchSetup: f },
        draft: w,
        production: {
          playerMappingPublished: !1
        }
      });
      await n.broadcastFull(b), o.json({
        ok: !0,
        matchSetup: f,
        teams: gt(p),
        draft: b.draft
      });
    } catch (f) {
      o.status(400).json({
        error: f instanceof Error ? f.message : String(f)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    C,
    async (c, o) => {
      var k, I, A;
      const m = await a.getState(), l = ((k = m.leagueConfig) == null ? void 0 : k.roster) ?? [];
      if (l.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const p = ((I = m.leagueConfig) == null ? void 0 : I.leagueId) ?? E.LEAGUE_ID, h = await Ae(p);
      if (!await mt({
        leagueId: p,
        state: a,
        broadcast: n
      })) {
        const H = h.heroesExists ? fa(p, h) : { ...ga(p), statsStorage: h };
        return o.status(422).json(H);
      }
      const g = await a.getState(), u = g.playerHeroIndex ?? {}, f = Object.keys(u).length, y = [];
      for (const H of l) {
        const L = `${H.steam32}:`;
        Object.keys(u).some((O) => O.startsWith(L)) || y.push(H.steam32);
      }
      const w = new Set(
        Object.keys(u).map((H) => Number(H.split(":")[0]))
      ), b = (A = l[0]) == null ? void 0 : A.steam32, _ = b != null ? rt(u, b).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: l.length,
        csvPlayerCount: w.size,
        indexKeyCount: f,
        matchedRosterCount: l.length - y.length,
        missingSteam32: y,
        statsStorage: h,
        indexEmpty: f === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: _,
        leagueConfig: g.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    C,
    async (c, o) => {
      var b, _;
      const m = Number(c.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const l = await a.getState(), p = l.playerHeroIndex ?? {}, h = `${m}:`, d = Object.entries(p).filter(([k]) => k.startsWith(h)).map(([k, I]) => ({
        heroId: Number(k.split(":")[1]),
        games: I.games,
        wins: I.wins
      })), g = rt(p, m), u = ((b = l.leagueConfig) == null ? void 0 : b.leagueId) ?? E.LEAGUE_ID, f = await Ae(u);
      let y = [];
      try {
        y = (await Fe(f.playerHeroesPath, "utf8")).split(/\r?\n/).filter((I) => I.startsWith(`${m},`));
      } catch {
        y = [];
      }
      const w = y.reduce(
        (k, I) => k + (Number(I.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: u,
        gamesInIndex: g.games,
        winsInIndex: g.wins,
        heroRows: d,
        csvRowCount: y.length,
        csvGamesSum: w,
        aggregationMatchTotal: (_ = l.leagueConfig) == null ? void 0 : _.aggregationMatchTotal,
        hint: g.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : g.games < w ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    C,
    async (c, o) => {
      var b, _, k, I, A;
      const m = s.object({ pickPlayers: Ja.optional() }).safeParse(c.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const l = await a.getState(), p = (b = l.leagueConfig) == null ? void 0 : b.matchSetup, h = ((_ = l.leagueConfig) == null ? void 0 : _.roster) ?? [], d = l.draft;
      if (!p)
        return o.status(400).json({ error: "save match setup first" });
      if (!d)
        return o.status(400).json({ error: "no draft state" });
      if (d.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const g = m.data.pickPlayers, u = g ? {
        ...p,
        pickPlayers: {
          radiant: g.radiant ?? ((k = p.pickPlayers) == null ? void 0 : k.radiant),
          dire: g.dire ?? ((I = p.pickPlayers) == null ? void 0 : I.dire)
        }
      } : p, f = {
        ...l.leagueConfig,
        roster: h,
        matchSetup: u
      }, y = as(d, f), w = await a.patchState({
        leagueConfig: { matchSetup: u },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await n.broadcastFull(w), o.json({
        ok: !0,
        matchSetup: (A = w.leagueConfig) == null ? void 0 : A.matchSetup,
        draft: w.draft,
        production: w.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    C,
    async (c, o) => {
      var u, f, y;
      const m = await a.getState(), l = ((u = m.leagueConfig) == null ? void 0 : u.roster) ?? [], p = (f = m.leagueConfig) == null ? void 0 : f.matchSetup, h = (((y = m.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let d = null;
      p && l.length > 0 && (d = Sa(
        p,
        l,
        null
      ));
      const g = await a.patchState({
        draft: d,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: h
        }
      });
      await n.broadcastFull(g), o.json({
        ok: !0,
        overlayDraftEpoch: h,
        draft: g.draft
      });
    }
  ), e.post("/api/league/team-colors", C, async (c, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", C, async (c, o) => {
    const m = await hs(r);
    o.json(m);
  }), e.post("/api/stats/player-hero", C, async (c, o) => {
    var u;
    const l = s.object({
      steam32: s.number(),
      heroId: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = await a.getState();
    try {
      be(p);
    } catch (f) {
      if (xe(o, f)) return;
      throw f;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], d = V(h, l.data.steam32) ?? {
      steam32: l.data.steam32,
      displayName: l.data.displayName ?? `Player ${l.data.steam32}`
    }, g = await Re(
      r,
      l.data.steam32,
      l.data.heroId,
      d.displayName,
      p.tournamentHeroIndex ?? {},
      h,
      p.playerHeroIndex
    );
    if (l.data.persist) {
      const f = await a.patchState({
        heroStatsCard: g,
        statCarousel: null
      });
      return await n.broadcastFull(f), o.json({ ok: !0, card: g, persisted: f });
    }
    o.json({ ok: !0, card: g });
  }), e.post("/api/stats/player-league", C, async (c, o) => {
    var u;
    const l = s.object({
      steam32: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = await a.getState();
    try {
      be(p);
    } catch (f) {
      if (xe(o, f)) return;
      throw f;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], d = V(h, l.data.steam32) ?? {
      steam32: l.data.steam32,
      displayName: l.data.displayName ?? `Player ${l.data.steam32}`
    }, g = await bn(
      r,
      l.data.steam32,
      d.displayName,
      p.playerHeroIndex,
      h
    );
    if (l.data.persist) {
      const f = await a.patchState({
        heroStatsCard: g,
        statCarousel: null
      });
      return await n.broadcastFull(f), o.json({ ok: !0, card: g, persisted: f });
    }
    o.json({ ok: !0, card: g });
  }), e.post(
    "/api/stats/tournament-hero",
    C,
    async (c, o) => {
      const l = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(c.body);
      if (!l.success)
        return o.status(400).json({ error: l.error.flatten() });
      const p = await a.getState();
      try {
        be(p);
      } catch (d) {
        if (xe(o, d)) return;
        throw d;
      }
      const h = await ve(
        r,
        l.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
      if (l.data.persist) {
        const d = await a.patchState({
          heroStatsCard: h,
          statCarousel: null
        });
        return await n.broadcastFull(d), o.json({ ok: !0, card: h, persisted: d });
      }
      o.json({ ok: !0, card: h });
    }
  ), e.post("/api/stats/matchup", C, async (c, o) => {
    const l = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    await a.getState();
    const p = await Sn(
      r,
      l.data.heroAId,
      l.data.heroBId
    );
    if (l.data.persist) {
      const h = await a.patchState({ matchupCard: p });
      return await n.broadcastFull(h), o.json({ ok: !0, card: p, persisted: h });
    }
    o.json({ ok: !0, card: p });
  }), e.post("/api/producer/h2h", C, async (c, o) => {
    var w;
    const l = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    const p = await a.getState(), h = ((w = p.leagueConfig) == null ? void 0 : w.roster) ?? [], d = V(h, l.data.player1Steam32), g = V(h, l.data.player2Steam32);
    if (!d || !g)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      be(p);
    } catch (b) {
      return o.status(503).json({ error: b.message });
    }
    const u = st(p.playerHeroIndex, l.data.player1Steam32), f = st(p.playerHeroIndex, l.data.player2Steam32), y = {
      player1: { ...d, stats: u },
      player2: { ...g, stats: f }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", C, async (c, o) => {
    var f, y, w, b, _, k, I;
    const l = s.object({
      type: s.enum(["player-hero", "tournament-hero", "last-pick"]),
      heroId: s.number().optional(),
      steam32: s.number().optional(),
      slideDurationMs: s.number().optional(),
      overlaySeconds: s.number().optional(),
      persist: s.boolean().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = await a.getState();
    try {
      be(p);
    } catch (A) {
      if (xe(o, A)) return;
      throw A;
    }
    const h = ((f = p.leagueConfig) == null ? void 0 : f.roster) ?? [];
    let d;
    if (l.data.type === "last-pick") {
      const A = (y = p.draft) == null ? void 0 : y.lastPick;
      if (!A) return o.status(400).json({ error: "no last pick" });
      const H = A.side === "dire" || A.side === "B" ? "dire" : "radiant", L = H === "radiant" ? (b = (w = p.draft) == null ? void 0 : w.radiant) == null ? void 0 : b.slots : (k = (_ = p.draft) == null ? void 0 : _.dire) == null ? void 0 : k.slots, G = qa(H, A.heroId, L), O = G !== void 0 ? Ye((I = p.leagueConfig) == null ? void 0 : I.matchSetup, H, G) : void 0, z = O != null && O > 0 ? V(h, O) : void 0;
      d = z && O ? await Re(
        r,
        O,
        A.heroId,
        z.displayName,
        p.tournamentHeroIndex ?? {},
        h,
        p.playerHeroIndex
      ) : await ve(
        r,
        A.heroId,
        p.tournamentHeroIndex ?? {}
      );
    } else if (l.data.type === "player-hero") {
      if (l.data.heroId === void 0 || l.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const A = V(h, l.data.steam32);
      d = await Re(
        r,
        l.data.steam32,
        l.data.heroId,
        (A == null ? void 0 : A.displayName) ?? "Player",
        p.tournamentHeroIndex ?? {},
        h,
        p.playerHeroIndex
      );
    } else {
      if (l.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      d = await ve(
        r,
        l.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
    }
    const g = _t(
      d,
      l.data.slideDurationMs ?? 4e3
    ), u = Date.now() + (l.data.overlaySeconds ?? 12) * 1e3;
    if (l.data.persist !== !1) {
      const A = await a.patchState({
        heroStatsCard: d,
        statCarousel: g,
        overlayVisibility: {
          herostats: { mode: "timed", until: u }
        }
      });
      return await n.broadcastFull(A), o.json({ ok: !0, card: d, carousel: g, persisted: A });
    }
    o.json({ ok: !0, card: d, carousel: g });
  }), e.post("/api/stats/stop", C, async (c, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await n.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", C, async (c, o) => {
    const l = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = await a.patchState({ production: l.data });
    await n.broadcastFull(p), o.json(p.production);
  }), e.get("/api/league/bpc-matches", C, async (c, o) => {
    const m = c.query.seasonSlug, l = await ls(m);
    o.json(l);
  }), e.get("/api/league/bpc-seasons", C, async (c, o) => {
    const m = await cs();
    o.json(m);
  }), e.get("/api/autopilot/config", C, (c, o) => {
    o.json({
      config: he.getConfig(),
      isActive: he.isActive()
    });
  }), e.post("/api/autopilot/config", C, (c, o) => {
    const l = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    he.configure(l.data), o.json({
      config: he.getConfig(),
      isActive: he.isActive()
    });
  }), e.post("/api/autopilot/trigger", C, async (c, o) => {
    await he.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const bs = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function N(t) {
  return t && typeof t == "object" ? t : null;
}
function pt(t) {
  const e = N(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function Ue(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const ka = /* @__PURE__ */ new Set();
function Ss() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function ws(t, e, a, n) {
  Ss() && (ka.has(t) || (ka.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: n.slug,
    source: n.source
  })));
}
function _s(t, e, a, n) {
  const r = Be({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  n && ws(n, t, e, r);
  const i = r.slug ?? Er({ heroId: t, heroClass: e });
  if (i)
    return { ...zn(i), slug: i };
  if (t) {
    const c = vr(t, a);
    if (c)
      return {
        staticUrl: c,
        staticFallbackUrl: c,
        slug: Be({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Ia(t, e) {
  if (t) return ne(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function Ca(t, e, a) {
  const n = `${e}${a}`, r = U(t[`${n}_id`]), i = Ue(t[`${n}_class`]);
  if (!r && !i)
    return null;
  const c = {};
  return r > 0 && (c.hero_id = r), i && (c.class = i), c;
}
function Aa(t, e) {
  var i;
  const a = [], n = /* @__PURE__ */ new Set(), r = (c, o, m, l) => {
    const p = `${c}-${o}`;
    if (n.has(p) || (n.add(p), !m && !l)) return;
    const h = _s(
      m,
      l,
      Ia(m, l),
      `${e}-${c}${o}`
    );
    a.push({
      order: o,
      type: c,
      heroId: m,
      heroName: Ia(m, l),
      heroPortraitSlug: h.slug,
      heroPortraitUrl: h.staticUrl,
      heroPortraitAnimatedUrl: h.animatedUrl
    });
  };
  for (const [c, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(c);
    if (!m) continue;
    const l = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", p = Number(m[2]), h = pt(o), d = N(o), g = Ue((d == null ? void 0 : d.class) ?? (d == null ? void 0 : d.hero_class));
    r(l, p, h, g);
  }
  for (let c = 0; c < 7; c++) {
    const o = Ca(t, "ban", c);
    o && r(
      "ban",
      c,
      U(o.hero_id) > 0 ? U(o.hero_id) : null,
      Ue(o.class)
    );
  }
  for (let c = 0; c < 5; c++) {
    const o = Ca(t, "pick", c);
    o && r(
      "pick",
      c,
      U(o.hero_id) > 0 ? U(o.hero_id) : null,
      Ue(o.class)
    );
  }
  return a.sort((c, o) => c.order - o.order), a;
}
function Ea(t, e) {
  return (e === "radiant" ? N(t.radiant) ?? N(t.team2) : N(t.dire) ?? N(t.team3)) ?? {};
}
function ks(t) {
  const e = t.activeteam ?? t.active_team;
  return e === 2 || e === "2" || e === "radiant" ? "radiant" : e === 3 || e === "3" || e === "dire" ? "dire" : null;
}
function U(t) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const e = Number(t);
    if (Number.isFinite(e)) return e;
  }
  return 0;
}
function Is(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function Cs(t, e) {
  const a = N(t.team2), n = N(t.team3), r = U(t.radiant_bonus_time) || U(a == null ? void 0 : a.bonus_time), i = U(t.dire_bonus_time) || U(n == null ? void 0 : n.bonus_time);
  return e === "radiant" ? r : e === "dire" ? i : Math.max(r, i);
}
const Pa = 7, va = 5;
function me(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function We(t, e) {
  return me(t, "pick") >= va && me(e, "pick") >= va;
}
function yt(t, e) {
  return me(t, "ban") > 0 || me(e, "ban") > 0 || me(t, "pick") > 0 || me(e, "pick") > 0;
}
function As(t, e, a) {
  const n = U(t == null ? void 0 : t.clock_time), r = U(
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
function Es(t, e, a, n, r) {
  if (!t || We(a, n))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !yt(a, n) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !yt(a, n) && !r)
    return "starting";
  const i = me(a, "ban"), c = me(n, "ban");
  return i < Pa || c < Pa ? "bans" : "picks";
}
function Ra(t) {
  const e = N(t);
  if (!e) return null;
  const a = N(e.hero);
  if (a) {
    const n = pt(a);
    if (n) return n;
  }
  return pt(t);
}
function Ps(t, e) {
  const a = /* @__PURE__ */ new Map(), n = N(t.player), r = N(t.hero), i = e === "radiant" ? N(r == null ? void 0 : r.team2) ?? N(r == null ? void 0 : r.radiant) : N(r == null ? void 0 : r.team3) ?? N(r == null ? void 0 : r.dire), c = e === "radiant" ? N(n == null ? void 0 : n.team2) ?? N(n == null ? void 0 : n.radiant) : N(n == null ? void 0 : n.team3) ?? N(n == null ? void 0 : n.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const l = /^player(\d+)$/i.exec(o);
      if (!l) continue;
      const p = Number(l[1]) % 5, h = Ra(m);
      if (h && h > 0 && Number.isFinite(p)) {
        let d;
        if (c) {
          const g = N(c[o]);
          if (g != null && g.accountid) {
            const u = parseInt(String(g.accountid), 10);
            Number.isFinite(u) && u > 0 && (d = u);
          }
        }
        a.set(p, { heroId: h, steam32: d });
      }
    }
  if (c)
    for (const [o, m] of Object.entries(c)) {
      const l = /^player(\d+)$/i.exec(o);
      if (!l) continue;
      const p = Number(l[1]) % 5, h = a.get(p);
      if (h != null && h.heroId) continue;
      const d = Ra(m);
      if (d && d > 0 && Number.isFinite(p)) {
        const g = N(m);
        let u;
        if (g != null && g.accountid) {
          const f = parseInt(String(g.accountid), 10);
          Number.isFinite(f) && f > 0 && (u = f);
        }
        a.set(p, { heroId: d, steam32: u });
      }
    }
  return a;
}
function Ta(t, e, a) {
  const n = Array.from(Ps(a, e).values());
  return t.map((r) => {
    if (r.type !== "pick" || !r.heroId) return r;
    const i = n.find((c) => c.heroId === r.heroId);
    return i ? {
      ...r,
      steam32: i.steam32 ?? r.steam32
    } : r;
  });
}
const vs = [
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
], Rs = [
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
function La(t, e, a) {
  const r = (a === "dire_first_pick" ? Rs : vs).findIndex((i) => i.side === t && i.order === e);
  return r >= 0 ? r : e;
}
function Na(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function Ze(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function Ma(t, e) {
  let a = t[0], n = La(a.side, a.slot.order, e);
  for (const r of t.slice(1)) {
    const i = La(r.side, r.slot.order, e);
    i > n && (a = r, n = i);
  }
  return a;
}
function Ts(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function Ls(t, e, a) {
  var m, l, p, h;
  const n = [];
  for (const d of t)
    d.type === "pick" && d.heroId && n.push({ side: "radiant", slot: d });
  for (const d of e)
    d.type === "pick" && d.heroId && n.push({ side: "dire", slot: d });
  if (n.length === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const d of ["radiant", "dire"]) {
    const g = d === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (l = a == null ? void 0 : a.dire) == null ? void 0 : l.slots;
    for (const u of g ?? []) {
      const f = Na(d, u);
      f && r.add(f);
    }
  }
  const i = n.filter(
    ({ side: d, slot: g }) => !r.has(Na(d, g))
  ), c = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (We(t, e) && a && !We(((p = a.radiant) == null ? void 0 : p.slots) ?? [], ((h = a.dire) == null ? void 0 : h.slots) ?? [])) {
      const d = Ma(n, c), g = Ze(d.side, d.slot);
      if (Ts(a.lastPick, g)) return g;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const d = i[0];
    return Ze(d.side, d.slot);
  }
  const o = Ma(i, c);
  return Ze(o.side, o.slot);
}
function xa(t, e, a, n, r) {
  var o, m;
  if (!t)
    return {
      name: n,
      logoUrl: e === "radiant" ? ((o = r == null ? void 0 : r.radiant) == null ? void 0 : o.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlA) : ((m = r == null ? void 0 : r.dire) == null ? void 0 : m.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, c = ft(a, i);
  return c ? {
    name: c.teamName,
    logoUrl: Pe(c.teamKey)
  } : { name: n };
}
function Ns(t, e, a, n) {
  var z, $;
  const r = N(t.map), i = typeof (r == null ? void 0 : r.game_state) == "string" ? r.game_state : "", c = bs.has(i), o = N(t.draft);
  if (!o && !c)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (r == null ? void 0 : r.team_name_radiant) == "string" ? r.team_name_radiant : "Radiant", l = typeof (r == null ? void 0 : r.team_name_dire) == "string" ? r.team_name_dire : "Dire", p = xa(
    n,
    "radiant",
    a,
    m,
    e
  ), h = xa(
    n,
    "dire",
    a,
    l,
    e
  ), d = o ?? {}, g = Ea(d, "radiant"), u = Ea(d, "dire");
  let f = Aa(g, "radiant"), y = Aa(u, "dire");
  We(f, y) && (f = Ta(f, "radiant", t), y = Ta(y, "dire", t));
  const b = o ? ks(d) : null, _ = U(
    d.activeteam_time_remaining ?? d.active_team_time_remaining
  ), k = o ? Is(d) : void 0, I = o ? Cs(d, b) : 0, A = [
    ...f.map((F) => ({
      team: "A",
      heroId: F.heroId,
      player: F.playerName,
      isBan: F.type === "ban",
      order: F.order,
      heroName: F.heroName,
      heroPortraitUrl: F.heroPortraitUrl
    })),
    ...y.map((F) => ({
      team: "B",
      heroId: F.heroId,
      player: F.playerName,
      isBan: F.type === "ban",
      order: F.order,
      heroName: F.heroName,
      heroPortraitUrl: F.heroPortraitUrl
    }))
  ], H = Ls(f, y, e), L = Es(
    c,
    i,
    f,
    y,
    b
  );
  let G = As(r, i, d);
  L === "starting" && G === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? G = e.startSecondsRemaining : _ > 0 && !yt(f, y) && (G = _));
  const O = {
    source: "gsi",
    phase: L,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(I)),
    activeTeam: L === "starting" ? null : b,
    turnAction: L === "starting" ? void 0 : k,
    startSecondsRemaining: L === "starting" ? Math.max(
      0,
      Math.round(
        G ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: L === "starting" ? void 0 : Math.max(0, Math.round(_)),
    series: {
      teamA: p.name,
      teamB: h.name,
      scoreA: (e == null ? void 0 : e.series.scoreA) ?? 0,
      scoreB: (e == null ? void 0 : e.series.scoreB) ?? 0,
      bestOf: e == null ? void 0 : e.series.bestOf,
      gameNumber: e == null ? void 0 : e.series.gameNumber,
      logoUrlA: p.logoUrl ?? (e == null ? void 0 : e.series.logoUrlA),
      logoUrlB: h.logoUrl ?? (e == null ? void 0 : e.series.logoUrlB)
    },
    radiant: {
      name: p.name,
      logoUrl: p.logoUrl,
      slots: f,
      bonusTime: Math.max(0, Math.round(U(d.radiant_bonus_time) || U((z = N(d.team2)) == null ? void 0 : z.bonus_time) || 0))
    },
    dire: {
      name: h.name,
      logoUrl: h.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(U(d.dire_bonus_time) || U(($ = N(d.team3)) == null ? void 0 : $.bonus_time) || 0))
    },
    picksBansOrder: A,
    lastPick: H
  };
  return { inDraft: c || !!o, draftPatch: O };
}
const Ve = {};
let Ha = !1;
async function Ms() {
  if (Ha) return;
  Ha = !0;
  const t = Object.keys(bt).map((e) => e.replace("item_", ""));
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
          const c = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          r[c] || (r[c] = { sum: 0, totalGames: 0 }), r[c].sum += o * m, r[c].totalGames += m;
        }
        Ve[e] = {};
        for (const [i, c] of Object.entries(r))
          c.totalGames > 0 && (Ve[e][Number(i)] = Math.round(c.sum / c.totalGames));
        S.debug({ item: e, heroesIndexed: Object.keys(r).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        S.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    S.info("Finished preloading average item timings.");
  })();
}
function xs(t, e) {
  const a = e.replace("item_", "");
  return Ve[a] ? Ve[a][t] ?? null : null;
}
const et = /* @__PURE__ */ new Map(), bt = {
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
function Hs(t, e, a) {
  var n, r;
  try {
    return ((r = (n = t == null ? void 0 : t.items) == null ? void 0 : n[e]) == null ? void 0 : r[a]) || {};
  } catch {
    return {};
  }
}
function js(t, e, a) {
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
function Fs(t, e, a) {
  var n, r, i;
  try {
    return ((i = (r = (n = t == null ? void 0 : t.player) == null ? void 0 : n[e]) == null ? void 0 : r[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function Ds(t, e) {
  var r;
  if (!(t != null && t.items)) return;
  const a = ((r = t == null ? void 0 : t.map) == null ? void 0 : r.clock_time) || 0;
  if (a < 0) return;
  const n = (i) => {
    var c;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, l = Hs(t, i, m), p = Fs(t, i, m);
      if (!p || p === "Unknown Player") continue;
      et.has(p) || et.set(p, /* @__PURE__ */ new Set());
      const h = et.get(p), d = /* @__PURE__ */ new Set();
      for (const g in l) {
        const u = (c = l[g]) == null ? void 0 : c.name;
        u && u !== "empty" && d.add(u);
      }
      for (const g of d)
        if (!h.has(g) && (h.add(g), bt[g])) {
          const u = js(t, i, m), f = u.id > 0 ? ne(u.id) : u.name, y = bt[g], w = xs(u.id, g);
          let b = null;
          w !== null && a > 0 && (b = a - w), S.info({ playerName: p, cleanHeroName: f, item: g, hypeData: y, clockTime: a, averageTime: w, timingDiff: b }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: p,
            heroName: f,
            item: g,
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
const qe = {
  74: 6,
  // Invoker
  114: 6,
  // Monkey King
  95: 6,
  // Troll Warlord
  91: 6,
  // IO
  92: 6,
  // Visage
  11: 6
  // Shadow Fiend
}, Os = /* @__PURE__ */ new Set([
  69,
  // Doom
  86,
  // Rubick
  131
  // Ringmaster
]), Us = /* @__PURE__ */ new Set([
  51,
  23,
  84,
  100,
  56,
  123,
  82,
  44,
  46,
  109,
  58,
  90,
  79,
  22,
  128,
  107
]), $s = /* @__PURE__ */ new Set([
  84,
  100,
  83,
  56,
  123,
  82,
  44,
  46,
  109,
  87,
  58,
  31,
  111,
  79,
  27,
  22
]);
function Gs(t, e, a, n) {
  if (e && qe[e] !== void 0)
    return qe[e];
  if (e && Os.has(e))
    return t;
  const r = a && e !== null && $s.has(e), i = n && e !== null && Us.has(e);
  return r || i ? Math.min(t, 6) : Math.min(t, 5);
}
function ja(t, e, a, n) {
  if (e && qe[e] !== void 0)
    return qe[e];
  if (!t || typeof t != "object") return 0;
  let r = 0;
  for (const [i, c] of Object.entries(t))
    if (i.startsWith("ability") && typeof c == "object" && c !== null) {
      const o = c;
      o.hidden !== !0 && typeof o.name == "string" && !o.name.startsWith("special_bonus") && o.name !== "generic_hidden" && o.name !== "empty" && r++;
    }
  return Gs(r, e, a, n);
}
function Bs(t) {
  if (!t || typeof t != "object") return null;
  const e = t.player, a = t.hero;
  if (e && typeof e == "object" && a && typeof a == "object" && e.accountid && (a.hero_id || a.heroid || a.id)) {
    const r = parseInt(String(e.accountid), 10), i = a.hero_id ?? a.heroid ?? a.id;
    let c = null;
    if (typeof i == "number" && i > 0)
      c = i;
    else if (typeof i == "string") {
      const o = Number(i);
      Number.isFinite(o) && o > 0 && (c = o);
    }
    if (Number.isFinite(r) && r > 0 && c) {
      let o = "Unknown";
      typeof e.name == "string" && (o = e.name);
      const m = a.aghanims_shard === !0, l = a.aghanims_scepter === !0;
      return {
        steam32: r,
        heroId: c,
        playerName: o,
        abilityCount: ja(t.abilities, c, m, l)
      };
    }
  }
  const n = (r) => {
    var m, l, p;
    const i = (m = t.hero) == null ? void 0 : m[r], c = (l = t.player) == null ? void 0 : l[r], o = (p = t.abilities) == null ? void 0 : p[r];
    if (!i || !c) return null;
    for (let h = 0; h <= 9; h++) {
      const d = `player${h}`, g = i[d], u = c[d], f = o == null ? void 0 : o[d];
      if (g && typeof g == "object" && g.selected_unit === !0) {
        let y = null;
        const w = g.hero_id ?? g.heroid ?? g.id;
        if (typeof w == "number" && w > 0)
          y = w;
        else if (typeof w == "string") {
          const k = Number(w);
          Number.isFinite(k) && k > 0 && (y = k);
        }
        let b = null;
        if (u && typeof u == "object" && u.accountid) {
          const k = parseInt(String(u.accountid), 10);
          Number.isFinite(k) && k > 0 && (b = k);
        }
        let _ = "Unknown";
        if (u && typeof u == "object" && typeof u.name == "string" && (_ = u.name), y && b) {
          const k = g.aghanims_shard === !0, I = g.aghanims_scepter === !0;
          return {
            steam32: b,
            heroId: y,
            playerName: _,
            abilityCount: ja(f, y, k, I)
          };
        }
      }
    }
    return null;
  };
  return n("team2") || n("team3");
}
function B(t) {
  return t && typeof t == "object" ? t : null;
}
function j(t, e = 0) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const a = Number(t);
    if (Number.isFinite(a)) return a;
  }
  return e;
}
function Z(t) {
  const e = B(t);
  return e ? j(e.id ?? e.item_id ?? e.itemid, 0) : 0;
}
function Ks(t, e, a, n, r, i) {
  const c = n < 128, o = r ? c : !c, m = j((e == null ? void 0 : e.hero_id) ?? (e == null ? void 0 : e.heroid) ?? (e == null ? void 0 : e.id), 0) || void 0, l = typeof (e == null ? void 0 : e.name) == "string" ? e.name : void 0, p = Z((a == null ? void 0 : a.slot0) ?? (a == null ? void 0 : a.item0)), h = Z((a == null ? void 0 : a.slot1) ?? (a == null ? void 0 : a.item1)), d = Z((a == null ? void 0 : a.slot2) ?? (a == null ? void 0 : a.item2)), g = Z((a == null ? void 0 : a.slot3) ?? (a == null ? void 0 : a.item3)), u = Z((a == null ? void 0 : a.slot4) ?? (a == null ? void 0 : a.item4)), f = Z((a == null ? void 0 : a.slot5) ?? (a == null ? void 0 : a.item5)), y = Z((a == null ? void 0 : a.neutral0) ?? (a == null ? void 0 : a.neutral)), w = Z(a == null ? void 0 : a.backpack0), b = Z(a == null ? void 0 : a.backpack1), _ = Z(a == null ? void 0 : a.backpack2), k = [p, h, d, g, u, f], I = j((e == null ? void 0 : e.aghanims_scepter) ?? (e == null ? void 0 : e.has_scepter), 0), A = j((e == null ? void 0 : e.aghanims_shard) ?? (e == null ? void 0 : e.has_shard), 0), H = k.includes(108) || k.includes(271) || k.includes(127) || k.includes(256), L = k.includes(609) || k.includes(125);
  return {
    account_id: j(t.accountid, 0) || void 0,
    personaname: typeof t.name == "string" ? t.name : void 0,
    hero_id: m,
    hero_name: l,
    player_slot: n,
    leaver_status: j(t.leaver_status, 0),
    win: o ? 1 : 0,
    kills: j(t.kills, 0),
    deaths: j(t.deaths, 0),
    assists: j(t.assists, 0),
    hero_damage: j(t.hero_damage, 0),
    hero_healing: j(t.hero_healing ?? t.healer_damage, 0),
    gold_per_min: j(t.gpm ?? t.gold_per_min, 0),
    xp_per_min: j(t.xpm ?? t.xp_per_min, 0),
    net_worth: j(t.net_worth ?? t.networth, 0),
    last_hits: j(t.last_hits, 0),
    denies: j(t.denies, 0),
    lane_efficiency: j(t.lane_efficiency, 0),
    duration: i,
    item_0: p,
    item_1: h,
    item_2: d,
    item_3: g,
    item_4: u,
    item_5: f,
    item_neutral: y,
    backpack_0: w,
    backpack_1: b,
    backpack_2: _,
    aghanims_scepter: I || H ? 1 : 0,
    aghanims_shard: A || L ? 1 : 0
  };
}
function Fa(t, e, a, n, r, i) {
  const c = [];
  for (let o = 0; o < 5; o++) {
    const m = `player${o}`, l = B(t == null ? void 0 : t[m]);
    if (!l) continue;
    const p = B(e == null ? void 0 : e[m]) ?? null, h = B(a == null ? void 0 : a[m]) ?? null, d = n + o;
    c.push(
      Ks(l, p, h, d, r, i)
    );
  }
  return c;
}
function Ws(t) {
  const e = B(t.map);
  if (!((typeof (e == null ? void 0 : e.game_state) == "string" ? e.game_state : "") === "DOTA_GAMERULES_STATE_POST_GAME"))
    return {
      match: { match_id: 0, players: [] },
      matchId: 0,
      isPostGame: !1
    };
  const r = (e == null ? void 0 : e.radiant_win) === !0 || (e == null ? void 0 : e.radiant_win) === "true" || (e == null ? void 0 : e.radiant_win) === 1, i = Math.max(1, j((e == null ? void 0 : e.clock_time) ?? (e == null ? void 0 : e.game_time), 0)), c = j((e == null ? void 0 : e.matchid) ?? (e == null ? void 0 : e.match_id), 0), o = B(t.player), m = B(t.hero), l = B(t.items), p = Fa(
    B((o == null ? void 0 : o.team2) ?? (o == null ? void 0 : o.radiant)),
    B((m == null ? void 0 : m.team2) ?? (m == null ? void 0 : m.radiant)),
    B((l == null ? void 0 : l.team2) ?? (l == null ? void 0 : l.radiant)),
    0,
    r,
    i
  ), h = Fa(
    B((o == null ? void 0 : o.team3) ?? (o == null ? void 0 : o.dire)),
    B((m == null ? void 0 : m.team3) ?? (m == null ? void 0 : m.dire)),
    B((l == null ? void 0 : l.team3) ?? (l == null ? void 0 : l.dire)),
    128,
    r,
    i
  );
  return { match: {
    match_id: c,
    duration: i,
    radiant_win: r,
    players: [...p, ...h]
  }, matchId: c, isPostGame: !0 };
}
let we = 0, tt = null, ce = null, He = 0, ee = null, Da = null;
const Vs = 1400, Oa = 100, qs = 600;
function Ys(t, e) {
  var i, c;
  const a = (i = t == null ? void 0 : t.player) == null ? void 0 : i[e], n = (c = t == null ? void 0 : t.hero) == null ? void 0 : c[e];
  if (!a || !n) return [];
  const r = [];
  for (let o = 0; o < 5; o++) {
    const m = `player${o}`, l = a[m], p = n[m];
    l && p && p.aghanims_shard !== !0 && p.aghanims_shard !== 1 && r.push({
      id: m,
      net_worth: l.net_worth || 0
    });
  }
  return r.sort((o, m) => o.net_worth - m.net_worth).slice(0, 2).map((o) => o.id);
}
function zs(t, e, a, n) {
  var c, o, m, l;
  let r = null, i = !1;
  for (const p of a) {
    const h = (o = (c = t == null ? void 0 : t.player) == null ? void 0 : c[n]) == null ? void 0 : o[p], d = (l = (m = e == null ? void 0 : e.player) == null ? void 0 : m[n]) == null ? void 0 : l[p];
    if (!h || !d) continue;
    const g = (d.net_worth || 0) - (h.net_worth || 0), u = (d.gold_reliable || 0) + (d.gold_unreliable || 0) - ((h.gold_reliable || 0) + (h.gold_unreliable || 0));
    if (Math.abs(g - Vs) <= Oa && Math.abs(u) <= Oa) {
      const f = d.net_worth || 0;
      r ? (i = !0, f < r.net_worth && (r = { id: p, nwDelta: g, goldDelta: u, net_worth: f })) : r = { id: p, nwDelta: g, goldDelta: u, net_worth: f };
    }
  }
  return r ? (i && S.warn(
    { teamKey: n, matches: a, selectedId: r.id },
    "Multiple candidates showed Tormentor kill delta in the same tick. Selected the one with lower net worth."
  ), { killed: !0, recipientId: `${n}-${r.id}`, nwDelta: r.nwDelta, goldDelta: r.goldDelta }) : { killed: !1 };
}
let at = 0, Ua = "";
function Js(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  e.post("/gsi", async (c, o) => {
    var y, w;
    const m = typeof c.query.token == "string" ? c.query.token : void 0;
    if (E.GSI_TOKEN && m !== E.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const l = c.body;
    we = Date.now(), await oe(r);
    try {
      Ds(l, i);
    } catch (b) {
      S.error(b, "Power spike evaluation failed");
    }
    const p = await a.getState(), h = ((y = p.leagueConfig) == null ? void 0 : y.roster) ?? [], d = ((w = p.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, g = Ns(
      l,
      p.draft ?? null,
      h,
      d
    ), u = Bs(l);
    u && (g.focusedPlayerSteam32 = u.steam32, g.focusedPlayerHeroId = u.heroId, g.focusedPlayerName = u.playerName, g.focusedPlayerAbilityCount = u.abilityCount);
    const f = async () => {
      var Ct, At, Et, Pt, vt, Rt, Tt, Lt, Nt, Mt, xt, Ht, jt, Ft, Dt, Ot, Ut, $t, Gt, Bt, Kt, Wt, Vt, qt, Yt, zt, Jt, Xt, Qt, Zt, ea, ta, aa, na;
      const b = await a.getState();
      let _ = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      g.draftPatch && (_ = {
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
          ...g.draftPatch
        }
      });
      const k = ((Ct = l == null ? void 0 : l.map) == null ? void 0 : Ct.radiant_scan_cooldown) ?? 0, I = ((At = l == null ? void 0 : l.map) == null ? void 0 : At.dire_scan_cooldown) ?? 0, A = ((Et = l == null ? void 0 : l.map) == null ? void 0 : Et.radiant_glyph_cooldown) ?? 0, H = ((Pt = l == null ? void 0 : l.map) == null ? void 0 : Pt.dire_glyph_cooldown) ?? 0, L = ((vt = l == null ? void 0 : l.map) == null ? void 0 : vt.clock_time) || 0;
      (Rt = l == null ? void 0 : l.map) != null && Rt.game_time;
      const G = (Tt = l == null ? void 0 : l.map) == null ? void 0 : Tt.matchid, O = ((Lt = ee == null ? void 0 : ee.map) == null ? void 0 : Lt.clock_time) || 0;
      if (G !== void 0 && Da !== G ? (Da = G, ce = null, He = 0, ee = null) : (L < O || L < (ce || 0)) && (ce = null, He = 0, ee = null), l != null && l.events && Array.isArray(l.events)) {
        console.log("EVENTS:", JSON.stringify(l.events, null, 2));
        for (const T of l.events)
          T.game_time && T.game_time > He && (He = T.game_time);
      }
      if (L >= 1200 && (ce !== null ? L - ce : 1 / 0) >= qs && ee && l) {
        const D = L - O;
        if (D >= 0 && D <= 15) {
          let W = !1;
          for (const K of ["team2", "team3"]) {
            if (W) break;
            const P = Ys(ee, K), Q = zs(ee, l, P, K);
            Q.killed && (W = !0, ce = L, S.info(
              { recipientId: Q.recipientId, nwDelta: Q.nwDelta, goldDelta: Q.goldDelta },
              "Detected Tormentor kill via net-worth delta"
            ));
          }
        }
      }
      ee = l;
      let z = "dead", $ = 0, F = "dead", kt = 0;
      if (L >= 1200) {
        const D = Math.floor((L - 1200) / 300) % 2 === 0;
        let W = !0, K = 0;
        if (ce !== null) {
          const P = L - ce;
          P >= 0 && P < 600 && (W = !1, K = 600 - P);
        }
        D ? (z = W ? "alive" : "dead", $ = K) : (F = W ? "alive" : "dead", kt = K);
      }
      if (_.minimapState = {
        roshanState: (Nt = l == null ? void 0 : l.map) == null ? void 0 : Nt.roshan_state,
        roshanRespawnTimer: (Mt = l == null ? void 0 : l.map) == null ? void 0 : Mt.roshan_state_end_seconds,
        tormentorRadiant: z,
        tormentorRadiantRespawnTimer: $,
        tormentorDire: F,
        tormentorDireRespawnTimer: kt,
        radiantScanActive: k === 0,
        radiantScanCooldown: k,
        direScanActive: I === 0,
        direScanCooldown: I,
        radiantGlyphActive: A === 0,
        radiantGlyphCooldown: A,
        direGlyphActive: H === 0,
        direGlyphCooldown: H
      }, u) {
        const T = g.focusedPlayerSteam32, D = g.focusedPlayerHeroId, W = g.focusedPlayerName, K = g.focusedPlayerAbilityCount;
        if (T && D) {
          const P = ((xt = b.livePlayerCard) == null ? void 0 : xt.steam32) !== T || ((Ht = b.livePlayerCard) == null ? void 0 : Ht.heroId) !== D || ((jt = b.livePlayerCard) == null ? void 0 : jt.abilityCount) !== K, Q = ((Ft = b.overlayVisibility) == null ? void 0 : Ft.liveplayercard) !== "visible";
          if (P || Q) {
            const J = V(h, T), ie = (J == null ? void 0 : J.displayName) || W || "Unknown";
            _ = {
              ..._,
              ...P ? {
                livePlayerCard: {
                  steam32: T,
                  heroId: D,
                  playerLabel: ie,
                  playerAvatarUrl: J == null ? void 0 : J.avatarUrl,
                  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  source: "manual",
                  abilityCount: K
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
        const T = ((Dt = b.overlayVisibility) == null ? void 0 : Dt.liveplayercard) === "visible", D = b.livePlayerCard !== null && b.livePlayerCard !== void 0;
        (T || D) && (_ = {
          ..._,
          livePlayerCard: null,
          overlayVisibility: {
            ..._.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const wn = await a.patchState(_);
      await n.broadcastFull(wn);
      const ke = typeof ((Ot = l == null ? void 0 : l.map) == null ? void 0 : Ot.game_state) == "string" ? l.map.game_state : "", It = ke === "DOTA_GAMERULES_STATE_POST_GAME" && Ua !== "DOTA_GAMERULES_STATE_POST_GAME";
      if (Ua = ke, It || ke === "DOTA_GAMERULES_STATE_POST_GAME")
        try {
          const T = Ws(l), D = T.matchId || "post_game_transition", W = at === D && !It;
          if (T.isPostGame && !W && T.match.players && T.match.players.length >= 2) {
            at = D;
            const P = cn(T.match)[0];
            if (P) {
              const J = ((Ut = (await a.getState()).leagueConfig) == null ? void 0 : Ut.roster) ?? [], ie = P.accountId ? V(J, P.accountId) : void 0, ze = P.heroId ? re(P.heroId, P.heroName) : {}, Ie = {
                playerLabel: (ie == null ? void 0 : ie.displayName) ?? `Player ${P.accountId ?? "?"}`,
                heroId: P.heroId,
                heroName: P.heroName,
                steam32: P.accountId,
                ...ze,
                xpm: P.raw.xpm,
                gpm: P.raw.gpm,
                networth: P.raw.networth,
                kills: P.raw.kills,
                deaths: P.raw.deaths,
                assists: P.raw.assists,
                heroDamage: P.raw.heroDamage,
                lastHits: P.raw.lastHits,
                teamKills: P.raw.teamKills,
                items: P.raw.items,
                hasScepter: P.raw.hasScepter,
                hasShard: P.raw.hasShard
              };
              if (Ie.playerLabel.startsWith("Player ") && P.accountId) {
                const kn = P.side === "radiant" ? "team2" : "team3", In = P.playerSlot < 128 ? P.playerSlot : P.playerSlot - 128, Xe = (Bt = (Gt = ($t = l == null ? void 0 : l.player) == null ? void 0 : $t[kn]) == null ? void 0 : Gt[`player${In}`]) == null ? void 0 : Bt.name;
                typeof Xe == "string" && Xe.length > 0 && (Ie.playerLabel = Xe);
              }
              const Je = await a.patchState({
                standoutPlayerCard: Ie,
                overlayVisibility: { standoutplayer: "visible" }
              });
              await n.broadcastFull(Je), S.info(
                { mvpScore: P.mvpScore, heroId: P.heroId, accountId: P.accountId },
                "[post-game] Standout Player auto-selected and pushed to overlay"
              );
            }
          }
        } catch (T) {
          S.error(T, "[post-game] MVP auto-selection failed");
        }
      (ke === "DOTA_GAMERULES_STATE_HERO_SELECTION" || ke === "DOTA_GAMERULES_STATE_STRATEGY_TIME") && (at = 0);
      const _n = ((Kt = g.draftPatch) == null ? void 0 : Kt.lastPick) && (!((Wt = b.draft) != null && Wt.lastPick) || g.draftPatch.lastPick.heroId !== b.draft.lastPick.heroId || g.draftPatch.lastPick.side !== b.draft.lastPick.side);
      if ((Vt = b.production) != null && Vt.autoShowStatsOnPick && _n) {
        try {
          be(b);
        } catch {
          return;
        }
        const T = (qt = g.draftPatch) == null ? void 0 : qt.lastPick;
        if (!T) return;
        const D = T.side === "dire" || T.side === "B" ? "dire" : "radiant", W = D === "radiant" ? ((zt = (Yt = g.draftPatch) == null ? void 0 : Yt.radiant) == null ? void 0 : zt.slots) ?? ((Xt = (Jt = b.draft) == null ? void 0 : Jt.radiant) == null ? void 0 : Xt.slots) : ((Zt = (Qt = g.draftPatch) == null ? void 0 : Qt.dire) == null ? void 0 : Zt.slots) ?? ((ta = (ea = b.draft) == null ? void 0 : ea.dire) == null ? void 0 : ta.slots), K = qa(D, T.heroId, W), P = K !== void 0 ? Ye((aa = b.leagueConfig) == null ? void 0 : aa.matchSetup, D, K) : void 0, Q = ((na = b.leagueConfig) == null ? void 0 : na.roster) ?? [], J = P != null && P > 0 ? V(Q, P) : void 0, ie = J && P ? await Re(
          r,
          P,
          T.heroId,
          J.displayName,
          b.tournamentHeroIndex ?? {},
          Q,
          b.playerHeroIndex
        ) : await ve(
          r,
          T.heroId,
          b.tournamentHeroIndex ?? {}
        ), ze = _t(ie), Ie = Date.now() + 12e3, Je = await a.patchState({
          heroStatsCard: ie,
          statCarousel: ze,
          overlayVisibility: {
            herostats: { mode: "timed", until: Ie }
          }
        });
        await n.broadcastFull(Je);
      }
    };
    tt && clearTimeout(tt), tt = setTimeout(() => {
      f().catch((b) => S.error(b, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: g.inDraft });
  }), e.get("/gsi/status", (c, o) => {
    o.json({
      lastSeen: we ? new Date(we).toISOString() : null,
      connected: Date.now() - we < 5e3
    });
  });
}
function Xs(t, e, a) {
  var n, r;
  (r = (n = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - we > 8e3 && we > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || r.call(n);
}
function $a(t, e) {
  var r, i;
  if (t === "overlay")
    return !0;
  const a = e.handshake;
  let n = "";
  return typeof ((r = a.auth) == null ? void 0 : r.token) == "string" ? n = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (n = a.query.token), n ? n === E.BROADCAST_SECRET : !1;
}
async function Qs(t) {
  const { state: e, obs: a, opendota: n } = t, r = Ee();
  r.use(Ln({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), r.disable("x-powered-by"), r.use((u, f, y) => {
    u.headers["access-control-request-private-network"] && f.setHeader("Access-Control-Allow-Private-Network", "true"), u.method === "OPTIONS" && u.headers.origin && (f.setHeader("Access-Control-Allow-Origin", u.headers.origin), f.setHeader("Access-Control-Allow-Credentials", "true"), f.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE"), f.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")), y();
  }), r.use(
    Tn({
      origin: !0,
      credentials: !0
    })
  ), r.use(Ee.json({ limit: "1mb" }));
  const i = v.dirname(St(import.meta.url)), c = v.join(i, "../../overlay-web/dist"), o = v.join(i, "../../admin-web/dist");
  r.use("/overlay", Ee.static(c)), r.use("/admin", Ee.static(o)), r.get("/admin", (u, f) => {
    const y = v.join(o, "index.html");
    f.sendFile(y, (w) => {
      w && f.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/admin/*", (u, f, y) => {
    if (u.path.includes(".")) return y();
    const w = v.join(o, "index.html");
    f.sendFile(w, (b) => {
      b && f.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  }), r.get("/overlay", (u, f) => {
    const y = v.join(c, "index.html");
    f.sendFile(y, (w) => {
      w && f.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/overlay/*", (u, f, y) => {
    if (u.path.includes(".")) return y();
    const w = v.join(c, "index.html");
    f.sendFile(w, (b) => {
      b && f.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  });
  const m = Nn.createServer(r), l = new Mn(m, {
    cors: { origin: !0, credentials: !0 },
    transports: ["websocket", "polling"]
  }), p = {
    async broadcastFull(u) {
      const f = u ?? await e.getState();
      l.of(ae.OVERLAY).emit(te.STATE_FULL, f), l.of(ae.PRODUCER).emit(
        te.STATE_FULL,
        f
      ), S.debug({ seq: f.seq }, "Emitted state snapshot");
    }
  };
  Lr({
    app: r,
    state: e,
    io: l,
    broadcast: p,
    obs: a,
    opendota: n
  }), ys({
    app: r,
    state: e,
    io: l,
    broadcast: p,
    opendota: n
  }), Js({
    app: r,
    state: e,
    broadcast: p,
    opendota: n,
    io: l
  }), Xs(e, p);
  const h = l.of(ae.PRODUCER), d = l.of(ae.OVERLAY);
  h.use((u, f) => {
    const y = $a("producer", u);
    f(y ? void 0 : new Error("unauthorized producer"));
  }), d.use((u, f) => {
    const y = $a("overlay", u);
    f(y ? void 0 : new Error("unauthorized overlay"));
  }), h.on("connection", (u) => {
    S.info({ id: u.id }, "producer connected"), e.getState().then((f) => {
      u.emit(te.STATE_FULL, f);
    });
  }), d.on("connection", (u) => {
    S.info({ id: u.id }, "overlay viewer connected"), e.getState().then((f) => {
      u.emit(te.STATE_FULL, f);
    });
  });
  const g = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(g) && g > 500) {
    const u = setInterval(() => {
      e.getState().then((f) => {
        l.of(ae.OVERLAY).emit(te.STATE_FULL, f);
      });
    }, g);
    typeof u.unref == "function" && u.unref();
  }
  return { app: r, httpServer: m, io: l, broadcast: p };
}
async function Zs() {
  const t = await Sr(), e = new On(), a = new Gn();
  E.REDIS_URL && a.attachRedis(E.REDIS_URL), oe(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  ), Ms().catch(
    (i) => S.warn(i, "item timings preload deferred")
  );
  const n = await Qs({ state: t, obs: e, opendota: a });
  await zr({
    state: t,
    opendota: a,
    broadcast: n.broadcast
  }), n.httpServer.listen(E.PORT, () => {
    S.info(
      { port: E.PORT, leagueId: E.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const r = async () => {
    var i;
    S.info("Shutting down"), await n.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), n.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void r()), process.on("SIGTERM", () => void r()), { obs: e, opendota: a, state: t, shutdown: r };
}
process.argv[1] && St(import.meta.url) === process.argv[1] && Zs().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
export {
  Zs as bootstrapBroadcastServer
};

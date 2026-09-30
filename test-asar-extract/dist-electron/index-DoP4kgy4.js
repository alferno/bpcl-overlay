var Ea = Object.defineProperty;
var Aa = (t, e, a) => e in t ? Ea(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var D = (t, e, a) => Aa(t, typeof e != "symbol" ? e + "" : e, a);
import P from "node:path";
import { fileURLToPath as rt } from "node:url";
import { config as Pa } from "dotenv";
import { z as s } from "zod";
import Ra from "pino";
import va from "obs-websocket-js";
import Da from "bottleneck";
import { Redis as nt } from "ioredis";
import La from "cors";
import he from "express";
import Ta from "helmet";
import Na from "node:http";
import { Server as Ma } from "socket.io";
import R, { existsSync as ht } from "node:fs";
import { exec as xa } from "node:child_process";
import { promisify as Ha } from "node:util";
import { mkdir as Yt, writeFile as Ee, access as ja, readFile as Ae } from "node:fs/promises";
import zt from "node:https";
const Fa = P.dirname(rt(import.meta.url));
Pa({ path: P.resolve(Fa, "../.env") });
const Oa = s.object({
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
}), k = Oa.parse(process.env);
function pt() {
  return k.CORS_ORIGINS.split(",").map((t) => t.trim()).filter(Boolean);
}
const b = Ra({
  level: process.env.LOG_LEVEL ?? "info"
});
class Ua {
  constructor() {
    D(this, "client", new va());
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
      ), b.info("OBS websocket connected"), { ok: !0 };
    } catch (a) {
      return b.error(a, "OBS websocket connect failed"), {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async disconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.isConnected() && await this.client.disconnect().catch(() => {
    }), b.info("OBS websocket disconnected");
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
const $a = "https://api.opendota.com/api";
function Ba(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class Ka {
  constructor(e = 600) {
    D(this, "limiter");
    D(this, "memory", /* @__PURE__ */ new Map());
    D(this, "redis", null);
    this.ttlSeconds = e;
    const a = k.OPENDOTA_RATE_PER_MINUTE, r = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new Da({
      minTime: r,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new nt(e);
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
        b.warn(l, "Redis OpenDota read failed");
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
        const r = await fetch(`${$a}${e}`, {
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
const Q = "Game starting in", Jt = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), Ga = Jt.partial();
function Pe(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Wa(t, e, a = Date.now()) {
  if (e.running === !0) {
    const n = e.secondsRemaining ?? (t ? Pe(t, a) : 0), i = Math.max(0, Math.floor(n));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Q,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const n = e.secondsRemaining ?? (t ? Pe(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Q,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(n))
    };
  }
  const r = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? Q,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? Pe(t, a) : 0)
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
function yt(t, e = Q) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function bt(t, e = Q) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const qa = {
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
function Va(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (qa[e] ?? e);
}
function $(t) {
  return Va(t.replace(/^npc_dota_hero_/, "").trim());
}
function Ya(t) {
  if (!t)
    return {};
  const e = $(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Qt(e)
  } : {};
}
function Qt(t, e) {
  const a = $(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function za(t, e) {
  const a = $(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function Ja(t, e) {
  const a = $(t);
  if (!a)
    return {};
  const r = Qt(a), n = za(a);
  return {
    staticUrl: r,
    staticFallbackUrl: r,
    animatedUrl: n
  };
}
function Xt(t) {
  return `/teams/${t}.png`;
}
function Be(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function Qa(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Map();
  for (const n of t) {
    const i = $(n.name);
    if (!i)
      continue;
    e.set(n.id, i), a.add(i), r.set(Be(n.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    r.set(Be(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: r };
}
function Xa(t, e) {
  const { heroId: a, heroClass: r, heroName: n, urlSlug: i } = t;
  if (i) {
    const l = $(i);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "url" };
  }
  if (a != null && a > 0) {
    const l = e.byId.get(a);
    if (l)
      return { slug: l, source: "id" };
  }
  if (r) {
    const l = $(r);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [n, r]) {
    if (!l)
      continue;
    const o = Be(l), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (r) {
    const l = $(r);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function He(t, e, a) {
  var n, i;
  const r = e === "radiant" ? (n = t == null ? void 0 : t.pickPlayers) == null ? void 0 : n.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!r || a < 0 || a >= r.length))
    return r[a] ?? null;
}
function Za(t, e, a) {
  var n, i;
  const r = He(t == null ? void 0 : t.matchSetup, e, a);
  if (!(r == null || !((n = t == null ? void 0 : t.roster) != null && n.length)))
    return (i = t.roster.find((l) => l.steam32 === r)) == null ? void 0 : i.displayName;
}
function Zt(t, e, a) {
  const r = a == null ? void 0 : a.find((n) => n.type === "pick" && n.heroId === e);
  return r == null ? void 0 : r.order;
}
function er(t, e) {
  return `${t}:${e}`;
}
function Ke(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let r = 0, n = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (r += l.games, n += l.wins);
  return { games: r, wins: n };
}
function ea(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[er(e, a)];
}
function Ge(t, e) {
  if (Ke(t, e).games <= 0)
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
  "liveplayercard",
  "rankmedals",
  "global_kill_switch"
], ar = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), ta = s.union([
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
  side: s.enum(["radiant", "dire", "A", "B"]).optional(),
  /** Preferred roles synced from BPC League */
  roles: s.array(s.string()).optional(),
  /** Player MMR from BPCL API for dynamic rank medals */
  mmr: s.number().optional()
}), aa = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), ra = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: aa.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => De)).optional()
}), na = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(nr).default([]),
  matchSetup: ra.nullable().optional(),
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
}), sa = s.object({
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
}), oa = s.object({
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
}), ia = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), We = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(ia),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), la = s.object({
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
}), St = s.object({
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
}), De = s.object({
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
  radiant: St.optional(),
  dire: St.optional(),
  lastPick: ir.optional()
}), qe = s.object({
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
const Ve = s.object({
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
]), le = s.object({
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
  statSlides: s.array(ia).optional(),
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
}), dr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: Jt.optional()
}), ca = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(ta).default({}),
  sceneHints: ca.optional(),
  leagueConfig: na.optional(),
  tournamentHeroIndex: s.record(sa).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(oa).optional(),
  production: la.optional(),
  statCarousel: We.nullable().optional(),
  draft: De.nullable().optional(),
  lowerThirds: qe.nullable().optional(),
  playerStatsCard: Ve.nullable().optional(),
  heroStatsCard: le.nullable().optional(),
  livePlayerCard: le.nullable().optional(),
  matchupCard: Ye.nullable().optional(),
  sponsor: ze.nullable().optional(),
  timers: dr.optional()
});
const mr = s.object({
  overlayVisibility: s.record(ta).optional(),
  leagueConfig: na.partial().optional(),
  tournamentHeroIndex: s.record(sa).optional(),
  playerHeroIndex: s.record(oa).optional(),
  production: la.partial().optional(),
  statCarousel: s.union([We, We.partial(), s.null()]).optional(),
  draft: s.union([De, De.partial(), s.null()]).optional(),
  lowerThirds: s.union([qe, qe.partial(), s.null()]).optional(),
  playerStatsCard: s.union([Ve, Ve.partial(), s.null()]).optional(),
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
    gameStartCountdown: Ga.optional()
  }).partial().optional(),
  sceneHints: ca.partial().optional()
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
function ua() {
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
    livePlayerCard: null,
    matchupCard: null,
    sponsor: null,
    timers: {}
  };
}
const K = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, G = {
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
  if (r !== k.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function hr(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function wt(t, e) {
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
  return r != null && r.slots && (r.slots = wt((i = t.radiant) == null ? void 0 : i.slots, r.slots)), n != null && n.slots && (n.slots = wt((l = t.dire) == null ? void 0 : l.slots, n.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: r,
    dire: n,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function oe(t, e) {
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
function da(t, e) {
  var y;
  const a = e.overlayVisibility !== void 0 ? hr(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let r = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: S, ...w } = e.timers;
    r = {
      ...t.timers ?? {},
      ...w
    }, S !== void 0 && (r = {
      ...r,
      gameStartCountdown: Wa((y = t.timers) == null ? void 0 : y.gameStartCountdown, S)
    });
  }
  const n = pr(t.draft, e.draft), i = yr(t.leagueConfig, e.leagueConfig), l = br(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let c = oe(t.heroStatsCard ?? void 0, e.heroStatsCard), h = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const f = oe(t.lowerThirds ?? void 0, e.lowerThirds), u = oe(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let d = oe(t.matchupCard ?? void 0, e.matchupCard), g = oe(t.sponsor ?? void 0, e.sponsor), p = oe(t.statCarousel ?? void 0, e.statCarousel);
  if (c && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const S = e.heroStatsCard;
    S.fetchedAt ? c = { ...S } : c = {
      ...c,
      ...S,
      tournament: S.tournament ? { ...c.tournament ?? {}, ...S.tournament } : c.tournament,
      playerHero: S.playerHero ? { ...c.playerHero ?? {}, ...S.playerHero } : c.playerHero,
      statSlides: S.statSlides ?? c.statSlides
    };
  }
  if (d && e.matchupCard && typeof e.matchupCard == "object") {
    const S = e.matchupCard;
    d = {
      ...d,
      ...S,
      matchup: S.matchup ? { ...d.matchup ?? {}, ...S.matchup } : d.matchup
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
    lowerThirds: f === void 0 ? t.lowerThirds : f,
    playerStatsCard: u === void 0 ? t.playerStatsCard : u,
    heroStatsCard: c === void 0 ? t.heroStatsCard : c,
    matchupCard: d === void 0 ? t.matchupCard : d,
    sponsor: g === void 0 ? t.sponsor : g,
    timers: r ?? t.timers,
    sceneHints: h
  };
}
function _t(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = da(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function Sr(t) {
  const e = new nt(t.url, {
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
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, m = da(o, n);
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
  const t = ua();
  if (k.STATE_BACKEND === "memory")
    return b.info("State backend: memory"), _t(t);
  if (!k.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new nt(k.REDIS_URL);
    return await e.ping(), await e.quit(), b.info({ key: k.REDIS_STATE_KEY }, "State backend: redis"), Sr({
      url: k.REDIS_URL,
      key: k.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (b.error(e, "Redis unavailable"), k.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return b.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), _t(t);
    throw e;
  }
}
function _r(t) {
  return mr.parse(t);
}
const ke = Ha(xa);
class kr {
  constructor() {
    D(this, "dbFile", k.REPLAY_DB_FILE);
    D(this, "matchFile", k.REPLAY_MATCH_FILE);
    D(this, "lastCompletedFile", k.REPLAY_LAST_COMPLETED_FILE);
    D(this, "playbackDir", k.REPLAY_PLAYBACK_DIR);
    D(this, "replayFolder", k.REPLAY_FOLDER);
    D(this, "highlightsDir", k.HIGHLIGHTS_FOLDER || P.resolve(process.cwd(), "../../data/highlights"));
    D(this, "pendingDuration", null);
    D(this, "playbackState", "IDLE");
    D(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    D(this, "previewCacheDir", P.resolve(process.cwd(), "public-preview-cache"));
    if (!R.existsSync(this.previewCacheDir))
      try {
        R.mkdirSync(this.previewCacheDir, { recursive: !0 });
      } catch (e) {
        b.error(e, "Failed to create preview cache directory");
      }
  }
  getPreviewCacheDir() {
    return this.previewCacheDir;
  }
  init(e) {
    e.on("ReplayBufferSaved", async (a) => {
      const r = a.savedReplayPath;
      r && await this.handleReplaySaved(r);
    }), e.on("CurrentProgramSceneChanged", (a) => {
      const r = a.sceneName;
      this.playbackState !== "IDLE" && r !== "Replay Stinger" && r !== "Replay" && (b.info(`Manual scene switch to ${r} detected. Cancelling replay sequence.`), this.playbackState = "IDLE", this.originalScene = null);
    }), e.on("MediaInputPlaybackEnded", async (a) => {
      const r = a.inputName;
      this.playbackState === "STINGER_IN" && r === "Stinger" ? (b.info("Stinger In ended, switching to Replay"), this.playbackState = "REPLAYING", await e.setCurrentScene("Replay"), await e.restartMediaInput("ReplayPlayer")) : this.playbackState === "REPLAYING" && r === "ReplayPlayer" ? (b.info("Replay ended, switching to Stinger Out"), this.playbackState = "STINGER_OUT", await e.setCurrentScene("Replay Stinger"), await e.restartMediaInput("Stinger")) : this.playbackState === "STINGER_OUT" && r === "Stinger" && (b.info("Stinger Out ended, restoring original scene"), this.playbackState = "IDLE", this.originalScene && (await e.setCurrentScene(this.originalScene), this.originalScene = null));
    });
  }
  async triggerSaveReplay(e, a) {
    this.pendingDuration = e;
    const r = await a.saveReplayBuffer();
    return r.ok || (this.pendingDuration = null), r;
  }
  async handleReplaySaved(e) {
    try {
      if (!e || !R.existsSync(e)) {
        b.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      R.existsSync(this.replayFolder) || R.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = P.basename(e), r = P.join(this.replayFolder, a);
      e !== r && (R.copyFileSync(e, r), R.unlinkSync(e));
      let n = 30, i = !1;
      this.pendingDuration !== null && (n = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const f = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${r}"`, u = await ke(f), d = parseFloat(u.stdout.trim());
        !isNaN(d) && !i && (n = Math.round(d));
      } catch (f) {
        b.error(f, "Failed to probe duration of new replay");
      }
      const l = await this.getReplayState(), o = l.currentMatch;
      let m = 0;
      for (const f of l.replays)
        f.replayId > m && (m = f.replayId);
      const c = m + 1, h = `${o},${c},"${r}",0,${n}
`;
      if (!R.existsSync(this.dbFile)) {
        const f = P.dirname(this.dbFile);
        R.existsSync(f) || R.mkdirSync(f, { recursive: !0 }), R.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      R.appendFileSync(this.dbFile, h, "utf-8"), b.info({ newPath: r, currentMatch: o, newReplayId: c }, "Saved new replay");
    } catch (a) {
      b.error(a, "Failed to handle saved replay");
    }
  }
  async getReplayState() {
    let e = 1, a = 0;
    const r = [];
    try {
      if (R.existsSync(this.matchFile)) {
        const n = R.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (e = i);
      }
    } catch (n) {
      b.error(n, "Failed to read active match file");
    }
    try {
      if (R.existsSync(this.lastCompletedFile)) {
        const n = R.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (a = i);
      }
    } catch (n) {
      b.error(n, "Failed to read last completed match file");
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
            r.push({
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
    } catch (n) {
      b.error(n, "Failed to read or parse replay database CSV");
    }
    return r.sort((n, i) => i.replayId - n.replayId), {
      currentMatch: e,
      lastCompletedMatch: a,
      replays: r
    };
  }
  async toggleFavorite(e, a) {
    try {
      if (!R.existsSync(this.dbFile))
        return !1;
      const n = R.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      n.length > 0 && i.push(n[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let m = 1; m < n.length; m++) {
        const c = n[m].trim();
        if (!c) continue;
        const h = c.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        h && h[3] === e ? (i.push(`${h[1]},${h[2]},"${h[3]}",${o},${h[5]}`), l = !0) : i.push(c);
      }
      return R.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (r) {
      return b.error(r, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: "File not found" };
      const n = (await this.getReplayState()).replays.find((f) => f.file === e), i = n ? n.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await ke(l), m = parseFloat(o.stdout.trim()) || 40, c = Math.max(0, m - i);
      let h = e;
      if (c > 1) {
        R.existsSync(this.playbackDir) || R.mkdirSync(this.playbackDir, { recursive: !0 }), h = P.join(this.playbackDir, "current_replay.mp4");
        const f = `ffmpeg -y -ss ${c} -i "${e}" -t ${i} -c copy "${h}"`;
        b.info({ cmd: f }, "Running ffmpeg slice command"), await ke(f);
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
        return d.ok || b.error({ error: d.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (r) {
      return b.error(r, "Failed to play replay"), { ok: !1, error: r instanceof Error ? r.message : String(r) };
    }
  }
  async generatePreview(e) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = P.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return b.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
  async nextMatch() {
    try {
      const a = (await this.getReplayState()).currentMatch;
      R.existsSync(P.dirname(this.lastCompletedFile)) || R.mkdirSync(P.dirname(this.lastCompletedFile), { recursive: !0 }), R.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((n) => {
        b.error(n, "Failed to generate highlights in background");
      });
      const r = a + 1;
      return R.writeFileSync(this.matchFile, r.toString(), "utf-8"), b.info(`Advanced to match ${r}`), { ok: !0, currentMatch: r };
    } catch (e) {
      return b.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const r = (await this.getReplayState()).replays.filter((m) => m.match === e && m.favorite);
      if (r.length === 0)
        return b.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      R.existsSync(this.highlightsDir) || R.mkdirSync(this.highlightsDir, { recursive: !0 }), r.sort((m, c) => m.replayId - c.replayId);
      const n = P.join(this.highlightsDir, `concat_${e}.txt`), i = r.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      R.writeFileSync(n, i.join(`
`) + `
`, "utf-8");
      const l = P.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${n}" -c copy "${l}"`;
      return b.info({ cmd: o }, "Generating highlights"), await ke(o), b.info(`Generated highlights: ${l}`), { ok: !0, file: l };
    } catch (a) {
      return b.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
function Ir(t) {
  const { app: e, state: a, io: r, broadcast: n, obs: i, opendota: l } = t, o = new kr();
  o.init(i), e.use(
    "/api/replays/media",
    _,
    he.static(k.REPLAY_FOLDER)
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
  }), e.get("/api/state", _, async (f, u) => {
    const d = await a.getState();
    u.json(d);
  }), e.patch("/api/state", _, async (f, u) => {
    try {
      const d = _r(f.body), g = await a.patchState(d);
      await n.broadcastFull(g), u.json(g);
    } catch (d) {
      b.error(d, "state patch failed"), u.status(400).json({
        error: d instanceof Error ? d.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", _, async (f, u) => {
    const d = ua(), g = await a.replaceState(d);
    await n.broadcastFull(g), u.json(g);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function c(f) {
    const u = await a.patchState({
      timers: { gameStartCountdown: f }
    });
    return await n.broadcastFull(u), u;
  }
  e.post(
    "/api/timers/game-start/start",
    _,
    async (f, u) => {
      var S, w;
      const d = m.safeParse(f.body);
      if (!d.success)
        return u.status(400).json({ error: d.error.flatten() });
      const g = ((S = d.data.label) == null ? void 0 : S.trim()) || Q, p = yt(
        d.data.seconds,
        g
      ), y = await c(p);
      u.json({ ok: !0, gameStartCountdown: (w = y.timers) == null ? void 0 : w.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    _,
    async (f, u) => {
      var I, E, A, C;
      const g = (I = (await a.getState()).timers) == null ? void 0 : I.gameStartCountdown, p = (typeof ((E = f.body) == null ? void 0 : E.label) == "string" ? f.body.label.trim() : "") || (g == null ? void 0 : g.label) || Q, y = typeof ((A = f.body) == null ? void 0 : A.seconds) == "number" ? f.body.seconds : Pe(g), S = bt(y, p), w = await c(S);
      u.json({ ok: !0, gameStartCountdown: (C = w.timers) == null ? void 0 : C.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    _,
    async (f, u) => {
      var I, E, A;
      const d = m.safeParse(f.body);
      if (!d.success)
        return u.status(400).json({ error: d.error.flatten() });
      const p = (I = (await a.getState()).timers) == null ? void 0 : I.gameStartCountdown, y = ((E = d.data.label) == null ? void 0 : E.trim()) || (p == null ? void 0 : p.label) || Q, S = p != null && p.running ? yt(d.data.seconds, y) : bt(d.data.seconds, y), w = await c(S);
      u.json({ ok: !0, gameStartCountdown: (A = w.timers) == null ? void 0 : A.gameStartCountdown });
    }
  );
  const h = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", _, (f, u) => {
    const d = h.safeParse(f.body);
    if (!d.success) return u.status(400).json({ error: d.error.flatten() });
    i.configure(d.data), r.of(G.PRODUCER).emit(K.ACK, {
      kind: "obs:config",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.post("/api/obs/connect", _, async (f, u) => {
    const d = f.body;
    if (d && typeof d == "object" && Object.keys(d).length) {
      const p = h.safeParse(d);
      if (!p.success)
        return u.status(400).json({ error: p.error.flatten() });
      i.configure(p.data);
    }
    const g = await i.connect();
    r.of(G.PRODUCER).emit(K.ACK, {
      kind: "obs:connect",
      ok: g.ok,
      error: g.error
    }), u.json(g);
  }), e.post("/api/obs/disconnect", _, async (f, u) => {
    await i.disconnect(), r.of(G.PRODUCER).emit(K.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.get("/api/obs/scenes", _, async (f, u) => {
    try {
      const d = await i.listScenes();
      u.json({ ok: !0, scenes: d });
    } catch (d) {
      u.status(500).json({
        ok: !1,
        error: d instanceof Error ? d.message : String(d)
      });
    }
  }), e.post("/api/obs/program-scene", _, async (f, u) => {
    const g = s.object({ sceneName: s.string() }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await i.setProgramScene(g.data.sceneName);
    r.of(G.PRODUCER).emit(K.ACK, {
      kind: "obs:setProgramScene",
      ok: p.ok,
      sceneName: g.data.sceneName,
      error: p.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: g.data.sceneName }
    });
    const y = await a.getState();
    await n.broadcastFull(y), u.json(p);
  }), e.post(
    "/api/obs/scene-source",
    _,
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
    _,
    async (f, u) => {
      const d = await l.heroesConstants();
      u.json(d);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    _,
    async (f, u) => {
      const d = await l.playerHeroStats(f.params.accountId);
      u.json(d);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    _,
    async (f, u) => {
      const d = await l.heroMatchups(Number(f.params.heroId));
      u.json(d);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    _,
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
  ), e.post("/api/opendota/compose/hero-card", _, async (f, u) => {
    const g = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await a.getState(), y = g.data.accountId !== void 0 ? ea(
      p.playerHeroIndex,
      g.data.accountId,
      g.data.heroId
    ) : void 0;
    let S = "league", w;
    if (y && y.games > 0)
      w = {
        games: y.games,
        wins: y.wins,
        losses: y.games - y.wins
      };
    else if (g.data.accountId !== void 0) {
      S = "opendota_cached";
      const E = await l.playerHeroStats(g.data.accountId);
      if (E.ok && Array.isArray(E.data)) {
        const A = E.data.find(
          (C) => C && typeof C == "object" && C.hero_id === g.data.heroId
        );
        A && typeof A.games == "number" && (w = {
          games: A.games,
          wins: typeof A.win == "number" ? A.win : 0,
          losses: A.games - (typeof A.win == "number" ? A.win : 0)
        });
      }
      E.ok || (S = "stale");
    }
    const I = {
      playerLabel: g.data.playerLabel,
      heroId: g.data.heroId,
      playerHero: w,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: S
    };
    if (g.data.persist) {
      const E = await a.patchState({ heroStatsCard: I });
      return await n.broadcastFull(E), u.json({ ok: !0, card: I, persisted: E });
    }
    return u.json({ ok: !0, card: I });
  }), e.post("/api/opendota/compose/matchup-card", _, async (f, u) => {
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
      const S = await a.patchState({ matchupCard: y });
      return await n.broadcastFull(S), u.json({ ok: !0, upstream: p, matchupCard: y, persisted: S });
    }
    return u.json({ ok: !0, upstream: p, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", _, (f, u) => {
    l.purgeMemory(), u.json({ ok: !0 });
  }), e.get("/api/replays", _, async (f, u) => {
    try {
      const d = await o.getReplayState();
      u.json(d);
    } catch (d) {
      u.status(500).json({ error: d instanceof Error ? d.message : String(d) });
    }
  }), e.post("/api/replays/save", _, async (f, u) => {
    const g = s.object({ duration: s.number().nullable().optional() }).safeParse(f.body), p = g.success && g.data.duration || null, y = await o.triggerSaveReplay(p, i);
    u.json(y);
  }), e.post("/api/replays/next-match", _, async (f, u) => {
    const d = await o.nextMatch();
    u.json(d);
  }), e.post("/api/replays/generate-highlights", _, async (f, u) => {
    const g = s.object({ matchId: s.number() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.generateHighlights(g.data.matchId);
    u.json(p);
  }), e.post("/api/replays/hotkey", _, async (f, u) => {
    const g = s.object({ hotkeyName: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await i.triggerHotkeyByName(g.data.hotkeyName);
    u.json(p);
  }), e.post("/api/replays/hotkey-sequence", _, async (f, u) => {
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
  }), e.post("/api/replays/favorite", _, async (f, u) => {
    const g = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.toggleFavorite(g.data.file, g.data.favorite);
    u.json({ ok: p });
  }), e.post("/api/replays/play", _, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.playReplay(g.data.file, i);
    u.json(p);
  }), e.post("/api/replays/generate-preview", _, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.generatePreview(g.data.file);
    u.json(p);
  });
}
let Y = null, re = /* @__PURE__ */ new Map(), Le = null;
function Cr() {
  if (!(Y != null && Y.length)) {
    Le = null;
    return;
  }
  Le = Qa(Y);
}
async function X(t) {
  if (re.size > 0) return re;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (Y = e.data, re = new Map(Y.map((a) => [a.id, a])), Cr()), re;
}
function Te(t) {
  if (Le) return Xa(t, Le);
  if (t.heroId != null && t.heroId > 0) {
    const e = re.get(t.heroId);
    if (e) {
      const a = $(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = $(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Er(t) {
  return Te(t).slug;
}
function Ar(t, e) {
  const a = Te({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const r = re.get(t);
  if (r)
    return $(r.name) || void 0;
}
function be(t, e) {
  return Ya(
    Ar(t, e)
  );
}
function Pr(t, e) {
  return be(t, e).heroPortraitUrl;
}
function W(t) {
  const e = re.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function Rr(t) {
  if (t)
    return Xt(t);
}
function B(t, e) {
  return t.find((a) => a.steam32 === e);
}
function vr() {
  return Y ? [...Y].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function Dr() {
  var e;
  const t = (e = k.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Lr(t, e) {
  var l, o, m, c;
  const a = (l = k.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
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
    const f = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${h}`, u = await fetch(f);
    if (!u.ok) {
      const S = await u.text();
      throw new Error(`Steam match history HTTP ${u.status}: ${S.slice(0, 200)}`);
    }
    const d = await u.json(), g = (o = d.result) == null ? void 0 : o.status, p = ((m = d.result) == null ? void 0 : m.matches) ?? [];
    if (g !== void 0 && g !== 1 && p.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${g} for league ${t} (no matches in response)`
      );
    if (p.length === 0) break;
    for (const S of p)
      typeof S.match_id == "number" && S.match_id > 0 && r.push(S.match_id);
    const y = (c = p[p.length - 1]) == null ? void 0 : c.match_id;
    if (y === void 0 || p.length < 100) break;
    n = y - 1;
  }
  const i = [...new Set(r)].slice(0, e);
  return b.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function Tr(t, e = 80) {
  var o, m;
  const a = Dr(), r = [];
  if (!((o = k.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let n = [];
  if ((m = k.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      n = await Lr(t, e);
    } catch (c) {
      const h = c instanceof Error ? c.message : String(c);
      b.warn({ err: c, leagueId: t }, "Steam league match history failed"), r.push(h);
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
const Nr = 10;
function kt(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function It(t) {
  return t !== void 0 && t < 128;
}
function Mr(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function xr(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (n) => Mr(n.account_id) && typeof n.lane == "number" && n.lane > 0 && !n.is_roaming
  ), r = [...new Set(a.map((n) => n.lane))];
  for (const n of r) {
    const i = a.filter((d) => d.lane === n), l = i.filter((d) => It(d.player_slot)), o = i.filter((d) => !It(d.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...l.map(kt)), c = Math.max(0, ...o.map(kt)), h = m - c;
    let f;
    Math.abs(h) <= Nr ? f = "draw" : f = h > 0 ? "win" : "loss";
    const u = f === "draw" ? "draw" : f === "win" ? "loss" : "win";
    for (const d of l) e.set(d.account_id, f);
    for (const d of o) e.set(d.account_id, u);
  }
  return e;
}
function Hr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function Fe() {
  return [
    P.resolve(process.cwd(), "data/league-stats"),
    P.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function q() {
  var a;
  const t = (a = k.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return P.isAbsolute(t) ? t : P.resolve(process.cwd(), t);
  const e = k.LEAGUE_ID;
  for (const r of Fe())
    if (ht(P.join(r, `league_${e}_heroes.csv`)))
      return r;
  for (const r of Fe())
    if (ht(r)) return r;
  return Fe()[0];
}
function Ct(t) {
  const e = q(), a = we(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function Et(t, e) {
  const a = q(), r = we(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [r.heroes, r.playerHeroes],
    statsStorage: e
  };
}
function we(t) {
  const e = q();
  return {
    dir: e,
    heroes: P.join(e, `league_${t}_heroes.csv`),
    playerHeroes: P.join(e, `league_${t}_player_heroes.csv`),
    meta: P.join(e, `league_${t}_meta.json`)
  };
}
async function ue(t) {
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
function Fr(t) {
  const e = [];
  let a = "", r = !1;
  for (let n = 0; n < t.length; n++) {
    const i = t[n];
    r ? i === '"' ? t[n + 1] === '"' ? (a += '"', n++) : r = !1 : a += i : i === '"' ? r = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function At(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(Fr);
}
function L(t, e, a = 0) {
  const r = Number(t[e]);
  return Number.isFinite(r) ? r : a;
}
function Ie(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function Or(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, r = t.assists ?? 0;
  return !(e === 0 && a === 0 && r === 0 || (t.leaver_status ?? 0) >= 3);
}
function ma(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function Ur(t) {
  return t.filter((e) => !ma(e));
}
function ga(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || ma(a)) continue;
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
async function $r(t) {
  const e = we(t);
  if (!await ue(e.heroes))
    return null;
  try {
    const a = await Ae(e.heroes, "utf8"), r = At(a);
    if (r.length < 2) return null;
    const n = {};
    for (const o of r.slice(1)) {
      const m = L(o, 0);
      m <= 0 || (n[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: L(o, 2),
        bans: L(o, 3),
        wins: L(o, 4),
        losses: L(o, 5),
        games: L(o, 6),
        pickRate: Ie(o, 7),
        banRate: Ie(o, 8),
        winRate: Ie(o, 9),
        contestRate: Ie(o, 10)
      });
    }
    let i = [];
    if (await ue(e.playerHeroes)) {
      const o = await Ae(e.playerHeroes, "utf8"), m = At(o);
      for (const c of m.slice(1)) {
        const h = L(c, 0), f = L(c, 1);
        h <= 0 || f <= 0 || i.push({
          steam32: h,
          heroId: f,
          games: L(c, 2),
          wins: L(c, 3),
          kills: L(c, 4),
          deaths: L(c, 5),
          assists: L(c, 6),
          heroDamage: L(c, 7),
          goldPerMin: L(c, 8),
          lastHits: L(c, 9),
          maxKills: L(c, 10),
          laneWins: L(c, 11),
          laneDraws: L(c, 12),
          laneLosses: L(c, 13)
        });
      }
      i = Ur(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await ue(e.meta)) {
      const o = JSON.parse(await Ae(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: n, playerHeroes: i, meta: l };
  } catch (a) {
    return b.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function Br(t) {
  const { leagueId: e } = t.meta, a = we(e);
  await Yt(a.dir, { recursive: !0 });
  const n = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, c) => m.heroId - c.heroId
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
  await Ee(a.heroes, `# BPC league hero stats — league ${e}
${n.join(`
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
  return await Ee(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${l.join(`
`)}
`,
    "utf8"
  ), await Ee(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function fe(t) {
  const e = we(t), [a, r, n] = await Promise.all([
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
class Wr {
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
      await X(a);
      const o = await Tr(e, r), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && b.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const c = /* @__PURE__ */ new Map();
      let h = 0;
      for (let u = 0; u < m.length; u++) {
        const d = m[u];
        if (d === void 0) continue;
        b.info(
          { matchId: d, index: u + 1, total: m.length },
          "Aggregating league match"
        );
        let g = await a.matchDetails(d);
        (!g.ok || !((l = (i = g.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(d), g = await a.matchDetails(d)), g.ok && g.data && (g.data.leagueid != null && g.data.leagueid !== 0 && g.data.leagueid !== e ? b.warn(
          {
            matchId: d,
            expectedLeague: e,
            actualLeague: g.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(g.data, c), h += 1)), this.progress.matchDone = u + 1, this.progress.progress = Math.round(
          (u + 1) / Math.max(1, m.length) * 100
        ), n == null || n(this.getProgress());
      }
      if (h === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const f = {};
      for (const [u, d] of c) {
        const g = d.wins + d.losses, p = h > 0 ? d.picks / h : 0, y = h > 0 ? d.bans / h : 0, S = p + y, w = g > 0 ? d.wins / g : void 0;
        f[String(u)] = {
          heroId: u,
          heroName: W(u),
          picks: d.picks,
          bans: d.bans,
          wins: d.wins,
          losses: d.losses,
          games: g,
          pickRate: p,
          banRate: y,
          winRate: w,
          contestRate: S
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
      o ? m.wins += 1 : m.losses += 1, Or(i) && this.trackPlayerHero(l, i.hero_id, o, i, n.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, r, n, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof n.kills == "number" ? n.kills : 0, m = typeof n.deaths == "number" ? n.deaths : 0, c = typeof n.assists == "number" ? n.assists : 0, h = typeof n.hero_damage == "number" ? n.hero_damage : 0, f = typeof n.gold_per_min == "number" ? n.gold_per_min : 0, u = typeof n.last_hits == "number" ? n.last_hits : 0, d = l.get(a) ?? {
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
    d.games += 1, r && (d.wins += 1), i === "win" ? d.laneWins += 1 : i === "draw" ? d.laneDraws += 1 : i === "loss" && (d.laneLosses += 1), d.kills += o, d.deaths += m, d.assists += c, d.heroDamage += h, d.goldPerMin += f, d.lastHits += u, o > d.maxKills && (d.maxKills = o), l.set(a, d);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = Ba(e);
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
const j = new Wr();
async function qr(t) {
  const { leagueId: e, state: a, broadcast: r, source: n } = t, i = n === "csv" ? await $r(e) : null;
  if (!i) return !1;
  j.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: ga(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: n,
      statsCsvDir: q()
    }
  });
  return await r.broadcastFull(l), !0;
}
async function Je(t) {
  const e = await qr({ ...t, source: "csv" });
  return e && b.info(
    { leagueId: t.leagueId, dir: q() },
    "League stats loaded from CSV"
  ), e;
}
async function fa(t) {
  const { leagueId: e, state: a, opendota: r, broadcast: n } = t;
  if (j.isBusy()) {
    b.info("League aggregation already running");
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
    const l = await j.aggregateLeague(
      e,
      r,
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
        await n.broadcastFull(f);
      }
    ), o = j.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await Br({
      heroIndex: l,
      playerHeroes: j.exportPlayerHeroRows(),
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
      playerHeroIndex: ga(
        j.exportPlayerHeroRows()
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
        statsCsvDir: q()
      }
    });
    await n.broadcastFull(c), b.info(
      { leagueId: e, matches: o.matchTotal, dir: q() },
      "League aggregation ready — saved to CSV"
    );
  } catch (l) {
    const o = l instanceof Error ? l.message : String(l);
    b.error({ err: l, leagueId: e }, "League aggregation failed");
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
async function Vr(t) {
  var u, d, g, p;
  const { state: e, opendota: a, broadcast: r } = t, n = k.LEAGUE_ID, i = await e.getState();
  if ((((u = i.leagueConfig) == null ? void 0 : u.leagueId) !== n || ((d = i.leagueConfig) == null ? void 0 : d.leagueId) === null || ((g = i.leagueConfig) == null ? void 0 : g.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: n, aggregationStatus: "idle" }
  }), await Je({
    leagueId: n,
    state: e,
    broadcast: r
  })) return;
  const c = ((p = (await e.getState()).leagueConfig) == null ? void 0 : p.aggregationStatus) === "ready", h = j.getProgress().status === "ready";
  k.LEAGUE_AUTO_AGGREGATE && (!c || !h) && j.getProgress().status !== "running" ? (b.info({ leagueId: n }, "Starting league aggregation (Steam match list + OpenDota details)"), fa({ leagueId: n, state: e, opendota: a, broadcast: r })) : b.info(
    { leagueId: n, dir: q() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function Pt() {
  return {
    leagueId: k.LEAGUE_ID,
    autoAggregate: k.LEAGUE_AUTO_AGGREGATE,
    statsDir: q()
  };
}
class Re extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function Yr(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && j.getProgress().status === "ready";
}
function ie(t) {
  var a, r;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new Re(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new Re(
      ((r = t.leagueConfig) == null ? void 0 : r.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!Yr(t))
    throw new Re(
      "League stats not ready — run tournament aggregate first"
    );
}
function ha(t) {
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
    const c = m[0] ?? "Player", h = Number(m[1]);
    if (!Number.isFinite(h)) continue;
    let f, u, d, g;
    if (m.length >= 4) {
      if (f = m[2] || void 0, u = m[3] || void 0, m.length >= 5) {
        const p = m[4] ?? "";
        p.startsWith("http://") || p.startsWith("https://") ? g = p : d = ha(p);
      }
      if (m.length >= 6) {
        const p = m[5] ?? "";
        (p.startsWith("http://") || p.startsWith("https://")) && (g = p);
      }
    } else m.length === 3 && (u = m[2] || void 0, f = u == null ? void 0 : u.replace(/_/g, " "));
    n.push({ displayName: c, steam32: h, teamName: f, teamKey: u, teamColor: d, avatarUrl: g });
  }
  return n;
}
function Jr(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function Qr(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (r) => [
      r.displayName,
      String(r.steam32),
      r.teamName ?? "",
      r.teamKey ?? "",
      r.teamColor ?? "",
      r.avatarUrl ?? ""
    ].map(Jr).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function Rt(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function Qe(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const r = a.teamKey ?? Xr(a.teamName ?? "unknown"), n = a.teamName ?? Zr(r), i = e.get(r);
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
function Xe(t, e) {
  return Qe(t).find((a) => a.teamKey === e);
}
function pe(t) {
  return Xt(t);
}
function Xr(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Zr(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function vt(t, e, a) {
  return t && t.map((r) => {
    if (r.type !== "pick") return r;
    const n = He(a.matchSetup, e, r.order), i = Za(a, e, r.order);
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
function en(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: vt(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: vt(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Dt(t, e, a) {
  var i, l, o, m;
  const r = Xe(e, t.radiantTeamKey), n = Xe(e, t.direTeamKey);
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
      logoUrlA: pe(r.teamKey),
      logoUrlB: pe(n.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: r.teamName,
      logoUrl: pe(r.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: n.teamName,
      logoUrl: pe(n.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const Lt = /* @__PURE__ */ new Map();
async function pa(t, e) {
  var l, o, m;
  if (e <= 0) return;
  const a = Lt.get(e);
  if (a) return a;
  const r = await t.playerProfile(e);
  if (!r.ok || !r.data) return;
  const n = r.data, i = ((l = n.profile) == null ? void 0 : l.avatarfull) ?? n.avatarfull ?? ((o = n.profile) == null ? void 0 : o.avatarmedium) ?? n.avatarmedium ?? ((m = n.profile) == null ? void 0 : m.avatar) ?? n.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return Lt.set(e, i), i;
}
async function Tt(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var r;
      if ((r = a.avatarUrl) != null && r.trim()) return a;
      try {
        const n = await pa(e, a.steam32);
        return n ? { ...a, avatarUrl: n } : a;
      } catch (n) {
        return b.warn({ err: n, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const Ze = P.join(process.cwd(), "steam32-vanity-cache.json");
let te = null;
function tn() {
  if (te) return te;
  try {
    if (R.existsSync(Ze))
      return te = JSON.parse(R.readFileSync(Ze, "utf-8")), b.info({ count: Object.keys(te).length }, "[steam32] Loaded vanity cache from disk"), te;
  } catch {
  }
  return te = {}, te;
}
function an(t) {
  try {
    R.writeFileSync(Ze, JSON.stringify(t, null, 2));
  } catch (e) {
    b.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function rn(t, e) {
  return new Promise((a) => {
    const r = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    zt.get(r, (n) => {
      if (n.statusCode !== 200) {
        a(null);
        return;
      }
      let i = "";
      n.on("data", (l) => {
        i += l;
      }), n.on("end", () => {
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
async function nn(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const r = t.match(/\/id\/([^/?#]+)/);
  if (r != null && r[1]) {
    const n = r[1].trim().toLowerCase(), i = tn();
    if (i[n] != null)
      return b.debug({ vanity: n, steam32: i[n] }, "[steam32] Cache hit"), i[n];
    if (!e)
      return b.warn({ vanity: n }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await rn(n, e);
    return l != null && l > 0 ? (i[n] = l, an(i), b.info({ vanity: n, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : b.warn({ vanity: n }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return b.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function ne(t) {
  return new Promise((e, a) => {
    zt.get(t, (r) => {
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
async function sn(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  b.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await ne("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const l = await ne(`https://api.bpcleague.in/api/public/seasons/${e}`);
      l.snapshot && l.snapshot.teams ? a = l.snapshot.teams : l.tournament && l.tournament.teams ? a = l.tournament.teams : l.participations && (a = l.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (l) {
    throw b.error(l, "Failed to fetch season/tournament data from bpcleague.in"), l;
  }
  if (!a || a.length === 0)
    return b.warn("No teams found in bpcleague.in API response"), [];
  const r = [];
  for (const l of a) {
    const o = l.name.trim(), m = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), c = ha(l.accentColor) || "#ffffff";
    for (const h of l.players || [])
      r.push({ teamName: o, teamKey: m, teamColor: c, player: h });
  }
  b.info({ total: r.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const n = await Promise.all(
    r.map(
      ({ player: l }) => nn(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < r.length; l++) {
    const { teamName: o, teamKey: m, teamColor: c, player: h } = r[l], f = n[l], u = h.displayName || h.name || "Player", d = h.roles || [], g = h.mmr;
    f != null && f > 0 ? i.push({ displayName: u, steam32: f, teamName: o, teamKey: m, teamColor: c, roles: d, mmr: g }) : b.warn({ displayName: u, url: h.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return b.info({ count: i.length, total: r.length }, "Completed roster sync from bpcleague.in"), i;
}
async function on(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  b.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let r;
    e === "latest" || e === "active" ? r = await ne("https://api.bpcleague.in/api/public/tournament") : r = await ne(`https://api.bpcleague.in/api/public/seasons/${e}`);
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
    return b.error(r, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function ln() {
  b.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await ne("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return b.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function cn(t) {
  const e = t.trim().toLowerCase();
  b.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await ne("https://api.bpcleague.in/api/public/tournament") : a = await ne(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return b.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
function F(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function z(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function ya(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function Se(t, e) {
  return `${t}W / ${e}L`;
}
function Ne(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, r = t.laneLosses ?? 0;
  return e + a + r === 0 ? null : {
    label: "Lane",
    value: Hr(e, a, r),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function ba(t, e, a) {
  var n;
  const r = (n = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : n.avatarUrl;
  return r != null && r.trim() ? r : pa(t, e);
}
function un(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : Se(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${F(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${F(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${F(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? F(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function dn(t, e, a, r) {
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
          sublabel: `${F(r.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: F(r.winRate),
          sublabel: Se(r.wins, r.losses)
        }
      ] : []
    ];
  const n = a.games - a.wins, i = `${z(a.avgKills)} / ${z(a.avgDeaths)} / ${z(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Se(a.wins, n),
      sublabel: `${F(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: z(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: ya(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ne(a) ? [Ne(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...r ? [
      {
        label: "Hero in league",
        value: String(r.picks),
        sublabel: `${F(r.pickRate)} pick · ${F(r.winRate)} WR`
      }
    ] : []
  ];
}
function mn(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, r = `${z(e.avgKills)} / ${z(e.avgDeaths)} / ${z(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Se(e.wins, a),
      sublabel: `${F(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: z(e.avgKda),
      sublabel: `${r} per game`
    },
    {
      label: "Hero damage",
      value: ya(e.avgHeroDamage),
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
function Sa(t) {
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
async function ye(t, e, a) {
  await X(t);
  const r = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, n = r.heroName ?? W(e), i = be(e, n);
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
    statSlides: un(r),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function de(t, e, a, r, n, i, l) {
  await X(t);
  const o = ea(
    l,
    e,
    a
  ), m = n[String(a)], c = W(a), h = be(a, c), f = await ba(
    t,
    e,
    i
  );
  return {
    statsCardKind: "player-hero",
    steam32: e,
    playerLabel: r,
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
    playerHero: Sa(o),
    statSlides: dn(r, c, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function gn(t, e) {
  return Ge(e, t);
}
async function wa(t, e, a, r, n) {
  await X(t);
  const i = gn(e, r), l = await ba(
    t,
    e,
    n
  ), o = B(n ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: Rr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: Sa(i),
    statSlides: mn(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function _a(t, e, a) {
  await X(t);
  const r = await t.matchupBetween(e, a), n = r.ok && r.data && typeof r.data == "object" ? r.data : {}, i = typeof n.games_played == "number" ? n.games_played : void 0, l = typeof n.wins == "number" ? n.wins : typeof n.win == "number" ? n.win : void 0, o = W(e) || `Hero ${e}`, m = W(a) || `Hero ${a}`, c = l ?? 0, h = i !== void 0 ? i - c : 0;
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
  ], y = be(e), S = be(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: W(e),
    heroBName: W(a),
    heroAPortraitSlug: y.heroPortraitSlug,
    heroBPortraitSlug: S.heroPortraitSlug,
    heroAPortraitUrl: y.heroPortraitUrl,
    heroBPortraitUrl: S.heroPortraitUrl,
    matchup: n,
    statLines: p,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: r.ok ? "opendota_cached" : "stale"
  };
}
function st(t, e = 4e3) {
  var r, n, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: F((r = t.tournament) == null ? void 0 : r.winRate),
      sublabel: t.tournament ? Se(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((n = t.tournament) == null ? void 0 : n.picks) ?? "—"),
      sublabel: F((i = t.tournament) == null ? void 0 : i.pickRate)
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
async function fn(t) {
  return await X(t), vr();
}
class hn {
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
    b.info("Manual autopilot trigger requested"), await this.triggerRandomCard();
  }
  configure(e, a) {
    this.config = { ...this.config, ...e }, a && (this.state = a.state, this.opendota = a.opendota, this.broadcast = a.broadcast), this.config.enabled ? this.startTimer() : this.stopTimer();
  }
  startTimer() {
    if (this.stopTimer(), !this.state || !this.opendota || !this.broadcast) {
      b.warn("Autopilot cannot start: state, opendota or broadcast functions not configured.");
      return;
    }
    const e = this.config.intervalMinutes * 60 * 1e3;
    b.info({ intervalMinutes: this.config.intervalMinutes }, "Starting stats autopilot timer"), this.timer = setInterval(() => {
      this.triggerRandomCard();
    }, e);
  }
  stopTimer() {
    this.timer && (b.info("Stopping stats autopilot timer"), clearInterval(this.timer), this.timer = null);
  }
  async triggerRandomCard() {
    var e, a, r, n, i, l;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          b.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const c = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let h = m;
        c != null && c.radiantTeamKey && (c != null && c.direTeamKey) && (h = m.filter(
          (g) => g.teamKey === c.radiantTeamKey || g.teamKey === c.direTeamKey
        )), h.length === 0 && (h = m);
        const f = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], u = f[Math.floor(Math.random() * f.length)];
        b.info({ cardType: u }, "Autopilot: Triggering random stats card");
        const d = Date.now() + this.config.durationSeconds * 1e3;
        if (u === "player-league") {
          const g = h[Math.floor(Math.random() * h.length)], p = await wa(
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
          await this.broadcast.broadcastFull(y), b.info({ player: g.displayName }, "Autopilot: Displayed player league stats");
        } else if (u === "player-hero") {
          const g = h[Math.floor(Math.random() * h.length)], p = o.playerHeroIndex ?? {}, y = `${g.steam32}:`, S = Object.keys(p).filter((C) => C.startsWith(y)).map((C) => Number(C.split(":")[1]));
          let w = 1;
          if (S.length > 0)
            w = S[Math.floor(Math.random() * S.length)];
          else {
            const C = Object.keys(o.tournamentHeroIndex ?? {});
            C.length > 0 && (w = Number(C[Math.floor(Math.random() * C.length)]));
          }
          const I = await de(
            this.opendota,
            g.steam32,
            w,
            g.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), E = st(I, 4e3), A = await this.state.patchState({
            heroStatsCard: I,
            statCarousel: E,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(A), b.info({ player: g.displayName, heroId: w }, "Autopilot: Displayed player-hero stats carousel");
        } else if (u === "tournament-hero") {
          const g = Object.keys(o.tournamentHeroIndex ?? {});
          if (g.length === 0) return;
          const p = Number(g[Math.floor(Math.random() * g.length)]), y = await ye(
            this.opendota,
            p,
            o.tournamentHeroIndex ?? {}
          ), S = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(S), b.info({ heroId: p }, "Autopilot: Displayed tournament hero stats");
        } else if (u === "matchup") {
          const g = [
            ...((n = (r = o.draft) == null ? void 0 : r.radiant) == null ? void 0 : n.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
          ].filter((I) => I.heroId && I.heroId > 0);
          let p = 1, y = 2;
          if (g.length >= 2) {
            const I = g[Math.floor(Math.random() * g.length)];
            let E = g[Math.floor(Math.random() * g.length)];
            for (; E.heroId === I.heroId && g.length > 1; )
              E = g[Math.floor(Math.random() * g.length)];
            p = I.heroId, y = E.heroId;
          } else {
            const I = Object.keys(o.tournamentHeroIndex ?? {});
            if (I.length >= 2)
              for (p = Number(I[Math.floor(Math.random() * I.length)]), y = Number(I[Math.floor(Math.random() * I.length)]); y === p; )
                y = Number(I[Math.floor(Math.random() * I.length)]);
          }
          const S = await _a(this.opendota, p, y), w = await this.state.patchState({
            matchupCard: S,
            overlayVisibility: {
              matchup: { mode: "timed", until: d }
            }
          });
          await this.broadcast.broadcastFull(w), b.info({ heroA: p, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        b.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const ae = new hn();
function Ce(t, e) {
  return e instanceof Re ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function pn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  ae.configure({}, { state: a, opendota: n, broadcast: r }), e.get("/api/league/info", _, async (l, o) => {
    var h;
    const m = await a.getState(), c = await fe(k.LEAGUE_ID);
    o.json({
      ...Pt(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: c,
      steamApiConfigured: !!k.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((h = k.LEAGUE_MATCH_IDS) != null && h.trim())
    });
  }), e.post("/api/league/config", _, async (l, o) => {
    const c = s.object({ leagueId: s.number() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = await a.patchState({
      leagueConfig: { ...h.leagueConfig, leagueId: c.data.leagueId }
    });
    await r.broadcastFull(f), o.json({ ok: !0, leagueConfig: f.leagueConfig });
  }), e.post("/api/league/aggregate", _, async (l, o) => {
    var c, h, f;
    if (j.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const m = await a.getState();
    ((c = m.leagueConfig) == null ? void 0 : c.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: k.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), fa({
      leagueId: ((h = m.leagueConfig) == null ? void 0 : h.leagueId) ?? k.LEAGUE_ID,
      state: a,
      opendota: n,
      broadcast: r
    }), o.json({ ok: !0, started: !0, leagueId: ((f = m.leagueConfig) == null ? void 0 : f.leagueId) ?? k.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    _,
    async (l, o) => {
      var f;
      const m = (f = (await a.getState()).leagueConfig) == null ? void 0 : f.leagueId;
      if (!await Je({
        leagueId: m ?? k.LEAGUE_ID,
        state: a,
        broadcast: r
      })) {
        const u = await fe(m ?? k.LEAGUE_ID), d = u.heroesExists ? Et(m ?? k.LEAGUE_ID, u) : { ...Ct(m ?? k.LEAGUE_ID), statsStorage: u };
        return o.status(422).json(d);
      }
      const h = await a.getState();
      o.json({ ok: !0, leagueConfig: h.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    _,
    async (l, o) => {
      var h, f;
      const m = await fe(k.LEAGUE_ID), c = await a.getState();
      o.json({
        ...m,
        statsDir: Pt().statsDir,
        aggregationSource: (h = c.leagueConfig) == null ? void 0 : h.aggregationSource,
        aggregatedAt: (f = c.leagueConfig) == null ? void 0 : f.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    _,
    async (l, o) => {
      const m = j.getProgress(), c = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: j.isBusy(),
        leagueId: k.LEAGUE_ID,
        leagueConfig: c.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", _, async (l, o) => {
    const c = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = zr(c.data.csv), f = await Tt(h, n), u = Rt(f), d = await a.patchState({
      leagueConfig: { roster: f, teamColors: u, leagueId: k.LEAGUE_ID }
    });
    await r.broadcastFull(d), o.json({ ok: !0, count: f.length, teamColors: u, roster: f });
  }), e.post("/api/roster/sync-bpcleague", _, async (l, o) => {
    var h, f;
    const c = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    try {
      const u = c.data.seasonSlug || "season-1", d = await sn({
        seasonSlug: u,
        steamApiKey: k.STEAM_WEB_API_KEY
      }), g = await Tt(d, n), p = Rt(g), y = k.ROSTER_CSV_PATH;
      await Yt(P.dirname(y), { recursive: !0 });
      const S = Qr(g);
      await Ee(y, S, "utf8");
      const w = await cn(u);
      let I = [];
      w && w.sponsorsConfig && Array.isArray(w.sponsorsConfig.sponsors) && (I = w.sponsorsConfig.sponsors.map((C) => ({
        title: C.title || C.name || "",
        subtitle: C.subtitle || "",
        imageUrl: C.imageUrl || C.logoUrl || C.logo || "",
        color: C.color || "#ffffff",
        isCoSponsor: C.isCoSponsor || !1
      }))), I.length === 0 && (I = [
        { title: "BPC", subtitle: "Gaming", isCoSponsor: !0, color: "#ffffff", imageUrl: "" },
        { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: !1, color: "#ff0000", imageUrl: "" }
      ]);
      const E = await a.getState(), A = await a.patchState({
        leagueConfig: { roster: g, teamColors: p, leagueId: ((h = E.leagueConfig) == null ? void 0 : h.leagueId) ?? k.LEAGUE_ID, seasonSlug: u },
        sponsor: { banners: I, activeIndex: ((f = E.sponsor) == null ? void 0 : f.activeIndex) ?? 0 }
      });
      await r.broadcastFull(A), o.json({ ok: !0, count: g.length, teamColors: p, roster: g });
    } catch (u) {
      o.status(500).json({
        error: u instanceof Error ? u.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", _, async (l, o) => {
    var c;
    const m = await a.getState();
    o.json(((c = m.leagueConfig) == null ? void 0 : c.roster) ?? []);
  }), e.get("/api/teams", _, async (l, o) => {
    var h;
    const c = ((h = (await a.getState()).leagueConfig) == null ? void 0 : h.roster) ?? [];
    o.json(Qe(c));
  }), e.post("/api/match/setup", _, async (l, o) => {
    var d, g;
    const m = ra.safeParse(l.body);
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
      const S = Dt(
        p,
        h,
        c.draft
      ), w = await a.patchState({
        leagueConfig: { matchSetup: p },
        draft: S,
        production: {
          playerMappingPublished: !1
        }
      });
      await r.broadcastFull(w), o.json({
        ok: !0,
        matchSetup: p,
        teams: Qe(h),
        draft: w.draft
      });
    } catch (p) {
      o.status(400).json({
        error: p instanceof Error ? p.message : String(p)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    _,
    async (l, o) => {
      var E, A, C;
      const m = await a.getState(), c = ((E = m.leagueConfig) == null ? void 0 : E.roster) ?? [];
      if (c.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const h = ((A = m.leagueConfig) == null ? void 0 : A.leagueId) ?? k.LEAGUE_ID, f = await fe(h);
      if (!await Je({
        leagueId: h,
        state: a,
        broadcast: r
      })) {
        const M = f.heroesExists ? Et(h, f) : { ...Ct(h), statsStorage: f };
        return o.status(422).json(M);
      }
      const d = await a.getState(), g = d.playerHeroIndex ?? {}, p = Object.keys(g).length, y = [];
      for (const M of c) {
        const x = `${M.steam32}:`;
        Object.keys(g).some((H) => H.startsWith(x)) || y.push(M.steam32);
      }
      const S = new Set(
        Object.keys(g).map((M) => Number(M.split(":")[0]))
      ), w = (C = c[0]) == null ? void 0 : C.steam32, I = w != null ? Ke(g, w).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: c.length,
        csvPlayerCount: S.size,
        indexKeyCount: p,
        matchedRosterCount: c.length - y.length,
        missingSteam32: y,
        statsStorage: f,
        indexEmpty: p === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: I,
        leagueConfig: d.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    _,
    async (l, o) => {
      var w, I;
      const m = Number(l.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const c = await a.getState(), h = c.playerHeroIndex ?? {}, f = `${m}:`, u = Object.entries(h).filter(([E]) => E.startsWith(f)).map(([E, A]) => ({
        heroId: Number(E.split(":")[1]),
        games: A.games,
        wins: A.wins
      })), d = Ke(h, m), g = ((w = c.leagueConfig) == null ? void 0 : w.leagueId) ?? k.LEAGUE_ID, p = await fe(g);
      let y = [];
      try {
        y = (await Ae(p.playerHeroesPath, "utf8")).split(/\r?\n/).filter((A) => A.startsWith(`${m},`));
      } catch {
        y = [];
      }
      const S = y.reduce(
        (E, A) => E + (Number(A.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: g,
        gamesInIndex: d.games,
        winsInIndex: d.wins,
        heroRows: u,
        csvRowCount: y.length,
        csvGamesSum: S,
        aggregationMatchTotal: (I = c.leagueConfig) == null ? void 0 : I.aggregationMatchTotal,
        hint: d.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : d.games < S ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    _,
    async (l, o) => {
      var w, I, E, A, C;
      const m = s.object({ pickPlayers: aa.optional() }).safeParse(l.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const c = await a.getState(), h = (w = c.leagueConfig) == null ? void 0 : w.matchSetup, f = ((I = c.leagueConfig) == null ? void 0 : I.roster) ?? [], u = c.draft;
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
          radiant: d.radiant ?? ((E = h.pickPlayers) == null ? void 0 : E.radiant),
          dire: d.dire ?? ((A = h.pickPlayers) == null ? void 0 : A.dire)
        }
      } : h, p = {
        ...c.leagueConfig,
        roster: f,
        matchSetup: g
      }, y = en(u, p), S = await a.patchState({
        leagueConfig: { matchSetup: g },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await r.broadcastFull(S), o.json({
        ok: !0,
        matchSetup: (C = S.leagueConfig) == null ? void 0 : C.matchSetup,
        draft: S.draft,
        production: S.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    _,
    async (l, o) => {
      var g, p, y;
      const m = await a.getState(), c = ((g = m.leagueConfig) == null ? void 0 : g.roster) ?? [], h = (p = m.leagueConfig) == null ? void 0 : p.matchSetup, f = (((y = m.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let u = null;
      h && c.length > 0 && (u = Dt(
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
      await r.broadcastFull(d), o.json({
        ok: !0,
        overlayDraftEpoch: f,
        draft: d.draft
      });
    }
  ), e.post("/api/league/team-colors", _, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", _, async (l, o) => {
    const m = await fn(n);
    o.json(m);
  }), e.post("/api/stats/player-hero", _, async (l, o) => {
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
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = B(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, d = await de(
      n,
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
      return await r.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post("/api/stats/player-league", _, async (l, o) => {
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
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = B(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, d = await wa(
      n,
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
      return await r.broadcastFull(p), o.json({ ok: !0, card: d, persisted: p });
    }
    o.json({ ok: !0, card: d });
  }), e.post(
    "/api/stats/tournament-hero",
    _,
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
      const f = await ye(
        n,
        c.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
      if (c.data.persist) {
        const u = await a.patchState({
          heroStatsCard: f,
          statCarousel: null
        });
        return await r.broadcastFull(u), o.json({ ok: !0, card: f, persisted: u });
      }
      o.json({ ok: !0, card: f });
    }
  ), e.post("/api/stats/matchup", _, async (l, o) => {
    const c = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    await a.getState();
    const h = await _a(
      n,
      c.data.heroAId,
      c.data.heroBId
    );
    if (c.data.persist) {
      const f = await a.patchState({ matchupCard: h });
      return await r.broadcastFull(f), o.json({ ok: !0, card: h, persisted: f });
    }
    o.json({ ok: !0, card: h });
  }), e.post("/api/producer/h2h", _, async (l, o) => {
    var S;
    const c = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = ((S = h.leagueConfig) == null ? void 0 : S.roster) ?? [], u = B(f, c.data.player1Steam32), d = B(f, c.data.player2Steam32);
    if (!u || !d)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      ie(h);
    } catch (w) {
      return o.status(503).json({ error: w.message });
    }
    const g = Ge(h.playerHeroIndex, c.data.player1Steam32), p = Ge(h.playerHeroIndex, c.data.player2Steam32), y = {
      player1: { ...u, stats: g },
      player2: { ...d, stats: p }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", _, async (l, o) => {
    var p, y, S, w, I, E, A;
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
      const M = C.side === "dire" || C.side === "B" ? "dire" : "radiant", x = M === "radiant" ? (w = (S = h.draft) == null ? void 0 : S.radiant) == null ? void 0 : w.slots : (E = (I = h.draft) == null ? void 0 : I.dire) == null ? void 0 : E.slots, O = Zt(M, C.heroId, x), H = O !== void 0 ? He((A = h.leagueConfig) == null ? void 0 : A.matchSetup, M, O) : void 0, V = H != null && H > 0 ? B(f, H) : void 0;
      u = V && H ? await de(
        n,
        H,
        C.heroId,
        V.displayName,
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      ) : await ye(
        n,
        C.heroId,
        h.tournamentHeroIndex ?? {}
      );
    } else if (c.data.type === "player-hero") {
      if (c.data.heroId === void 0 || c.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const C = B(f, c.data.steam32);
      u = await de(
        n,
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
      u = await ye(
        n,
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
      return await r.broadcastFull(C), o.json({ ok: !0, card: u, carousel: d, persisted: C });
    }
    o.json({ ok: !0, card: u, carousel: d });
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
    const c = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.patchState({ production: c.data });
    await r.broadcastFull(h), o.json(h.production);
  }), e.get("/api/league/bpc-matches", _, async (l, o) => {
    const m = l.query.seasonSlug, c = await on(m);
    o.json(c);
  }), e.get("/api/league/bpc-seasons", _, async (l, o) => {
    const m = await ln();
    o.json(m);
  }), e.get("/api/autopilot/config", _, (l, o) => {
    o.json({
      config: ae.getConfig(),
      isActive: ae.isActive()
    });
  }), e.post("/api/autopilot/config", _, (l, o) => {
    const c = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    ae.configure(c.data), o.json({
      config: ae.getConfig(),
      isActive: ae.isActive()
    });
  }), e.post("/api/autopilot/trigger", _, async (l, o) => {
    await ae.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const yn = /* @__PURE__ */ new Set([
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
    const r = Number(a);
    if (Number.isFinite(r) && r > 0) return r;
  }
  return null;
}
function ve(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const Nt = /* @__PURE__ */ new Set();
function bn() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function Sn(t, e, a, r) {
  bn() && (Nt.has(t) || (Nt.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: r.slug,
    source: r.source
  })));
}
function wn(t, e, a, r) {
  const n = Te({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  r && Sn(r, t, e, n);
  const i = n.slug ?? Er({ heroId: t, heroClass: e });
  if (i)
    return { ...Ja(i), slug: i };
  if (t) {
    const l = Pr(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: Te({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Mt(t, e) {
  if (t) return W(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function xt(t, e, a) {
  const r = `${e}${a}`, n = N(t[`${r}_id`]), i = ve(t[`${r}_class`]);
  if (!n && !i)
    return null;
  const l = {};
  return n > 0 && (l.hero_id = n), i && (l.class = i), l;
}
function Ht(t, e) {
  var i;
  const a = [], r = /* @__PURE__ */ new Set(), n = (l, o, m, c) => {
    const h = `${l}-${o}`;
    if (r.has(h) || (r.add(h), !m && !c)) return;
    const f = wn(
      m,
      c,
      Mt(m, c),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: m,
      heroName: Mt(m, c),
      heroPortraitSlug: f.slug,
      heroPortraitUrl: f.staticUrl,
      heroPortraitAnimatedUrl: f.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(l);
    if (!m) continue;
    const c = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", h = Number(m[2]), f = et(o), u = v(o), d = ve((u == null ? void 0 : u.class) ?? (u == null ? void 0 : u.hero_class));
    n(c, h, f, d);
  }
  for (let l = 0; l < 7; l++) {
    const o = xt(t, "ban", l);
    o && n(
      "ban",
      l,
      N(o.hero_id) > 0 ? N(o.hero_id) : null,
      ve(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = xt(t, "pick", l);
    o && n(
      "pick",
      l,
      N(o.hero_id) > 0 ? N(o.hero_id) : null,
      ve(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function jt(t, e) {
  return (e === "radiant" ? v(t.radiant) ?? v(t.team2) : v(t.dire) ?? v(t.team3)) ?? {};
}
function _n(t) {
  const e = t.activeteam ?? t.active_team;
  return e === 2 || e === "2" || e === "radiant" ? "radiant" : e === 3 || e === "3" || e === "dire" ? "dire" : null;
}
function N(t) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const e = Number(t);
    if (Number.isFinite(e)) return e;
  }
  return 0;
}
function kn(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function In(t, e) {
  const a = v(t.team2), r = v(t.team3), n = N(t.radiant_bonus_time) || N(a == null ? void 0 : a.bonus_time), i = N(t.dire_bonus_time) || N(r == null ? void 0 : r.bonus_time);
  return e === "radiant" ? n : e === "dire" ? i : Math.max(n, i);
}
const Ft = 7, Ot = 5;
function J(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Me(t, e) {
  return J(t, "pick") >= Ot && J(e, "pick") >= Ot;
}
function tt(t, e) {
  return J(t, "ban") > 0 || J(e, "ban") > 0 || J(t, "pick") > 0 || J(e, "pick") > 0;
}
function Cn(t, e, a) {
  const r = N(t == null ? void 0 : t.clock_time), n = N(
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
function En(t, e, a, r, n) {
  if (!t || Me(a, r))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !tt(a, r) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !tt(a, r) && !n)
    return "starting";
  const i = J(a, "ban"), l = J(r, "ban");
  return i < Ft || l < Ft ? "bans" : "picks";
}
function Ut(t) {
  const e = v(t);
  if (!e) return null;
  const a = v(e.hero);
  if (a) {
    const r = et(a);
    if (r) return r;
  }
  return et(t);
}
function An(t, e) {
  const a = /* @__PURE__ */ new Map(), r = v(t.player), n = v(t.hero), i = e === "radiant" ? v(n == null ? void 0 : n.team2) ?? v(n == null ? void 0 : n.radiant) : v(n == null ? void 0 : n.team3) ?? v(n == null ? void 0 : n.dire), l = e === "radiant" ? v(r == null ? void 0 : r.team2) ?? v(r == null ? void 0 : r.radiant) : v(r == null ? void 0 : r.team3) ?? v(r == null ? void 0 : r.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]) % 5, f = Ut(m);
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
      const u = Ut(m);
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
function $t(t, e, a) {
  const r = Array.from(An(a, e).values());
  return t.map((n) => {
    if (n.type !== "pick" || !n.heroId) return n;
    const i = r.find((l) => l.heroId === n.heroId);
    return i ? {
      ...n,
      steam32: i.steam32 ?? n.steam32
    } : n;
  });
}
const Pn = [
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
], Rn = [
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
function Bt(t, e, a) {
  const n = (a === "dire_first_pick" ? Rn : Pn).findIndex((i) => i.side === t && i.order === e);
  return n >= 0 ? n : e;
}
function Kt(t, e) {
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
function Gt(t, e) {
  let a = t[0], r = Bt(a.side, a.slot.order, e);
  for (const n of t.slice(1)) {
    const i = Bt(n.side, n.slot.order, e);
    i > r && (a = n, r = i);
  }
  return a;
}
function vn(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function Dn(t, e, a) {
  var m, c, h, f;
  const r = [];
  for (const u of t)
    u.type === "pick" && u.heroId && r.push({ side: "radiant", slot: u });
  for (const u of e)
    u.type === "pick" && u.heroId && r.push({ side: "dire", slot: u });
  if (r.length === 0) return;
  const n = /* @__PURE__ */ new Set();
  for (const u of ["radiant", "dire"]) {
    const d = u === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (c = a == null ? void 0 : a.dire) == null ? void 0 : c.slots;
    for (const g of d ?? []) {
      const p = Kt(u, g);
      p && n.add(p);
    }
  }
  const i = r.filter(
    ({ side: u, slot: d }) => !n.has(Kt(u, d))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Me(t, e) && a && !Me(((h = a.radiant) == null ? void 0 : h.slots) ?? [], ((f = a.dire) == null ? void 0 : f.slots) ?? [])) {
      const u = Gt(r, l), d = Oe(u.side, u.slot);
      if (vn(a.lastPick, d)) return d;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const u = i[0];
    return Oe(u.side, u.slot);
  }
  const o = Gt(i, l);
  return Oe(o.side, o.slot);
}
function Wt(t, e, a, r, n) {
  var o, m;
  if (!t)
    return {
      name: r,
      logoUrl: e === "radiant" ? ((o = n == null ? void 0 : n.radiant) == null ? void 0 : o.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlA) : ((m = n == null ? void 0 : n.dire) == null ? void 0 : m.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = Xe(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: pe(l.teamKey)
  } : { name: r };
}
function Ln(t, e, a, r) {
  var V, me;
  const n = v(t.map), i = typeof (n == null ? void 0 : n.game_state) == "string" ? n.game_state : "", l = yn.has(i), o = v(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (n == null ? void 0 : n.team_name_radiant) == "string" ? n.team_name_radiant : "Radiant", c = typeof (n == null ? void 0 : n.team_name_dire) == "string" ? n.team_name_dire : "Dire", h = Wt(
    r,
    "radiant",
    a,
    m,
    e
  ), f = Wt(
    r,
    "dire",
    a,
    c,
    e
  ), u = o ?? {}, d = jt(u, "radiant"), g = jt(u, "dire");
  let p = Ht(d, "radiant"), y = Ht(g, "dire");
  Me(p, y) && (p = $t(p, "radiant", t), y = $t(y, "dire", t));
  const w = o ? _n(u) : null, I = N(
    u.activeteam_time_remaining ?? u.active_team_time_remaining
  ), E = o ? kn(u) : void 0, A = o ? In(u, w) : 0, C = [
    ...p.map((T) => ({
      team: "A",
      heroId: T.heroId,
      player: T.playerName,
      isBan: T.type === "ban",
      order: T.order,
      heroName: T.heroName,
      heroPortraitUrl: T.heroPortraitUrl
    })),
    ...y.map((T) => ({
      team: "B",
      heroId: T.heroId,
      player: T.playerName,
      isBan: T.type === "ban",
      order: T.order,
      heroName: T.heroName,
      heroPortraitUrl: T.heroPortraitUrl
    }))
  ], M = Dn(p, y, e), x = En(
    l,
    i,
    p,
    y,
    w
  );
  let O = Cn(n, i, u);
  x === "starting" && O === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? O = e.startSecondsRemaining : I > 0 && !tt(p, y) && (O = I));
  const H = {
    source: "gsi",
    phase: x,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(A)),
    activeTeam: x === "starting" ? null : w,
    turnAction: x === "starting" ? void 0 : E,
    startSecondsRemaining: x === "starting" ? Math.max(
      0,
      Math.round(
        O ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: x === "starting" ? void 0 : Math.max(0, Math.round(I)),
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
      bonusTime: Math.max(0, Math.round(N(u.radiant_bonus_time) || N((V = v(u.team2)) == null ? void 0 : V.bonus_time) || 0))
    },
    dire: {
      name: f.name,
      logoUrl: f.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(N(u.dire_bonus_time) || N((me = v(u.team3)) == null ? void 0 : me.bonus_time) || 0))
    },
    picksBansOrder: C,
    lastPick: M
  };
  return { inDraft: l || !!o, draftPatch: H };
}
const xe = {};
let qt = !1;
async function Tn() {
  if (qt) return;
  qt = !0;
  const t = Object.keys(at).map((e) => e.replace("item_", ""));
  b.info({ items: t.length }, "Preloading average item timings from OpenDota..."), (async () => {
    for (const e of t)
      try {
        const a = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?item=${e}`, {
          signal: AbortSignal.timeout(3e4)
          // 30s timeout per item
        });
        if (!a.ok) {
          b.warn({ item: e, status: a.status }, "Failed to fetch item timing from OpenDota");
          continue;
        }
        const r = await a.json(), n = {};
        for (const i of r) {
          if (!i.hero_id || !i.time || !i.games) continue;
          const l = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          n[l] || (n[l] = { sum: 0, totalGames: 0 }), n[l].sum += o * m, n[l].totalGames += m;
        }
        xe[e] = {};
        for (const [i, l] of Object.entries(n))
          l.totalGames > 0 && (xe[e][Number(i)] = Math.round(l.sum / l.totalGames));
        b.debug({ item: e, heroesIndexed: Object.keys(n).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        b.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    b.info("Finished preloading average item timings.");
  })();
}
function Nn(t, e) {
  const a = e.replace("item_", "");
  return xe[a] ? xe[a][t] ?? null : null;
}
const Ue = /* @__PURE__ */ new Map(), at = {
  item_blink: { name: "Blink Dagger", category: "CRITICAL MOBILITY" },
  item_black_king_bar: { name: "Black King Bar", category: "MAGIC IMMUNITY" },
  item_rapier: { name: "Divine Rapier", category: "ALL IN" },
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
function Mn(t, e, a) {
  var r, n;
  try {
    return ((n = (r = t == null ? void 0 : t.items) == null ? void 0 : r[e]) == null ? void 0 : n[a]) || {};
  } catch {
    return {};
  }
}
function xn(t, e, a) {
  var r, n;
  try {
    const i = (n = (r = t == null ? void 0 : t.hero) == null ? void 0 : r[e]) == null ? void 0 : n[a];
    return i ? {
      id: Number(i.hero_id ?? i.id ?? 0),
      name: i.name || "unknown_hero"
    } : { id: 0, name: "unknown_hero" };
  } catch {
    return { id: 0, name: "unknown_hero" };
  }
}
function Hn(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.player) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function jn(t, e) {
  var n;
  if (!(t != null && t.items)) return;
  const a = ((n = t == null ? void 0 : t.map) == null ? void 0 : n.clock_time) || 0;
  if (a < 0) return;
  const r = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, c = Mn(t, i, m), h = Hn(t, i, m);
      if (!h || h === "Unknown Player") continue;
      Ue.has(h) || Ue.set(h, /* @__PURE__ */ new Set());
      const f = Ue.get(h), u = /* @__PURE__ */ new Set();
      for (const d in c) {
        const g = (l = c[d]) == null ? void 0 : l.name;
        g && g !== "empty" && u.add(g);
      }
      for (const d of u)
        if (!f.has(d) && (f.add(d), at[d])) {
          const g = xn(t, i, m), p = g.id > 0 ? W(g.id) : g.name, y = at[d], S = Nn(g.id, d);
          let w = null;
          S !== null && a > 0 && (w = a - S), b.info({ playerName: h, cleanHeroName: p, item: d, hypeData: y, clockTime: a, averageTime: S, timingDiff: w }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: h,
            heroName: p,
            item: d,
            cleanItemName: y.name,
            categoryText: y.category,
            clockTime: a,
            averageTime: S,
            timingDiff: w
          });
        }
    }
  };
  r("team2"), r("team3");
}
function Fn(t) {
  if (!t || typeof t != "object") return null;
  const e = (a) => {
    var i, l;
    const r = (i = t.hero) == null ? void 0 : i[a], n = (l = t.player) == null ? void 0 : l[a];
    if (!r || !n) return null;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, c = r[m], h = n[m];
      if (c && typeof c == "object" && c.selected_unit === !0) {
        let f = null;
        const u = c.hero_id ?? c.heroid ?? c.id;
        if (typeof u == "number" && u > 0)
          f = u;
        else if (typeof u == "string") {
          const p = Number(u);
          Number.isFinite(p) && p > 0 && (f = p);
        }
        let d = null;
        if (h && typeof h == "object" && h.accountid) {
          const p = parseInt(String(h.accountid), 10);
          Number.isFinite(p) && p > 0 && (d = p);
        }
        let g = "Unknown";
        if (h && typeof h == "object" && typeof h.name == "string" && (g = h.name), f && d)
          return { steam32: d, heroId: f, playerName: g };
      }
    }
    return null;
  };
  return e("team2") || e("team3");
}
let ce = 0, $e = null;
function On(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var y, S;
    const m = typeof l.query.token == "string" ? l.query.token : void 0;
    if (k.GSI_TOKEN && m !== k.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const c = l.body;
    ce = Date.now(), await X(n);
    try {
      jn(c, i);
    } catch (w) {
      b.error(w, "Power spike evaluation failed");
    }
    const h = await a.getState(), f = ((y = h.leagueConfig) == null ? void 0 : y.roster) ?? [], u = ((S = h.leagueConfig) == null ? void 0 : S.matchSetup) ?? null, d = Ln(
      c,
      h.draft ?? null,
      f,
      u
    ), g = Fn(c);
    g && (d.focusedPlayerSteam32 = g.steam32, d.focusedPlayerHeroId = g.heroId, d.focusedPlayerName = g.playerName);
    const p = async () => {
      var C, M, x, O, H, V, me, T, ot, it, lt, ct, ut, dt, mt, gt;
      const w = await a.getState();
      let I = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      if (d.draftPatch && (I = {
        ...I,
        draft: {
          ...w.draft ?? {
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
      }), g) {
        const U = d.focusedPlayerSteam32, Z = d.focusedPlayerHeroId, je = d.focusedPlayerName;
        if (U && Z && (((C = w.livePlayerCard) == null ? void 0 : C.steam32) !== U || ((M = w.livePlayerCard) == null ? void 0 : M.heroId) !== Z)) {
          const se = B(f, U), ee = (se == null ? void 0 : se.displayName) || je || "Unknown", ge = await de(
            n,
            U,
            Z,
            ee,
            w.tournamentHeroIndex ?? {},
            f,
            w.playerHeroIndex
          ).catch((_e) => (b.error(_e, "failed to build live player card"), null));
          ge && (I = {
            ...I,
            livePlayerCard: ge
          });
        }
      }
      const E = await a.patchState(I);
      await r.broadcastFull(E);
      const A = ((x = d.draftPatch) == null ? void 0 : x.lastPick) && (!((O = w.draft) != null && O.lastPick) || d.draftPatch.lastPick.heroId !== w.draft.lastPick.heroId || d.draftPatch.lastPick.side !== w.draft.lastPick.side);
      if ((H = w.production) != null && H.autoShowStatsOnPick && A) {
        try {
          ie(w);
        } catch {
          return;
        }
        const U = (V = d.draftPatch) == null ? void 0 : V.lastPick;
        if (!U) return;
        const Z = U.side === "dire" || U.side === "B" ? "dire" : "radiant", je = Z === "radiant" ? ((T = (me = d.draftPatch) == null ? void 0 : me.radiant) == null ? void 0 : T.slots) ?? ((it = (ot = w.draft) == null ? void 0 : ot.radiant) == null ? void 0 : it.slots) : ((ct = (lt = d.draftPatch) == null ? void 0 : lt.dire) == null ? void 0 : ct.slots) ?? ((dt = (ut = w.draft) == null ? void 0 : ut.dire) == null ? void 0 : dt.slots), se = Zt(Z, U.heroId, je), ee = se !== void 0 ? He((mt = w.leagueConfig) == null ? void 0 : mt.matchSetup, Z, se) : void 0, ge = ((gt = w.leagueConfig) == null ? void 0 : gt.roster) ?? [], _e = ee != null && ee > 0 ? B(ge, ee) : void 0, ft = _e && ee ? await de(
          n,
          ee,
          U.heroId,
          _e.displayName,
          w.tournamentHeroIndex ?? {},
          ge,
          w.playerHeroIndex
        ) : await ye(
          n,
          U.heroId,
          w.tournamentHeroIndex ?? {}
        ), ka = st(ft), Ia = Date.now() + 12e3, Ca = await a.patchState({
          heroStatsCard: ft,
          statCarousel: ka,
          overlayVisibility: {
            herostats: { mode: "timed", until: Ia }
          }
        });
        await r.broadcastFull(Ca);
      }
    };
    $e && clearTimeout($e), $e = setTimeout(() => {
      p().catch((w) => b.error(w, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: d.inDraft });
  }), e.get("/gsi/status", (l, o) => {
    o.json({
      lastSeen: ce ? new Date(ce).toISOString() : null,
      connected: Date.now() - ce < 5e3
    });
  });
}
function Un(t, e, a) {
  var r, n;
  (n = (r = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - ce > 8e3 && ce > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || n.call(r);
}
function Vt(t, e) {
  var n, i;
  const a = e.handshake;
  let r = "";
  return typeof ((n = a.auth) == null ? void 0 : n.token) == "string" ? r = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (r = a.query.token), r ? r === k.BROADCAST_SECRET : t === "overlay";
}
async function $n(t) {
  const { state: e, obs: a, opendota: r } = t, n = he();
  n.use(Ta({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), n.disable("x-powered-by"), n.use(
    La({
      origin: k.NODE_ENV === "production" ? pt() : !0,
      credentials: !0
    })
  ), n.use(he.json({ limit: "1mb" }));
  const i = P.dirname(rt(import.meta.url)), l = P.join(i, "../../overlay-web/dist"), o = P.join(i, "../../admin-web/dist");
  n.use("/overlay", he.static(l)), n.use("/admin", he.static(o)), n.get("/admin", (g, p) => {
    const y = P.join(o, "index.html");
    p.sendFile(y, (S) => {
      S && p.status(500).send(`sendFile error for ${y}: ${S.message}`);
    });
  }), n.get("/admin/*", (g, p) => {
    const y = P.join(o, "index.html");
    p.sendFile(y, (S) => {
      S && p.status(500).send(`sendFile error for ${y}: ${S.message}`);
    });
  }), n.get("/overlay", (g, p) => {
    const y = P.join(l, "index.html");
    p.sendFile(y, (S) => {
      S && p.status(500).send(`sendFile error for ${y}: ${S.message}`);
    });
  }), n.get("/overlay/*", (g, p) => {
    const y = P.join(l, "index.html");
    p.sendFile(y, (S) => {
      S && p.status(500).send(`sendFile error for ${y}: ${S.message}`);
    });
  });
  const m = Na.createServer(n), c = new Ma(m, {
    cors: k.NODE_ENV === "production" ? { origin: pt() } : { origin: !0 },
    transports: ["websocket", "polling"]
  }), h = {
    async broadcastFull(g) {
      const p = g ?? await e.getState();
      c.of(G.OVERLAY).emit(K.STATE_FULL, p), c.of(G.PRODUCER).emit(
        K.STATE_FULL,
        p
      ), b.debug({ seq: p.seq }, "Emitted state snapshot");
    }
  };
  Ir({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    obs: a,
    opendota: r
  }), pn({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    opendota: r
  }), On({
    app: n,
    state: e,
    broadcast: h,
    opendota: r,
    io: c
  }), Un(e, h);
  const f = c.of(G.PRODUCER), u = c.of(G.OVERLAY);
  f.use((g, p) => {
    const y = Vt("producer", g);
    p(y ? void 0 : new Error("unauthorized producer"));
  }), u.use((g, p) => {
    const y = Vt("overlay", g);
    p(y ? void 0 : new Error("unauthorized overlay"));
  }), f.on("connection", (g) => {
    b.info({ id: g.id }, "producer connected"), e.getState().then((p) => {
      g.emit(K.STATE_FULL, p);
    });
  }), u.on("connection", (g) => {
    b.info({ id: g.id }, "overlay viewer connected"), e.getState().then((p) => {
      g.emit(K.STATE_FULL, p);
    });
  });
  const d = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(d) && d > 500) {
    const g = setInterval(() => {
      e.getState().then((p) => {
        c.of(G.OVERLAY).emit(K.STATE_FULL, p);
      });
    }, d);
    typeof g.unref == "function" && g.unref();
  }
  return { app: n, httpServer: m, io: c, broadcast: h };
}
async function Bn() {
  const t = await wr(), e = new Ua(), a = new Ka();
  k.REDIS_URL && a.attachRedis(k.REDIS_URL), X(a).catch(
    (i) => b.warn(i, "hero registry preload deferred")
  ), Tn().catch(
    (i) => b.warn(i, "item timings preload deferred")
  );
  const r = await $n({ state: t, obs: e, opendota: a });
  await Vr({
    state: t,
    opendota: a,
    broadcast: r.broadcast
  }), r.httpServer.listen(k.PORT, () => {
    b.info(
      { port: k.PORT, leagueId: k.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const n = async () => {
    var i;
    b.info("Shutting down"), await r.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), r.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void n()), process.on("SIGTERM", () => void n()), { obs: e, opendota: a, state: t, shutdown: n };
}
process.argv[1] && rt(import.meta.url) === process.argv[1] && Bn().catch((t) => {
  b.error(t, "fatal startup"), process.exit(1);
});
export {
  Bn as bootstrapBroadcastServer
};

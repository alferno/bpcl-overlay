var qn = Object.defineProperty;
var Yn = (t, e, a) => e in t ? qn(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var j = (t, e, a) => Yn(t, typeof e != "symbol" ? e + "" : e, a);
import v from "node:path";
import { fileURLToPath as Nt } from "node:url";
import { config as zn } from "dotenv";
import { z as s } from "zod";
import { logger as _ } from "./logger-pykWGsbv.js";
import Jn from "obs-websocket-js";
import Xn from "bottleneck";
import { Redis as Ht } from "ioredis";
import Qn from "cors";
import Ne from "express";
import Zn from "helmet";
import er from "node:http";
import { Server as tr } from "socket.io";
import R, { existsSync as Pa } from "node:fs";
import { exec as ar } from "node:child_process";
import { promisify as nr } from "node:util";
import { mkdir as gn, writeFile as Be, access as rr, readFile as We } from "node:fs/promises";
import fn from "node:https";
const sr = v.dirname(Nt(import.meta.url));
zn({ path: v.resolve(sr, "../.env") });
const or = s.object({
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
}), E = or.parse(process.env);
class ir {
  constructor() {
    j(this, "client", new Jn());
    j(this, "settings", null);
    j(this, "reconnectTimer", null);
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
      ), _.info("OBS websocket connected"), { ok: !0 };
    } catch (a) {
      return _.error(a, "OBS websocket connect failed"), {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async disconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null), this.isConnected() && await this.client.disconnect().catch(() => {
    }), _.info("OBS websocket disconnected");
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
const lr = "https://api.opendota.com/api";
function cr(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class ur {
  constructor(e = 600) {
    j(this, "limiter");
    j(this, "memory", /* @__PURE__ */ new Map());
    j(this, "redis", null);
    this.ttlSeconds = e;
    const a = E.OPENDOTA_RATE_PER_MINUTE, n = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new Xn({
      minTime: n,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new Ht(e);
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
        _.warn(c, "Redis OpenDota read failed");
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
        const n = await fetch(`${lr}${e}`, {
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
const he = "Game starting in", hn = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), dr = hn.partial();
function Ve(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function mr(t, e, a = Date.now()) {
  if (e.running === !0) {
    const r = e.secondsRemaining ?? (t ? Ve(t, a) : 0), i = Math.max(0, Math.floor(r));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? he,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const r = e.secondsRemaining ?? (t ? Ve(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? he,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(r))
    };
  }
  const n = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? he,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? Ve(t, a) : 0)
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
function va(t, e = he) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function Ra(t, e = he) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const gr = {
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
function fr(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (gr[e] ?? e);
}
function ee(t) {
  return fr(t.replace(/^npc_dota_hero_/, "").trim());
}
function hr(t) {
  if (!t)
    return {};
  const e = ee(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: pn(e)
  } : {};
}
function pn(t, e) {
  const a = ee(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function pr(t, e) {
  const a = ee(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function yr(t, e) {
  const a = ee(t);
  if (!a)
    return {};
  const n = pn(a), r = pr(a);
  return {
    staticUrl: n,
    staticFallbackUrl: n,
    animatedUrl: r
  };
}
function yn(t) {
  return `/teams/${t}.png`;
}
function pt(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function br(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map();
  for (const r of t) {
    const i = ee(r.name);
    if (!i)
      continue;
    e.set(r.id, i), a.add(i), n.set(pt(r.localized_name), i);
    const c = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    n.set(pt(c), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: n };
}
function Sr(t, e) {
  const { heroId: a, heroClass: n, heroName: r, urlSlug: i } = t;
  if (i) {
    const c = ee(i);
    if (c && e.byInternalSlug.has(c))
      return { slug: c, source: "url" };
  }
  if (a != null && a > 0) {
    const c = e.byId.get(a);
    if (c)
      return { slug: c, source: "id" };
  }
  if (n) {
    const c = ee(n);
    if (c && e.byInternalSlug.has(c))
      return { slug: c, source: "class" };
  }
  for (const c of [r, n]) {
    if (!c)
      continue;
    const o = pt(c), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (n) {
    const c = ee(n);
    if (c)
      return { slug: c, source: "fallback" };
  }
  return { source: "none" };
}
function at(t, e, a) {
  var r, i;
  const n = e === "radiant" ? (r = t == null ? void 0 : t.pickPlayers) == null ? void 0 : r.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!n || a < 0 || a >= n.length))
    return n[a] ?? null;
}
function wr(t, e, a) {
  var r, i;
  const n = at(t == null ? void 0 : t.matchSetup, e, a);
  if (!(n == null || !((r = t == null ? void 0 : t.roster) != null && r.length)))
    return (i = t.roster.find((c) => c.steam32 === n)) == null ? void 0 : i.displayName;
}
function bn(t, e, a) {
  const n = a == null ? void 0 : a.find((r) => r.type === "pick" && r.heroId === e);
  return n == null ? void 0 : n.order;
}
function _r(t, e) {
  return `${t}:${e}`;
}
function yt(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let n = 0, r = 0;
  for (const [i, c] of Object.entries(t))
    !i.startsWith(a) || c.games <= 0 || (n += c.games, r += c.wins);
  return { games: n, wins: r };
}
function Sn(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[_r(e, a)];
}
function bt(t, e) {
  if (yt(t, e).games <= 0)
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
const kr = [
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
], Cr = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), wn = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  Cr
]), Ir = s.object({
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
}), Ar = s.object({
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
}), _n = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), kn = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: _n.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => ze)).optional()
}), Cn = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(Ar).default([]),
  matchSetup: kn.nullable().optional(),
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
}), In = s.object({
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
}), An = s.object({
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
}), En = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), St = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(En),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), Pn = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Er = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Pr = s.object({
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
}), Ta = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Pr).optional(),
  bonusTime: s.number().optional()
}), vr = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), ze = s.object({
  series: Ir,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Er).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: Ta.optional(),
  dire: Ta.optional(),
  lastPick: vr.optional()
}), wt = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), Rr = s.object({
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
  replays: s.array(Rr)
});
const _t = s.object({
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
}), kt = s.object({
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
}), Tr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), Lr = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), Ae = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: Lr.optional(),
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
  tournament: Tr.optional(),
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
  statSlides: s.array(En).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional(),
  abilityCount: s.number().optional(),
  /** Live in-game KDA/CS stats populated from GSI while livePlayerCard is active */
  liveKills: s.number().optional(),
  liveDeaths: s.number().optional(),
  liveAssists: s.number().optional(),
  liveLastHits: s.number().optional(),
  liveDenies: s.number().optional(),
  /** Per-enemy-hero kill counts for the focused player */
  enemyHeroKills: s.array(s.object({
    heroId: s.number(),
    heroClass: s.string(),
    heroPortraitSlug: s.string().optional(),
    heroPortraitUrl: s.string().optional(),
    kills: s.number()
  })).optional()
}), Ct = s.object({
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
}), It = s.object({
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
}), Nr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: hn.optional()
}), vn = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), Rn = s.object({
  roshanState: s.string().optional(),
  roshanRespawnTimer: s.coerce.number().optional(),
  tormentorRadiant: s.string().optional(),
  tormentorRadiantRespawnTimer: s.coerce.number().optional(),
  tormentorDire: s.string().optional(),
  tormentorDireRespawnTimer: s.coerce.number().optional(),
  radiantScanActive: s.boolean().optional(),
  radiantScanCooldown: s.coerce.number().optional(),
  radiantScanCharges: s.coerce.number().optional(),
  direScanActive: s.boolean().optional(),
  direScanCooldown: s.coerce.number().optional(),
  direScanCharges: s.coerce.number().optional(),
  radiantGlyphActive: s.boolean().optional(),
  radiantGlyphCooldown: s.coerce.number().optional(),
  direGlyphActive: s.boolean().optional(),
  direGlyphCooldown: s.coerce.number().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(wn).default({}),
  sceneHints: vn.optional(),
  leagueConfig: Cn.optional(),
  tournamentHeroIndex: s.record(In).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(An).optional(),
  production: Pn.optional(),
  statCarousel: St.nullable().optional(),
  draft: ze.nullable().optional(),
  lowerThirds: wt.nullable().optional(),
  playerStatsCard: kt.nullable().optional(),
  heroStatsCard: Ae.nullable().optional(),
  livePlayerCard: Ae.nullable().optional(),
  matchupCard: Ct.nullable().optional(),
  sponsor: It.nullable().optional(),
  timers: Nr.optional(),
  minimapState: Rn.optional(),
  standoutPlayerCard: _t.nullable().optional()
});
const Hr = s.object({
  overlayVisibility: s.record(wn).optional(),
  leagueConfig: Cn.partial().optional(),
  tournamentHeroIndex: s.record(In).optional(),
  playerHeroIndex: s.record(An).optional(),
  production: Pn.partial().optional(),
  minimapState: Rn.partial().optional(),
  statCarousel: s.union([St, St.partial(), s.null()]).optional(),
  draft: s.union([ze, ze.partial(), s.null()]).optional(),
  lowerThirds: s.union([wt, wt.partial(), s.null()]).optional(),
  playerStatsCard: s.union([kt, kt.partial(), s.null()]).optional(),
  heroStatsCard: s.union([Ae, Ae.partial(), s.null()]).optional(),
  livePlayerCard: s.union([Ae, Ae.partial(), s.null()]).optional(),
  matchupCard: s.union([Ct, Ct.partial(), s.null()]).optional(),
  sponsor: s.union([
    It,
    It.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: dr.optional()
  }).partial().optional(),
  sceneHints: vn.partial().optional(),
  standoutPlayerCard: s.union([
    _t,
    _t.partial(),
    s.null()
  ]).optional()
});
function Mr() {
  const t = {};
  for (const e of kr)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function xr() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function Tn() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: Mr(),
    sceneHints: {},
    leagueConfig: xr(),
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
const re = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, se = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function I(t, e, a) {
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
function jr(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function La(t, e) {
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
function Fr(t, e) {
  var i, c;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const n = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, r = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return n != null && n.slots && (n.slots = La((i = t.radiant) == null ? void 0 : i.slots, n.slots)), r != null && r.slots && (r.slots = La((c = t.dire) == null ? void 0 : c.slots, r.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: n,
    dire: r,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function ue(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function Dr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function Or(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function Ln(t, e) {
  var b;
  const a = e.overlayVisibility !== void 0 ? jr(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let n = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: S, ...C } = e.timers;
    n = {
      ...t.timers ?? {},
      ...C
    }, S !== void 0 && (n = {
      ...n,
      gameStartCountdown: mr((b = t.timers) == null ? void 0 : b.gameStartCountdown, S)
    });
  }
  const r = Fr(t.draft, e.draft), i = Dr(t.leagueConfig, e.leagueConfig), c = Or(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let l = ue(t.heroStatsCard ?? void 0, e.heroStatsCard), p = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const h = ue(t.lowerThirds ?? void 0, e.lowerThirds), g = ue(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let f = ue(t.matchupCard ?? void 0, e.matchupCard), u = ue(t.sponsor ?? void 0, e.sponsor), d = ue(t.statCarousel ?? void 0, e.statCarousel);
  if (l && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const S = e.heroStatsCard;
    S.fetchedAt ? l = { ...S } : l = {
      ...l,
      ...S,
      tournament: S.tournament ? { ...l.tournament ?? {}, ...S.tournament } : l.tournament,
      playerHero: S.playerHero ? { ...l.playerHero ?? {}, ...S.playerHero } : l.playerHero,
      statSlides: S.statSlides ?? l.statSlides
    };
  }
  if (f && e.matchupCard && typeof e.matchupCard == "object") {
    const S = e.matchupCard;
    f = {
      ...f,
      ...S,
      matchup: S.matchup ? { ...f.matchup ?? {}, ...S.matchup } : f.matchup
    };
  }
  let y = ue(t.livePlayerCard ?? void 0, e.livePlayerCard), w = ue(t.standoutPlayerCard ?? void 0, e.standoutPlayerCard);
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: m ?? t.playerHeroIndex,
    production: c ?? t.production,
    statCarousel: d === void 0 ? t.statCarousel : d,
    draft: r === void 0 ? t.draft : r,
    lowerThirds: h === void 0 ? t.lowerThirds : h,
    playerStatsCard: g === void 0 ? t.playerStatsCard : g,
    heroStatsCard: l === void 0 ? t.heroStatsCard : l,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: f === void 0 ? t.matchupCard : f,
    sponsor: u === void 0 ? t.sponsor : u,
    timers: n ?? t.timers,
    sceneHints: p,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState,
    standoutPlayerCard: w === void 0 ? t.standoutPlayerCard : w
  };
}
function Na(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = Ln(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function Ur(t) {
  const e = new Ht(t.url, {
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
        const c = await e.get(t.key), o = c ? JSON.parse(c) : t.seed, m = Ln(o, r);
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
async function $r() {
  const t = Tn();
  if (E.STATE_BACKEND === "memory")
    return _.info("State backend: memory"), Na(t);
  if (!E.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new Ht(E.REDIS_URL);
    return await e.ping(), await e.quit(), _.info({ key: E.REDIS_STATE_KEY }, "State backend: redis"), Ur({
      url: E.REDIS_URL,
      key: E.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (_.error(e, "Redis unavailable"), E.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return _.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), Na(t);
    throw e;
  }
}
function Gr(t) {
  return Hr.parse(t);
}
const De = nr(ar);
class Kr {
  constructor() {
    j(this, "dbFile", E.REPLAY_DB_FILE);
    j(this, "matchFile", E.REPLAY_MATCH_FILE);
    j(this, "lastCompletedFile", E.REPLAY_LAST_COMPLETED_FILE);
    j(this, "playbackDir", E.REPLAY_PLAYBACK_DIR);
    j(this, "replayFolder", E.REPLAY_FOLDER);
    j(this, "highlightsDir", E.HIGHLIGHTS_FOLDER || v.resolve(process.cwd(), "../../data/highlights"));
    j(this, "pendingDuration", null);
    j(this, "playbackState", "IDLE");
    j(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    j(this, "previewCacheDir", v.resolve(process.cwd(), "public-preview-cache"));
    if (!R.existsSync(this.previewCacheDir))
      try {
        R.mkdirSync(this.previewCacheDir, { recursive: !0 });
      } catch (e) {
        _.error(e, "Failed to create preview cache directory");
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
      this.playbackState !== "IDLE" && n !== "Replay Stinger" && n !== "Replay" && (_.info(`Manual scene switch to ${n} detected. Cancelling replay sequence.`), this.playbackState = "IDLE", this.originalScene = null);
    }), e.on("MediaInputPlaybackEnded", async (a) => {
      const n = a.inputName;
      this.playbackState === "STINGER_IN" && n === "Stinger" ? (_.info("Stinger In ended, switching to Replay"), this.playbackState = "REPLAYING", await e.setCurrentScene("Replay"), await e.restartMediaInput("ReplayPlayer")) : this.playbackState === "REPLAYING" && n === "ReplayPlayer" ? (_.info("Replay ended, switching to Stinger Out"), this.playbackState = "STINGER_OUT", await e.setCurrentScene("Replay Stinger"), await e.restartMediaInput("Stinger")) : this.playbackState === "STINGER_OUT" && n === "Stinger" && (_.info("Stinger Out ended, restoring original scene"), this.playbackState = "IDLE", this.originalScene && (await e.setCurrentScene(this.originalScene), this.originalScene = null));
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
        _.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      R.existsSync(this.replayFolder) || R.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = v.basename(e), n = v.join(this.replayFolder, a);
      e !== n && (R.copyFileSync(e, n), R.unlinkSync(e));
      let r = 30, i = !1;
      this.pendingDuration !== null && (r = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const h = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${n}"`, g = await De(h), f = parseFloat(g.stdout.trim());
        !isNaN(f) && !i && (r = Math.round(f));
      } catch (h) {
        _.error(h, "Failed to probe duration of new replay");
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
      R.appendFileSync(this.dbFile, p, "utf-8"), _.info({ newPath: n, currentMatch: o, newReplayId: l }, "Saved new replay");
    } catch (a) {
      _.error(a, "Failed to handle saved replay");
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
      _.error(r, "Failed to read active match file");
    }
    try {
      if (R.existsSync(this.lastCompletedFile)) {
        const r = R.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (a = i);
      }
    } catch (r) {
      _.error(r, "Failed to read last completed match file");
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
      _.error(r, "Failed to read or parse replay database CSV");
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
      return _.error(n, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: "File not found" };
      const r = (await this.getReplayState()).replays.find((h) => h.file === e), i = r ? r.duration : 30, c = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await De(c), m = parseFloat(o.stdout.trim()) || 40, l = Math.max(0, m - i);
      let p = e;
      if (l > 1) {
        R.existsSync(this.playbackDir) || R.mkdirSync(this.playbackDir, { recursive: !0 }), p = v.join(this.playbackDir, "current_replay.mp4");
        const h = `ffmpeg -y -ss ${l} -i "${e}" -t ${i} -c copy "${p}"`;
        _.info({ cmd: h }, "Running ffmpeg slice command"), await De(h);
      }
      if (a.isConnected()) {
        const h = await a.setInputSettings("ReplayPlayer", {
          local_file: p
        });
        if (!h.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${h.error}` };
        const g = await a.getCurrentProgramScene();
        g.ok && g.sceneName && g.sceneName !== "Replay Stinger" && g.sceneName !== "Replay" && (this.originalScene = g.sceneName), this.playbackState = "STINGER_IN";
        const f = await a.setCurrentScene("Replay Stinger");
        return f.ok || _.error({ error: f.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (n) {
      return _.error(n, "Failed to play replay"), { ok: !1, error: n instanceof Error ? n.message : String(n) };
    }
  }
  async generatePreview(e) {
    try {
      if (!R.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = v.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return _.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
  async nextMatch() {
    try {
      const a = (await this.getReplayState()).currentMatch;
      R.existsSync(v.dirname(this.lastCompletedFile)) || R.mkdirSync(v.dirname(this.lastCompletedFile), { recursive: !0 }), R.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((r) => {
        _.error(r, "Failed to generate highlights in background");
      });
      const n = a + 1;
      return R.writeFileSync(this.matchFile, n.toString(), "utf-8"), _.info(`Advanced to match ${n}`), { ok: !0, currentMatch: n };
    } catch (e) {
      return _.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const n = (await this.getReplayState()).replays.filter((m) => m.match === e && m.favorite);
      if (n.length === 0)
        return _.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      R.existsSync(this.highlightsDir) || R.mkdirSync(this.highlightsDir, { recursive: !0 }), n.sort((m, l) => m.replayId - l.replayId);
      const r = v.join(this.highlightsDir, `concat_${e}.txt`), i = n.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      R.writeFileSync(r, i.join(`
`) + `
`, "utf-8");
      const c = v.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${r}" -c copy "${c}"`;
      return _.info({ cmd: o }, "Generating highlights"), await De(o), _.info(`Generated highlights: ${c}`), { ok: !0, file: c };
    } catch (a) {
      return _.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
const Nn = {
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
function Br(t) {
  const e = Math.min(...t), n = Math.max(...t) - e;
  return n === 0 ? t.map(() => 0.5) : t.map((r) => (r - e) / n);
}
function Te(t, e) {
  return e === 0 ? 0 : t / e;
}
function Wr(t, e = Nn) {
  const a = t.players ?? [];
  if (a.length === 0) return [];
  const n = Math.max(1, (t.duration ?? 1800) / 60), r = (u) => (u.player_slot ?? 0) < 128, i = a.filter(r), c = a.filter((u) => !r(u)), o = i.reduce((u, d) => u + (d.kills ?? 0), 0), m = c.reduce((u, d) => u + (d.kills ?? 0), 0), l = i.reduce((u, d) => u + (d.net_worth ?? 0), 0), p = c.reduce((u, d) => u + (d.net_worth ?? 0), 0), h = a.map((u) => {
    const d = r(u) ? "radiant" : "dire", y = d === "radiant" ? o : m, w = d === "radiant" ? l : p, b = u.kills ?? 0, S = u.deaths ?? 0, C = u.assists ?? 0;
    return {
      kda: Te(b + C, S + 1),
      killParticipation: Te(b + C, Math.max(1, y)),
      gpm: u.gold_per_min ?? 0,
      xpm: u.xp_per_min ?? 0,
      networthShare: Te(u.net_worth ?? 0, Math.max(1, w)),
      damagePm: Te(u.hero_damage ?? 0, n),
      healingPm: Te(u.hero_healing ?? 0, n),
      lastHits: u.last_hits ?? 0,
      denies: u.denies ?? 0,
      laneEfficiency: u.lane_efficiency ?? 0,
      winBonus: (t.radiant_win ? d === "radiant" : d === "dire") ? 1 : 0,
      leaver: (u.leaver_status ?? 0) > 0
    };
  }), g = [
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
  ], f = {};
  for (const u of g)
    f[u] = Br(h.map((d) => d[u]));
  return f.winBonus = h.map((u) => u.winBonus), a.map((u, d) => {
    if (h[d].leaver)
      return Ha(u, t, 0, Vr());
    const w = {
      kda: f.kda[d] * e.kda,
      killParticipation: f.killParticipation[d] * e.killParticipation,
      gpm: f.gpm[d] * e.gpm,
      xpm: f.xpm[d] * e.xpm,
      networthShare: f.networthShare[d] * e.networthShare,
      damagePm: f.damagePm[d] * e.damagePm,
      healingPm: f.healingPm[d] * e.healingPm,
      lastHits: f.lastHits[d] * e.lastHits,
      denies: f.denies[d] * e.denies,
      laneEfficiency: f.laneEfficiency[d] * e.laneEfficiency,
      winBonus: f.winBonus[d] * e.winBonus
    }, b = Object.values(w).reduce((S, C) => S + C, 0);
    return Ha(u, t, b, w);
  });
}
function Vr() {
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
function Ha(t, e, a, n, r) {
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
function Hn(t, e) {
  return [...Wr(t, e)].sort((r, i) => i.mvpScore - r.mvpScore).map((r, i) => ({ ...r, rank: i + 1 }));
}
let me = null, _e = /* @__PURE__ */ new Map(), Je = null;
function qr() {
  if (!(me != null && me.length)) {
    Je = null;
    return;
  }
  Je = br(me);
}
async function le(t) {
  if (_e.size > 0) return _e;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (me = e.data, _e = new Map(me.map((a) => [a.id, a])), qr()), _e;
}
function Xe(t) {
  if (Je) return Sr(t, Je);
  if (t.heroId != null && t.heroId > 0) {
    const e = _e.get(t.heroId);
    if (e) {
      const a = ee(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = ee(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Yr(t) {
  return Xe(t).slug;
}
function zr(t, e) {
  const a = Xe({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const n = _e.get(t);
  if (n)
    return ee(n.name) || void 0;
}
function ae(t, e) {
  return hr(
    zr(t, e)
  );
}
function Jr(t, e) {
  return ae(t, e).heroPortraitUrl;
}
function oe(t) {
  const e = _e.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function Xr(t) {
  if (t)
    return yn(t);
}
function X(t, e) {
  return t.find((a) => a.steam32 === e);
}
function Qr() {
  return me ? [...me].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function Zr(t) {
  const { app: e, state: a, io: n, broadcast: r, obs: i, opendota: c } = t, o = new Kr();
  o.init(i), e.use(
    "/api/replays/media",
    I,
    Ne.static(E.REPLAY_FOLDER)
  ), e.get("/health/live", (h, g) => {
    g.json({
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
  }), e.get("/health/ready", async (h, g) => {
    try {
      await a.getState(), g.json({ ok: !0 });
    } catch {
      g.status(503).json({ ok: !1 });
    }
  }), e.get("/api/state", I, async (h, g) => {
    const f = await a.getState();
    g.json(f);
  }), e.patch("/api/state", I, async (h, g) => {
    try {
      const f = Gr(h.body), u = await a.patchState(f);
      await r.broadcastFull(u), g.json(u);
    } catch (f) {
      _.error(f, "state patch failed"), g.status(400).json({
        error: f instanceof Error ? f.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", I, async (h, g) => {
    const f = Tn(), u = await a.replaceState(f);
    await r.broadcastFull(u), g.json(u);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function l(h) {
    const g = await a.patchState({
      timers: { gameStartCountdown: h }
    });
    return await r.broadcastFull(g), g;
  }
  e.post(
    "/api/timers/game-start/start",
    I,
    async (h, g) => {
      var w, b;
      const f = m.safeParse(h.body);
      if (!f.success)
        return g.status(400).json({ error: f.error.flatten() });
      const u = ((w = f.data.label) == null ? void 0 : w.trim()) || he, d = va(
        f.data.seconds,
        u
      ), y = await l(d);
      g.json({ ok: !0, gameStartCountdown: (b = y.timers) == null ? void 0 : b.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    I,
    async (h, g) => {
      var S, C, k, A;
      const u = (S = (await a.getState()).timers) == null ? void 0 : S.gameStartCountdown, d = (typeof ((C = h.body) == null ? void 0 : C.label) == "string" ? h.body.label.trim() : "") || (u == null ? void 0 : u.label) || he, y = typeof ((k = h.body) == null ? void 0 : k.seconds) == "number" ? h.body.seconds : Ve(u), w = Ra(y, d), b = await l(w);
      g.json({ ok: !0, gameStartCountdown: (A = b.timers) == null ? void 0 : A.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    I,
    async (h, g) => {
      var S, C, k;
      const f = m.safeParse(h.body);
      if (!f.success)
        return g.status(400).json({ error: f.error.flatten() });
      const d = (S = (await a.getState()).timers) == null ? void 0 : S.gameStartCountdown, y = ((C = f.data.label) == null ? void 0 : C.trim()) || (d == null ? void 0 : d.label) || he, w = d != null && d.running ? va(f.data.seconds, y) : Ra(f.data.seconds, y), b = await l(w);
      g.json({ ok: !0, gameStartCountdown: (k = b.timers) == null ? void 0 : k.gameStartCountdown });
    }
  );
  const p = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", I, (h, g) => {
    const f = p.safeParse(h.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    i.configure(f.data), n.of(se.PRODUCER).emit(re.ACK, {
      kind: "obs:config",
      ok: !0
    }), g.json({ ok: !0 });
  }), e.post("/api/obs/connect", I, async (h, g) => {
    const f = h.body;
    if (f && typeof f == "object" && Object.keys(f).length) {
      const d = p.safeParse(f);
      if (!d.success)
        return g.status(400).json({ error: d.error.flatten() });
      i.configure(d.data);
    }
    const u = await i.connect();
    n.of(se.PRODUCER).emit(re.ACK, {
      kind: "obs:connect",
      ok: u.ok,
      error: u.error
    }), g.json(u);
  }), e.post("/api/obs/disconnect", I, async (h, g) => {
    await i.disconnect(), n.of(se.PRODUCER).emit(re.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), g.json({ ok: !0 });
  }), e.get("/api/obs/scenes", I, async (h, g) => {
    try {
      const f = await i.listScenes();
      g.json({ ok: !0, scenes: f });
    } catch (f) {
      g.status(500).json({
        ok: !1,
        error: f instanceof Error ? f.message : String(f)
      });
    }
  }), e.post("/api/obs/program-scene", I, async (h, g) => {
    const u = s.object({ sceneName: s.string() }).safeParse(h.body);
    if (!u.success)
      return g.status(400).json({ error: u.error.flatten() });
    const d = await i.setProgramScene(u.data.sceneName);
    n.of(se.PRODUCER).emit(re.ACK, {
      kind: "obs:setProgramScene",
      ok: d.ok,
      sceneName: u.data.sceneName,
      error: d.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: u.data.sceneName }
    });
    const y = await a.getState();
    await r.broadcastFull(y), g.json(d);
  }), e.post(
    "/api/obs/scene-source",
    I,
    async (h, g) => {
      const u = s.object({
        sceneName: s.string(),
        sourceName: s.string(),
        visible: s.boolean()
      }).safeParse(h.body);
      if (!u.success)
        return g.status(400).json({ error: u.error.flatten() });
      const d = await i.setSourceVisible(u.data);
      g.json(d);
    }
  ), e.post(
    "/api/opendota/heroes/constants",
    I,
    async (h, g) => {
      const f = await c.heroesConstants();
      g.json(f);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    I,
    async (h, g) => {
      const f = await c.playerHeroStats(h.params.accountId);
      g.json(f);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    I,
    async (h, g) => {
      const f = await c.heroMatchups(Number(h.params.heroId));
      g.json(f);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    I,
    async (h, g) => {
      const u = s.object({
        heroA: s.number(),
        heroB: s.number()
      }).safeParse(h.body);
      if (!u.success)
        return g.status(400).json({ error: u.error.flatten() });
      const d = await c.matchupBetween(
        u.data.heroA,
        u.data.heroB
      );
      g.json(d);
    }
  ), e.post("/api/opendota/compose/hero-card", I, async (h, g) => {
    const u = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(h.body);
    if (!u.success)
      return g.status(400).json({ error: u.error.flatten() });
    const d = await a.getState(), y = u.data.accountId !== void 0 ? Sn(
      d.playerHeroIndex,
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
      const C = await c.playerHeroStats(u.data.accountId);
      if (C.ok && Array.isArray(C.data)) {
        const k = C.data.find(
          (A) => A && typeof A == "object" && A.hero_id === u.data.heroId
        );
        k && typeof k.games == "number" && (b = {
          games: k.games,
          wins: typeof k.win == "number" ? k.win : 0,
          losses: k.games - (typeof k.win == "number" ? k.win : 0)
        });
      }
      C.ok || (w = "stale");
    }
    const S = {
      playerLabel: u.data.playerLabel,
      heroId: u.data.heroId,
      playerHero: b,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: w
    };
    if (u.data.persist) {
      const C = await a.patchState({ heroStatsCard: S });
      return await r.broadcastFull(C), g.json({ ok: !0, card: S, persisted: C });
    }
    return g.json({ ok: !0, card: S });
  }), e.post("/api/opendota/compose/matchup-card", I, async (h, g) => {
    const u = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(h.body);
    if (!u.success)
      return g.status(400).json({ error: u.error.flatten() });
    const d = await c.matchupBetween(
      u.data.heroAId,
      u.data.heroBId
    ), y = {
      heroAId: u.data.heroAId,
      heroBId: u.data.heroBId,
      matchup: d.ok ? d.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: d.ok ? "opendota_cached" : "stale"
    };
    if (u.data.persist) {
      const w = await a.patchState({ matchupCard: y });
      return await r.broadcastFull(w), g.json({ ok: !0, upstream: d, matchupCard: y, persisted: w });
    }
    return g.json({ ok: !0, upstream: d, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", I, (h, g) => {
    c.purgeMemory(), g.json({ ok: !0 });
  }), e.get("/api/replays", I, async (h, g) => {
    try {
      const f = await o.getReplayState();
      g.json(f);
    } catch (f) {
      g.status(500).json({ error: f instanceof Error ? f.message : String(f) });
    }
  }), e.post("/api/replays/save", I, async (h, g) => {
    const u = s.object({ duration: s.number().nullable().optional() }).safeParse(h.body), d = u.success && u.data.duration || null, y = await o.triggerSaveReplay(d, i);
    g.json(y);
  }), e.post("/api/replays/next-match", I, async (h, g) => {
    const f = await o.nextMatch();
    g.json(f);
  }), e.post("/api/replays/generate-highlights", I, async (h, g) => {
    const u = s.object({ matchId: s.number() }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await o.generateHighlights(u.data.matchId);
    g.json(d);
  }), e.post("/api/replays/hotkey", I, async (h, g) => {
    const u = s.object({ hotkeyName: s.string() }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await i.triggerHotkeyByName(u.data.hotkeyName);
    g.json(d);
  }), e.post("/api/replays/hotkey-sequence", I, async (h, g) => {
    const u = s.object({
      keyId: s.string(),
      keyModifiers: s.object({
        shift: s.boolean().optional(),
        control: s.boolean().optional(),
        alt: s.boolean().optional(),
        command: s.boolean().optional()
      }).optional()
    }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await i.triggerHotkeyBySequence(u.data.keyId, u.data.keyModifiers || {});
    g.json(d);
  }), e.post("/api/replays/favorite", I, async (h, g) => {
    const u = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await o.toggleFavorite(u.data.file, u.data.favorite);
    g.json({ ok: d });
  }), e.post("/api/replays/play", I, async (h, g) => {
    const u = s.object({ file: s.string() }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await o.playReplay(u.data.file, i);
    g.json(d);
  }), e.post("/api/replays/generate-preview", I, async (h, g) => {
    const u = s.object({ file: s.string() }).safeParse(h.body);
    if (!u.success) return g.status(400).json({ error: u.error.flatten() });
    const d = await o.generatePreview(u.data.file);
    g.json(d);
  }), e.post("/api/standout/compute", I, async (h, g) => {
    var q;
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
      return g.status(400).json({ error: u.error.flatten() });
    const { matchId: d, persist: y } = u.data, w = { ...Nn, ...u.data.weights ?? {} }, b = await c.matchDetails(d);
    if (!b.ok || !b.data)
      return g.status(502).json({
        error: `OpenDota match fetch failed: ${b.error ?? "no data"}`
      });
    const S = b.data;
    if (Array.isArray(S.players) && S.duration)
      for (const K of S.players)
        K.duration = S.duration;
    if (await le(c), Array.isArray(S.players)) {
      for (const K of S.players)
        if (K.hero_id && !K.hero_name) {
          const D = ae(K.hero_id);
          K.hero_name = D.heroPortraitSlug ?? String(K.hero_id);
        }
    }
    const C = Hn(S, w), k = C[0];
    if (!k)
      return g.status(422).json({ error: "No players found in match" });
    const H = ((q = (await a.getState()).leagueConfig) == null ? void 0 : q.roster) ?? [], T = k.accountId ? X(H, k.accountId) : void 0, B = k.heroId ? ae(k.heroId, k.heroName) : {}, G = {
      playerLabel: (T == null ? void 0 : T.displayName) ?? k.personaname ?? `Player ${k.accountId ?? "?"}`,
      heroId: k.heroId,
      heroName: k.heroName,
      steam32: k.accountId,
      ...B,
      xpm: k.raw.xpm,
      gpm: k.raw.gpm,
      networth: k.raw.networth,
      kills: k.raw.kills,
      deaths: k.raw.deaths,
      assists: k.raw.assists,
      heroDamage: k.raw.heroDamage,
      lastHits: k.raw.lastHits,
      teamKills: k.raw.teamKills,
      items: k.raw.items,
      hasScepter: k.raw.hasScepter,
      hasShard: k.raw.hasShard
    };
    if (y) {
      const K = await a.patchState({
        standoutPlayerCard: G,
        overlayVisibility: { standoutplayer: "visible" }
      });
      return await r.broadcastFull(K), g.json({ ok: !0, winner: k, ranked: C, standoutCard: G, persisted: !0 });
    }
    return g.json({ ok: !0, winner: k, ranked: C, standoutCard: G, persisted: !1 });
  }), e.post("/api/standout/push", I, async (h, g) => {
    var k;
    const u = s.object({
      card: s.record(s.unknown()),
      show: s.boolean().optional().default(!0)
    }).safeParse(h.body);
    if (!u.success)
      return g.status(400).json({ error: u.error.flatten() });
    const d = u.data.card;
    if (d.heroPortraitSlug = void 0, d.heroPortraitUrl = void 0, typeof d.heroId == "number") {
      const A = ae(
        d.heroId,
        typeof d.heroName == "string" ? d.heroName : void 0
      );
      Object.assign(d, A);
    }
    const w = ((k = (await a.getState()).leagueConfig) == null ? void 0 : k.roster) ?? [], b = typeof d.steam32 == "number" ? X(w, d.steam32) : void 0;
    d.playerLabel = (b == null ? void 0 : b.displayName) ?? (typeof d.personaname == "string" ? d.personaname : void 0) ?? `Player ${d.steam32 ?? "?"}`;
    const S = {
      standoutPlayerCard: d
    };
    u.data.show && (S.overlayVisibility = { standoutplayer: "visible" });
    const C = await a.patchState(S);
    await r.broadcastFull(C), g.json({ ok: !0, standoutPlayerCard: C.standoutPlayerCard });
  }), e.post("/api/standout/hide", I, async (h, g) => {
    const f = await a.patchState({
      overlayVisibility: { standoutplayer: "hidden" }
    });
    await r.broadcastFull(f), g.json({ ok: !0 });
  });
}
function es() {
  var e;
  const t = (e = E.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function ts(t, e) {
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
    const h = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${p}`, g = await fetch(h);
    if (!g.ok) {
      const w = await g.text();
      throw new Error(`Steam match history HTTP ${g.status}: ${w.slice(0, 200)}`);
    }
    const f = await g.json(), u = (o = f.result) == null ? void 0 : o.status, d = ((m = f.result) == null ? void 0 : m.matches) ?? [];
    if (u !== void 0 && u !== 1 && d.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${u} for league ${t} (no matches in response)`
      );
    if (d.length === 0) break;
    for (const w of d)
      typeof w.match_id == "number" && w.match_id > 0 && n.push(w.match_id);
    const y = (l = d[d.length - 1]) == null ? void 0 : l.match_id;
    if (y === void 0 || d.length < 100) break;
    r = y - 1;
  }
  const i = [...new Set(n)].slice(0, e);
  return _.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function as(t, e = 80) {
  var o, m;
  const a = es(), n = [];
  if (!((o = E.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let r = [];
  if ((m = E.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      r = await ts(t, e);
    } catch (l) {
      const p = l instanceof Error ? l.message : String(l);
      _.warn({ err: l, leagueId: t }, "Steam league match history failed"), n.push(p);
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
const ns = 10;
function Ma(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function xa(t) {
  return t !== void 0 && t < 128;
}
function rs(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function ss(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (r) => rs(r.account_id) && typeof r.lane == "number" && r.lane > 0 && !r.is_roaming
  ), n = [...new Set(a.map((r) => r.lane))];
  for (const r of n) {
    const i = a.filter((f) => f.lane === r), c = i.filter((f) => xa(f.player_slot)), o = i.filter((f) => !xa(f.player_slot));
    if (c.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...c.map(Ma)), l = Math.max(0, ...o.map(Ma)), p = m - l;
    let h;
    Math.abs(p) <= ns ? h = "draw" : h = p > 0 ? "win" : "loss";
    const g = h === "draw" ? "draw" : h === "win" ? "loss" : "win";
    for (const f of c) e.set(f.account_id, h);
    for (const f of o) e.set(f.account_id, g);
  }
  return e;
}
function os(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function ct() {
  return [
    v.resolve(process.cwd(), "data/league-stats"),
    v.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function ie() {
  var a;
  const t = (a = E.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return v.isAbsolute(t) ? t : v.resolve(process.cwd(), t);
  const e = E.LEAGUE_ID;
  for (const n of ct())
    if (Pa(v.join(n, `league_${e}_heroes.csv`)))
      return n;
  for (const n of ct())
    if (Pa(n)) return n;
  return ct()[0];
}
function ja(t) {
  const e = ie(), a = Fe(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function Fa(t, e) {
  const a = ie(), n = Fe(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [n.heroes, n.playerHeroes],
    statsStorage: e
  };
}
function Fe(t) {
  const e = ie();
  return {
    dir: e,
    heroes: v.join(e, `league_${t}_heroes.csv`),
    playerHeroes: v.join(e, `league_${t}_player_heroes.csv`),
    meta: v.join(e, `league_${t}_meta.json`)
  };
}
async function Pe(t) {
  try {
    return await rr(t), !0;
  } catch {
    return !1;
  }
}
function is(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function ls(t) {
  const e = [];
  let a = "", n = !1;
  for (let r = 0; r < t.length; r++) {
    const i = t[r];
    n ? i === '"' ? t[r + 1] === '"' ? (a += '"', r++) : n = !1 : a += i : i === '"' ? n = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function Da(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(ls);
}
function U(t, e, a = 0) {
  const n = Number(t[e]);
  return Number.isFinite(n) ? n : a;
}
function Oe(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function cs(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, n = t.assists ?? 0;
  return !(e === 0 && a === 0 && n === 0 || (t.leaver_status ?? 0) >= 3);
}
function Mn(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function us(t) {
  return t.filter((e) => !Mn(e));
}
function xn(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || Mn(a)) continue;
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
async function ds(t) {
  const e = Fe(t);
  if (!await Pe(e.heroes))
    return null;
  try {
    const a = await We(e.heroes, "utf8"), n = Da(a);
    if (n.length < 2) return null;
    const r = {};
    for (const o of n.slice(1)) {
      const m = U(o, 0);
      m <= 0 || (r[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: U(o, 2),
        bans: U(o, 3),
        wins: U(o, 4),
        losses: U(o, 5),
        games: U(o, 6),
        pickRate: Oe(o, 7),
        banRate: Oe(o, 8),
        winRate: Oe(o, 9),
        contestRate: Oe(o, 10)
      });
    }
    let i = [];
    if (await Pe(e.playerHeroes)) {
      const o = await We(e.playerHeroes, "utf8"), m = Da(o);
      for (const l of m.slice(1)) {
        const p = U(l, 0), h = U(l, 1);
        p <= 0 || h <= 0 || i.push({
          steam32: p,
          heroId: h,
          games: U(l, 2),
          wins: U(l, 3),
          kills: U(l, 4),
          deaths: U(l, 5),
          assists: U(l, 6),
          heroDamage: U(l, 7),
          goldPerMin: U(l, 8),
          lastHits: U(l, 9),
          maxKills: U(l, 10),
          laneWins: U(l, 11),
          laneDraws: U(l, 12),
          laneLosses: U(l, 13)
        });
      }
      i = us(i);
    }
    let c = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await Pe(e.meta)) {
      const o = JSON.parse(await We(e.meta, "utf8"));
      c = { ...c, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: r, playerHeroes: i, meta: c };
  } catch (a) {
    return _.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function ms(t) {
  const { leagueId: e } = t.meta, a = Fe(e);
  await gn(a.dir, { recursive: !0 });
  const r = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, l) => m.heroId - l.heroId
  ))
    r.push(
      [
        o.heroId,
        is(o.heroName ?? ""),
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
  await Be(a.heroes, `# BPC league hero stats — league ${e}
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
  return await Be(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${c.join(`
`)}
`,
    "utf8"
  ), await Be(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function Le(t) {
  const e = Fe(t), [a, n, r] = await Promise.all([
    Pe(e.heroes),
    Pe(e.playerHeroes),
    Pe(e.meta)
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
const gs = 4294967295;
function fs(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= gs))
    return e;
}
class hs {
  constructor() {
    j(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    j(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    j(this, "running", !1);
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
      await le(a);
      const o = await as(e, n), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && _.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const l = /* @__PURE__ */ new Map();
      let p = 0;
      for (let g = 0; g < m.length; g++) {
        const f = m[g];
        if (f === void 0) continue;
        _.info(
          { matchId: f, index: g + 1, total: m.length },
          "Aggregating league match"
        );
        let u = await a.matchDetails(f);
        (!u.ok || !((c = (i = u.data) == null ? void 0 : i.players) != null && c.length)) && (await a.requestMatchParse(f), u = await a.matchDetails(f)), u.ok && u.data && (u.data.leagueid != null && u.data.leagueid !== 0 && u.data.leagueid !== e ? _.warn(
          {
            matchId: f,
            expectedLeague: e,
            actualLeague: u.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(u.data, l), p += 1)), this.progress.matchDone = g + 1, this.progress.progress = Math.round(
          (g + 1) / Math.max(1, m.length) * 100
        ), r == null || r(this.getProgress());
      }
      if (p === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const h = {};
      for (const [g, f] of l) {
        const u = f.wins + f.losses, d = p > 0 ? f.picks / p : 0, y = p > 0 ? f.bans / p : 0, w = d + y, b = u > 0 ? f.wins / u : void 0;
        h[String(g)] = {
          heroId: g,
          heroName: oe(g),
          picks: f.picks,
          bans: f.bans,
          wins: f.wins,
          losses: f.losses,
          games: u,
          pickRate: d,
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
    const n = e.radiant_win === !0, r = ss(e.players);
    for (const i of this.resolvePickBans(e)) {
      const c = this.getAcc(a, i.hero_id);
      i.is_pick ? c.picks += 1 : c.bans += 1;
    }
    for (const i of e.players ?? []) {
      const c = fs(i);
      if (c === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && n || i.player_slot !== void 0 && i.player_slot >= 128 && !n, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, cs(i) && this.trackPlayerHero(c, i.hero_id, o, i, r.get(c));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, n, r, i) {
    let c = this.playerLeagueHeroes.get(e);
    c || (c = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, c));
    const o = typeof r.kills == "number" ? r.kills : 0, m = typeof r.deaths == "number" ? r.deaths : 0, l = typeof r.assists == "number" ? r.assists : 0, p = typeof r.hero_damage == "number" ? r.hero_damage : 0, h = typeof r.gold_per_min == "number" ? r.gold_per_min : 0, g = typeof r.last_hits == "number" ? r.last_hits : 0, f = c.get(a) ?? {
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
    f.games += 1, n && (f.wins += 1), i === "win" ? f.laneWins += 1 : i === "draw" ? f.laneDraws += 1 : i === "loss" && (f.laneLosses += 1), f.kills += o, f.deaths += m, f.assists += l, f.heroDamage += p, f.goldPerMin += h, f.lastHits += g, o > f.maxKills && (f.maxKills = o), c.set(a, f);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = cr(e);
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
const Q = new hs();
async function ps(t) {
  const { leagueId: e, state: a, broadcast: n, source: r } = t, i = r === "csv" ? await ds(e) : null;
  if (!i) return !1;
  Q.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const c = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: xn(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: r,
      statsCsvDir: ie()
    }
  });
  return await n.broadcastFull(c), !0;
}
async function At(t) {
  const e = await ps({ ...t, source: "csv" });
  return e && _.info(
    { leagueId: t.leagueId, dir: ie() },
    "League stats loaded from CSV"
  ), e;
}
async function jn(t) {
  const { leagueId: e, state: a, opendota: n, broadcast: r } = t;
  if (Q.isBusy()) {
    _.info("League aggregation already running");
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
    const c = await Q.aggregateLeague(
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
    ), o = Q.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await ms({
      heroIndex: c,
      playerHeroes: Q.exportPlayerHeroRows(),
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
      playerHeroIndex: xn(
        Q.exportPlayerHeroRows()
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
        statsCsvDir: ie()
      }
    });
    await r.broadcastFull(l), _.info(
      { leagueId: e, matches: o.matchTotal, dir: ie() },
      "League aggregation ready — saved to CSV"
    );
  } catch (c) {
    const o = c instanceof Error ? c.message : String(c);
    _.error({ err: c, leagueId: e }, "League aggregation failed");
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
async function ys(t) {
  var g, f, u, d;
  const { state: e, opendota: a, broadcast: n } = t, r = E.LEAGUE_ID, i = await e.getState();
  if ((((g = i.leagueConfig) == null ? void 0 : g.leagueId) !== r || ((f = i.leagueConfig) == null ? void 0 : f.leagueId) === null || ((u = i.leagueConfig) == null ? void 0 : u.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: r, aggregationStatus: "idle" }
  }), await At({
    leagueId: r,
    state: e,
    broadcast: n
  })) return;
  const l = ((d = (await e.getState()).leagueConfig) == null ? void 0 : d.aggregationStatus) === "ready", p = Q.getProgress().status === "ready";
  E.LEAGUE_AUTO_AGGREGATE && (!l || !p) && Q.getProgress().status !== "running" ? (_.info({ leagueId: r }, "Starting league aggregation (Steam match list + OpenDota details)"), jn({ leagueId: r, state: e, opendota: a, broadcast: n })) : _.info(
    { leagueId: r, dir: ie() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function Oa() {
  return {
    leagueId: E.LEAGUE_ID,
    autoAggregate: E.LEAGUE_AUTO_AGGREGATE,
    statsDir: ie()
  };
}
class qe extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function bs(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && Q.getProgress().status === "ready";
}
function Ie(t) {
  var a, n;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new qe(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new qe(
      ((n = t.leagueConfig) == null ? void 0 : n.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!bs(t))
    throw new qe(
      "League stats not ready — run tournament aggregate first"
    );
}
function Fn(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function Ss(t) {
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
    const m = o.split(",").map((d) => d.trim());
    if (m.length < 2) continue;
    const l = m[0] ?? "Player", p = Number(m[1]);
    if (!Number.isFinite(p)) continue;
    let h, g, f, u;
    if (m.length >= 4) {
      if (h = m[2] || void 0, g = m[3] || void 0, m.length >= 5) {
        const d = m[4] ?? "";
        d.startsWith("http://") || d.startsWith("https://") ? u = d : f = Fn(d);
      }
      if (m.length >= 6) {
        const d = m[5] ?? "";
        (d.startsWith("http://") || d.startsWith("https://")) && (u = d);
      }
    } else m.length === 3 && (g = m[2] || void 0, h = g == null ? void 0 : g.replace(/_/g, " "));
    r.push({ displayName: l, steam32: p, teamName: h, teamKey: g, teamColor: f, avatarUrl: u });
  }
  return r;
}
function ws(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function _s(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (n) => [
      n.displayName,
      String(n.steam32),
      n.teamName ?? "",
      n.teamKey ?? "",
      n.teamColor ?? "",
      n.avatarUrl ?? ""
    ].map(ws).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function Ua(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function Et(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const n = a.teamKey ?? ks(a.teamName ?? "unknown"), r = a.teamName ?? Cs(n), i = e.get(n);
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
function Pt(t, e) {
  return Et(t).find((a) => a.teamKey === e);
}
function He(t) {
  return yn(t);
}
function ks(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Cs(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function $a(t, e, a) {
  return t && t.map((n) => {
    if (n.type !== "pick") return n;
    const r = at(a.matchSetup, e, n.order), i = wr(a, e, n.order);
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
function Is(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: $a(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: $a(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Ga(t, e, a) {
  var i, c, o, m;
  const n = Pt(e, t.radiantTeamKey), r = Pt(e, t.direTeamKey);
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
      logoUrlA: He(n.teamKey),
      logoUrlB: He(r.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: n.teamName,
      logoUrl: He(n.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: r.teamName,
      logoUrl: He(r.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const Ka = /* @__PURE__ */ new Map();
async function Dn(t, e) {
  var c, o, m;
  if (e <= 0) return;
  const a = Ka.get(e);
  if (a) return a;
  const n = await t.playerProfile(e);
  if (!n.ok || !n.data) return;
  const r = n.data, i = ((c = r.profile) == null ? void 0 : c.avatarfull) ?? r.avatarfull ?? ((o = r.profile) == null ? void 0 : o.avatarmedium) ?? r.avatarmedium ?? ((m = r.profile) == null ? void 0 : m.avatar) ?? r.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return Ka.set(e, i), i;
}
async function Ba(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var n;
      if ((n = a.avatarUrl) != null && n.trim()) return a;
      try {
        const r = await Dn(e, a.steam32);
        return r ? { ...a, avatarUrl: r } : a;
      } catch (r) {
        return _.warn({ err: r, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const vt = v.join(process.cwd(), "steam32-vanity-cache.json");
let ye = null;
function As() {
  if (ye) return ye;
  try {
    if (R.existsSync(vt))
      return ye = JSON.parse(R.readFileSync(vt, "utf-8")), _.info({ count: Object.keys(ye).length }, "[steam32] Loaded vanity cache from disk"), ye;
  } catch {
  }
  return ye = {}, ye;
}
function Es(t) {
  try {
    R.writeFileSync(vt, JSON.stringify(t, null, 2));
  } catch (e) {
    _.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function Ps(t, e) {
  return new Promise((a) => {
    const n = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    fn.get(n, (r) => {
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
async function vs(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const n = t.match(/\/id\/([^/?#]+)/);
  if (n != null && n[1]) {
    const r = n[1].trim().toLowerCase(), i = As();
    if (i[r] != null)
      return _.debug({ vanity: r, steam32: i[r] }, "[steam32] Cache hit"), i[r];
    if (!e)
      return _.warn({ vanity: r }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const c = await Ps(r, e);
    return c != null && c > 0 ? (i[r] = c, Es(i), _.info({ vanity: r, steam32: c }, "[steam32] Resolved & cached vanity → steam32")) : _.warn({ vanity: r }, "[steam32] Steam API could not resolve vanity URL"), c;
  }
  return _.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function ke(t) {
  return new Promise((e, a) => {
    fn.get(t, (n) => {
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
async function Rs(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  _.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await ke("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const c = await ke(`https://api.bpcleague.in/api/public/seasons/${e}`);
      c.snapshot && c.snapshot.teams ? a = c.snapshot.teams : c.tournament && c.tournament.teams ? a = c.tournament.teams : c.participations && (a = c.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (c) {
    throw _.error(c, "Failed to fetch season/tournament data from bpcleague.in"), c;
  }
  if (!a || a.length === 0)
    return _.warn("No teams found in bpcleague.in API response"), [];
  const n = [];
  for (const c of a) {
    const o = c.name.trim(), m = c.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), l = Fn(c.accentColor) || "#ffffff";
    for (const p of c.players || [])
      n.push({ teamName: o, teamKey: m, teamColor: l, player: p });
  }
  _.info({ total: n.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const r = await Promise.all(
    n.map(
      ({ player: c }) => vs(c.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let c = 0; c < n.length; c++) {
    const { teamName: o, teamKey: m, teamColor: l, player: p } = n[c], h = r[c], g = p.displayName || p.name || "Player", f = p.roles || [], u = p.mmr;
    h != null && h > 0 ? i.push({ displayName: g, steam32: h, teamName: o, teamKey: m, teamColor: l, roles: f, mmr: u }) : _.warn({ displayName: g, url: p.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return _.info({ count: i.length, total: n.length }, "Completed roster sync from bpcleague.in"), i;
}
async function Ts(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  _.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let n;
    e === "latest" || e === "active" ? n = await ke("https://api.bpcleague.in/api/public/tournament") : n = await ke(`https://api.bpcleague.in/api/public/seasons/${e}`);
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
    return _.error(n, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function Ls() {
  _.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await ke("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return _.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function Ns(t) {
  const e = t.trim().toLowerCase();
  _.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await ke("https://api.bpcleague.in/api/public/tournament") : a = await ke(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return _.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
function Z(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function ge(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function On(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function je(t, e) {
  return `${t}W / ${e}L`;
}
function Qe(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, n = t.laneLosses ?? 0;
  return e + a + n === 0 ? null : {
    label: "Lane",
    value: os(e, a, n),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function Un(t, e, a) {
  var r;
  const n = (r = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : r.avatarUrl;
  return n != null && n.trim() ? n : Dn(t, e);
}
function Hs(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : je(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${Z(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${Z(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${Z(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? Z(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function Ms(t, e, a, n) {
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
          sublabel: `${Z(n.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: Z(n.winRate),
          sublabel: je(n.wins, n.losses)
        }
      ] : []
    ];
  const r = a.games - a.wins, i = `${ge(a.avgKills)} / ${ge(a.avgDeaths)} / ${ge(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: je(a.wins, r),
      sublabel: `${Z(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: ge(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: On(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Qe(a) ? [Qe(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...n ? [
      {
        label: "Hero in league",
        value: String(n.picks),
        sublabel: `${Z(n.pickRate)} pick · ${Z(n.winRate)} WR`
      }
    ] : []
  ];
}
function xs(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, n = `${ge(e.avgKills)} / ${ge(e.avgDeaths)} / ${ge(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: je(e.wins, a),
      sublabel: `${Z(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: ge(e.avgKda),
      sublabel: `${n} per game`
    },
    {
      label: "Hero damage",
      value: On(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Qe(e) ? [Qe(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function $n(t) {
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
async function Me(t, e, a) {
  await le(t);
  const n = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, r = n.heroName ?? oe(e), i = ae(e, r);
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
    statSlides: Hs(n),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function xe(t, e, a, n, r, i, c) {
  await le(t);
  const o = Sn(
    c,
    e,
    a
  ), m = r[String(a)], l = oe(a), p = ae(a, l), h = await Un(
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
    playerHero: $n(o),
    statSlides: Ms(n, l, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function js(t, e) {
  return bt(e, t);
}
async function Gn(t, e, a, n, r) {
  await le(t);
  const i = js(e, n), c = await Un(
    t,
    e,
    r
  ), o = X(r ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: c,
    teamLogoUrl: Xr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: $n(i),
    statSlides: xs(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Kn(t, e, a) {
  await le(t);
  const n = await t.matchupBetween(e, a), r = n.ok && n.data && typeof n.data == "object" ? n.data : {}, i = typeof r.games_played == "number" ? r.games_played : void 0, c = typeof r.wins == "number" ? r.wins : typeof r.win == "number" ? r.win : void 0, o = oe(e) || `Hero ${e}`, m = oe(a) || `Hero ${a}`, l = c ?? 0, p = i !== void 0 ? i - l : 0;
  let h = o, g = m, f = l, u = p;
  p > l && (h = m, g = o, f = p, u = l);
  const d = [
    {
      label: "Games Played",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: `${h} Won`,
      value: i !== void 0 ? String(f) : "—"
    },
    {
      label: `${g} Won`,
      value: i !== void 0 ? String(u) : "—"
    }
  ], y = ae(e), w = ae(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: oe(e),
    heroBName: oe(a),
    heroAPortraitSlug: y.heroPortraitSlug,
    heroBPortraitSlug: w.heroPortraitSlug,
    heroAPortraitUrl: y.heroPortraitUrl,
    heroBPortraitUrl: w.heroPortraitUrl,
    matchup: r,
    statLines: d,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: n.ok ? "opendota_cached" : "stale"
  };
}
function Mt(t, e = 4e3) {
  var n, r, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: Z((n = t.tournament) == null ? void 0 : n.winRate),
      sublabel: t.tournament ? je(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((r = t.tournament) == null ? void 0 : r.picks) ?? "—"),
      sublabel: Z((i = t.tournament) == null ? void 0 : i.pickRate)
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
async function Fs(t) {
  return await le(t), Qr();
}
class Ds {
  constructor() {
    j(this, "timer", null);
    j(this, "state", null);
    j(this, "opendota", null);
    j(this, "broadcast", null);
    j(this, "config", {
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
    _.info("Manual autopilot trigger requested"), await this.triggerRandomCard();
  }
  configure(e, a) {
    this.config = { ...this.config, ...e }, a && (this.state = a.state, this.opendota = a.opendota, this.broadcast = a.broadcast), this.config.enabled ? this.startTimer() : this.stopTimer();
  }
  startTimer() {
    if (this.stopTimer(), !this.state || !this.opendota || !this.broadcast) {
      _.warn("Autopilot cannot start: state, opendota or broadcast functions not configured.");
      return;
    }
    const e = this.config.intervalMinutes * 60 * 1e3;
    _.info({ intervalMinutes: this.config.intervalMinutes }, "Starting stats autopilot timer"), this.timer = setInterval(() => {
      this.triggerRandomCard();
    }, e);
  }
  stopTimer() {
    this.timer && (_.info("Stopping stats autopilot timer"), clearInterval(this.timer), this.timer = null);
  }
  async triggerRandomCard() {
    var e, a, n, r, i, c;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          _.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const l = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let p = m;
        l != null && l.radiantTeamKey && (l != null && l.direTeamKey) && (p = m.filter(
          (u) => u.teamKey === l.radiantTeamKey || u.teamKey === l.direTeamKey
        )), p.length === 0 && (p = m);
        const h = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], g = h[Math.floor(Math.random() * h.length)];
        _.info({ cardType: g }, "Autopilot: Triggering random stats card");
        const f = Date.now() + this.config.durationSeconds * 1e3;
        if (g === "player-league") {
          const u = p[Math.floor(Math.random() * p.length)], d = await Gn(
            this.opendota,
            u.steam32,
            u.displayName,
            o.playerHeroIndex,
            m
          ), y = await this.state.patchState({
            heroStatsCard: d,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: f }
            }
          });
          await this.broadcast.broadcastFull(y), _.info({ player: u.displayName }, "Autopilot: Displayed player league stats");
        } else if (g === "player-hero") {
          const u = p[Math.floor(Math.random() * p.length)], d = o.playerHeroIndex ?? {}, y = `${u.steam32}:`, w = Object.keys(d).filter((A) => A.startsWith(y)).map((A) => Number(A.split(":")[1]));
          let b = 1;
          if (w.length > 0)
            b = w[Math.floor(Math.random() * w.length)];
          else {
            const A = Object.keys(o.tournamentHeroIndex ?? {});
            A.length > 0 && (b = Number(A[Math.floor(Math.random() * A.length)]));
          }
          const S = await xe(
            this.opendota,
            u.steam32,
            b,
            u.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), C = Mt(S, 4e3), k = await this.state.patchState({
            heroStatsCard: S,
            statCarousel: C,
            overlayVisibility: {
              herostats: { mode: "timed", until: f }
            }
          });
          await this.broadcast.broadcastFull(k), _.info({ player: u.displayName, heroId: b }, "Autopilot: Displayed player-hero stats carousel");
        } else if (g === "tournament-hero") {
          const u = Object.keys(o.tournamentHeroIndex ?? {});
          if (u.length === 0) return;
          const d = Number(u[Math.floor(Math.random() * u.length)]), y = await Me(
            this.opendota,
            d,
            o.tournamentHeroIndex ?? {}
          ), w = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: f }
            }
          });
          await this.broadcast.broadcastFull(w), _.info({ heroId: d }, "Autopilot: Displayed tournament hero stats");
        } else if (g === "matchup") {
          const u = [
            ...((r = (n = o.draft) == null ? void 0 : n.radiant) == null ? void 0 : r.slots) ?? [],
            ...((c = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : c.slots) ?? []
          ].filter((S) => S.heroId && S.heroId > 0);
          let d = 1, y = 2;
          if (u.length >= 2) {
            const S = u[Math.floor(Math.random() * u.length)];
            let C = u[Math.floor(Math.random() * u.length)];
            for (; C.heroId === S.heroId && u.length > 1; )
              C = u[Math.floor(Math.random() * u.length)];
            d = S.heroId, y = C.heroId;
          } else {
            const S = Object.keys(o.tournamentHeroIndex ?? {});
            if (S.length >= 2)
              for (d = Number(S[Math.floor(Math.random() * S.length)]), y = Number(S[Math.floor(Math.random() * S.length)]); y === d; )
                y = Number(S[Math.floor(Math.random() * S.length)]);
          }
          const w = await Kn(this.opendota, d, y), b = await this.state.patchState({
            matchupCard: w,
            overlayVisibility: {
              matchup: { mode: "timed", until: f }
            }
          });
          await this.broadcast.broadcastFull(b), _.info({ heroA: d, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        _.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const be = new Ds();
function Ue(t, e) {
  return e instanceof qe ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function Os(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  be.configure({}, { state: a, opendota: r, broadcast: n }), e.get("/api/league/info", I, async (c, o) => {
    var p;
    const m = await a.getState(), l = await Le(E.LEAGUE_ID);
    o.json({
      ...Oa(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: l,
      steamApiConfigured: !!E.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((p = E.LEAGUE_MATCH_IDS) != null && p.trim())
    });
  }), e.post("/api/league/config", I, async (c, o) => {
    const l = s.object({ leagueId: s.number() }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    const p = await a.getState(), h = await a.patchState({
      leagueConfig: { ...p.leagueConfig, leagueId: l.data.leagueId }
    });
    await n.broadcastFull(h), o.json({ ok: !0, leagueConfig: h.leagueConfig });
  }), e.post("/api/league/aggregate", I, async (c, o) => {
    var l, p, h;
    if (Q.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const m = await a.getState();
    ((l = m.leagueConfig) == null ? void 0 : l.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: E.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), jn({
      leagueId: ((p = m.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID,
      state: a,
      opendota: r,
      broadcast: n
    }), o.json({ ok: !0, started: !0, leagueId: ((h = m.leagueConfig) == null ? void 0 : h.leagueId) ?? E.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    I,
    async (c, o) => {
      var h;
      const m = (h = (await a.getState()).leagueConfig) == null ? void 0 : h.leagueId;
      if (!await At({
        leagueId: m ?? E.LEAGUE_ID,
        state: a,
        broadcast: n
      })) {
        const g = await Le(m ?? E.LEAGUE_ID), f = g.heroesExists ? Fa(m ?? E.LEAGUE_ID, g) : { ...ja(m ?? E.LEAGUE_ID), statsStorage: g };
        return o.status(422).json(f);
      }
      const p = await a.getState();
      o.json({ ok: !0, leagueConfig: p.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    I,
    async (c, o) => {
      var p, h;
      const m = await Le(E.LEAGUE_ID), l = await a.getState();
      o.json({
        ...m,
        statsDir: Oa().statsDir,
        aggregationSource: (p = l.leagueConfig) == null ? void 0 : p.aggregationSource,
        aggregatedAt: (h = l.leagueConfig) == null ? void 0 : h.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    I,
    async (c, o) => {
      const m = Q.getProgress(), l = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: Q.isBusy(),
        leagueId: E.LEAGUE_ID,
        leagueConfig: l.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", I, async (c, o) => {
    const l = s.object({ csv: s.string().min(1) }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = Ss(l.data.csv), h = await Ba(p, r), g = Ua(h), f = await a.patchState({
      leagueConfig: { roster: h, teamColors: g, leagueId: E.LEAGUE_ID }
    });
    await n.broadcastFull(f), o.json({ ok: !0, count: h.length, teamColors: g, roster: h });
  }), e.post("/api/roster/sync-bpcleague", I, async (c, o) => {
    var p, h;
    const l = s.object({ seasonSlug: s.string().optional() }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    try {
      const g = l.data.seasonSlug || "season-1", f = await Rs({
        seasonSlug: g,
        steamApiKey: E.STEAM_WEB_API_KEY
      }), u = await Ba(f, r), d = Ua(u), y = E.ROSTER_CSV_PATH;
      await gn(v.dirname(y), { recursive: !0 });
      const w = _s(u);
      await Be(y, w, "utf8");
      const b = await Ns(g);
      let S = [];
      b && b.sponsorsConfig && Array.isArray(b.sponsorsConfig.sponsors) && (S = b.sponsorsConfig.sponsors.map((A) => ({
        title: A.title || A.name || "",
        subtitle: A.subtitle || "",
        imageUrl: A.imageUrl || A.logoUrl || A.logo || "",
        color: A.color || "#ffffff",
        isCoSponsor: A.isCoSponsor || !1
      }))), S.length === 0 && (S = [
        { title: "BPC", subtitle: "Gaming", isCoSponsor: !0, color: "#ffffff", imageUrl: "" },
        { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: !1, color: "#ff0000", imageUrl: "" }
      ]);
      const C = await a.getState(), k = await a.patchState({
        leagueConfig: { roster: u, teamColors: d, leagueId: ((p = C.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID, seasonSlug: g },
        sponsor: { banners: S, activeIndex: ((h = C.sponsor) == null ? void 0 : h.activeIndex) ?? 0 }
      });
      await n.broadcastFull(k), o.json({ ok: !0, count: u.length, teamColors: d, roster: u });
    } catch (g) {
      o.status(500).json({
        error: g instanceof Error ? g.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", I, async (c, o) => {
    var l;
    const m = await a.getState();
    o.json(((l = m.leagueConfig) == null ? void 0 : l.roster) ?? []);
  }), e.get("/api/teams", I, async (c, o) => {
    var p;
    const l = ((p = (await a.getState()).leagueConfig) == null ? void 0 : p.roster) ?? [];
    o.json(Et(l));
  }), e.post("/api/match/setup", I, async (c, o) => {
    var f, u;
    const m = kn.safeParse(c.body);
    if (!m.success)
      return o.status(400).json({ error: m.error.flatten() });
    const l = await a.getState(), p = ((f = l.leagueConfig) == null ? void 0 : f.roster) ?? [];
    if (p.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: h, seriesGame: g } = m.data;
    if (g > h)
      return o.status(400).json({
        error: `Game ${g} is invalid for a BO${h} series`
      });
    try {
      const d = { ...m.data }, y = (u = l.leagueConfig) == null ? void 0 : u.matchSetup;
      !d.previousDrafts && (y != null && y.previousDrafts) && (d.previousDrafts = [...y.previousDrafts]), y && d.seriesGame > y.seriesGame && l.draft && (d.previousDrafts = d.previousDrafts ?? [], d.previousDrafts.push(l.draft)), d.seriesGame === 1 && (d.previousDrafts = []);
      const w = Ga(
        d,
        p,
        l.draft
      ), b = await a.patchState({
        leagueConfig: { matchSetup: d },
        draft: w,
        production: {
          playerMappingPublished: !1
        }
      });
      await n.broadcastFull(b), o.json({
        ok: !0,
        matchSetup: d,
        teams: Et(p),
        draft: b.draft
      });
    } catch (d) {
      o.status(400).json({
        error: d instanceof Error ? d.message : String(d)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    I,
    async (c, o) => {
      var C, k, A;
      const m = await a.getState(), l = ((C = m.leagueConfig) == null ? void 0 : C.roster) ?? [];
      if (l.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const p = ((k = m.leagueConfig) == null ? void 0 : k.leagueId) ?? E.LEAGUE_ID, h = await Le(p);
      if (!await At({
        leagueId: p,
        state: a,
        broadcast: n
      })) {
        const H = h.heroesExists ? Fa(p, h) : { ...ja(p), statsStorage: h };
        return o.status(422).json(H);
      }
      const f = await a.getState(), u = f.playerHeroIndex ?? {}, d = Object.keys(u).length, y = [];
      for (const H of l) {
        const T = `${H.steam32}:`;
        Object.keys(u).some((G) => G.startsWith(T)) || y.push(H.steam32);
      }
      const w = new Set(
        Object.keys(u).map((H) => Number(H.split(":")[0]))
      ), b = (A = l[0]) == null ? void 0 : A.steam32, S = b != null ? yt(u, b).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: l.length,
        csvPlayerCount: w.size,
        indexKeyCount: d,
        matchedRosterCount: l.length - y.length,
        missingSteam32: y,
        statsStorage: h,
        indexEmpty: d === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: S,
        leagueConfig: f.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    I,
    async (c, o) => {
      var b, S;
      const m = Number(c.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const l = await a.getState(), p = l.playerHeroIndex ?? {}, h = `${m}:`, g = Object.entries(p).filter(([C]) => C.startsWith(h)).map(([C, k]) => ({
        heroId: Number(C.split(":")[1]),
        games: k.games,
        wins: k.wins
      })), f = yt(p, m), u = ((b = l.leagueConfig) == null ? void 0 : b.leagueId) ?? E.LEAGUE_ID, d = await Le(u);
      let y = [];
      try {
        y = (await We(d.playerHeroesPath, "utf8")).split(/\r?\n/).filter((k) => k.startsWith(`${m},`));
      } catch {
        y = [];
      }
      const w = y.reduce(
        (C, k) => C + (Number(k.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: u,
        gamesInIndex: f.games,
        winsInIndex: f.wins,
        heroRows: g,
        csvRowCount: y.length,
        csvGamesSum: w,
        aggregationMatchTotal: (S = l.leagueConfig) == null ? void 0 : S.aggregationMatchTotal,
        hint: f.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : f.games < w ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    I,
    async (c, o) => {
      var b, S, C, k, A;
      const m = s.object({ pickPlayers: _n.optional() }).safeParse(c.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const l = await a.getState(), p = (b = l.leagueConfig) == null ? void 0 : b.matchSetup, h = ((S = l.leagueConfig) == null ? void 0 : S.roster) ?? [], g = l.draft;
      if (!p)
        return o.status(400).json({ error: "save match setup first" });
      if (!g)
        return o.status(400).json({ error: "no draft state" });
      if (g.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const f = m.data.pickPlayers, u = f ? {
        ...p,
        pickPlayers: {
          radiant: f.radiant ?? ((C = p.pickPlayers) == null ? void 0 : C.radiant),
          dire: f.dire ?? ((k = p.pickPlayers) == null ? void 0 : k.dire)
        }
      } : p, d = {
        ...l.leagueConfig,
        roster: h,
        matchSetup: u
      }, y = Is(g, d), w = await a.patchState({
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
    I,
    async (c, o) => {
      var u, d, y;
      const m = await a.getState(), l = ((u = m.leagueConfig) == null ? void 0 : u.roster) ?? [], p = (d = m.leagueConfig) == null ? void 0 : d.matchSetup, h = (((y = m.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let g = null;
      p && l.length > 0 && (g = Ga(
        p,
        l,
        null
      ));
      const f = await a.patchState({
        draft: g,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: h
        }
      });
      await n.broadcastFull(f), o.json({
        ok: !0,
        overlayDraftEpoch: h,
        draft: f.draft
      });
    }
  ), e.post("/api/league/team-colors", I, async (c, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", I, async (c, o) => {
    const m = await Fs(r);
    o.json(m);
  }), e.post("/api/stats/player-hero", I, async (c, o) => {
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
      Ie(p);
    } catch (d) {
      if (Ue(o, d)) return;
      throw d;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], g = X(h, l.data.steam32) ?? {
      steam32: l.data.steam32,
      displayName: l.data.displayName ?? `Player ${l.data.steam32}`
    }, f = await xe(
      r,
      l.data.steam32,
      l.data.heroId,
      g.displayName,
      p.tournamentHeroIndex ?? {},
      h,
      p.playerHeroIndex
    );
    if (l.data.persist) {
      const d = await a.patchState({
        heroStatsCard: f,
        statCarousel: null
      });
      return await n.broadcastFull(d), o.json({ ok: !0, card: f, persisted: d });
    }
    o.json({ ok: !0, card: f });
  }), e.post("/api/stats/player-league", I, async (c, o) => {
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
      Ie(p);
    } catch (d) {
      if (Ue(o, d)) return;
      throw d;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], g = X(h, l.data.steam32) ?? {
      steam32: l.data.steam32,
      displayName: l.data.displayName ?? `Player ${l.data.steam32}`
    }, f = await Gn(
      r,
      l.data.steam32,
      g.displayName,
      p.playerHeroIndex,
      h
    );
    if (l.data.persist) {
      const d = await a.patchState({
        heroStatsCard: f,
        statCarousel: null
      });
      return await n.broadcastFull(d), o.json({ ok: !0, card: f, persisted: d });
    }
    o.json({ ok: !0, card: f });
  }), e.post(
    "/api/stats/tournament-hero",
    I,
    async (c, o) => {
      const l = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(c.body);
      if (!l.success)
        return o.status(400).json({ error: l.error.flatten() });
      const p = await a.getState();
      try {
        Ie(p);
      } catch (g) {
        if (Ue(o, g)) return;
        throw g;
      }
      const h = await Me(
        r,
        l.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
      if (l.data.persist) {
        const g = await a.patchState({
          heroStatsCard: h,
          statCarousel: null
        });
        return await n.broadcastFull(g), o.json({ ok: !0, card: h, persisted: g });
      }
      o.json({ ok: !0, card: h });
    }
  ), e.post("/api/stats/matchup", I, async (c, o) => {
    const l = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    await a.getState();
    const p = await Kn(
      r,
      l.data.heroAId,
      l.data.heroBId
    );
    if (l.data.persist) {
      const h = await a.patchState({ matchupCard: p });
      return await n.broadcastFull(h), o.json({ ok: !0, card: p, persisted: h });
    }
    o.json({ ok: !0, card: p });
  }), e.post("/api/producer/h2h", I, async (c, o) => {
    var w;
    const l = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error });
    const p = await a.getState(), h = ((w = p.leagueConfig) == null ? void 0 : w.roster) ?? [], g = X(h, l.data.player1Steam32), f = X(h, l.data.player2Steam32);
    if (!g || !f)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      Ie(p);
    } catch (b) {
      return o.status(503).json({ error: b.message });
    }
    const u = bt(p.playerHeroIndex, l.data.player1Steam32), d = bt(p.playerHeroIndex, l.data.player2Steam32), y = {
      player1: { ...g, stats: u },
      player2: { ...f, stats: d }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", I, async (c, o) => {
    var d, y, w, b, S, C, k;
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
      Ie(p);
    } catch (A) {
      if (Ue(o, A)) return;
      throw A;
    }
    const h = ((d = p.leagueConfig) == null ? void 0 : d.roster) ?? [];
    let g;
    if (l.data.type === "last-pick") {
      const A = (y = p.draft) == null ? void 0 : y.lastPick;
      if (!A) return o.status(400).json({ error: "no last pick" });
      const H = A.side === "dire" || A.side === "B" ? "dire" : "radiant", T = H === "radiant" ? (b = (w = p.draft) == null ? void 0 : w.radiant) == null ? void 0 : b.slots : (C = (S = p.draft) == null ? void 0 : S.dire) == null ? void 0 : C.slots, B = bn(H, A.heroId, T), G = B !== void 0 ? at((k = p.leagueConfig) == null ? void 0 : k.matchSetup, H, B) : void 0, q = G != null && G > 0 ? X(h, G) : void 0;
      g = q && G ? await xe(
        r,
        G,
        A.heroId,
        q.displayName,
        p.tournamentHeroIndex ?? {},
        h,
        p.playerHeroIndex
      ) : await Me(
        r,
        A.heroId,
        p.tournamentHeroIndex ?? {}
      );
    } else if (l.data.type === "player-hero") {
      if (l.data.heroId === void 0 || l.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const A = X(h, l.data.steam32);
      g = await xe(
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
      g = await Me(
        r,
        l.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
    }
    const f = Mt(
      g,
      l.data.slideDurationMs ?? 4e3
    ), u = Date.now() + (l.data.overlaySeconds ?? 12) * 1e3;
    if (l.data.persist !== !1) {
      const A = await a.patchState({
        heroStatsCard: g,
        statCarousel: f,
        overlayVisibility: {
          herostats: { mode: "timed", until: u }
        }
      });
      return await n.broadcastFull(A), o.json({ ok: !0, card: g, carousel: f, persisted: A });
    }
    o.json({ ok: !0, card: g, carousel: f });
  }), e.post("/api/stats/stop", I, async (c, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await n.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", I, async (c, o) => {
    const l = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    const p = await a.patchState({ production: l.data });
    await n.broadcastFull(p), o.json(p.production);
  }), e.get("/api/league/bpc-matches", I, async (c, o) => {
    const m = c.query.seasonSlug, l = await Ts(m);
    o.json(l);
  }), e.get("/api/league/bpc-seasons", I, async (c, o) => {
    const m = await Ls();
    o.json(m);
  }), e.get("/api/autopilot/config", I, (c, o) => {
    o.json({
      config: be.getConfig(),
      isActive: be.isActive()
    });
  }), e.post("/api/autopilot/config", I, (c, o) => {
    const l = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(c.body);
    if (!l.success)
      return o.status(400).json({ error: l.error.flatten() });
    be.configure(l.data), o.json({
      config: be.getConfig(),
      isActive: be.isActive()
    });
  }), e.post("/api/autopilot/trigger", I, async (c, o) => {
    await be.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const Us = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function M(t) {
  return t && typeof t == "object" ? t : null;
}
function Rt(t) {
  const e = M(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function Ye(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const Wa = /* @__PURE__ */ new Set();
function $s() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function Gs(t, e, a, n) {
  $s() && (Wa.has(t) || (Wa.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: n.slug,
    source: n.source
  })));
}
function Ks(t, e, a, n) {
  const r = Xe({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  n && Gs(n, t, e, r);
  const i = r.slug ?? Yr({ heroId: t, heroClass: e });
  if (i)
    return { ...yr(i), slug: i };
  if (t) {
    const c = Jr(t, a);
    if (c)
      return {
        staticUrl: c,
        staticFallbackUrl: c,
        slug: Xe({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Va(t, e) {
  if (t) return oe(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function qa(t, e, a) {
  const n = `${e}${a}`, r = W(t[`${n}_id`]), i = Ye(t[`${n}_class`]);
  if (!r && !i)
    return null;
  const c = {};
  return r > 0 && (c.hero_id = r), i && (c.class = i), c;
}
function Ya(t, e) {
  var i;
  const a = [], n = /* @__PURE__ */ new Set(), r = (c, o, m, l) => {
    const p = `${c}-${o}`;
    if (n.has(p) || (n.add(p), !m && !l)) return;
    const h = Ks(
      m,
      l,
      Va(m, l),
      `${e}-${c}${o}`
    );
    a.push({
      order: o,
      type: c,
      heroId: m,
      heroName: Va(m, l),
      heroPortraitSlug: h.slug,
      heroPortraitUrl: h.staticUrl,
      heroPortraitAnimatedUrl: h.animatedUrl
    });
  };
  for (const [c, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(c);
    if (!m) continue;
    const l = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", p = Number(m[2]), h = Rt(o), g = M(o), f = Ye((g == null ? void 0 : g.class) ?? (g == null ? void 0 : g.hero_class));
    r(l, p, h, f);
  }
  for (let c = 0; c < 7; c++) {
    const o = qa(t, "ban", c);
    o && r(
      "ban",
      c,
      W(o.hero_id) > 0 ? W(o.hero_id) : null,
      Ye(o.class)
    );
  }
  for (let c = 0; c < 5; c++) {
    const o = qa(t, "pick", c);
    o && r(
      "pick",
      c,
      W(o.hero_id) > 0 ? W(o.hero_id) : null,
      Ye(o.class)
    );
  }
  return a.sort((c, o) => c.order - o.order), a;
}
function za(t, e) {
  return (e === "radiant" ? M(t.radiant) ?? M(t.team2) : M(t.dire) ?? M(t.team3)) ?? {};
}
function Bs(t) {
  const e = t.activeteam ?? t.active_team;
  return e === 2 || e === "2" || e === "radiant" ? "radiant" : e === 3 || e === "3" || e === "dire" ? "dire" : null;
}
function W(t) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const e = Number(t);
    if (Number.isFinite(e)) return e;
  }
  return 0;
}
function Ws(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function Vs(t, e) {
  const a = M(t.team2), n = M(t.team3), r = W(t.radiant_bonus_time) || W(a == null ? void 0 : a.bonus_time), i = W(t.dire_bonus_time) || W(n == null ? void 0 : n.bonus_time);
  return e === "radiant" ? r : e === "dire" ? i : Math.max(r, i);
}
const Ja = 7, Xa = 5;
function fe(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Ze(t, e) {
  return fe(t, "pick") >= Xa && fe(e, "pick") >= Xa;
}
function Tt(t, e) {
  return fe(t, "ban") > 0 || fe(e, "ban") > 0 || fe(t, "pick") > 0 || fe(e, "pick") > 0;
}
function qs(t, e, a) {
  const n = W(t == null ? void 0 : t.clock_time), r = W(
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
function Ys(t, e, a, n, r) {
  if (!t || Ze(a, n))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !Tt(a, n) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !Tt(a, n) && !r)
    return "starting";
  const i = fe(a, "ban"), c = fe(n, "ban");
  return i < Ja || c < Ja ? "bans" : "picks";
}
function Qa(t) {
  const e = M(t);
  if (!e) return null;
  const a = M(e.hero);
  if (a) {
    const n = Rt(a);
    if (n) return n;
  }
  return Rt(t);
}
function zs(t, e) {
  const a = /* @__PURE__ */ new Map(), n = M(t.player), r = M(t.hero), i = e === "radiant" ? M(r == null ? void 0 : r.team2) ?? M(r == null ? void 0 : r.radiant) : M(r == null ? void 0 : r.team3) ?? M(r == null ? void 0 : r.dire), c = e === "radiant" ? M(n == null ? void 0 : n.team2) ?? M(n == null ? void 0 : n.radiant) : M(n == null ? void 0 : n.team3) ?? M(n == null ? void 0 : n.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const l = /^player(\d+)$/i.exec(o);
      if (!l) continue;
      const p = Number(l[1]) % 5, h = Qa(m);
      if (h && h > 0 && Number.isFinite(p)) {
        let g;
        if (c) {
          const f = M(c[o]);
          if (f != null && f.accountid) {
            const u = parseInt(String(f.accountid), 10);
            Number.isFinite(u) && u > 0 && (g = u);
          }
        }
        a.set(p, { heroId: h, steam32: g });
      }
    }
  if (c)
    for (const [o, m] of Object.entries(c)) {
      const l = /^player(\d+)$/i.exec(o);
      if (!l) continue;
      const p = Number(l[1]) % 5, h = a.get(p);
      if (h != null && h.heroId) continue;
      const g = Qa(m);
      if (g && g > 0 && Number.isFinite(p)) {
        const f = M(m);
        let u;
        if (f != null && f.accountid) {
          const d = parseInt(String(f.accountid), 10);
          Number.isFinite(d) && d > 0 && (u = d);
        }
        a.set(p, { heroId: g, steam32: u });
      }
    }
  return a;
}
function Za(t, e, a) {
  const n = Array.from(zs(a, e).values());
  return t.map((r) => {
    if (r.type !== "pick" || !r.heroId) return r;
    const i = n.find((c) => c.heroId === r.heroId);
    return i ? {
      ...r,
      steam32: i.steam32 ?? r.steam32
    } : r;
  });
}
const Js = [
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
], Xs = [
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
function en(t, e, a) {
  const r = (a === "dire_first_pick" ? Xs : Js).findIndex((i) => i.side === t && i.order === e);
  return r >= 0 ? r : e;
}
function tn(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function ut(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function an(t, e) {
  let a = t[0], n = en(a.side, a.slot.order, e);
  for (const r of t.slice(1)) {
    const i = en(r.side, r.slot.order, e);
    i > n && (a = r, n = i);
  }
  return a;
}
function Qs(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function Zs(t, e, a) {
  var m, l, p, h;
  const n = [];
  for (const g of t)
    g.type === "pick" && g.heroId && n.push({ side: "radiant", slot: g });
  for (const g of e)
    g.type === "pick" && g.heroId && n.push({ side: "dire", slot: g });
  if (n.length === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const g of ["radiant", "dire"]) {
    const f = g === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (l = a == null ? void 0 : a.dire) == null ? void 0 : l.slots;
    for (const u of f ?? []) {
      const d = tn(g, u);
      d && r.add(d);
    }
  }
  const i = n.filter(
    ({ side: g, slot: f }) => !r.has(tn(g, f))
  ), c = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Ze(t, e) && a && !Ze(((p = a.radiant) == null ? void 0 : p.slots) ?? [], ((h = a.dire) == null ? void 0 : h.slots) ?? [])) {
      const g = an(n, c), f = ut(g.side, g.slot);
      if (Qs(a.lastPick, f)) return f;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const g = i[0];
    return ut(g.side, g.slot);
  }
  const o = an(i, c);
  return ut(o.side, o.slot);
}
function nn(t, e, a, n, r) {
  var o, m;
  if (!t)
    return {
      name: n,
      logoUrl: e === "radiant" ? ((o = r == null ? void 0 : r.radiant) == null ? void 0 : o.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlA) : ((m = r == null ? void 0 : r.dire) == null ? void 0 : m.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, c = Pt(a, i);
  return c ? {
    name: c.teamName,
    logoUrl: He(c.teamKey)
  } : { name: n };
}
function eo(t, e, a, n) {
  var q, K;
  const r = M(t.map), i = typeof (r == null ? void 0 : r.game_state) == "string" ? r.game_state : "", c = Us.has(i), o = M(t.draft);
  if (!o && !c)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (r == null ? void 0 : r.team_name_radiant) == "string" ? r.team_name_radiant : "Radiant", l = typeof (r == null ? void 0 : r.team_name_dire) == "string" ? r.team_name_dire : "Dire", p = nn(
    n,
    "radiant",
    a,
    m,
    e
  ), h = nn(
    n,
    "dire",
    a,
    l,
    e
  ), g = o ?? {}, f = za(g, "radiant"), u = za(g, "dire");
  let d = Ya(f, "radiant"), y = Ya(u, "dire");
  Ze(d, y) && (d = Za(d, "radiant", t), y = Za(y, "dire", t));
  const b = o ? Bs(g) : null, S = W(
    g.activeteam_time_remaining ?? g.active_team_time_remaining
  ), C = o ? Ws(g) : void 0, k = o ? Vs(g, b) : 0, A = [
    ...d.map((D) => ({
      team: "A",
      heroId: D.heroId,
      player: D.playerName,
      isBan: D.type === "ban",
      order: D.order,
      heroName: D.heroName,
      heroPortraitUrl: D.heroPortraitUrl
    })),
    ...y.map((D) => ({
      team: "B",
      heroId: D.heroId,
      player: D.playerName,
      isBan: D.type === "ban",
      order: D.order,
      heroName: D.heroName,
      heroPortraitUrl: D.heroPortraitUrl
    }))
  ], H = Zs(d, y, e), T = Ys(
    c,
    i,
    d,
    y,
    b
  );
  let B = qs(r, i, g);
  T === "starting" && B === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? B = e.startSecondsRemaining : S > 0 && !Tt(d, y) && (B = S));
  const G = {
    source: "gsi",
    phase: T,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(k)),
    activeTeam: T === "starting" ? null : b,
    turnAction: T === "starting" ? void 0 : C,
    startSecondsRemaining: T === "starting" ? Math.max(
      0,
      Math.round(
        B ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: T === "starting" ? void 0 : Math.max(0, Math.round(S)),
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
      slots: d,
      bonusTime: Math.max(0, Math.round(W(g.radiant_bonus_time) || W((q = M(g.team2)) == null ? void 0 : q.bonus_time) || 0))
    },
    dire: {
      name: h.name,
      logoUrl: h.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(W(g.dire_bonus_time) || W((K = M(g.team3)) == null ? void 0 : K.bonus_time) || 0))
    },
    picksBansOrder: A,
    lastPick: H
  };
  return { inDraft: c || !!o, draftPatch: G };
}
const et = {};
let rn = !1;
async function to() {
  if (rn) return;
  rn = !0;
  const t = Object.keys(Lt).map((e) => e.replace("item_", ""));
  _.info({ items: t.length }, "Preloading average item timings from OpenDota..."), (async () => {
    for (const e of t)
      try {
        const a = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?item=${e}`, {
          signal: AbortSignal.timeout(3e4)
          // 30s timeout per item
        });
        if (!a.ok) {
          _.warn({ item: e, status: a.status }, "Failed to fetch item timing from OpenDota");
          continue;
        }
        const n = await a.json(), r = {};
        for (const i of n) {
          if (!i.hero_id || !i.time || !i.games) continue;
          const c = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          r[c] || (r[c] = { sum: 0, totalGames: 0 }), r[c].sum += o * m, r[c].totalGames += m;
        }
        et[e] = {};
        for (const [i, c] of Object.entries(r))
          c.totalGames > 0 && (et[e][Number(i)] = Math.round(c.sum / c.totalGames));
        _.debug({ item: e, heroesIndexed: Object.keys(r).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        _.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    _.info("Finished preloading average item timings.");
  })();
}
function ao(t, e) {
  const a = e.replace("item_", "");
  return et[a] ? et[a][t] ?? null : null;
}
const dt = /* @__PURE__ */ new Map(), Lt = {
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
function no(t, e, a) {
  var n, r;
  try {
    return ((r = (n = t == null ? void 0 : t.items) == null ? void 0 : n[e]) == null ? void 0 : r[a]) || {};
  } catch {
    return {};
  }
}
function ro(t, e, a) {
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
function so(t, e, a) {
  var n, r, i;
  try {
    return ((i = (r = (n = t == null ? void 0 : t.player) == null ? void 0 : n[e]) == null ? void 0 : r[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function oo(t, e) {
  var r;
  if (!(t != null && t.items)) return;
  const a = ((r = t == null ? void 0 : t.map) == null ? void 0 : r.clock_time) || 0;
  if (a < 0) return;
  const n = (i) => {
    var c;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, l = no(t, i, m), p = so(t, i, m);
      if (!p || p === "Unknown Player") continue;
      dt.has(p) || dt.set(p, /* @__PURE__ */ new Set());
      const h = dt.get(p), g = /* @__PURE__ */ new Set();
      for (const f in l) {
        const u = (c = l[f]) == null ? void 0 : c.name;
        u && u !== "empty" && g.add(u);
      }
      for (const f of g)
        if (!h.has(f) && (h.add(f), Lt[f])) {
          const u = ro(t, i, m), d = u.id > 0 ? oe(u.id) : u.name, y = Lt[f], w = ao(u.id, f);
          let b = null;
          w !== null && a > 0 && (b = a - w), _.info({ playerName: p, cleanHeroName: d, item: f, hypeData: y, clockTime: a, averageTime: w, timingDiff: b }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: p,
            heroName: d,
            item: f,
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
const tt = {
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
}, io = /* @__PURE__ */ new Set([
  69,
  // Doom
  86,
  // Rubick
  131
  // Ringmaster
]), lo = /* @__PURE__ */ new Set([
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
]), co = /* @__PURE__ */ new Set([
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
function uo(t, e, a, n) {
  if (e && tt[e] !== void 0)
    return tt[e];
  if (e && io.has(e))
    return t;
  const r = a && e !== null && co.has(e), i = n && e !== null && lo.has(e);
  return r || i ? Math.min(t, 6) : Math.min(t, 5);
}
function sn(t, e, a, n) {
  if (e && tt[e] !== void 0)
    return tt[e];
  if (!t || typeof t != "object") return 0;
  let r = 0;
  for (const [i, c] of Object.entries(t))
    if (i.startsWith("ability") && typeof c == "object" && c !== null) {
      const o = c;
      o.hidden !== !0 && typeof o.name == "string" && !o.name.startsWith("special_bonus") && o.name !== "generic_hidden" && o.name !== "empty" && r++;
    }
  return uo(r, e, a, n);
}
function on(t, e) {
  const a = /* @__PURE__ */ new Map();
  if (t && typeof t == "object") {
    for (const [n, r] of Object.entries(t))
      if (n.startsWith("npc_dota_hero_")) {
        const i = typeof r == "number" ? r : Number(r) || 0;
        a.set(n, i);
      }
  }
  return e.map(({ heroClass: n, heroId: r }) => ({
    heroId: r ?? 0,
    heroClass: n,
    kills: a.get(n) ?? 0
  }));
}
function ln(t, e) {
  var r;
  const a = (r = t == null ? void 0 : t.hero) == null ? void 0 : r[e];
  if (!a || typeof a != "object") return [];
  const n = [];
  for (let i = 0; i < 5; i++) {
    const c = a[`player${i}`];
    if (!c || typeof c != "object") continue;
    const o = c.name ?? c.hero_name ?? c.class, m = typeof o == "string" && o.startsWith("npc_dota_hero_") ? o : "", l = c.hero_id ?? c.heroid ?? c.id;
    let p = null;
    if (typeof l == "number" && l > 0)
      p = l;
    else if (typeof l == "string") {
      const h = Number(l);
      Number.isFinite(h) && h > 0 && (p = h);
    }
    (p || m) && n.push({ heroClass: m || `npc_dota_hero_unknown_${i}`, heroId: p });
  }
  return n;
}
function mo(t) {
  var r;
  if (!t || typeof t != "object") return null;
  const e = t.player, a = t.hero;
  if (e && typeof e == "object" && a && typeof a == "object" && e.accountid && (a.hero_id || a.heroid || a.id)) {
    const i = parseInt(String(e.accountid), 10), c = a.hero_id ?? a.heroid ?? a.id;
    let o = null;
    if (typeof c == "number" && c > 0)
      o = c;
    else if (typeof c == "string") {
      const m = Number(c);
      Number.isFinite(m) && m > 0 && (o = m);
    }
    if (Number.isFinite(i) && i > 0 && o) {
      let m = "Unknown";
      typeof e.name == "string" && (m = e.name);
      const l = a.aghanims_shard === !0, p = a.aghanims_scepter === !0, h = typeof e.kills == "number" ? e.kills : Number(e.kills) || 0, g = typeof e.deaths == "number" ? e.deaths : Number(e.deaths) || 0, f = typeof e.assists == "number" ? e.assists : Number(e.assists) || 0, u = typeof e.last_hits == "number" ? e.last_hits : Number(e.last_hits) || 0, d = typeof e.denies == "number" ? e.denies : Number(e.denies) || 0;
      let y;
      const w = e.killed;
      for (const b of ["team2", "team3"]) {
        const S = (r = t == null ? void 0 : t.player) == null ? void 0 : r[b];
        if (S) {
          for (let C = 0; C < 5; C++) {
            const k = S[`player${C}`];
            if (k != null && k.accountid && parseInt(String(k.accountid), 10) === i) {
              const H = ln(t, b === "team2" ? "team3" : "team2");
              y = on(w, H);
              break;
            }
          }
          if (y) break;
        }
      }
      return {
        steam32: i,
        heroId: o,
        playerName: m,
        abilityCount: sn(t.abilities, o, l, p),
        kills: h,
        deaths: g,
        assists: f,
        lastHits: u,
        denies: d,
        enemyHeroKills: y
      };
    }
  }
  const n = (i) => {
    var l, p, h;
    const c = (l = t.hero) == null ? void 0 : l[i], o = (p = t.player) == null ? void 0 : p[i], m = (h = t.abilities) == null ? void 0 : h[i];
    if (!c || !o) return null;
    for (let g = 0; g <= 9; g++) {
      const f = `player${g}`, u = c[f], d = o[f], y = m == null ? void 0 : m[f];
      if (u && typeof u == "object" && u.selected_unit === !0) {
        let w = null;
        const b = u.hero_id ?? u.heroid ?? u.id;
        if (typeof b == "number" && b > 0)
          w = b;
        else if (typeof b == "string") {
          const k = Number(b);
          Number.isFinite(k) && k > 0 && (w = k);
        }
        let S = null;
        if (d && typeof d == "object" && d.accountid) {
          const k = parseInt(String(d.accountid), 10);
          Number.isFinite(k) && k > 0 && (S = k);
        }
        let C = "Unknown";
        if (d && typeof d == "object" && typeof d.name == "string" && (C = d.name), w && S) {
          const k = u.aghanims_shard === !0, A = u.aghanims_scepter === !0, H = typeof (d == null ? void 0 : d.kills) == "number" ? d.kills : Number(d == null ? void 0 : d.kills) || 0, T = typeof (d == null ? void 0 : d.deaths) == "number" ? d.deaths : Number(d == null ? void 0 : d.deaths) || 0, B = typeof (d == null ? void 0 : d.assists) == "number" ? d.assists : Number(d == null ? void 0 : d.assists) || 0, G = typeof (d == null ? void 0 : d.last_hits) == "number" ? d.last_hits : Number(d == null ? void 0 : d.last_hits) || 0, q = typeof (d == null ? void 0 : d.denies) == "number" ? d.denies : Number(d == null ? void 0 : d.denies) || 0, D = ln(t, i === "team2" ? "team3" : "team2"), ve = on(d == null ? void 0 : d.killed, D);
          return {
            steam32: S,
            heroId: w,
            playerName: C,
            abilityCount: sn(y, w, k, A),
            kills: H,
            deaths: T,
            assists: B,
            lastHits: G,
            denies: q,
            enemyHeroKills: ve
          };
        }
      }
    }
    return null;
  };
  return n("team2") || n("team3");
}
function Y(t) {
  return t && typeof t == "object" ? t : null;
}
function $(t, e = 0) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const a = Number(t);
    if (Number.isFinite(a)) return a;
  }
  return e;
}
function te(t) {
  const e = Y(t);
  return e ? $(e.id ?? e.item_id ?? e.itemid, 0) : 0;
}
function go(t, e, a, n, r, i) {
  const c = n < 128, o = r ? c : !c, m = $((e == null ? void 0 : e.hero_id) ?? (e == null ? void 0 : e.heroid) ?? (e == null ? void 0 : e.id), 0) || void 0, l = typeof (e == null ? void 0 : e.name) == "string" ? e.name : void 0, p = te((a == null ? void 0 : a.slot0) ?? (a == null ? void 0 : a.item0)), h = te((a == null ? void 0 : a.slot1) ?? (a == null ? void 0 : a.item1)), g = te((a == null ? void 0 : a.slot2) ?? (a == null ? void 0 : a.item2)), f = te((a == null ? void 0 : a.slot3) ?? (a == null ? void 0 : a.item3)), u = te((a == null ? void 0 : a.slot4) ?? (a == null ? void 0 : a.item4)), d = te((a == null ? void 0 : a.slot5) ?? (a == null ? void 0 : a.item5)), y = te((a == null ? void 0 : a.neutral0) ?? (a == null ? void 0 : a.neutral)), w = te(a == null ? void 0 : a.backpack0), b = te(a == null ? void 0 : a.backpack1), S = te(a == null ? void 0 : a.backpack2), C = [p, h, g, f, u, d], k = $((e == null ? void 0 : e.aghanims_scepter) ?? (e == null ? void 0 : e.has_scepter), 0), A = $((e == null ? void 0 : e.aghanims_shard) ?? (e == null ? void 0 : e.has_shard), 0), H = C.includes(108) || C.includes(271) || C.includes(127) || C.includes(256), T = C.includes(609) || C.includes(125);
  return {
    account_id: $(t.accountid, 0) || void 0,
    personaname: typeof t.name == "string" ? t.name : void 0,
    hero_id: m,
    hero_name: l,
    player_slot: n,
    leaver_status: $(t.leaver_status, 0),
    win: o ? 1 : 0,
    kills: $(t.kills, 0),
    deaths: $(t.deaths, 0),
    assists: $(t.assists, 0),
    hero_damage: $(t.hero_damage, 0),
    hero_healing: $(t.hero_healing ?? t.healer_damage, 0),
    gold_per_min: $(t.gpm ?? t.gold_per_min, 0),
    xp_per_min: $(t.xpm ?? t.xp_per_min, 0),
    net_worth: $(t.net_worth ?? t.networth, 0),
    last_hits: $(t.last_hits, 0),
    denies: $(t.denies, 0),
    lane_efficiency: $(t.lane_efficiency, 0),
    duration: i,
    item_0: p,
    item_1: h,
    item_2: g,
    item_3: f,
    item_4: u,
    item_5: d,
    item_neutral: y,
    backpack_0: w,
    backpack_1: b,
    backpack_2: S,
    aghanims_scepter: k || H ? 1 : 0,
    aghanims_shard: A || T ? 1 : 0
  };
}
function cn(t, e, a, n, r, i) {
  const c = [];
  for (let o = 0; o < 5; o++) {
    const m = `player${o}`, l = Y(t == null ? void 0 : t[m]);
    if (!l) continue;
    const p = Y(e == null ? void 0 : e[m]) ?? null, h = Y(a == null ? void 0 : a[m]) ?? null, g = n + o;
    c.push(
      go(l, p, h, g, r, i)
    );
  }
  return c;
}
function fo(t) {
  const e = Y(t.map);
  if (!((typeof (e == null ? void 0 : e.game_state) == "string" ? e.game_state : "") === "DOTA_GAMERULES_STATE_POST_GAME"))
    return {
      match: { match_id: 0, players: [] },
      matchId: 0,
      isPostGame: !1
    };
  const r = (e == null ? void 0 : e.radiant_win) === !0 || (e == null ? void 0 : e.radiant_win) === "true" || (e == null ? void 0 : e.radiant_win) === 1, i = Math.max(1, $((e == null ? void 0 : e.clock_time) ?? (e == null ? void 0 : e.game_time), 0)), c = $((e == null ? void 0 : e.matchid) ?? (e == null ? void 0 : e.match_id), 0), o = Y(t.player), m = Y(t.hero), l = Y(t.items), p = cn(
    Y((o == null ? void 0 : o.team2) ?? (o == null ? void 0 : o.radiant)),
    Y((m == null ? void 0 : m.team2) ?? (m == null ? void 0 : m.radiant)),
    Y((l == null ? void 0 : l.team2) ?? (l == null ? void 0 : l.radiant)),
    0,
    r,
    i
  ), h = cn(
    Y((o == null ? void 0 : o.team3) ?? (o == null ? void 0 : o.dire)),
    Y((m == null ? void 0 : m.team3) ?? (m == null ? void 0 : m.dire)),
    Y((l == null ? void 0 : l.team3) ?? (l == null ? void 0 : l.dire)),
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
let Ee = 0, mt = null, de = null, $e = 0, ne = null, un = null, Se = 2, we = 2, Ge = 0, Ke = 0, gt = 0, ft = null;
const ho = 600;
function po(t, e) {
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
function yo(t, e, a, n) {
  var c, o, m, l, p, h, g, f;
  let r = null, i = !1;
  for (const u of a) {
    const d = (o = (c = t == null ? void 0 : t.player) == null ? void 0 : c[n]) == null ? void 0 : o[u], y = (l = (m = e == null ? void 0 : e.player) == null ? void 0 : m[n]) == null ? void 0 : l[u], w = (h = (p = t == null ? void 0 : t.hero) == null ? void 0 : p[n]) == null ? void 0 : h[u], b = (f = (g = e == null ? void 0 : e.hero) == null ? void 0 : g[n]) == null ? void 0 : f[u];
    if (!d || !y || !w || !b) continue;
    const S = (y.net_worth || 0) - (d.net_worth || 0), C = (y.gold_reliable || 0) + (y.gold_unreliable || 0) - ((d.gold_reliable || 0) + (d.gold_unreliable || 0)), k = b.aghanims_shard === !0 || b.aghanims_shard === 1;
    if (!(w.aghanims_shard === !0 || w.aghanims_shard === 1) && k && S > 800 || S >= 1300 && S <= 1800) {
      const H = y.net_worth || 0;
      r ? (i = !0, H < r.net_worth && (r = { id: u, nwDelta: S, goldDelta: C, net_worth: H })) : r = { id: u, nwDelta: S, goldDelta: C, net_worth: H };
    }
  }
  return r ? (i && _.warn(
    { teamKey: n, matches: a, selectedId: r.id },
    "Multiple candidates showed Tormentor kill delta in the same tick. Selected the one with lower net worth."
  ), { killed: !0, recipientId: `${n}-${r.id}`, nwDelta: r.nwDelta, goldDelta: r.goldDelta }) : { killed: !1 };
}
let ht = 0, dn = "";
function bo(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  e.post("/gsi", async (c, o) => {
    var y, w;
    const m = typeof c.query.token == "string" ? c.query.token : void 0;
    if (E.GSI_TOKEN && m !== E.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const l = c.body;
    Ee = Date.now(), await le(r);
    try {
      oo(l, i);
    } catch (b) {
      _.error(b, "Power spike evaluation failed");
    }
    const p = await a.getState(), h = ((y = p.leagueConfig) == null ? void 0 : y.roster) ?? [], g = ((w = p.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, f = eo(
      l,
      p.draft ?? null,
      h,
      g
    ), u = mo(l);
    u && (f.focusedPlayerSteam32 = u.steam32, f.focusedPlayerHeroId = u.heroId, f.focusedPlayerName = u.playerName, f.focusedPlayerAbilityCount = u.abilityCount);
    const d = async () => {
      var Ot, Ut, $t, Gt, Kt, Bt, Wt, Vt, qt, Yt, zt, Jt, Xt, Qt, Zt, ea, ta, aa, na, ra, sa, oa, ia, la, ca, ua, da, ma, ga, fa, ha, pa, ya, ba, Sa, wa, _a, ka, Ca, Ia, Aa, Ea;
      const b = await a.getState();
      let S = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      f.draftPatch && (S = {
        ...S,
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
          ...f.draftPatch
        }
      });
      const C = ((Ot = l == null ? void 0 : l.map) == null ? void 0 : Ot.radiant_scan_cooldown) ?? 0, k = ((Ut = l == null ? void 0 : l.map) == null ? void 0 : Ut.dire_scan_cooldown) ?? 0, A = (($t = l == null ? void 0 : l.map) == null ? void 0 : $t.radiant_glyph_cooldown) ?? 0, H = ((Gt = l == null ? void 0 : l.map) == null ? void 0 : Gt.dire_glyph_cooldown) ?? 0, T = ((Kt = l == null ? void 0 : l.map) == null ? void 0 : Kt.clock_time) || 0;
      (Bt = l == null ? void 0 : l.map) != null && Bt.game_time;
      const B = (Wt = l == null ? void 0 : l.map) == null ? void 0 : Wt.matchid, G = ((Vt = ne == null ? void 0 : ne.map) == null ? void 0 : Vt.clock_time) || 0;
      if (B !== void 0 && un !== B ? (un = B, de = null, $e = 0, ne = null, Se = 2, we = 2, Ge = 0, Ke = 0, gt = 0, ft = null) : (T < G || T < (de || 0)) && (de = null, $e = 0, ne = null, Se = 2, we = 2, Ge = 0, Ke = 0), l != null && l.events && Array.isArray(l.events)) {
        console.log("EVENTS:", JSON.stringify(l.events, null, 2));
        for (const L of l.events)
          L.game_time && L.game_time > $e && ($e = L.game_time);
      }
      if (T >= 1200 && (de !== null ? T - de : 1 / 0) >= ho && ne && l) {
        const F = T - G;
        if (F >= 0 && F <= 15) {
          let x = !1;
          for (const N of ["team2", "team3"]) {
            if (x) break;
            const P = po(ne, N), V = yo(ne, l, P, N);
            V.killed && (x = !0, de = T, _.info(
              { recipientId: V.recipientId, nwDelta: V.nwDelta, goldDelta: V.goldDelta },
              "Detected Tormentor kill via net-worth delta"
            ));
          }
        }
      }
      ne = l;
      let q = "dead", K = 0, D = "dead", ve = 0;
      if (T >= 1200) {
        const F = Math.floor((T - 1200) / 300) % 2 === 0;
        let x = !0, N = 0;
        if (de !== null) {
          const P = T - de;
          P >= 0 && P < 600 && (x = !1, N = 600 - P);
        }
        F ? (q = x ? "alive" : "dead", K = N) : (D = x ? "alive" : "dead", ve = N);
      } else
        q = "dead", K = Math.max(0, 1200 - T), D = "dead", ve = Math.max(0, 1200 - T);
      C === 0 ? Se = 2 : C > Ge + 5 && (Se === 0 ? Se = 1 : Se -= 1), Ge = C, k === 0 ? we = 2 : k > Ke + 5 && (we === 0 ? we = 1 : we -= 1), Ke = k;
      let nt = C, rt = k, st = A, ot = H, xt = Se, jt = we, Ce = (qt = l == null ? void 0 : l.map) == null ? void 0 : qt.roshan_state, Ft = (Yt = l == null ? void 0 : l.map) == null ? void 0 : Yt.roshan_state_end_seconds;
      if (T < 0 && (nt = 210, rt = 210, st = 300, ot = 300, xt = 0, jt = 0, Ce = "alive", Ft = 0), Ce && ft === "alive" && Ce !== "alive" && T > 0) {
        gt += 1;
        const L = gt;
        let F = null;
        for (const [ce, z] of [["team2", "radiant"], ["team3", "dire"]]) {
          const O = (zt = l == null ? void 0 : l.items) == null ? void 0 : zt[ce];
          if (O)
            for (const J of Object.keys(O)) {
              const pe = O[J];
              if (pe) {
                for (const it of Object.keys(pe))
                  if (((Jt = pe[it]) == null ? void 0 : Jt.name) === "item_aegis") {
                    F = z;
                    break;
                  }
              }
              if (F) break;
            }
          if (F) break;
        }
        const x = b.draft, N = (Xt = b.leagueConfig) == null ? void 0 : Xt.matchSetup;
        let P, V;
        F ? F === "radiant" ? (P = ((Qt = x == null ? void 0 : x.radiant) == null ? void 0 : Qt.name) ?? (N == null ? void 0 : N.radiantTeamKey) ?? "Radiant", V = ((Zt = x == null ? void 0 : x.radiant) == null ? void 0 : Zt.logoUrl) ?? (N != null && N.radiantTeamKey ? `/teams/${N.radiantTeamKey}.png` : void 0)) : (P = ((ea = x == null ? void 0 : x.dire) == null ? void 0 : ea.name) ?? (N == null ? void 0 : N.direTeamKey) ?? "Dire", V = ((ta = x == null ? void 0 : x.dire) == null ? void 0 : ta.logoUrl) ?? (N != null && N.direTeamKey ? `/teams/${N.direTeamKey}.png` : void 0)) : (P = void 0, V = void 0), _.info(
          { killNumber: L, clockTime: T, aegisTeam: F, teamName: P },
          "[roshan] Roshan killed — emitting ROSHAN_KILLED event"
        ), i.of("/overlay").emit("ROSHAN_KILLED", {
          killNumber: L,
          clockTime: T,
          teamName: P,
          teamLogoUrl: V
        });
      }
      if (Ce && (ft = Ce), S.minimapState = {
        roshanState: Ce,
        roshanRespawnTimer: Ft,
        tormentorRadiant: q,
        tormentorRadiantRespawnTimer: K,
        tormentorDire: D,
        tormentorDireRespawnTimer: ve,
        radiantScanActive: nt === 0,
        radiantScanCooldown: nt,
        radiantScanCharges: xt,
        direScanActive: rt === 0,
        direScanCooldown: rt,
        direScanCharges: jt,
        radiantGlyphActive: st === 0,
        radiantGlyphCooldown: st,
        direGlyphActive: ot === 0,
        direGlyphCooldown: ot
      }, u) {
        const L = f.focusedPlayerSteam32, F = f.focusedPlayerHeroId, x = f.focusedPlayerName, N = f.focusedPlayerAbilityCount;
        if (L && F) {
          const P = ((aa = b.livePlayerCard) == null ? void 0 : aa.steam32) !== L || ((na = b.livePlayerCard) == null ? void 0 : na.heroId) !== F || ((ra = b.livePlayerCard) == null ? void 0 : ra.abilityCount) !== N, V = ((sa = b.overlayVisibility) == null ? void 0 : sa.liveplayercard) !== "visible", ce = (oa = u.enemyHeroKills) == null ? void 0 : oa.map((O) => {
            const J = O.heroId > 0 ? ae(O.heroId) : {};
            return {
              heroId: O.heroId,
              heroClass: O.heroClass,
              heroPortraitSlug: J.heroPortraitSlug,
              heroPortraitUrl: J.heroPortraitUrl,
              kills: O.kills
            };
          }), z = {
            liveKills: u.kills ?? 0,
            liveDeaths: u.deaths ?? 0,
            liveAssists: u.assists ?? 0,
            liveLastHits: u.lastHits ?? 0,
            liveDenies: u.denies ?? 0,
            enemyHeroKills: ce
          };
          if (P || V) {
            const O = X(h, L), J = (O == null ? void 0 : O.displayName) || x || "Unknown";
            S = {
              ...S,
              ...P ? {
                livePlayerCard: {
                  steam32: L,
                  heroId: F,
                  playerLabel: J,
                  playerAvatarUrl: O == null ? void 0 : O.avatarUrl,
                  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  source: "manual",
                  abilityCount: N,
                  ...z
                }
              } : {
                livePlayerCard: {
                  ...b.livePlayerCard ?? {},
                  ...z
                }
              },
              overlayVisibility: {
                ...S.overlayVisibility || {},
                liveplayercard: "visible"
              }
            };
          } else
            S = {
              ...S,
              livePlayerCard: {
                ...b.livePlayerCard ?? {},
                ...z
              }
            };
        }
      } else {
        const L = ((ia = b.overlayVisibility) == null ? void 0 : ia.liveplayercard) === "visible", F = b.livePlayerCard !== null && b.livePlayerCard !== void 0;
        (L || F) && (S = {
          ...S,
          livePlayerCard: null,
          overlayVisibility: {
            ...S.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const Bn = await a.patchState(S);
      await n.broadcastFull(Bn);
      const Re = typeof ((la = l == null ? void 0 : l.map) == null ? void 0 : la.game_state) == "string" ? l.map.game_state : "", Dt = Re === "DOTA_GAMERULES_STATE_POST_GAME" && dn !== "DOTA_GAMERULES_STATE_POST_GAME";
      if (dn = Re, Dt || Re === "DOTA_GAMERULES_STATE_POST_GAME")
        try {
          const L = fo(l), F = L.matchId || "post_game_transition", x = ht === F && !Dt;
          if (L.isPostGame && !x && L.match.players && L.match.players.length >= 2) {
            ht = F;
            const P = Hn(L.match)[0];
            if (P) {
              const ce = ((ca = (await a.getState()).leagueConfig) == null ? void 0 : ca.roster) ?? [], z = P.accountId ? X(ce, P.accountId) : void 0, O = P.heroId ? ae(P.heroId, P.heroName) : {}, J = {
                playerLabel: (z == null ? void 0 : z.displayName) ?? `Player ${P.accountId ?? "?"}`,
                heroId: P.heroId,
                heroName: P.heroName,
                steam32: P.accountId,
                ...O,
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
              if (J.playerLabel.startsWith("Player ") && P.accountId) {
                const it = P.side === "radiant" ? "team2" : "team3", Vn = P.playerSlot < 128 ? P.playerSlot : P.playerSlot - 128, lt = (ma = (da = (ua = l == null ? void 0 : l.player) == null ? void 0 : ua[it]) == null ? void 0 : da[`player${Vn}`]) == null ? void 0 : ma.name;
                typeof lt == "string" && lt.length > 0 && (J.playerLabel = lt);
              }
              const pe = await a.patchState({
                standoutPlayerCard: J,
                overlayVisibility: { standoutplayer: "visible" }
              });
              await n.broadcastFull(pe), _.info(
                { mvpScore: P.mvpScore, heroId: P.heroId, accountId: P.accountId },
                "[post-game] Standout Player auto-selected and pushed to overlay"
              );
            }
          }
        } catch (L) {
          _.error(L, "[post-game] MVP auto-selection failed");
        }
      (Re === "DOTA_GAMERULES_STATE_HERO_SELECTION" || Re === "DOTA_GAMERULES_STATE_STRATEGY_TIME") && (ht = 0);
      const Wn = ((ga = f.draftPatch) == null ? void 0 : ga.lastPick) && (!((fa = b.draft) != null && fa.lastPick) || f.draftPatch.lastPick.heroId !== b.draft.lastPick.heroId || f.draftPatch.lastPick.side !== b.draft.lastPick.side);
      if ((ha = b.production) != null && ha.autoShowStatsOnPick && Wn) {
        try {
          Ie(b);
        } catch {
          return;
        }
        const L = (pa = f.draftPatch) == null ? void 0 : pa.lastPick;
        if (!L) return;
        const F = L.side === "dire" || L.side === "B" ? "dire" : "radiant", x = F === "radiant" ? ((ba = (ya = f.draftPatch) == null ? void 0 : ya.radiant) == null ? void 0 : ba.slots) ?? ((wa = (Sa = b.draft) == null ? void 0 : Sa.radiant) == null ? void 0 : wa.slots) : ((ka = (_a = f.draftPatch) == null ? void 0 : _a.dire) == null ? void 0 : ka.slots) ?? ((Ia = (Ca = b.draft) == null ? void 0 : Ca.dire) == null ? void 0 : Ia.slots), N = bn(F, L.heroId, x), P = N !== void 0 ? at((Aa = b.leagueConfig) == null ? void 0 : Aa.matchSetup, F, N) : void 0, V = ((Ea = b.leagueConfig) == null ? void 0 : Ea.roster) ?? [], ce = P != null && P > 0 ? X(V, P) : void 0, z = ce && P ? await xe(
          r,
          P,
          L.heroId,
          ce.displayName,
          b.tournamentHeroIndex ?? {},
          V,
          b.playerHeroIndex
        ) : await Me(
          r,
          L.heroId,
          b.tournamentHeroIndex ?? {}
        ), O = Mt(z), J = Date.now() + 12e3, pe = await a.patchState({
          heroStatsCard: z,
          statCarousel: O,
          overlayVisibility: {
            herostats: { mode: "timed", until: J }
          }
        });
        await n.broadcastFull(pe);
      }
    };
    mt && clearTimeout(mt), mt = setTimeout(() => {
      d().catch((b) => _.error(b, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: f.inDraft });
  }), e.get("/gsi/status", (c, o) => {
    o.json({
      lastSeen: Ee ? new Date(Ee).toISOString() : null,
      connected: Date.now() - Ee < 5e3
    });
  });
}
function So(t, e, a) {
  var n, r;
  (r = (n = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - Ee > 8e3 && Ee > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || r.call(n);
}
function mn(t, e) {
  var r, i;
  if (t === "overlay")
    return !0;
  const a = e.handshake;
  let n = "";
  return typeof ((r = a.auth) == null ? void 0 : r.token) == "string" ? n = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (n = a.query.token), n ? n === E.BROADCAST_SECRET : !1;
}
async function wo(t) {
  const { state: e, obs: a, opendota: n } = t, r = Ne();
  r.use(Zn({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), r.disable("x-powered-by"), r.use((u, d, y) => {
    u.headers["access-control-request-private-network"] && d.setHeader("Access-Control-Allow-Private-Network", "true"), u.method === "OPTIONS" && u.headers.origin && (d.setHeader("Access-Control-Allow-Origin", u.headers.origin), d.setHeader("Access-Control-Allow-Credentials", "true"), d.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE"), d.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")), y();
  }), r.use(
    Qn({
      origin: !0,
      credentials: !0
    })
  ), r.use(Ne.json({ limit: "1mb" }));
  const i = v.dirname(Nt(import.meta.url)), c = v.join(i, "../../overlay-web/dist"), o = v.join(i, "../../admin-web/dist");
  r.use("/overlay", Ne.static(c)), r.use("/admin", Ne.static(o)), r.get("/admin", (u, d) => {
    const y = v.join(o, "index.html");
    d.sendFile(y, (w) => {
      w && d.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/admin/*", (u, d, y) => {
    if (u.path.includes(".")) return y();
    const w = v.join(o, "index.html");
    d.sendFile(w, (b) => {
      b && d.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  }), r.get("/overlay", (u, d) => {
    const y = v.join(c, "index.html");
    d.sendFile(y, (w) => {
      w && d.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/overlay/*", (u, d, y) => {
    if (u.path.includes(".")) return y();
    const w = v.join(c, "index.html");
    d.sendFile(w, (b) => {
      b && d.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  });
  const m = er.createServer(r), l = new tr(m, {
    cors: { origin: !0, credentials: !0 },
    transports: ["websocket", "polling"]
  }), p = {
    async broadcastFull(u) {
      const d = u ?? await e.getState();
      l.of(se.OVERLAY).emit(re.STATE_FULL, d), l.of(se.PRODUCER).emit(
        re.STATE_FULL,
        d
      ), _.debug({ seq: d.seq }, "Emitted state snapshot");
    }
  };
  Zr({
    app: r,
    state: e,
    io: l,
    broadcast: p,
    obs: a,
    opendota: n
  }), Os({
    app: r,
    state: e,
    io: l,
    broadcast: p,
    opendota: n
  }), bo({
    app: r,
    state: e,
    broadcast: p,
    opendota: n,
    io: l
  }), So(e, p);
  const h = l.of(se.PRODUCER), g = l.of(se.OVERLAY);
  h.use((u, d) => {
    const y = mn("producer", u);
    d(y ? void 0 : new Error("unauthorized producer"));
  }), g.use((u, d) => {
    const y = mn("overlay", u);
    d(y ? void 0 : new Error("unauthorized overlay"));
  }), h.on("connection", (u) => {
    _.info({ id: u.id }, "producer connected"), e.getState().then((d) => {
      u.emit(re.STATE_FULL, d);
    });
  }), g.on("connection", (u) => {
    _.info({ id: u.id }, "overlay viewer connected"), e.getState().then((d) => {
      u.emit(re.STATE_FULL, d);
    });
  });
  const f = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(f) && f > 500) {
    const u = setInterval(() => {
      e.getState().then((d) => {
        l.of(se.OVERLAY).emit(re.STATE_FULL, d);
      });
    }, f);
    typeof u.unref == "function" && u.unref();
  }
  return { app: r, httpServer: m, io: l, broadcast: p };
}
async function _o() {
  const t = await $r(), e = new ir(), a = new ur();
  E.REDIS_URL && a.attachRedis(E.REDIS_URL), le(a).catch(
    (i) => _.warn(i, "hero registry preload deferred")
  ), to().catch(
    (i) => _.warn(i, "item timings preload deferred")
  );
  const n = await wo({ state: t, obs: e, opendota: a });
  await ys({
    state: t,
    opendota: a,
    broadcast: n.broadcast
  }), n.httpServer.listen(E.PORT, () => {
    _.info(
      { port: E.PORT, leagueId: E.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const r = async () => {
    var i;
    _.info("Shutting down"), await n.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), n.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void r()), process.on("SIGTERM", () => void r()), { obs: e, opendota: a, state: t, shutdown: r };
}
process.argv[1] && Nt(import.meta.url) === process.argv[1] && _o().catch((t) => {
  _.error(t, "fatal startup"), process.exit(1);
});
export {
  _o as bootstrapBroadcastServer
};

var yn = Object.defineProperty;
var bn = (t, e, a) => e in t ? yn(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var N = (t, e, a) => bn(t, typeof e != "symbol" ? e + "" : e, a);
import v from "node:path";
import { fileURLToPath as yt } from "node:url";
import { config as Sn } from "dotenv";
import { z as s } from "zod";
import wn from "pino";
import _n from "obs-websocket-js";
import kn from "bottleneck";
import { Redis as bt } from "ioredis";
import In from "cors";
import Ae from "express";
import Cn from "helmet";
import An from "node:http";
import { Server as En } from "socket.io";
import T, { existsSync as Zt } from "node:fs";
import { exec as Pn } from "node:child_process";
import { promisify as vn } from "node:util";
import { mkdir as Ha, writeFile as Me, access as Tn, readFile as He } from "node:fs/promises";
import ja from "node:https";
const Rn = v.dirname(yt(import.meta.url));
Sn({ path: v.resolve(Rn, "../.env") });
const Ln = s.object({
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
}), E = Ln.parse(process.env), S = wn({
  level: process.env.LOG_LEVEL ?? "info"
});
class Nn {
  constructor() {
    N(this, "client", new _n());
    N(this, "settings", null);
    N(this, "reconnectTimer", null);
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
const xn = "https://api.opendota.com/api";
function Mn(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class Hn {
  constructor(e = 600) {
    N(this, "limiter");
    N(this, "memory", /* @__PURE__ */ new Map());
    N(this, "redis", null);
    this.ttlSeconds = e;
    const a = E.OPENDOTA_RATE_PER_MINUTE, n = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new kn({
      minTime: n,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new bt(e);
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
        const n = await fetch(`${xn}${e}`, {
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
const ue = "Game starting in", Fa = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), jn = Fa.partial();
function je(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Fn(t, e, a = Date.now()) {
  if (e.running === !0) {
    const r = e.secondsRemaining ?? (t ? je(t, a) : 0), i = Math.max(0, Math.floor(r));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? ue,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const r = e.secondsRemaining ?? (t ? je(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? ue,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(r))
    };
  }
  const n = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? ue,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? je(t, a) : 0)
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
function ea(t, e = ue) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function ta(t, e = ue) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const On = {
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
function Dn(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (On[e] ?? e);
}
function z(t) {
  return Dn(t.replace(/^npc_dota_hero_/, "").trim());
}
function Un(t) {
  if (!t)
    return {};
  const e = z(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Oa(e)
  } : {};
}
function Oa(t, e) {
  const a = z(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function $n(t, e) {
  const a = z(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function Gn(t, e) {
  const a = z(t);
  if (!a)
    return {};
  const n = Oa(a), r = $n(a);
  return {
    staticUrl: n,
    staticFallbackUrl: n,
    animatedUrl: r
  };
}
function Da(t) {
  return `/teams/${t}.png`;
}
function tt(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function Bn(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map();
  for (const r of t) {
    const i = z(r.name);
    if (!i)
      continue;
    e.set(r.id, i), a.add(i), n.set(tt(r.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    n.set(tt(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: n };
}
function Kn(t, e) {
  const { heroId: a, heroClass: n, heroName: r, urlSlug: i } = t;
  if (i) {
    const l = z(i);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "url" };
  }
  if (a != null && a > 0) {
    const l = e.byId.get(a);
    if (l)
      return { slug: l, source: "id" };
  }
  if (n) {
    const l = z(n);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [r, n]) {
    if (!l)
      continue;
    const o = tt(l), g = e.byDisplayKey.get(o);
    if (g)
      return { slug: g, source: "display" };
  }
  if (n) {
    const l = z(n);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function Ve(t, e, a) {
  var r, i;
  const n = e === "radiant" ? (r = t == null ? void 0 : t.pickPlayers) == null ? void 0 : r.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!n || a < 0 || a >= n.length))
    return n[a] ?? null;
}
function Vn(t, e, a) {
  var r, i;
  const n = Ve(t == null ? void 0 : t.matchSetup, e, a);
  if (!(n == null || !((r = t == null ? void 0 : t.roster) != null && r.length)))
    return (i = t.roster.find((l) => l.steam32 === n)) == null ? void 0 : i.displayName;
}
function Ua(t, e, a) {
  const n = a == null ? void 0 : a.find((r) => r.type === "pick" && r.heroId === e);
  return n == null ? void 0 : n.order;
}
function Wn(t, e) {
  return `${t}:${e}`;
}
function at(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let n = 0, r = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (n += l.games, r += l.wins);
  return { games: n, wins: r };
}
function $a(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[Wn(e, a)];
}
function nt(t, e) {
  if (at(t, e).games <= 0)
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
const qn = [
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
], Yn = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), Ga = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  Yn
]), zn = s.object({
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
}), Jn = s.object({
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
}), Ba = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), Ka = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: Ba.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => De)).optional()
}), Va = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(Jn).default([]),
  matchSetup: Ka.nullable().optional(),
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
}), Wa = s.object({
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
}), qa = s.object({
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
}), Ya = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), rt = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(Ya),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), za = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Qn = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Xn = s.object({
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
}), aa = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Xn).optional(),
  bonusTime: s.number().optional()
}), Zn = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), De = s.object({
  series: zn,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Qn).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: aa.optional(),
  dire: aa.optional(),
  lastPick: Zn.optional()
}), st = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), er = s.object({
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
  replays: s.array(er)
});
const ot = s.object({
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
}), it = s.object({
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
}), tr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), ar = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), pe = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: ar.optional(),
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
  tournament: tr.optional(),
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
  statSlides: s.array(Ya).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional(),
  abilityCount: s.number().optional()
}), lt = s.object({
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
}), ct = s.object({
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
}), nr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: Fa.optional()
}), Ja = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), Qa = s.object({
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
  overlayVisibility: s.record(Ga).default({}),
  sceneHints: Ja.optional(),
  leagueConfig: Va.optional(),
  tournamentHeroIndex: s.record(Wa).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(qa).optional(),
  production: za.optional(),
  statCarousel: rt.nullable().optional(),
  draft: De.nullable().optional(),
  lowerThirds: st.nullable().optional(),
  playerStatsCard: it.nullable().optional(),
  heroStatsCard: pe.nullable().optional(),
  livePlayerCard: pe.nullable().optional(),
  matchupCard: lt.nullable().optional(),
  sponsor: ct.nullable().optional(),
  timers: nr.optional(),
  minimapState: Qa.optional(),
  standoutPlayerCard: ot.nullable().optional()
});
const rr = s.object({
  overlayVisibility: s.record(Ga).optional(),
  leagueConfig: Va.partial().optional(),
  tournamentHeroIndex: s.record(Wa).optional(),
  playerHeroIndex: s.record(qa).optional(),
  production: za.partial().optional(),
  minimapState: Qa.partial().optional(),
  statCarousel: s.union([rt, rt.partial(), s.null()]).optional(),
  draft: s.union([De, De.partial(), s.null()]).optional(),
  lowerThirds: s.union([st, st.partial(), s.null()]).optional(),
  playerStatsCard: s.union([it, it.partial(), s.null()]).optional(),
  heroStatsCard: s.union([pe, pe.partial(), s.null()]).optional(),
  livePlayerCard: s.union([pe, pe.partial(), s.null()]).optional(),
  matchupCard: s.union([lt, lt.partial(), s.null()]).optional(),
  sponsor: s.union([
    ct,
    ct.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: jn.optional()
  }).partial().optional(),
  sceneHints: Ja.partial().optional(),
  standoutPlayerCard: s.union([
    ot,
    ot.partial(),
    s.null()
  ]).optional()
});
function sr() {
  const t = {};
  for (const e of qn)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function or() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function Xa() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: sr(),
    sceneHints: {},
    leagueConfig: or(),
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
const Z = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, ee = {
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
function ir(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function na(t, e) {
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
function lr(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const n = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, r = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return n != null && n.slots && (n.slots = na((i = t.radiant) == null ? void 0 : i.slots, n.slots)), r != null && r.slots && (r.slots = na((l = t.dire) == null ? void 0 : l.slots, r.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: n,
    dire: r,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function oe(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function cr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function ur(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function Za(t, e) {
  var b;
  const a = e.overlayVisibility !== void 0 ? ir(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let n = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: _, ...k } = e.timers;
    n = {
      ...t.timers ?? {},
      ...k
    }, _ !== void 0 && (n = {
      ...n,
      gameStartCountdown: Fn((b = t.timers) == null ? void 0 : b.gameStartCountdown, _)
    });
  }
  const r = lr(t.draft, e.draft), i = cr(t.leagueConfig, e.leagueConfig), l = ur(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let g = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (g = { ...e.playerHeroIndex });
  let c = oe(t.heroStatsCard ?? void 0, e.heroStatsCard), p = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const h = oe(t.lowerThirds ?? void 0, e.lowerThirds), d = oe(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let m = oe(t.matchupCard ?? void 0, e.matchupCard), u = oe(t.sponsor ?? void 0, e.sponsor), f = oe(t.statCarousel ?? void 0, e.statCarousel);
  if (c && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const _ = e.heroStatsCard;
    _.fetchedAt ? c = { ..._ } : c = {
      ...c,
      ..._,
      tournament: _.tournament ? { ...c.tournament ?? {}, ..._.tournament } : c.tournament,
      playerHero: _.playerHero ? { ...c.playerHero ?? {}, ..._.playerHero } : c.playerHero,
      statSlides: _.statSlides ?? c.statSlides
    };
  }
  if (m && e.matchupCard && typeof e.matchupCard == "object") {
    const _ = e.matchupCard;
    m = {
      ...m,
      ..._,
      matchup: _.matchup ? { ...m.matchup ?? {}, ..._.matchup } : m.matchup
    };
  }
  let y = oe(t.livePlayerCard ?? void 0, e.livePlayerCard), w = oe(t.standoutPlayerCard ?? void 0, e.standoutPlayerCard);
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: g ?? t.playerHeroIndex,
    production: l ?? t.production,
    statCarousel: f === void 0 ? t.statCarousel : f,
    draft: r === void 0 ? t.draft : r,
    lowerThirds: h === void 0 ? t.lowerThirds : h,
    playerStatsCard: d === void 0 ? t.playerStatsCard : d,
    heroStatsCard: c === void 0 ? t.heroStatsCard : c,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: m === void 0 ? t.matchupCard : m,
    sponsor: u === void 0 ? t.sponsor : u,
    timers: n ?? t.timers,
    sceneHints: p,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState,
    standoutPlayerCard: w === void 0 ? t.standoutPlayerCard : w
  };
}
function ra(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = Za(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function dr(t) {
  const e = new bt(t.url, {
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
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, g = Za(o, r);
        if (await e.multi().set(t.key, JSON.stringify(g)).exec())
          return g;
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
async function mr() {
  const t = Xa();
  if (E.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), ra(t);
  if (!E.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new bt(E.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: E.REDIS_STATE_KEY }, "State backend: redis"), dr({
      url: E.REDIS_URL,
      key: E.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), E.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), ra(t);
    throw e;
  }
}
function gr(t) {
  return rr.parse(t);
}
const Le = vn(Pn);
class fr {
  constructor() {
    N(this, "dbFile", E.REPLAY_DB_FILE);
    N(this, "matchFile", E.REPLAY_MATCH_FILE);
    N(this, "lastCompletedFile", E.REPLAY_LAST_COMPLETED_FILE);
    N(this, "playbackDir", E.REPLAY_PLAYBACK_DIR);
    N(this, "replayFolder", E.REPLAY_FOLDER);
    N(this, "highlightsDir", E.HIGHLIGHTS_FOLDER || v.resolve(process.cwd(), "../../data/highlights"));
    N(this, "pendingDuration", null);
    N(this, "playbackState", "IDLE");
    N(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    N(this, "previewCacheDir", v.resolve(process.cwd(), "public-preview-cache"));
    if (!T.existsSync(this.previewCacheDir))
      try {
        T.mkdirSync(this.previewCacheDir, { recursive: !0 });
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
      if (!e || !T.existsSync(e)) {
        S.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      T.existsSync(this.replayFolder) || T.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = v.basename(e), n = v.join(this.replayFolder, a);
      e !== n && (T.copyFileSync(e, n), T.unlinkSync(e));
      let r = 30, i = !1;
      this.pendingDuration !== null && (r = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const h = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${n}"`, d = await Le(h), m = parseFloat(d.stdout.trim());
        !isNaN(m) && !i && (r = Math.round(m));
      } catch (h) {
        S.error(h, "Failed to probe duration of new replay");
      }
      const l = await this.getReplayState(), o = l.currentMatch;
      let g = 0;
      for (const h of l.replays)
        h.replayId > g && (g = h.replayId);
      const c = g + 1, p = `${o},${c},"${n}",0,${r}
`;
      if (!T.existsSync(this.dbFile)) {
        const h = v.dirname(this.dbFile);
        T.existsSync(h) || T.mkdirSync(h, { recursive: !0 }), T.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      T.appendFileSync(this.dbFile, p, "utf-8"), S.info({ newPath: n, currentMatch: o, newReplayId: c }, "Saved new replay");
    } catch (a) {
      S.error(a, "Failed to handle saved replay");
    }
  }
  async getReplayState() {
    let e = 1, a = 0;
    const n = [];
    try {
      if (T.existsSync(this.matchFile)) {
        const r = T.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (e = i);
      }
    } catch (r) {
      S.error(r, "Failed to read active match file");
    }
    try {
      if (T.existsSync(this.lastCompletedFile)) {
        const r = T.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (a = i);
      }
    } catch (r) {
      S.error(r, "Failed to read last completed match file");
    }
    try {
      if (T.existsSync(this.dbFile)) {
        const i = T.readFileSync(this.dbFile, "utf-8").split(/\r?\n/);
        for (let l = 1; l < i.length; l++) {
          const o = i[l].trim();
          if (!o) continue;
          const g = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (g) {
            const c = g[3];
            n.push({
              match: parseInt(g[1], 10),
              replayId: parseInt(g[2], 10),
              file: c,
              favorite: parseInt(g[4], 10) === 1,
              duration: parseInt(g[5], 10),
              filename: v.basename(c)
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
      if (!T.existsSync(this.dbFile))
        return !1;
      const r = T.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      r.length > 0 && i.push(r[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let g = 1; g < r.length; g++) {
        const c = r[g].trim();
        if (!c) continue;
        const p = c.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        p && p[3] === e ? (i.push(`${p[1]},${p[2]},"${p[3]}",${o},${p[5]}`), l = !0) : i.push(c);
      }
      return T.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (n) {
      return S.error(n, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!T.existsSync(e))
        return { ok: !1, error: "File not found" };
      const r = (await this.getReplayState()).replays.find((h) => h.file === e), i = r ? r.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await Le(l), g = parseFloat(o.stdout.trim()) || 40, c = Math.max(0, g - i);
      let p = e;
      if (c > 1) {
        T.existsSync(this.playbackDir) || T.mkdirSync(this.playbackDir, { recursive: !0 }), p = v.join(this.playbackDir, "current_replay.mp4");
        const h = `ffmpeg -y -ss ${c} -i "${e}" -t ${i} -c copy "${p}"`;
        S.info({ cmd: h }, "Running ffmpeg slice command"), await Le(h);
      }
      if (a.isConnected()) {
        const h = await a.setInputSettings("ReplayPlayer", {
          local_file: p
        });
        if (!h.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${h.error}` };
        const d = await a.getCurrentProgramScene();
        d.ok && d.sceneName && d.sceneName !== "Replay Stinger" && d.sceneName !== "Replay" && (this.originalScene = d.sceneName), this.playbackState = "STINGER_IN";
        const m = await a.setCurrentScene("Replay Stinger");
        return m.ok || S.error({ error: m.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (n) {
      return S.error(n, "Failed to play replay"), { ok: !1, error: n instanceof Error ? n.message : String(n) };
    }
  }
  async generatePreview(e) {
    try {
      if (!T.existsSync(e))
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
      T.existsSync(v.dirname(this.lastCompletedFile)) || T.mkdirSync(v.dirname(this.lastCompletedFile), { recursive: !0 }), T.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((r) => {
        S.error(r, "Failed to generate highlights in background");
      });
      const n = a + 1;
      return T.writeFileSync(this.matchFile, n.toString(), "utf-8"), S.info(`Advanced to match ${n}`), { ok: !0, currentMatch: n };
    } catch (e) {
      return S.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const n = (await this.getReplayState()).replays.filter((g) => g.match === e && g.favorite);
      if (n.length === 0)
        return S.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      T.existsSync(this.highlightsDir) || T.mkdirSync(this.highlightsDir, { recursive: !0 }), n.sort((g, c) => g.replayId - c.replayId);
      const r = v.join(this.highlightsDir, `concat_${e}.txt`), i = n.map((g) => `file '${g.file.replace(/\\/g, "/")}'`);
      T.writeFileSync(r, i.join(`
`) + `
`, "utf-8");
      const l = v.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${r}" -c copy "${l}"`;
      return S.info({ cmd: o }, "Generating highlights"), await Le(o), S.info(`Generated highlights: ${l}`), { ok: !0, file: l };
    } catch (a) {
      return S.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
const en = {
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
function hr(t) {
  const e = Math.min(...t), n = Math.max(...t) - e;
  return n === 0 ? t.map(() => 0.5) : t.map((r) => (r - e) / n);
}
function ke(t, e) {
  return e === 0 ? 0 : t / e;
}
function pr(t, e = en) {
  const a = t.players ?? [];
  if (a.length === 0) return [];
  const n = Math.max(1, (t.duration ?? 1800) / 60), r = (u) => (u.player_slot ?? 0) < 128, i = a.filter(r), l = a.filter((u) => !r(u)), o = i.reduce((u, f) => u + (f.kills ?? 0), 0), g = l.reduce((u, f) => u + (f.kills ?? 0), 0), c = i.reduce((u, f) => u + (f.net_worth ?? 0), 0), p = l.reduce((u, f) => u + (f.net_worth ?? 0), 0), h = a.map((u) => {
    const f = r(u) ? "radiant" : "dire", y = f === "radiant" ? o : g, w = f === "radiant" ? c : p, b = u.kills ?? 0, _ = u.deaths ?? 0, k = u.assists ?? 0;
    return {
      kda: ke(b + k, _ + 1),
      killParticipation: ke(b + k, Math.max(1, y)),
      gpm: u.gold_per_min ?? 0,
      xpm: u.xp_per_min ?? 0,
      networthShare: ke(u.net_worth ?? 0, Math.max(1, w)),
      damagePm: ke(u.hero_damage ?? 0, n),
      healingPm: ke(u.hero_healing ?? 0, n),
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
  ], m = {};
  for (const u of d)
    m[u] = hr(h.map((f) => f[u]));
  return m.winBonus = h.map((u) => u.winBonus), a.map((u, f) => {
    if (h[f].leaver)
      return sa(u, t, 0, yr());
    const w = {
      kda: m.kda[f] * e.kda,
      killParticipation: m.killParticipation[f] * e.killParticipation,
      gpm: m.gpm[f] * e.gpm,
      xpm: m.xpm[f] * e.xpm,
      networthShare: m.networthShare[f] * e.networthShare,
      damagePm: m.damagePm[f] * e.damagePm,
      healingPm: m.healingPm[f] * e.healingPm,
      lastHits: m.lastHits[f] * e.lastHits,
      denies: m.denies[f] * e.denies,
      laneEfficiency: m.laneEfficiency[f] * e.laneEfficiency,
      winBonus: m.winBonus[f] * e.winBonus
    }, b = Object.values(w).reduce((_, k) => _ + k, 0);
    return sa(u, t, b, w);
  });
}
function yr() {
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
function sa(t, e, a, n, r) {
  const i = (t.player_slot ?? 0) < 128 ? "radiant" : "dire", l = (e.players ?? []).filter((c) => (c.player_slot ?? 0) < 128), o = (e.players ?? []).filter((c) => (c.player_slot ?? 0) >= 128), g = i === "radiant" ? l.reduce((c, p) => c + (p.kills ?? 0), 0) : o.reduce((c, p) => c + (p.kills ?? 0), 0);
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
      teamKills: g,
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
      hasScepter: (t.aghanims_scepter ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((c) => [108, 271, 127, 256].includes(c ?? 0)),
      hasShard: (t.aghanims_shard ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((c) => [609, 125].includes(c ?? 0))
    }
  };
}
function tn(t, e) {
  return [...pr(t, e)].sort((r, i) => i.mvpScore - r.mvpScore).map((r, i) => ({ ...r, rank: i + 1 }));
}
let ie = null, ge = /* @__PURE__ */ new Map(), Ue = null;
function br() {
  if (!(ie != null && ie.length)) {
    Ue = null;
    return;
  }
  Ue = Bn(ie);
}
async function re(t) {
  if (ge.size > 0) return ge;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (ie = e.data, ge = new Map(ie.map((a) => [a.id, a])), br()), ge;
}
function $e(t) {
  if (Ue) return Kn(t, Ue);
  if (t.heroId != null && t.heroId > 0) {
    const e = ge.get(t.heroId);
    if (e) {
      const a = z(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = z(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function Sr(t) {
  return $e(t).slug;
}
function wr(t, e) {
  const a = $e({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const n = ge.get(t);
  if (n)
    return z(n.name) || void 0;
}
function ae(t, e) {
  return Un(
    wr(t, e)
  );
}
function _r(t, e) {
  return ae(t, e).heroPortraitUrl;
}
function te(t) {
  const e = ge.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function kr(t) {
  if (t)
    return Da(t);
}
function K(t, e) {
  return t.find((a) => a.steam32 === e);
}
function Ir() {
  return ie ? [...ie].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function Cr(t) {
  const { app: e, state: a, io: n, broadcast: r, obs: i, opendota: l } = t, o = new fr();
  o.init(i), e.use(
    "/api/replays/media",
    C,
    Ae.static(E.REPLAY_FOLDER)
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
    const m = await a.getState();
    d.json(m);
  }), e.patch("/api/state", C, async (h, d) => {
    try {
      const m = gr(h.body), u = await a.patchState(m);
      await r.broadcastFull(u), d.json(u);
    } catch (m) {
      S.error(m, "state patch failed"), d.status(400).json({
        error: m instanceof Error ? m.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", C, async (h, d) => {
    const m = Xa(), u = await a.replaceState(m);
    await r.broadcastFull(u), d.json(u);
  });
  const g = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function c(h) {
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
      const m = g.safeParse(h.body);
      if (!m.success)
        return d.status(400).json({ error: m.error.flatten() });
      const u = ((w = m.data.label) == null ? void 0 : w.trim()) || ue, f = ea(
        m.data.seconds,
        u
      ), y = await c(f);
      d.json({ ok: !0, gameStartCountdown: (b = y.timers) == null ? void 0 : b.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    C,
    async (h, d) => {
      var _, k, I, A;
      const u = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, f = (typeof ((k = h.body) == null ? void 0 : k.label) == "string" ? h.body.label.trim() : "") || (u == null ? void 0 : u.label) || ue, y = typeof ((I = h.body) == null ? void 0 : I.seconds) == "number" ? h.body.seconds : je(u), w = ta(y, f), b = await c(w);
      d.json({ ok: !0, gameStartCountdown: (A = b.timers) == null ? void 0 : A.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    C,
    async (h, d) => {
      var _, k, I;
      const m = g.safeParse(h.body);
      if (!m.success)
        return d.status(400).json({ error: m.error.flatten() });
      const f = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, y = ((k = m.data.label) == null ? void 0 : k.trim()) || (f == null ? void 0 : f.label) || ue, w = f != null && f.running ? ea(m.data.seconds, y) : ta(m.data.seconds, y), b = await c(w);
      d.json({ ok: !0, gameStartCountdown: (I = b.timers) == null ? void 0 : I.gameStartCountdown });
    }
  );
  const p = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", C, (h, d) => {
    const m = p.safeParse(h.body);
    if (!m.success) return d.status(400).json({ error: m.error.flatten() });
    i.configure(m.data), n.of(ee.PRODUCER).emit(Z.ACK, {
      kind: "obs:config",
      ok: !0
    }), d.json({ ok: !0 });
  }), e.post("/api/obs/connect", C, async (h, d) => {
    const m = h.body;
    if (m && typeof m == "object" && Object.keys(m).length) {
      const f = p.safeParse(m);
      if (!f.success)
        return d.status(400).json({ error: f.error.flatten() });
      i.configure(f.data);
    }
    const u = await i.connect();
    n.of(ee.PRODUCER).emit(Z.ACK, {
      kind: "obs:connect",
      ok: u.ok,
      error: u.error
    }), d.json(u);
  }), e.post("/api/obs/disconnect", C, async (h, d) => {
    await i.disconnect(), n.of(ee.PRODUCER).emit(Z.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), d.json({ ok: !0 });
  }), e.get("/api/obs/scenes", C, async (h, d) => {
    try {
      const m = await i.listScenes();
      d.json({ ok: !0, scenes: m });
    } catch (m) {
      d.status(500).json({
        ok: !1,
        error: m instanceof Error ? m.message : String(m)
      });
    }
  }), e.post("/api/obs/program-scene", C, async (h, d) => {
    const u = s.object({ sceneName: s.string() }).safeParse(h.body);
    if (!u.success)
      return d.status(400).json({ error: u.error.flatten() });
    const f = await i.setProgramScene(u.data.sceneName);
    n.of(ee.PRODUCER).emit(Z.ACK, {
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
      const m = await l.heroesConstants();
      d.json(m);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    C,
    async (h, d) => {
      const m = await l.playerHeroStats(h.params.accountId);
      d.json(m);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    C,
    async (h, d) => {
      const m = await l.heroMatchups(Number(h.params.heroId));
      d.json(m);
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
      const f = await l.matchupBetween(
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
    const f = await a.getState(), y = u.data.accountId !== void 0 ? $a(
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
      const k = await l.playerHeroStats(u.data.accountId);
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
    const f = await l.matchupBetween(
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
    l.purgeMemory(), d.json({ ok: !0 });
  }), e.get("/api/replays", C, async (h, d) => {
    try {
      const m = await o.getReplayState();
      d.json(m);
    } catch (m) {
      d.status(500).json({ error: m instanceof Error ? m.message : String(m) });
    }
  }), e.post("/api/replays/save", C, async (h, d) => {
    const u = s.object({ duration: s.number().nullable().optional() }).safeParse(h.body), f = u.success && u.data.duration || null, y = await o.triggerSaveReplay(f, i);
    d.json(y);
  }), e.post("/api/replays/next-match", C, async (h, d) => {
    const m = await o.nextMatch();
    d.json(m);
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
      return d.status(400).json({ error: u.error.flatten() });
    const { matchId: f, persist: y } = u.data, w = { ...en, ...u.data.weights ?? {} }, b = await l.matchDetails(f);
    if (!b.ok || !b.data)
      return d.status(502).json({
        error: `OpenDota match fetch failed: ${b.error ?? "no data"}`
      });
    const _ = b.data;
    if (Array.isArray(_.players) && _.duration)
      for (const $ of _.players)
        $.duration = _.duration;
    if (await re(l), Array.isArray(_.players)) {
      for (const $ of _.players)
        if ($.hero_id && !$.hero_name) {
          const F = ae($.hero_id);
          $.hero_name = F.heroPortraitSlug ?? String($.hero_id);
        }
    }
    const k = tn(_, w), I = k[0];
    if (!I)
      return d.status(422).json({ error: "No players found in match" });
    const H = ((q = (await a.getState()).leagueConfig) == null ? void 0 : q.roster) ?? [], x = I.accountId ? K(H, I.accountId) : void 0, B = I.heroId ? ae(I.heroId, I.heroName) : {}, O = {
      playerLabel: (x == null ? void 0 : x.displayName) ?? I.personaname ?? `Player ${I.accountId ?? "?"}`,
      heroId: I.heroId,
      heroName: I.heroName,
      steam32: I.accountId,
      ...B,
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
      const A = ae(
        f.heroId,
        typeof f.heroName == "string" ? f.heroName : void 0
      );
      Object.assign(f, A);
    }
    const w = ((I = (await a.getState()).leagueConfig) == null ? void 0 : I.roster) ?? [], b = typeof f.steam32 == "number" ? K(w, f.steam32) : void 0;
    f.playerLabel = (b == null ? void 0 : b.displayName) ?? (typeof f.personaname == "string" ? f.personaname : void 0) ?? `Player ${f.steam32 ?? "?"}`;
    const _ = {
      standoutPlayerCard: f
    };
    u.data.show && (_.overlayVisibility = { standoutplayer: "visible" });
    const k = await a.patchState(_);
    await r.broadcastFull(k), d.json({ ok: !0, standoutPlayerCard: k.standoutPlayerCard });
  }), e.post("/api/standout/hide", C, async (h, d) => {
    const m = await a.patchState({
      overlayVisibility: { standoutplayer: "hidden" }
    });
    await r.broadcastFull(m), d.json({ ok: !0 });
  });
}
function Ar() {
  var e;
  const t = (e = E.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Er(t, e) {
  var l, o, g, c;
  const a = (l = E.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
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
    const m = await d.json(), u = (o = m.result) == null ? void 0 : o.status, f = ((g = m.result) == null ? void 0 : g.matches) ?? [];
    if (u !== void 0 && u !== 1 && f.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${u} for league ${t} (no matches in response)`
      );
    if (f.length === 0) break;
    for (const w of f)
      typeof w.match_id == "number" && w.match_id > 0 && n.push(w.match_id);
    const y = (c = f[f.length - 1]) == null ? void 0 : c.match_id;
    if (y === void 0 || f.length < 100) break;
    r = y - 1;
  }
  const i = [...new Set(n)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function Pr(t, e = 80) {
  var o, g;
  const a = Ar(), n = [];
  if (!((o = E.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let r = [];
  if ((g = E.STEAM_WEB_API_KEY) != null && g.trim())
    try {
      r = await Er(t, e);
    } catch (c) {
      const p = c instanceof Error ? c.message : String(c);
      S.warn({ err: c, leagueId: t }, "Steam league match history failed"), n.push(p);
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
const vr = 10;
function oa(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function ia(t) {
  return t !== void 0 && t < 128;
}
function Tr(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function Rr(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (r) => Tr(r.account_id) && typeof r.lane == "number" && r.lane > 0 && !r.is_roaming
  ), n = [...new Set(a.map((r) => r.lane))];
  for (const r of n) {
    const i = a.filter((m) => m.lane === r), l = i.filter((m) => ia(m.player_slot)), o = i.filter((m) => !ia(m.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const g = Math.max(0, ...l.map(oa)), c = Math.max(0, ...o.map(oa)), p = g - c;
    let h;
    Math.abs(p) <= vr ? h = "draw" : h = p > 0 ? "win" : "loss";
    const d = h === "draw" ? "draw" : h === "win" ? "loss" : "win";
    for (const m of l) e.set(m.account_id, h);
    for (const m of o) e.set(m.account_id, d);
  }
  return e;
}
function Lr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function ze() {
  return [
    v.resolve(process.cwd(), "data/league-stats"),
    v.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function ne() {
  var a;
  const t = (a = E.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return v.isAbsolute(t) ? t : v.resolve(process.cwd(), t);
  const e = E.LEAGUE_ID;
  for (const n of ze())
    if (Zt(v.join(n, `league_${e}_heroes.csv`)))
      return n;
  for (const n of ze())
    if (Zt(n)) return n;
  return ze()[0];
}
function la(t) {
  const e = ne(), a = Re(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function ca(t, e) {
  const a = ne(), n = Re(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [n.heroes, n.playerHeroes],
    statsStorage: e
  };
}
function Re(t) {
  const e = ne();
  return {
    dir: e,
    heroes: v.join(e, `league_${t}_heroes.csv`),
    playerHeroes: v.join(e, `league_${t}_player_heroes.csv`),
    meta: v.join(e, `league_${t}_meta.json`)
  };
}
async function be(t) {
  try {
    return await Tn(t), !0;
  } catch {
    return !1;
  }
}
function Nr(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function xr(t) {
  const e = [];
  let a = "", n = !1;
  for (let r = 0; r < t.length; r++) {
    const i = t[r];
    n ? i === '"' ? t[r + 1] === '"' ? (a += '"', r++) : n = !1 : a += i : i === '"' ? n = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function ua(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(xr);
}
function M(t, e, a = 0) {
  const n = Number(t[e]);
  return Number.isFinite(n) ? n : a;
}
function Ne(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function Mr(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, n = t.assists ?? 0;
  return !(e === 0 && a === 0 && n === 0 || (t.leaver_status ?? 0) >= 3);
}
function an(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function Hr(t) {
  return t.filter((e) => !an(e));
}
function nn(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || an(a)) continue;
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
async function jr(t) {
  const e = Re(t);
  if (!await be(e.heroes))
    return null;
  try {
    const a = await He(e.heroes, "utf8"), n = ua(a);
    if (n.length < 2) return null;
    const r = {};
    for (const o of n.slice(1)) {
      const g = M(o, 0);
      g <= 0 || (r[String(g)] = {
        heroId: g,
        heroName: o[1] || void 0,
        picks: M(o, 2),
        bans: M(o, 3),
        wins: M(o, 4),
        losses: M(o, 5),
        games: M(o, 6),
        pickRate: Ne(o, 7),
        banRate: Ne(o, 8),
        winRate: Ne(o, 9),
        contestRate: Ne(o, 10)
      });
    }
    let i = [];
    if (await be(e.playerHeroes)) {
      const o = await He(e.playerHeroes, "utf8"), g = ua(o);
      for (const c of g.slice(1)) {
        const p = M(c, 0), h = M(c, 1);
        p <= 0 || h <= 0 || i.push({
          steam32: p,
          heroId: h,
          games: M(c, 2),
          wins: M(c, 3),
          kills: M(c, 4),
          deaths: M(c, 5),
          assists: M(c, 6),
          heroDamage: M(c, 7),
          goldPerMin: M(c, 8),
          lastHits: M(c, 9),
          maxKills: M(c, 10),
          laneWins: M(c, 11),
          laneDraws: M(c, 12),
          laneLosses: M(c, 13)
        });
      }
      i = Hr(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await be(e.meta)) {
      const o = JSON.parse(await He(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: r, playerHeroes: i, meta: l };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function Fr(t) {
  const { leagueId: e } = t.meta, a = Re(e);
  await Ha(a.dir, { recursive: !0 });
  const r = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (g, c) => g.heroId - c.heroId
  ))
    r.push(
      [
        o.heroId,
        Nr(o.heroName ?? ""),
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
  await Me(a.heroes, `# BPC league hero stats — league ${e}
${r.join(`
`)}
`, "utf8");
  const l = ["steam32,heroId,games,wins,kills,deaths,assists,heroDamage,goldPerMin,lastHits,maxKills,laneWins,laneDraws,laneLosses"];
  for (const o of t.playerHeroes.sort(
    (g, c) => g.steam32 - c.steam32 || g.heroId - c.heroId
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
  return await Me(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${l.join(`
`)}
`,
    "utf8"
  ), await Me(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function Ie(t) {
  const e = Re(t), [a, n, r] = await Promise.all([
    be(e.heroes),
    be(e.playerHeroes),
    be(e.meta)
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
const Or = 4294967295;
function Dr(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= Or))
    return e;
}
class Ur {
  constructor() {
    N(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    N(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    N(this, "running", !1);
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
      await re(a);
      const o = await Pr(e, n), g = o.matchIds;
      if (g.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && S.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = g.length;
      const c = /* @__PURE__ */ new Map();
      let p = 0;
      for (let d = 0; d < g.length; d++) {
        const m = g[d];
        if (m === void 0) continue;
        S.info(
          { matchId: m, index: d + 1, total: g.length },
          "Aggregating league match"
        );
        let u = await a.matchDetails(m);
        (!u.ok || !((l = (i = u.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(m), u = await a.matchDetails(m)), u.ok && u.data && (u.data.leagueid != null && u.data.leagueid !== 0 && u.data.leagueid !== e ? S.warn(
          {
            matchId: m,
            expectedLeague: e,
            actualLeague: u.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(u.data, c), p += 1)), this.progress.matchDone = d + 1, this.progress.progress = Math.round(
          (d + 1) / Math.max(1, g.length) * 100
        ), r == null || r(this.getProgress());
      }
      if (p === 0)
        throw new Error(
          `Found ${g.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const h = {};
      for (const [d, m] of c) {
        const u = m.wins + m.losses, f = p > 0 ? m.picks / p : 0, y = p > 0 ? m.bans / p : 0, w = f + y, b = u > 0 ? m.wins / u : void 0;
        h[String(d)] = {
          heroId: d,
          heroName: te(d),
          picks: m.picks,
          bans: m.bans,
          wins: m.wins,
          losses: m.losses,
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
        matchTotal: g.length,
        matchDone: g.length,
        heroIndex: h
      }, h;
    } catch (o) {
      const g = o instanceof Error ? o.message : String(o);
      throw this.progress = {
        ...this.progress,
        status: "error",
        error: g
      }, o;
    } finally {
      this.running = !1;
    }
  }
  ingestMatch(e, a) {
    const n = e.radiant_win === !0, r = Rr(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = Dr(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && n || i.player_slot !== void 0 && i.player_slot >= 128 && !n, g = this.getAcc(a, i.hero_id);
      o ? g.wins += 1 : g.losses += 1, Mr(i) && this.trackPlayerHero(l, i.hero_id, o, i, r.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, n, r, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof r.kills == "number" ? r.kills : 0, g = typeof r.deaths == "number" ? r.deaths : 0, c = typeof r.assists == "number" ? r.assists : 0, p = typeof r.hero_damage == "number" ? r.hero_damage : 0, h = typeof r.gold_per_min == "number" ? r.gold_per_min : 0, d = typeof r.last_hits == "number" ? r.last_hits : 0, m = l.get(a) ?? {
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
    m.games += 1, n && (m.wins += 1), i === "win" ? m.laneWins += 1 : i === "draw" ? m.laneDraws += 1 : i === "loss" && (m.laneLosses += 1), m.kills += o, m.deaths += g, m.assists += c, m.heroDamage += p, m.goldPerMin += h, m.lastHits += d, o > m.maxKills && (m.maxKills = o), l.set(a, m);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = Mn(e);
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
const V = new Ur();
async function $r(t) {
  const { leagueId: e, state: a, broadcast: n, source: r } = t, i = r === "csv" ? await jr(e) : null;
  if (!i) return !1;
  V.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: nn(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: r,
      statsCsvDir: ne()
    }
  });
  return await n.broadcastFull(l), !0;
}
async function ut(t) {
  const e = await $r({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: ne() },
    "League stats loaded from CSV"
  ), e;
}
async function rn(t) {
  const { leagueId: e, state: a, opendota: n, broadcast: r } = t;
  if (V.isBusy()) {
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
    const l = await V.aggregateLeague(
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
    ), o = V.getProgress(), g = (/* @__PURE__ */ new Date()).toISOString();
    await Fr({
      heroIndex: l,
      playerHeroes: V.exportPlayerHeroRows(),
      meta: {
        leagueId: e,
        matchTotal: o.matchTotal,
        matchDone: o.matchDone,
        aggregatedAt: g,
        source: "api"
      }
    });
    const c = await a.patchState({
      tournamentHeroIndex: l,
      playerHeroIndex: nn(
        V.exportPlayerHeroRows()
      ),
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "ready",
        aggregatedAt: g,
        aggregationProgress: 100,
        aggregationMatchTotal: o.matchTotal,
        aggregationMatchDone: o.matchDone,
        aggregationError: void 0,
        aggregationSource: "api",
        statsCsvDir: ne()
      }
    });
    await r.broadcastFull(c), S.info(
      { leagueId: e, matches: o.matchTotal, dir: ne() },
      "League aggregation ready — saved to CSV"
    );
  } catch (l) {
    const o = l instanceof Error ? l.message : String(l);
    S.error({ err: l, leagueId: e }, "League aggregation failed");
    const g = await a.patchState({
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "error",
        aggregationError: o
      }
    });
    await r.broadcastFull(g);
  }
}
async function Gr(t) {
  var d, m, u, f;
  const { state: e, opendota: a, broadcast: n } = t, r = E.LEAGUE_ID, i = await e.getState();
  if ((((d = i.leagueConfig) == null ? void 0 : d.leagueId) !== r || ((m = i.leagueConfig) == null ? void 0 : m.leagueId) === null || ((u = i.leagueConfig) == null ? void 0 : u.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: r, aggregationStatus: "idle" }
  }), await ut({
    leagueId: r,
    state: e,
    broadcast: n
  })) return;
  const c = ((f = (await e.getState()).leagueConfig) == null ? void 0 : f.aggregationStatus) === "ready", p = V.getProgress().status === "ready";
  E.LEAGUE_AUTO_AGGREGATE && (!c || !p) && V.getProgress().status !== "running" ? (S.info({ leagueId: r }, "Starting league aggregation (Steam match list + OpenDota details)"), rn({ leagueId: r, state: e, opendota: a, broadcast: n })) : S.info(
    { leagueId: r, dir: ne() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function da() {
  return {
    leagueId: E.LEAGUE_ID,
    autoAggregate: E.LEAGUE_AUTO_AGGREGATE,
    statsDir: ne()
  };
}
class Fe extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function Br(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && V.getProgress().status === "ready";
}
function he(t) {
  var a, n;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new Fe(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new Fe(
      ((n = t.leagueConfig) == null ? void 0 : n.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!Br(t))
    throw new Fe(
      "League stats not ready — run tournament aggregate first"
    );
}
function sn(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function Kr(t) {
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
    const g = o.split(",").map((f) => f.trim());
    if (g.length < 2) continue;
    const c = g[0] ?? "Player", p = Number(g[1]);
    if (!Number.isFinite(p)) continue;
    let h, d, m, u;
    if (g.length >= 4) {
      if (h = g[2] || void 0, d = g[3] || void 0, g.length >= 5) {
        const f = g[4] ?? "";
        f.startsWith("http://") || f.startsWith("https://") ? u = f : m = sn(f);
      }
      if (g.length >= 6) {
        const f = g[5] ?? "";
        (f.startsWith("http://") || f.startsWith("https://")) && (u = f);
      }
    } else g.length === 3 && (d = g[2] || void 0, h = d == null ? void 0 : d.replace(/_/g, " "));
    r.push({ displayName: c, steam32: p, teamName: h, teamKey: d, teamColor: m, avatarUrl: u });
  }
  return r;
}
function Vr(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function Wr(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (n) => [
      n.displayName,
      String(n.steam32),
      n.teamName ?? "",
      n.teamKey ?? "",
      n.teamColor ?? "",
      n.avatarUrl ?? ""
    ].map(Vr).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function ma(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function dt(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const n = a.teamKey ?? qr(a.teamName ?? "unknown"), r = a.teamName ?? Yr(n), i = e.get(n);
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
function mt(t, e) {
  return dt(t).find((a) => a.teamKey === e);
}
function Ee(t) {
  return Da(t);
}
function qr(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Yr(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function ga(t, e, a) {
  return t && t.map((n) => {
    if (n.type !== "pick") return n;
    const r = Ve(a.matchSetup, e, n.order), i = Vn(a, e, n.order);
    if (r == null && !i) {
      const { playerName: l, steam32: o, ...g } = n;
      return g;
    }
    return {
      ...n,
      steam32: r ?? void 0,
      playerName: i
    };
  });
}
function zr(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: ga(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: ga(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function fa(t, e, a) {
  var i, l, o, g;
  const n = mt(e, t.radiantTeamKey), r = mt(e, t.direTeamKey);
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
      logoUrlA: Ee(n.teamKey),
      logoUrlB: Ee(r.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: n.teamName,
      logoUrl: Ee(n.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: r.teamName,
      logoUrl: Ee(r.teamKey),
      slots: (g = a == null ? void 0 : a.dire) == null ? void 0 : g.slots
    }
  };
}
const ha = /* @__PURE__ */ new Map();
async function on(t, e) {
  var l, o, g;
  if (e <= 0) return;
  const a = ha.get(e);
  if (a) return a;
  const n = await t.playerProfile(e);
  if (!n.ok || !n.data) return;
  const r = n.data, i = ((l = r.profile) == null ? void 0 : l.avatarfull) ?? r.avatarfull ?? ((o = r.profile) == null ? void 0 : o.avatarmedium) ?? r.avatarmedium ?? ((g = r.profile) == null ? void 0 : g.avatar) ?? r.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return ha.set(e, i), i;
}
async function pa(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var n;
      if ((n = a.avatarUrl) != null && n.trim()) return a;
      try {
        const r = await on(e, a.steam32);
        return r ? { ...a, avatarUrl: r } : a;
      } catch (r) {
        return S.warn({ err: r, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const gt = v.join(process.cwd(), "steam32-vanity-cache.json");
let de = null;
function Jr() {
  if (de) return de;
  try {
    if (T.existsSync(gt))
      return de = JSON.parse(T.readFileSync(gt, "utf-8")), S.info({ count: Object.keys(de).length }, "[steam32] Loaded vanity cache from disk"), de;
  } catch {
  }
  return de = {}, de;
}
function Qr(t) {
  try {
    T.writeFileSync(gt, JSON.stringify(t, null, 2));
  } catch (e) {
    S.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function Xr(t, e) {
  return new Promise((a) => {
    const n = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    ja.get(n, (r) => {
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
            const g = Number(BigInt(o.response.steamid) - BigInt("76561197960265728"));
            a(g);
          } else
            a(null);
        } catch {
          a(null);
        }
      });
    }).on("error", () => a(null));
  });
}
async function Zr(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const n = t.match(/\/id\/([^/?#]+)/);
  if (n != null && n[1]) {
    const r = n[1].trim().toLowerCase(), i = Jr();
    if (i[r] != null)
      return S.debug({ vanity: r, steam32: i[r] }, "[steam32] Cache hit"), i[r];
    if (!e)
      return S.warn({ vanity: r }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await Xr(r, e);
    return l != null && l > 0 ? (i[r] = l, Qr(i), S.info({ vanity: r, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : S.warn({ vanity: r }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return S.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function fe(t) {
  return new Promise((e, a) => {
    ja.get(t, (n) => {
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
async function es(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await fe("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const l = await fe(`https://api.bpcleague.in/api/public/seasons/${e}`);
      l.snapshot && l.snapshot.teams ? a = l.snapshot.teams : l.tournament && l.tournament.teams ? a = l.tournament.teams : l.participations && (a = l.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (l) {
    throw S.error(l, "Failed to fetch season/tournament data from bpcleague.in"), l;
  }
  if (!a || a.length === 0)
    return S.warn("No teams found in bpcleague.in API response"), [];
  const n = [];
  for (const l of a) {
    const o = l.name.trim(), g = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), c = sn(l.accentColor) || "#ffffff";
    for (const p of l.players || [])
      n.push({ teamName: o, teamKey: g, teamColor: c, player: p });
  }
  S.info({ total: n.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const r = await Promise.all(
    n.map(
      ({ player: l }) => Zr(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < n.length; l++) {
    const { teamName: o, teamKey: g, teamColor: c, player: p } = n[l], h = r[l], d = p.displayName || p.name || "Player", m = p.roles || [], u = p.mmr;
    h != null && h > 0 ? i.push({ displayName: d, steam32: h, teamName: o, teamKey: g, teamColor: c, roles: m, mmr: u }) : S.warn({ displayName: d, url: p.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return S.info({ count: i.length, total: n.length }, "Completed roster sync from bpcleague.in"), i;
}
async function ts(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let n;
    e === "latest" || e === "active" ? n = await fe("https://api.bpcleague.in/api/public/tournament") : n = await fe(`https://api.bpcleague.in/api/public/seasons/${e}`);
    let r = [];
    return n.snapshot && n.snapshot.matches || n.tournament && ((a = n.snapshot) != null && a.matches) ? r = n.snapshot.matches : n.tournament && n.tournament.matches ? r = n.tournament.matches : n.matches && (r = n.matches), r.map((i) => {
      var l, o, g;
      return {
        id: i.id,
        team1: i.team1,
        team2: i.team2,
        winner: i.winner || null,
        status: i.status || "pending",
        stageKey: i.stageKey || "",
        seriesType: ((l = i.meta) == null ? void 0 : l.seriesType) || "bo3",
        team1Score: ((o = i.meta) == null ? void 0 : o.team1Score) ?? 0,
        team2Score: ((g = i.meta) == null ? void 0 : g.team2Score) ?? 0
      };
    });
  } catch (n) {
    return S.error(n, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function as() {
  S.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await fe("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return S.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function ns(t) {
  const e = t.trim().toLowerCase();
  S.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await fe("https://api.bpcleague.in/api/public/tournament") : a = await fe(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return S.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
function W(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function le(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function ln(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function Te(t, e) {
  return `${t}W / ${e}L`;
}
function Ge(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, n = t.laneLosses ?? 0;
  return e + a + n === 0 ? null : {
    label: "Lane",
    value: Lr(e, a, n),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function cn(t, e, a) {
  var r;
  const n = (r = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : r.avatarUrl;
  return n != null && n.trim() ? n : on(t, e);
}
function rs(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : Te(t.wins, t.losses),
      sublabel: e ? t.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${W(t.winRate)} win rate · ${t.games} games`
    },
    {
      label: "Picks",
      value: String(t.picks),
      sublabel: t.picks > 0 ? `${W(t.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(t.bans),
      sublabel: t.bans > 0 ? `${W(t.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: t.games > 0 ? W(t.winRate) : "—",
      sublabel: t.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function ss(t, e, a, n) {
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
          sublabel: `${W(n.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: W(n.winRate),
          sublabel: Te(n.wins, n.losses)
        }
      ] : []
    ];
  const r = a.games - a.wins, i = `${le(a.avgKills)} / ${le(a.avgDeaths)} / ${le(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Te(a.wins, r),
      sublabel: `${W(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: le(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: ln(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ge(a) ? [Ge(a)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(a.avgGpm)} GPM`,
      sublabel: `${Math.round(a.avgLastHits)} avg last hits`
    },
    ...n ? [
      {
        label: "Hero in league",
        value: String(n.picks),
        sublabel: `${W(n.pickRate)} pick · ${W(n.winRate)} WR`
      }
    ] : []
  ];
}
function os(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, n = `${le(e.avgKills)} / ${le(e.avgDeaths)} / ${le(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Te(e.wins, a),
      sublabel: `${W(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: le(e.avgKda),
      sublabel: `${n} per game`
    },
    {
      label: "Hero damage",
      value: ln(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ge(e) ? [Ge(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function un(t) {
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
async function Pe(t, e, a) {
  await re(t);
  const n = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, r = n.heroName ?? te(e), i = ae(e, r);
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
    statSlides: rs(n),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function ve(t, e, a, n, r, i, l) {
  await re(t);
  const o = $a(
    l,
    e,
    a
  ), g = r[String(a)], c = te(a), p = ae(a, c), h = await cn(
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
    ...p,
    playerAvatarUrl: h,
    tournament: g ? {
      pickRate: g.pickRate,
      winRate: g.winRate,
      contestRate: g.contestRate,
      banRate: g.banRate,
      picks: g.picks,
      bans: g.bans,
      wins: g.wins,
      losses: g.losses,
      games: g.games
    } : void 0,
    playerHero: un(o),
    statSlides: ss(n, c, o, g),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function is(t, e) {
  return nt(e, t);
}
async function dn(t, e, a, n, r) {
  await re(t);
  const i = is(e, n), l = await cn(
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
    teamLogoUrl: kr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: un(i),
    statSlides: os(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function mn(t, e, a) {
  await re(t);
  const n = await t.matchupBetween(e, a), r = n.ok && n.data && typeof n.data == "object" ? n.data : {}, i = typeof r.games_played == "number" ? r.games_played : void 0, l = typeof r.wins == "number" ? r.wins : typeof r.win == "number" ? r.win : void 0, o = te(e) || `Hero ${e}`, g = te(a) || `Hero ${a}`, c = l ?? 0, p = i !== void 0 ? i - c : 0;
  let h = o, d = g, m = c, u = p;
  p > c && (h = g, d = o, m = p, u = c);
  const f = [
    {
      label: "Games Played",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: `${h} Won`,
      value: i !== void 0 ? String(m) : "—"
    },
    {
      label: `${d} Won`,
      value: i !== void 0 ? String(u) : "—"
    }
  ], y = ae(e), w = ae(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: te(e),
    heroBName: te(a),
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
function St(t, e = 4e3) {
  var n, r, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: W((n = t.tournament) == null ? void 0 : n.winRate),
      sublabel: t.tournament ? Te(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((r = t.tournament) == null ? void 0 : r.picks) ?? "—"),
      sublabel: W((i = t.tournament) == null ? void 0 : i.pickRate)
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
async function ls(t) {
  return await re(t), Ir();
}
class cs {
  constructor() {
    N(this, "timer", null);
    N(this, "state", null);
    N(this, "opendota", null);
    N(this, "broadcast", null);
    N(this, "config", {
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
        const o = await this.state.getState(), g = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (g.length === 0) {
          S.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const c = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let p = g;
        c != null && c.radiantTeamKey && (c != null && c.direTeamKey) && (p = g.filter(
          (u) => u.teamKey === c.radiantTeamKey || u.teamKey === c.direTeamKey
        )), p.length === 0 && (p = g);
        const h = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], d = h[Math.floor(Math.random() * h.length)];
        S.info({ cardType: d }, "Autopilot: Triggering random stats card");
        const m = Date.now() + this.config.durationSeconds * 1e3;
        if (d === "player-league") {
          const u = p[Math.floor(Math.random() * p.length)], f = await dn(
            this.opendota,
            u.steam32,
            u.displayName,
            o.playerHeroIndex,
            g
          ), y = await this.state.patchState({
            heroStatsCard: f,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
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
          const _ = await ve(
            this.opendota,
            u.steam32,
            b,
            u.displayName,
            o.tournamentHeroIndex ?? {},
            g,
            o.playerHeroIndex
          ), k = St(_, 4e3), I = await this.state.patchState({
            heroStatsCard: _,
            statCarousel: k,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(I), S.info({ player: u.displayName, heroId: b }, "Autopilot: Displayed player-hero stats carousel");
        } else if (d === "tournament-hero") {
          const u = Object.keys(o.tournamentHeroIndex ?? {});
          if (u.length === 0) return;
          const f = Number(u[Math.floor(Math.random() * u.length)]), y = await Pe(
            this.opendota,
            f,
            o.tournamentHeroIndex ?? {}
          ), w = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(w), S.info({ heroId: f }, "Autopilot: Displayed tournament hero stats");
        } else if (d === "matchup") {
          const u = [
            ...((r = (n = o.draft) == null ? void 0 : n.radiant) == null ? void 0 : r.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
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
          const w = await mn(this.opendota, f, y), b = await this.state.patchState({
            matchupCard: w,
            overlayVisibility: {
              matchup: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(b), S.info({ heroA: f, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        S.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const me = new cs();
function xe(t, e) {
  return e instanceof Fe ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function us(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  me.configure({}, { state: a, opendota: r, broadcast: n }), e.get("/api/league/info", C, async (l, o) => {
    var p;
    const g = await a.getState(), c = await Ie(E.LEAGUE_ID);
    o.json({
      ...da(),
      configuredInEnv: !0,
      leagueConfig: g.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: c,
      steamApiConfigured: !!E.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((p = E.LEAGUE_MATCH_IDS) != null && p.trim())
    });
  }), e.post("/api/league/config", C, async (l, o) => {
    const c = s.object({ leagueId: s.number() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const p = await a.getState(), h = await a.patchState({
      leagueConfig: { ...p.leagueConfig, leagueId: c.data.leagueId }
    });
    await n.broadcastFull(h), o.json({ ok: !0, leagueConfig: h.leagueConfig });
  }), e.post("/api/league/aggregate", C, async (l, o) => {
    var c, p, h;
    if (V.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const g = await a.getState();
    ((c = g.leagueConfig) == null ? void 0 : c.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: E.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), rn({
      leagueId: ((p = g.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID,
      state: a,
      opendota: r,
      broadcast: n
    }), o.json({ ok: !0, started: !0, leagueId: ((h = g.leagueConfig) == null ? void 0 : h.leagueId) ?? E.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    C,
    async (l, o) => {
      var h;
      const g = (h = (await a.getState()).leagueConfig) == null ? void 0 : h.leagueId;
      if (!await ut({
        leagueId: g ?? E.LEAGUE_ID,
        state: a,
        broadcast: n
      })) {
        const d = await Ie(g ?? E.LEAGUE_ID), m = d.heroesExists ? ca(g ?? E.LEAGUE_ID, d) : { ...la(g ?? E.LEAGUE_ID), statsStorage: d };
        return o.status(422).json(m);
      }
      const p = await a.getState();
      o.json({ ok: !0, leagueConfig: p.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    C,
    async (l, o) => {
      var p, h;
      const g = await Ie(E.LEAGUE_ID), c = await a.getState();
      o.json({
        ...g,
        statsDir: da().statsDir,
        aggregationSource: (p = c.leagueConfig) == null ? void 0 : p.aggregationSource,
        aggregatedAt: (h = c.leagueConfig) == null ? void 0 : h.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    C,
    async (l, o) => {
      const g = V.getProgress(), c = await a.getState();
      o.json({
        ...g,
        inMemoryRunning: V.isBusy(),
        leagueId: E.LEAGUE_ID,
        leagueConfig: c.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", C, async (l, o) => {
    const c = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const p = Kr(c.data.csv), h = await pa(p, r), d = ma(h), m = await a.patchState({
      leagueConfig: { roster: h, teamColors: d, leagueId: E.LEAGUE_ID }
    });
    await n.broadcastFull(m), o.json({ ok: !0, count: h.length, teamColors: d, roster: h });
  }), e.post("/api/roster/sync-bpcleague", C, async (l, o) => {
    var p, h;
    const c = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    try {
      const d = c.data.seasonSlug || "season-1", m = await es({
        seasonSlug: d,
        steamApiKey: E.STEAM_WEB_API_KEY
      }), u = await pa(m, r), f = ma(u), y = E.ROSTER_CSV_PATH;
      await Ha(v.dirname(y), { recursive: !0 });
      const w = Wr(u);
      await Me(y, w, "utf8");
      const b = await ns(d);
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
  }), e.get("/api/roster", C, async (l, o) => {
    var c;
    const g = await a.getState();
    o.json(((c = g.leagueConfig) == null ? void 0 : c.roster) ?? []);
  }), e.get("/api/teams", C, async (l, o) => {
    var p;
    const c = ((p = (await a.getState()).leagueConfig) == null ? void 0 : p.roster) ?? [];
    o.json(dt(c));
  }), e.post("/api/match/setup", C, async (l, o) => {
    var m, u;
    const g = Ka.safeParse(l.body);
    if (!g.success)
      return o.status(400).json({ error: g.error.flatten() });
    const c = await a.getState(), p = ((m = c.leagueConfig) == null ? void 0 : m.roster) ?? [];
    if (p.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: h, seriesGame: d } = g.data;
    if (d > h)
      return o.status(400).json({
        error: `Game ${d} is invalid for a BO${h} series`
      });
    try {
      const f = { ...g.data }, y = (u = c.leagueConfig) == null ? void 0 : u.matchSetup;
      !f.previousDrafts && (y != null && y.previousDrafts) && (f.previousDrafts = [...y.previousDrafts]), y && f.seriesGame > y.seriesGame && c.draft && (f.previousDrafts = f.previousDrafts ?? [], f.previousDrafts.push(c.draft)), f.seriesGame === 1 && (f.previousDrafts = []);
      const w = fa(
        f,
        p,
        c.draft
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
        teams: dt(p),
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
    async (l, o) => {
      var k, I, A;
      const g = await a.getState(), c = ((k = g.leagueConfig) == null ? void 0 : k.roster) ?? [];
      if (c.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const p = ((I = g.leagueConfig) == null ? void 0 : I.leagueId) ?? E.LEAGUE_ID, h = await Ie(p);
      if (!await ut({
        leagueId: p,
        state: a,
        broadcast: n
      })) {
        const H = h.heroesExists ? ca(p, h) : { ...la(p), statsStorage: h };
        return o.status(422).json(H);
      }
      const m = await a.getState(), u = m.playerHeroIndex ?? {}, f = Object.keys(u).length, y = [];
      for (const H of c) {
        const x = `${H.steam32}:`;
        Object.keys(u).some((O) => O.startsWith(x)) || y.push(H.steam32);
      }
      const w = new Set(
        Object.keys(u).map((H) => Number(H.split(":")[0]))
      ), b = (A = c[0]) == null ? void 0 : A.steam32, _ = b != null ? at(u, b).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: c.length,
        csvPlayerCount: w.size,
        indexKeyCount: f,
        matchedRosterCount: c.length - y.length,
        missingSteam32: y,
        statsStorage: h,
        indexEmpty: f === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: _,
        leagueConfig: m.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    C,
    async (l, o) => {
      var b, _;
      const g = Number(l.params.steam32);
      if (!Number.isFinite(g) || g <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const c = await a.getState(), p = c.playerHeroIndex ?? {}, h = `${g}:`, d = Object.entries(p).filter(([k]) => k.startsWith(h)).map(([k, I]) => ({
        heroId: Number(k.split(":")[1]),
        games: I.games,
        wins: I.wins
      })), m = at(p, g), u = ((b = c.leagueConfig) == null ? void 0 : b.leagueId) ?? E.LEAGUE_ID, f = await Ie(u);
      let y = [];
      try {
        y = (await He(f.playerHeroesPath, "utf8")).split(/\r?\n/).filter((I) => I.startsWith(`${g},`));
      } catch {
        y = [];
      }
      const w = y.reduce(
        (k, I) => k + (Number(I.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: g,
        leagueId: u,
        gamesInIndex: m.games,
        winsInIndex: m.wins,
        heroRows: d,
        csvRowCount: y.length,
        csvGamesSum: w,
        aggregationMatchTotal: (_ = c.leagueConfig) == null ? void 0 : _.aggregationMatchTotal,
        hint: m.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : m.games < w ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    C,
    async (l, o) => {
      var b, _, k, I, A;
      const g = s.object({ pickPlayers: Ba.optional() }).safeParse(l.body ?? {});
      if (!g.success)
        return o.status(400).json({ error: g.error.flatten() });
      const c = await a.getState(), p = (b = c.leagueConfig) == null ? void 0 : b.matchSetup, h = ((_ = c.leagueConfig) == null ? void 0 : _.roster) ?? [], d = c.draft;
      if (!p)
        return o.status(400).json({ error: "save match setup first" });
      if (!d)
        return o.status(400).json({ error: "no draft state" });
      if (d.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const m = g.data.pickPlayers, u = m ? {
        ...p,
        pickPlayers: {
          radiant: m.radiant ?? ((k = p.pickPlayers) == null ? void 0 : k.radiant),
          dire: m.dire ?? ((I = p.pickPlayers) == null ? void 0 : I.dire)
        }
      } : p, f = {
        ...c.leagueConfig,
        roster: h,
        matchSetup: u
      }, y = zr(d, f), w = await a.patchState({
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
    async (l, o) => {
      var u, f, y;
      const g = await a.getState(), c = ((u = g.leagueConfig) == null ? void 0 : u.roster) ?? [], p = (f = g.leagueConfig) == null ? void 0 : f.matchSetup, h = (((y = g.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let d = null;
      p && c.length > 0 && (d = fa(
        p,
        c,
        null
      ));
      const m = await a.patchState({
        draft: d,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: h
        }
      });
      await n.broadcastFull(m), o.json({
        ok: !0,
        overlayDraftEpoch: h,
        draft: m.draft
      });
    }
  ), e.post("/api/league/team-colors", C, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", C, async (l, o) => {
    const g = await ls(r);
    o.json(g);
  }), e.post("/api/stats/player-hero", C, async (l, o) => {
    var u;
    const c = s.object({
      steam32: s.number(),
      heroId: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const p = await a.getState();
    try {
      he(p);
    } catch (f) {
      if (xe(o, f)) return;
      throw f;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], d = K(h, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, m = await ve(
      r,
      c.data.steam32,
      c.data.heroId,
      d.displayName,
      p.tournamentHeroIndex ?? {},
      h,
      p.playerHeroIndex
    );
    if (c.data.persist) {
      const f = await a.patchState({
        heroStatsCard: m,
        statCarousel: null
      });
      return await n.broadcastFull(f), o.json({ ok: !0, card: m, persisted: f });
    }
    o.json({ ok: !0, card: m });
  }), e.post("/api/stats/player-league", C, async (l, o) => {
    var u;
    const c = s.object({
      steam32: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const p = await a.getState();
    try {
      he(p);
    } catch (f) {
      if (xe(o, f)) return;
      throw f;
    }
    const h = ((u = p.leagueConfig) == null ? void 0 : u.roster) ?? [], d = K(h, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, m = await dn(
      r,
      c.data.steam32,
      d.displayName,
      p.playerHeroIndex,
      h
    );
    if (c.data.persist) {
      const f = await a.patchState({
        heroStatsCard: m,
        statCarousel: null
      });
      return await n.broadcastFull(f), o.json({ ok: !0, card: m, persisted: f });
    }
    o.json({ ok: !0, card: m });
  }), e.post(
    "/api/stats/tournament-hero",
    C,
    async (l, o) => {
      const c = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(l.body);
      if (!c.success)
        return o.status(400).json({ error: c.error.flatten() });
      const p = await a.getState();
      try {
        he(p);
      } catch (d) {
        if (xe(o, d)) return;
        throw d;
      }
      const h = await Pe(
        r,
        c.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
      if (c.data.persist) {
        const d = await a.patchState({
          heroStatsCard: h,
          statCarousel: null
        });
        return await n.broadcastFull(d), o.json({ ok: !0, card: h, persisted: d });
      }
      o.json({ ok: !0, card: h });
    }
  ), e.post("/api/stats/matchup", C, async (l, o) => {
    const c = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    await a.getState();
    const p = await mn(
      r,
      c.data.heroAId,
      c.data.heroBId
    );
    if (c.data.persist) {
      const h = await a.patchState({ matchupCard: p });
      return await n.broadcastFull(h), o.json({ ok: !0, card: p, persisted: h });
    }
    o.json({ ok: !0, card: p });
  }), e.post("/api/producer/h2h", C, async (l, o) => {
    var w;
    const c = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const p = await a.getState(), h = ((w = p.leagueConfig) == null ? void 0 : w.roster) ?? [], d = K(h, c.data.player1Steam32), m = K(h, c.data.player2Steam32);
    if (!d || !m)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      he(p);
    } catch (b) {
      return o.status(503).json({ error: b.message });
    }
    const u = nt(p.playerHeroIndex, c.data.player1Steam32), f = nt(p.playerHeroIndex, c.data.player2Steam32), y = {
      player1: { ...d, stats: u },
      player2: { ...m, stats: f }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", C, async (l, o) => {
    var f, y, w, b, _, k, I;
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
    const p = await a.getState();
    try {
      he(p);
    } catch (A) {
      if (xe(o, A)) return;
      throw A;
    }
    const h = ((f = p.leagueConfig) == null ? void 0 : f.roster) ?? [];
    let d;
    if (c.data.type === "last-pick") {
      const A = (y = p.draft) == null ? void 0 : y.lastPick;
      if (!A) return o.status(400).json({ error: "no last pick" });
      const H = A.side === "dire" || A.side === "B" ? "dire" : "radiant", x = H === "radiant" ? (b = (w = p.draft) == null ? void 0 : w.radiant) == null ? void 0 : b.slots : (k = (_ = p.draft) == null ? void 0 : _.dire) == null ? void 0 : k.slots, B = Ua(H, A.heroId, x), O = B !== void 0 ? Ve((I = p.leagueConfig) == null ? void 0 : I.matchSetup, H, B) : void 0, q = O != null && O > 0 ? K(h, O) : void 0;
      d = q && O ? await ve(
        r,
        O,
        A.heroId,
        q.displayName,
        p.tournamentHeroIndex ?? {},
        h,
        p.playerHeroIndex
      ) : await Pe(
        r,
        A.heroId,
        p.tournamentHeroIndex ?? {}
      );
    } else if (c.data.type === "player-hero") {
      if (c.data.heroId === void 0 || c.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const A = K(h, c.data.steam32);
      d = await ve(
        r,
        c.data.steam32,
        c.data.heroId,
        (A == null ? void 0 : A.displayName) ?? "Player",
        p.tournamentHeroIndex ?? {},
        h,
        p.playerHeroIndex
      );
    } else {
      if (c.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      d = await Pe(
        r,
        c.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
    }
    const m = St(
      d,
      c.data.slideDurationMs ?? 4e3
    ), u = Date.now() + (c.data.overlaySeconds ?? 12) * 1e3;
    if (c.data.persist !== !1) {
      const A = await a.patchState({
        heroStatsCard: d,
        statCarousel: m,
        overlayVisibility: {
          herostats: { mode: "timed", until: u }
        }
      });
      return await n.broadcastFull(A), o.json({ ok: !0, card: d, carousel: m, persisted: A });
    }
    o.json({ ok: !0, card: d, carousel: m });
  }), e.post("/api/stats/stop", C, async (l, o) => {
    const g = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await n.broadcastFull(g), o.json({ ok: !0, persisted: g });
  }), e.post("/api/production/settings", C, async (l, o) => {
    const c = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const p = await a.patchState({ production: c.data });
    await n.broadcastFull(p), o.json(p.production);
  }), e.get("/api/league/bpc-matches", C, async (l, o) => {
    const g = l.query.seasonSlug, c = await ts(g);
    o.json(c);
  }), e.get("/api/league/bpc-seasons", C, async (l, o) => {
    const g = await as();
    o.json(g);
  }), e.get("/api/autopilot/config", C, (l, o) => {
    o.json({
      config: me.getConfig(),
      isActive: me.isActive()
    });
  }), e.post("/api/autopilot/config", C, (l, o) => {
    const c = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    me.configure(c.data), o.json({
      config: me.getConfig(),
      isActive: me.isActive()
    });
  }), e.post("/api/autopilot/trigger", C, async (l, o) => {
    await me.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const ds = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function L(t) {
  return t && typeof t == "object" ? t : null;
}
function ft(t) {
  const e = L(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function Oe(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const ya = /* @__PURE__ */ new Set();
function ms() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function gs(t, e, a, n) {
  ms() && (ya.has(t) || (ya.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: n.slug,
    source: n.source
  })));
}
function fs(t, e, a, n) {
  const r = $e({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  n && gs(n, t, e, r);
  const i = r.slug ?? Sr({ heroId: t, heroClass: e });
  if (i)
    return { ...Gn(i), slug: i };
  if (t) {
    const l = _r(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: $e({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function ba(t, e) {
  if (t) return te(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function Sa(t, e, a) {
  const n = `${e}${a}`, r = U(t[`${n}_id`]), i = Oe(t[`${n}_class`]);
  if (!r && !i)
    return null;
  const l = {};
  return r > 0 && (l.hero_id = r), i && (l.class = i), l;
}
function wa(t, e) {
  var i;
  const a = [], n = /* @__PURE__ */ new Set(), r = (l, o, g, c) => {
    const p = `${l}-${o}`;
    if (n.has(p) || (n.add(p), !g && !c)) return;
    const h = fs(
      g,
      c,
      ba(g, c),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: g,
      heroName: ba(g, c),
      heroPortraitSlug: h.slug,
      heroPortraitUrl: h.staticUrl,
      heroPortraitAnimatedUrl: h.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const g = /^(pick|ban)(\d+)$/i.exec(l);
    if (!g) continue;
    const c = ((i = g[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", p = Number(g[2]), h = ft(o), d = L(o), m = Oe((d == null ? void 0 : d.class) ?? (d == null ? void 0 : d.hero_class));
    r(c, p, h, m);
  }
  for (let l = 0; l < 7; l++) {
    const o = Sa(t, "ban", l);
    o && r(
      "ban",
      l,
      U(o.hero_id) > 0 ? U(o.hero_id) : null,
      Oe(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = Sa(t, "pick", l);
    o && r(
      "pick",
      l,
      U(o.hero_id) > 0 ? U(o.hero_id) : null,
      Oe(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function _a(t, e) {
  return (e === "radiant" ? L(t.radiant) ?? L(t.team2) : L(t.dire) ?? L(t.team3)) ?? {};
}
function hs(t) {
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
function ps(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function ys(t, e) {
  const a = L(t.team2), n = L(t.team3), r = U(t.radiant_bonus_time) || U(a == null ? void 0 : a.bonus_time), i = U(t.dire_bonus_time) || U(n == null ? void 0 : n.bonus_time);
  return e === "radiant" ? r : e === "dire" ? i : Math.max(r, i);
}
const ka = 7, Ia = 5;
function ce(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Be(t, e) {
  return ce(t, "pick") >= Ia && ce(e, "pick") >= Ia;
}
function ht(t, e) {
  return ce(t, "ban") > 0 || ce(e, "ban") > 0 || ce(t, "pick") > 0 || ce(e, "pick") > 0;
}
function bs(t, e, a) {
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
function Ss(t, e, a, n, r) {
  if (!t || Be(a, n))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !ht(a, n) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !ht(a, n) && !r)
    return "starting";
  const i = ce(a, "ban"), l = ce(n, "ban");
  return i < ka || l < ka ? "bans" : "picks";
}
function Ca(t) {
  const e = L(t);
  if (!e) return null;
  const a = L(e.hero);
  if (a) {
    const n = ft(a);
    if (n) return n;
  }
  return ft(t);
}
function ws(t, e) {
  const a = /* @__PURE__ */ new Map(), n = L(t.player), r = L(t.hero), i = e === "radiant" ? L(r == null ? void 0 : r.team2) ?? L(r == null ? void 0 : r.radiant) : L(r == null ? void 0 : r.team3) ?? L(r == null ? void 0 : r.dire), l = e === "radiant" ? L(n == null ? void 0 : n.team2) ?? L(n == null ? void 0 : n.radiant) : L(n == null ? void 0 : n.team3) ?? L(n == null ? void 0 : n.dire);
  if (i)
    for (const [o, g] of Object.entries(i)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const p = Number(c[1]) % 5, h = Ca(g);
      if (h && h > 0 && Number.isFinite(p)) {
        let d;
        if (l) {
          const m = L(l[o]);
          if (m != null && m.accountid) {
            const u = parseInt(String(m.accountid), 10);
            Number.isFinite(u) && u > 0 && (d = u);
          }
        }
        a.set(p, { heroId: h, steam32: d });
      }
    }
  if (l)
    for (const [o, g] of Object.entries(l)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const p = Number(c[1]) % 5, h = a.get(p);
      if (h != null && h.heroId) continue;
      const d = Ca(g);
      if (d && d > 0 && Number.isFinite(p)) {
        const m = L(g);
        let u;
        if (m != null && m.accountid) {
          const f = parseInt(String(m.accountid), 10);
          Number.isFinite(f) && f > 0 && (u = f);
        }
        a.set(p, { heroId: d, steam32: u });
      }
    }
  return a;
}
function Aa(t, e, a) {
  const n = Array.from(ws(a, e).values());
  return t.map((r) => {
    if (r.type !== "pick" || !r.heroId) return r;
    const i = n.find((l) => l.heroId === r.heroId);
    return i ? {
      ...r,
      steam32: i.steam32 ?? r.steam32
    } : r;
  });
}
const _s = [
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
], ks = [
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
function Ea(t, e, a) {
  const r = (a === "dire_first_pick" ? ks : _s).findIndex((i) => i.side === t && i.order === e);
  return r >= 0 ? r : e;
}
function Pa(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function Je(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function va(t, e) {
  let a = t[0], n = Ea(a.side, a.slot.order, e);
  for (const r of t.slice(1)) {
    const i = Ea(r.side, r.slot.order, e);
    i > n && (a = r, n = i);
  }
  return a;
}
function Is(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function Cs(t, e, a) {
  var g, c, p, h;
  const n = [];
  for (const d of t)
    d.type === "pick" && d.heroId && n.push({ side: "radiant", slot: d });
  for (const d of e)
    d.type === "pick" && d.heroId && n.push({ side: "dire", slot: d });
  if (n.length === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const d of ["radiant", "dire"]) {
    const m = d === "radiant" ? (g = a == null ? void 0 : a.radiant) == null ? void 0 : g.slots : (c = a == null ? void 0 : a.dire) == null ? void 0 : c.slots;
    for (const u of m ?? []) {
      const f = Pa(d, u);
      f && r.add(f);
    }
  }
  const i = n.filter(
    ({ side: d, slot: m }) => !r.has(Pa(d, m))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Be(t, e) && a && !Be(((p = a.radiant) == null ? void 0 : p.slots) ?? [], ((h = a.dire) == null ? void 0 : h.slots) ?? [])) {
      const d = va(n, l), m = Je(d.side, d.slot);
      if (Is(a.lastPick, m)) return m;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const d = i[0];
    return Je(d.side, d.slot);
  }
  const o = va(i, l);
  return Je(o.side, o.slot);
}
function Ta(t, e, a, n, r) {
  var o, g;
  if (!t)
    return {
      name: n,
      logoUrl: e === "radiant" ? ((o = r == null ? void 0 : r.radiant) == null ? void 0 : o.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlA) : ((g = r == null ? void 0 : r.dire) == null ? void 0 : g.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = mt(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: Ee(l.teamKey)
  } : { name: n };
}
function As(t, e, a, n) {
  var q, $;
  const r = L(t.map), i = typeof (r == null ? void 0 : r.game_state) == "string" ? r.game_state : "", l = ds.has(i), o = L(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const g = typeof (r == null ? void 0 : r.team_name_radiant) == "string" ? r.team_name_radiant : "Radiant", c = typeof (r == null ? void 0 : r.team_name_dire) == "string" ? r.team_name_dire : "Dire", p = Ta(
    n,
    "radiant",
    a,
    g,
    e
  ), h = Ta(
    n,
    "dire",
    a,
    c,
    e
  ), d = o ?? {}, m = _a(d, "radiant"), u = _a(d, "dire");
  let f = wa(m, "radiant"), y = wa(u, "dire");
  Be(f, y) && (f = Aa(f, "radiant", t), y = Aa(y, "dire", t));
  const b = o ? hs(d) : null, _ = U(
    d.activeteam_time_remaining ?? d.active_team_time_remaining
  ), k = o ? ps(d) : void 0, I = o ? ys(d, b) : 0, A = [
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
  ], H = Cs(f, y, e), x = Ss(
    l,
    i,
    f,
    y,
    b
  );
  let B = bs(r, i, d);
  x === "starting" && B === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? B = e.startSecondsRemaining : _ > 0 && !ht(f, y) && (B = _));
  const O = {
    source: "gsi",
    phase: x,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(I)),
    activeTeam: x === "starting" ? null : b,
    turnAction: x === "starting" ? void 0 : k,
    startSecondsRemaining: x === "starting" ? Math.max(
      0,
      Math.round(
        B ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: x === "starting" ? void 0 : Math.max(0, Math.round(_)),
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
      bonusTime: Math.max(0, Math.round(U(d.radiant_bonus_time) || U((q = L(d.team2)) == null ? void 0 : q.bonus_time) || 0))
    },
    dire: {
      name: h.name,
      logoUrl: h.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(U(d.dire_bonus_time) || U(($ = L(d.team3)) == null ? void 0 : $.bonus_time) || 0))
    },
    picksBansOrder: A,
    lastPick: H
  };
  return { inDraft: l || !!o, draftPatch: O };
}
const Ke = {};
let Ra = !1;
async function Es() {
  if (Ra) return;
  Ra = !0;
  const t = Object.keys(pt).map((e) => e.replace("item_", ""));
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
          const l = Number(i.hero_id), o = Number(i.time), g = Number(i.games);
          r[l] || (r[l] = { sum: 0, totalGames: 0 }), r[l].sum += o * g, r[l].totalGames += g;
        }
        Ke[e] = {};
        for (const [i, l] of Object.entries(r))
          l.totalGames > 0 && (Ke[e][Number(i)] = Math.round(l.sum / l.totalGames));
        S.debug({ item: e, heroesIndexed: Object.keys(r).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        S.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    S.info("Finished preloading average item timings.");
  })();
}
function Ps(t, e) {
  const a = e.replace("item_", "");
  return Ke[a] ? Ke[a][t] ?? null : null;
}
const Qe = /* @__PURE__ */ new Map(), pt = {
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
function vs(t, e, a) {
  var n, r;
  try {
    return ((r = (n = t == null ? void 0 : t.items) == null ? void 0 : n[e]) == null ? void 0 : r[a]) || {};
  } catch {
    return {};
  }
}
function Ts(t, e, a) {
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
function Rs(t, e, a) {
  var n, r, i;
  try {
    return ((i = (r = (n = t == null ? void 0 : t.player) == null ? void 0 : n[e]) == null ? void 0 : r[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function Ls(t, e) {
  var r;
  if (!(t != null && t.items)) return;
  const a = ((r = t == null ? void 0 : t.map) == null ? void 0 : r.clock_time) || 0;
  if (a < 0) return;
  const n = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const g = `player${o}`, c = vs(t, i, g), p = Rs(t, i, g);
      if (!p || p === "Unknown Player") continue;
      Qe.has(p) || Qe.set(p, /* @__PURE__ */ new Set());
      const h = Qe.get(p), d = /* @__PURE__ */ new Set();
      for (const m in c) {
        const u = (l = c[m]) == null ? void 0 : l.name;
        u && u !== "empty" && d.add(u);
      }
      for (const m of d)
        if (!h.has(m) && (h.add(m), pt[m])) {
          const u = Ts(t, i, g), f = u.id > 0 ? te(u.id) : u.name, y = pt[m], w = Ps(u.id, m);
          let b = null;
          w !== null && a > 0 && (b = a - w), S.info({ playerName: p, cleanHeroName: f, item: m, hypeData: y, clockTime: a, averageTime: w, timingDiff: b }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: p,
            heroName: f,
            item: m,
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
function La(t, e, a, n) {
  if (!t || typeof t != "object") return 0;
  let r = 0;
  for (const [i, l] of Object.entries(t))
    if (i.startsWith("ability") && typeof l == "object" && l !== null) {
      const o = l;
      o.hidden !== !0 && typeof o.name == "string" && !o.name.startsWith("special_bonus") && o.name !== "generic_hidden" && o.name !== "empty" && r++;
    }
  return e && ([
    74,
    // Invoker
    114,
    // Monkey King
    107,
    // Earth Spirit
    95,
    // Troll Warlord
    91,
    // IO
    92
    // Visage
  ].includes(e) || !a && !n && (r = Math.min(r, 5))), r;
}
function Ns(t) {
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
      typeof e.name == "string" && (o = e.name);
      const g = a.aghanims_shard === !0, c = a.aghanims_scepter === !0;
      return {
        steam32: r,
        heroId: l,
        playerName: o,
        abilityCount: La(t.abilities, l, g, c)
      };
    }
  }
  const n = (r) => {
    var g, c, p;
    const i = (g = t.hero) == null ? void 0 : g[r], l = (c = t.player) == null ? void 0 : c[r], o = (p = t.abilities) == null ? void 0 : p[r];
    if (!i || !l) return null;
    for (let h = 0; h <= 9; h++) {
      const d = `player${h}`, m = i[d], u = l[d], f = o == null ? void 0 : o[d];
      if (m && typeof m == "object" && m.selected_unit === !0) {
        let y = null;
        const w = m.hero_id ?? m.heroid ?? m.id;
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
          const k = m.aghanims_shard === !0, I = m.aghanims_scepter === !0;
          return {
            steam32: b,
            heroId: y,
            playerName: _,
            abilityCount: La(f, y, k, I)
          };
        }
      }
    }
    return null;
  };
  return n("team2") || n("team3");
}
function G(t) {
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
function Q(t) {
  const e = G(t);
  return e ? j(e.id ?? e.item_id ?? e.itemid, 0) : 0;
}
function xs(t, e, a, n, r, i) {
  const l = n < 128, o = r ? l : !l, g = j((e == null ? void 0 : e.hero_id) ?? (e == null ? void 0 : e.heroid) ?? (e == null ? void 0 : e.id), 0) || void 0, c = typeof (e == null ? void 0 : e.name) == "string" ? e.name : void 0, p = Q((a == null ? void 0 : a.slot0) ?? (a == null ? void 0 : a.item0)), h = Q((a == null ? void 0 : a.slot1) ?? (a == null ? void 0 : a.item1)), d = Q((a == null ? void 0 : a.slot2) ?? (a == null ? void 0 : a.item2)), m = Q((a == null ? void 0 : a.slot3) ?? (a == null ? void 0 : a.item3)), u = Q((a == null ? void 0 : a.slot4) ?? (a == null ? void 0 : a.item4)), f = Q((a == null ? void 0 : a.slot5) ?? (a == null ? void 0 : a.item5)), y = Q((a == null ? void 0 : a.neutral0) ?? (a == null ? void 0 : a.neutral)), w = Q(a == null ? void 0 : a.backpack0), b = Q(a == null ? void 0 : a.backpack1), _ = Q(a == null ? void 0 : a.backpack2), k = [p, h, d, m, u, f], I = j((e == null ? void 0 : e.aghanims_scepter) ?? (e == null ? void 0 : e.has_scepter), 0), A = j((e == null ? void 0 : e.aghanims_shard) ?? (e == null ? void 0 : e.has_shard), 0), H = k.includes(108) || k.includes(271) || k.includes(127) || k.includes(256), x = k.includes(609) || k.includes(125);
  return {
    account_id: j(t.accountid, 0) || void 0,
    personaname: typeof t.name == "string" ? t.name : void 0,
    hero_id: g,
    hero_name: c,
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
    item_3: m,
    item_4: u,
    item_5: f,
    item_neutral: y,
    backpack_0: w,
    backpack_1: b,
    backpack_2: _,
    aghanims_scepter: I || H ? 1 : 0,
    aghanims_shard: A || x ? 1 : 0
  };
}
function Na(t, e, a, n, r, i) {
  const l = [];
  for (let o = 0; o < 5; o++) {
    const g = `player${o}`, c = G(t == null ? void 0 : t[g]);
    if (!c) continue;
    const p = G(e == null ? void 0 : e[g]) ?? null, h = G(a == null ? void 0 : a[g]) ?? null, d = n + o;
    l.push(
      xs(c, p, h, d, r, i)
    );
  }
  return l;
}
function Ms(t) {
  const e = G(t.map);
  if (!((typeof (e == null ? void 0 : e.game_state) == "string" ? e.game_state : "") === "DOTA_GAMERULES_STATE_POST_GAME"))
    return {
      match: { match_id: 0, players: [] },
      matchId: 0,
      isPostGame: !1
    };
  const r = (e == null ? void 0 : e.radiant_win) === !0 || (e == null ? void 0 : e.radiant_win) === "true" || (e == null ? void 0 : e.radiant_win) === 1, i = Math.max(1, j((e == null ? void 0 : e.clock_time) ?? (e == null ? void 0 : e.game_time), 0)), l = j((e == null ? void 0 : e.matchid) ?? (e == null ? void 0 : e.match_id), 0), o = G(t.player), g = G(t.hero), c = G(t.items), p = Na(
    G((o == null ? void 0 : o.team2) ?? (o == null ? void 0 : o.radiant)),
    G((g == null ? void 0 : g.team2) ?? (g == null ? void 0 : g.radiant)),
    G((c == null ? void 0 : c.team2) ?? (c == null ? void 0 : c.radiant)),
    0,
    r,
    i
  ), h = Na(
    G((o == null ? void 0 : o.team3) ?? (o == null ? void 0 : o.dire)),
    G((g == null ? void 0 : g.team3) ?? (g == null ? void 0 : g.dire)),
    G((c == null ? void 0 : c.team3) ?? (c == null ? void 0 : c.dire)),
    128,
    r,
    i
  );
  return { match: {
    match_id: l,
    duration: i,
    radiant_win: r,
    players: [...p, ...h]
  }, matchId: l, isPostGame: !0 };
}
let ye = 0, Xe = null, Ce = null, Ze = 0, et = 0, xa = "";
function Hs(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var y, w;
    const g = typeof l.query.token == "string" ? l.query.token : void 0;
    if (E.GSI_TOKEN && g !== E.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const c = l.body;
    ye = Date.now(), await re(r);
    try {
      Ls(c, i);
    } catch (b) {
      S.error(b, "Power spike evaluation failed");
    }
    const p = await a.getState(), h = ((y = p.leagueConfig) == null ? void 0 : y.roster) ?? [], d = ((w = p.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, m = As(
      c,
      p.draft ?? null,
      h,
      d
    ), u = Ns(c);
    u && (m.focusedPlayerSteam32 = u.steam32, m.focusedPlayerHeroId = u.heroId, m.focusedPlayerName = u.playerName, m.focusedPlayerAbilityCount = u.abilityCount);
    const f = async () => {
      var _t, kt, It, Ct, At, Et, Pt, vt, Tt, Rt, Lt, Nt, xt, Mt, Ht, jt, Ft, Ot, Dt, Ut, $t, Gt, Bt, Kt, Vt, Wt, qt, Yt, zt, Jt, Qt, Xt;
      const b = await a.getState();
      let _ = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      m.draftPatch && (_ = {
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
          ...m.draftPatch
        }
      });
      const k = ((_t = c == null ? void 0 : c.map) == null ? void 0 : _t.radiant_scan_cooldown) ?? 0, I = ((kt = c == null ? void 0 : c.map) == null ? void 0 : kt.dire_scan_cooldown) ?? 0, A = ((It = c == null ? void 0 : c.map) == null ? void 0 : It.radiant_glyph_cooldown) ?? 0, H = ((Ct = c == null ? void 0 : c.map) == null ? void 0 : Ct.dire_glyph_cooldown) ?? 0, x = ((At = c == null ? void 0 : c.map) == null ? void 0 : At.clock_time) || 0, B = ((Et = c == null ? void 0 : c.map) == null ? void 0 : Et.game_time) || 0;
      if (x < (Ce || 0) && (Ce = null, Ze = 0), c != null && c.events && Array.isArray(c.events)) {
        console.log("EVENTS:", JSON.stringify(c.events, null, 2));
        for (const R of c.events)
          if (R.game_time && R.game_time > Ze && (Ze = R.game_time, R.event_type === "ancient_creep_killed" && (R.monsterType === "Tormentor" || R.monster_type === "Tormentor"))) {
            const D = B - R.game_time;
            Ce = x - D;
          }
      }
      let O = "dead", q = 0, $ = "dead", F = 0;
      if (x >= 1200) {
        const D = Math.floor((x - 1200) / 300) % 2 === 0;
        let X = !0, J = 0;
        if (Ce !== null) {
          const P = x - Ce;
          P >= 0 && P < 600 && (X = !1, J = 600 - P);
        }
        D ? (O = X ? "alive" : "dead", q = J) : ($ = X ? "alive" : "dead", F = J);
      }
      if (_.minimapState = {
        roshanState: (Pt = c == null ? void 0 : c.map) == null ? void 0 : Pt.roshan_state,
        roshanRespawnTimer: (vt = c == null ? void 0 : c.map) == null ? void 0 : vt.roshan_state_end_seconds,
        tormentorRadiant: O,
        tormentorRadiantRespawnTimer: q,
        tormentorDire: $,
        tormentorDireRespawnTimer: F,
        radiantScanActive: k === 0,
        radiantScanCooldown: k,
        direScanActive: I === 0,
        direScanCooldown: I,
        radiantGlyphActive: A === 0,
        radiantGlyphCooldown: A,
        direGlyphActive: H === 0,
        direGlyphCooldown: H
      }, u) {
        const R = m.focusedPlayerSteam32, D = m.focusedPlayerHeroId, X = m.focusedPlayerName, J = m.focusedPlayerAbilityCount;
        if (R && D) {
          const P = ((Tt = b.livePlayerCard) == null ? void 0 : Tt.steam32) !== R || ((Rt = b.livePlayerCard) == null ? void 0 : Rt.heroId) !== D || ((Lt = b.livePlayerCard) == null ? void 0 : Lt.abilityCount) !== J, we = ((Nt = b.overlayVisibility) == null ? void 0 : Nt.liveplayercard) !== "visible";
          if (P || we) {
            const Y = K(h, R), se = (Y == null ? void 0 : Y.displayName) || X || "Unknown";
            _ = {
              ..._,
              ...P ? {
                livePlayerCard: {
                  steam32: R,
                  heroId: D,
                  playerLabel: se,
                  playerAvatarUrl: Y == null ? void 0 : Y.avatarUrl,
                  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  source: "manual",
                  abilityCount: J
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
        const R = ((xt = b.overlayVisibility) == null ? void 0 : xt.liveplayercard) === "visible", D = b.livePlayerCard !== null && b.livePlayerCard !== void 0;
        (R || D) && (_ = {
          ..._,
          livePlayerCard: null,
          overlayVisibility: {
            ..._.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const gn = await a.patchState(_);
      await n.broadcastFull(gn);
      const Se = typeof ((Mt = c == null ? void 0 : c.map) == null ? void 0 : Mt.game_state) == "string" ? c.map.game_state : "", wt = Se === "DOTA_GAMERULES_STATE_POST_GAME" && xa !== "DOTA_GAMERULES_STATE_POST_GAME";
      if (xa = Se, wt || Se === "DOTA_GAMERULES_STATE_POST_GAME")
        try {
          const R = Ms(c), D = R.matchId || "post_game_transition", X = et === D && !wt;
          if (R.isPostGame && !X && R.match.players && R.match.players.length >= 2) {
            et = D;
            const P = tn(R.match)[0];
            if (P) {
              const Y = ((Ht = (await a.getState()).leagueConfig) == null ? void 0 : Ht.roster) ?? [], se = P.accountId ? K(Y, P.accountId) : void 0, We = P.heroId ? ae(P.heroId, P.heroName) : {}, _e = {
                playerLabel: (se == null ? void 0 : se.displayName) ?? `Player ${P.accountId ?? "?"}`,
                heroId: P.heroId,
                heroName: P.heroName,
                steam32: P.accountId,
                ...We,
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
              if (_e.playerLabel.startsWith("Player ") && P.accountId) {
                const hn = P.side === "radiant" ? "team2" : "team3", pn = P.playerSlot < 128 ? P.playerSlot : P.playerSlot - 128, Ye = (Ot = (Ft = (jt = c == null ? void 0 : c.player) == null ? void 0 : jt[hn]) == null ? void 0 : Ft[`player${pn}`]) == null ? void 0 : Ot.name;
                typeof Ye == "string" && Ye.length > 0 && (_e.playerLabel = Ye);
              }
              const qe = await a.patchState({
                standoutPlayerCard: _e,
                overlayVisibility: { standoutplayer: "visible" }
              });
              await n.broadcastFull(qe), S.info(
                { mvpScore: P.mvpScore, heroId: P.heroId, accountId: P.accountId },
                "[post-game] Standout Player auto-selected and pushed to overlay"
              );
            }
          }
        } catch (R) {
          S.error(R, "[post-game] MVP auto-selection failed");
        }
      (Se === "DOTA_GAMERULES_STATE_HERO_SELECTION" || Se === "DOTA_GAMERULES_STATE_STRATEGY_TIME") && (et = 0);
      const fn = ((Dt = m.draftPatch) == null ? void 0 : Dt.lastPick) && (!((Ut = b.draft) != null && Ut.lastPick) || m.draftPatch.lastPick.heroId !== b.draft.lastPick.heroId || m.draftPatch.lastPick.side !== b.draft.lastPick.side);
      if (($t = b.production) != null && $t.autoShowStatsOnPick && fn) {
        try {
          he(b);
        } catch {
          return;
        }
        const R = (Gt = m.draftPatch) == null ? void 0 : Gt.lastPick;
        if (!R) return;
        const D = R.side === "dire" || R.side === "B" ? "dire" : "radiant", X = D === "radiant" ? ((Kt = (Bt = m.draftPatch) == null ? void 0 : Bt.radiant) == null ? void 0 : Kt.slots) ?? ((Wt = (Vt = b.draft) == null ? void 0 : Vt.radiant) == null ? void 0 : Wt.slots) : ((Yt = (qt = m.draftPatch) == null ? void 0 : qt.dire) == null ? void 0 : Yt.slots) ?? ((Jt = (zt = b.draft) == null ? void 0 : zt.dire) == null ? void 0 : Jt.slots), J = Ua(D, R.heroId, X), P = J !== void 0 ? Ve((Qt = b.leagueConfig) == null ? void 0 : Qt.matchSetup, D, J) : void 0, we = ((Xt = b.leagueConfig) == null ? void 0 : Xt.roster) ?? [], Y = P != null && P > 0 ? K(we, P) : void 0, se = Y && P ? await ve(
          r,
          P,
          R.heroId,
          Y.displayName,
          b.tournamentHeroIndex ?? {},
          we,
          b.playerHeroIndex
        ) : await Pe(
          r,
          R.heroId,
          b.tournamentHeroIndex ?? {}
        ), We = St(se), _e = Date.now() + 12e3, qe = await a.patchState({
          heroStatsCard: se,
          statCarousel: We,
          overlayVisibility: {
            herostats: { mode: "timed", until: _e }
          }
        });
        await n.broadcastFull(qe);
      }
    };
    Xe && clearTimeout(Xe), Xe = setTimeout(() => {
      f().catch((b) => S.error(b, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: m.inDraft });
  }), e.get("/gsi/status", (l, o) => {
    o.json({
      lastSeen: ye ? new Date(ye).toISOString() : null,
      connected: Date.now() - ye < 5e3
    });
  });
}
function js(t, e, a) {
  var n, r;
  (r = (n = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - ye > 8e3 && ye > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || r.call(n);
}
function Ma(t, e) {
  var r, i;
  if (t === "overlay")
    return !0;
  const a = e.handshake;
  let n = "";
  return typeof ((r = a.auth) == null ? void 0 : r.token) == "string" ? n = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (n = a.query.token), n ? n === E.BROADCAST_SECRET : !1;
}
async function Fs(t) {
  const { state: e, obs: a, opendota: n } = t, r = Ae();
  r.use(Cn({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), r.disable("x-powered-by"), r.use((u, f, y) => {
    u.headers["access-control-request-private-network"] && f.setHeader("Access-Control-Allow-Private-Network", "true"), u.method === "OPTIONS" && u.headers.origin && (f.setHeader("Access-Control-Allow-Origin", u.headers.origin), f.setHeader("Access-Control-Allow-Credentials", "true"), f.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE"), f.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")), y();
  }), r.use(
    In({
      origin: !0,
      credentials: !0
    })
  ), r.use(Ae.json({ limit: "1mb" }));
  const i = v.dirname(yt(import.meta.url)), l = v.join(i, "../../overlay-web/dist"), o = v.join(i, "../../admin-web/dist");
  r.use("/overlay", Ae.static(l)), r.use("/admin", Ae.static(o)), r.get("/admin", (u, f) => {
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
    const y = v.join(l, "index.html");
    f.sendFile(y, (w) => {
      w && f.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), r.get("/overlay/*", (u, f, y) => {
    if (u.path.includes(".")) return y();
    const w = v.join(l, "index.html");
    f.sendFile(w, (b) => {
      b && f.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  });
  const g = An.createServer(r), c = new En(g, {
    cors: { origin: !0, credentials: !0 },
    transports: ["websocket", "polling"]
  }), p = {
    async broadcastFull(u) {
      const f = u ?? await e.getState();
      c.of(ee.OVERLAY).emit(Z.STATE_FULL, f), c.of(ee.PRODUCER).emit(
        Z.STATE_FULL,
        f
      ), S.debug({ seq: f.seq }, "Emitted state snapshot");
    }
  };
  Cr({
    app: r,
    state: e,
    io: c,
    broadcast: p,
    obs: a,
    opendota: n
  }), us({
    app: r,
    state: e,
    io: c,
    broadcast: p,
    opendota: n
  }), Hs({
    app: r,
    state: e,
    broadcast: p,
    opendota: n,
    io: c
  }), js(e, p);
  const h = c.of(ee.PRODUCER), d = c.of(ee.OVERLAY);
  h.use((u, f) => {
    const y = Ma("producer", u);
    f(y ? void 0 : new Error("unauthorized producer"));
  }), d.use((u, f) => {
    const y = Ma("overlay", u);
    f(y ? void 0 : new Error("unauthorized overlay"));
  }), h.on("connection", (u) => {
    S.info({ id: u.id }, "producer connected"), e.getState().then((f) => {
      u.emit(Z.STATE_FULL, f);
    });
  }), d.on("connection", (u) => {
    S.info({ id: u.id }, "overlay viewer connected"), e.getState().then((f) => {
      u.emit(Z.STATE_FULL, f);
    });
  });
  const m = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(m) && m > 500) {
    const u = setInterval(() => {
      e.getState().then((f) => {
        c.of(ee.OVERLAY).emit(Z.STATE_FULL, f);
      });
    }, m);
    typeof u.unref == "function" && u.unref();
  }
  return { app: r, httpServer: g, io: c, broadcast: p };
}
async function Os() {
  const t = await mr(), e = new Nn(), a = new Hn();
  E.REDIS_URL && a.attachRedis(E.REDIS_URL), re(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  ), Es().catch(
    (i) => S.warn(i, "item timings preload deferred")
  );
  const n = await Fs({ state: t, obs: e, opendota: a });
  await Gr({
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
process.argv[1] && yt(import.meta.url) === process.argv[1] && Os().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
export {
  Os as bootstrapBroadcastServer
};

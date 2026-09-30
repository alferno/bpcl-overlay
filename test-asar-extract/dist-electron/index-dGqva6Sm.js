var ha = Object.defineProperty;
var pa = (t, e, a) => e in t ? ha(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var L = (t, e, a) => pa(t, typeof e != "symbol" ? e + "" : e, a);
import R from "node:path";
import { fileURLToPath as Ht } from "node:url";
import { config as ya } from "dotenv";
import { z as s } from "zod";
import ba from "pino";
import Sa from "obs-websocket-js";
import wa from "bottleneck";
import { Redis as Qe } from "ioredis";
import _a from "cors";
import ce from "express";
import Ia from "helmet";
import ka from "node:http";
import { Server as Ea } from "socket.io";
import T, { existsSync as rt } from "node:fs";
import { exec as Aa } from "node:child_process";
import { promisify as Ca } from "node:util";
import { mkdir as Pa, writeFile as Te, access as Ra, readFile as Se } from "node:fs/promises";
import jt from "node:https";
const La = R.dirname(Ht(import.meta.url));
ya({ path: R.resolve(La, "../.env") });
const Da = s.object({
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
}), _ = Da.parse(process.env);
function nt() {
  return _.CORS_ORIGINS.split(",").map((t) => t.trim()).filter(Boolean);
}
const S = ba({
  level: process.env.LOG_LEVEL ?? "info"
});
class Ta {
  constructor() {
    L(this, "client", new Sa());
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
const va = "https://api.opendota.com/api";
function Na(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class Ma {
  constructor(e = 600) {
    L(this, "limiter");
    L(this, "memory", /* @__PURE__ */ new Map());
    L(this, "redis", null);
    this.ttlSeconds = e;
    const a = _.OPENDOTA_RATE_PER_MINUTE, r = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new wa({
      minTime: r,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new Qe(e);
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
        const r = await fetch(`${va}${e}`, {
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
const z = "Game starting in", Ft = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), xa = Ft.partial();
function we(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Ha(t, e, a = Date.now()) {
  if (e.running === !0) {
    const n = e.secondsRemaining ?? (t ? we(t, a) : 0), i = Math.max(0, Math.floor(n));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? z,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const n = e.secondsRemaining ?? (t ? we(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? z,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(n))
    };
  }
  const r = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? z,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? we(t, a) : 0)
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
function st(t, e = z) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function ot(t, e = z) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const ja = {
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
function Fa(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (ja[e] ?? e);
}
function U(t) {
  return Fa(t.replace(/^npc_dota_hero_/, "").trim());
}
function Oa(t) {
  if (!t)
    return {};
  const e = U(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Ot(e)
  } : {};
}
function Ot(t, e) {
  const a = U(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function Ua(t, e) {
  const a = U(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function Ba(t, e) {
  const a = U(t);
  if (!a)
    return {};
  const r = Ot(a), n = Ua(a);
  return {
    staticUrl: r,
    staticFallbackUrl: r,
    animatedUrl: n
  };
}
function Ut(t) {
  return `/teams/${t}.png`;
}
function He(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function $a(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Map();
  for (const n of t) {
    const i = U(n.name);
    if (!i)
      continue;
    e.set(n.id, i), a.add(i), r.set(He(n.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    r.set(He(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: r };
}
function Ka(t, e) {
  const { heroId: a, heroClass: r, heroName: n, urlSlug: i } = t;
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
  if (r) {
    const l = U(r);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [n, r]) {
    if (!l)
      continue;
    const o = He(l), d = e.byDisplayKey.get(o);
    if (d)
      return { slug: d, source: "display" };
  }
  if (r) {
    const l = U(r);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function Le(t, e, a) {
  var n, i;
  const r = e === "radiant" ? (n = t == null ? void 0 : t.pickPlayers) == null ? void 0 : n.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!r || a < 0 || a >= r.length))
    return r[a] ?? null;
}
function Ga(t, e, a) {
  var n, i;
  const r = Le(t == null ? void 0 : t.matchSetup, e, a);
  if (!(r == null || !((n = t == null ? void 0 : t.roster) != null && n.length)))
    return (i = t.roster.find((l) => l.steam32 === r)) == null ? void 0 : i.displayName;
}
function Bt(t, e, a) {
  const r = a == null ? void 0 : a.find((n) => n.type === "pick" && n.heroId === e);
  return r == null ? void 0 : r.order;
}
function Va(t, e) {
  return `${t}:${e}`;
}
function je(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let r = 0, n = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (r += l.games, n += l.wins);
  return { games: r, wins: n };
}
function $t(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[Va(e, a)];
}
function Fe(t, e) {
  if (je(t, e).games <= 0)
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
const Wa = [
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
], qa = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), Kt = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  qa
]), Ya = s.object({
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
}), za = s.object({
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
}), Gt = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), Vt = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: Gt.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => ke)).optional()
}), Wt = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(za).default([]),
  matchSetup: Vt.nullable().optional(),
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
}), qt = s.object({
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
}), Yt = s.object({
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
}), zt = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), Oe = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(zt),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), Jt = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Ja = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Qa = s.object({
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
}), it = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Qa).optional(),
  bonusTime: s.number().optional()
}), Xa = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), ke = s.object({
  series: Ya,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Ja).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: it.optional(),
  dire: it.optional(),
  lastPick: Xa.optional()
}), Ue = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), Za = s.object({
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
  replays: s.array(Za)
});
const Be = s.object({
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
}), er = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), tr = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), $e = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: tr.optional(),
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
  tournament: er.optional(),
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
  statSlides: s.array(zt).optional(),
  matchup: s.record(s.any()).optional(),
  fetchedAt: s.string(),
  source: s.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
}), Ke = s.object({
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
}), Ge = s.object({
  banners: s.array(s.object({
    title: s.string(),
    subtitle: s.string().optional(),
    imageUrl: s.string().optional(),
    durationSeconds: s.number().positive()
  })),
  activeIndex: s.number().nonnegative(),
  startedAt: s.number().optional()
}), ar = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: Ft.optional()
}), Qt = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(Kt).default({}),
  sceneHints: Qt.optional(),
  leagueConfig: Wt.optional(),
  tournamentHeroIndex: s.record(qt).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(Yt).optional(),
  production: Jt.optional(),
  statCarousel: Oe.nullable().optional(),
  draft: ke.nullable().optional(),
  lowerThirds: Ue.nullable().optional(),
  playerStatsCard: Be.nullable().optional(),
  heroStatsCard: $e.nullable().optional(),
  matchupCard: Ke.nullable().optional(),
  sponsor: Ge.nullable().optional(),
  timers: ar.optional()
});
const rr = s.object({
  overlayVisibility: s.record(Kt).optional(),
  leagueConfig: Wt.partial().optional(),
  tournamentHeroIndex: s.record(qt).optional(),
  playerHeroIndex: s.record(Yt).optional(),
  production: Jt.partial().optional(),
  statCarousel: s.union([Oe, Oe.partial(), s.null()]).optional(),
  draft: s.union([ke, ke.partial(), s.null()]).optional(),
  lowerThirds: s.union([Ue, Ue.partial(), s.null()]).optional(),
  playerStatsCard: s.union([Be, Be.partial(), s.null()]).optional(),
  heroStatsCard: s.union([$e, $e.partial(), s.null()]).optional(),
  matchupCard: s.union([Ke, Ke.partial(), s.null()]).optional(),
  sponsor: s.union([
    Ge,
    Ge.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: xa.optional()
  }).partial().optional(),
  sceneHints: Qt.partial().optional()
});
function nr() {
  const t = {};
  for (const e of Wa)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function sr() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function Xt() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: nr(),
    sceneHints: {},
    leagueConfig: sr(),
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
const B = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, $ = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function w(t, e, a) {
  let r;
  const n = t.headers.authorization;
  if (n != null && n.startsWith("Bearer ") ? r = n.slice(7).trim() : typeof t.query.token == "string" && (r = t.query.token), !r) {
    e.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (r !== _.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function or(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function lt(t, e) {
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
function ir(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const r = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, n = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return r != null && r.slots && (r.slots = lt((i = t.radiant) == null ? void 0 : i.slots, r.slots)), n != null && n.slots && (n.slots = lt((l = t.dire) == null ? void 0 : l.slots, n.slots)), {
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
function lr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function cr(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function Zt(t, e) {
  var y;
  const a = e.overlayVisibility !== void 0 ? or(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let r = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: b, ...I } = e.timers;
    r = {
      ...t.timers ?? {},
      ...I
    }, b !== void 0 && (r = {
      ...r,
      gameStartCountdown: Ha((y = t.timers) == null ? void 0 : y.gameStartCountdown, b)
    });
  }
  const n = ir(t.draft, e.draft), i = lr(t.leagueConfig, e.leagueConfig), l = cr(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let d = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (d = { ...e.playerHeroIndex });
  let c = ee(t.heroStatsCard ?? void 0, e.heroStatsCard), h = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const f = ee(t.lowerThirds ?? void 0, e.lowerThirds), u = ee(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let m = ee(t.matchupCard ?? void 0, e.matchupCard), g = ee(t.sponsor ?? void 0, e.sponsor), p = ee(t.statCarousel ?? void 0, e.statCarousel);
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
  if (m && e.matchupCard && typeof e.matchupCard == "object") {
    const b = e.matchupCard;
    m = {
      ...m,
      ...b,
      matchup: b.matchup ? { ...m.matchup ?? {}, ...b.matchup } : m.matchup
    };
  }
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: d ?? t.playerHeroIndex,
    production: l ?? t.production,
    statCarousel: p === void 0 ? t.statCarousel : p,
    draft: n === void 0 ? t.draft : n,
    lowerThirds: f === void 0 ? t.lowerThirds : f,
    playerStatsCard: u === void 0 ? t.playerStatsCard : u,
    heroStatsCard: c === void 0 ? t.heroStatsCard : c,
    matchupCard: m === void 0 ? t.matchupCard : m,
    sponsor: g === void 0 ? t.sponsor : g,
    timers: r ?? t.timers,
    sceneHints: h
  };
}
function ct(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = Zt(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function ur(t) {
  const e = new Qe(t.url, {
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
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, d = Zt(o, n);
        if (await e.multi().set(t.key, JSON.stringify(d)).exec())
          return d;
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
async function dr() {
  const t = Xt();
  if (_.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), ct(t);
  if (!_.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new Qe(_.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: _.REDIS_STATE_KEY }, "State backend: redis"), ur({
      url: _.REDIS_URL,
      key: _.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), _.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), ct(t);
    throw e;
  }
}
function mr(t) {
  return rr.parse(t);
}
const ut = Ca(Aa);
class gr {
  constructor() {
    L(this, "dbFile", _.REPLAY_DB_FILE);
    L(this, "matchFile", _.REPLAY_MATCH_FILE);
    L(this, "lastCompletedFile", _.REPLAY_LAST_COMPLETED_FILE);
    L(this, "playbackDir", _.REPLAY_PLAYBACK_DIR);
    L(this, "replayFolder", _.REPLAY_FOLDER);
    // Temp folder for browser mp4 previews (inside build output or root)
    L(this, "previewCacheDir", R.resolve(process.cwd(), "public-preview-cache"));
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
  async getReplayState() {
    let e = 1, a = 0;
    const r = [];
    try {
      if (T.existsSync(this.matchFile)) {
        const n = T.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (e = i);
      }
    } catch (n) {
      S.error(n, "Failed to read active match file");
    }
    try {
      if (T.existsSync(this.lastCompletedFile)) {
        const n = T.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(n, 10);
        isNaN(i) || (a = i);
      }
    } catch (n) {
      S.error(n, "Failed to read last completed match file");
    }
    try {
      if (T.existsSync(this.dbFile)) {
        const i = T.readFileSync(this.dbFile, "utf-8").split(/\r?\n/);
        for (let l = 1; l < i.length; l++) {
          const o = i[l].trim();
          if (!o) continue;
          const d = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (d) {
            const c = d[3];
            r.push({
              match: parseInt(d[1], 10),
              replayId: parseInt(d[2], 10),
              file: c,
              favorite: parseInt(d[4], 10) === 1,
              duration: parseInt(d[5], 10),
              filename: R.basename(c)
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
      if (!T.existsSync(this.dbFile))
        return !1;
      const n = T.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      n.length > 0 && i.push(n[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let d = 1; d < n.length; d++) {
        const c = n[d].trim();
        if (!c) continue;
        const h = c.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        h && h[3] === e ? (i.push(`${h[1]},${h[2]},"${h[3]}",${o},${h[5]}`), l = !0) : i.push(c);
      }
      return T.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (r) {
      return S.error(r, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!T.existsSync(e))
        return { ok: !1, error: "File not found" };
      const n = (await this.getReplayState()).replays.find((f) => f.file === e), i = n ? n.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await ut(l), d = parseFloat(o.stdout.trim()) || 40, c = Math.max(0, d - i);
      let h = e;
      if (c > 1) {
        T.existsSync(this.playbackDir) || T.mkdirSync(this.playbackDir, { recursive: !0 }), h = R.join(this.playbackDir, "current_replay.mp4");
        const f = `ffmpeg -y -ss ${c} -i "${e}" -t ${i} -c copy "${h}"`;
        S.info({ cmd: f }, "Running ffmpeg slice command"), await ut(f);
      }
      if (a.isConnected()) {
        const f = await a.setInputSettings("ReplayPlayer", {
          local_file: h
        });
        if (!f.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${f.error}` };
        const u = await a.restartMediaInput("ReplayPlayer");
        if (!u.ok)
          return { ok: !1, error: `Failed to restart OBS media input: ${u.error}` };
        const m = await a.setCurrentScene("Replay");
        return m.ok || S.error({ error: m.error }, "Failed to switch OBS scene"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (r) {
      return S.error(r, "Failed to play replay"), { ok: !1, error: r instanceof Error ? r.message : String(r) };
    }
  }
  async generatePreview(e) {
    try {
      if (!T.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = R.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return S.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
function fr(t) {
  const { app: e, state: a, io: r, broadcast: n, obs: i, opendota: l } = t, o = new gr();
  e.use(
    "/api/replays/media",
    w,
    ce.static(_.REPLAY_FOLDER)
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
  }), e.get("/api/state", w, async (f, u) => {
    const m = await a.getState();
    u.json(m);
  }), e.patch("/api/state", w, async (f, u) => {
    try {
      const m = mr(f.body), g = await a.patchState(m);
      await n.broadcastFull(g), u.json(g);
    } catch (m) {
      S.error(m, "state patch failed"), u.status(400).json({
        error: m instanceof Error ? m.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", w, async (f, u) => {
    const m = Xt(), g = await a.replaceState(m);
    await n.broadcastFull(g), u.json(g);
  });
  const d = s.object({
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
    w,
    async (f, u) => {
      var b, I;
      const m = d.safeParse(f.body);
      if (!m.success)
        return u.status(400).json({ error: m.error.flatten() });
      const g = ((b = m.data.label) == null ? void 0 : b.trim()) || z, p = st(
        m.data.seconds,
        g
      ), y = await c(p);
      u.json({ ok: !0, gameStartCountdown: (I = y.timers) == null ? void 0 : I.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    w,
    async (f, u) => {
      var k, A, C, E;
      const g = (k = (await a.getState()).timers) == null ? void 0 : k.gameStartCountdown, p = (typeof ((A = f.body) == null ? void 0 : A.label) == "string" ? f.body.label.trim() : "") || (g == null ? void 0 : g.label) || z, y = typeof ((C = f.body) == null ? void 0 : C.seconds) == "number" ? f.body.seconds : we(g), b = ot(y, p), I = await c(b);
      u.json({ ok: !0, gameStartCountdown: (E = I.timers) == null ? void 0 : E.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    w,
    async (f, u) => {
      var k, A, C;
      const m = d.safeParse(f.body);
      if (!m.success)
        return u.status(400).json({ error: m.error.flatten() });
      const p = (k = (await a.getState()).timers) == null ? void 0 : k.gameStartCountdown, y = ((A = m.data.label) == null ? void 0 : A.trim()) || (p == null ? void 0 : p.label) || z, b = p != null && p.running ? st(m.data.seconds, y) : ot(m.data.seconds, y), I = await c(b);
      u.json({ ok: !0, gameStartCountdown: (C = I.timers) == null ? void 0 : C.gameStartCountdown });
    }
  );
  const h = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", w, (f, u) => {
    const m = h.safeParse(f.body);
    if (!m.success) return u.status(400).json({ error: m.error.flatten() });
    i.configure(m.data), r.of($.PRODUCER).emit(B.ACK, {
      kind: "obs:config",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.post("/api/obs/connect", w, async (f, u) => {
    const m = f.body;
    if (m && typeof m == "object" && Object.keys(m).length) {
      const p = h.safeParse(m);
      if (!p.success)
        return u.status(400).json({ error: p.error.flatten() });
      i.configure(p.data);
    }
    const g = await i.connect();
    r.of($.PRODUCER).emit(B.ACK, {
      kind: "obs:connect",
      ok: g.ok,
      error: g.error
    }), u.json(g);
  }), e.post("/api/obs/disconnect", w, async (f, u) => {
    await i.disconnect(), r.of($.PRODUCER).emit(B.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), u.json({ ok: !0 });
  }), e.get("/api/obs/scenes", w, async (f, u) => {
    try {
      const m = await i.listScenes();
      u.json({ ok: !0, scenes: m });
    } catch (m) {
      u.status(500).json({
        ok: !1,
        error: m instanceof Error ? m.message : String(m)
      });
    }
  }), e.post("/api/obs/program-scene", w, async (f, u) => {
    const g = s.object({ sceneName: s.string() }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await i.setProgramScene(g.data.sceneName);
    r.of($.PRODUCER).emit(B.ACK, {
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
    w,
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
    w,
    async (f, u) => {
      const m = await l.heroesConstants();
      u.json(m);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    w,
    async (f, u) => {
      const m = await l.playerHeroStats(f.params.accountId);
      u.json(m);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    w,
    async (f, u) => {
      const m = await l.heroMatchups(Number(f.params.heroId));
      u.json(m);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    w,
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
  ), e.post("/api/opendota/compose/hero-card", w, async (f, u) => {
    const g = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(f.body);
    if (!g.success)
      return u.status(400).json({ error: g.error.flatten() });
    const p = await a.getState(), y = g.data.accountId !== void 0 ? $t(
      p.playerHeroIndex,
      g.data.accountId,
      g.data.heroId
    ) : void 0;
    let b = "league", I;
    if (y && y.games > 0)
      I = {
        games: y.games,
        wins: y.wins,
        losses: y.games - y.wins
      };
    else if (g.data.accountId !== void 0) {
      b = "opendota_cached";
      const A = await l.playerHeroStats(g.data.accountId);
      if (A.ok && Array.isArray(A.data)) {
        const C = A.data.find(
          (E) => E && typeof E == "object" && E.hero_id === g.data.heroId
        );
        C && typeof C.games == "number" && (I = {
          games: C.games,
          wins: typeof C.win == "number" ? C.win : 0,
          losses: C.games - (typeof C.win == "number" ? C.win : 0)
        });
      }
      A.ok || (b = "stale");
    }
    const k = {
      playerLabel: g.data.playerLabel,
      heroId: g.data.heroId,
      playerHero: I,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: b
    };
    if (g.data.persist) {
      const A = await a.patchState({ heroStatsCard: k });
      return await n.broadcastFull(A), u.json({ ok: !0, card: k, persisted: A });
    }
    return u.json({ ok: !0, card: k });
  }), e.post("/api/opendota/compose/matchup-card", w, async (f, u) => {
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
      const b = await a.patchState({ matchupCard: y });
      return await n.broadcastFull(b), u.json({ ok: !0, upstream: p, matchupCard: y, persisted: b });
    }
    return u.json({ ok: !0, upstream: p, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", w, (f, u) => {
    l.purgeMemory(), u.json({ ok: !0 });
  }), e.get("/api/replays", w, async (f, u) => {
    try {
      const m = await o.getReplayState();
      u.json(m);
    } catch (m) {
      u.status(500).json({ error: m instanceof Error ? m.message : String(m) });
    }
  }), e.post("/api/replays/hotkey", w, async (f, u) => {
    const g = s.object({ hotkeyName: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await i.triggerHotkeyByName(g.data.hotkeyName);
    u.json(p);
  }), e.post("/api/replays/hotkey-sequence", w, async (f, u) => {
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
  }), e.post("/api/replays/favorite", w, async (f, u) => {
    const g = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.toggleFavorite(g.data.file, g.data.favorite);
    u.json({ ok: p });
  }), e.post("/api/replays/play", w, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.playReplay(g.data.file, i);
    u.json(p);
  }), e.post("/api/replays/generate-preview", w, async (f, u) => {
    const g = s.object({ file: s.string() }).safeParse(f.body);
    if (!g.success) return u.status(400).json({ error: g.error.flatten() });
    const p = await o.generatePreview(g.data.file);
    u.json(p);
  });
}
let W = null, Z = /* @__PURE__ */ new Map(), Ee = null;
function hr() {
  if (!(W != null && W.length)) {
    Ee = null;
    return;
  }
  Ee = $a(W);
}
async function J(t) {
  if (Z.size > 0) return Z;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (W = e.data, Z = new Map(W.map((a) => [a.id, a])), hr()), Z;
}
function Ae(t) {
  if (Ee) return Ka(t, Ee);
  if (t.heroId != null && t.heroId > 0) {
    const e = Z.get(t.heroId);
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
function pr(t) {
  return Ae(t).slug;
}
function yr(t, e) {
  const a = Ae({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const r = Z.get(t);
  if (r)
    return U(r.name) || void 0;
}
function ge(t, e) {
  return Oa(
    yr(t, e)
  );
}
function br(t, e) {
  return ge(t, e).heroPortraitUrl;
}
function ne(t) {
  const e = Z.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function Sr(t) {
  if (t)
    return Ut(t);
}
function V(t, e) {
  return t.find((a) => a.steam32 === e);
}
function wr() {
  return W ? [...W].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function _r() {
  var e;
  const t = (e = _.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Ir(t, e) {
  var l, o, d, c;
  const a = (l = _.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
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
      const b = await u.text();
      throw new Error(`Steam match history HTTP ${u.status}: ${b.slice(0, 200)}`);
    }
    const m = await u.json(), g = (o = m.result) == null ? void 0 : o.status, p = ((d = m.result) == null ? void 0 : d.matches) ?? [];
    if (g !== void 0 && g !== 1 && p.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${g} for league ${t} (no matches in response)`
      );
    if (p.length === 0) break;
    for (const b of p)
      typeof b.match_id == "number" && b.match_id > 0 && r.push(b.match_id);
    const y = (c = p[p.length - 1]) == null ? void 0 : c.match_id;
    if (y === void 0 || p.length < 100) break;
    n = y - 1;
  }
  const i = [...new Set(r)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function kr(t, e = 80) {
  var o, d;
  const a = _r(), r = [];
  if (!((o = _.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let n = [];
  if ((d = _.STEAM_WEB_API_KEY) != null && d.trim())
    try {
      n = await Ir(t, e);
    } catch (c) {
      const h = c instanceof Error ? c.message : String(c);
      S.warn({ err: c, leagueId: t }, "Steam league match history failed"), r.push(h);
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
const Er = 10;
function dt(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function mt(t) {
  return t !== void 0 && t < 128;
}
function Ar(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function Cr(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (n) => Ar(n.account_id) && typeof n.lane == "number" && n.lane > 0 && !n.is_roaming
  ), r = [...new Set(a.map((n) => n.lane))];
  for (const n of r) {
    const i = a.filter((m) => m.lane === n), l = i.filter((m) => mt(m.player_slot)), o = i.filter((m) => !mt(m.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const d = Math.max(0, ...l.map(dt)), c = Math.max(0, ...o.map(dt)), h = d - c;
    let f;
    Math.abs(h) <= Er ? f = "draw" : f = h > 0 ? "win" : "loss";
    const u = f === "draw" ? "draw" : f === "win" ? "loss" : "win";
    for (const m of l) e.set(m.account_id, f);
    for (const m of o) e.set(m.account_id, u);
  }
  return e;
}
function Pr(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
function ve() {
  return [
    R.resolve(process.cwd(), "data/league-stats"),
    R.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function K() {
  var a;
  const t = (a = _.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return R.isAbsolute(t) ? t : R.resolve(process.cwd(), t);
  const e = _.LEAGUE_ID;
  for (const r of ve())
    if (rt(R.join(r, `league_${e}_heroes.csv`)))
      return r;
  for (const r of ve())
    if (rt(r)) return r;
  return ve()[0];
}
function gt(t) {
  const e = K(), a = pe(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function ft(t, e) {
  const a = K(), r = pe(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [r.heroes, r.playerHeroes],
    statsStorage: e
  };
}
function pe(t) {
  const e = K();
  return {
    dir: e,
    heroes: R.join(e, `league_${t}_heroes.csv`),
    playerHeroes: R.join(e, `league_${t}_player_heroes.csv`),
    meta: R.join(e, `league_${t}_meta.json`)
  };
}
async function re(t) {
  try {
    return await Ra(t), !0;
  } catch {
    return !1;
  }
}
function Rr(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function Lr(t) {
  const e = [];
  let a = "", r = !1;
  for (let n = 0; n < t.length; n++) {
    const i = t[n];
    r ? i === '"' ? t[n + 1] === '"' ? (a += '"', n++) : r = !1 : a += i : i === '"' ? r = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function ht(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(Lr);
}
function D(t, e, a = 0) {
  const r = Number(t[e]);
  return Number.isFinite(r) ? r : a;
}
function ye(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function Dr(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, r = t.assists ?? 0;
  return !(e === 0 && a === 0 && r === 0 || (t.leaver_status ?? 0) >= 3);
}
function ea(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function Tr(t) {
  return t.filter((e) => !ea(e));
}
function ta(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || ea(a)) continue;
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
async function vr(t) {
  const e = pe(t);
  if (!await re(e.heroes))
    return null;
  try {
    const a = await Se(e.heroes, "utf8"), r = ht(a);
    if (r.length < 2) return null;
    const n = {};
    for (const o of r.slice(1)) {
      const d = D(o, 0);
      d <= 0 || (n[String(d)] = {
        heroId: d,
        heroName: o[1] || void 0,
        picks: D(o, 2),
        bans: D(o, 3),
        wins: D(o, 4),
        losses: D(o, 5),
        games: D(o, 6),
        pickRate: ye(o, 7),
        banRate: ye(o, 8),
        winRate: ye(o, 9),
        contestRate: ye(o, 10)
      });
    }
    let i = [];
    if (await re(e.playerHeroes)) {
      const o = await Se(e.playerHeroes, "utf8"), d = ht(o);
      for (const c of d.slice(1)) {
        const h = D(c, 0), f = D(c, 1);
        h <= 0 || f <= 0 || i.push({
          steam32: h,
          heroId: f,
          games: D(c, 2),
          wins: D(c, 3),
          kills: D(c, 4),
          deaths: D(c, 5),
          assists: D(c, 6),
          heroDamage: D(c, 7),
          goldPerMin: D(c, 8),
          lastHits: D(c, 9),
          maxKills: D(c, 10),
          laneWins: D(c, 11),
          laneDraws: D(c, 12),
          laneLosses: D(c, 13)
        });
      }
      i = Tr(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await re(e.meta)) {
      const o = JSON.parse(await Se(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: n, playerHeroes: i, meta: l };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function Nr(t) {
  const { leagueId: e } = t.meta, a = pe(e);
  await Pa(a.dir, { recursive: !0 });
  const n = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (d, c) => d.heroId - c.heroId
  ))
    n.push(
      [
        o.heroId,
        Rr(o.heroName ?? ""),
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
    (d, c) => d.steam32 - c.steam32 || d.heroId - c.heroId
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
  const e = pe(t), [a, r, n] = await Promise.all([
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
const Mr = 4294967295;
function xr(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= Mr))
    return e;
}
class Hr {
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
      await J(a);
      const o = await kr(e, r), d = o.matchIds;
      if (d.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && S.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = d.length;
      const c = /* @__PURE__ */ new Map();
      let h = 0;
      for (let u = 0; u < d.length; u++) {
        const m = d[u];
        if (m === void 0) continue;
        S.info(
          { matchId: m, index: u + 1, total: d.length },
          "Aggregating league match"
        );
        let g = await a.matchDetails(m);
        (!g.ok || !((l = (i = g.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(m), g = await a.matchDetails(m)), g.ok && g.data && (g.data.leagueid != null && g.data.leagueid !== 0 && g.data.leagueid !== e ? S.warn(
          {
            matchId: m,
            expectedLeague: e,
            actualLeague: g.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(g.data, c), h += 1)), this.progress.matchDone = u + 1, this.progress.progress = Math.round(
          (u + 1) / Math.max(1, d.length) * 100
        ), n == null || n(this.getProgress());
      }
      if (h === 0)
        throw new Error(
          `Found ${d.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const f = {};
      for (const [u, m] of c) {
        const g = m.wins + m.losses, p = h > 0 ? m.picks / h : 0, y = h > 0 ? m.bans / h : 0, b = p + y, I = g > 0 ? m.wins / g : void 0;
        f[String(u)] = {
          heroId: u,
          heroName: ne(u),
          picks: m.picks,
          bans: m.bans,
          wins: m.wins,
          losses: m.losses,
          games: g,
          pickRate: p,
          banRate: y,
          winRate: I,
          contestRate: b
        };
      }
      return this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: d.length,
        matchDone: d.length,
        heroIndex: f
      }, f;
    } catch (o) {
      const d = o instanceof Error ? o.message : String(o);
      throw this.progress = {
        ...this.progress,
        status: "error",
        error: d
      }, o;
    } finally {
      this.running = !1;
    }
  }
  ingestMatch(e, a) {
    const r = e.radiant_win === !0, n = Cr(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = xr(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && r || i.player_slot !== void 0 && i.player_slot >= 128 && !r, d = this.getAcc(a, i.hero_id);
      o ? d.wins += 1 : d.losses += 1, Dr(i) && this.trackPlayerHero(l, i.hero_id, o, i, n.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, r, n, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof n.kills == "number" ? n.kills : 0, d = typeof n.deaths == "number" ? n.deaths : 0, c = typeof n.assists == "number" ? n.assists : 0, h = typeof n.hero_damage == "number" ? n.hero_damage : 0, f = typeof n.gold_per_min == "number" ? n.gold_per_min : 0, u = typeof n.last_hits == "number" ? n.last_hits : 0, m = l.get(a) ?? {
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
    m.games += 1, r && (m.wins += 1), i === "win" ? m.laneWins += 1 : i === "draw" ? m.laneDraws += 1 : i === "loss" && (m.laneLosses += 1), m.kills += o, m.deaths += d, m.assists += c, m.heroDamage += h, m.goldPerMin += f, m.lastHits += u, o > m.maxKills && (m.maxKills = o), l.set(a, m);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = Na(e);
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
const j = new Hr();
async function jr(t) {
  const { leagueId: e, state: a, broadcast: r, source: n } = t, i = n === "csv" ? await vr(e) : null;
  if (!i) return !1;
  j.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: ta(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: n,
      statsCsvDir: K()
    }
  });
  return await r.broadcastFull(l), !0;
}
async function Ve(t) {
  const e = await jr({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: K() },
    "League stats loaded from CSV"
  ), e;
}
async function aa(t) {
  const { leagueId: e, state: a, opendota: r, broadcast: n } = t;
  if (j.isBusy()) {
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
    ), o = j.getProgress(), d = (/* @__PURE__ */ new Date()).toISOString();
    await Nr({
      heroIndex: l,
      playerHeroes: j.exportPlayerHeroRows(),
      meta: {
        leagueId: e,
        matchTotal: o.matchTotal,
        matchDone: o.matchDone,
        aggregatedAt: d,
        source: "api"
      }
    });
    const c = await a.patchState({
      tournamentHeroIndex: l,
      playerHeroIndex: ta(
        j.exportPlayerHeroRows()
      ),
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "ready",
        aggregatedAt: d,
        aggregationProgress: 100,
        aggregationMatchTotal: o.matchTotal,
        aggregationMatchDone: o.matchDone,
        aggregationError: void 0,
        aggregationSource: "api",
        statsCsvDir: K()
      }
    });
    await n.broadcastFull(c), S.info(
      { leagueId: e, matches: o.matchTotal, dir: K() },
      "League aggregation ready — saved to CSV"
    );
  } catch (l) {
    const o = l instanceof Error ? l.message : String(l);
    S.error({ err: l, leagueId: e }, "League aggregation failed");
    const d = await a.patchState({
      leagueConfig: {
        leagueId: e,
        aggregationStatus: "error",
        aggregationError: o
      }
    });
    await n.broadcastFull(d);
  }
}
async function Fr(t) {
  var u, m, g, p;
  const { state: e, opendota: a, broadcast: r } = t, n = _.LEAGUE_ID, i = await e.getState();
  if ((((u = i.leagueConfig) == null ? void 0 : u.leagueId) !== n || ((m = i.leagueConfig) == null ? void 0 : m.leagueId) === null || ((g = i.leagueConfig) == null ? void 0 : g.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: n, aggregationStatus: "idle" }
  }), await Ve({
    leagueId: n,
    state: e,
    broadcast: r
  })) return;
  const c = ((p = (await e.getState()).leagueConfig) == null ? void 0 : p.aggregationStatus) === "ready", h = j.getProgress().status === "ready";
  _.LEAGUE_AUTO_AGGREGATE && (!c || !h) && j.getProgress().status !== "running" ? (S.info({ leagueId: n }, "Starting league aggregation (Steam match list + OpenDota details)"), aa({ leagueId: n, state: e, opendota: a, broadcast: r })) : S.info(
    { leagueId: n, dir: K() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function pt() {
  return {
    leagueId: _.LEAGUE_ID,
    autoAggregate: _.LEAGUE_AUTO_AGGREGATE,
    statsDir: K()
  };
}
class _e extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function Or(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && j.getProgress().status === "ready";
}
function te(t) {
  var a, r;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new _e(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new _e(
      ((r = t.leagueConfig) == null ? void 0 : r.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!Or(t))
    throw new _e(
      "League stats not ready — run tournament aggregate first"
    );
}
function ra(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function Ur(t) {
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
    const d = o.split(",").map((p) => p.trim());
    if (d.length < 2) continue;
    const c = d[0] ?? "Player", h = Number(d[1]);
    if (!Number.isFinite(h)) continue;
    let f, u, m, g;
    if (d.length >= 4) {
      if (f = d[2] || void 0, u = d[3] || void 0, d.length >= 5) {
        const p = d[4] ?? "";
        p.startsWith("http://") || p.startsWith("https://") ? g = p : m = ra(p);
      }
      if (d.length >= 6) {
        const p = d[5] ?? "";
        (p.startsWith("http://") || p.startsWith("https://")) && (g = p);
      }
    } else d.length === 3 && (u = d[2] || void 0, f = u == null ? void 0 : u.replace(/_/g, " "));
    n.push({ displayName: c, steam32: h, teamName: f, teamKey: u, teamColor: m, avatarUrl: g });
  }
  return n;
}
function yt(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function We(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const r = a.teamKey ?? Br(a.teamName ?? "unknown"), n = a.teamName ?? $r(r), i = e.get(r);
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
function qe(t, e) {
  return We(t).find((a) => a.teamKey === e);
}
function ue(t) {
  return Ut(t);
}
function Br(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function $r(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function bt(t, e, a) {
  return t && t.map((r) => {
    if (r.type !== "pick") return r;
    const n = Le(a.matchSetup, e, r.order), i = Ga(a, e, r.order);
    if (n == null && !i) {
      const { playerName: l, steam32: o, ...d } = r;
      return d;
    }
    return {
      ...r,
      steam32: n ?? void 0,
      playerName: i
    };
  });
}
function Kr(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: bt(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: bt(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function St(t, e, a) {
  var i, l, o, d;
  const r = qe(e, t.radiantTeamKey), n = qe(e, t.direTeamKey);
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
      logoUrlA: ue(r.teamKey),
      logoUrlB: ue(n.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: r.teamName,
      logoUrl: ue(r.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: n.teamName,
      logoUrl: ue(n.teamKey),
      slots: (d = a == null ? void 0 : a.dire) == null ? void 0 : d.slots
    }
  };
}
const wt = /* @__PURE__ */ new Map();
async function na(t, e) {
  var l, o, d;
  if (e <= 0) return;
  const a = wt.get(e);
  if (a) return a;
  const r = await t.playerProfile(e);
  if (!r.ok || !r.data) return;
  const n = r.data, i = ((l = n.profile) == null ? void 0 : l.avatarfull) ?? n.avatarfull ?? ((o = n.profile) == null ? void 0 : o.avatarmedium) ?? n.avatarmedium ?? ((d = n.profile) == null ? void 0 : d.avatar) ?? n.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return wt.set(e, i), i;
}
async function _t(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var r;
      if ((r = a.avatarUrl) != null && r.trim()) return a;
      try {
        const n = await na(e, a.steam32);
        return n ? { ...a, avatarUrl: n } : a;
      } catch (n) {
        return S.warn({ err: n, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const Ye = R.join(process.cwd(), "steam32-vanity-cache.json");
let Q = null;
function Gr() {
  if (Q) return Q;
  try {
    if (T.existsSync(Ye))
      return Q = JSON.parse(T.readFileSync(Ye, "utf-8")), S.info({ count: Object.keys(Q).length }, "[steam32] Loaded vanity cache from disk"), Q;
  } catch {
  }
  return Q = {}, Q;
}
function Vr(t) {
  try {
    T.writeFileSync(Ye, JSON.stringify(t, null, 2));
  } catch (e) {
    S.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function Wr(t, e) {
  return new Promise((a) => {
    const r = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    jt.get(r, (n) => {
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
            const d = Number(BigInt(o.response.steamid) - BigInt("76561197960265728"));
            a(d);
          } else
            a(null);
        } catch {
          a(null);
        }
      });
    }).on("error", () => a(null));
  });
}
async function qr(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const r = t.match(/\/id\/([^/?#]+)/);
  if (r != null && r[1]) {
    const n = r[1].trim().toLowerCase(), i = Gr();
    if (i[n] != null)
      return S.debug({ vanity: n, steam32: i[n] }, "[steam32] Cache hit"), i[n];
    if (!e)
      return S.warn({ vanity: n }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await Wr(n, e);
    return l != null && l > 0 ? (i[n] = l, Vr(i), S.info({ vanity: n, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : S.warn({ vanity: n }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return S.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function fe(t) {
  return new Promise((e, a) => {
    jt.get(t, (r) => {
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
async function Yr(t) {
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
  const r = [];
  for (const l of a) {
    const o = l.name.trim(), d = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), c = ra(l.accentColor) || "#ffffff";
    for (const h of l.players || [])
      r.push({ teamName: o, teamKey: d, teamColor: c, player: h });
  }
  S.info({ total: r.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const n = await Promise.all(
    r.map(
      ({ player: l }) => qr(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < r.length; l++) {
    const { teamName: o, teamKey: d, teamColor: c, player: h } = r[l], f = n[l], u = h.displayName || h.name || "Player";
    f != null && f > 0 ? i.push({ displayName: u, steam32: f, teamName: o, teamKey: d, teamColor: c }) : S.warn({ displayName: u, url: h.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return S.info({ count: i.length, total: r.length }, "Completed roster sync from bpcleague.in"), i;
}
async function zr(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let r;
    e === "latest" || e === "active" ? r = await fe("https://api.bpcleague.in/api/public/tournament") : r = await fe(`https://api.bpcleague.in/api/public/seasons/${e}`);
    let n = [];
    return r.snapshot && r.snapshot.matches || r.tournament && ((a = r.snapshot) != null && a.matches) ? n = r.snapshot.matches : r.tournament && r.tournament.matches ? n = r.tournament.matches : r.matches && (n = r.matches), n.map((i) => {
      var l, o, d;
      return {
        id: i.id,
        team1: i.team1,
        team2: i.team2,
        winner: i.winner || null,
        status: i.status || "pending",
        stageKey: i.stageKey || "",
        seriesType: ((l = i.meta) == null ? void 0 : l.seriesType) || "bo3",
        team1Score: ((o = i.meta) == null ? void 0 : o.team1Score) ?? 0,
        team2Score: ((d = i.meta) == null ? void 0 : d.team2Score) ?? 0
      };
    });
  } catch (r) {
    return S.error(r, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function Jr() {
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
function F(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function q(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function sa(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function he(t, e) {
  return `${t}W / ${e}L`;
}
function Ce(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, r = t.laneLosses ?? 0;
  return e + a + r === 0 ? null : {
    label: "Lane",
    value: Pr(e, a, r),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function oa(t, e, a) {
  var n;
  const r = (n = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : n.avatarUrl;
  return r != null && r.trim() ? r : na(t, e);
}
function Qr(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : he(t.wins, t.losses),
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
function Xr(t, e, a, r) {
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
          sublabel: he(r.wins, r.losses)
        }
      ] : []
    ];
  const n = a.games - a.wins, i = `${q(a.avgKills)} / ${q(a.avgDeaths)} / ${q(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: he(a.wins, n),
      sublabel: `${F(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: q(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: sa(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ce(a) ? [Ce(a)] : [],
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
function Zr(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, r = `${q(e.avgKills)} / ${q(e.avgDeaths)} / ${q(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: he(e.wins, a),
      sublabel: `${F(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: q(e.avgKda),
      sublabel: `${r} per game`
    },
    {
      label: "Hero damage",
      value: sa(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...Ce(e) ? [Ce(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function ia(t) {
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
async function de(t, e, a) {
  await J(t);
  const r = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, n = r.heroName ?? ne(e), i = ge(e, n);
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
    statSlides: Qr(r),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function me(t, e, a, r, n, i, l) {
  await J(t);
  const o = $t(
    l,
    e,
    a
  ), d = n[String(a)], c = ne(a), h = ge(a, c), f = await oa(
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
    tournament: d ? {
      pickRate: d.pickRate,
      winRate: d.winRate,
      contestRate: d.contestRate,
      banRate: d.banRate,
      picks: d.picks,
      bans: d.bans,
      wins: d.wins,
      losses: d.losses,
      games: d.games
    } : void 0,
    playerHero: ia(o),
    statSlides: Xr(r, c, o, d),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function en(t, e) {
  return Fe(e, t);
}
async function la(t, e, a, r, n) {
  await J(t);
  const i = en(e, r), l = await oa(
    t,
    e,
    n
  ), o = V(n ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: Sr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: ia(i),
    statSlides: Zr(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function ca(t, e, a) {
  await J(t);
  const r = await t.matchupBetween(e, a), n = r.ok && r.data && typeof r.data == "object" ? r.data : {}, i = typeof n.games_played == "number" ? n.games_played : void 0, l = typeof n.wins == "number" ? n.wins : typeof n.win == "number" ? n.win : void 0, o = [
    {
      label: "Games sampled",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: "Hero A wins",
      value: l !== void 0 ? String(l) : "—"
    }
  ], d = ge(e), c = ge(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: ne(e),
    heroBName: ne(a),
    heroAPortraitSlug: d.heroPortraitSlug,
    heroBPortraitSlug: c.heroPortraitSlug,
    heroAPortraitUrl: d.heroPortraitUrl,
    heroBPortraitUrl: c.heroPortraitUrl,
    matchup: n,
    statLines: o,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: r.ok ? "opendota_cached" : "stale"
  };
}
function Xe(t, e = 4e3) {
  var r, n, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: F((r = t.tournament) == null ? void 0 : r.winRate),
      sublabel: t.tournament ? he(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
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
async function tn(t) {
  return await J(t), wr();
}
class an {
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
        const o = await this.state.getState(), d = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (d.length === 0) {
          S.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const c = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let h = d;
        c != null && c.radiantTeamKey && (c != null && c.direTeamKey) && (h = d.filter(
          (g) => g.teamKey === c.radiantTeamKey || g.teamKey === c.direTeamKey
        )), h.length === 0 && (h = d);
        const f = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], u = f[Math.floor(Math.random() * f.length)];
        S.info({ cardType: u }, "Autopilot: Triggering random stats card");
        const m = Date.now() + this.config.durationSeconds * 1e3;
        if (u === "player-league") {
          const g = h[Math.floor(Math.random() * h.length)], p = await la(
            this.opendota,
            g.steam32,
            g.displayName,
            o.playerHeroIndex,
            d
          ), y = await this.state.patchState({
            heroStatsCard: p,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(y), S.info({ player: g.displayName }, "Autopilot: Displayed player league stats");
        } else if (u === "player-hero") {
          const g = h[Math.floor(Math.random() * h.length)], p = o.playerHeroIndex ?? {}, y = `${g.steam32}:`, b = Object.keys(p).filter((E) => E.startsWith(y)).map((E) => Number(E.split(":")[1]));
          let I = 1;
          if (b.length > 0)
            I = b[Math.floor(Math.random() * b.length)];
          else {
            const E = Object.keys(o.tournamentHeroIndex ?? {});
            E.length > 0 && (I = Number(E[Math.floor(Math.random() * E.length)]));
          }
          const k = await me(
            this.opendota,
            g.steam32,
            I,
            g.displayName,
            o.tournamentHeroIndex ?? {},
            d,
            o.playerHeroIndex
          ), A = Xe(k, 4e3), C = await this.state.patchState({
            heroStatsCard: k,
            statCarousel: A,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(C), S.info({ player: g.displayName, heroId: I }, "Autopilot: Displayed player-hero stats carousel");
        } else if (u === "tournament-hero") {
          const g = Object.keys(o.tournamentHeroIndex ?? {});
          if (g.length === 0) return;
          const p = Number(g[Math.floor(Math.random() * g.length)]), y = await de(
            this.opendota,
            p,
            o.tournamentHeroIndex ?? {}
          ), b = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(b), S.info({ heroId: p }, "Autopilot: Displayed tournament hero stats");
        } else if (u === "matchup") {
          const g = [
            ...((n = (r = o.draft) == null ? void 0 : r.radiant) == null ? void 0 : n.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
          ].filter((k) => k.heroId && k.heroId > 0);
          let p = 1, y = 2;
          if (g.length >= 2) {
            const k = g[Math.floor(Math.random() * g.length)];
            let A = g[Math.floor(Math.random() * g.length)];
            for (; A.heroId === k.heroId && g.length > 1; )
              A = g[Math.floor(Math.random() * g.length)];
            p = k.heroId, y = A.heroId;
          } else {
            const k = Object.keys(o.tournamentHeroIndex ?? {});
            if (k.length >= 2)
              for (p = Number(k[Math.floor(Math.random() * k.length)]), y = Number(k[Math.floor(Math.random() * k.length)]); y === p; )
                y = Number(k[Math.floor(Math.random() * k.length)]);
          }
          const b = await ca(this.opendota, p, y), I = await this.state.patchState({
            matchupCard: b,
            overlayVisibility: {
              matchup: { mode: "timed", until: m }
            }
          });
          await this.broadcast.broadcastFull(I), S.info({ heroA: p, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        S.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const X = new an();
function be(t, e) {
  return e instanceof _e ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function rn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  X.configure({}, { state: a, opendota: n, broadcast: r }), e.get("/api/league/info", w, async (l, o) => {
    var h;
    const d = await a.getState(), c = await le(_.LEAGUE_ID);
    o.json({
      ...pt(),
      configuredInEnv: !0,
      leagueConfig: d.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: c,
      steamApiConfigured: !!_.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((h = _.LEAGUE_MATCH_IDS) != null && h.trim())
    });
  }), e.post("/api/league/config", w, async (l, o) => {
    const c = s.object({ leagueId: s.number() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = await a.patchState({
      leagueConfig: { ...h.leagueConfig, leagueId: c.data.leagueId }
    });
    await r.broadcastFull(f), o.json({ ok: !0, leagueConfig: f.leagueConfig });
  }), e.post("/api/league/aggregate", w, async (l, o) => {
    var c, h, f;
    if (j.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const d = await a.getState();
    ((c = d.leagueConfig) == null ? void 0 : c.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: _.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), aa({
      leagueId: ((h = d.leagueConfig) == null ? void 0 : h.leagueId) ?? _.LEAGUE_ID,
      state: a,
      opendota: n,
      broadcast: r
    }), o.json({ ok: !0, started: !0, leagueId: ((f = d.leagueConfig) == null ? void 0 : f.leagueId) ?? _.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    w,
    async (l, o) => {
      var f;
      const d = (f = (await a.getState()).leagueConfig) == null ? void 0 : f.leagueId;
      if (!await Ve({
        leagueId: d ?? _.LEAGUE_ID,
        state: a,
        broadcast: r
      })) {
        const u = await le(d ?? _.LEAGUE_ID), m = u.heroesExists ? ft(d ?? _.LEAGUE_ID, u) : { ...gt(d ?? _.LEAGUE_ID), statsStorage: u };
        return o.status(422).json(m);
      }
      const h = await a.getState();
      o.json({ ok: !0, leagueConfig: h.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    w,
    async (l, o) => {
      var h, f;
      const d = await le(_.LEAGUE_ID), c = await a.getState();
      o.json({
        ...d,
        statsDir: pt().statsDir,
        aggregationSource: (h = c.leagueConfig) == null ? void 0 : h.aggregationSource,
        aggregatedAt: (f = c.leagueConfig) == null ? void 0 : f.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    w,
    async (l, o) => {
      const d = j.getProgress(), c = await a.getState();
      o.json({
        ...d,
        inMemoryRunning: j.isBusy(),
        leagueId: _.LEAGUE_ID,
        leagueConfig: c.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", w, async (l, o) => {
    const c = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = Ur(c.data.csv), f = await _t(h, n), u = yt(f), m = await a.patchState({
      leagueConfig: { roster: f, teamColors: u, leagueId: _.LEAGUE_ID }
    });
    await r.broadcastFull(m), o.json({ ok: !0, count: f.length, teamColors: u, roster: f });
  }), e.post("/api/roster/sync-bpcleague", w, async (l, o) => {
    var h;
    const c = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    try {
      const f = c.data.seasonSlug || "season-1", u = await Yr({
        seasonSlug: f,
        steamApiKey: _.STEAM_WEB_API_KEY
      }), m = await _t(u, n), g = yt(m), p = await a.getState(), y = await a.patchState({
        leagueConfig: { roster: m, teamColors: g, leagueId: ((h = p.leagueConfig) == null ? void 0 : h.leagueId) ?? _.LEAGUE_ID, seasonSlug: f }
      });
      await r.broadcastFull(y), o.json({ ok: !0, count: m.length, teamColors: g, roster: m });
    } catch (f) {
      o.status(500).json({
        error: f instanceof Error ? f.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", w, async (l, o) => {
    var c;
    const d = await a.getState();
    o.json(((c = d.leagueConfig) == null ? void 0 : c.roster) ?? []);
  }), e.get("/api/teams", w, async (l, o) => {
    var h;
    const c = ((h = (await a.getState()).leagueConfig) == null ? void 0 : h.roster) ?? [];
    o.json(We(c));
  }), e.post("/api/match/setup", w, async (l, o) => {
    var m, g;
    const d = Vt.safeParse(l.body);
    if (!d.success)
      return o.status(400).json({ error: d.error.flatten() });
    const c = await a.getState(), h = ((m = c.leagueConfig) == null ? void 0 : m.roster) ?? [];
    if (h.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: f, seriesGame: u } = d.data;
    if (u > f)
      return o.status(400).json({
        error: `Game ${u} is invalid for a BO${f} series`
      });
    try {
      const p = { ...d.data }, y = (g = c.leagueConfig) == null ? void 0 : g.matchSetup;
      !p.previousDrafts && (y != null && y.previousDrafts) && (p.previousDrafts = [...y.previousDrafts]), y && p.seriesGame > y.seriesGame && c.draft && (p.previousDrafts = p.previousDrafts ?? [], p.previousDrafts.push(c.draft)), p.seriesGame === 1 && (p.previousDrafts = []);
      const b = St(
        p,
        h,
        c.draft
      ), I = await a.patchState({
        leagueConfig: { matchSetup: p },
        draft: b,
        production: {
          playerMappingPublished: !1
        }
      });
      await r.broadcastFull(I), o.json({
        ok: !0,
        matchSetup: p,
        teams: We(h),
        draft: I.draft
      });
    } catch (p) {
      o.status(400).json({
        error: p instanceof Error ? p.message : String(p)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    w,
    async (l, o) => {
      var A, C, E;
      const d = await a.getState(), c = ((A = d.leagueConfig) == null ? void 0 : A.roster) ?? [];
      if (c.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const h = ((C = d.leagueConfig) == null ? void 0 : C.leagueId) ?? _.LEAGUE_ID, f = await le(h);
      if (!await Ve({
        leagueId: h,
        state: a,
        broadcast: r
      })) {
        const M = f.heroesExists ? ft(h, f) : { ...gt(h), statsStorage: f };
        return o.status(422).json(M);
      }
      const m = await a.getState(), g = m.playerHeroIndex ?? {}, p = Object.keys(g).length, y = [];
      for (const M of c) {
        const x = `${M.steam32}:`;
        Object.keys(g).some((H) => H.startsWith(x)) || y.push(M.steam32);
      }
      const b = new Set(
        Object.keys(g).map((M) => Number(M.split(":")[0]))
      ), I = (E = c[0]) == null ? void 0 : E.steam32, k = I != null ? je(g, I).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: c.length,
        csvPlayerCount: b.size,
        indexKeyCount: p,
        matchedRosterCount: c.length - y.length,
        missingSteam32: y,
        statsStorage: f,
        indexEmpty: p === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: k,
        leagueConfig: m.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    w,
    async (l, o) => {
      var I, k;
      const d = Number(l.params.steam32);
      if (!Number.isFinite(d) || d <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const c = await a.getState(), h = c.playerHeroIndex ?? {}, f = `${d}:`, u = Object.entries(h).filter(([A]) => A.startsWith(f)).map(([A, C]) => ({
        heroId: Number(A.split(":")[1]),
        games: C.games,
        wins: C.wins
      })), m = je(h, d), g = ((I = c.leagueConfig) == null ? void 0 : I.leagueId) ?? _.LEAGUE_ID, p = await le(g);
      let y = [];
      try {
        y = (await Se(p.playerHeroesPath, "utf8")).split(/\r?\n/).filter((C) => C.startsWith(`${d},`));
      } catch {
        y = [];
      }
      const b = y.reduce(
        (A, C) => A + (Number(C.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: d,
        leagueId: g,
        gamesInIndex: m.games,
        winsInIndex: m.wins,
        heroRows: u,
        csvRowCount: y.length,
        csvGamesSum: b,
        aggregationMatchTotal: (k = c.leagueConfig) == null ? void 0 : k.aggregationMatchTotal,
        hint: m.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : m.games < b ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    w,
    async (l, o) => {
      var I, k, A, C, E;
      const d = s.object({ pickPlayers: Gt.optional() }).safeParse(l.body ?? {});
      if (!d.success)
        return o.status(400).json({ error: d.error.flatten() });
      const c = await a.getState(), h = (I = c.leagueConfig) == null ? void 0 : I.matchSetup, f = ((k = c.leagueConfig) == null ? void 0 : k.roster) ?? [], u = c.draft;
      if (!h)
        return o.status(400).json({ error: "save match setup first" });
      if (!u)
        return o.status(400).json({ error: "no draft state" });
      if (u.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const m = d.data.pickPlayers, g = m ? {
        ...h,
        pickPlayers: {
          radiant: m.radiant ?? ((A = h.pickPlayers) == null ? void 0 : A.radiant),
          dire: m.dire ?? ((C = h.pickPlayers) == null ? void 0 : C.dire)
        }
      } : h, p = {
        ...c.leagueConfig,
        roster: f,
        matchSetup: g
      }, y = Kr(u, p), b = await a.patchState({
        leagueConfig: { matchSetup: g },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await r.broadcastFull(b), o.json({
        ok: !0,
        matchSetup: (E = b.leagueConfig) == null ? void 0 : E.matchSetup,
        draft: b.draft,
        production: b.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    w,
    async (l, o) => {
      var g, p, y;
      const d = await a.getState(), c = ((g = d.leagueConfig) == null ? void 0 : g.roster) ?? [], h = (p = d.leagueConfig) == null ? void 0 : p.matchSetup, f = (((y = d.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let u = null;
      h && c.length > 0 && (u = St(
        h,
        c,
        null
      ));
      const m = await a.patchState({
        draft: u,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: f
        }
      });
      await r.broadcastFull(m), o.json({
        ok: !0,
        overlayDraftEpoch: f,
        draft: m.draft
      });
    }
  ), e.post("/api/league/team-colors", w, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", w, async (l, o) => {
    const d = await tn(n);
    o.json(d);
  }), e.post("/api/stats/player-hero", w, async (l, o) => {
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
      te(h);
    } catch (p) {
      if (be(o, p)) return;
      throw p;
    }
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = V(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, m = await me(
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
        heroStatsCard: m,
        statCarousel: null
      });
      return await r.broadcastFull(p), o.json({ ok: !0, card: m, persisted: p });
    }
    o.json({ ok: !0, card: m });
  }), e.post("/api/stats/player-league", w, async (l, o) => {
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
      te(h);
    } catch (p) {
      if (be(o, p)) return;
      throw p;
    }
    const f = ((g = h.leagueConfig) == null ? void 0 : g.roster) ?? [], u = V(f, c.data.steam32) ?? {
      steam32: c.data.steam32,
      displayName: c.data.displayName ?? `Player ${c.data.steam32}`
    }, m = await la(
      n,
      c.data.steam32,
      u.displayName,
      h.playerHeroIndex,
      f
    );
    if (c.data.persist) {
      const p = await a.patchState({
        heroStatsCard: m,
        statCarousel: null
      });
      return await r.broadcastFull(p), o.json({ ok: !0, card: m, persisted: p });
    }
    o.json({ ok: !0, card: m });
  }), e.post(
    "/api/stats/tournament-hero",
    w,
    async (l, o) => {
      const c = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(l.body);
      if (!c.success)
        return o.status(400).json({ error: c.error.flatten() });
      const h = await a.getState();
      try {
        te(h);
      } catch (u) {
        if (be(o, u)) return;
        throw u;
      }
      const f = await de(
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
  ), e.post("/api/stats/matchup", w, async (l, o) => {
    const c = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    await a.getState();
    const h = await ca(
      n,
      c.data.heroAId,
      c.data.heroBId
    );
    if (c.data.persist) {
      const f = await a.patchState({ matchupCard: h });
      return await r.broadcastFull(f), o.json({ ok: !0, card: h, persisted: f });
    }
    o.json({ ok: !0, card: h });
  }), e.post("/api/producer/h2h", w, async (l, o) => {
    var b;
    const c = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    const h = await a.getState(), f = ((b = h.leagueConfig) == null ? void 0 : b.roster) ?? [], u = V(f, c.data.player1Steam32), m = V(f, c.data.player2Steam32);
    if (!u || !m)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      te(h);
    } catch (I) {
      return o.status(503).json({ error: I.message });
    }
    const g = Fe(h.playerHeroIndex, c.data.player1Steam32), p = Fe(h.playerHeroIndex, c.data.player2Steam32), y = {
      player1: { ...u, stats: g },
      player2: { ...m, stats: p }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", w, async (l, o) => {
    var p, y, b, I, k, A, C;
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
      te(h);
    } catch (E) {
      if (be(o, E)) return;
      throw E;
    }
    const f = ((p = h.leagueConfig) == null ? void 0 : p.roster) ?? [];
    let u;
    if (c.data.type === "last-pick") {
      const E = (y = h.draft) == null ? void 0 : y.lastPick;
      if (!E) return o.status(400).json({ error: "no last pick" });
      const M = E.side === "dire" || E.side === "B" ? "dire" : "radiant", x = M === "radiant" ? (I = (b = h.draft) == null ? void 0 : b.radiant) == null ? void 0 : I.slots : (A = (k = h.draft) == null ? void 0 : k.dire) == null ? void 0 : A.slots, O = Bt(M, E.heroId, x), H = O !== void 0 ? Le((C = h.leagueConfig) == null ? void 0 : C.matchSetup, M, O) : void 0, G = H != null && H > 0 ? V(f, H) : void 0;
      u = G && H ? await me(
        n,
        H,
        E.heroId,
        G.displayName,
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      ) : await de(
        n,
        E.heroId,
        h.tournamentHeroIndex ?? {}
      );
    } else if (c.data.type === "player-hero") {
      if (c.data.heroId === void 0 || c.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const E = V(f, c.data.steam32);
      u = await me(
        n,
        c.data.steam32,
        c.data.heroId,
        (E == null ? void 0 : E.displayName) ?? "Player",
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      );
    } else {
      if (c.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      u = await de(
        n,
        c.data.heroId,
        h.tournamentHeroIndex ?? {}
      );
    }
    const m = Xe(
      u,
      c.data.slideDurationMs ?? 4e3
    ), g = Date.now() + (c.data.overlaySeconds ?? 12) * 1e3;
    if (c.data.persist !== !1) {
      const E = await a.patchState({
        heroStatsCard: u,
        statCarousel: m,
        overlayVisibility: {
          herostats: { mode: "timed", until: g }
        }
      });
      return await r.broadcastFull(E), o.json({ ok: !0, card: u, carousel: m, persisted: E });
    }
    o.json({ ok: !0, card: u, carousel: m });
  }), e.post("/api/stats/stop", w, async (l, o) => {
    const d = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await r.broadcastFull(d), o.json({ ok: !0, persisted: d });
  }), e.post("/api/production/settings", w, async (l, o) => {
    const c = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.patchState({ production: c.data });
    await r.broadcastFull(h), o.json(h.production);
  }), e.get("/api/league/bpc-matches", w, async (l, o) => {
    const d = l.query.seasonSlug, c = await zr(d);
    o.json(c);
  }), e.get("/api/league/bpc-seasons", w, async (l, o) => {
    const d = await Jr();
    o.json(d);
  }), e.get("/api/autopilot/config", w, (l, o) => {
    o.json({
      config: X.getConfig(),
      isActive: X.isActive()
    });
  }), e.post("/api/autopilot/config", w, (l, o) => {
    const c = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    X.configure(c.data), o.json({
      config: X.getConfig(),
      isActive: X.isActive()
    });
  }), e.post("/api/autopilot/trigger", w, async (l, o) => {
    await X.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const nn = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function P(t) {
  return t && typeof t == "object" ? t : null;
}
function ze(t) {
  const e = P(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const r = Number(a);
    if (Number.isFinite(r) && r > 0) return r;
  }
  return null;
}
function Ie(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const It = /* @__PURE__ */ new Set();
function sn() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function on(t, e, a, r) {
  sn() && (It.has(t) || (It.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: r.slug,
    source: r.source
  })));
}
function ua(t, e, a, r) {
  const n = Ae({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  r && on(r, t, e, n);
  const i = n.slug ?? pr({ heroId: t, heroClass: e });
  if (i)
    return { ...Ba(i), slug: i };
  if (t) {
    const l = br(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: Ae({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Pe(t, e) {
  if (t) return ne(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function kt(t, e, a) {
  const r = `${e}${a}`, n = N(t[`${r}_id`]), i = Ie(t[`${r}_class`]);
  if (!n && !i)
    return null;
  const l = {};
  return n > 0 && (l.hero_id = n), i && (l.class = i), l;
}
function Et(t, e) {
  var i;
  const a = [], r = /* @__PURE__ */ new Set(), n = (l, o, d, c) => {
    const h = `${l}-${o}`;
    if (r.has(h) || (r.add(h), !d && !c)) return;
    const f = ua(
      d,
      c,
      Pe(d, c),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: d,
      heroName: Pe(d, c),
      heroPortraitSlug: f.slug,
      heroPortraitUrl: f.staticUrl,
      heroPortraitAnimatedUrl: f.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const d = /^(pick|ban)(\d+)$/i.exec(l);
    if (!d) continue;
    const c = ((i = d[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", h = Number(d[2]), f = ze(o), u = P(o), m = Ie((u == null ? void 0 : u.class) ?? (u == null ? void 0 : u.hero_class));
    n(c, h, f, m);
  }
  for (let l = 0; l < 7; l++) {
    const o = kt(t, "ban", l);
    o && n(
      "ban",
      l,
      N(o.hero_id) > 0 ? N(o.hero_id) : null,
      Ie(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = kt(t, "pick", l);
    o && n(
      "pick",
      l,
      N(o.hero_id) > 0 ? N(o.hero_id) : null,
      Ie(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function At(t, e) {
  return (e === "radiant" ? P(t.radiant) ?? P(t.team2) : P(t.dire) ?? P(t.team3)) ?? {};
}
function ln(t) {
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
function cn(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function un(t, e) {
  const a = P(t.team2), r = P(t.team3), n = N(t.radiant_bonus_time) || N(a == null ? void 0 : a.bonus_time), i = N(t.dire_bonus_time) || N(r == null ? void 0 : r.bonus_time);
  return e === "radiant" ? n : e === "dire" ? i : Math.max(n, i);
}
const Ct = 7, Pt = 5;
function Y(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Re(t, e) {
  return Y(t, "pick") >= Pt && Y(e, "pick") >= Pt;
}
function Je(t, e) {
  return Y(t, "ban") > 0 || Y(e, "ban") > 0 || Y(t, "pick") > 0 || Y(e, "pick") > 0;
}
function dn(t, e, a) {
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
function mn(t, e, a, r, n) {
  if (!t || Re(a, r))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !Je(a, r) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !Je(a, r) && !n)
    return "starting";
  const i = Y(a, "ban"), l = Y(r, "ban");
  return i < Ct || l < Ct ? "bans" : "picks";
}
function Rt(t) {
  const e = P(t);
  if (!e) return null;
  const a = P(e.hero);
  if (a) {
    const r = ze(a);
    if (r) return r;
  }
  return ze(t);
}
function gn(t, e) {
  const a = /* @__PURE__ */ new Map(), r = P(t.player), n = P(t.hero), i = e === "radiant" ? P(n == null ? void 0 : n.team2) ?? P(n == null ? void 0 : n.radiant) : P(n == null ? void 0 : n.team3) ?? P(n == null ? void 0 : n.dire), l = e === "radiant" ? P(r == null ? void 0 : r.team2) ?? P(r == null ? void 0 : r.radiant) : P(r == null ? void 0 : r.team3) ?? P(r == null ? void 0 : r.dire);
  if (i)
    for (const [o, d] of Object.entries(i)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]), f = Rt(d);
      if (f && f > 0 && Number.isFinite(h)) {
        let u;
        if (l) {
          const m = P(l[o]);
          if (m != null && m.accountid) {
            const g = parseInt(String(m.accountid), 10);
            Number.isFinite(g) && g > 0 && (u = g);
          }
        }
        a.set(h, { heroId: f, steam32: u });
      }
    }
  if (l)
    for (const [o, d] of Object.entries(l)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]), f = a.get(h);
      if (f != null && f.heroId) continue;
      const u = Rt(d);
      if (u && u > 0 && Number.isFinite(h)) {
        const m = P(d);
        let g;
        if (m != null && m.accountid) {
          const p = parseInt(String(m.accountid), 10);
          Number.isFinite(p) && p > 0 && (g = p);
        }
        a.set(h, { heroId: u, steam32: g });
      }
    }
  return a;
}
function Lt(t, e, a) {
  const r = gn(a, e);
  return t.map((n) => {
    if (n.type !== "pick") return n;
    const i = r.get(n.order);
    if (!i || !i.heroId || i.heroId <= 0) return n;
    const l = ua(
      i.heroId,
      void 0,
      Pe(i.heroId, void 0),
      `${e}-player${n.order}`
    );
    return {
      ...n,
      heroId: i.heroId,
      steam32: i.steam32,
      heroName: Pe(i.heroId, void 0),
      heroPortraitSlug: l.slug,
      heroPortraitUrl: l.staticUrl,
      heroPortraitAnimatedUrl: l.animatedUrl
    };
  });
}
const fn = [
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
], hn = [
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
function Dt(t, e, a) {
  const n = (a === "dire_first_pick" ? hn : fn).findIndex((i) => i.side === t && i.order === e);
  return n >= 0 ? n : e;
}
function Tt(t, e) {
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
function vt(t, e) {
  let a = t[0], r = Dt(a.side, a.slot.order, e);
  for (const n of t.slice(1)) {
    const i = Dt(n.side, n.slot.order, e);
    i > r && (a = n, r = i);
  }
  return a;
}
function pn(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function yn(t, e, a) {
  var d, c, h, f;
  const r = [];
  for (const u of t)
    u.type === "pick" && u.heroId && r.push({ side: "radiant", slot: u });
  for (const u of e)
    u.type === "pick" && u.heroId && r.push({ side: "dire", slot: u });
  if (r.length === 0) return;
  const n = /* @__PURE__ */ new Set();
  for (const u of ["radiant", "dire"]) {
    const m = u === "radiant" ? (d = a == null ? void 0 : a.radiant) == null ? void 0 : d.slots : (c = a == null ? void 0 : a.dire) == null ? void 0 : c.slots;
    for (const g of m ?? []) {
      const p = Tt(u, g);
      p && n.add(p);
    }
  }
  const i = r.filter(
    ({ side: u, slot: m }) => !n.has(Tt(u, m))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Re(t, e) && a && !Re(((h = a.radiant) == null ? void 0 : h.slots) ?? [], ((f = a.dire) == null ? void 0 : f.slots) ?? [])) {
      const u = vt(r, l), m = Ne(u.side, u.slot);
      if (pn(a.lastPick, m)) return m;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const u = i[0];
    return Ne(u.side, u.slot);
  }
  const o = vt(i, l);
  return Ne(o.side, o.slot);
}
function Nt(t, e, a, r, n) {
  var o, d;
  if (!t)
    return {
      name: r,
      logoUrl: e === "radiant" ? ((o = n == null ? void 0 : n.radiant) == null ? void 0 : o.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlA) : ((d = n == null ? void 0 : n.dire) == null ? void 0 : d.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = qe(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: ue(l.teamKey)
  } : { name: r };
}
function bn(t, e, a, r) {
  var G, se;
  const n = P(t.map), i = typeof (n == null ? void 0 : n.game_state) == "string" ? n.game_state : "", l = nn.has(i), o = P(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const d = typeof (n == null ? void 0 : n.team_name_radiant) == "string" ? n.team_name_radiant : "Radiant", c = typeof (n == null ? void 0 : n.team_name_dire) == "string" ? n.team_name_dire : "Dire", h = Nt(
    r,
    "radiant",
    a,
    d,
    e
  ), f = Nt(
    r,
    "dire",
    a,
    c,
    e
  ), u = o ?? {}, m = At(u, "radiant"), g = At(u, "dire");
  let p = Et(m, "radiant"), y = Et(g, "dire");
  Re(p, y) && (p = Lt(p, "radiant", t), y = Lt(y, "dire", t));
  const I = o ? ln(u) : null, k = N(
    u.activeteam_time_remaining ?? u.active_team_time_remaining
  ), A = o ? cn(u) : void 0, C = o ? un(u, I) : 0, E = [
    ...p.map((v) => ({
      team: "A",
      heroId: v.heroId,
      player: v.playerName,
      isBan: v.type === "ban",
      order: v.order,
      heroName: v.heroName,
      heroPortraitUrl: v.heroPortraitUrl
    })),
    ...y.map((v) => ({
      team: "B",
      heroId: v.heroId,
      player: v.playerName,
      isBan: v.type === "ban",
      order: v.order,
      heroName: v.heroName,
      heroPortraitUrl: v.heroPortraitUrl
    }))
  ], M = yn(p, y, e), x = mn(
    l,
    i,
    p,
    y,
    I
  );
  let O = dn(n, i, u);
  x === "starting" && O === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? O = e.startSecondsRemaining : k > 0 && !Je(p, y) && (O = k));
  const H = {
    source: "gsi",
    phase: x,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(C)),
    activeTeam: x === "starting" ? null : I,
    turnAction: x === "starting" ? void 0 : A,
    startSecondsRemaining: x === "starting" ? Math.max(
      0,
      Math.round(
        O ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: x === "starting" ? void 0 : Math.max(0, Math.round(k)),
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
      bonusTime: Math.max(0, Math.round(N(u.radiant_bonus_time) || N((G = P(u.team2)) == null ? void 0 : G.bonus_time) || 0))
    },
    dire: {
      name: f.name,
      logoUrl: f.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(N(u.dire_bonus_time) || N((se = P(u.team3)) == null ? void 0 : se.bonus_time) || 0))
    },
    picksBansOrder: E,
    lastPick: M
  };
  return { inDraft: l || !!o, draftPatch: H };
}
const Me = /* @__PURE__ */ new Map(), Mt = {
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
function Sn(t, e, a) {
  var r, n;
  try {
    return ((n = (r = t == null ? void 0 : t.items) == null ? void 0 : r[e]) == null ? void 0 : n[a]) || {};
  } catch {
    return {};
  }
}
function wn(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.hero) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "unknown_hero";
  } catch {
    return "unknown_hero";
  }
}
function _n(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.player) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function In(t, e) {
  var n;
  if (!(t != null && t.items) || (((n = t == null ? void 0 : t.map) == null ? void 0 : n.clock_time) || 0) < 0) return;
  const r = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const d = `player${o}`, c = Sn(t, i, d), h = _n(t, i, d);
      if (!h || h === "Unknown Player") continue;
      Me.has(h) || Me.set(h, /* @__PURE__ */ new Set());
      const f = Me.get(h), u = /* @__PURE__ */ new Set();
      for (const m in c) {
        const g = (l = c[m]) == null ? void 0 : l.name;
        g && g !== "empty" && u.add(g);
      }
      for (const m of u)
        if (!f.has(m) && (f.add(m), Mt[m])) {
          const g = wn(t, i, d), p = Mt[m];
          S.info({ playerName: h, heroName: g, item: m, hypeText: p }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: h,
            heroName: g,
            item: m,
            hypeText: p
          });
        }
    }
  };
  r("team2"), r("team3");
}
let ae = 0, xe = null;
function kn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var p, y;
    const d = typeof l.query.token == "string" ? l.query.token : void 0;
    if (_.GSI_TOKEN && d !== _.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const c = l.body;
    ae = Date.now(), await J(n);
    try {
      In(c, i);
    } catch (b) {
      S.error(b, "Power spike evaluation failed");
    }
    const h = await a.getState(), f = ((p = h.leagueConfig) == null ? void 0 : p.roster) ?? [], u = ((y = h.leagueConfig) == null ? void 0 : y.matchSetup) ?? null, m = bn(
      c,
      h.draft ?? null,
      f,
      u
    ), g = async () => {
      var A, C, E, M, x, O, H, G, se, v;
      const b = await a.getState();
      let I = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      m.draftPatch && (I = {
        ...I,
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
      const k = await a.patchState(I);
      if (await r.broadcastFull(k), (A = b.production) != null && A.autoShowStatsOnPick && ((C = m.draftPatch) != null && C.lastPick)) {
        try {
          te(b);
        } catch {
          return;
        }
        const oe = m.draftPatch.lastPick, De = oe.side === "dire" || oe.side === "B" ? "dire" : "radiant", da = De === "radiant" ? ((E = m.draftPatch.radiant) == null ? void 0 : E.slots) ?? ((x = (M = b.draft) == null ? void 0 : M.radiant) == null ? void 0 : x.slots) : ((O = m.draftPatch.dire) == null ? void 0 : O.slots) ?? ((G = (H = b.draft) == null ? void 0 : H.dire) == null ? void 0 : G.slots), Ze = Bt(De, oe.heroId, da), ie = Ze !== void 0 ? Le((se = b.leagueConfig) == null ? void 0 : se.matchSetup, De, Ze) : void 0, et = ((v = b.leagueConfig) == null ? void 0 : v.roster) ?? [], tt = ie != null && ie > 0 ? V(et, ie) : void 0, at = tt && ie ? await me(
          n,
          ie,
          oe.heroId,
          tt.displayName,
          b.tournamentHeroIndex ?? {},
          et,
          b.playerHeroIndex
        ) : await de(
          n,
          oe.heroId,
          b.tournamentHeroIndex ?? {}
        ), ma = Xe(at), ga = Date.now() + 12e3, fa = await a.patchState({
          heroStatsCard: at,
          statCarousel: ma,
          overlayVisibility: {
            herostats: { mode: "timed", until: ga }
          }
        });
        await r.broadcastFull(fa);
      }
    };
    xe && clearTimeout(xe), xe = setTimeout(() => {
      g().catch((b) => S.error(b, "gsi apply failed"));
    }, 150), o.json({ ok: !0, inDraft: m.inDraft });
  }), e.get("/gsi/status", (l, o) => {
    o.json({
      lastSeen: ae ? new Date(ae).toISOString() : null,
      connected: Date.now() - ae < 5e3
    });
  });
}
function En(t, e, a) {
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
function xt(t, e) {
  var n, i;
  const a = e.handshake;
  let r = "";
  return typeof ((n = a.auth) == null ? void 0 : n.token) == "string" ? r = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (r = a.query.token), r ? r === _.BROADCAST_SECRET : t === "overlay";
}
async function An(t) {
  const { state: e, obs: a, opendota: r } = t, n = ce();
  n.use(Ia({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), n.disable("x-powered-by"), n.use(
    _a({
      origin: _.NODE_ENV === "production" ? nt() : !0,
      credentials: !0
    })
  ), n.use(ce.json({ limit: "1mb" }));
  const i = R.dirname(Ht(import.meta.url)), l = R.join(i, "../../overlay-web/dist"), o = R.join(i, "../../admin-web/dist");
  n.use("/overlay", ce.static(l)), n.use("/admin", ce.static(o)), n.get("/admin", (g, p) => {
    const y = R.join(o, "index.html");
    p.sendFile(y, (b) => {
      b && p.status(500).send(`sendFile error for ${y}: ${b.message}`);
    });
  }), n.get("/admin/*", (g, p) => {
    const y = R.join(o, "index.html");
    p.sendFile(y, (b) => {
      b && p.status(500).send(`sendFile error for ${y}: ${b.message}`);
    });
  }), n.get("/overlay", (g, p) => {
    const y = R.join(l, "index.html");
    p.sendFile(y, (b) => {
      b && p.status(500).send(`sendFile error for ${y}: ${b.message}`);
    });
  }), n.get("/overlay/*", (g, p) => {
    const y = R.join(l, "index.html");
    p.sendFile(y, (b) => {
      b && p.status(500).send(`sendFile error for ${y}: ${b.message}`);
    });
  });
  const d = ka.createServer(n), c = new Ea(d, {
    cors: _.NODE_ENV === "production" ? { origin: nt() } : { origin: !0 },
    transports: ["websocket", "polling"]
  }), h = {
    async broadcastFull(g) {
      const p = g ?? await e.getState();
      c.of($.OVERLAY).emit(B.STATE_FULL, p), c.of($.PRODUCER).emit(
        B.STATE_FULL,
        p
      ), S.debug({ seq: p.seq }, "Emitted state snapshot");
    }
  };
  fr({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    obs: a,
    opendota: r
  }), rn({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    opendota: r
  }), kn({
    app: n,
    state: e,
    broadcast: h,
    opendota: r,
    io: c
  }), En(e, h);
  const f = c.of($.PRODUCER), u = c.of($.OVERLAY);
  f.use((g, p) => {
    const y = xt("producer", g);
    p(y ? void 0 : new Error("unauthorized producer"));
  }), u.use((g, p) => {
    const y = xt("overlay", g);
    p(y ? void 0 : new Error("unauthorized overlay"));
  }), f.on("connection", (g) => {
    S.info({ id: g.id }, "producer connected"), e.getState().then((p) => {
      g.emit(B.STATE_FULL, p);
    });
  }), u.on("connection", (g) => {
    S.info({ id: g.id }, "overlay viewer connected"), e.getState().then((p) => {
      g.emit(B.STATE_FULL, p);
    });
  });
  const m = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(m) && m > 500) {
    const g = setInterval(() => {
      e.getState().then((p) => {
        c.of($.OVERLAY).emit(B.STATE_FULL, p);
      });
    }, m);
    typeof g.unref == "function" && g.unref();
  }
  return { app: n, httpServer: d, io: c, broadcast: h };
}
async function Cn() {
  const t = await dr(), e = new Ta(), a = new Ma();
  _.REDIS_URL && a.attachRedis(_.REDIS_URL), J(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  );
  const r = await An({ state: t, obs: e, opendota: a });
  await Fr({
    state: t,
    opendota: a,
    broadcast: r.broadcast
  }), r.httpServer.listen(_.PORT, () => {
    S.info(
      { port: _.PORT, leagueId: _.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const n = async () => {
    var i;
    S.info("Shutting down"), await r.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), r.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void n()), process.on("SIGTERM", () => void n()), { obs: e, opendota: a, state: t, shutdown: n };
}
import.meta.url === `file://${process.argv[1]}` && Cn().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
export {
  Cn as bootstrapBroadcastServer
};

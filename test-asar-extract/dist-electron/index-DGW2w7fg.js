var Ka = Object.defineProperty;
var Va = (t, e, a) => e in t ? Ka(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var D = (t, e, a) => Va(t, typeof e != "symbol" ? e + "" : e, a);
import P from "node:path";
import { fileURLToPath as rt } from "node:url";
import { config as Wa } from "dotenv";
import { z as s } from "zod";
import qa from "pino";
import Ya from "obs-websocket-js";
import za from "bottleneck";
import { Redis as nt } from "ioredis";
import Ja from "cors";
import fe from "express";
import Qa from "helmet";
import Xa from "node:http";
import { Server as Za } from "socket.io";
import v, { existsSync as Nt } from "node:fs";
import { exec as er } from "node:child_process";
import { promisify as tr } from "node:util";
import { mkdir as ma, writeFile as Ae, access as ar, readFile as Ee } from "node:fs/promises";
import ga from "node:https";
const rr = P.dirname(rt(import.meta.url));
Wa({ path: P.resolve(rr, "../.env") });
const nr = s.object({
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
}), I = nr.parse(process.env);
function Mt() {
  return I.CORS_ORIGINS.split(",").map((t) => t.trim()).filter(Boolean);
}
const S = qa({
  level: process.env.LOG_LEVEL ?? "info"
});
class sr {
  constructor() {
    D(this, "client", new Ya());
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
const or = "https://api.opendota.com/api";
function ir(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class lr {
  constructor(e = 600) {
    D(this, "limiter");
    D(this, "memory", /* @__PURE__ */ new Map());
    D(this, "redis", null);
    this.ttlSeconds = e;
    const a = I.OPENDOTA_RATE_PER_MINUTE, r = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new za({
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
        const r = await fetch(`${or}${e}`, {
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
const Z = "Game starting in", fa = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), cr = fa.partial();
function Pe(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function ur(t, e, a = Date.now()) {
  if (e.running === !0) {
    const n = e.secondsRemaining ?? (t ? Pe(t, a) : 0), i = Math.max(0, Math.floor(n));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const n = e.secondsRemaining ?? (t ? Pe(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(n))
    };
  }
  const r = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? Z,
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
function xt(t, e = Z) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function Ht(t, e = Z) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const dr = {
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
function mr(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (dr[e] ?? e);
}
function U(t) {
  return mr(t.replace(/^npc_dota_hero_/, "").trim());
}
function gr(t) {
  if (!t)
    return {};
  const e = U(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: ha(e)
  } : {};
}
function ha(t, e) {
  const a = U(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function fr(t, e) {
  const a = U(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function hr(t, e) {
  const a = U(t);
  if (!a)
    return {};
  const r = ha(a), n = fr(a);
  return {
    staticUrl: r,
    staticFallbackUrl: r,
    animatedUrl: n
  };
}
function pa(t) {
  return `/teams/${t}.png`;
}
function Be(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function pr(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Map();
  for (const n of t) {
    const i = U(n.name);
    if (!i)
      continue;
    e.set(n.id, i), a.add(i), r.set(Be(n.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    r.set(Be(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: r };
}
function yr(t, e) {
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
    const o = Be(l), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (r) {
    const l = U(r);
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
function br(t, e, a) {
  var n, i;
  const r = He(t == null ? void 0 : t.matchSetup, e, a);
  if (!(r == null || !((n = t == null ? void 0 : t.roster) != null && n.length)))
    return (i = t.roster.find((l) => l.steam32 === r)) == null ? void 0 : i.displayName;
}
function ya(t, e, a) {
  const r = a == null ? void 0 : a.find((n) => n.type === "pick" && n.heroId === e);
  return r == null ? void 0 : r.order;
}
function Sr(t, e) {
  return `${t}:${e}`;
}
function Ge(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let r = 0, n = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (r += l.games, n += l.wins);
  return { games: r, wins: n };
}
function ba(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[Sr(e, a)];
}
function Ke(t, e) {
  if (Ge(t, e).games <= 0)
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
const wr = [
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
], _r = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), Sa = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  _r
]), kr = s.object({
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
}), Ir = s.object({
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
}), wa = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), _a = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: wa.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => De)).optional()
}), ka = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(Ir).default([]),
  matchSetup: _a.nullable().optional(),
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
}), Ia = s.object({
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
}), Ca = s.object({
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
}), Aa = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), Ve = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(Aa),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), Ea = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Cr = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Ar = s.object({
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
}), jt = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Ar).optional(),
  bonusTime: s.number().optional()
}), Er = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), De = s.object({
  series: kr,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Cr).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: jt.optional(),
  dire: jt.optional(),
  lastPick: Er.optional()
}), We = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), Pr = s.object({
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
  replays: s.array(Pr)
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
}), vr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), Rr = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), le = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: Rr.optional(),
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
  tournament: vr.optional(),
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
  statSlides: s.array(Aa).optional(),
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
}), Dr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: fa.optional()
}), Pa = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), va = s.object({
  roshanState: s.string().optional(),
  roshanRespawnTimer: s.number().optional(),
  tormentorRadiant: s.string().optional(),
  tormentorDire: s.string().optional(),
  radiantScanActive: s.boolean().optional(),
  direScanActive: s.boolean().optional(),
  radiantGlyphActive: s.boolean().optional(),
  direGlyphActive: s.boolean().optional()
});
s.object({
  version: s.number(),
  seq: s.number(),
  updatedAt: s.string(),
  overlayVisibility: s.record(Sa).default({}),
  sceneHints: Pa.optional(),
  leagueConfig: ka.optional(),
  tournamentHeroIndex: s.record(Ia).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(Ca).optional(),
  production: Ea.optional(),
  statCarousel: Ve.nullable().optional(),
  draft: De.nullable().optional(),
  lowerThirds: We.nullable().optional(),
  playerStatsCard: qe.nullable().optional(),
  heroStatsCard: le.nullable().optional(),
  livePlayerCard: le.nullable().optional(),
  matchupCard: Ye.nullable().optional(),
  sponsor: ze.nullable().optional(),
  timers: Dr.optional(),
  minimapState: va.optional()
});
const Lr = s.object({
  overlayVisibility: s.record(Sa).optional(),
  leagueConfig: ka.partial().optional(),
  tournamentHeroIndex: s.record(Ia).optional(),
  playerHeroIndex: s.record(Ca).optional(),
  production: Ea.partial().optional(),
  minimapState: va.partial().optional(),
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
    gameStartCountdown: cr.optional()
  }).partial().optional(),
  sceneHints: Pa.partial().optional()
});
function Tr() {
  const t = {};
  for (const e of wr)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function Nr() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function Ra() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: Tr(),
    sceneHints: {},
    leagueConfig: Nr(),
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
  let r;
  const n = t.headers.authorization;
  if (n != null && n.startsWith("Bearer ") ? r = n.slice(7).trim() : typeof t.query.token == "string" && (r = t.query.token), !r) {
    e.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (r !== I.BROADCAST_SECRET) {
    e.status(403).json({ error: "invalid token" });
    return;
  }
  a();
}
function Mr(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function Ft(t, e) {
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
function xr(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const r = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, n = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return r != null && r.slots && (r.slots = Ft((i = t.radiant) == null ? void 0 : i.slots, r.slots)), n != null && n.slots && (n.slots = Ft((l = t.dire) == null ? void 0 : l.slots, n.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: r,
    dire: n,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function ae(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function Hr(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function jr(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function Da(t, e) {
  var w;
  const a = e.overlayVisibility !== void 0 ? Mr(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let r = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: b, ..._ } = e.timers;
    r = {
      ...t.timers ?? {},
      ..._
    }, b !== void 0 && (r = {
      ...r,
      gameStartCountdown: ur((w = t.timers) == null ? void 0 : w.gameStartCountdown, b)
    });
  }
  const n = xr(t.draft, e.draft), i = Hr(t.leagueConfig, e.leagueConfig), l = jr(t.production, e.production);
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
    draft: n === void 0 ? t.draft : n,
    lowerThirds: f === void 0 ? t.lowerThirds : f,
    playerStatsCard: u === void 0 ? t.playerStatsCard : u,
    heroStatsCard: c === void 0 ? t.heroStatsCard : c,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: d === void 0 ? t.matchupCard : d,
    sponsor: g === void 0 ? t.sponsor : g,
    timers: r ?? t.timers,
    sceneHints: h,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState
  };
}
function Ot(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = Da(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function Fr(t) {
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
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, m = Da(o, n);
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
async function Or() {
  const t = Ra();
  if (I.STATE_BACKEND === "memory")
    return S.info("State backend: memory"), Ot(t);
  if (!I.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new nt(I.REDIS_URL);
    return await e.ping(), await e.quit(), S.info({ key: I.REDIS_STATE_KEY }, "State backend: redis"), Fr({
      url: I.REDIS_URL,
      key: I.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (S.error(e, "Redis unavailable"), I.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return S.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), Ot(t);
    throw e;
  }
}
function Ur(t) {
  return Lr.parse(t);
}
const ke = tr(er);
class $r {
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
  init(e) {
    e.on("ReplayBufferSaved", async (a) => {
      const r = a.savedReplayPath;
      r && await this.handleReplaySaved(r);
    }), e.on("CurrentProgramSceneChanged", (a) => {
      const r = a.sceneName;
      this.playbackState !== "IDLE" && r !== "Replay Stinger" && r !== "Replay" && (S.info(`Manual scene switch to ${r} detected. Cancelling replay sequence.`), this.playbackState = "IDLE", this.originalScene = null);
    }), e.on("MediaInputPlaybackEnded", async (a) => {
      const r = a.inputName;
      this.playbackState === "STINGER_IN" && r === "Stinger" ? (S.info("Stinger In ended, switching to Replay"), this.playbackState = "REPLAYING", await e.setCurrentScene("Replay"), await e.restartMediaInput("ReplayPlayer")) : this.playbackState === "REPLAYING" && r === "ReplayPlayer" ? (S.info("Replay ended, switching to Stinger Out"), this.playbackState = "STINGER_OUT", await e.setCurrentScene("Replay Stinger"), await e.restartMediaInput("Stinger")) : this.playbackState === "STINGER_OUT" && r === "Stinger" && (S.info("Stinger Out ended, restoring original scene"), this.playbackState = "IDLE", this.originalScene && (await e.setCurrentScene(this.originalScene), this.originalScene = null));
    });
  }
  async triggerSaveReplay(e, a) {
    this.pendingDuration = e;
    const r = await a.saveReplayBuffer();
    return r.ok || (this.pendingDuration = null), r;
  }
  async handleReplaySaved(e) {
    try {
      if (!e || !v.existsSync(e)) {
        S.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      v.existsSync(this.replayFolder) || v.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = P.basename(e), r = P.join(this.replayFolder, a);
      e !== r && (v.copyFileSync(e, r), v.unlinkSync(e));
      let n = 30, i = !1;
      this.pendingDuration !== null && (n = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const f = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${r}"`, u = await ke(f), d = parseFloat(u.stdout.trim());
        !isNaN(d) && !i && (n = Math.round(d));
      } catch (f) {
        S.error(f, "Failed to probe duration of new replay");
      }
      const l = await this.getReplayState(), o = l.currentMatch;
      let m = 0;
      for (const f of l.replays)
        f.replayId > m && (m = f.replayId);
      const c = m + 1, h = `${o},${c},"${r}",0,${n}
`;
      if (!v.existsSync(this.dbFile)) {
        const f = P.dirname(this.dbFile);
        v.existsSync(f) || v.mkdirSync(f, { recursive: !0 }), v.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      v.appendFileSync(this.dbFile, h, "utf-8"), S.info({ newPath: r, currentMatch: o, newReplayId: c }, "Saved new replay");
    } catch (a) {
      S.error(a, "Failed to handle saved replay");
    }
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
        const c = n[m].trim();
        if (!c) continue;
        const h = c.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        h && h[3] === e ? (i.push(`${h[1]},${h[2]},"${h[3]}",${o},${h[5]}`), l = !0) : i.push(c);
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
      const n = (await this.getReplayState()).replays.find((f) => f.file === e), i = n ? n.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await ke(l), m = parseFloat(o.stdout.trim()) || 40, c = Math.max(0, m - i);
      let h = e;
      if (c > 1) {
        v.existsSync(this.playbackDir) || v.mkdirSync(this.playbackDir, { recursive: !0 }), h = P.join(this.playbackDir, "current_replay.mp4");
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
    } catch (r) {
      return S.error(r, "Failed to play replay"), { ok: !1, error: r instanceof Error ? r.message : String(r) };
    }
  }
  async generatePreview(e) {
    try {
      if (!v.existsSync(e))
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
      v.existsSync(P.dirname(this.lastCompletedFile)) || v.mkdirSync(P.dirname(this.lastCompletedFile), { recursive: !0 }), v.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((n) => {
        S.error(n, "Failed to generate highlights in background");
      });
      const r = a + 1;
      return v.writeFileSync(this.matchFile, r.toString(), "utf-8"), S.info(`Advanced to match ${r}`), { ok: !0, currentMatch: r };
    } catch (e) {
      return S.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const r = (await this.getReplayState()).replays.filter((m) => m.match === e && m.favorite);
      if (r.length === 0)
        return S.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      v.existsSync(this.highlightsDir) || v.mkdirSync(this.highlightsDir, { recursive: !0 }), r.sort((m, c) => m.replayId - c.replayId);
      const n = P.join(this.highlightsDir, `concat_${e}.txt`), i = r.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      v.writeFileSync(n, i.join(`
`) + `
`, "utf-8");
      const l = P.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${n}" -c copy "${l}"`;
      return S.info({ cmd: o }, "Generating highlights"), await ke(o), S.info(`Generated highlights: ${l}`), { ok: !0, file: l };
    } catch (a) {
      return S.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
function Br(t) {
  const { app: e, state: a, io: r, broadcast: n, obs: i, opendota: l } = t, o = new $r();
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
      const d = Ur(f.body), g = await a.patchState(d);
      await n.broadcastFull(g), u.json(g);
    } catch (d) {
      S.error(d, "state patch failed"), u.status(400).json({
        error: d instanceof Error ? d.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", k, async (f, u) => {
    const d = Ra(), g = await a.replaceState(d);
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
    k,
    async (f, u) => {
      var w, b;
      const d = m.safeParse(f.body);
      if (!d.success)
        return u.status(400).json({ error: d.error.flatten() });
      const g = ((w = d.data.label) == null ? void 0 : w.trim()) || Z, p = xt(
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
      const g = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, p = (typeof ((A = f.body) == null ? void 0 : A.label) == "string" ? f.body.label.trim() : "") || (g == null ? void 0 : g.label) || Z, y = typeof ((E = f.body) == null ? void 0 : E.seconds) == "number" ? f.body.seconds : Pe(g), w = Ht(y, p), b = await c(w);
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
      const p = (_ = (await a.getState()).timers) == null ? void 0 : _.gameStartCountdown, y = ((A = d.data.label) == null ? void 0 : A.trim()) || (p == null ? void 0 : p.label) || Z, w = p != null && p.running ? xt(d.data.seconds, y) : Ht(d.data.seconds, y), b = await c(w);
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
    i.configure(d.data), r.of(W.PRODUCER).emit(V.ACK, {
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
    r.of(W.PRODUCER).emit(V.ACK, {
      kind: "obs:connect",
      ok: g.ok,
      error: g.error
    }), u.json(g);
  }), e.post("/api/obs/disconnect", k, async (f, u) => {
    await i.disconnect(), r.of(W.PRODUCER).emit(V.ACK, {
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
    r.of(W.PRODUCER).emit(V.ACK, {
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
    const p = await a.getState(), y = g.data.accountId !== void 0 ? ba(
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
      return await n.broadcastFull(A), u.json({ ok: !0, card: _, persisted: A });
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
      return await n.broadcastFull(w), u.json({ ok: !0, upstream: p, matchupCard: y, persisted: w });
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
function Gr() {
  if (!(J != null && J.length)) {
    Le = null;
    return;
  }
  Le = pr(J);
}
async function ee(t) {
  if (se.size > 0) return se;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (J = e.data, se = new Map(J.map((a) => [a.id, a])), Gr()), se;
}
function Te(t) {
  if (Le) return yr(t, Le);
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
function Kr(t) {
  return Te(t).slug;
}
function Vr(t, e) {
  const a = Te({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const r = se.get(t);
  if (r)
    return U(r.name) || void 0;
}
function be(t, e) {
  return gr(
    Vr(t, e)
  );
}
function Wr(t, e) {
  return be(t, e).heroPortraitUrl;
}
function q(t) {
  const e = se.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function qr(t) {
  if (t)
    return pa(t);
}
function K(t, e) {
  return t.find((a) => a.steam32 === e);
}
function Yr() {
  return J ? [...J].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function zr() {
  var e;
  const t = (e = I.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function Jr(t, e) {
  var l, o, m, c;
  const a = (l = I.STEAM_WEB_API_KEY) == null ? void 0 : l.trim();
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
      typeof w.match_id == "number" && w.match_id > 0 && r.push(w.match_id);
    const y = (c = p[p.length - 1]) == null ? void 0 : c.match_id;
    if (y === void 0 || p.length < 100) break;
    n = y - 1;
  }
  const i = [...new Set(r)].slice(0, e);
  return S.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function Qr(t, e = 80) {
  var o, m;
  const a = zr(), r = [];
  if (!((o = I.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let n = [];
  if ((m = I.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      n = await Jr(t, e);
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
const Xr = 10;
function Ut(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function $t(t) {
  return t !== void 0 && t < 128;
}
function Zr(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function en(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (n) => Zr(n.account_id) && typeof n.lane == "number" && n.lane > 0 && !n.is_roaming
  ), r = [...new Set(a.map((n) => n.lane))];
  for (const n of r) {
    const i = a.filter((d) => d.lane === n), l = i.filter((d) => $t(d.player_slot)), o = i.filter((d) => !$t(d.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...l.map(Ut)), c = Math.max(0, ...o.map(Ut)), h = m - c;
    let f;
    Math.abs(h) <= Xr ? f = "draw" : f = h > 0 ? "win" : "loss";
    const u = f === "draw" ? "draw" : f === "win" ? "loss" : "win";
    for (const d of l) e.set(d.account_id, f);
    for (const d of o) e.set(d.account_id, u);
  }
  return e;
}
function tn(t, e, a) {
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
  for (const r of Fe())
    if (Nt(P.join(r, `league_${e}_heroes.csv`)))
      return r;
  for (const r of Fe())
    if (Nt(r)) return r;
  return Fe()[0];
}
function Bt(t) {
  const e = Y(), a = we(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function Gt(t, e) {
  const a = Y(), r = we(t);
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
    return await ar(t), !0;
  } catch {
    return !1;
  }
}
function an(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function rn(t) {
  const e = [];
  let a = "", r = !1;
  for (let n = 0; n < t.length; n++) {
    const i = t[n];
    r ? i === '"' ? t[n + 1] === '"' ? (a += '"', n++) : r = !1 : a += i : i === '"' ? r = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function Kt(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(rn);
}
function L(t, e, a = 0) {
  const r = Number(t[e]);
  return Number.isFinite(r) ? r : a;
}
function Ie(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function nn(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, r = t.assists ?? 0;
  return !(e === 0 && a === 0 && r === 0 || (t.leaver_status ?? 0) >= 3);
}
function La(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function sn(t) {
  return t.filter((e) => !La(e));
}
function Ta(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || La(a)) continue;
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
async function on(t) {
  const e = we(t);
  if (!await ue(e.heroes))
    return null;
  try {
    const a = await Ee(e.heroes, "utf8"), r = Kt(a);
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
      const o = await Ee(e.playerHeroes, "utf8"), m = Kt(o);
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
      i = sn(i);
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
    return { heroIndex: n, playerHeroes: i, meta: l };
  } catch (a) {
    return S.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function ln(t) {
  const { leagueId: e } = t.meta, a = we(e);
  await ma(a.dir, { recursive: !0 });
  const n = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, c) => m.heroId - c.heroId
  ))
    n.push(
      [
        o.heroId,
        an(o.heroName ?? ""),
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
const cn = 4294967295;
function un(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= cn))
    return e;
}
class dn {
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
      await ee(a);
      const o = await Qr(e, r), m = o.matchIds;
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
        ), n == null || n(this.getProgress());
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
    const r = e.radiant_win === !0, n = en(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = un(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && r || i.player_slot !== void 0 && i.player_slot >= 128 && !r, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, nn(i) && this.trackPlayerHero(l, i.hero_id, o, i, n.get(l));
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
    const a = ir(e);
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
const F = new dn();
async function mn(t) {
  const { leagueId: e, state: a, broadcast: r, source: n } = t, i = n === "csv" ? await on(e) : null;
  if (!i) return !1;
  F.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: Ta(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: n,
      statsCsvDir: Y()
    }
  });
  return await r.broadcastFull(l), !0;
}
async function Je(t) {
  const e = await mn({ ...t, source: "csv" });
  return e && S.info(
    { leagueId: t.leagueId, dir: Y() },
    "League stats loaded from CSV"
  ), e;
}
async function Na(t) {
  const { leagueId: e, state: a, opendota: r, broadcast: n } = t;
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
  await n.broadcastFull(i);
  try {
    const l = await F.aggregateLeague(
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
    ), o = F.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await ln({
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
      playerHeroIndex: Ta(
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
    await n.broadcastFull(c), S.info(
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
    await n.broadcastFull(m);
  }
}
async function gn(t) {
  var u, d, g, p;
  const { state: e, opendota: a, broadcast: r } = t, n = I.LEAGUE_ID, i = await e.getState();
  if ((((u = i.leagueConfig) == null ? void 0 : u.leagueId) !== n || ((d = i.leagueConfig) == null ? void 0 : d.leagueId) === null || ((g = i.leagueConfig) == null ? void 0 : g.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: n, aggregationStatus: "idle" }
  }), await Je({
    leagueId: n,
    state: e,
    broadcast: r
  })) return;
  const c = ((p = (await e.getState()).leagueConfig) == null ? void 0 : p.aggregationStatus) === "ready", h = F.getProgress().status === "ready";
  I.LEAGUE_AUTO_AGGREGATE && (!c || !h) && F.getProgress().status !== "running" ? (S.info({ leagueId: n }, "Starting league aggregation (Steam match list + OpenDota details)"), Na({ leagueId: n, state: e, opendota: a, broadcast: r })) : S.info(
    { leagueId: n, dir: Y() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function Vt() {
  return {
    leagueId: I.LEAGUE_ID,
    autoAggregate: I.LEAGUE_AUTO_AGGREGATE,
    statsDir: Y()
  };
}
class ve extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function fn(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && F.getProgress().status === "ready";
}
function ie(t) {
  var a, r;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new ve(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new ve(
      ((r = t.leagueConfig) == null ? void 0 : r.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!fn(t))
    throw new ve(
      "League stats not ready — run tournament aggregate first"
    );
}
function Ma(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function hn(t) {
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
        p.startsWith("http://") || p.startsWith("https://") ? g = p : d = Ma(p);
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
function pn(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function yn(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (r) => [
      r.displayName,
      String(r.steam32),
      r.teamName ?? "",
      r.teamKey ?? "",
      r.teamColor ?? "",
      r.avatarUrl ?? ""
    ].map(pn).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function Wt(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function Qe(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const r = a.teamKey ?? bn(a.teamName ?? "unknown"), n = a.teamName ?? Sn(r), i = e.get(r);
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
function he(t) {
  return pa(t);
}
function bn(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Sn(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
function qt(t, e, a) {
  return t && t.map((r) => {
    if (r.type !== "pick") return r;
    const n = He(a.matchSetup, e, r.order), i = br(a, e, r.order);
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
function wn(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: qt(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: qt(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Yt(t, e, a) {
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
      logoUrlA: he(r.teamKey),
      logoUrlB: he(n.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: r.teamName,
      logoUrl: he(r.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: n.teamName,
      logoUrl: he(n.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const zt = /* @__PURE__ */ new Map();
async function xa(t, e) {
  var l, o, m;
  if (e <= 0) return;
  const a = zt.get(e);
  if (a) return a;
  const r = await t.playerProfile(e);
  if (!r.ok || !r.data) return;
  const n = r.data, i = ((l = n.profile) == null ? void 0 : l.avatarfull) ?? n.avatarfull ?? ((o = n.profile) == null ? void 0 : o.avatarmedium) ?? n.avatarmedium ?? ((m = n.profile) == null ? void 0 : m.avatar) ?? n.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return zt.set(e, i), i;
}
async function Jt(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var r;
      if ((r = a.avatarUrl) != null && r.trim()) return a;
      try {
        const n = await xa(e, a.steam32);
        return n ? { ...a, avatarUrl: n } : a;
      } catch (n) {
        return S.warn({ err: n, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
const Ze = P.join(process.cwd(), "steam32-vanity-cache.json");
let re = null;
function _n() {
  if (re) return re;
  try {
    if (v.existsSync(Ze))
      return re = JSON.parse(v.readFileSync(Ze, "utf-8")), S.info({ count: Object.keys(re).length }, "[steam32] Loaded vanity cache from disk"), re;
  } catch {
  }
  return re = {}, re;
}
function kn(t) {
  try {
    v.writeFileSync(Ze, JSON.stringify(t, null, 2));
  } catch (e) {
    S.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function In(t, e) {
  return new Promise((a) => {
    const r = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    ga.get(r, (n) => {
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
async function Cn(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const r = t.match(/\/id\/([^/?#]+)/);
  if (r != null && r[1]) {
    const n = r[1].trim().toLowerCase(), i = _n();
    if (i[n] != null)
      return S.debug({ vanity: n, steam32: i[n] }, "[steam32] Cache hit"), i[n];
    if (!e)
      return S.warn({ vanity: n }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await In(n, e);
    return l != null && l > 0 ? (i[n] = l, kn(i), S.info({ vanity: n, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : S.warn({ vanity: n }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return S.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function oe(t) {
  return new Promise((e, a) => {
    ga.get(t, (r) => {
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
async function An(t) {
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
  const r = [];
  for (const l of a) {
    const o = l.name.trim(), m = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), c = Ma(l.accentColor) || "#ffffff";
    for (const h of l.players || [])
      r.push({ teamName: o, teamKey: m, teamColor: c, player: h });
  }
  S.info({ total: r.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const n = await Promise.all(
    r.map(
      ({ player: l }) => Cn(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < r.length; l++) {
    const { teamName: o, teamKey: m, teamColor: c, player: h } = r[l], f = n[l], u = h.displayName || h.name || "Player", d = h.roles || [], g = h.mmr;
    f != null && f > 0 ? i.push({ displayName: u, steam32: f, teamName: o, teamKey: m, teamColor: c, roles: d, mmr: g }) : S.warn({ displayName: u, url: h.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return S.info({ count: i.length, total: r.length }, "Completed roster sync from bpcleague.in"), i;
}
async function En(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  S.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let r;
    e === "latest" || e === "active" ? r = await oe("https://api.bpcleague.in/api/public/tournament") : r = await oe(`https://api.bpcleague.in/api/public/seasons/${e}`);
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
async function Pn() {
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
async function vn(t) {
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
function Ha(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function Se(t, e) {
  return `${t}W / ${e}L`;
}
function Ne(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, r = t.laneLosses ?? 0;
  return e + a + r === 0 ? null : {
    label: "Lane",
    value: tn(e, a, r),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function ja(t, e, a) {
  var n;
  const r = (n = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : n.avatarUrl;
  return r != null && r.trim() ? r : xa(t, e);
}
function Rn(t) {
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
function Dn(t, e, a, r) {
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
          sublabel: `${O(r.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: O(r.winRate),
          sublabel: Se(r.wins, r.losses)
        }
      ] : []
    ];
  const n = a.games - a.wins, i = `${Q(a.avgKills)} / ${Q(a.avgDeaths)} / ${Q(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: Se(a.wins, n),
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
      value: Ha(a.avgHeroDamage),
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
        sublabel: `${O(r.pickRate)} pick · ${O(r.winRate)} WR`
      }
    ] : []
  ];
}
function Ln(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, r = `${Q(e.avgKills)} / ${Q(e.avgDeaths)} / ${Q(e.avgAssists)}`;
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
      sublabel: `${r} per game`
    },
    {
      label: "Hero damage",
      value: Ha(e.avgHeroDamage),
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
function Fa(t) {
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
  const r = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, n = r.heroName ?? q(e), i = be(e, n);
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
    statSlides: Rn(r),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function ye(t, e, a, r, n, i, l) {
  await ee(t);
  const o = ba(
    l,
    e,
    a
  ), m = n[String(a)], c = q(a), h = be(a, c), f = await ja(
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
    playerHero: Fa(o),
    statSlides: Dn(r, c, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function Tn(t, e) {
  return Ke(e, t);
}
async function Oa(t, e, a, r, n) {
  await ee(t);
  const i = Tn(e, r), l = await ja(
    t,
    e,
    n
  ), o = K(n ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: qr(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: Fa(i),
    statSlides: Ln(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Ua(t, e, a) {
  await ee(t);
  const r = await t.matchupBetween(e, a), n = r.ok && r.data && typeof r.data == "object" ? r.data : {}, i = typeof n.games_played == "number" ? n.games_played : void 0, l = typeof n.wins == "number" ? n.wins : typeof n.win == "number" ? n.win : void 0, o = q(e) || `Hero ${e}`, m = q(a) || `Hero ${a}`, c = l ?? 0, h = i !== void 0 ? i - c : 0;
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
      value: O((r = t.tournament) == null ? void 0 : r.winRate),
      sublabel: t.tournament ? Se(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((n = t.tournament) == null ? void 0 : n.picks) ?? "—"),
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
async function Nn(t) {
  return await ee(t), Yr();
}
class Mn {
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
    var e, a, r, n, i, l;
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
          const g = h[Math.floor(Math.random() * h.length)], p = await Oa(
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
            ...((n = (r = o.draft) == null ? void 0 : r.radiant) == null ? void 0 : n.slots) ?? [],
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
          const w = await Ua(this.opendota, p, y), b = await this.state.patchState({
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
const ne = new Mn();
function Ce(t, e) {
  return e instanceof ve ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function xn(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  ne.configure({}, { state: a, opendota: n, broadcast: r }), e.get("/api/league/info", k, async (l, o) => {
    var h;
    const m = await a.getState(), c = await ge(I.LEAGUE_ID);
    o.json({
      ...Vt(),
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
    await r.broadcastFull(f), o.json({ ok: !0, leagueConfig: f.leagueConfig });
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
    }), Na({
      leagueId: ((h = m.leagueConfig) == null ? void 0 : h.leagueId) ?? I.LEAGUE_ID,
      state: a,
      opendota: n,
      broadcast: r
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
        broadcast: r
      })) {
        const u = await ge(m ?? I.LEAGUE_ID), d = u.heroesExists ? Gt(m ?? I.LEAGUE_ID, u) : { ...Bt(m ?? I.LEAGUE_ID), statsStorage: u };
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
        statsDir: Vt().statsDir,
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
    const h = hn(c.data.csv), f = await Jt(h, n), u = Wt(f), d = await a.patchState({
      leagueConfig: { roster: f, teamColors: u, leagueId: I.LEAGUE_ID }
    });
    await r.broadcastFull(d), o.json({ ok: !0, count: f.length, teamColors: u, roster: f });
  }), e.post("/api/roster/sync-bpcleague", k, async (l, o) => {
    var h, f;
    const c = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    try {
      const u = c.data.seasonSlug || "season-1", d = await An({
        seasonSlug: u,
        steamApiKey: I.STEAM_WEB_API_KEY
      }), g = await Jt(d, n), p = Wt(g), y = I.ROSTER_CSV_PATH;
      await ma(P.dirname(y), { recursive: !0 });
      const w = yn(g);
      await Ae(y, w, "utf8");
      const b = await vn(u);
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
      await r.broadcastFull(E), o.json({ ok: !0, count: g.length, teamColors: p, roster: g });
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
    const m = _a.safeParse(l.body);
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
      const w = Yt(
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
      await r.broadcastFull(b), o.json({
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
        broadcast: r
      })) {
        const x = f.heroesExists ? Gt(h, f) : { ...Bt(h), statsStorage: f };
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
      const m = s.object({ pickPlayers: wa.optional() }).safeParse(l.body ?? {});
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
      }, y = wn(u, p), w = await a.patchState({
        leagueConfig: { matchSetup: g },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await r.broadcastFull(w), o.json({
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
      h && c.length > 0 && (u = Yt(
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
  ), e.post("/api/league/team-colors", k, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", k, async (l, o) => {
    const m = await Nn(n);
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
    }, d = await Oa(
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
  ), e.post("/api/stats/matchup", k, async (l, o) => {
    const c = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error });
    await a.getState();
    const h = await Ua(
      n,
      c.data.heroAId,
      c.data.heroBId
    );
    if (c.data.persist) {
      const f = await a.patchState({ matchupCard: h });
      return await r.broadcastFull(f), o.json({ ok: !0, card: h, persisted: f });
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
      const x = C.side === "dire" || C.side === "B" ? "dire" : "radiant", H = x === "radiant" ? (b = (w = h.draft) == null ? void 0 : w.radiant) == null ? void 0 : b.slots : (A = (_ = h.draft) == null ? void 0 : _.dire) == null ? void 0 : A.slots, $ = ya(x, C.heroId, H), j = $ !== void 0 ? He((E = h.leagueConfig) == null ? void 0 : E.matchSetup, x, $) : void 0, z = j != null && j > 0 ? K(f, j) : void 0;
      u = z && j ? await ye(
        n,
        j,
        C.heroId,
        z.displayName,
        h.tournamentHeroIndex ?? {},
        f,
        h.playerHeroIndex
      ) : await pe(
        n,
        C.heroId,
        h.tournamentHeroIndex ?? {}
      );
    } else if (c.data.type === "player-hero") {
      if (c.data.heroId === void 0 || c.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const C = K(f, c.data.steam32);
      u = await ye(
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
      u = await pe(
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
  }), e.post("/api/stats/stop", k, async (l, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await r.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", k, async (l, o) => {
    const c = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!c.success)
      return o.status(400).json({ error: c.error.flatten() });
    const h = await a.patchState({ production: c.data });
    await r.broadcastFull(h), o.json(h.production);
  }), e.get("/api/league/bpc-matches", k, async (l, o) => {
    const m = l.query.seasonSlug, c = await En(m);
    o.json(c);
  }), e.get("/api/league/bpc-seasons", k, async (l, o) => {
    const m = await Pn();
    o.json(m);
  }), e.get("/api/autopilot/config", k, (l, o) => {
    o.json({
      config: ne.getConfig(),
      isActive: ne.isActive()
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
    ne.configure(c.data), o.json({
      config: ne.getConfig(),
      isActive: ne.isActive()
    });
  }), e.post("/api/autopilot/trigger", k, async (l, o) => {
    await ne.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
const Hn = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function R(t) {
  return t && typeof t == "object" ? t : null;
}
function et(t) {
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
function Re(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const Qt = /* @__PURE__ */ new Set();
function jn() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function Fn(t, e, a, r) {
  jn() && (Qt.has(t) || (Qt.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: r.slug,
    source: r.source
  })));
}
function On(t, e, a, r) {
  const n = Te({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  r && Fn(r, t, e, n);
  const i = n.slug ?? Kr({ heroId: t, heroClass: e });
  if (i)
    return { ...hr(i), slug: i };
  if (t) {
    const l = Wr(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: Te({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Xt(t, e) {
  if (t) return q(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function Zt(t, e, a) {
  const r = `${e}${a}`, n = M(t[`${r}_id`]), i = Re(t[`${r}_class`]);
  if (!n && !i)
    return null;
  const l = {};
  return n > 0 && (l.hero_id = n), i && (l.class = i), l;
}
function ea(t, e) {
  var i;
  const a = [], r = /* @__PURE__ */ new Set(), n = (l, o, m, c) => {
    const h = `${l}-${o}`;
    if (r.has(h) || (r.add(h), !m && !c)) return;
    const f = On(
      m,
      c,
      Xt(m, c),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: m,
      heroName: Xt(m, c),
      heroPortraitSlug: f.slug,
      heroPortraitUrl: f.staticUrl,
      heroPortraitAnimatedUrl: f.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(l);
    if (!m) continue;
    const c = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", h = Number(m[2]), f = et(o), u = R(o), d = Re((u == null ? void 0 : u.class) ?? (u == null ? void 0 : u.hero_class));
    n(c, h, f, d);
  }
  for (let l = 0; l < 7; l++) {
    const o = Zt(t, "ban", l);
    o && n(
      "ban",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      Re(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = Zt(t, "pick", l);
    o && n(
      "pick",
      l,
      M(o.hero_id) > 0 ? M(o.hero_id) : null,
      Re(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function ta(t, e) {
  return (e === "radiant" ? R(t.radiant) ?? R(t.team2) : R(t.dire) ?? R(t.team3)) ?? {};
}
function Un(t) {
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
function $n(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function Bn(t, e) {
  const a = R(t.team2), r = R(t.team3), n = M(t.radiant_bonus_time) || M(a == null ? void 0 : a.bonus_time), i = M(t.dire_bonus_time) || M(r == null ? void 0 : r.bonus_time);
  return e === "radiant" ? n : e === "dire" ? i : Math.max(n, i);
}
const aa = 7, ra = 5;
function X(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function Me(t, e) {
  return X(t, "pick") >= ra && X(e, "pick") >= ra;
}
function tt(t, e) {
  return X(t, "ban") > 0 || X(e, "ban") > 0 || X(t, "pick") > 0 || X(e, "pick") > 0;
}
function Gn(t, e, a) {
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
function Kn(t, e, a, r, n) {
  if (!t || Me(a, r))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !tt(a, r) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !tt(a, r) && !n)
    return "starting";
  const i = X(a, "ban"), l = X(r, "ban");
  return i < aa || l < aa ? "bans" : "picks";
}
function na(t) {
  const e = R(t);
  if (!e) return null;
  const a = R(e.hero);
  if (a) {
    const r = et(a);
    if (r) return r;
  }
  return et(t);
}
function Vn(t, e) {
  const a = /* @__PURE__ */ new Map(), r = R(t.player), n = R(t.hero), i = e === "radiant" ? R(n == null ? void 0 : n.team2) ?? R(n == null ? void 0 : n.radiant) : R(n == null ? void 0 : n.team3) ?? R(n == null ? void 0 : n.dire), l = e === "radiant" ? R(r == null ? void 0 : r.team2) ?? R(r == null ? void 0 : r.radiant) : R(r == null ? void 0 : r.team3) ?? R(r == null ? void 0 : r.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const c = /^player(\d+)$/i.exec(o);
      if (!c) continue;
      const h = Number(c[1]) % 5, f = na(m);
      if (f && f > 0 && Number.isFinite(h)) {
        let u;
        if (l) {
          const d = R(l[o]);
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
      const u = na(m);
      if (u && u > 0 && Number.isFinite(h)) {
        const d = R(m);
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
function sa(t, e, a) {
  const r = Array.from(Vn(a, e).values());
  return t.map((n) => {
    if (n.type !== "pick" || !n.heroId) return n;
    const i = r.find((l) => l.heroId === n.heroId);
    return i ? {
      ...n,
      steam32: i.steam32 ?? n.steam32
    } : n;
  });
}
const Wn = [
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
], qn = [
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
function oa(t, e, a) {
  const n = (a === "dire_first_pick" ? qn : Wn).findIndex((i) => i.side === t && i.order === e);
  return n >= 0 ? n : e;
}
function ia(t, e) {
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
function la(t, e) {
  let a = t[0], r = oa(a.side, a.slot.order, e);
  for (const n of t.slice(1)) {
    const i = oa(n.side, n.slot.order, e);
    i > r && (a = n, r = i);
  }
  return a;
}
function Yn(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function zn(t, e, a) {
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
      const p = ia(u, g);
      p && n.add(p);
    }
  }
  const i = r.filter(
    ({ side: u, slot: d }) => !n.has(ia(u, d))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (Me(t, e) && a && !Me(((h = a.radiant) == null ? void 0 : h.slots) ?? [], ((f = a.dire) == null ? void 0 : f.slots) ?? [])) {
      const u = la(r, l), d = Oe(u.side, u.slot);
      if (Yn(a.lastPick, d)) return d;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const u = i[0];
    return Oe(u.side, u.slot);
  }
  const o = la(i, l);
  return Oe(o.side, o.slot);
}
function ca(t, e, a, r, n) {
  var o, m;
  if (!t)
    return {
      name: r,
      logoUrl: e === "radiant" ? ((o = n == null ? void 0 : n.radiant) == null ? void 0 : o.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlA) : ((m = n == null ? void 0 : n.dire) == null ? void 0 : m.logoUrl) ?? (n == null ? void 0 : n.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = Xe(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: he(l.teamKey)
  } : { name: r };
}
function Jn(t, e, a, r) {
  var z, de;
  const n = R(t.map), i = typeof (n == null ? void 0 : n.game_state) == "string" ? n.game_state : "", l = Hn.has(i), o = R(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (n == null ? void 0 : n.team_name_radiant) == "string" ? n.team_name_radiant : "Radiant", c = typeof (n == null ? void 0 : n.team_name_dire) == "string" ? n.team_name_dire : "Dire", h = ca(
    r,
    "radiant",
    a,
    m,
    e
  ), f = ca(
    r,
    "dire",
    a,
    c,
    e
  ), u = o ?? {}, d = ta(u, "radiant"), g = ta(u, "dire");
  let p = ea(d, "radiant"), y = ea(g, "dire");
  Me(p, y) && (p = sa(p, "radiant", t), y = sa(y, "dire", t));
  const b = o ? Un(u) : null, _ = M(
    u.activeteam_time_remaining ?? u.active_team_time_remaining
  ), A = o ? $n(u) : void 0, E = o ? Bn(u, b) : 0, C = [
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
  ], x = zn(p, y, e), H = Kn(
    l,
    i,
    p,
    y,
    b
  );
  let $ = Gn(n, i, u);
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
      bonusTime: Math.max(0, Math.round(M(u.radiant_bonus_time) || M((z = R(u.team2)) == null ? void 0 : z.bonus_time) || 0))
    },
    dire: {
      name: f.name,
      logoUrl: f.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(M(u.dire_bonus_time) || M((de = R(u.team3)) == null ? void 0 : de.bonus_time) || 0))
    },
    picksBansOrder: C,
    lastPick: x
  };
  return { inDraft: l || !!o, draftPatch: j };
}
const xe = {};
let ua = !1;
async function Qn() {
  if (ua) return;
  ua = !0;
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
        const r = await a.json(), n = {};
        for (const i of r) {
          if (!i.hero_id || !i.time || !i.games) continue;
          const l = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          n[l] || (n[l] = { sum: 0, totalGames: 0 }), n[l].sum += o * m, n[l].totalGames += m;
        }
        xe[e] = {};
        for (const [i, l] of Object.entries(n))
          l.totalGames > 0 && (xe[e][Number(i)] = Math.round(l.sum / l.totalGames));
        S.debug({ item: e, heroesIndexed: Object.keys(n).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        S.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    S.info("Finished preloading average item timings.");
  })();
}
function Xn(t, e) {
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
function Zn(t, e, a) {
  var r, n;
  try {
    return ((n = (r = t == null ? void 0 : t.items) == null ? void 0 : r[e]) == null ? void 0 : n[a]) || {};
  } catch {
    return {};
  }
}
function es(t, e, a) {
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
function ts(t, e, a) {
  var r, n, i;
  try {
    return ((i = (n = (r = t == null ? void 0 : t.player) == null ? void 0 : r[e]) == null ? void 0 : n[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function as(t, e) {
  var n;
  if (!(t != null && t.items)) return;
  const a = ((n = t == null ? void 0 : t.map) == null ? void 0 : n.clock_time) || 0;
  if (a < 0) return;
  const r = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, c = Zn(t, i, m), h = ts(t, i, m);
      if (!h || h === "Unknown Player") continue;
      Ue.has(h) || Ue.set(h, /* @__PURE__ */ new Set());
      const f = Ue.get(h), u = /* @__PURE__ */ new Set();
      for (const d in c) {
        const g = (l = c[d]) == null ? void 0 : l.name;
        g && g !== "empty" && u.add(g);
      }
      for (const d of u)
        if (!f.has(d) && (f.add(d), at[d])) {
          const g = es(t, i, m), p = g.id > 0 ? q(g.id) : g.name, y = at[d], w = Xn(g.id, d);
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
  r("team2"), r("team3");
}
function rs(t) {
  if (!t || typeof t != "object") return null;
  const e = t.player, a = t.hero;
  if (e && typeof e == "object" && a && typeof a == "object" && e.accountid && (a.hero_id || a.heroid || a.id)) {
    const n = parseInt(String(e.accountid), 10), i = a.hero_id ?? a.heroid ?? a.id;
    let l = null;
    if (typeof i == "number" && i > 0)
      l = i;
    else if (typeof i == "string") {
      const o = Number(i);
      Number.isFinite(o) && o > 0 && (l = o);
    }
    if (Number.isFinite(n) && n > 0 && l) {
      let o = "Unknown";
      return typeof e.name == "string" && (o = e.name), { steam32: n, heroId: l, playerName: o };
    }
  }
  const r = (n) => {
    var o, m;
    const i = (o = t.hero) == null ? void 0 : o[n], l = (m = t.player) == null ? void 0 : m[n];
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
  return r("team2") || r("team3");
}
let ce = 0, $e = null;
function ns(t) {
  const { app: e, state: a, broadcast: r, opendota: n, io: i } = t;
  e.post("/gsi", async (l, o) => {
    var y, w;
    const m = typeof l.query.token == "string" ? l.query.token : void 0;
    if (I.GSI_TOKEN && m !== I.GSI_TOKEN) {
      o.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const c = l.body;
    ce = Date.now(), await ee(n);
    try {
      as(c, i);
    } catch (b) {
      S.error(b, "Power spike evaluation failed");
    }
    const h = await a.getState(), f = ((y = h.leagueConfig) == null ? void 0 : y.roster) ?? [], u = ((w = h.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, d = Jn(
      c,
      h.draft ?? null,
      f,
      u
    ), g = rs(c);
    g && (d.focusedPlayerSteam32 = g.steam32, d.focusedPlayerHeroId = g.heroId, d.focusedPlayerName = g.playerName);
    const p = async () => {
      var j, z, de, N, ot, it, lt, ct, ut, dt, mt, gt, ft, ht, pt, yt, bt, St, wt, _t, kt, It, Ct, At, Et, Pt, vt, Rt, Dt, Lt;
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
        tormentorRadiant: (ut = (ct = (lt = c == null ? void 0 : c.game) == null ? void 0 : lt.pits) == null ? void 0 : ct.find((T) => T.team === "radiant")) == null ? void 0 : ut.state,
        tormentorDire: (gt = (mt = (dt = c == null ? void 0 : c.game) == null ? void 0 : dt.pits) == null ? void 0 : mt.find((T) => T.team === "dire")) == null ? void 0 : gt.state,
        radiantScanActive: A === 0,
        direScanActive: E === 0,
        radiantGlyphActive: C === 0,
        direGlyphActive: x === 0
      }, g) {
        const T = d.focusedPlayerSteam32, B = d.focusedPlayerHeroId, je = d.focusedPlayerName;
        if (T && B) {
          const me = ((ft = b.livePlayerCard) == null ? void 0 : ft.steam32) !== T || ((ht = b.livePlayerCard) == null ? void 0 : ht.heroId) !== B, te = ((pt = b.overlayVisibility) == null ? void 0 : pt.liveplayercard) !== "visible";
          if (me || te) {
            const G = K(f, T), _e = (G == null ? void 0 : G.displayName) || je || "Unknown";
            _ = {
              ..._,
              ...me ? {
                livePlayerCard: {
                  steam32: T,
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
        const T = ((yt = b.overlayVisibility) == null ? void 0 : yt.liveplayercard) === "visible", B = b.livePlayerCard !== null && b.livePlayerCard !== void 0;
        (T || B) && (_ = {
          ..._,
          livePlayerCard: null,
          overlayVisibility: {
            ..._.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const H = await a.patchState(_);
      await r.broadcastFull(H);
      const $ = ((bt = d.draftPatch) == null ? void 0 : bt.lastPick) && (!((St = b.draft) != null && St.lastPick) || d.draftPatch.lastPick.heroId !== b.draft.lastPick.heroId || d.draftPatch.lastPick.side !== b.draft.lastPick.side);
      if ((wt = b.production) != null && wt.autoShowStatsOnPick && $) {
        try {
          ie(b);
        } catch {
          return;
        }
        const T = (_t = d.draftPatch) == null ? void 0 : _t.lastPick;
        if (!T) return;
        const B = T.side === "dire" || T.side === "B" ? "dire" : "radiant", je = B === "radiant" ? ((It = (kt = d.draftPatch) == null ? void 0 : kt.radiant) == null ? void 0 : It.slots) ?? ((At = (Ct = b.draft) == null ? void 0 : Ct.radiant) == null ? void 0 : At.slots) : ((Pt = (Et = d.draftPatch) == null ? void 0 : Et.dire) == null ? void 0 : Pt.slots) ?? ((Rt = (vt = b.draft) == null ? void 0 : vt.dire) == null ? void 0 : Rt.slots), me = ya(B, T.heroId, je), te = me !== void 0 ? He((Dt = b.leagueConfig) == null ? void 0 : Dt.matchSetup, B, me) : void 0, G = ((Lt = b.leagueConfig) == null ? void 0 : Lt.roster) ?? [], _e = te != null && te > 0 ? K(G, te) : void 0, Tt = _e && te ? await ye(
          n,
          te,
          T.heroId,
          _e.displayName,
          b.tournamentHeroIndex ?? {},
          G,
          b.playerHeroIndex
        ) : await pe(
          n,
          T.heroId,
          b.tournamentHeroIndex ?? {}
        ), $a = st(Tt), Ba = Date.now() + 12e3, Ga = await a.patchState({
          heroStatsCard: Tt,
          statCarousel: $a,
          overlayVisibility: {
            herostats: { mode: "timed", until: Ba }
          }
        });
        await r.broadcastFull(Ga);
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
function ss(t, e, a) {
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
function da(t, e) {
  var n, i;
  const a = e.handshake;
  let r = "";
  return typeof ((n = a.auth) == null ? void 0 : n.token) == "string" ? r = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (r = a.query.token), r ? r === I.BROADCAST_SECRET : t === "overlay";
}
async function os(t) {
  const { state: e, obs: a, opendota: r } = t, n = fe();
  n.use(Qa({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), n.disable("x-powered-by"), n.use(
    Ja({
      origin: I.NODE_ENV === "production" ? Mt() : !0,
      credentials: !0
    })
  ), n.use(fe.json({ limit: "1mb" }));
  const i = P.dirname(rt(import.meta.url)), l = P.join(i, "../../overlay-web/dist"), o = P.join(i, "../../admin-web/dist");
  n.use("/overlay", fe.static(l)), n.use("/admin", fe.static(o)), n.get("/admin", (g, p) => {
    const y = P.join(o, "index.html");
    p.sendFile(y, (w) => {
      w && p.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), n.get("/admin/*", (g, p, y) => {
    if (g.path.includes(".")) return y();
    const w = P.join(o, "index.html");
    p.sendFile(w, (b) => {
      b && p.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  }), n.get("/overlay", (g, p) => {
    const y = P.join(l, "index.html");
    p.sendFile(y, (w) => {
      w && p.status(500).send(`sendFile error for ${y}: ${w.message}`);
    });
  }), n.get("/overlay/*", (g, p, y) => {
    if (g.path.includes(".")) return y();
    const w = P.join(l, "index.html");
    p.sendFile(w, (b) => {
      b && p.status(500).send(`sendFile error for ${w}: ${b.message}`);
    });
  });
  const m = Xa.createServer(n), c = new Za(m, {
    cors: I.NODE_ENV === "production" ? { origin: Mt() } : { origin: !0 },
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
  Br({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    obs: a,
    opendota: r
  }), xn({
    app: n,
    state: e,
    io: c,
    broadcast: h,
    opendota: r
  }), ns({
    app: n,
    state: e,
    broadcast: h,
    opendota: r,
    io: c
  }), ss(e, h);
  const f = c.of(W.PRODUCER), u = c.of(W.OVERLAY);
  f.use((g, p) => {
    const y = da("producer", g);
    p(y ? void 0 : new Error("unauthorized producer"));
  }), u.use((g, p) => {
    const y = da("overlay", g);
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
  return { app: n, httpServer: m, io: c, broadcast: h };
}
async function is() {
  const t = await Or(), e = new sr(), a = new lr();
  I.REDIS_URL && a.attachRedis(I.REDIS_URL), ee(a).catch(
    (i) => S.warn(i, "hero registry preload deferred")
  ), Qn().catch(
    (i) => S.warn(i, "item timings preload deferred")
  );
  const r = await os({ state: t, obs: e, opendota: a });
  await gn({
    state: t,
    opendota: a,
    broadcast: r.broadcast
  }), r.httpServer.listen(I.PORT, () => {
    S.info(
      { port: I.PORT, leagueId: I.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const n = async () => {
    var i;
    S.info("Shutting down"), await r.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), r.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void n()), process.on("SIGTERM", () => void n()), { obs: e, opendota: a, state: t, shutdown: n };
}
process.argv[1] && rt(import.meta.url) === process.argv[1] && is().catch((t) => {
  S.error(t, "fatal startup"), process.exit(1);
});
export {
  is as bootstrapBroadcastServer
};

var ur = Object.defineProperty;
var dr = (t, e, a) => e in t ? ur(t, e, { enumerable: !0, configurable: !0, writable: !0, value: a }) : t[e] = a;
var D = (t, e, a) => dr(t, typeof e != "symbol" ? e + "" : e, a);
import R from "node:path";
import { fileURLToPath as Gt } from "node:url";
import { config as mr } from "dotenv";
import { z as s } from "zod";
import { logger as b } from "./logger-pykWGsbv.js";
import gr from "obs-websocket-js";
import fr from "bottleneck";
import { Redis as Kt } from "ioredis";
import hr from "cors";
import Me from "express";
import pr from "helmet";
import yr from "node:http";
import { Server as br } from "socket.io";
import * as Sr from "node:fs";
import N, { existsSync as Ba } from "node:fs";
import { mkdir as Ln, writeFile as Ye, access as wr, readFile as ze } from "node:fs/promises";
import { exec as _r } from "node:child_process";
import { promisify as kr } from "node:util";
import Nn from "node:https";
const Cr = R.dirname(Gt(import.meta.url));
mr({ path: R.resolve(Cr, "../.env") });
const Ir = s.object({
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
  REPLAY_DB_FILE: s.string().default(R.resolve(process.cwd(), "../../data/system/replay_db.csv")),
  REPLAY_MATCH_FILE: s.string().default(R.resolve(process.cwd(), "../../data/system/active_match.txt")),
  REPLAY_LAST_COMPLETED_FILE: s.string().default(R.resolve(process.cwd(), "../../data/system/last_completed_match.txt")),
  REPLAY_PLAYBACK_DIR: s.string().default(R.resolve(process.cwd(), "../../data/playback")),
  REPLAY_FOLDER: s.string().default(R.resolve(process.cwd(), "../../data/replays")),
  HIGHLIGHTS_FOLDER: s.string().default(R.resolve(process.cwd(), "../../data/highlights")),
  ROSTER_CSV_PATH: s.string().default("data/roster/players_roster_prepared.csv")
}), E = Ir.parse(process.env);
class Pr {
  constructor() {
    D(this, "client", new gr());
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
  async createScene(e) {
    try {
      return await this.client.call("CreateScene", { sceneName: e }), { ok: !0 };
    } catch (a) {
      return {
        ok: !1,
        error: a instanceof Error ? a.message : String(a)
      };
    }
  }
  async createInput(e, a, n, r, i = !0) {
    try {
      return { ok: !0, sceneItemId: (await this.client.call("CreateInput", {
        sceneName: e,
        inputName: a,
        inputKind: n,
        inputSettings: r,
        sceneItemEnabled: i
      })).sceneItemId };
    } catch (l) {
      return {
        ok: !1,
        error: l instanceof Error ? l.message : String(l)
      };
    }
  }
}
const Ar = "https://api.opendota.com/api";
function Er(t) {
  const e = t.picks_bans ?? t.pick_bans;
  return Array.isArray(e) ? e : [];
}
class vr {
  constructor(e = 600) {
    D(this, "limiter");
    D(this, "memory", /* @__PURE__ */ new Map());
    D(this, "redis", null);
    this.ttlSeconds = e;
    const a = E.OPENDOTA_RATE_PER_MINUTE, n = Math.max(750, Math.floor(6e4 / Math.max(1, a)));
    this.limiter = new fr({
      minTime: n,
      maxConcurrent: 1,
      reservoir: Math.max(1, a),
      reservoirRefreshAmount: Math.max(1, a),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(e) {
    this.redis = new Kt(e);
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
        b.warn(l, "Redis OpenDota read failed");
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
        const n = await fetch(`${Ar}${e}`, {
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
const be = "Game starting in", Hn = s.object({
  label: s.string().optional(),
  running: s.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: s.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: s.number().int().min(0)
}), Rr = Hn.partial();
function Je(t, e = Date.now()) {
  if (!t)
    return 0;
  if (t.running && t.endsAt) {
    const a = new Date(t.endsAt).getTime();
    return Number.isFinite(a) ? Math.max(0, Math.ceil((a - e) / 1e3)) : Math.max(0, t.secondsRemaining ?? 0);
  }
  return Math.max(0, t.secondsRemaining ?? 0);
}
function Tr(t, e, a = Date.now()) {
  if (e.running === !0) {
    const r = e.secondsRemaining ?? (t ? Je(t, a) : 0), i = Math.max(0, Math.floor(r));
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? be,
      running: !0,
      secondsRemaining: i,
      endsAt: e.endsAt ?? new Date(a + i * 1e3).toISOString()
    };
  }
  if (e.running === !1) {
    const r = e.secondsRemaining ?? (t ? Je(t, a) : 0);
    return {
      label: e.label ?? (t == null ? void 0 : t.label) ?? be,
      running: !1,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(r))
    };
  }
  const n = {
    label: e.label ?? (t == null ? void 0 : t.label) ?? be,
    running: (t == null ? void 0 : t.running) ?? !1,
    endsAt: (t == null ? void 0 : t.endsAt) ?? null,
    secondsRemaining: e.secondsRemaining ?? (t ? Je(t, a) : 0)
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
function Ga(t, e = be) {
  const a = Math.max(0, Math.floor(t));
  return {
    label: e,
    running: !0,
    secondsRemaining: a,
    endsAt: new Date(Date.now() + a * 1e3).toISOString()
  };
}
function Ka(t, e = be) {
  return {
    label: e,
    running: !1,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(t))
  };
}
const Lr = {
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
function Nr(t) {
  const e = t.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return e && (Lr[e] ?? e);
}
function te(t) {
  return Nr(t.replace(/^npc_dota_hero_/, "").trim());
}
function Hr(t) {
  if (!t)
    return {};
  const e = te(t);
  return e ? {
    heroPortraitSlug: e,
    heroPortraitUrl: Mn(e)
  } : {};
}
function Mn(t, e) {
  const a = te(t);
  return a ? `/heroes/portraits/${a}.png` : "";
}
function Mr(t, e) {
  const a = te(t);
  return a ? `/heroes/renders/${a}.webm` : "";
}
function xr(t, e) {
  const a = te(t);
  if (!a)
    return {};
  const n = Mn(a), r = Mr(a);
  return {
    staticUrl: n,
    staticFallbackUrl: n,
    animatedUrl: r
  };
}
function xn(t) {
  return `/teams/${t}.png`;
}
function Et(t) {
  return t.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function jr(t) {
  const e = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map();
  for (const r of t) {
    const i = te(r.name);
    if (!i)
      continue;
    e.set(r.id, i), a.add(i), n.set(Et(r.localized_name), i);
    const l = i.split("_").map((o) => o.charAt(0).toUpperCase() + o.slice(1)).join(" ");
    n.set(Et(l), i);
  }
  return { byId: e, byInternalSlug: a, byDisplayKey: n };
}
function Fr(t, e) {
  const { heroId: a, heroClass: n, heroName: r, urlSlug: i } = t;
  if (i) {
    const l = te(i);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "url" };
  }
  if (a != null && a > 0) {
    const l = e.byId.get(a);
    if (l)
      return { slug: l, source: "id" };
  }
  if (n) {
    const l = te(n);
    if (l && e.byInternalSlug.has(l))
      return { slug: l, source: "class" };
  }
  for (const l of [r, n]) {
    if (!l)
      continue;
    const o = Et(l), m = e.byDisplayKey.get(o);
    if (m)
      return { slug: m, source: "display" };
  }
  if (n) {
    const l = te(n);
    if (l)
      return { slug: l, source: "fallback" };
  }
  return { source: "none" };
}
function ut(t, e, a) {
  var r, i;
  const n = e === "radiant" ? (r = t == null ? void 0 : t.pickPlayers) == null ? void 0 : r.radiant : (i = t == null ? void 0 : t.pickPlayers) == null ? void 0 : i.dire;
  if (!(!n || a < 0 || a >= n.length))
    return n[a] ?? null;
}
function Dr(t, e, a) {
  var r, i;
  const n = ut(t == null ? void 0 : t.matchSetup, e, a);
  if (!(n == null || !((r = t == null ? void 0 : t.roster) != null && r.length)))
    return (i = t.roster.find((l) => l.steam32 === n)) == null ? void 0 : i.displayName;
}
function jn(t, e, a) {
  const n = a == null ? void 0 : a.find((r) => r.type === "pick" && r.heroId === e);
  return n == null ? void 0 : n.order;
}
function Or(t, e) {
  return `${t}:${e}`;
}
function vt(t, e) {
  if (!t || e <= 0)
    return { games: 0, wins: 0 };
  const a = `${e}:`;
  let n = 0, r = 0;
  for (const [i, l] of Object.entries(t))
    !i.startsWith(a) || l.games <= 0 || (n += l.games, r += l.wins);
  return { games: n, wins: r };
}
function Fn(t, e, a) {
  if (!(!t || e <= 0 || a <= 0))
    return t[Or(e, a)];
}
function Rt(t, e) {
  if (vt(t, e).games <= 0)
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
const Ur = [
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
], $r = s.object({
  mode: s.literal("timed"),
  until: s.number()
}), Dn = s.union([
  s.literal("hidden"),
  s.literal("visible"),
  $r
]), Br = s.object({
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
}), Gr = s.object({
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
}), Wa = "BPC League Season 2";
function Kr(t) {
  if (!t)
    return Wa;
  const e = /season[- _](\d+)/i.exec(t);
  return e ? `BPC League Season ${e[1]}` : Wa;
}
const On = s.object({
  radiant: s.array(s.number().nullable()).length(5).optional(),
  dire: s.array(s.number().nullable()).length(5).optional()
}), Un = s.object({
  radiantTeamKey: s.string(),
  direTeamKey: s.string(),
  seriesBestOf: s.union([s.literal(1), s.literal(3), s.literal(5)]).default(3),
  seriesGame: s.number().int().min(1).max(5).default(1),
  scoreA: s.number().int().min(0).default(0),
  scoreB: s.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: s.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: On.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: s.record(s.string(), s.string()).optional(),
  previousDrafts: s.array(s.lazy(() => nt)).optional()
}), $n = s.object({
  leagueId: s.number().nullable(),
  seasonSlug: s.string().optional(),
  roster: s.array(Gr).default([]),
  matchSetup: Un.nullable().optional(),
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
}), Bn = s.object({
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
}), Gn = s.object({
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
}), Kn = s.object({
  label: s.string(),
  value: s.string(),
  sublabel: s.string().optional()
}), Tt = s.object({
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  heroPortraitUrl: s.string().optional(),
  playerLabel: s.string().optional(),
  slides: s.array(Kn),
  activeIndex: s.number().nonnegative().default(0),
  slideDurationMs: s.number().positive().default(4e3),
  startedAt: s.number()
}), Wn = s.object({
  gsiManualOverride: s.boolean().default(!1),
  autoShowStatsOnPick: s.boolean().default(!1),
  gsiLastSeen: s.string().optional(),
  gsiConnected: s.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: s.boolean().default(!1),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: s.number().optional()
}), Wr = s.object({
  team: s.enum(["A", "B"]),
  heroId: s.number().nullable(),
  player: s.string().optional(),
  isBan: s.boolean().optional(),
  order: s.number().optional(),
  heroName: s.string().optional(),
  heroPortraitUrl: s.string().optional()
}), Vr = s.object({
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
}), Va = s.object({
  name: s.string(),
  logoUrl: s.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: s.string().optional(),
  slots: s.array(Vr).optional(),
  bonusTime: s.number().optional()
}), qr = s.object({
  side: s.enum(["radiant", "dire", "A", "B"]),
  heroId: s.number(),
  heroName: s.string().optional(),
  heroPortraitSlug: s.string().optional(),
  playerName: s.string().optional()
}), nt = s.object({
  series: Br,
  side: s.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: s.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: s.string().optional(),
  reserveSeconds: s.number().nonnegative(),
  picksBansOrder: s.array(Wr).optional(),
  source: s.enum(["manual", "gsi"]).optional(),
  activeTeam: s.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: s.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: s.number().optional(),
  turnSecondsRemaining: s.number().optional(),
  radiant: Va.optional(),
  dire: Va.optional(),
  lastPick: qr.optional()
}), Lt = s.object({
  headline: s.string(),
  subtitle: s.string().optional(),
  accent: s.string().optional()
}), Yr = s.object({
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
  replays: s.array(Yr)
});
const Nt = s.object({
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
}), Ht = s.object({
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
}), zr = s.object({
  pickRate: s.number().optional(),
  winRate: s.number().optional(),
  contestRate: s.number().optional(),
  banRate: s.number().optional(),
  picks: s.number().optional(),
  bans: s.number().optional(),
  wins: s.number().optional(),
  losses: s.number().optional(),
  games: s.number().optional()
}), Jr = s.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]), Ee = s.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: Jr.optional(),
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
  tournament: zr.optional(),
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
  statSlides: s.array(Kn).optional(),
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
}), Mt = s.object({
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
}), xt = s.object({
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
}), Xr = s.object({
  pauseMessage: s.string().optional(),
  startingSoonEta: s.string().optional(),
  postgameNotes: s.string().optional(),
  gameStartCountdown: Hn.optional()
}), Vn = s.object({
  desiredSceneName: s.string().optional(),
  overlaySceneCollection: s.string().optional(),
  lastCorrelationId: s.string().optional()
}), qn = s.object({
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
  overlayVisibility: s.record(Dn).default({}),
  sceneHints: Vn.optional(),
  leagueConfig: $n.optional(),
  tournamentHeroIndex: s.record(Bn).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: s.record(Gn).optional(),
  production: Wn.optional(),
  statCarousel: Tt.nullable().optional(),
  draft: nt.nullable().optional(),
  lowerThirds: Lt.nullable().optional(),
  playerStatsCard: Ht.nullable().optional(),
  heroStatsCard: Ee.nullable().optional(),
  livePlayerCard: Ee.nullable().optional(),
  matchupCard: Mt.nullable().optional(),
  sponsor: xt.nullable().optional(),
  timers: Xr.optional(),
  minimapState: qn.optional(),
  standoutPlayerCard: Nt.nullable().optional()
});
const Qr = s.object({
  overlayVisibility: s.record(Dn).optional(),
  leagueConfig: $n.partial().optional(),
  tournamentHeroIndex: s.record(Bn).optional(),
  playerHeroIndex: s.record(Gn).optional(),
  production: Wn.partial().optional(),
  minimapState: qn.partial().optional(),
  statCarousel: s.union([Tt, Tt.partial(), s.null()]).optional(),
  draft: s.union([nt, nt.partial(), s.null()]).optional(),
  lowerThirds: s.union([Lt, Lt.partial(), s.null()]).optional(),
  playerStatsCard: s.union([Ht, Ht.partial(), s.null()]).optional(),
  heroStatsCard: s.union([Ee, Ee.partial(), s.null()]).optional(),
  livePlayerCard: s.union([Ee, Ee.partial(), s.null()]).optional(),
  matchupCard: s.union([Mt, Mt.partial(), s.null()]).optional(),
  sponsor: s.union([
    xt,
    xt.partial(),
    s.null()
  ]).optional(),
  timers: s.object({
    pauseMessage: s.string().optional(),
    startingSoonEta: s.string().optional(),
    postgameNotes: s.string().optional(),
    gameStartCountdown: Rr.optional()
  }).partial().optional(),
  sceneHints: Vn.partial().optional(),
  standoutPlayerCard: s.union([
    Nt,
    Nt.partial(),
    s.null()
  ]).optional()
});
function Zr() {
  const t = {};
  for (const e of Ur)
    t[e] = e === "game" ? "visible" : "hidden";
  return t.global_kill_switch = "visible", t;
}
function es() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function Yn() {
  return {
    version: 2,
    seq: 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: Zr(),
    sceneHints: {},
    leagueConfig: es(),
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
const le = {
  STATE_FULL: "state:full",
  ACK: "ack"
}, re = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function A(t, e, a) {
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
function ts(t, e) {
  return e ? { ...t, ...e } : { ...t };
}
function qa(t, e) {
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
function as(t, e) {
  var i, l;
  if (e === void 0)
    return t;
  if (e === null)
    return null;
  const a = e;
  if (!t)
    return a;
  const n = a.radiant ? { ...t.radiant ?? {}, ...a.radiant } : t.radiant, r = a.dire ? { ...t.dire ?? {}, ...a.dire } : t.dire;
  return n != null && n.slots && (n.slots = qa((i = t.radiant) == null ? void 0 : i.slots, n.slots)), r != null && r.slots && (r.slots = qa((l = t.dire) == null ? void 0 : l.slots, r.slots)), {
    ...t,
    ...a,
    series: a.series ? { ...t.series, ...a.series } : t.series,
    picksBansOrder: a.picksBansOrder ?? t.picksBansOrder,
    radiant: n,
    dire: r,
    lastPick: a.lastPick ?? t.lastPick
  };
}
function ge(t, e) {
  return e === void 0 ? t : e === null ? null : !t || t === null ? { ...e } : { ...t, ...e };
}
function ns(t, e) {
  return e === void 0 ? t : {
    ...t ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...e,
    roster: e.roster ?? (t == null ? void 0 : t.roster) ?? [],
    matchSetup: e.matchSetup !== void 0 ? e.matchSetup : (t == null ? void 0 : t.matchSetup) ?? null,
    teamColors: e.teamColors !== void 0 ? { ...(t == null ? void 0 : t.teamColors) ?? {}, ...e.teamColors } : t == null ? void 0 : t.teamColors
  };
}
function rs(t, e) {
  return e === void 0 ? t : { ...t ?? {}, ...e };
}
function zn(t, e) {
  var C;
  const a = e.overlayVisibility !== void 0 ? ts(t.overlayVisibility, e.overlayVisibility) : t.overlayVisibility;
  let n = t.timers;
  if (e.timers !== void 0) {
    const { gameStartCountdown: w, ...k } = e.timers;
    n = {
      ...t.timers ?? {},
      ...k
    }, w !== void 0 && (n = {
      ...n,
      gameStartCountdown: Tr((C = t.timers) == null ? void 0 : C.gameStartCountdown, w)
    });
  }
  const r = as(t.draft, e.draft), i = ns(t.leagueConfig, e.leagueConfig), l = rs(t.production, e.production);
  let o = t.tournamentHeroIndex;
  e.tournamentHeroIndex !== void 0 && (o = { ...e.tournamentHeroIndex });
  let m = t.playerHeroIndex;
  e.playerHeroIndex !== void 0 && (m = { ...e.playerHeroIndex });
  let u = ge(t.heroStatsCard ?? void 0, e.heroStatsCard), p = e.sceneHints !== void 0 ? { ...t.sceneHints ?? {}, ...e.sceneHints } : t.sceneHints;
  const d = ge(t.lowerThirds ?? void 0, e.lowerThirds), g = ge(t.playerStatsCard ?? void 0, e.playerStatsCard);
  let h = ge(t.matchupCard ?? void 0, e.matchupCard), f = ge(t.sponsor ?? void 0, e.sponsor), c = ge(t.statCarousel ?? void 0, e.statCarousel);
  if (u && e.heroStatsCard && typeof e.heroStatsCard == "object") {
    const w = e.heroStatsCard;
    w.fetchedAt ? u = { ...w } : u = {
      ...u,
      ...w,
      tournament: w.tournament ? { ...u.tournament ?? {}, ...w.tournament } : u.tournament,
      playerHero: w.playerHero ? { ...u.playerHero ?? {}, ...w.playerHero } : u.playerHero,
      statSlides: w.statSlides ?? u.statSlides
    };
  }
  if (h && e.matchupCard && typeof e.matchupCard == "object") {
    const w = e.matchupCard;
    h = {
      ...h,
      ...w,
      matchup: w.matchup ? { ...h.matchup ?? {}, ...w.matchup } : h.matchup
    };
  }
  let y = ge(t.livePlayerCard ?? void 0, e.livePlayerCard), S = ge(t.standoutPlayerCard ?? void 0, e.standoutPlayerCard);
  return {
    ...t,
    seq: t.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility: a,
    leagueConfig: i ?? t.leagueConfig,
    tournamentHeroIndex: o ?? t.tournamentHeroIndex,
    playerHeroIndex: m ?? t.playerHeroIndex,
    production: l ?? t.production,
    statCarousel: c === void 0 ? t.statCarousel : c,
    draft: r === void 0 ? t.draft : r,
    lowerThirds: d === void 0 ? t.lowerThirds : d,
    playerStatsCard: g === void 0 ? t.playerStatsCard : g,
    heroStatsCard: u === void 0 ? t.heroStatsCard : u,
    livePlayerCard: y === void 0 ? t.livePlayerCard : y,
    matchupCard: h === void 0 ? t.matchupCard : h,
    sponsor: f === void 0 ? t.sponsor : f,
    timers: n ?? t.timers,
    sceneHints: p,
    minimapState: e.minimapState !== void 0 ? { ...t.minimapState ?? {}, ...e.minimapState } : t.minimapState,
    standoutPlayerCard: S === void 0 ? t.standoutPlayerCard : S
  };
}
function Ya(t) {
  let e = structuredClone(t);
  return {
    async getState() {
      return structuredClone(e);
    },
    async patchState(a) {
      return e = zn(e, a), structuredClone(e);
    },
    async replaceState(a) {
      return e = structuredClone(a), structuredClone(e);
    }
  };
}
function ss(t) {
  const e = new Kt(t.url, {
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
        const l = await e.get(t.key), o = l ? JSON.parse(l) : t.seed, m = zn(o, r);
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
async function os() {
  const t = Yn();
  if (E.STATE_BACKEND === "memory")
    return b.info("State backend: memory"), Ya(t);
  if (!E.REDIS_URL)
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  try {
    const e = new Kt(E.REDIS_URL);
    return await e.ping(), await e.quit(), b.info({ key: E.REDIS_STATE_KEY }, "State backend: redis"), ss({
      url: E.REDIS_URL,
      key: E.REDIS_STATE_KEY,
      seed: t
    });
  } catch (e) {
    if (b.error(e, "Redis unavailable"), E.REDIS_UNAVAILABLE_FALLBACK_MEMORY)
      return b.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      ), Ya(t);
    throw e;
  }
}
function is(t) {
  return Qr.parse(t);
}
async function ls(t, e) {
  if (!t.isConnected())
    return { ok: !1, message: "OBS is not connected" };
  try {
    const a = await t.listScenes(), n = ["Scene", "Replay", "Replay Stinger"];
    for (const m of n)
      if (a.includes(m))
        return {
          ok: !1,
          message: `Setup aborted: Scene '${m}' already exists. Please rename or delete your existing scenes to prevent overwriting.`
        };
    for (const m of n) {
      const u = await t.createScene(m);
      if (!u.ok)
        throw new Error(`Failed to create scene '${m}': ${u.error}`);
    }
    const r = e.overlayBaseUrl.replace(/\/$/, ""), i = [
      { name: "Draft", url: `${r}/draft` },
      { name: "Game", url: `${r}/game` },
      { name: "Hero Spotlight", url: `${r}/herostats` },
      { name: "Lower Third", url: `${r}/lowerthird` },
      { name: "Matchup", url: `${r}/matchup` },
      { name: "MVP", url: `${r}/postgame` },
      { name: "Player Stat", url: `${r}/playerstats` },
      { name: "Sponsors", url: `${r}/sponsors` },
      { name: "Starting Soon", url: `${r}/startingsoon` },
      { name: "Versus", url: `${r}/versus` },
      { name: "ReplayBanner1", url: `${r}/sponsors` }
    ];
    for (const m of i) {
      const u = await t.createInput("Scene", m.name, "browser_source", {
        url: m.url,
        width: 1920,
        height: 1080,
        reroute_audio: !1
      });
      u.ok || b.warn(`Failed to create browser source '${m.name}': ${u.error}`);
    }
    const l = process.env.APP_ROOT ? R.join(process.env.APP_ROOT, "BroadcastData") : R.resolve(".", "BroadcastData"), o = R.join(l, "System", "stinger.webm");
    return await t.createInput("Replay Stinger", "Stinger", "ffmpeg_source", {
      local_file: o,
      is_local_file: !0,
      looping: !1
    }), await t.createInput("Replay", "ReplayPlayer", "ffmpeg_source", {
      is_local_file: !0,
      looping: !1
    }), await t.createInput("Scene", "Game Capture", "game_capture", {}), await t.createInput("Scene", "Audio Input Capture", "wasapi_input_capture", {}), await t.createInput("Scene", "Audio Output Capture", "wasapi_output_capture", {}), await t.createInput("Replay", "Scene", "scene", {}), await t.createInput("Replay Stinger", "Scene", "scene", {}), { ok: !0, message: "OBS Setup completed successfully" };
  } catch (a) {
    return b.error(a, "Error during OBS auto setup"), {
      ok: !1,
      message: "An error occurred during setup",
      error: a instanceof Error ? a.message : String(a)
    };
  }
}
const Jn = {
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
function cs(t) {
  const e = Math.min(...t), n = Math.max(...t) - e;
  return n === 0 ? t.map(() => 0.5) : t.map((r) => (r - e) / n);
}
function Ne(t, e) {
  return e === 0 ? 0 : t / e;
}
function us(t, e = Jn) {
  const a = t.players ?? [];
  if (a.length === 0) return [];
  const n = Math.max(1, (t.duration ?? 1800) / 60), r = (f) => (f.player_slot ?? 0) < 128, i = a.filter(r), l = a.filter((f) => !r(f)), o = i.reduce((f, c) => f + (c.kills ?? 0), 0), m = l.reduce((f, c) => f + (c.kills ?? 0), 0), u = i.reduce((f, c) => f + (c.net_worth ?? 0), 0), p = l.reduce((f, c) => f + (c.net_worth ?? 0), 0), d = a.map((f) => {
    const c = r(f) ? "radiant" : "dire", y = c === "radiant" ? o : m, S = c === "radiant" ? u : p, C = f.kills ?? 0, w = f.deaths ?? 0, k = f.assists ?? 0;
    return {
      kda: Ne(C + k, w + 1),
      killParticipation: Ne(C + k, Math.max(1, y)),
      gpm: f.gold_per_min ?? 0,
      xpm: f.xp_per_min ?? 0,
      networthShare: Ne(f.net_worth ?? 0, Math.max(1, S)),
      damagePm: Ne(f.hero_damage ?? 0, n),
      healingPm: Ne(f.hero_healing ?? 0, n),
      lastHits: f.last_hits ?? 0,
      denies: f.denies ?? 0,
      laneEfficiency: f.lane_efficiency ?? 0,
      winBonus: (t.radiant_win ? c === "radiant" : c === "dire") ? 1 : 0,
      leaver: (f.leaver_status ?? 0) > 0
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
  ], h = {};
  for (const f of g)
    h[f] = cs(d.map((c) => c[f]));
  return h.winBonus = d.map((f) => f.winBonus), a.map((f, c) => {
    if (d[c].leaver)
      return za(f, t, 0, ds());
    const S = {
      kda: h.kda[c] * e.kda,
      killParticipation: h.killParticipation[c] * e.killParticipation,
      gpm: h.gpm[c] * e.gpm,
      xpm: h.xpm[c] * e.xpm,
      networthShare: h.networthShare[c] * e.networthShare,
      damagePm: h.damagePm[c] * e.damagePm,
      healingPm: h.healingPm[c] * e.healingPm,
      lastHits: h.lastHits[c] * e.lastHits,
      denies: h.denies[c] * e.denies,
      laneEfficiency: h.laneEfficiency[c] * e.laneEfficiency,
      winBonus: h.winBonus[c] * e.winBonus
    }, C = Object.values(S).reduce((w, k) => w + k, 0);
    return za(f, t, C, S);
  });
}
function ds() {
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
function za(t, e, a, n, r) {
  const i = (t.player_slot ?? 0) < 128 ? "radiant" : "dire", l = (e.players ?? []).filter((u) => (u.player_slot ?? 0) < 128), o = (e.players ?? []).filter((u) => (u.player_slot ?? 0) >= 128), m = i === "radiant" ? l.reduce((u, p) => u + (p.kills ?? 0), 0) : o.reduce((u, p) => u + (p.kills ?? 0), 0);
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
      hasScepter: (t.aghanims_scepter ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((u) => [108, 271, 127, 256].includes(u ?? 0)),
      hasShard: (t.aghanims_shard ?? 0) === 1 || [t.item_0, t.item_1, t.item_2, t.item_3, t.item_4, t.item_5, t.item_neutral, t.backpack_0, t.backpack_1, t.backpack_2].some((u) => [609, 125].includes(u ?? 0))
    }
  };
}
function Xn(t, e) {
  return [...us(t, e)].sort((r, i) => i.mvpScore - r.mvpScore).map((r, i) => ({ ...r, rank: i + 1 }));
}
let he = null, Ce = /* @__PURE__ */ new Map(), rt = null;
function ms() {
  if (!(he != null && he.length)) {
    rt = null;
    return;
  }
  rt = jr(he);
}
async function de(t) {
  if (Ce.size > 0) return Ce;
  const e = await t.heroesConstants();
  return e.ok && Array.isArray(e.data) && (he = e.data, Ce = new Map(he.map((a) => [a.id, a])), ms()), Ce;
}
function st(t) {
  if (rt) return Fr(t, rt);
  if (t.heroId != null && t.heroId > 0) {
    const e = Ce.get(t.heroId);
    if (e) {
      const a = te(e.name);
      if (a) return { slug: a, source: "id" };
    }
  }
  if (t.heroClass) {
    const e = te(t.heroClass);
    if (e) return { slug: e, source: "fallback" };
  }
  return { source: "none" };
}
function gs(t) {
  return st(t).slug;
}
function fs(t, e) {
  const a = st({ heroId: t, heroName: e });
  if (a.slug) return a.slug;
  const n = Ce.get(t);
  if (n)
    return te(n.name) || void 0;
}
function se(t, e) {
  return Hr(
    fs(t, e)
  );
}
function hs(t, e) {
  return se(t, e).heroPortraitUrl;
}
function ce(t) {
  const e = Ce.get(t);
  return (e == null ? void 0 : e.localized_name) ?? `Hero ${t}`;
}
function ps(t) {
  if (t)
    return xn(t);
}
function Q(t, e) {
  return t.find((a) => a.steam32 === e);
}
function ys() {
  return he ? [...he].sort(
    (t, e) => t.localized_name.localeCompare(e.localized_name)
  ) : [];
}
function jt(t) {
  const e = /* @__PURE__ */ new Map();
  for (const a of t) {
    const n = a.teamKey ?? bs(a.teamName ?? "unknown"), r = a.teamName ?? Ss(n), i = e.get(n);
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
function Ft(t, e) {
  return jt(t).find((a) => a.teamKey === e);
}
function xe(t) {
  return xn(t);
}
function bs(t) {
  return t.trim().toLowerCase().replace(/\s+/g, "_");
}
function Ss(t) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (e) => e.toUpperCase());
}
const ws = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function j(t) {
  return t && typeof t == "object" ? t : null;
}
function Dt(t) {
  const e = j(t);
  if (!e) return null;
  const a = e.hero_id ?? e.heroid ?? e.id;
  if (typeof a == "number" && a > 0) return a;
  if (typeof a == "string") {
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function Xe(t) {
  if (typeof t == "string" && t.length > 0) return t;
}
const Ja = /* @__PURE__ */ new Set();
function _s() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function ks(t, e, a, n) {
  _s() && (Ja.has(t) || (Ja.add(t), console.log("[gsi:hero-slug]", {
    slot: t,
    heroId: e,
    heroClass: a,
    resolvedSlug: n.slug,
    source: n.source
  })));
}
function Cs(t, e, a, n) {
  const r = st({
    heroId: t ?? void 0,
    heroClass: e,
    heroName: a
  });
  n && ks(n, t, e, r);
  const i = r.slug ?? gs({ heroId: t, heroClass: e });
  if (i)
    return { ...xr(i), slug: i };
  if (t) {
    const l = hs(t, a);
    if (l)
      return {
        staticUrl: l,
        staticFallbackUrl: l,
        slug: st({ heroId: t, heroName: a }).slug
      };
  }
  return {};
}
function Xa(t, e) {
  if (t) return ce(t);
  if (e)
    return e.replace(/^npc_dota_hero_/, "").split("_").map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(" ");
}
function Qa(t, e, a) {
  const n = `${e}${a}`, r = z(t[`${n}_id`]), i = Xe(t[`${n}_class`]);
  if (!r && !i)
    return null;
  const l = {};
  return r > 0 && (l.hero_id = r), i && (l.class = i), l;
}
function Za(t, e) {
  var i;
  const a = [], n = /* @__PURE__ */ new Set(), r = (l, o, m, u) => {
    const p = `${l}-${o}`;
    if (n.has(p) || (n.add(p), !m && !u)) return;
    const d = Cs(
      m,
      u,
      Xa(m, u),
      `${e}-${l}${o}`
    );
    a.push({
      order: o,
      type: l,
      heroId: m,
      heroName: Xa(m, u),
      heroPortraitSlug: d.slug,
      heroPortraitUrl: d.staticUrl,
      heroPortraitAnimatedUrl: d.animatedUrl
    });
  };
  for (const [l, o] of Object.entries(t)) {
    const m = /^(pick|ban)(\d+)$/i.exec(l);
    if (!m) continue;
    const u = ((i = m[1]) == null ? void 0 : i.toLowerCase()) === "ban" ? "ban" : "pick", p = Number(m[2]), d = Dt(o), g = j(o), h = Xe((g == null ? void 0 : g.class) ?? (g == null ? void 0 : g.hero_class));
    r(u, p, d, h);
  }
  for (let l = 0; l < 7; l++) {
    const o = Qa(t, "ban", l);
    o && r(
      "ban",
      l,
      z(o.hero_id) > 0 ? z(o.hero_id) : null,
      Xe(o.class)
    );
  }
  for (let l = 0; l < 5; l++) {
    const o = Qa(t, "pick", l);
    o && r(
      "pick",
      l,
      z(o.hero_id) > 0 ? z(o.hero_id) : null,
      Xe(o.class)
    );
  }
  return a.sort((l, o) => l.order - o.order), a;
}
function en(t, e) {
  return (e === "radiant" ? j(t.radiant) ?? j(t.team2) : j(t.dire) ?? j(t.team3)) ?? {};
}
function Is(t) {
  const e = t.activeteam ?? t.active_team;
  return e === 2 || e === "2" || e === "radiant" ? "radiant" : e === 3 || e === "3" || e === "dire" ? "dire" : null;
}
function z(t) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const e = Number(t);
    if (Number.isFinite(e)) return e;
  }
  return 0;
}
function Ps(t) {
  const e = t.pick;
  return e === !0 || e === 1 || e === "1" ? "pick" : e === !1 || e === 0 || e === "0" ? "ban" : "pick";
}
function As(t, e) {
  const a = j(t.team2), n = j(t.team3), r = z(t.radiant_bonus_time) || z(a == null ? void 0 : a.bonus_time), i = z(t.dire_bonus_time) || z(n == null ? void 0 : n.bonus_time);
  return e === "radiant" ? r : e === "dire" ? i : Math.max(r, i);
}
const tn = 7, an = 5;
function pe(t, e) {
  return t.filter(
    (a) => a.type === e && (a.heroId || a.heroPortraitUrl)
  ).length;
}
function ot(t, e) {
  return pe(t, "pick") >= an && pe(e, "pick") >= an;
}
function Ot(t, e) {
  return pe(t, "ban") > 0 || pe(e, "ban") > 0 || pe(t, "pick") > 0 || pe(e, "pick") > 0;
}
function Es(t, e, a) {
  const n = z(t == null ? void 0 : t.clock_time), r = z(
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
function vs(t, e, a, n, r) {
  if (!t || ot(a, n))
    return "done";
  if (e === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || e === "DOTA_GAMERULES_STATE_PRE_GAME" && !Ot(a, n) || e === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !Ot(a, n) && !r)
    return "starting";
  const i = pe(a, "ban"), l = pe(n, "ban");
  return i < tn || l < tn ? "bans" : "picks";
}
function nn(t) {
  const e = j(t);
  if (!e) return null;
  const a = j(e.hero);
  if (a) {
    const n = Dt(a);
    if (n) return n;
  }
  return Dt(t);
}
function Rs(t, e) {
  const a = /* @__PURE__ */ new Map(), n = j(t.player), r = j(t.hero), i = e === "radiant" ? j(r == null ? void 0 : r.team2) ?? j(r == null ? void 0 : r.radiant) : j(r == null ? void 0 : r.team3) ?? j(r == null ? void 0 : r.dire), l = e === "radiant" ? j(n == null ? void 0 : n.team2) ?? j(n == null ? void 0 : n.radiant) : j(n == null ? void 0 : n.team3) ?? j(n == null ? void 0 : n.dire);
  if (i)
    for (const [o, m] of Object.entries(i)) {
      const u = /^player(\d+)$/i.exec(o);
      if (!u) continue;
      const p = Number(u[1]) % 5, d = nn(m);
      if (d && d > 0 && Number.isFinite(p)) {
        let g;
        if (l) {
          const h = j(l[o]);
          if (h != null && h.accountid) {
            const f = parseInt(String(h.accountid), 10);
            Number.isFinite(f) && f > 0 && (g = f);
          }
        }
        a.set(p, { heroId: d, steam32: g });
      }
    }
  if (l)
    for (const [o, m] of Object.entries(l)) {
      const u = /^player(\d+)$/i.exec(o);
      if (!u) continue;
      const p = Number(u[1]) % 5, d = a.get(p);
      if (d != null && d.heroId) continue;
      const g = nn(m);
      if (g && g > 0 && Number.isFinite(p)) {
        const h = j(m);
        let f;
        if (h != null && h.accountid) {
          const c = parseInt(String(h.accountid), 10);
          Number.isFinite(c) && c > 0 && (f = c);
        }
        a.set(p, { heroId: g, steam32: f });
      }
    }
  return a;
}
function rn(t, e, a) {
  const n = Array.from(Rs(a, e).values());
  return t.map((r) => {
    if (r.type !== "pick" || !r.heroId) return r;
    const i = n.find((l) => l.heroId === r.heroId);
    return i ? {
      ...r,
      steam32: i.steam32 ?? r.steam32
    } : r;
  });
}
const Ts = [
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
], Ls = [
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
function sn(t, e, a) {
  const r = (a === "dire_first_pick" ? Ls : Ts).findIndex((i) => i.side === t && i.order === e);
  return r >= 0 ? r : e;
}
function on(t, e) {
  return e.type !== "pick" || !e.heroId ? null : `${t}:${e.order}:${e.heroId}`;
}
function St(t, e) {
  return {
    side: t,
    heroId: e.heroId,
    heroName: e.heroName,
    heroPortraitSlug: e.heroPortraitSlug,
    playerName: e.playerName
  };
}
function ln(t, e) {
  let a = t[0], n = sn(a.side, a.slot.order, e);
  for (const r of t.slice(1)) {
    const i = sn(r.side, r.slot.order, e);
    i > n && (a = r, n = i);
  }
  return a;
}
function Ns(t, e) {
  return t ? t.heroId !== e.heroId || t.side !== e.side : !0;
}
function Hs(t, e, a) {
  var m, u, p, d;
  const n = [];
  for (const g of t)
    g.type === "pick" && g.heroId && n.push({ side: "radiant", slot: g });
  for (const g of e)
    g.type === "pick" && g.heroId && n.push({ side: "dire", slot: g });
  if (n.length === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const g of ["radiant", "dire"]) {
    const h = g === "radiant" ? (m = a == null ? void 0 : a.radiant) == null ? void 0 : m.slots : (u = a == null ? void 0 : a.dire) == null ? void 0 : u.slots;
    for (const f of h ?? []) {
      const c = on(g, f);
      c && r.add(c);
    }
  }
  const i = n.filter(
    ({ side: g, slot: h }) => !r.has(on(g, h))
  ), l = a == null ? void 0 : a.side;
  if (i.length === 0) {
    if (ot(t, e) && a && !ot(((p = a.radiant) == null ? void 0 : p.slots) ?? [], ((d = a.dire) == null ? void 0 : d.slots) ?? [])) {
      const g = ln(n, l), h = St(g.side, g.slot);
      if (Ns(a.lastPick, h)) return h;
    }
    return a == null ? void 0 : a.lastPick;
  }
  if (i.length === 1) {
    const g = i[0];
    return St(g.side, g.slot);
  }
  const o = ln(i, l);
  return St(o.side, o.slot);
}
function cn(t, e, a, n, r) {
  var o, m;
  if (!t)
    return {
      name: n,
      logoUrl: e === "radiant" ? ((o = r == null ? void 0 : r.radiant) == null ? void 0 : o.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlA) : ((m = r == null ? void 0 : r.dire) == null ? void 0 : m.logoUrl) ?? (r == null ? void 0 : r.series.logoUrlB)
    };
  const i = e === "radiant" ? t.radiantTeamKey : t.direTeamKey, l = Ft(a, i);
  return l ? {
    name: l.teamName,
    logoUrl: xe(l.teamKey)
  } : { name: n };
}
function Ms(t, e, a, n) {
  var J, q;
  const r = j(t.map), i = typeof (r == null ? void 0 : r.game_state) == "string" ? r.game_state : "", l = ws.has(i), o = j(t.draft);
  if (!o && !l)
    return { inDraft: !1, draftPatch: null };
  const m = typeof (r == null ? void 0 : r.team_name_radiant) == "string" ? r.team_name_radiant : "Radiant", u = typeof (r == null ? void 0 : r.team_name_dire) == "string" ? r.team_name_dire : "Dire", p = cn(
    n,
    "radiant",
    a,
    m,
    e
  ), d = cn(
    n,
    "dire",
    a,
    u,
    e
  ), g = o ?? {}, h = en(g, "radiant"), f = en(g, "dire");
  let c = Za(h, "radiant"), y = Za(f, "dire");
  ot(c, y) && (c = rn(c, "radiant", t), y = rn(y, "dire", t));
  const C = o ? Is(g) : null, w = z(
    g.activeteam_time_remaining ?? g.active_team_time_remaining
  ), k = o ? Ps(g) : void 0, _ = o ? As(g, C) : 0, P = [
    ...c.map(($) => ({
      team: "A",
      heroId: $.heroId,
      player: $.playerName,
      isBan: $.type === "ban",
      order: $.order,
      heroName: $.heroName,
      heroPortraitUrl: $.heroPortraitUrl
    })),
    ...y.map(($) => ({
      team: "B",
      heroId: $.heroId,
      player: $.playerName,
      isBan: $.type === "ban",
      order: $.order,
      heroName: $.heroName,
      heroPortraitUrl: $.heroPortraitUrl
    }))
  ], M = Hs(c, y, e), O = vs(
    l,
    i,
    c,
    y,
    C
  );
  let V = Es(r, i, g);
  O === "starting" && V === void 0 && ((e == null ? void 0 : e.phase) === "starting" && e.startSecondsRemaining !== void 0 ? V = e.startSecondsRemaining : w > 0 && !Ot(c, y) && (V = w));
  const L = {
    source: "gsi",
    phase: O,
    gameState: i,
    reserveSeconds: Math.max(0, Math.round(_)),
    activeTeam: O === "starting" ? null : C,
    turnAction: O === "starting" ? void 0 : k,
    startSecondsRemaining: O === "starting" ? Math.max(
      0,
      Math.round(
        V ?? ((e == null ? void 0 : e.phase) === "starting" ? e.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: O === "starting" ? void 0 : Math.max(0, Math.round(w)),
    series: {
      teamA: p.name,
      teamB: d.name,
      scoreA: (e == null ? void 0 : e.series.scoreA) ?? 0,
      scoreB: (e == null ? void 0 : e.series.scoreB) ?? 0,
      bestOf: e == null ? void 0 : e.series.bestOf,
      gameNumber: e == null ? void 0 : e.series.gameNumber,
      logoUrlA: p.logoUrl ?? (e == null ? void 0 : e.series.logoUrlA),
      logoUrlB: d.logoUrl ?? (e == null ? void 0 : e.series.logoUrlB)
    },
    radiant: {
      name: p.name,
      logoUrl: p.logoUrl,
      slots: c,
      bonusTime: Math.max(0, Math.round(z(g.radiant_bonus_time) || z((J = j(g.team2)) == null ? void 0 : J.bonus_time) || 0))
    },
    dire: {
      name: d.name,
      logoUrl: d.logoUrl,
      slots: y,
      bonusTime: Math.max(0, Math.round(z(g.dire_bonus_time) || z((q = j(g.team3)) == null ? void 0 : q.bonus_time) || 0))
    },
    picksBansOrder: P,
    lastPick: M
  };
  return { inDraft: l || !!o, draftPatch: L };
}
const it = {};
let un = !1;
async function xs() {
  if (un) return;
  un = !0;
  const t = Object.keys(Ut).map((e) => e.replace("item_", ""));
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
        const n = await a.json(), r = {};
        for (const i of n) {
          if (!i.hero_id || !i.time || !i.games) continue;
          const l = Number(i.hero_id), o = Number(i.time), m = Number(i.games);
          r[l] || (r[l] = { sum: 0, totalGames: 0 }), r[l].sum += o * m, r[l].totalGames += m;
        }
        it[e] = {};
        for (const [i, l] of Object.entries(r))
          l.totalGames > 0 && (it[e][Number(i)] = Math.round(l.sum / l.totalGames));
        b.debug({ item: e, heroesIndexed: Object.keys(r).length }, "Loaded item timing"), await new Promise((i) => setTimeout(i, 2e3));
      } catch (a) {
        b.warn({ item: e, error: String(a) }, "Error fetching item timing");
      }
    b.info("Finished preloading average item timings.");
  })();
}
function js(t, e) {
  const a = e.replace("item_", "");
  return it[a] ? it[a][t] ?? null : null;
}
const wt = /* @__PURE__ */ new Map(), Ut = {
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
function Fs(t, e, a) {
  var n, r;
  try {
    return ((r = (n = t == null ? void 0 : t.items) == null ? void 0 : n[e]) == null ? void 0 : r[a]) || {};
  } catch {
    return {};
  }
}
function Ds(t, e, a) {
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
function Os(t, e, a) {
  var n, r, i;
  try {
    return ((i = (r = (n = t == null ? void 0 : t.player) == null ? void 0 : n[e]) == null ? void 0 : r[a]) == null ? void 0 : i.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function Us(t, e) {
  var r;
  if (!(t != null && t.items)) return;
  const a = ((r = t == null ? void 0 : t.map) == null ? void 0 : r.clock_time) || 0;
  if (a < 0) return;
  const n = (i) => {
    var l;
    for (let o = 0; o <= 9; o++) {
      const m = `player${o}`, u = Fs(t, i, m), p = Os(t, i, m);
      if (!p || p === "Unknown Player") continue;
      wt.has(p) || wt.set(p, /* @__PURE__ */ new Set());
      const d = wt.get(p), g = /* @__PURE__ */ new Set();
      for (const h in u) {
        const f = (l = u[h]) == null ? void 0 : l.name;
        f && f !== "empty" && g.add(f);
      }
      for (const h of g)
        if (!d.has(h) && (d.add(h), Ut[h])) {
          const f = Ds(t, i, m), c = f.id > 0 ? ce(f.id) : f.name, y = Ut[h], S = js(f.id, h);
          let C = null;
          S !== null && a > 0 && (C = a - S), b.info({ playerName: p, cleanHeroName: c, item: h, hypeData: y, clockTime: a, averageTime: S, timingDiff: C }, "Power Spike Detected!"), e.of("/overlay").emit("POWER_SPIKE", {
            playerName: p,
            heroName: c,
            item: h,
            cleanItemName: y.name,
            categoryText: y.category,
            clockTime: a,
            averageTime: S,
            timingDiff: C
          });
        }
    }
  };
  n("team2"), n("team3");
}
const lt = {
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
}, $s = /* @__PURE__ */ new Set([
  69,
  // Doom
  86,
  // Rubick
  131
  // Ringmaster
]), Bs = /* @__PURE__ */ new Set([
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
]), Gs = /* @__PURE__ */ new Set([
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
function Ks(t, e, a, n) {
  if (e && lt[e] !== void 0)
    return lt[e];
  if (e && $s.has(e))
    return t;
  const r = a && e !== null && Gs.has(e), i = n && e !== null && Bs.has(e);
  return r || i ? Math.min(t, 6) : Math.min(t, 5);
}
function dn(t, e, a, n) {
  if (e && lt[e] !== void 0)
    return lt[e];
  if (!t || typeof t != "object") return 0;
  let r = 0;
  for (const [i, l] of Object.entries(t))
    if (i.startsWith("ability") && typeof l == "object" && l !== null) {
      const o = l;
      o.hidden !== !0 && typeof o.name == "string" && !o.name.startsWith("special_bonus") && o.name !== "generic_hidden" && o.name !== "empty" && r++;
    }
  return Ks(r, e, a, n);
}
function mn(t, e) {
  const a = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
  if (t && typeof t == "object")
    for (const [r, i] of Object.entries(t)) {
      const l = typeof i == "number" ? i : Number(i) || 0;
      if (r.startsWith("npc_dota_hero_"))
        a.set(r, l);
      else if (r.startsWith("victimid_")) {
        const o = parseInt(r.replace("victimid_", ""), 10);
        isNaN(o) || n.set(o, l);
      }
    }
  return e.map(({ heroClass: r, heroId: i, playerIndex: l }) => {
    let o = a.get(r) ?? 0;
    return n.has(l) && (o = Math.max(o, n.get(l) || 0)), {
      heroId: i ?? 0,
      heroClass: r,
      kills: o
    };
  });
}
function gn(t, e) {
  var r;
  const a = (r = t == null ? void 0 : t.hero) == null ? void 0 : r[e];
  if (!a || typeof a != "object") return [];
  const n = [];
  for (let i = 0; i <= 9; i++) {
    const l = a[`player${i}`];
    if (!l || typeof l != "object") continue;
    const o = l.name ?? l.hero_name ?? l.class, m = typeof o == "string" && o.startsWith("npc_dota_hero_") ? o : "", u = l.hero_id ?? l.heroid ?? l.id;
    let p = null;
    if (typeof u == "number" && u > 0)
      p = u;
    else if (typeof u == "string") {
      const d = Number(u);
      Number.isFinite(d) && d > 0 && (p = d);
    }
    (p || m) && n.push({ heroClass: m || `npc_dota_hero_unknown_${i}`, heroId: p, playerIndex: i });
  }
  return n;
}
function Ws(t) {
  var r;
  if (!t || typeof t != "object") return null;
  try {
    Sr.writeFileSync(
      "c:\\Users\\anian\\OneDrive\\Documents\\BPCL Production\\payload_dump.json",
      JSON.stringify(t.player, null, 2)
    );
  } catch (i) {
    console.error("Failed to write payload dump", i);
  }
  const e = t.player, a = t.hero;
  if (e && typeof e == "object" && a && typeof a == "object" && e.accountid && (a.hero_id || a.heroid || a.id)) {
    const i = parseInt(String(e.accountid), 10), l = a.hero_id ?? a.heroid ?? a.id;
    let o = null;
    if (typeof l == "number" && l > 0)
      o = l;
    else if (typeof l == "string") {
      const m = Number(l);
      Number.isFinite(m) && m > 0 && (o = m);
    }
    if (Number.isFinite(i) && i > 0 && o) {
      let m = "Unknown";
      typeof e.name == "string" && (m = e.name);
      const u = a.aghanims_shard === !0, p = a.aghanims_scepter === !0, d = typeof e.kills == "number" ? e.kills : Number(e.kills) || 0, g = typeof e.deaths == "number" ? e.deaths : Number(e.deaths) || 0, h = typeof e.assists == "number" ? e.assists : Number(e.assists) || 0, f = typeof e.last_hits == "number" ? e.last_hits : Number(e.last_hits) || 0, c = typeof e.denies == "number" ? e.denies : Number(e.denies) || 0;
      let y;
      const S = e.kill_list;
      for (const C of ["team2", "team3"]) {
        const w = (r = t == null ? void 0 : t.player) == null ? void 0 : r[C];
        if (w) {
          for (let k = 0; k <= 9; k++) {
            const _ = w[`player${k}`];
            if (_ != null && _.accountid && parseInt(String(_.accountid), 10) === i) {
              const M = gn(t, C === "team2" ? "team3" : "team2");
              y = mn(S || _.kill_list, M);
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
        abilityCount: dn(t.abilities, o, u, p),
        kills: d,
        deaths: g,
        assists: h,
        lastHits: f,
        denies: c,
        enemyHeroKills: y
      };
    }
  }
  const n = (i) => {
    var u, p, d;
    const l = (u = t.hero) == null ? void 0 : u[i], o = (p = t.player) == null ? void 0 : p[i], m = (d = t.abilities) == null ? void 0 : d[i];
    if (!l || !o) return null;
    for (let g = 0; g <= 9; g++) {
      const h = `player${g}`, f = l[h], c = o[h], y = m == null ? void 0 : m[h];
      if (f && typeof f == "object" && f.selected_unit === !0) {
        let S = null;
        const C = f.hero_id ?? f.heroid ?? f.id;
        if (typeof C == "number" && C > 0)
          S = C;
        else if (typeof C == "string") {
          const _ = Number(C);
          Number.isFinite(_) && _ > 0 && (S = _);
        }
        let w = null;
        if (c && typeof c == "object" && c.accountid) {
          const _ = parseInt(String(c.accountid), 10);
          Number.isFinite(_) && _ > 0 && (w = _);
        }
        let k = "Unknown";
        if (c && typeof c == "object" && typeof c.name == "string" && (k = c.name), S && w) {
          const _ = f.aghanims_shard === !0, P = f.aghanims_scepter === !0, M = typeof (c == null ? void 0 : c.kills) == "number" ? c.kills : Number(c == null ? void 0 : c.kills) || 0, O = typeof (c == null ? void 0 : c.deaths) == "number" ? c.deaths : Number(c == null ? void 0 : c.deaths) || 0, V = typeof (c == null ? void 0 : c.assists) == "number" ? c.assists : Number(c == null ? void 0 : c.assists) || 0, L = typeof (c == null ? void 0 : c.last_hits) == "number" ? c.last_hits : Number(c == null ? void 0 : c.last_hits) || 0, J = typeof (c == null ? void 0 : c.denies) == "number" ? c.denies : Number(c == null ? void 0 : c.denies) || 0, $ = gn(t, i === "team2" ? "team3" : "team2"), Te = mn(c == null ? void 0 : c.kill_list, $);
          return {
            steam32: w,
            heroId: S,
            playerName: k,
            abilityCount: dn(y, S, _, P),
            kills: M,
            deaths: O,
            assists: V,
            lastHits: L,
            denies: J,
            enemyHeroKills: Te
          };
        }
      }
    }
    return null;
  };
  return n("team2") || n("team3");
}
const Vs = 10;
function fn(t) {
  const e = t.lane_efficiency_pct ?? t.lane_efficiency;
  return typeof e == "number" && Number.isFinite(e) ? e : 0;
}
function hn(t) {
  return t !== void 0 && t < 128;
}
function qs(t) {
  return typeof t == "number" && t > 0 && t < 4294967295;
}
function Ys(t) {
  const e = /* @__PURE__ */ new Map();
  if (!(t != null && t.length)) return e;
  const a = t.filter(
    (r) => qs(r.account_id) && typeof r.lane == "number" && r.lane > 0 && !r.is_roaming
  ), n = [...new Set(a.map((r) => r.lane))];
  for (const r of n) {
    const i = a.filter((h) => h.lane === r), l = i.filter((h) => hn(h.player_slot)), o = i.filter((h) => !hn(h.player_slot));
    if (l.length === 0 || o.length === 0) continue;
    const m = Math.max(0, ...l.map(fn)), u = Math.max(0, ...o.map(fn)), p = m - u;
    let d;
    Math.abs(p) <= Vs ? d = "draw" : d = p > 0 ? "win" : "loss";
    const g = d === "draw" ? "draw" : d === "win" ? "loss" : "win";
    for (const h of l) e.set(h.account_id, d);
    for (const h of o) e.set(h.account_id, g);
  }
  return e;
}
function zs(t, e, a) {
  return `${t}W · ${e}D · ${a}L`;
}
const pn = /* @__PURE__ */ new Map();
async function Qn(t, e) {
  var l, o, m;
  if (e <= 0) return;
  const a = pn.get(e);
  if (a) return a;
  const n = await t.playerProfile(e);
  if (!n.ok || !n.data) return;
  const r = n.data, i = ((l = r.profile) == null ? void 0 : l.avatarfull) ?? r.avatarfull ?? ((o = r.profile) == null ? void 0 : o.avatarmedium) ?? r.avatarmedium ?? ((m = r.profile) == null ? void 0 : m.avatar) ?? r.avatar;
  if (typeof i == "string" && i.startsWith("http"))
    return pn.set(e, i), i;
}
async function yn(t, e) {
  return Promise.all(
    t.map(async (a) => {
      var n;
      if ((n = a.avatarUrl) != null && n.trim()) return a;
      try {
        const r = await Qn(e, a.steam32);
        return r ? { ...a, avatarUrl: r } : a;
      } catch (r) {
        return b.warn({ err: r, steam32: a.steam32 }, "avatar fetch failed"), a;
      }
    })
  );
}
function Z(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : `${(t * 100).toFixed(1)}%`;
}
function ye(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t.toFixed(1);
}
function Zn(t) {
  return t === void 0 || Number.isNaN(t) ? "—" : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(Math.round(t));
}
function De(t, e) {
  return `${t}W / ${e}L`;
}
function ct(t) {
  const e = t.laneWins ?? 0, a = t.laneDraws ?? 0, n = t.laneLosses ?? 0;
  return e + a + n === 0 ? null : {
    label: "Lane",
    value: zs(e, a, n),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function er(t, e, a) {
  var r;
  const n = (r = a == null ? void 0 : a.find((i) => i.steam32 === e)) == null ? void 0 : r.avatarUrl;
  return n != null && n.trim() ? n : Qn(t, e);
}
function Js(t) {
  const e = t.games === 0 && t.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: e ? "Not played" : De(t.wins, t.losses),
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
function Xs(t, e, a, n) {
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
          sublabel: De(n.wins, n.losses)
        }
      ] : []
    ];
  const r = a.games - a.wins, i = `${ye(a.avgKills)} / ${ye(a.avgDeaths)} / ${ye(a.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: De(a.wins, r),
      sublabel: `${Z(a.winRate)} · ${a.games} league game${a.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(a.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: ye(a.avgKda),
      sublabel: `${i} per game`
    },
    {
      label: "Hero damage",
      value: Zn(a.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...ct(a) ? [ct(a)] : [],
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
function Qs(t, e) {
  if (!e || e.games === 0)
    return [
      {
        label: t,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  const a = e.games - e.wins, n = `${ye(e.avgKills)} / ${ye(e.avgDeaths)} / ${ye(e.avgAssists)}`;
  return [
    {
      label: `${t} — record`,
      value: De(e.wins, a),
      sublabel: `${Z(e.winRate)} · ${e.games} league game${e.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(e.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: ye(e.avgKda),
      sublabel: `${n} per game`
    },
    {
      label: "Hero damage",
      value: Zn(e.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...ct(e) ? [ct(e)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(e.avgGpm)} GPM`,
      sublabel: `${Math.round(e.avgLastHits)} avg last hits`
    }
  ];
}
function tr(t) {
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
async function je(t, e, a) {
  await de(t);
  const n = a[String(e)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  }, r = n.heroName ?? ce(e), i = se(e, r);
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
    statSlides: Js(n),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function Fe(t, e, a, n, r, i, l) {
  await de(t);
  const o = Fn(
    l,
    e,
    a
  ), m = r[String(a)], u = ce(a), p = se(a, u), d = await er(
    t,
    e,
    i
  );
  return {
    statsCardKind: "player-hero",
    steam32: e,
    playerLabel: n,
    heroId: a,
    heroName: u,
    ...p,
    playerAvatarUrl: d,
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
    playerHero: tr(o),
    statSlides: Xs(n, u, o, m),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function Zs(t, e) {
  return Rt(e, t);
}
async function ar(t, e, a, n, r) {
  await de(t);
  const i = Zs(e, n), l = await er(
    t,
    e,
    r
  ), o = Q(r ?? [], e);
  return {
    statsCardKind: "player-league",
    steam32: e,
    playerLabel: a,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl: l,
    teamLogoUrl: ps(o == null ? void 0 : o.teamKey),
    teamColor: o == null ? void 0 : o.teamColor,
    playerHero: tr(i),
    statSlides: Qs(a, i),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function nr(t, e, a) {
  await de(t);
  const n = await t.matchupBetween(e, a), r = n.ok && n.data && typeof n.data == "object" ? n.data : {}, i = typeof r.games_played == "number" ? r.games_played : void 0, l = typeof r.wins == "number" ? r.wins : typeof r.win == "number" ? r.win : void 0, o = ce(e) || `Hero ${e}`, m = ce(a) || `Hero ${a}`, u = l ?? 0, p = i !== void 0 ? i - u : 0;
  let d = o, g = m, h = u, f = p;
  p > u && (d = m, g = o, h = p, f = u);
  const c = [
    {
      label: "Games Played",
      value: i !== void 0 ? String(i) : "—"
    },
    {
      label: `${d} Won`,
      value: i !== void 0 ? String(h) : "—"
    },
    {
      label: `${g} Won`,
      value: i !== void 0 ? String(f) : "—"
    }
  ], y = se(e), S = se(a);
  return {
    heroAId: e,
    heroBId: a,
    heroAName: ce(e),
    heroBName: ce(a),
    heroAPortraitSlug: y.heroPortraitSlug,
    heroBPortraitSlug: S.heroPortraitSlug,
    heroAPortraitUrl: y.heroPortraitUrl,
    heroBPortraitUrl: S.heroPortraitUrl,
    matchup: r,
    statLines: c,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: n.ok ? "opendota_cached" : "stale"
  };
}
function Wt(t, e = 4e3) {
  var n, r, i;
  const a = t.statSlides && t.statSlides.length > 0 ? t.statSlides : [
    {
      label: "Win Rate",
      value: Z((n = t.tournament) == null ? void 0 : n.winRate),
      sublabel: t.tournament ? De(t.tournament.wins ?? 0, t.tournament.losses ?? 0) : void 0
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
async function eo(t) {
  return await de(t), ys();
}
function to() {
  var e;
  const t = (e = E.LEAGUE_MATCH_IDS) == null ? void 0 : e.trim();
  return t ? t.split(/[,\s]+/).map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0) : [];
}
async function ao(t, e) {
  var l, o, m, u;
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
    const d = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${p}`, g = await fetch(d);
    if (!g.ok) {
      const S = await g.text();
      throw new Error(`Steam match history HTTP ${g.status}: ${S.slice(0, 200)}`);
    }
    const h = await g.json(), f = (o = h.result) == null ? void 0 : o.status, c = ((m = h.result) == null ? void 0 : m.matches) ?? [];
    if (f !== void 0 && f !== 1 && c.length === 0)
      throw new Error(
        `Steam GetMatchHistory status ${f} for league ${t} (no matches in response)`
      );
    if (c.length === 0) break;
    for (const S of c)
      typeof S.match_id == "number" && S.match_id > 0 && n.push(S.match_id);
    const y = (u = c[c.length - 1]) == null ? void 0 : u.match_id;
    if (y === void 0 || c.length < 100) break;
    r = y - 1;
  }
  const i = [...new Set(n)].slice(0, e);
  return b.info({ leagueId: t, count: i.length }, "Steam league match IDs loaded"), i;
}
async function no(t, e = 80) {
  var o, m;
  const a = to(), n = [];
  if (!((o = E.STEAM_WEB_API_KEY) != null && o.trim()) && a.length === 0)
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  let r = [];
  if ((m = E.STEAM_WEB_API_KEY) != null && m.trim())
    try {
      r = await ao(t, e);
    } catch (u) {
      const p = u instanceof Error ? u.message : String(u);
      b.warn({ err: u, leagueId: t }, "Steam league match history failed"), n.push(p);
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
function _t() {
  return [
    R.resolve(process.cwd(), "data/league-stats"),
    R.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function ue() {
  var a;
  const t = (a = E.LEAGUE_STATS_DIR) == null ? void 0 : a.trim();
  if (t)
    return R.isAbsolute(t) ? t : R.resolve(process.cwd(), t);
  const e = E.LEAGUE_ID;
  for (const n of _t())
    if (Ba(R.join(n, `league_${e}_heroes.csv`)))
      return n;
  for (const n of _t())
    if (Ba(n)) return n;
  return _t()[0];
}
function bn(t) {
  const e = ue(), a = Oe(t);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${t}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${t}_heroes.csv into ${e}`,
    leagueId: t,
    statsDir: e,
    expectedFiles: [a.heroes, a.playerHeroes]
  };
}
function Sn(t, e) {
  const a = ue(), n = Oe(t);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${a}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId: t,
    statsDir: a,
    expectedFiles: [n.heroes, n.playerHeroes],
    statsStorage: e
  };
}
function Oe(t) {
  const e = ue();
  return {
    dir: e,
    heroes: R.join(e, `league_${t}_heroes.csv`),
    playerHeroes: R.join(e, `league_${t}_player_heroes.csv`),
    meta: R.join(e, `league_${t}_meta.json`)
  };
}
async function Re(t) {
  try {
    return await wr(t), !0;
  } catch {
    return !1;
  }
}
function ro(t) {
  const e = String(t);
  return /[",\n\r]/.test(e) ? `"${e.replace(/"/g, '""')}"` : e;
}
function so(t) {
  const e = [];
  let a = "", n = !1;
  for (let r = 0; r < t.length; r++) {
    const i = t[r];
    n ? i === '"' ? t[r + 1] === '"' ? (a += '"', r++) : n = !1 : a += i : i === '"' ? n = !0 : i === "," ? (e.push(a), a = "") : a += i;
  }
  return e.push(a), e;
}
function wn(t) {
  return t.split(/\r?\n/).map((e) => e.trim()).filter((e) => e.length > 0 && !e.startsWith("#")).map(so);
}
function B(t, e, a = 0) {
  const n = Number(t[e]);
  return Number.isFinite(n) ? n : a;
}
function Ue(t, e) {
  const a = Number(t[e]);
  return Number.isFinite(a) ? a : void 0;
}
function oo(t) {
  const e = t.kills ?? 0, a = t.deaths ?? 0, n = t.assists ?? 0;
  return !(e === 0 && a === 0 && n === 0 || (t.leaver_status ?? 0) >= 3);
}
function rr(t) {
  return t.games === 1 && t.kills === 0 && t.deaths === 0 && t.assists === 0;
}
function io(t) {
  return t.filter((e) => !rr(e));
}
function sr(t) {
  const e = {};
  for (const a of t) {
    if (a.games <= 0 || rr(a)) continue;
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
async function lo(t) {
  const e = Oe(t);
  if (!await Re(e.heroes))
    return null;
  try {
    const a = await ze(e.heroes, "utf8"), n = wn(a);
    if (n.length < 2) return null;
    const r = {};
    for (const o of n.slice(1)) {
      const m = B(o, 0);
      m <= 0 || (r[String(m)] = {
        heroId: m,
        heroName: o[1] || void 0,
        picks: B(o, 2),
        bans: B(o, 3),
        wins: B(o, 4),
        losses: B(o, 5),
        games: B(o, 6),
        pickRate: Ue(o, 7),
        banRate: Ue(o, 8),
        winRate: Ue(o, 9),
        contestRate: Ue(o, 10)
      });
    }
    let i = [];
    if (await Re(e.playerHeroes)) {
      const o = await ze(e.playerHeroes, "utf8"), m = wn(o);
      for (const u of m.slice(1)) {
        const p = B(u, 0), d = B(u, 1);
        p <= 0 || d <= 0 || i.push({
          steam32: p,
          heroId: d,
          games: B(u, 2),
          wins: B(u, 3),
          kills: B(u, 4),
          deaths: B(u, 5),
          assists: B(u, 6),
          heroDamage: B(u, 7),
          goldPerMin: B(u, 8),
          lastHits: B(u, 9),
          maxKills: B(u, 10),
          laneWins: B(u, 11),
          laneDraws: B(u, 12),
          laneLosses: B(u, 13)
        });
      }
      i = io(i);
    }
    let l = {
      leagueId: t,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await Re(e.meta)) {
      const o = JSON.parse(await ze(e.meta, "utf8"));
      l = { ...l, ...o, leagueId: t, source: "csv" };
    }
    return { heroIndex: r, playerHeroes: i, meta: l };
  } catch (a) {
    return b.warn({ err: a, leagueId: t }, "Failed to load league stats CSV"), null;
  }
}
async function co(t) {
  const { leagueId: e } = t.meta, a = Oe(e);
  await Ln(a.dir, { recursive: !0 });
  const r = ["heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate"];
  for (const o of Object.values(t.heroIndex).sort(
    (m, u) => m.heroId - u.heroId
  ))
    r.push(
      [
        o.heroId,
        ro(o.heroName ?? ""),
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
  await Ye(a.heroes, `# BPC league hero stats — league ${e}
${r.join(`
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
  return await Ye(
    a.playerHeroes,
    `# BPC league player×hero stats — league ${e}
${l.join(`
`)}
`,
    "utf8"
  ), await Ye(a.meta, `${JSON.stringify(t.meta, null, 2)}
`, "utf8"), { dir: a.dir, paths: a };
}
async function He(t) {
  const e = Oe(t), [a, n, r] = await Promise.all([
    Re(e.heroes),
    Re(e.playerHeroes),
    Re(e.meta)
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
const uo = 4294967295;
function mo(t) {
  const e = t.account_id;
  if (!(typeof e != "number" || !Number.isFinite(e)) && !(e <= 0 || e >= uo))
    return e;
}
class go {
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
      await de(a);
      const o = await no(e, n), m = o.matchIds;
      if (m.length === 0)
        throw new Error(
          o.warning ?? `No matches found for league ${e}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      o.warning && b.warn({ leagueId: e, warning: o.warning }, "League match resolve"), this.progress.matchTotal = m.length;
      const u = /* @__PURE__ */ new Map();
      let p = 0;
      for (let g = 0; g < m.length; g++) {
        const h = m[g];
        if (h === void 0) continue;
        b.info(
          { matchId: h, index: g + 1, total: m.length },
          "Aggregating league match"
        );
        let f = await a.matchDetails(h);
        (!f.ok || !((l = (i = f.data) == null ? void 0 : i.players) != null && l.length)) && (await a.requestMatchParse(h), f = await a.matchDetails(h)), f.ok && f.data && (f.data.leagueid != null && f.data.leagueid !== 0 && f.data.leagueid !== e ? b.warn(
          {
            matchId: h,
            expectedLeague: e,
            actualLeague: f.data.leagueid
          },
          "Skipping match — leagueid mismatch"
        ) : (this.ingestMatch(f.data, u), p += 1)), this.progress.matchDone = g + 1, this.progress.progress = Math.round(
          (g + 1) / Math.max(1, m.length) * 100
        ), r == null || r(this.getProgress());
      }
      if (p === 0)
        throw new Error(
          `Found ${m.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      const d = {};
      for (const [g, h] of u) {
        const f = h.wins + h.losses, c = p > 0 ? h.picks / p : 0, y = p > 0 ? h.bans / p : 0, S = c + y, C = f > 0 ? h.wins / f : void 0;
        d[String(g)] = {
          heroId: g,
          heroName: ce(g),
          picks: h.picks,
          bans: h.bans,
          wins: h.wins,
          losses: h.losses,
          games: f,
          pickRate: c,
          banRate: y,
          winRate: C,
          contestRate: S
        };
      }
      return this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: m.length,
        matchDone: m.length,
        heroIndex: d
      }, d;
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
    const n = e.radiant_win === !0, r = Ys(e.players);
    for (const i of this.resolvePickBans(e)) {
      const l = this.getAcc(a, i.hero_id);
      i.is_pick ? l.picks += 1 : l.bans += 1;
    }
    for (const i of e.players ?? []) {
      const l = mo(i);
      if (l === void 0 || typeof i.hero_id != "number")
        continue;
      const o = i.player_slot !== void 0 && i.player_slot < 128 && n || i.player_slot !== void 0 && i.player_slot >= 128 && !n, m = this.getAcc(a, i.hero_id);
      o ? m.wins += 1 : m.losses += 1, oo(i) && this.trackPlayerHero(l, i.hero_id, o, i, r.get(l));
    }
  }
  isLeaverLikePlayerHeroAcc(e) {
    return e.games === 1 && e.kills === 0 && e.deaths === 0 && e.assists === 0;
  }
  trackPlayerHero(e, a, n, r, i) {
    let l = this.playerLeagueHeroes.get(e);
    l || (l = /* @__PURE__ */ new Map(), this.playerLeagueHeroes.set(e, l));
    const o = typeof r.kills == "number" ? r.kills : 0, m = typeof r.deaths == "number" ? r.deaths : 0, u = typeof r.assists == "number" ? r.assists : 0, p = typeof r.hero_damage == "number" ? r.hero_damage : 0, d = typeof r.gold_per_min == "number" ? r.gold_per_min : 0, g = typeof r.last_hits == "number" ? r.last_hits : 0, h = l.get(a) ?? {
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
    h.games += 1, n && (h.wins += 1), i === "win" ? h.laneWins += 1 : i === "draw" ? h.laneDraws += 1 : i === "loss" && (h.laneLosses += 1), h.kills += o, h.deaths += m, h.assists += u, h.heroDamage += p, h.goldPerMin += d, h.lastHits += g, o > h.maxKills && (h.maxKills = o), l.set(a, h);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(e) {
    const a = Er(e);
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
const ee = new go();
class Qe extends Error {
  constructor(e) {
    super(e), this.name = "LeagueStatsNotReadyError";
  }
}
function fo(t) {
  var e;
  return ((e = t.leagueConfig) == null ? void 0 : e.aggregationStatus) === "ready" && ee.getProgress().status === "ready";
}
function Ae(t) {
  var a, n;
  const e = ((a = t.leagueConfig) == null ? void 0 : a.aggregationStatus) ?? "idle";
  if (e === "running")
    throw new Qe(
      "League stats aggregation is still running — wait for it to finish"
    );
  if (e === "error")
    throw new Qe(
      ((n = t.leagueConfig) == null ? void 0 : n.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  if (!fo(t))
    throw new Qe(
      "League stats not ready — run tournament aggregate first"
    );
}
function X(t) {
  return t && typeof t == "object" ? t : null;
}
function W(t, e = 0) {
  if (typeof t == "number" && Number.isFinite(t)) return t;
  if (typeof t == "string") {
    const a = Number(t);
    if (Number.isFinite(a)) return a;
  }
  return e;
}
function ne(t) {
  const e = X(t);
  return e ? W(e.id ?? e.item_id ?? e.itemid, 0) : 0;
}
function ho(t, e, a, n, r, i) {
  const l = n < 128, o = r ? l : !l, m = W((e == null ? void 0 : e.hero_id) ?? (e == null ? void 0 : e.heroid) ?? (e == null ? void 0 : e.id), 0) || void 0, u = typeof (e == null ? void 0 : e.name) == "string" ? e.name : void 0, p = ne((a == null ? void 0 : a.slot0) ?? (a == null ? void 0 : a.item0)), d = ne((a == null ? void 0 : a.slot1) ?? (a == null ? void 0 : a.item1)), g = ne((a == null ? void 0 : a.slot2) ?? (a == null ? void 0 : a.item2)), h = ne((a == null ? void 0 : a.slot3) ?? (a == null ? void 0 : a.item3)), f = ne((a == null ? void 0 : a.slot4) ?? (a == null ? void 0 : a.item4)), c = ne((a == null ? void 0 : a.slot5) ?? (a == null ? void 0 : a.item5)), y = ne((a == null ? void 0 : a.neutral0) ?? (a == null ? void 0 : a.neutral)), S = ne(a == null ? void 0 : a.backpack0), C = ne(a == null ? void 0 : a.backpack1), w = ne(a == null ? void 0 : a.backpack2), k = [p, d, g, h, f, c], _ = W((e == null ? void 0 : e.aghanims_scepter) ?? (e == null ? void 0 : e.has_scepter), 0), P = W((e == null ? void 0 : e.aghanims_shard) ?? (e == null ? void 0 : e.has_shard), 0), M = k.includes(108) || k.includes(271) || k.includes(127) || k.includes(256), O = k.includes(609) || k.includes(125);
  return {
    account_id: W(t.accountid, 0) || void 0,
    personaname: typeof t.name == "string" ? t.name : void 0,
    hero_id: m,
    hero_name: u,
    player_slot: n,
    leaver_status: W(t.leaver_status, 0),
    win: o ? 1 : 0,
    kills: W(t.kills, 0),
    deaths: W(t.deaths, 0),
    assists: W(t.assists, 0),
    hero_damage: W(t.hero_damage, 0),
    hero_healing: W(t.hero_healing ?? t.healer_damage, 0),
    gold_per_min: W(t.gpm ?? t.gold_per_min, 0),
    xp_per_min: W(t.xpm ?? t.xp_per_min, 0),
    net_worth: W(t.net_worth ?? t.networth, 0),
    last_hits: W(t.last_hits, 0),
    denies: W(t.denies, 0),
    lane_efficiency: W(t.lane_efficiency, 0),
    duration: i,
    item_0: p,
    item_1: d,
    item_2: g,
    item_3: h,
    item_4: f,
    item_5: c,
    item_neutral: y,
    backpack_0: S,
    backpack_1: C,
    backpack_2: w,
    aghanims_scepter: _ || M ? 1 : 0,
    aghanims_shard: P || O ? 1 : 0
  };
}
function _n(t, e, a, n, r, i) {
  const l = [];
  for (let o = 0; o < 5; o++) {
    const m = `player${o}`, u = X(t == null ? void 0 : t[m]);
    if (!u) continue;
    const p = X(e == null ? void 0 : e[m]) ?? null, d = X(a == null ? void 0 : a[m]) ?? null, g = n + o;
    l.push(
      ho(u, p, d, g, r, i)
    );
  }
  return l;
}
function po(t) {
  const e = X(t.map);
  if (!((typeof (e == null ? void 0 : e.game_state) == "string" ? e.game_state : "") === "DOTA_GAMERULES_STATE_POST_GAME"))
    return {
      match: { match_id: 0, players: [] },
      matchId: 0,
      isPostGame: !1
    };
  const r = (e == null ? void 0 : e.radiant_win) === !0 || (e == null ? void 0 : e.radiant_win) === "true" || (e == null ? void 0 : e.radiant_win) === 1, i = Math.max(1, W((e == null ? void 0 : e.clock_time) ?? (e == null ? void 0 : e.game_time), 0)), l = W((e == null ? void 0 : e.matchid) ?? (e == null ? void 0 : e.match_id), 0), o = X(t.player), m = X(t.hero), u = X(t.items), p = _n(
    X((o == null ? void 0 : o.team2) ?? (o == null ? void 0 : o.radiant)),
    X((m == null ? void 0 : m.team2) ?? (m == null ? void 0 : m.radiant)),
    X((u == null ? void 0 : u.team2) ?? (u == null ? void 0 : u.radiant)),
    0,
    r,
    i
  ), d = _n(
    X((o == null ? void 0 : o.team3) ?? (o == null ? void 0 : o.dire)),
    X((m == null ? void 0 : m.team3) ?? (m == null ? void 0 : m.dire)),
    X((u == null ? void 0 : u.team3) ?? (u == null ? void 0 : u.dire)),
    128,
    r,
    i
  );
  return { match: {
    match_id: l,
    duration: i,
    radiant_win: r,
    players: [...p, ...d]
  }, matchId: l, isPostGame: !0 };
}
let ve = 0, kt = null, fe = null, $e = 0, ie = null, kn = null, Se = 2, we = 2, Be = 0, Ge = 0, Ct = 0, It = null, Ke = null, Cn = 0, Ze = 0, et = 0, tt = 0, at = 0, We = 0;
const Pt = /* @__PURE__ */ new Map();
function In(t) {
  return (40 + 6 * Math.floor(Math.max(0, t) / 300)) * 5;
}
function yo() {
  return {
    radiant: { count: Ze, gold: et },
    dire: { count: tt, gold: at }
  };
}
const bo = 600;
function So(t, e) {
  var i, l;
  const a = (i = t == null ? void 0 : t.player) == null ? void 0 : i[e], n = (l = t == null ? void 0 : t.hero) == null ? void 0 : l[e];
  if (!a || !n) return [];
  const r = [];
  for (let o = 0; o < 5; o++) {
    const m = `player${o}`, u = a[m], p = n[m];
    u && p && p.aghanims_shard !== !0 && p.aghanims_shard !== 1 && r.push({
      id: m,
      net_worth: u.net_worth || 0
    });
  }
  return r.sort((o, m) => o.net_worth - m.net_worth).slice(0, 2).map((o) => o.id);
}
function wo(t, e, a, n) {
  var l, o, m, u, p, d, g, h;
  let r = null, i = !1;
  for (const f of a) {
    const c = (o = (l = t == null ? void 0 : t.player) == null ? void 0 : l[n]) == null ? void 0 : o[f], y = (u = (m = e == null ? void 0 : e.player) == null ? void 0 : m[n]) == null ? void 0 : u[f], S = (d = (p = t == null ? void 0 : t.hero) == null ? void 0 : p[n]) == null ? void 0 : d[f], C = (h = (g = e == null ? void 0 : e.hero) == null ? void 0 : g[n]) == null ? void 0 : h[f];
    if (!c || !y || !S || !C) continue;
    const w = (y.net_worth || 0) - (c.net_worth || 0), k = (y.gold_reliable || 0) + (y.gold_unreliable || 0) - ((c.gold_reliable || 0) + (c.gold_unreliable || 0)), _ = C.aghanims_shard === !0 || C.aghanims_shard === 1;
    if (!(S.aghanims_shard === !0 || S.aghanims_shard === 1) && _ && w > 800 || w >= 1300 && w <= 1800) {
      const M = y.net_worth || 0;
      r ? (i = !0, M < r.net_worth && (r = { id: f, nwDelta: w, goldDelta: k, net_worth: M })) : r = { id: f, nwDelta: w, goldDelta: k, net_worth: M };
    }
  }
  return r ? (i && b.warn(
    { teamKey: n, matches: a, selectedId: r.id },
    "Multiple candidates showed Tormentor kill delta in the same tick. Selected the one with lower net worth."
  ), { killed: !0, recipientId: `${n}-${r.id}`, nwDelta: r.nwDelta, goldDelta: r.goldDelta }) : { killed: !1 };
}
let At = 0, Pn = "";
function _o(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i, obs: l, replayManager: o } = t;
  e.post("/gsi", async (m, u) => {
    var C, w;
    const p = typeof m.query.token == "string" ? m.query.token : void 0;
    if (E.GSI_TOKEN && p !== E.GSI_TOKEN) {
      u.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const d = m.body;
    ve = Date.now(), await de(r);
    try {
      Us(d, i);
    } catch (k) {
      b.error(k, "Power spike evaluation failed");
    }
    const g = await a.getState(), h = ((C = g.leagueConfig) == null ? void 0 : C.roster) ?? [], f = ((w = g.leagueConfig) == null ? void 0 : w.matchSetup) ?? null, c = Ms(
      d,
      g.draft ?? null,
      h,
      f
    ), y = Ws(d);
    y && (c.focusedPlayerSteam32 = y.steam32, c.focusedPlayerHeroId = y.heroId, c.focusedPlayerName = y.playerName, c.focusedPlayerAbilityCount = y.abilityCount);
    const S = async () => {
      var Jt, Xt, Qt, Zt, ea, ta, aa, na, ra, sa, oa, ia, la, ca, ua, da, ma, ga, fa, ha, pa, ya, ba, Sa, wa, _a, ka, Ca, Ia, Pa, Aa, Ea, va, Ra, Ta, La, Na, Ha, Ma, xa, ja, Fa, Da, Oa, Ua, $a;
      const k = await a.getState();
      let _ = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: !0
        }
      };
      c.draftPatch && (_ = {
        ..._,
        draft: {
          ...k.draft ?? {
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
          ...c.draftPatch
        }
      });
      const P = ((Jt = d == null ? void 0 : d.map) == null ? void 0 : Jt.radiant_scan_cooldown) ?? 0, M = ((Xt = d == null ? void 0 : d.map) == null ? void 0 : Xt.dire_scan_cooldown) ?? 0, O = ((Qt = d == null ? void 0 : d.map) == null ? void 0 : Qt.radiant_glyph_cooldown) ?? 0, V = ((Zt = d == null ? void 0 : d.map) == null ? void 0 : Zt.dire_glyph_cooldown) ?? 0, L = ((ea = d == null ? void 0 : d.map) == null ? void 0 : ea.clock_time) || 0;
      (ta = d == null ? void 0 : d.map) != null && ta.game_time;
      const J = (aa = d == null ? void 0 : d.map) == null ? void 0 : aa.matchid, q = ((na = ie == null ? void 0 : ie.map) == null ? void 0 : na.clock_time) || 0;
      J !== void 0 && kn !== J ? (kn = J, fe = null, $e = 0, ie = null, Se = 2, we = 2, Be = 0, Ge = 0, Ct = 0, It = null, Ke = null, Ze = 0, et = 0, tt = 0, at = 0, We = 0, Pt.clear()) : (L < q || L < (fe || 0)) && (fe = null, $e = 0, ie = null, Se = 2, we = 2, Be = 0, Ge = 0);
      let $ = !1;
      if (d != null && d.events && Array.isArray(d.events)) {
        for (const v of d.events)
          if (v.game_time && v.game_time > $e) {
            if (v.event_type === "roshan_killed" && (Ke = v.killer_team === 2 ? "radiant" : v.killer_team === 3 ? "dire" : null), v.event_type === "first_blood" || v.event_type === "aegis_stolen" || v.event_type === "roshan_killed" || v.event_type === "kill_streak" && v.kill_streak >= 3) {
              const T = Date.now();
              T - Cn > 3e4 && (Cn = T, b.info({ event: v.event_type, game_time: v.game_time }, "Triggering auto-replay save via GSI event"), setTimeout(() => {
                o.triggerSaveReplay(30, l).catch((I) => b.error(I, "Auto-replay save failed"));
              }, 5e3));
            }
            $e = v.game_time;
          }
        const H = d.events.filter(
          (v) => v.event_type === "bounty_rune_pickup" && typeof v.game_time == "number"
        );
        if (H.length - We > 0) {
          $ = !0;
          const v = H.slice(We);
          We = H.length;
          const T = In(L), I = v.filter((G) => G.team === 2).length, F = v.filter((G) => G.team === 3).length;
          I > 0 && (Ze += I, et += T * I, b.info(
            { radiantPickups: I, goldPerRune: T, totalGold: T * I },
            "[bounty] Radiant bounty pickups (events array, 7.41d consumption-time)"
          )), F > 0 && (tt += F, at += T * F, b.info(
            { direPickups: F, goldPerRune: T, totalGold: T * F },
            "[bounty] Dire bounty pickups (events array, 7.41d consumption-time)"
          ));
        }
      }
      if (!$ && L > 0) {
        const H = L % 240, x = H <= 30 || H >= 210, v = In(L);
        for (const [T, I] of [["team2", "radiant"], ["team3", "dire"]]) {
          const F = (ra = d == null ? void 0 : d.player) == null ? void 0 : ra[T];
          if (F)
            for (let G = 0; G < 5; G++) {
              const Y = `player${G}`, U = F[Y];
              if (!U) continue;
              const K = Number(U.rune_pickups ?? 0), ae = `${T}-${Y}`, me = Pt.get(ae) ?? K;
              if (K > me && x) {
                const oe = K - me;
                I === "radiant" ? (Ze += oe, et += v * oe) : (tt += oe, at += v * oe), b.debug(
                  { team: I, delta: oe, goldPerRune: v, cacheKey: ae },
                  "[bounty] Rune pickups delta fallback (near spawn window, 7.41d consumption-time)"
                );
              }
              Pt.set(ae, K);
            }
        }
      }
      if (L >= 1200 && (fe !== null ? L - fe : 1 / 0) >= bo && ie && d) {
        const x = L - q;
        if (x >= 0 && x <= 15) {
          let v = !1;
          for (const T of ["team2", "team3"]) {
            if (v) break;
            const I = So(ie, T), F = wo(ie, d, I, T);
            F.killed && (v = !0, fe = L, b.info(
              { recipientId: F.recipientId, nwDelta: F.nwDelta, goldDelta: F.goldDelta },
              "Detected Tormentor kill via net-worth delta"
            ));
          }
        }
      }
      ie = d;
      let Te = "dead", dt = 0, mt = "dead", gt = 0;
      if (L >= 1200) {
        const x = Math.floor((L - 1200) / 300) % 2 === 0;
        let v = !0, T = 0;
        if (fe !== null) {
          const I = L - fe;
          I >= 0 && I < 600 && (v = !1, T = 600 - I);
        }
        x ? (Te = v ? "alive" : "dead", dt = T) : (mt = v ? "alive" : "dead", gt = T);
      } else
        Te = "dead", dt = Math.max(0, 1200 - L), mt = "dead", gt = Math.max(0, 1200 - L);
      P === 0 ? Se = 2 : P > Be + 5 && (Se === 0 ? Se = 1 : Se -= 1), Be = P, M === 0 ? we = 2 : M > Ge + 5 && (we === 0 ? we = 1 : we -= 1), Ge = M;
      let ft = P, ht = M, pt = O, yt = V, Vt = Se, qt = we, Pe = (sa = d == null ? void 0 : d.map) == null ? void 0 : sa.roshan_state, Yt = (oa = d == null ? void 0 : d.map) == null ? void 0 : oa.roshan_state_end_seconds;
      if (L < 0 && (ft = 210, ht = 210, pt = 300, yt = 300, Vt = 0, qt = 0, Pe = "alive", Yt = 0), Pe && It === "alive" && Pe !== "alive" && L > 0) {
        Ct += 1;
        const H = Ct;
        let x = null, v;
        for (const [Y, U] of [["team2", "radiant"], ["team3", "dire"]]) {
          const K = (ia = d == null ? void 0 : d.items) == null ? void 0 : ia[Y];
          if (K)
            for (const ae of Object.keys(K)) {
              const me = K[ae];
              if (me) {
                for (const oe of Object.keys(me))
                  if (((la = me[oe]) == null ? void 0 : la.name) === "item_aegis") {
                    x = U, v = (da = (ua = (ca = d == null ? void 0 : d.player) == null ? void 0 : ca[Y]) == null ? void 0 : ua[ae]) == null ? void 0 : da.name;
                    break;
                  }
              }
              if (x) break;
            }
          if (x) break;
        }
        const T = k.draft, I = (ma = k.leagueConfig) == null ? void 0 : ma.matchSetup;
        let F, G;
        x ? x === "radiant" ? (F = ((ga = T == null ? void 0 : T.radiant) == null ? void 0 : ga.name) ?? (I == null ? void 0 : I.radiantTeamKey) ?? "Radiant", G = ((fa = T == null ? void 0 : T.radiant) == null ? void 0 : fa.logoUrl) ?? (I != null && I.radiantTeamKey ? `/teams/${I.radiantTeamKey}.png` : void 0)) : (F = ((ha = T == null ? void 0 : T.dire) == null ? void 0 : ha.name) ?? (I == null ? void 0 : I.direTeamKey) ?? "Dire", G = ((pa = T == null ? void 0 : T.dire) == null ? void 0 : pa.logoUrl) ?? (I != null && I.direTeamKey ? `/teams/${I.direTeamKey}.png` : void 0)) : (F = void 0, G = void 0), b.info(
          { killNumber: H, clockTime: L, aegisTeam: x, teamName: F, killerTeam: Ke, pickerPlayerName: v },
          "[roshan] Roshan killed — emitting ROSHAN_KILLED event"
        ), i.of("/overlay").emit("ROSHAN_KILLED", {
          killNumber: H,
          clockTime: L,
          teamName: F,
          teamLogoUrl: G,
          killerTeam: Ke,
          pickerTeam: x,
          pickerPlayerName: v
        });
      }
      if (Pe && (It = Pe), _.minimapState = {
        roshanState: Pe,
        roshanRespawnTimer: Yt,
        tormentorRadiant: Te,
        tormentorRadiantRespawnTimer: dt,
        tormentorDire: mt,
        tormentorDireRespawnTimer: gt,
        radiantScanActive: ft === 0,
        radiantScanCooldown: ft,
        radiantScanCharges: Vt,
        direScanActive: ht === 0,
        direScanCooldown: ht,
        direScanCharges: qt,
        radiantGlyphActive: pt === 0,
        radiantGlyphCooldown: pt,
        direGlyphActive: yt === 0,
        direGlyphCooldown: yt
      }, y) {
        const H = c.focusedPlayerSteam32, x = c.focusedPlayerHeroId, v = c.focusedPlayerName, T = c.focusedPlayerAbilityCount;
        if (H && x) {
          const I = ((ya = k.livePlayerCard) == null ? void 0 : ya.steam32) !== H || ((ba = k.livePlayerCard) == null ? void 0 : ba.heroId) !== x || ((Sa = k.livePlayerCard) == null ? void 0 : Sa.abilityCount) !== T, F = ((wa = k.overlayVisibility) == null ? void 0 : wa.liveplayercard) !== "visible", G = (_a = y.enemyHeroKills) == null ? void 0 : _a.map((U) => {
            const K = U.heroId > 0 ? se(U.heroId) : {};
            return {
              heroId: U.heroId,
              heroClass: U.heroClass,
              heroPortraitSlug: K.heroPortraitSlug,
              heroPortraitUrl: K.heroPortraitUrl,
              kills: U.kills
            };
          }), Y = {
            liveKills: y.kills ?? 0,
            liveDeaths: y.deaths ?? 0,
            liveAssists: y.assists ?? 0,
            liveLastHits: y.lastHits ?? 0,
            liveDenies: y.denies ?? 0,
            enemyHeroKills: G
          };
          if (I || F) {
            const U = Q(h, H), K = (U == null ? void 0 : U.displayName) || v || "Unknown";
            _ = {
              ..._,
              ...I ? {
                livePlayerCard: {
                  steam32: H,
                  heroId: x,
                  playerLabel: K,
                  playerAvatarUrl: U == null ? void 0 : U.avatarUrl,
                  fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  source: "manual",
                  abilityCount: T,
                  ...Y
                }
              } : {
                livePlayerCard: {
                  ...k.livePlayerCard ?? {},
                  ...Y
                }
              },
              overlayVisibility: {
                ..._.overlayVisibility || {},
                liveplayercard: "visible"
              }
            };
          } else
            _ = {
              ..._,
              livePlayerCard: {
                ...k.livePlayerCard ?? {},
                ...Y
              }
            };
        }
      } else {
        const H = ((ka = k.overlayVisibility) == null ? void 0 : ka.liveplayercard) === "visible", x = k.livePlayerCard !== null && k.livePlayerCard !== void 0;
        (H || x) && (_ = {
          ..._,
          livePlayerCard: null,
          overlayVisibility: {
            ..._.overlayVisibility || {},
            liveplayercard: "hidden"
          }
        });
      }
      const lr = await a.patchState(_);
      await n.broadcastFull(lr);
      const Le = typeof ((Ca = d == null ? void 0 : d.map) == null ? void 0 : Ca.game_state) == "string" ? d.map.game_state : "", zt = Le === "DOTA_GAMERULES_STATE_POST_GAME" && Pn !== "DOTA_GAMERULES_STATE_POST_GAME";
      if (Pn = Le, zt || Le === "DOTA_GAMERULES_STATE_POST_GAME")
        try {
          const H = po(d), x = H.matchId || "post_game_transition", v = At === x && !zt;
          if (H.isPostGame && !v && H.match.players && H.match.players.length >= 2) {
            At = x;
            const I = Xn(H.match)[0];
            if (I) {
              const G = ((Ia = (await a.getState()).leagueConfig) == null ? void 0 : Ia.roster) ?? [], Y = I.accountId ? Q(G, I.accountId) : void 0, U = I.heroId ? se(I.heroId, I.heroName) : {}, K = {
                playerLabel: (Y == null ? void 0 : Y.displayName) ?? `Player ${I.accountId ?? "?"}`,
                heroId: I.heroId,
                heroName: I.heroName,
                steam32: I.accountId,
                ...U,
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
              if (K.playerLabel.startsWith("Player ") && I.accountId) {
                const me = I.side === "radiant" ? "team2" : "team3", oe = I.playerSlot < 128 ? I.playerSlot : I.playerSlot - 128, bt = (Ea = (Aa = (Pa = d == null ? void 0 : d.player) == null ? void 0 : Pa[me]) == null ? void 0 : Aa[`player${oe}`]) == null ? void 0 : Ea.name;
                typeof bt == "string" && bt.length > 0 && (K.playerLabel = bt);
              }
              const ae = await a.patchState({
                standoutPlayerCard: K,
                overlayVisibility: { standoutplayer: "visible" }
              });
              await n.broadcastFull(ae), b.info(
                { mvpScore: I.mvpScore, heroId: I.heroId, accountId: I.accountId },
                "[post-game] Standout Player auto-selected and pushed to overlay"
              );
            }
          }
        } catch (H) {
          b.error(H, "[post-game] MVP auto-selection failed");
        }
      (Le === "DOTA_GAMERULES_STATE_HERO_SELECTION" || Le === "DOTA_GAMERULES_STATE_STRATEGY_TIME") && (At = 0);
      const cr = ((va = c.draftPatch) == null ? void 0 : va.lastPick) && (!((Ra = k.draft) != null && Ra.lastPick) || c.draftPatch.lastPick.heroId !== k.draft.lastPick.heroId || c.draftPatch.lastPick.side !== k.draft.lastPick.side);
      if ((Ta = k.production) != null && Ta.autoShowStatsOnPick && cr) {
        try {
          Ae(k);
        } catch {
          return;
        }
        const H = (La = c.draftPatch) == null ? void 0 : La.lastPick;
        if (!H) return;
        const x = H.side === "dire" || H.side === "B" ? "dire" : "radiant", v = x === "radiant" ? ((Ha = (Na = c.draftPatch) == null ? void 0 : Na.radiant) == null ? void 0 : Ha.slots) ?? ((xa = (Ma = k.draft) == null ? void 0 : Ma.radiant) == null ? void 0 : xa.slots) : ((Fa = (ja = c.draftPatch) == null ? void 0 : ja.dire) == null ? void 0 : Fa.slots) ?? ((Oa = (Da = k.draft) == null ? void 0 : Da.dire) == null ? void 0 : Oa.slots), T = jn(x, H.heroId, v), I = T !== void 0 ? ut((Ua = k.leagueConfig) == null ? void 0 : Ua.matchSetup, x, T) : void 0, F = (($a = k.leagueConfig) == null ? void 0 : $a.roster) ?? [], G = I != null && I > 0 ? Q(F, I) : void 0, Y = G && I ? await Fe(
          r,
          I,
          H.heroId,
          G.displayName,
          k.tournamentHeroIndex ?? {},
          F,
          k.playerHeroIndex
        ) : await je(
          r,
          H.heroId,
          k.tournamentHeroIndex ?? {}
        ), U = Wt(Y), K = Date.now() + 12e3, ae = await a.patchState({
          heroStatsCard: Y,
          statCarousel: U,
          overlayVisibility: {
            herostats: { mode: "timed", until: K }
          }
        });
        await n.broadcastFull(ae);
      }
    };
    kt && clearTimeout(kt), kt = setTimeout(() => {
      S().catch((k) => b.error(k, "gsi apply failed"));
    }, 150), u.json({ ok: !0, inDraft: c.inDraft });
  }), e.get("/gsi/status", (m, u) => {
    u.json({
      lastSeen: ve ? new Date(ve).toISOString() : null,
      connected: Date.now() - ve < 5e3
    });
  });
}
function ko(t, e, a) {
  var n, r;
  (r = (n = setInterval(() => {
    (async () => {
      var i;
      if (Date.now() - ve > 8e3 && ve > 0 && (i = (await t.getState()).production) != null && i.gsiConnected) {
        const o = await t.patchState({
          production: { gsiConnected: !1 }
        });
        await e.broadcastFull(o);
      }
    })();
  }, 3e3)).unref) == null || r.call(n);
}
function Co(t) {
  const { app: e, state: a, io: n, broadcast: r, obs: i, opendota: l, replayManager: o } = t;
  e.use(
    "/api/replays/media",
    A,
    Me.static(E.REPLAY_FOLDER)
  ), e.get("/health/live", (d, g) => {
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
  }), e.get("/health/ready", async (d, g) => {
    try {
      await a.getState(), g.json({ ok: !0 });
    } catch {
      g.status(503).json({ ok: !1 });
    }
  }), e.get("/api/state", A, async (d, g) => {
    const h = await a.getState();
    g.json(h);
  }), e.patch("/api/state", A, async (d, g) => {
    try {
      const h = is(d.body), f = await a.patchState(h);
      await r.broadcastFull(f), g.json(f);
    } catch (h) {
      b.error(h, "state patch failed"), g.status(400).json({
        error: h instanceof Error ? h.message : "invalid patch"
      });
    }
  }), e.post("/api/state/reset", A, async (d, g) => {
    const h = Yn(), f = await a.replaceState(h);
    await r.broadcastFull(f), g.json(f);
  });
  const m = s.object({
    seconds: s.number().int().min(0).max(5999),
    label: s.string().optional()
  });
  async function u(d) {
    const g = await a.patchState({
      timers: { gameStartCountdown: d }
    });
    return await r.broadcastFull(g), g;
  }
  e.post(
    "/api/timers/game-start/start",
    A,
    async (d, g) => {
      var S, C;
      const h = m.safeParse(d.body);
      if (!h.success)
        return g.status(400).json({ error: h.error.flatten() });
      const f = ((S = h.data.label) == null ? void 0 : S.trim()) || be, c = Ga(
        h.data.seconds,
        f
      ), y = await u(c);
      g.json({ ok: !0, gameStartCountdown: (C = y.timers) == null ? void 0 : C.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/pause",
    A,
    async (d, g) => {
      var w, k, _, P;
      const f = (w = (await a.getState()).timers) == null ? void 0 : w.gameStartCountdown, c = (typeof ((k = d.body) == null ? void 0 : k.label) == "string" ? d.body.label.trim() : "") || (f == null ? void 0 : f.label) || be, y = typeof ((_ = d.body) == null ? void 0 : _.seconds) == "number" ? d.body.seconds : Je(f), S = Ka(y, c), C = await u(S);
      g.json({ ok: !0, gameStartCountdown: (P = C.timers) == null ? void 0 : P.gameStartCountdown });
    }
  ), e.post(
    "/api/timers/game-start/set",
    A,
    async (d, g) => {
      var w, k, _;
      const h = m.safeParse(d.body);
      if (!h.success)
        return g.status(400).json({ error: h.error.flatten() });
      const c = (w = (await a.getState()).timers) == null ? void 0 : w.gameStartCountdown, y = ((k = h.data.label) == null ? void 0 : k.trim()) || (c == null ? void 0 : c.label) || be, S = c != null && c.running ? Ga(h.data.seconds, y) : Ka(h.data.seconds, y), C = await u(S);
      g.json({ ok: !0, gameStartCountdown: (_ = C.timers) == null ? void 0 : _.gameStartCountdown });
    }
  );
  const p = s.object({
    host: s.string(),
    port: s.coerce.number(),
    password: s.string()
  });
  e.post("/api/obs/config", A, (d, g) => {
    const h = p.safeParse(d.body);
    if (!h.success) return g.status(400).json({ error: h.error.flatten() });
    i.configure(h.data), n.of(re.PRODUCER).emit(le.ACK, {
      kind: "obs:config",
      ok: !0
    }), g.json({ ok: !0 });
  }), e.post("/api/obs/connect", A, async (d, g) => {
    const h = d.body;
    if (h && typeof h == "object" && Object.keys(h).length) {
      const c = p.safeParse(h);
      if (!c.success)
        return g.status(400).json({ error: c.error.flatten() });
      i.configure(c.data);
    }
    const f = await i.connect();
    n.of(re.PRODUCER).emit(le.ACK, {
      kind: "obs:connect",
      ok: f.ok,
      error: f.error
    }), g.json(f);
  }), e.post("/api/obs/disconnect", A, async (d, g) => {
    await i.disconnect(), n.of(re.PRODUCER).emit(le.ACK, {
      kind: "obs:disconnect",
      ok: !0
    }), g.json({ ok: !0 });
  }), e.post("/api/obs/setup", A, async (d, g) => {
    const f = s.object({
      overlayBaseUrl: s.string().url().default("http://127.0.0.1:8080/overlay/")
    }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await ls(i, f.data);
    g.json(c);
  }), e.get("/api/obs/scenes", A, async (d, g) => {
    try {
      const h = await i.listScenes();
      g.json({ ok: !0, scenes: h });
    } catch (h) {
      g.status(500).json({
        ok: !1,
        error: h instanceof Error ? h.message : String(h)
      });
    }
  }), e.post("/api/obs/program-scene", A, async (d, g) => {
    const f = s.object({ sceneName: s.string() }).safeParse(d.body);
    if (!f.success)
      return g.status(400).json({ error: f.error.flatten() });
    const c = await i.setProgramScene(f.data.sceneName);
    n.of(re.PRODUCER).emit(le.ACK, {
      kind: "obs:setProgramScene",
      ok: c.ok,
      sceneName: f.data.sceneName,
      error: c.error
    }), await a.patchState({
      sceneHints: { desiredSceneName: f.data.sceneName }
    });
    const y = await a.getState();
    await r.broadcastFull(y), g.json(c);
  }), e.post(
    "/api/obs/scene-source",
    A,
    async (d, g) => {
      const f = s.object({
        sceneName: s.string(),
        sourceName: s.string(),
        visible: s.boolean()
      }).safeParse(d.body);
      if (!f.success)
        return g.status(400).json({ error: f.error.flatten() });
      const c = await i.setSourceVisible(f.data);
      g.json(c);
    }
  ), e.post(
    "/api/opendota/heroes/constants",
    A,
    async (d, g) => {
      const h = await l.heroesConstants();
      g.json(h);
    }
  ), e.post(
    "/api/opendota/player/:accountId/heroes",
    A,
    async (d, g) => {
      const h = await l.playerHeroStats(d.params.accountId);
      g.json(h);
    }
  ), e.post(
    "/api/opendota/hero/:heroId/matchups",
    A,
    async (d, g) => {
      const h = await l.heroMatchups(Number(d.params.heroId));
      g.json(h);
    }
  ), e.post(
    "/api/opendota/matchups/between",
    A,
    async (d, g) => {
      const f = s.object({
        heroA: s.number(),
        heroB: s.number()
      }).safeParse(d.body);
      if (!f.success)
        return g.status(400).json({ error: f.error.flatten() });
      const c = await l.matchupBetween(
        f.data.heroA,
        f.data.heroB
      );
      g.json(c);
    }
  ), e.post("/api/opendota/compose/hero-card", A, async (d, g) => {
    const f = s.object({
      accountId: s.number().optional(),
      heroId: s.number(),
      playerLabel: s.string(),
      persist: s.boolean().optional()
    }).safeParse(d.body);
    if (!f.success)
      return g.status(400).json({ error: f.error.flatten() });
    const c = await a.getState(), y = f.data.accountId !== void 0 ? Fn(
      c.playerHeroIndex,
      f.data.accountId,
      f.data.heroId
    ) : void 0;
    let S = "league", C;
    if (y && y.games > 0)
      C = {
        games: y.games,
        wins: y.wins,
        losses: y.games - y.wins
      };
    else if (f.data.accountId !== void 0) {
      S = "opendota_cached";
      const k = await l.playerHeroStats(f.data.accountId);
      if (k.ok && Array.isArray(k.data)) {
        const _ = k.data.find(
          (P) => P && typeof P == "object" && P.hero_id === f.data.heroId
        );
        _ && typeof _.games == "number" && (C = {
          games: _.games,
          wins: typeof _.win == "number" ? _.win : 0,
          losses: _.games - (typeof _.win == "number" ? _.win : 0)
        });
      }
      k.ok || (S = "stale");
    }
    const w = {
      playerLabel: f.data.playerLabel,
      heroId: f.data.heroId,
      playerHero: C,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: S
    };
    if (f.data.persist) {
      const k = await a.patchState({ heroStatsCard: w });
      return await r.broadcastFull(k), g.json({ ok: !0, card: w, persisted: k });
    }
    return g.json({ ok: !0, card: w });
  }), e.post("/api/opendota/compose/matchup-card", A, async (d, g) => {
    const f = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(d.body);
    if (!f.success)
      return g.status(400).json({ error: f.error.flatten() });
    const c = await l.matchupBetween(
      f.data.heroAId,
      f.data.heroBId
    ), y = {
      heroAId: f.data.heroAId,
      heroBId: f.data.heroBId,
      matchup: c.ok ? c.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: c.ok ? "opendota_cached" : "stale"
    };
    if (f.data.persist) {
      const S = await a.patchState({ matchupCard: y });
      return await r.broadcastFull(S), g.json({ ok: !0, upstream: c, matchupCard: y, persisted: S });
    }
    return g.json({ ok: !0, upstream: c, matchupCard: y });
  }), e.post("/api/opendota/cache/clear-memory", A, (d, g) => {
    l.purgeMemory(), g.json({ ok: !0 });
  }), e.get("/api/replays", A, async (d, g) => {
    try {
      const h = await o.getReplayState();
      g.json(h);
    } catch (h) {
      g.status(500).json({ error: h instanceof Error ? h.message : String(h) });
    }
  }), e.post("/api/replays/save", A, async (d, g) => {
    const f = s.object({ duration: s.number().nullable().optional() }).safeParse(d.body), c = f.success && f.data.duration || null, y = await o.triggerSaveReplay(c, i);
    g.json(y);
  }), e.post("/api/replays/next-match", A, async (d, g) => {
    const h = await o.nextMatch();
    g.json(h);
  }), e.post("/api/replays/generate-highlights", A, async (d, g) => {
    const f = s.object({ matchId: s.number() }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await o.generateHighlights(f.data.matchId);
    g.json(c);
  }), e.post("/api/replays/hotkey", A, async (d, g) => {
    const f = s.object({ hotkeyName: s.string() }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await i.triggerHotkeyByName(f.data.hotkeyName);
    g.json(c);
  }), e.post("/api/replays/hotkey-sequence", A, async (d, g) => {
    const f = s.object({
      keyId: s.string(),
      keyModifiers: s.object({
        shift: s.boolean().optional(),
        control: s.boolean().optional(),
        alt: s.boolean().optional(),
        command: s.boolean().optional()
      }).optional()
    }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await i.triggerHotkeyBySequence(f.data.keyId, f.data.keyModifiers || {});
    g.json(c);
  }), e.post("/api/replays/favorite", A, async (d, g) => {
    const f = s.object({ file: s.string(), favorite: s.boolean() }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await o.toggleFavorite(f.data.file, f.data.favorite);
    g.json({ ok: c });
  }), e.post("/api/replays/play", A, async (d, g) => {
    const f = s.object({ file: s.string() }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await o.playReplay(f.data.file, i);
    g.json(c);
  }), e.post("/api/replays/generate-preview", A, async (d, g) => {
    const f = s.object({ file: s.string() }).safeParse(d.body);
    if (!f.success) return g.status(400).json({ error: f.error.flatten() });
    const c = await o.generatePreview(f.data.file);
    g.json(c);
  }), e.post("/api/standout/compute", A, async (d, g) => {
    var J;
    const f = s.object({
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
    }).safeParse(d.body);
    if (!f.success)
      return g.status(400).json({ error: f.error.flatten() });
    const { matchId: c, persist: y } = f.data, S = { ...Jn, ...f.data.weights ?? {} }, C = await l.matchDetails(c);
    if (!C.ok || !C.data)
      return g.status(502).json({
        error: `OpenDota match fetch failed: ${C.error ?? "no data"}`
      });
    const w = C.data;
    if (Array.isArray(w.players) && w.duration)
      for (const q of w.players)
        q.duration = w.duration;
    if (await de(l), Array.isArray(w.players)) {
      for (const q of w.players)
        if (q.hero_id && !q.hero_name) {
          const $ = se(q.hero_id);
          q.hero_name = $.heroPortraitSlug ?? String(q.hero_id);
        }
    }
    const k = Xn(w, S), _ = k[0];
    if (!_)
      return g.status(422).json({ error: "No players found in match" });
    const M = ((J = (await a.getState()).leagueConfig) == null ? void 0 : J.roster) ?? [], O = _.accountId ? Q(M, _.accountId) : void 0, V = _.heroId ? se(_.heroId, _.heroName) : {}, L = {
      playerLabel: (O == null ? void 0 : O.displayName) ?? _.personaname ?? `Player ${_.accountId ?? "?"}`,
      heroId: _.heroId,
      heroName: _.heroName,
      steam32: _.accountId,
      ...V,
      xpm: _.raw.xpm,
      gpm: _.raw.gpm,
      networth: _.raw.networth,
      kills: _.raw.kills,
      deaths: _.raw.deaths,
      assists: _.raw.assists,
      heroDamage: _.raw.heroDamage,
      lastHits: _.raw.lastHits,
      teamKills: _.raw.teamKills,
      items: _.raw.items,
      hasScepter: _.raw.hasScepter,
      hasShard: _.raw.hasShard
    };
    if (y) {
      const q = await a.patchState({
        standoutPlayerCard: L,
        overlayVisibility: { standoutplayer: "visible" }
      });
      return await r.broadcastFull(q), g.json({ ok: !0, winner: _, ranked: k, standoutCard: L, persisted: !0 });
    }
    return g.json({ ok: !0, winner: _, ranked: k, standoutCard: L, persisted: !1 });
  }), e.post("/api/standout/push", A, async (d, g) => {
    var _;
    const f = s.object({
      card: s.record(s.unknown()),
      show: s.boolean().optional().default(!0)
    }).safeParse(d.body);
    if (!f.success)
      return g.status(400).json({ error: f.error.flatten() });
    const c = f.data.card;
    if (c.heroPortraitSlug = void 0, c.heroPortraitUrl = void 0, typeof c.heroId == "number") {
      const P = se(
        c.heroId,
        typeof c.heroName == "string" ? c.heroName : void 0
      );
      Object.assign(c, P);
    }
    const S = ((_ = (await a.getState()).leagueConfig) == null ? void 0 : _.roster) ?? [], C = typeof c.steam32 == "number" ? Q(S, c.steam32) : void 0;
    c.playerLabel = (C == null ? void 0 : C.displayName) ?? (typeof c.personaname == "string" ? c.personaname : void 0) ?? `Player ${c.steam32 ?? "?"}`;
    const w = {
      standoutPlayerCard: c
    };
    f.data.show && (w.overlayVisibility = { standoutplayer: "visible" });
    const k = await a.patchState(w);
    await r.broadcastFull(k), g.json({ ok: !0, standoutPlayerCard: k.standoutPlayerCard });
  }), e.post("/api/standout/hide", A, async (d, g) => {
    const h = await a.patchState({
      overlayVisibility: { standoutplayer: "hidden" }
    });
    await r.broadcastFull(h), g.json({ ok: !0 });
  }), e.post("/api/gsi/bounty-snapshot", A, async (d, g) => {
    var P, M, O, V;
    const h = await a.getState(), f = yo(), c = h.draft, y = (P = h.leagueConfig) == null ? void 0 : P.matchSetup, S = (M = h.leagueConfig) == null ? void 0 : M.seasonSlug, C = ((O = c == null ? void 0 : c.radiant) == null ? void 0 : O.name) ?? (y == null ? void 0 : y.radiantTeamKey) ?? "Radiant", w = ((V = c == null ? void 0 : c.dire) == null ? void 0 : V.name) ?? (y == null ? void 0 : y.direTeamKey) ?? "Dire", _ = {
      leagueTitle: Kr(S),
      radiant: {
        name: C,
        count: f.radiant.count,
        gold: f.radiant.gold
      },
      dire: {
        name: w,
        count: f.dire.count,
        gold: f.dire.gold
      }
    };
    n.of(re.OVERLAY).emit("BOUNTY_STATS", _), b.info(_, "[bounty] BOUNTY_STATS emitted to overlay"), g.json({ ok: !0, ..._ });
  });
}
const Ve = kr(_r);
class Io {
  constructor() {
    D(this, "dbFile", E.REPLAY_DB_FILE);
    D(this, "matchFile", E.REPLAY_MATCH_FILE);
    D(this, "lastCompletedFile", E.REPLAY_LAST_COMPLETED_FILE);
    D(this, "playbackDir", E.REPLAY_PLAYBACK_DIR);
    D(this, "replayFolder", E.REPLAY_FOLDER);
    D(this, "highlightsDir", E.HIGHLIGHTS_FOLDER || R.resolve(process.cwd(), "../../data/highlights"));
    D(this, "pendingDuration", null);
    D(this, "playbackState", "IDLE");
    D(this, "originalScene", null);
    // Temp folder for browser mp4 previews (inside build output or root)
    D(this, "previewCacheDir", R.resolve(process.cwd(), "public-preview-cache"));
    if (!N.existsSync(this.previewCacheDir))
      try {
        N.mkdirSync(this.previewCacheDir, { recursive: !0 });
      } catch (e) {
        b.error(e, "Failed to create preview cache directory");
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
      this.playbackState !== "IDLE" && n !== "Replay Stinger" && n !== "Replay" && (b.info(`Manual scene switch to ${n} detected. Cancelling replay sequence.`), this.playbackState = "IDLE", this.originalScene = null);
    }), e.on("MediaInputPlaybackEnded", async (a) => {
      const n = a.inputName;
      this.playbackState === "STINGER_IN" && n === "Stinger" ? (b.info("Stinger In ended, switching to Replay"), this.playbackState = "REPLAYING", await e.setCurrentScene("Replay"), await e.restartMediaInput("ReplayPlayer")) : this.playbackState === "REPLAYING" && n === "ReplayPlayer" ? (b.info("Replay ended, switching to Stinger Out"), this.playbackState = "STINGER_OUT", await e.setCurrentScene("Replay Stinger"), await e.restartMediaInput("Stinger")) : this.playbackState === "STINGER_OUT" && n === "Stinger" && (b.info("Stinger Out ended, restoring original scene"), this.playbackState = "IDLE", this.originalScene && (await e.setCurrentScene(this.originalScene), this.originalScene = null));
    });
  }
  async triggerSaveReplay(e, a) {
    this.pendingDuration = e;
    const n = await a.saveReplayBuffer();
    return n.ok || (this.pendingDuration = null), n;
  }
  async handleReplaySaved(e) {
    try {
      if (!e || !N.existsSync(e)) {
        b.error({ originalPath: e }, "Replay saved but file not found");
        return;
      }
      N.existsSync(this.replayFolder) || N.mkdirSync(this.replayFolder, { recursive: !0 });
      const a = R.basename(e), n = R.join(this.replayFolder, a);
      e !== n && (N.copyFileSync(e, n), N.unlinkSync(e));
      let r = 30, i = !1;
      this.pendingDuration !== null && (r = this.pendingDuration, this.pendingDuration = null, i = !0);
      try {
        const d = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${n}"`, g = await Ve(d), h = parseFloat(g.stdout.trim());
        !isNaN(h) && !i && (r = Math.round(h));
      } catch (d) {
        b.error(d, "Failed to probe duration of new replay");
      }
      const l = await this.getReplayState(), o = l.currentMatch;
      let m = 0;
      for (const d of l.replays)
        d.replayId > m && (m = d.replayId);
      const u = m + 1, p = `${o},${u},"${n}",0,${r}
`;
      if (!N.existsSync(this.dbFile)) {
        const d = R.dirname(this.dbFile);
        N.existsSync(d) || N.mkdirSync(d, { recursive: !0 }), N.writeFileSync(this.dbFile, `match,replay_id,"file",favorite,duration
`);
      }
      N.appendFileSync(this.dbFile, p, "utf-8"), b.info({ newPath: n, currentMatch: o, newReplayId: u }, "Saved new replay");
    } catch (a) {
      b.error(a, "Failed to handle saved replay");
    }
  }
  async getReplayState() {
    let e = 1, a = 0;
    const n = [];
    try {
      if (N.existsSync(this.matchFile)) {
        const r = N.readFileSync(this.matchFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (e = i);
      }
    } catch (r) {
      b.error(r, "Failed to read active match file");
    }
    try {
      if (N.existsSync(this.lastCompletedFile)) {
        const r = N.readFileSync(this.lastCompletedFile, "utf-8").trim(), i = parseInt(r, 10);
        isNaN(i) || (a = i);
      }
    } catch (r) {
      b.error(r, "Failed to read last completed match file");
    }
    try {
      if (N.existsSync(this.dbFile)) {
        const i = N.readFileSync(this.dbFile, "utf-8").split(/\r?\n/);
        for (let l = 1; l < i.length; l++) {
          const o = i[l].trim();
          if (!o) continue;
          const m = o.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (m) {
            const u = m[3];
            n.push({
              match: parseInt(m[1], 10),
              replayId: parseInt(m[2], 10),
              file: u,
              favorite: parseInt(m[4], 10) === 1,
              duration: parseInt(m[5], 10),
              filename: R.basename(u)
            });
          }
        }
      }
    } catch (r) {
      b.error(r, "Failed to read or parse replay database CSV");
    }
    return n.sort((r, i) => i.replayId - r.replayId), {
      currentMatch: e,
      lastCompletedMatch: a,
      replays: n
    };
  }
  async toggleFavorite(e, a) {
    try {
      if (!N.existsSync(this.dbFile))
        return !1;
      const r = N.readFileSync(this.dbFile, "utf-8").split(/\r?\n/), i = [];
      r.length > 0 && i.push(r[0]);
      let l = !1;
      const o = a ? "1" : "0";
      for (let m = 1; m < r.length; m++) {
        const u = r[m].trim();
        if (!u) continue;
        const p = u.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        p && p[3] === e ? (i.push(`${p[1]},${p[2]},"${p[3]}",${o},${p[5]}`), l = !0) : i.push(u);
      }
      return N.writeFileSync(this.dbFile, i.join(`
`) + `
`, "utf-8"), l;
    } catch (n) {
      return b.error(n, `Failed to toggle favorite for ${e}`), !1;
    }
  }
  async playReplay(e, a) {
    try {
      if (!N.existsSync(e))
        return { ok: !1, error: "File not found" };
      const r = (await this.getReplayState()).replays.find((d) => d.file === e), i = r ? r.duration : 30, l = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${e}"`, o = await Ve(l), m = parseFloat(o.stdout.trim()) || 40, u = Math.max(0, m - i);
      let p = e;
      if (u > 1) {
        N.existsSync(this.playbackDir) || N.mkdirSync(this.playbackDir, { recursive: !0 }), p = R.join(this.playbackDir, "current_replay.mp4");
        const d = `ffmpeg -y -ss ${u} -i "${e}" -t ${i} -c copy "${p}"`;
        b.info({ cmd: d }, "Running ffmpeg slice command"), await Ve(d);
      }
      if (a.isConnected()) {
        const d = await a.setInputSettings("ReplayPlayer", {
          local_file: p
        });
        if (!d.ok)
          return { ok: !1, error: `Failed to set OBS input settings: ${d.error}` };
        const g = await a.getCurrentProgramScene();
        g.ok && g.sceneName && g.sceneName !== "Replay Stinger" && g.sceneName !== "Replay" && (this.originalScene = g.sceneName), this.playbackState = "STINGER_IN";
        const h = await a.setCurrentScene("Replay Stinger");
        return h.ok || b.error({ error: h.error }, "Failed to switch to Replay Stinger scene"), await a.restartMediaInput("Stinger"), { ok: !0 };
      } else
        return { ok: !0, error: "Replay sliced, but OBS was not connected to play it." };
    } catch (n) {
      return b.error(n, "Failed to play replay"), { ok: !1, error: n instanceof Error ? n.message : String(n) };
    }
  }
  async generatePreview(e) {
    try {
      if (!N.existsSync(e))
        return { ok: !1, error: `Replay file not found: ${e}` };
      const a = R.basename(e);
      return { ok: !0, previewUrl: `/api/replays/media/${encodeURIComponent(a)}` };
    } catch (a) {
      return b.error(a, "Failed to generate preview url"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
  async nextMatch() {
    try {
      const a = (await this.getReplayState()).currentMatch;
      N.existsSync(R.dirname(this.lastCompletedFile)) || N.mkdirSync(R.dirname(this.lastCompletedFile), { recursive: !0 }), N.writeFileSync(this.lastCompletedFile, a.toString(), "utf-8"), this.generateHighlights(a).catch((r) => {
        b.error(r, "Failed to generate highlights in background");
      });
      const n = a + 1;
      return N.writeFileSync(this.matchFile, n.toString(), "utf-8"), b.info(`Advanced to match ${n}`), { ok: !0, currentMatch: n };
    } catch (e) {
      return b.error(e, "Failed to advance match"), { ok: !1, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async generateHighlights(e) {
    try {
      const n = (await this.getReplayState()).replays.filter((m) => m.match === e && m.favorite);
      if (n.length === 0)
        return b.info(`No favorite replays found for match ${e} to highlight`), { ok: !1, error: "No favorites" };
      N.existsSync(this.highlightsDir) || N.mkdirSync(this.highlightsDir, { recursive: !0 }), n.sort((m, u) => m.replayId - u.replayId);
      const r = R.join(this.highlightsDir, `concat_${e}.txt`), i = n.map((m) => `file '${m.file.replace(/\\/g, "/")}'`);
      N.writeFileSync(r, i.join(`
`) + `
`, "utf-8");
      const l = R.join(this.highlightsDir, `Match_${e}_Highlights.mp4`), o = `ffmpeg -y -f concat -safe 0 -i "${r}" -c copy "${l}"`;
      return b.info({ cmd: o }, "Generating highlights"), await Ve(o), b.info(`Generated highlights: ${l}`), { ok: !0, file: l };
    } catch (a) {
      return b.error(a, "Failed to generate highlights"), { ok: !1, error: a instanceof Error ? a.message : String(a) };
    }
  }
}
async function Po(t) {
  const { leagueId: e, state: a, broadcast: n, source: r } = t, i = r === "csv" ? await lo(e) : null;
  if (!i) return !1;
  ee.hydrateFromSnapshot(
    i.heroIndex,
    i.playerHeroes,
    i.meta.matchTotal,
    i.meta.matchDone
  );
  const l = await a.patchState({
    tournamentHeroIndex: i.heroIndex,
    playerHeroIndex: sr(i.playerHeroes),
    leagueConfig: {
      leagueId: e,
      aggregationStatus: "ready",
      aggregatedAt: i.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: i.meta.matchTotal,
      aggregationMatchDone: i.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: r,
      statsCsvDir: ue()
    }
  });
  return await n.broadcastFull(l), !0;
}
async function $t(t) {
  const e = await Po({ ...t, source: "csv" });
  return e && b.info(
    { leagueId: t.leagueId, dir: ue() },
    "League stats loaded from CSV"
  ), e;
}
async function or(t) {
  const { leagueId: e, state: a, opendota: n, broadcast: r } = t;
  if (ee.isBusy()) {
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
  await r.broadcastFull(i);
  try {
    const l = await ee.aggregateLeague(
      e,
      n,
      80,
      async (p) => {
        const d = await a.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: p.progress,
            aggregationMatchTotal: p.matchTotal,
            aggregationMatchDone: p.matchDone
          }
        });
        await r.broadcastFull(d);
      }
    ), o = ee.getProgress(), m = (/* @__PURE__ */ new Date()).toISOString();
    await co({
      heroIndex: l,
      playerHeroes: ee.exportPlayerHeroRows(),
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
      playerHeroIndex: sr(
        ee.exportPlayerHeroRows()
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
        statsCsvDir: ue()
      }
    });
    await r.broadcastFull(u), b.info(
      { leagueId: e, matches: o.matchTotal, dir: ue() },
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
    await r.broadcastFull(m);
  }
}
async function Ao(t) {
  var g, h, f, c;
  const { state: e, opendota: a, broadcast: n } = t, r = E.LEAGUE_ID, i = await e.getState();
  if ((((g = i.leagueConfig) == null ? void 0 : g.leagueId) !== r || ((h = i.leagueConfig) == null ? void 0 : h.leagueId) === null || ((f = i.leagueConfig) == null ? void 0 : f.leagueId) === void 0) && await e.patchState({
    leagueConfig: { leagueId: r, aggregationStatus: "idle" }
  }), await $t({
    leagueId: r,
    state: e,
    broadcast: n
  })) return;
  const u = ((c = (await e.getState()).leagueConfig) == null ? void 0 : c.aggregationStatus) === "ready", p = ee.getProgress().status === "ready";
  E.LEAGUE_AUTO_AGGREGATE && (!u || !p) && ee.getProgress().status !== "running" ? (b.info({ leagueId: r }, "Starting league aggregation (Steam match list + OpenDota details)"), or({ leagueId: r, state: e, opendota: a, broadcast: n })) : b.info(
    { leagueId: r, dir: ue() },
    "No league CSV found — place stats CSV or run manual aggregate in admin"
  );
}
function An() {
  return {
    leagueId: E.LEAGUE_ID,
    autoAggregate: E.LEAGUE_AUTO_AGGREGATE,
    statsDir: ue()
  };
}
function ir(t) {
  if (!t) return;
  const e = t.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(e) || /^#[0-9a-fA-F]{3}$/.test(e)) return e.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(e)) return `#${e.toLowerCase()}`;
}
function Eo(t) {
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
    const m = o.split(",").map((c) => c.trim());
    if (m.length < 2) continue;
    const u = m[0] ?? "Player", p = Number(m[1]);
    if (!Number.isFinite(p)) continue;
    let d, g, h, f;
    if (m.length >= 4) {
      if (d = m[2] || void 0, g = m[3] || void 0, m.length >= 5) {
        const c = m[4] ?? "";
        c.startsWith("http://") || c.startsWith("https://") ? f = c : h = ir(c);
      }
      if (m.length >= 6) {
        const c = m[5] ?? "";
        (c.startsWith("http://") || c.startsWith("https://")) && (f = c);
      }
    } else m.length === 3 && (g = m[2] || void 0, d = g == null ? void 0 : g.replace(/_/g, " "));
    r.push({ displayName: u, steam32: p, teamName: d, teamKey: g, teamColor: h, avatarUrl: f });
  }
  return r;
}
function vo(t) {
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
function Ro(t) {
  const e = "displayName,steam32,teamName,teamKey,teamColor,avatarUrl", a = t.map(
    (n) => [
      n.displayName,
      String(n.steam32),
      n.teamName ?? "",
      n.teamKey ?? "",
      n.teamColor ?? "",
      n.avatarUrl ?? ""
    ].map(vo).join(",")
  );
  return `${e}
${a.join(`
`)}
`;
}
function En(t) {
  const e = {};
  for (const a of t)
    !a.teamKey || !a.teamColor || e[a.teamKey] || (e[a.teamKey] = a.teamColor);
  return e;
}
function vn(t, e, a) {
  return t && t.map((n) => {
    if (n.type !== "pick") return n;
    const r = ut(a.matchSetup, e, n.order), i = Dr(a, e, n.order);
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
function To(t, e) {
  return {
    ...t,
    radiant: t.radiant ? {
      ...t.radiant,
      slots: vn(
        t.radiant.slots,
        "radiant",
        e
      )
    } : t.radiant,
    dire: t.dire ? {
      ...t.dire,
      slots: vn(t.dire.slots, "dire", e)
    } : t.dire
  };
}
function Rn(t, e, a) {
  var i, l, o, m;
  const n = Ft(e, t.radiantTeamKey), r = Ft(e, t.direTeamKey);
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
      logoUrlA: xe(n.teamKey),
      logoUrlB: xe(r.teamKey)
    },
    side: (a == null ? void 0 : a.side) ?? "radiant_first_pick",
    phase: (a == null ? void 0 : a.phase) ?? "bans",
    reserveSeconds: (a == null ? void 0 : a.reserveSeconds) ?? 0,
    radiant: {
      name: n.teamName,
      logoUrl: xe(n.teamKey),
      slots: (o = a == null ? void 0 : a.radiant) == null ? void 0 : o.slots
    },
    dire: {
      name: r.teamName,
      logoUrl: xe(r.teamKey),
      slots: (m = a == null ? void 0 : a.dire) == null ? void 0 : m.slots
    }
  };
}
const Bt = R.join(process.cwd(), "steam32-vanity-cache.json");
let _e = null;
function Lo() {
  if (_e) return _e;
  try {
    if (N.existsSync(Bt))
      return _e = JSON.parse(N.readFileSync(Bt, "utf-8")), b.info({ count: Object.keys(_e).length }, "[steam32] Loaded vanity cache from disk"), _e;
  } catch {
  }
  return _e = {}, _e;
}
function No(t) {
  try {
    N.writeFileSync(Bt, JSON.stringify(t, null, 2));
  } catch (e) {
    b.warn({ err: e }, "[steam32] Failed to persist vanity cache");
  }
}
function Ho(t, e) {
  return new Promise((a) => {
    const n = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${e}&vanityurl=${t}`;
    Nn.get(n, (r) => {
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
async function Mo(t, e) {
  if (!t) return null;
  const a = t.match(/\/profiles\/(\d+)/);
  if (a != null && a[1])
    return Number(BigInt(a[1]) - BigInt("76561197960265728"));
  const n = t.match(/\/id\/([^/?#]+)/);
  if (n != null && n[1]) {
    const r = n[1].trim().toLowerCase(), i = Lo();
    if (i[r] != null)
      return b.debug({ vanity: r, steam32: i[r] }, "[steam32] Cache hit"), i[r];
    if (!e)
      return b.warn({ vanity: r }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured"), null;
    const l = await Ho(r, e);
    return l != null && l > 0 ? (i[r] = l, No(i), b.info({ vanity: r, steam32: l }, "[steam32] Resolved & cached vanity → steam32")) : b.warn({ vanity: r }, "[steam32] Steam API could not resolve vanity URL"), l;
  }
  return b.warn({ url: t }, "[steam32] Unrecognized Steam profile URL format"), null;
}
function Ie(t) {
  return new Promise((e, a) => {
    Nn.get(t, (n) => {
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
async function xo(t) {
  const e = (t.seasonSlug || "season-1").trim().toLowerCase();
  b.info({ slug: e }, "Starting roster sync from bpcleague.in");
  let a = [];
  try {
    if (e === "latest" || e === "active")
      a = (await Ie("https://api.bpcleague.in/api/public/tournament")).teams || [];
    else {
      const l = await Ie(`https://api.bpcleague.in/api/public/seasons/${e}`);
      l.snapshot && l.snapshot.teams ? a = l.snapshot.teams : l.tournament && l.tournament.teams ? a = l.tournament.teams : l.participations && (a = l.participations.map((o) => o.team).filter(Boolean));
    }
  } catch (l) {
    throw b.error(l, "Failed to fetch season/tournament data from bpcleague.in"), l;
  }
  if (!a || a.length === 0)
    return b.warn("No teams found in bpcleague.in API response"), [];
  const n = [];
  for (const l of a) {
    const o = l.name.trim(), m = l.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), u = ir(l.accentColor) || "#ffffff";
    for (const p of l.players || [])
      n.push({ teamName: o, teamKey: m, teamColor: u, player: p });
  }
  b.info({ total: n.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const r = await Promise.all(
    n.map(
      ({ player: l }) => Mo(l.steamProfile || "", t.steamApiKey)
    )
  ), i = [];
  for (let l = 0; l < n.length; l++) {
    const { teamName: o, teamKey: m, teamColor: u, player: p } = n[l], d = r[l], g = p.displayName || p.name || "Player", h = p.roles || [], f = p.mmr;
    d != null && d > 0 ? i.push({ displayName: g, steam32: d, teamName: o, teamKey: m, teamColor: u, roles: h, mmr: f }) : b.warn({ displayName: g, url: p.steamProfile }, "[steam32] Could not resolve — player skipped");
  }
  return b.info({ count: i.length, total: n.length }, "Completed roster sync from bpcleague.in"), i;
}
async function jo(t) {
  var a;
  const e = (t || "season-1").trim().toLowerCase();
  b.info({ slug: e }, "Fetching tournament matches from bpcleague.in");
  try {
    let n;
    e === "latest" || e === "active" ? n = await Ie("https://api.bpcleague.in/api/public/tournament") : n = await Ie(`https://api.bpcleague.in/api/public/seasons/${e}`);
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
    return b.error(n, "Failed to fetch matches from bpcleague.in"), [];
  }
}
async function Fo() {
  b.info("Fetching seasons list from bpcleague.in");
  try {
    return ((await Ie("https://api.bpcleague.in/api/public/seasons")).seasons || []).map((a) => ({
      slug: a.slug,
      name: a.name || a.slug,
      isActive: a.isActive ?? !1
    }));
  } catch (t) {
    return b.error(t, "Failed to fetch seasons from bpcleague.in"), [];
  }
}
async function Do(t) {
  const e = t.trim().toLowerCase();
  b.info({ slug: e }, "Fetching season config from bpcleague.in");
  try {
    let a;
    return e === "latest" || e === "active" ? a = await Ie("https://api.bpcleague.in/api/public/tournament") : a = await Ie(`https://api.bpcleague.in/api/public/seasons/${e}`), a.season || a.tournament || null;
  } catch (a) {
    return b.error(a, "Failed to fetch season config from bpcleague.in"), null;
  }
}
class Oo {
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
    var e, a, n, r, i, l;
    if (!(!this.state || !this.opendota || !this.broadcast))
      try {
        const o = await this.state.getState(), m = ((e = o.leagueConfig) == null ? void 0 : e.roster) ?? [];
        if (m.length === 0) {
          b.debug("Autopilot: Roster is empty, skipping stats trigger");
          return;
        }
        const u = (a = o.leagueConfig) == null ? void 0 : a.matchSetup;
        let p = m;
        u != null && u.radiantTeamKey && (u != null && u.direTeamKey) && (p = m.filter(
          (f) => f.teamKey === u.radiantTeamKey || f.teamKey === u.direTeamKey
        )), p.length === 0 && (p = m);
        const d = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"], g = d[Math.floor(Math.random() * d.length)];
        b.info({ cardType: g }, "Autopilot: Triggering random stats card");
        const h = Date.now() + this.config.durationSeconds * 1e3;
        if (g === "player-league") {
          const f = p[Math.floor(Math.random() * p.length)], c = await ar(
            this.opendota,
            f.steam32,
            f.displayName,
            o.playerHeroIndex,
            m
          ), y = await this.state.patchState({
            heroStatsCard: c,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: h }
            }
          });
          await this.broadcast.broadcastFull(y), b.info({ player: f.displayName }, "Autopilot: Displayed player league stats");
        } else if (g === "player-hero") {
          const f = p[Math.floor(Math.random() * p.length)], c = o.playerHeroIndex ?? {}, y = `${f.steam32}:`, S = Object.keys(c).filter((P) => P.startsWith(y)).map((P) => Number(P.split(":")[1]));
          let C = 1;
          if (S.length > 0)
            C = S[Math.floor(Math.random() * S.length)];
          else {
            const P = Object.keys(o.tournamentHeroIndex ?? {});
            P.length > 0 && (C = Number(P[Math.floor(Math.random() * P.length)]));
          }
          const w = await Fe(
            this.opendota,
            f.steam32,
            C,
            f.displayName,
            o.tournamentHeroIndex ?? {},
            m,
            o.playerHeroIndex
          ), k = Wt(w, 4e3), _ = await this.state.patchState({
            heroStatsCard: w,
            statCarousel: k,
            overlayVisibility: {
              herostats: { mode: "timed", until: h }
            }
          });
          await this.broadcast.broadcastFull(_), b.info({ player: f.displayName, heroId: C }, "Autopilot: Displayed player-hero stats carousel");
        } else if (g === "tournament-hero") {
          const f = Object.keys(o.tournamentHeroIndex ?? {});
          if (f.length === 0) return;
          const c = Number(f[Math.floor(Math.random() * f.length)]), y = await je(
            this.opendota,
            c,
            o.tournamentHeroIndex ?? {}
          ), S = await this.state.patchState({
            heroStatsCard: y,
            statCarousel: null,
            overlayVisibility: {
              herostats: { mode: "timed", until: h }
            }
          });
          await this.broadcast.broadcastFull(S), b.info({ heroId: c }, "Autopilot: Displayed tournament hero stats");
        } else if (g === "matchup") {
          const f = [
            ...((r = (n = o.draft) == null ? void 0 : n.radiant) == null ? void 0 : r.slots) ?? [],
            ...((l = (i = o.draft) == null ? void 0 : i.dire) == null ? void 0 : l.slots) ?? []
          ].filter((w) => w.heroId && w.heroId > 0);
          let c = 1, y = 2;
          if (f.length >= 2) {
            const w = f[Math.floor(Math.random() * f.length)];
            let k = f[Math.floor(Math.random() * f.length)];
            for (; k.heroId === w.heroId && f.length > 1; )
              k = f[Math.floor(Math.random() * f.length)];
            c = w.heroId, y = k.heroId;
          } else {
            const w = Object.keys(o.tournamentHeroIndex ?? {});
            if (w.length >= 2)
              for (c = Number(w[Math.floor(Math.random() * w.length)]), y = Number(w[Math.floor(Math.random() * w.length)]); y === c; )
                y = Number(w[Math.floor(Math.random() * w.length)]);
          }
          const S = await nr(this.opendota, c, y), C = await this.state.patchState({
            matchupCard: S,
            overlayVisibility: {
              matchup: { mode: "timed", until: h }
            }
          });
          await this.broadcast.broadcastFull(C), b.info({ heroA: c, heroB: y }, "Autopilot: Displayed matchup comparison stats");
        }
      } catch (o) {
        b.error(o, "Autopilot: Error triggering stats card");
      }
  }
}
const ke = new Oo();
function qe(t, e) {
  return e instanceof Qe ? (t.status(503).json({ error: e.message }), !0) : !1;
}
function Uo(t) {
  const { app: e, state: a, broadcast: n, opendota: r, io: i } = t;
  ke.configure({}, { state: a, opendota: r, broadcast: n }), e.get("/api/league/info", A, async (l, o) => {
    var p;
    const m = await a.getState(), u = await He(E.LEAGUE_ID);
    o.json({
      ...An(),
      configuredInEnv: !0,
      leagueConfig: m.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: u,
      steamApiConfigured: !!E.STEAM_WEB_API_KEY,
      envMatchIdsConfigured: !!((p = E.LEAGUE_MATCH_IDS) != null && p.trim())
    });
  }), e.post("/api/league/config", A, async (l, o) => {
    const u = s.object({ leagueId: s.number() }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error });
    const p = await a.getState(), d = await a.patchState({
      leagueConfig: { ...p.leagueConfig, leagueId: u.data.leagueId }
    });
    await n.broadcastFull(d), o.json({ ok: !0, leagueConfig: d.leagueConfig });
  }), e.post("/api/league/aggregate", A, async (l, o) => {
    var u, p, d;
    if (ee.isBusy())
      return o.json({ ok: !0, started: !1, alreadyRunning: !0 });
    const m = await a.getState();
    ((u = m.leagueConfig) == null ? void 0 : u.aggregationStatus) === "running" && await a.patchState({
      leagueConfig: {
        leagueId: E.LEAGUE_ID,
        aggregationStatus: "idle",
        aggregationError: void 0
      }
    }), or({
      leagueId: ((p = m.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID,
      state: a,
      opendota: r,
      broadcast: n
    }), o.json({ ok: !0, started: !0, leagueId: ((d = m.leagueConfig) == null ? void 0 : d.leagueId) ?? E.LEAGUE_ID });
  }), e.post(
    "/api/league/stats/reload-csv",
    A,
    async (l, o) => {
      var d;
      const m = (d = (await a.getState()).leagueConfig) == null ? void 0 : d.leagueId;
      if (!await $t({
        leagueId: m ?? E.LEAGUE_ID,
        state: a,
        broadcast: n
      })) {
        const g = await He(m ?? E.LEAGUE_ID), h = g.heroesExists ? Sn(m ?? E.LEAGUE_ID, g) : { ...bn(m ?? E.LEAGUE_ID), statsStorage: g };
        return o.status(422).json(h);
      }
      const p = await a.getState();
      o.json({ ok: !0, leagueConfig: p.leagueConfig });
    }
  ), e.get(
    "/api/league/stats/storage",
    A,
    async (l, o) => {
      var p, d;
      const m = await He(E.LEAGUE_ID), u = await a.getState();
      o.json({
        ...m,
        statsDir: An().statsDir,
        aggregationSource: (p = u.leagueConfig) == null ? void 0 : p.aggregationSource,
        aggregatedAt: (d = u.leagueConfig) == null ? void 0 : d.aggregatedAt
      });
    }
  ), e.get(
    "/api/league/aggregate/status",
    A,
    async (l, o) => {
      const m = ee.getProgress(), u = await a.getState();
      o.json({
        ...m,
        inMemoryRunning: ee.isBusy(),
        leagueId: E.LEAGUE_ID,
        leagueConfig: u.leagueConfig
      });
    }
  ), e.post("/api/roster/upload", A, async (l, o) => {
    const u = s.object({ csv: s.string().min(1) }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const p = Eo(u.data.csv), d = await yn(p, r), g = En(d), h = await a.patchState({
      leagueConfig: { roster: d, teamColors: g, leagueId: E.LEAGUE_ID }
    });
    await n.broadcastFull(h), o.json({ ok: !0, count: d.length, teamColors: g, roster: d });
  }), e.post("/api/roster/sync-bpcleague", A, async (l, o) => {
    var p, d;
    const u = s.object({ seasonSlug: s.string().optional() }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    try {
      const g = u.data.seasonSlug || "season-1", h = await xo({
        seasonSlug: g,
        steamApiKey: E.STEAM_WEB_API_KEY
      }), f = await yn(h, r), c = En(f), y = E.ROSTER_CSV_PATH;
      await Ln(R.dirname(y), { recursive: !0 });
      const S = Ro(f);
      await Ye(y, S, "utf8");
      const C = await Do(g);
      let w = [];
      C && C.sponsorsConfig && Array.isArray(C.sponsorsConfig.sponsors) && (w = C.sponsorsConfig.sponsors.map((P) => ({
        title: P.title || P.name || "",
        subtitle: P.subtitle || "",
        imageUrl: P.imageUrl || P.logoUrl || P.logo || "",
        color: P.color || "#ffffff",
        isCoSponsor: P.isCoSponsor || !1
      }))), w.length === 0 && (w = [
        { title: "BPC", subtitle: "Gaming", isCoSponsor: !0, color: "#ffffff", imageUrl: "" },
        { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: !1, color: "#ff0000", imageUrl: "" }
      ]);
      const k = await a.getState(), _ = await a.patchState({
        leagueConfig: { roster: f, teamColors: c, leagueId: ((p = k.leagueConfig) == null ? void 0 : p.leagueId) ?? E.LEAGUE_ID, seasonSlug: g },
        sponsor: { banners: w, activeIndex: ((d = k.sponsor) == null ? void 0 : d.activeIndex) ?? 0 }
      });
      await n.broadcastFull(_), o.json({ ok: !0, count: f.length, teamColors: c, roster: f });
    } catch (g) {
      o.status(500).json({
        error: g instanceof Error ? g.message : "Internal Server Error during sync"
      });
    }
  }), e.get("/api/roster", A, async (l, o) => {
    var u;
    const m = await a.getState();
    o.json(((u = m.leagueConfig) == null ? void 0 : u.roster) ?? []);
  }), e.get("/api/teams", A, async (l, o) => {
    var p;
    const u = ((p = (await a.getState()).leagueConfig) == null ? void 0 : p.roster) ?? [];
    o.json(jt(u));
  }), e.post("/api/match/setup", A, async (l, o) => {
    var h, f;
    const m = Un.safeParse(l.body);
    if (!m.success)
      return o.status(400).json({ error: m.error.flatten() });
    const u = await a.getState(), p = ((h = u.leagueConfig) == null ? void 0 : h.roster) ?? [];
    if (p.length === 0)
      return o.status(400).json({ error: "upload roster first" });
    const { seriesBestOf: d, seriesGame: g } = m.data;
    if (g > d)
      return o.status(400).json({
        error: `Game ${g} is invalid for a BO${d} series`
      });
    try {
      const c = { ...m.data }, y = (f = u.leagueConfig) == null ? void 0 : f.matchSetup;
      !c.previousDrafts && (y != null && y.previousDrafts) && (c.previousDrafts = [...y.previousDrafts]), y && c.seriesGame > y.seriesGame && u.draft && (c.previousDrafts = c.previousDrafts ?? [], c.previousDrafts.push(u.draft)), c.seriesGame === 1 && (c.previousDrafts = []);
      const S = Rn(
        c,
        p,
        u.draft
      ), C = await a.patchState({
        leagueConfig: { matchSetup: c },
        draft: S,
        production: {
          playerMappingPublished: !1
        }
      });
      await n.broadcastFull(C), o.json({
        ok: !0,
        matchSetup: c,
        teams: jt(p),
        draft: C.draft
      });
    } catch (c) {
      o.status(400).json({
        error: c instanceof Error ? c.message : String(c)
      });
    }
  }), e.post(
    "/api/league/stats/resolve",
    A,
    async (l, o) => {
      var k, _, P;
      const m = await a.getState(), u = ((k = m.leagueConfig) == null ? void 0 : k.roster) ?? [];
      if (u.length === 0)
        return o.status(400).json({ error: "upload roster first" });
      const p = ((_ = m.leagueConfig) == null ? void 0 : _.leagueId) ?? E.LEAGUE_ID, d = await He(p);
      if (!await $t({
        leagueId: p,
        state: a,
        broadcast: n
      })) {
        const M = d.heroesExists ? Sn(p, d) : { ...bn(p), statsStorage: d };
        return o.status(422).json(M);
      }
      const h = await a.getState(), f = h.playerHeroIndex ?? {}, c = Object.keys(f).length, y = [];
      for (const M of u) {
        const O = `${M.steam32}:`;
        Object.keys(f).some((L) => L.startsWith(O)) || y.push(M.steam32);
      }
      const S = new Set(
        Object.keys(f).map((M) => Number(M.split(":")[0]))
      ), C = (P = u[0]) == null ? void 0 : P.steam32, w = C != null ? vt(f, C).games : 0;
      o.json({
        ok: !0,
        loaded: !0,
        rosterCount: u.length,
        csvPlayerCount: S.size,
        indexKeyCount: c,
        matchedRosterCount: u.length - y.length,
        missingSteam32: y,
        statsStorage: d,
        indexEmpty: c === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: w,
        leagueConfig: h.leagueConfig
      });
    }
  ), e.get(
    "/api/league/player/:steam32/stats-audit",
    A,
    async (l, o) => {
      var C, w;
      const m = Number(l.params.steam32);
      if (!Number.isFinite(m) || m <= 0)
        return o.status(400).json({ error: "invalid steam32" });
      const u = await a.getState(), p = u.playerHeroIndex ?? {}, d = `${m}:`, g = Object.entries(p).filter(([k]) => k.startsWith(d)).map(([k, _]) => ({
        heroId: Number(k.split(":")[1]),
        games: _.games,
        wins: _.wins
      })), h = vt(p, m), f = ((C = u.leagueConfig) == null ? void 0 : C.leagueId) ?? E.LEAGUE_ID, c = await He(f);
      let y = [];
      try {
        y = (await ze(c.playerHeroesPath, "utf8")).split(/\r?\n/).filter((_) => _.startsWith(`${m},`));
      } catch {
        y = [];
      }
      const S = y.reduce(
        (k, _) => k + (Number(_.split(",")[2]) || 0),
        0
      );
      o.json({
        steam32: m,
        leagueId: f,
        gamesInIndex: h.games,
        winsInIndex: h.wins,
        heroRows: g,
        csvRowCount: y.length,
        csvGamesSum: S,
        aggregationMatchTotal: (w = u.leagueConfig) == null ? void 0 : w.aggregationMatchTotal,
        hint: h.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : h.games < S ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  ), e.post(
    "/api/match/apply-player-mapping",
    A,
    async (l, o) => {
      var C, w, k, _, P;
      const m = s.object({ pickPlayers: On.optional() }).safeParse(l.body ?? {});
      if (!m.success)
        return o.status(400).json({ error: m.error.flatten() });
      const u = await a.getState(), p = (C = u.leagueConfig) == null ? void 0 : C.matchSetup, d = ((w = u.leagueConfig) == null ? void 0 : w.roster) ?? [], g = u.draft;
      if (!p)
        return o.status(400).json({ error: "save match setup first" });
      if (!g)
        return o.status(400).json({ error: "no draft state" });
      if (g.phase !== "done")
        return o.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      const h = m.data.pickPlayers, f = h ? {
        ...p,
        pickPlayers: {
          radiant: h.radiant ?? ((k = p.pickPlayers) == null ? void 0 : k.radiant),
          dire: h.dire ?? ((_ = p.pickPlayers) == null ? void 0 : _.dire)
        }
      } : p, c = {
        ...u.leagueConfig,
        roster: d,
        matchSetup: f
      }, y = To(g, c), S = await a.patchState({
        leagueConfig: { matchSetup: f },
        draft: y,
        production: {
          playerMappingPublished: !0
        }
      });
      await n.broadcastFull(S), o.json({
        ok: !0,
        matchSetup: (P = S.leagueConfig) == null ? void 0 : P.matchSetup,
        draft: S.draft,
        production: S.production
      });
    }
  ), e.post(
    "/api/draft/reset-overlay",
    A,
    async (l, o) => {
      var f, c, y;
      const m = await a.getState(), u = ((f = m.leagueConfig) == null ? void 0 : f.roster) ?? [], p = (c = m.leagueConfig) == null ? void 0 : c.matchSetup, d = (((y = m.production) == null ? void 0 : y.overlayDraftEpoch) ?? 0) + 1;
      let g = null;
      p && u.length > 0 && (g = Rn(
        p,
        u,
        null
      ));
      const h = await a.patchState({
        draft: g,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: !1,
          overlayDraftEpoch: d
        }
      });
      await n.broadcastFull(h), o.json({
        ok: !0,
        overlayDraftEpoch: d,
        draft: h.draft
      });
    }
  ), e.post("/api/league/team-colors", A, async (l, o) => {
    o.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  }), e.get("/api/heroes", A, async (l, o) => {
    const m = await eo(r);
    o.json(m);
  }), e.post("/api/stats/player-hero", A, async (l, o) => {
    var f;
    const u = s.object({
      steam32: s.number(),
      heroId: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const p = await a.getState();
    try {
      Ae(p);
    } catch (c) {
      if (qe(o, c)) return;
      throw c;
    }
    const d = ((f = p.leagueConfig) == null ? void 0 : f.roster) ?? [], g = Q(d, u.data.steam32) ?? {
      steam32: u.data.steam32,
      displayName: u.data.displayName ?? `Player ${u.data.steam32}`
    }, h = await Fe(
      r,
      u.data.steam32,
      u.data.heroId,
      g.displayName,
      p.tournamentHeroIndex ?? {},
      d,
      p.playerHeroIndex
    );
    if (u.data.persist) {
      const c = await a.patchState({
        heroStatsCard: h,
        statCarousel: null
      });
      return await n.broadcastFull(c), o.json({ ok: !0, card: h, persisted: c });
    }
    o.json({ ok: !0, card: h });
  }), e.post("/api/stats/player-league", A, async (l, o) => {
    var f;
    const u = s.object({
      steam32: s.number(),
      displayName: s.string().optional(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const p = await a.getState();
    try {
      Ae(p);
    } catch (c) {
      if (qe(o, c)) return;
      throw c;
    }
    const d = ((f = p.leagueConfig) == null ? void 0 : f.roster) ?? [], g = Q(d, u.data.steam32) ?? {
      steam32: u.data.steam32,
      displayName: u.data.displayName ?? `Player ${u.data.steam32}`
    }, h = await ar(
      r,
      u.data.steam32,
      g.displayName,
      p.playerHeroIndex,
      d
    );
    if (u.data.persist) {
      const c = await a.patchState({
        heroStatsCard: h,
        statCarousel: null
      });
      return await n.broadcastFull(c), o.json({ ok: !0, card: h, persisted: c });
    }
    o.json({ ok: !0, card: h });
  }), e.post(
    "/api/stats/tournament-hero",
    A,
    async (l, o) => {
      const u = s.object({
        heroId: s.number(),
        persist: s.boolean().optional()
      }).safeParse(l.body);
      if (!u.success)
        return o.status(400).json({ error: u.error.flatten() });
      const p = await a.getState();
      try {
        Ae(p);
      } catch (g) {
        if (qe(o, g)) return;
        throw g;
      }
      const d = await je(
        r,
        u.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
      if (u.data.persist) {
        const g = await a.patchState({
          heroStatsCard: d,
          statCarousel: null
        });
        return await n.broadcastFull(g), o.json({ ok: !0, card: d, persisted: g });
      }
      o.json({ ok: !0, card: d });
    }
  ), e.post("/api/stats/matchup", A, async (l, o) => {
    const u = s.object({
      heroAId: s.number(),
      heroBId: s.number(),
      persist: s.boolean().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error });
    await a.getState();
    const p = await nr(
      r,
      u.data.heroAId,
      u.data.heroBId
    );
    if (u.data.persist) {
      const d = await a.patchState({ matchupCard: p });
      return await n.broadcastFull(d), o.json({ ok: !0, card: p, persisted: d });
    }
    o.json({ ok: !0, card: p });
  }), e.post("/api/producer/h2h", A, async (l, o) => {
    var S;
    const u = s.object({
      player1Steam32: s.number(),
      player2Steam32: s.number()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error });
    const p = await a.getState(), d = ((S = p.leagueConfig) == null ? void 0 : S.roster) ?? [], g = Q(d, u.data.player1Steam32), h = Q(d, u.data.player2Steam32);
    if (!g || !h)
      return o.status(404).json({ error: "Players not found in roster" });
    try {
      Ae(p);
    } catch (C) {
      return o.status(503).json({ error: C.message });
    }
    const f = Rt(p.playerHeroIndex, u.data.player1Steam32), c = Rt(p.playerHeroIndex, u.data.player2Steam32), y = {
      player1: { ...g, stats: f },
      player2: { ...h, stats: c }
    };
    i.of("/overlay").emit("SHOW_H2H", y), o.json({ ok: !0, payload: y });
  }), e.post("/api/stats/carousel", A, async (l, o) => {
    var c, y, S, C, w, k, _;
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
    const p = await a.getState();
    try {
      Ae(p);
    } catch (P) {
      if (qe(o, P)) return;
      throw P;
    }
    const d = ((c = p.leagueConfig) == null ? void 0 : c.roster) ?? [];
    let g;
    if (u.data.type === "last-pick") {
      const P = (y = p.draft) == null ? void 0 : y.lastPick;
      if (!P) return o.status(400).json({ error: "no last pick" });
      const M = P.side === "dire" || P.side === "B" ? "dire" : "radiant", O = M === "radiant" ? (C = (S = p.draft) == null ? void 0 : S.radiant) == null ? void 0 : C.slots : (k = (w = p.draft) == null ? void 0 : w.dire) == null ? void 0 : k.slots, V = jn(M, P.heroId, O), L = V !== void 0 ? ut((_ = p.leagueConfig) == null ? void 0 : _.matchSetup, M, V) : void 0, J = L != null && L > 0 ? Q(d, L) : void 0;
      g = J && L ? await Fe(
        r,
        L,
        P.heroId,
        J.displayName,
        p.tournamentHeroIndex ?? {},
        d,
        p.playerHeroIndex
      ) : await je(
        r,
        P.heroId,
        p.tournamentHeroIndex ?? {}
      );
    } else if (u.data.type === "player-hero") {
      if (u.data.heroId === void 0 || u.data.steam32 === void 0)
        return o.status(400).json({ error: "steam32 and heroId required" });
      const P = Q(d, u.data.steam32);
      g = await Fe(
        r,
        u.data.steam32,
        u.data.heroId,
        (P == null ? void 0 : P.displayName) ?? "Player",
        p.tournamentHeroIndex ?? {},
        d,
        p.playerHeroIndex
      );
    } else {
      if (u.data.heroId === void 0)
        return o.status(400).json({ error: "heroId required" });
      g = await je(
        r,
        u.data.heroId,
        p.tournamentHeroIndex ?? {}
      );
    }
    const h = Wt(
      g,
      u.data.slideDurationMs ?? 4e3
    ), f = Date.now() + (u.data.overlaySeconds ?? 12) * 1e3;
    if (u.data.persist !== !1) {
      const P = await a.patchState({
        heroStatsCard: g,
        statCarousel: h,
        overlayVisibility: {
          herostats: { mode: "timed", until: f }
        }
      });
      return await n.broadcastFull(P), o.json({ ok: !0, card: g, carousel: h, persisted: P });
    }
    o.json({ ok: !0, card: g, carousel: h });
  }), e.post("/api/stats/stop", A, async (l, o) => {
    const m = await a.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await n.broadcastFull(m), o.json({ ok: !0, persisted: m });
  }), e.post("/api/production/settings", A, async (l, o) => {
    const u = s.object({
      autoShowStatsOnPick: s.boolean().optional(),
      playerMappingPublished: s.boolean().optional(),
      overlayDraftEpoch: s.number().optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    const p = await a.patchState({ production: u.data });
    await n.broadcastFull(p), o.json(p.production);
  }), e.get("/api/league/bpc-matches", A, async (l, o) => {
    const m = l.query.seasonSlug, u = await jo(m);
    o.json(u);
  }), e.get("/api/league/bpc-seasons", A, async (l, o) => {
    const m = await Fo();
    o.json(m);
  }), e.get("/api/autopilot/config", A, (l, o) => {
    o.json({
      config: ke.getConfig(),
      isActive: ke.isActive()
    });
  }), e.post("/api/autopilot/config", A, (l, o) => {
    const u = s.object({
      enabled: s.boolean().optional(),
      intervalMinutes: s.number().min(1).optional(),
      durationSeconds: s.number().min(5).optional(),
      cardTypes: s.array(s.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    }).safeParse(l.body);
    if (!u.success)
      return o.status(400).json({ error: u.error.flatten() });
    ke.configure(u.data), o.json({
      config: ke.getConfig(),
      isActive: ke.isActive()
    });
  }), e.post("/api/autopilot/trigger", A, async (l, o) => {
    await ke.triggerNow(), o.json({ ok: !0, msg: "Autopilot triggered successfully" });
  });
}
function Tn(t, e) {
  var r, i;
  if (t === "overlay")
    return !0;
  const a = e.handshake;
  let n = "";
  return typeof ((r = a.auth) == null ? void 0 : r.token) == "string" ? n = a.auth.token : typeof ((i = a.query) == null ? void 0 : i.token) == "string" && (n = a.query.token), n ? n === E.BROADCAST_SECRET : !1;
}
async function $o(t) {
  const { state: e, obs: a, opendota: n } = t, r = Me();
  r.use(pr({ crossOriginResourcePolicy: !1, contentSecurityPolicy: !1 })), r.disable("x-powered-by"), r.use((c, y, S) => {
    c.headers["access-control-request-private-network"] && y.setHeader("Access-Control-Allow-Private-Network", "true"), c.method === "OPTIONS" && c.headers.origin && (y.setHeader("Access-Control-Allow-Origin", c.headers.origin), y.setHeader("Access-Control-Allow-Credentials", "true"), y.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE"), y.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")), S();
  }), r.use(
    hr({
      origin: !0,
      credentials: !0
    })
  ), r.use(Me.json({ limit: "1mb" }));
  const i = R.dirname(Gt(import.meta.url)), l = R.join(i, "../../overlay-web/dist"), o = R.join(i, "../../admin-web/dist");
  r.use("/overlay", Me.static(l)), r.use("/admin", Me.static(o)), r.get("/admin", (c, y) => {
    const S = R.join(o, "index.html");
    y.sendFile(S, (C) => {
      C && y.status(500).send(`sendFile error for ${S}: ${C.message}`);
    });
  }), r.get("/admin/*", (c, y, S) => {
    if (c.path.includes(".")) return S();
    const C = R.join(o, "index.html");
    y.sendFile(C, (w) => {
      w && y.status(500).send(`sendFile error for ${C}: ${w.message}`);
    });
  }), r.get("/overlay", (c, y) => {
    const S = R.join(l, "index.html");
    y.sendFile(S, (C) => {
      C && y.status(500).send(`sendFile error for ${S}: ${C.message}`);
    });
  }), r.get("/overlay/*", (c, y, S) => {
    if (c.path.includes(".")) return S();
    const C = R.join(l, "index.html");
    y.sendFile(C, (w) => {
      w && y.status(500).send(`sendFile error for ${C}: ${w.message}`);
    });
  });
  const m = yr.createServer(r), u = new br(m, {
    cors: { origin: !0, credentials: !0 },
    transports: ["websocket", "polling"]
  }), p = new Io();
  p.init(a);
  const d = {
    async broadcastFull(c) {
      const y = c ?? await e.getState();
      u.of(re.OVERLAY).emit(le.STATE_FULL, y), u.of(re.PRODUCER).emit(
        le.STATE_FULL,
        y
      ), b.debug({ seq: y.seq }, "Emitted state snapshot");
    }
  };
  Co({
    app: r,
    state: e,
    io: u,
    broadcast: d,
    obs: a,
    opendota: n,
    replayManager: p
  }), Uo({
    app: r,
    state: e,
    io: u,
    broadcast: d,
    opendota: n
  }), _o({
    app: r,
    state: e,
    broadcast: d,
    opendota: n,
    io: u,
    replayManager: p,
    obs: a
  }), ko(e, d);
  const g = u.of(re.PRODUCER), h = u.of(re.OVERLAY);
  g.use((c, y) => {
    const S = Tn("producer", c);
    y(S ? void 0 : new Error("unauthorized producer"));
  }), h.use((c, y) => {
    const S = Tn("overlay", c);
    y(S ? void 0 : new Error("unauthorized overlay"));
  }), g.on("connection", (c) => {
    b.info({ id: c.id }, "producer connected"), e.getState().then((y) => {
      c.emit(le.STATE_FULL, y);
    });
  }), h.on("connection", (c) => {
    b.info({ id: c.id }, "overlay viewer connected"), e.getState().then((y) => {
      c.emit(le.STATE_FULL, y);
    });
  });
  const f = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(f) && f > 500) {
    const c = setInterval(() => {
      e.getState().then((y) => {
        u.of(re.OVERLAY).emit(le.STATE_FULL, y);
      });
    }, f);
    typeof c.unref == "function" && c.unref();
  }
  return { app: r, httpServer: m, io: u, broadcast: d };
}
async function Bo() {
  const t = await os(), e = new Pr(), a = new vr();
  E.REDIS_URL && a.attachRedis(E.REDIS_URL), de(a).catch(
    (i) => b.warn(i, "hero registry preload deferred")
  ), xs().catch(
    (i) => b.warn(i, "item timings preload deferred")
  );
  const n = await $o({ state: t, obs: e, opendota: a });
  await Ao({
    state: t,
    opendota: a,
    broadcast: n.broadcast
  }), n.httpServer.listen(E.PORT, () => {
    b.info(
      { port: E.PORT, leagueId: E.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const r = async () => {
    var i;
    b.info("Shutting down"), await n.io.close(), await e.disconnect(), await a.shutdown(), await ((i = t.shutdown) == null ? void 0 : i.call(t)), n.httpServer.close(), process.exit(0);
  };
  return process.on("SIGINT", () => void r()), process.on("SIGTERM", () => void r()), { obs: e, opendota: a, state: t, shutdown: r };
}
process.argv[1] && Gt(import.meta.url) === process.argv[1] && Bo().catch((t) => {
  b.error(t, "fatal startup"), process.exit(1);
});
export {
  Bo as bootstrapBroadcastServer
};

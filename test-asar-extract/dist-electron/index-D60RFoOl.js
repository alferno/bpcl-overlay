var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";
import pino from "pino";
import OBSWebSocket from "obs-websocket-js";
import Bottleneck from "bottleneck";
import { Redis } from "ioredis";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import { Server } from "socket.io";
import fs, { existsSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import https from "node:https";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(moduleDir, "../.env") });
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  BROADCAST_SECRET: z.string().min(8),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  STATE_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().optional(),
  REDIS_STATE_KEY: z.string().default("bpc:broadcast:v1"),
  REDIS_UNAVAILABLE_FALLBACK_MEMORY: z.coerce.boolean().default(false),
  OPENDOTA_RATE_PER_MINUTE: z.coerce.number().default(45),
  GSI_TOKEN: z.string().optional(),
  /** OpenDota league ID — required; all player stats are league-scoped only */
  LEAGUE_ID: z.coerce.number().int().positive(),
  /** Re-fetch league stats from Steam when API starts (if CSV missing). Prefer CSV + manual refresh. */
  LEAGUE_AUTO_AGGREGATE: z.coerce.boolean().default(false),
  /** Directory for league_{id}_heroes.csv and league_{id}_player_heroes.csv */
  LEAGUE_STATS_DIR: z.string().optional(),
  /** Steam Web API key — required to list amateur/private league matches */
  STEAM_WEB_API_KEY: z.string().optional(),
  /** Optional comma/space-separated match IDs (merged with Steam league history) */
  LEAGUE_MATCH_IDS: z.string().optional(),
  REPLAY_DB_FILE: z.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\replay_db.csv"),
  REPLAY_MATCH_FILE: z.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\active_match.txt"),
  REPLAY_LAST_COMPLETED_FILE: z.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\System\\last_completed_match.txt"),
  REPLAY_PLAYBACK_DIR: z.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\Playback"),
  REPLAY_FOLDER: z.string().default("C:\\Users\\anian\\Videos\\BPCL S2 Broadcast\\Replays")
});
const env = envSchema.parse(process.env);
function parseCorsOrigins() {
  return env.CORS_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean);
}
const logger = pino({
  level: process.env.LOG_LEVEL ?? "info"
});
class OBSController {
  constructor() {
    __publicField(this, "client", new OBSWebSocket());
    __publicField(this, "settings", null);
    __publicField(this, "reconnectTimer", null);
  }
  configure(settings) {
    this.settings = settings;
  }
  /** obs-websocket-js internal flag indicates identified session */
  isConnected() {
    try {
      return Boolean(this.client.identified);
    } catch {
      return false;
    }
  }
  async connect(overrides) {
    if (overrides) this.settings = overrides;
    if (!this.settings)
      return { ok: false, error: "OBS settings not configured" };
    try {
      if (this.isConnected())
        await this.client.disconnect();
      await this.client.connect(
        `ws://${this.settings.host}:${this.settings.port}`,
        this.settings.password
      );
      logger.info("OBS websocket connected");
      return { ok: true };
    } catch (err) {
      logger.error(err, "OBS websocket connect failed");
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.isConnected())
      await this.client.disconnect().catch(() => void 0);
    logger.info("OBS websocket disconnected");
  }
  async listScenes() {
    const data = await this.client.call("GetSceneList");
    const scenes = data.scenes ?? [];
    return scenes.map((s) => s.sceneName ?? "").filter(Boolean);
  }
  async setProgramScene(sceneName) {
    try {
      await this.client.call("SetCurrentProgramScene", { sceneName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async setSourceVisible(input) {
    try {
      const list = await this.client.call("GetSceneItemList", {
        sceneName: input.sceneName
      });
      const items = list.sceneItems ?? [];
      const item = items.find(
        (it) => typeof it.sceneItemId === "number" && it.sourceName === input.sourceName
      );
      if (!item) return { ok: false, error: "Scene item not found" };
      await this.client.call("SetSceneItemEnabled", {
        sceneName: input.sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: input.visible
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async triggerHotkeyByName(hotkeyName) {
    try {
      await this.client.call("TriggerHotkeyByName", { hotkeyName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async triggerHotkeyBySequence(keyId, keyModifiers) {
    try {
      await this.client.call("TriggerHotkeyByKeySequence", { keyId, keyModifiers });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async setInputSettings(inputName, inputSettings) {
    try {
      await this.client.call("SetInputSettings", { inputName, inputSettings });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async restartMediaInput(inputName) {
    try {
      await this.client.call("TriggerMediaInputAction", {
        inputName,
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART"
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  async setCurrentScene(sceneName) {
    try {
      await this.client.call("SetCurrentProgramScene", { sceneName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
  scheduleReconnect(delayMs = 3e3) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delayMs);
  }
}
const OPEN_DOTA_BASE = "https://api.opendota.com/api";
function getMatchPickBans(match) {
  const rows = match.picks_bans ?? match.pick_bans;
  return Array.isArray(rows) ? rows : [];
}
class OpenDotaClient {
  constructor(ttlSeconds = 600) {
    __publicField(this, "limiter");
    __publicField(this, "memory", /* @__PURE__ */ new Map());
    __publicField(this, "redis", null);
    this.ttlSeconds = ttlSeconds;
    const perMinute = env.OPENDOTA_RATE_PER_MINUTE;
    const minTime = Math.max(750, Math.floor(6e4 / Math.max(1, perMinute)));
    this.limiter = new Bottleneck({
      minTime,
      maxConcurrent: 1,
      reservoir: Math.max(1, perMinute),
      reservoirRefreshAmount: Math.max(1, perMinute),
      reservoirRefreshInterval: 60 * 1e3
    });
  }
  attachRedis(url) {
    this.redis = new Redis(url);
  }
  async shutdown() {
    var _a;
    await ((_a = this.redis) == null ? void 0 : _a.quit().catch(() => void 0));
  }
  async getCached(key, urlPath) {
    const now = Date.now();
    const mem = this.memory.get(key);
    if (mem && mem.expiry > now) return mem.body;
    if (this.redis) {
      try {
        const raw = await this.redis.get(`opendota:${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const body = { ...parsed, stale: true };
          return body;
        }
      } catch (err) {
        logger.warn(err, "Redis OpenDota read failed");
      }
    }
    const fresh = await this.fetchLive(urlPath);
    if (fresh.ok) {
      this.memory.set(key, {
        expiry: now + this.ttlSeconds * 1e3,
        body: fresh
      });
      if (this.redis) {
        await this.redis.setex(`opendota:${key}`, this.ttlSeconds, JSON.stringify(fresh)).catch(() => void 0);
      }
    }
    return fresh;
  }
  async fetchLive(urlPath, method = "GET") {
    return this.limiter.schedule(async () => {
      try {
        const res = await fetch(`${OPEN_DOTA_BASE}${urlPath}`, {
          method,
          signal: AbortSignal.timeout(9e4)
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: text.slice(0, 280)
          };
        }
        try {
          return {
            ok: true,
            status: res.status,
            data: JSON.parse(text)
          };
        } catch {
          return { ok: false, status: res.status, error: "invalid json" };
        }
      } catch (err) {
        return {
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    });
  }
  async playerProfile(accountId) {
    return this.getCached(
      `players:${accountId}:profile`,
      `/players/${accountId}`
    );
  }
  async playerHeroStats(accountId) {
    return this.getCached(
      `players:${accountId}:heroes`,
      `/players/${accountId}/heroes`
    );
  }
  async heroMatchups(heroId) {
    return this.getCached(
      `heroes:${heroId}:matchups`,
      `/heroes/${heroId}/matchups`
    );
  }
  async leagueMatches(leagueId) {
    return this.getCached(
      `leagues:${leagueId}:matches`,
      `/leagues/${leagueId}/matches`
    );
  }
  async leagueInfo(leagueId) {
    return this.getCached(
      `leagues:${leagueId}:info`,
      `/leagues/${leagueId}`
    );
  }
  async requestMatchParse(matchId) {
    return this.fetchLive(`/request/${matchId}`, "POST");
  }
  async matchDetails(matchId) {
    return this.getCached(
      `matches:${matchId}:detail`,
      `/matches/${matchId}`
    );
  }
  async heroesConstants() {
    return this.getCached(`constants:heroes`, `/heroes`);
  }
  /** Head-to-head between two heroes using OpenDota matchups response */
  async matchupBetween(heroA, heroB) {
    const left = await this.heroMatchups(heroA);
    if (!left.ok || left.data === void 0 || left.data === null) {
      return {
        ok: false,
        status: left.status,
        error: left.error ?? "matchup unavailable"
      };
    }
    const rows = Array.isArray(left.data) ? left.data : [];
    let matchRow = {};
    for (const raw of rows) {
      if (raw && typeof raw === "object" && "hero_id" in raw) {
        const hid = raw.hero_id;
        if (typeof hid === "number" && hid === heroB) {
          matchRow = raw;
          break;
        }
      }
    }
    return {
      ok: true,
      status: left.status ?? 200,
      data: matchRow
    };
  }
  purgeMemory() {
    this.memory.clear();
  }
}
const DEFAULT_GAME_START_LABEL = "Game starting in";
const gameStartCountdownSchema = z.object({
  label: z.string().optional(),
  running: z.boolean(),
  /** Wall-clock end (ISO) while running — overlay derives seconds from this */
  endsAt: z.string().nullish(),
  /** Seconds left when paused, or preset before start */
  secondsRemaining: z.number().int().min(0)
});
const gameStartCountdownPatchSchema = gameStartCountdownSchema.partial();
function gameStartCountdownRemaining(cd, nowMs = Date.now()) {
  if (!cd)
    return 0;
  if (cd.running && cd.endsAt) {
    const end = new Date(cd.endsAt).getTime();
    if (!Number.isFinite(end))
      return Math.max(0, cd.secondsRemaining ?? 0);
    return Math.max(0, Math.ceil((end - nowMs) / 1e3));
  }
  return Math.max(0, cd.secondsRemaining ?? 0);
}
function mergeGameStartCountdown(prev, patch, nowMs = Date.now()) {
  if (patch.running === true) {
    const seconds = patch.secondsRemaining ?? (prev ? gameStartCountdownRemaining(prev, nowMs) : 0);
    const sec = Math.max(0, Math.floor(seconds));
    const label = patch.label ?? (prev == null ? void 0 : prev.label) ?? DEFAULT_GAME_START_LABEL;
    return {
      label,
      running: true,
      secondsRemaining: sec,
      endsAt: patch.endsAt ?? new Date(nowMs + sec * 1e3).toISOString()
    };
  }
  if (patch.running === false) {
    const seconds = patch.secondsRemaining ?? (prev ? gameStartCountdownRemaining(prev, nowMs) : 0);
    return {
      label: patch.label ?? (prev == null ? void 0 : prev.label) ?? DEFAULT_GAME_START_LABEL,
      running: false,
      endsAt: null,
      secondsRemaining: Math.max(0, Math.floor(seconds))
    };
  }
  const base = {
    label: patch.label ?? (prev == null ? void 0 : prev.label) ?? DEFAULT_GAME_START_LABEL,
    running: (prev == null ? void 0 : prev.running) ?? false,
    endsAt: (prev == null ? void 0 : prev.endsAt) ?? null,
    secondsRemaining: patch.secondsRemaining ?? (prev ? gameStartCountdownRemaining(prev, nowMs) : 0)
  };
  if (base.running && !base.endsAt) {
    const sec = Math.max(0, base.secondsRemaining);
    return {
      ...base,
      endsAt: new Date(nowMs + sec * 1e3).toISOString()
    };
  }
  if (!base.running) {
    return { ...base, endsAt: null };
  }
  return base;
}
function buildRunningGameStartCountdown(seconds, label = DEFAULT_GAME_START_LABEL) {
  const sec = Math.max(0, Math.floor(seconds));
  return {
    label,
    running: true,
    secondsRemaining: sec,
    endsAt: new Date(Date.now() + sec * 1e3).toISOString()
  };
}
function buildPausedGameStartCountdown(seconds, label = DEFAULT_GAME_START_LABEL) {
  return {
    label,
    running: false,
    endsAt: null,
    secondsRemaining: Math.max(0, Math.floor(seconds))
  };
}
const GSI_HERO_SLUG_ALIASES = {
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
function applyHeroSlugAlias(slug) {
  const norm = slug.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  if (!norm)
    return norm;
  return GSI_HERO_SLUG_ALIASES[norm] ?? norm;
}
function normalizeHeroSlug(slug) {
  return applyHeroSlugAlias(slug.replace(/^npc_dota_hero_/, "").trim());
}
function heroPortraitFieldsFromSlug(slug) {
  if (!slug)
    return {};
  const clean = normalizeHeroSlug(slug);
  if (!clean)
    return {};
  return {
    heroPortraitSlug: clean,
    heroPortraitUrl: heroLocalPortraitUrlFromSlug(clean)
  };
}
function heroLocalPortraitUrlFromSlug(slug, fileSlug) {
  const clean = normalizeHeroSlug(slug);
  if (!clean)
    return "";
  const onDisk = clean;
  return `/heroes/portraits/${onDisk}.png`;
}
function heroLocalAnimatedUrlFromSlug(slug, fileSlug) {
  const clean = normalizeHeroSlug(slug);
  if (!clean)
    return "";
  const onDisk = clean;
  return `/heroes/renders/${onDisk}.webm`;
}
function heroPortraitMediaFromSlug(slug, _opts) {
  const clean = normalizeHeroSlug(slug);
  if (!clean)
    return {};
  const flat = heroLocalPortraitUrlFromSlug(clean);
  const animated = heroLocalAnimatedUrlFromSlug(clean);
  return {
    staticUrl: flat,
    staticFallbackUrl: flat,
    animatedUrl: animated
  };
}
function teamLogoPath(teamKey) {
  return `/teams/${teamKey}.png`;
}
function displayNameToKey(name) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/'/g, "").replace(/[^a-z0-9_]/g, "");
}
function buildHeroSlugIndex(heroes) {
  const byId = /* @__PURE__ */ new Map();
  const byInternalSlug = /* @__PURE__ */ new Set();
  const byDisplayKey = /* @__PURE__ */ new Map();
  for (const h of heroes) {
    const slug = normalizeHeroSlug(h.name);
    if (!slug)
      continue;
    byId.set(h.id, slug);
    byInternalSlug.add(slug);
    byDisplayKey.set(displayNameToKey(h.localized_name), slug);
    const classStyle = slug.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    byDisplayKey.set(displayNameToKey(classStyle), slug);
  }
  return { byId, byInternalSlug, byDisplayKey };
}
function resolveHeroSlug(input, index) {
  const { heroId, heroClass, heroName, urlSlug } = input;
  if (urlSlug) {
    const norm = normalizeHeroSlug(urlSlug);
    if (norm && index.byInternalSlug.has(norm)) {
      return { slug: norm, source: "url" };
    }
  }
  if (heroId != null && heroId > 0) {
    const fromId = index.byId.get(heroId);
    if (fromId)
      return { slug: fromId, source: "id" };
  }
  if (heroClass) {
    const norm = normalizeHeroSlug(heroClass);
    if (norm && index.byInternalSlug.has(norm)) {
      return { slug: norm, source: "class" };
    }
  }
  for (const display of [heroName, heroClass]) {
    if (!display)
      continue;
    const key = displayNameToKey(display);
    const fromDisplay = index.byDisplayKey.get(key);
    if (fromDisplay)
      return { slug: fromDisplay, source: "display" };
  }
  if (heroClass) {
    const norm = normalizeHeroSlug(heroClass);
    if (norm)
      return { slug: norm, source: "fallback" };
  }
  return { source: "none" };
}
function manualPickSteam32(matchSetup, side, slotOrder) {
  var _a, _b;
  const slots = side === "radiant" ? (_a = matchSetup == null ? void 0 : matchSetup.pickPlayers) == null ? void 0 : _a.radiant : (_b = matchSetup == null ? void 0 : matchSetup.pickPlayers) == null ? void 0 : _b.dire;
  if (!slots || slotOrder < 0 || slotOrder >= slots.length)
    return void 0;
  return slots[slotOrder] ?? null;
}
function manualPickDisplayName(leagueConfig, side, slotOrder) {
  var _a, _b;
  const steam32 = manualPickSteam32(leagueConfig == null ? void 0 : leagueConfig.matchSetup, side, slotOrder);
  if (steam32 == null || !((_a = leagueConfig == null ? void 0 : leagueConfig.roster) == null ? void 0 : _a.length))
    return void 0;
  return (_b = leagueConfig.roster.find((p) => p.steam32 === steam32)) == null ? void 0 : _b.displayName;
}
function pickSlotOrderForHero(side, heroId, slots) {
  const pick = slots == null ? void 0 : slots.find((s) => s.type === "pick" && s.heroId === heroId);
  return pick == null ? void 0 : pick.order;
}
function leaguePlayerHeroKey(steam32, heroId) {
  return `${steam32}:${heroId}`;
}
function summarizePlayerLeagueFromIndex(index, steam32) {
  if (!index || steam32 <= 0)
    return { games: 0, wins: 0 };
  const prefix = `${steam32}:`;
  let games = 0;
  let wins = 0;
  for (const [key, row] of Object.entries(index)) {
    if (!key.startsWith(prefix) || row.games <= 0)
      continue;
    games += row.games;
    wins += row.wins;
  }
  return { games, wins };
}
function leaguePlayerHeroFromIndex(index, steam32, heroId) {
  if (!index || steam32 <= 0 || heroId <= 0)
    return void 0;
  return index[leaguePlayerHeroKey(steam32, heroId)];
}
function aggregatePlayerLeagueFromIndex(index, steam32) {
  if (summarizePlayerLeagueFromIndex(index, steam32).games <= 0) {
    return void 0;
  }
  const prefix = `${steam32}:`;
  const acc = {
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
  for (const [key, ph] of Object.entries(index ?? {})) {
    if (!key.startsWith(prefix) || ph.games <= 0)
      continue;
    acc.games += ph.games;
    acc.wins += ph.wins;
    acc.kills += ph.avgKills * ph.games;
    acc.deaths += ph.avgDeaths * ph.games;
    acc.assists += ph.avgAssists * ph.games;
    acc.heroDamage += ph.avgHeroDamage * ph.games;
    acc.goldPerMin += ph.avgGpm * ph.games;
    acc.lastHits += ph.avgLastHits * ph.games;
    acc.maxKills = Math.max(acc.maxKills, ph.maxKills);
    acc.laneWins += ph.laneWins ?? 0;
    acc.laneDraws += ph.laneDraws ?? 0;
    acc.laneLosses += ph.laneLosses ?? 0;
  }
  const games = acc.games;
  const kda = acc.deaths > 0 ? (acc.kills + acc.assists) / acc.deaths : acc.kills + acc.assists;
  return {
    games,
    wins: acc.wins,
    winRate: acc.wins / games,
    avgKills: acc.kills / games,
    avgDeaths: acc.deaths / games,
    avgAssists: acc.assists / games,
    avgKda: kda,
    maxKills: acc.maxKills,
    avgHeroDamage: acc.heroDamage / games,
    avgGpm: acc.goldPerMin / games,
    avgLastHits: acc.lastHits / games,
    laneWins: acc.laneWins,
    laneDraws: acc.laneDraws,
    laneLosses: acc.laneLosses
  };
}
const OVERLAY_ROUTES = [
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
];
const visibilityTimedSchema = z.object({
  mode: z.literal("timed"),
  until: z.number()
});
const visibilityModeSchema = z.union([
  z.literal("hidden"),
  z.literal("visible"),
  visibilityTimedSchema
]);
const teamSeriesSchema = z.object({
  teamA: z.string(),
  teamB: z.string(),
  scoreA: z.number(),
  scoreB: z.number(),
  logoUrlA: z.string().optional(),
  logoUrlB: z.string().optional(),
  /** Series format set in admin (1, 3, or 5) */
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
  /** Current game in the series (1-based), set in admin */
  gameNumber: z.number().int().min(1).max(5).optional()
});
const rosterPlayerSchema = z.object({
  steam32: z.number(),
  displayName: z.string(),
  teamName: z.string().optional(),
  teamKey: z.string().optional(),
  /** Brand hex from roster CSV (e.g. `#1e4d8c`) */
  teamColor: z.string().optional(),
  /** Steam avatar; optional CSV column or filled from OpenDota on roster upload */
  avatarUrl: z.string().optional(),
  /** @deprecated use leagueConfig.matchSetup instead */
  side: z.enum(["radiant", "dire", "A", "B"]).optional()
});
const pickPlayersSchema = z.object({
  radiant: z.array(z.number().nullable()).length(5).optional(),
  dire: z.array(z.number().nullable()).length(5).optional()
});
const matchSetupSchema = z.object({
  radiantTeamKey: z.string(),
  direTeamKey: z.string(),
  seriesBestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
  seriesGame: z.number().int().min(1).max(5).default(1),
  scoreA: z.number().int().min(0).default(0),
  scoreB: z.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: z.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: pickPlayersSchema.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: z.record(z.string(), z.string()).optional()
});
const leagueConfigSchema = z.object({
  leagueId: z.number().nullable(),
  seasonSlug: z.string().optional(),
  roster: z.array(rosterPlayerSchema).default([]),
  matchSetup: matchSetupSchema.nullable().optional(),
  /** Brand colors keyed by CSV `teamKey` (hex, e.g. `#1e4d8c`) */
  teamColors: z.record(z.string(), z.string()).optional(),
  aggregatedAt: z.string().optional(),
  aggregationStatus: z.enum(["idle", "running", "ready", "error"]).default("idle"),
  aggregationProgress: z.number().min(0).max(100).optional(),
  aggregationError: z.string().optional(),
  aggregationMatchTotal: z.number().optional(),
  aggregationMatchDone: z.number().optional(),
  /** Where stats were last loaded from */
  aggregationSource: z.enum(["csv", "api"]).optional(),
  statsCsvDir: z.string().optional()
});
const tournamentHeroAggregateSchema = z.object({
  heroId: z.number(),
  heroName: z.string().optional(),
  picks: z.number().default(0),
  bans: z.number().default(0),
  wins: z.number().default(0),
  losses: z.number().default(0),
  games: z.number().default(0),
  pickRate: z.number().optional(),
  banRate: z.number().optional(),
  winRate: z.number().optional(),
  contestRate: z.number().optional()
});
const playerHeroLeagueStatsSchema = z.object({
  games: z.number(),
  wins: z.number(),
  winRate: z.number(),
  avgKills: z.number(),
  avgDeaths: z.number(),
  avgAssists: z.number(),
  avgKda: z.number(),
  maxKills: z.number(),
  avgHeroDamage: z.number(),
  avgGpm: z.number(),
  avgLastHits: z.number(),
  /** Lane phase W/D/L in league (EFF@10 vs lane opponent) */
  laneWins: z.number().optional(),
  laneDraws: z.number().optional(),
  laneLosses: z.number().optional()
});
const statSlideSchema = z.object({
  label: z.string(),
  value: z.string(),
  sublabel: z.string().optional()
});
const statCarouselSchema = z.object({
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  playerLabel: z.string().optional(),
  slides: z.array(statSlideSchema),
  activeIndex: z.number().nonnegative().default(0),
  slideDurationMs: z.number().positive().default(4e3),
  startedAt: z.number()
});
const productionSettingsSchema = z.object({
  gsiManualOverride: z.boolean().default(false),
  autoShowStatsOnPick: z.boolean().default(false),
  gsiLastSeen: z.string().optional(),
  gsiConnected: z.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: z.boolean().default(false),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: z.number().optional()
});
const draftPickSlotSchema = z.object({
  team: z.enum(["A", "B"]),
  heroId: z.number().nullable(),
  player: z.string().optional(),
  isBan: z.boolean().optional(),
  order: z.number().optional(),
  heroName: z.string().optional(),
  heroPortraitUrl: z.string().optional()
});
const draftSlotSchema = z.object({
  order: z.number(),
  type: z.enum(["pick", "ban"]),
  heroId: z.number().nullable(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  /** Steam CDN render WebM for draft pick cards */
  heroPortraitAnimatedUrl: z.string().optional(),
  playerName: z.string().optional(),
  /** Steam account id (32-bit) for roster CSV lookup */
  steam32: z.number().optional()
});
const draftTeamSideSchema = z.object({
  name: z.string(),
  logoUrl: z.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: z.string().optional(),
  slots: z.array(draftSlotSchema).optional(),
  bonusTime: z.number().optional()
});
const lastPickSchema = z.object({
  side: z.enum(["radiant", "dire", "A", "B"]),
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  playerName: z.string().optional()
});
const draftStateSchema = z.object({
  series: teamSeriesSchema,
  side: z.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: z.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: z.string().optional(),
  reserveSeconds: z.number().nonnegative(),
  picksBansOrder: z.array(draftPickSlotSchema).optional(),
  source: z.enum(["manual", "gsi"]).optional(),
  activeTeam: z.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: z.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: z.number().optional(),
  turnSecondsRemaining: z.number().optional(),
  radiant: draftTeamSideSchema.optional(),
  dire: draftTeamSideSchema.optional(),
  lastPick: lastPickSchema.optional()
});
const lowerThirdStateSchema = z.object({
  headline: z.string(),
  subtitle: z.string().optional(),
  accent: z.string().optional()
});
const replaySchema = z.object({
  match: z.number(),
  replayId: z.number(),
  file: z.string(),
  favorite: z.boolean(),
  duration: z.number(),
  filename: z.string()
});
z.object({
  currentMatch: z.number(),
  lastCompletedMatch: z.number(),
  replays: z.array(replaySchema)
});
const playerStatsCardSchema = z.object({
  steam32: z.number().optional(),
  playerLabel: z.string(),
  heroId: z.number().optional(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  statLines: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).optional(),
  notes: z.string().optional()
});
const heroStatsSliceSchema = z.object({
  pickRate: z.number().optional(),
  winRate: z.number().optional(),
  contestRate: z.number().optional(),
  banRate: z.number().optional(),
  picks: z.number().optional(),
  bans: z.number().optional(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  games: z.number().optional()
});
const heroStatsCardKindSchema = z.enum([
  "player-league",
  "player-hero",
  "tournament-hero"
]);
const heroStatsCardSchema = z.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: heroStatsCardKindSchema.optional(),
  steam32: z.number().optional(),
  playerLabel: z.string(),
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  /** Steam profile picture when showing player league stats */
  playerAvatarUrl: z.string().optional(),
  /** Team logo watermark for league-aggregate player cards (`/teams/{teamKey}.png`) */
  teamLogoUrl: z.string().optional(),
  /** Brand hex from roster for league-aggregate theming */
  teamColor: z.string().optional(),
  tournament: heroStatsSliceSchema.optional(),
  playerHero: z.object({
    games: z.number().optional(),
    wins: z.number().optional(),
    losses: z.number().optional(),
    winRate: z.number().optional(),
    avgKills: z.number().optional(),
    avgDeaths: z.number().optional(),
    avgAssists: z.number().optional(),
    avgKda: z.number().optional(),
    maxKills: z.number().optional(),
    avgHeroDamage: z.number().optional(),
    avgGpm: z.number().optional(),
    avgLastHits: z.number().optional()
  }).optional(),
  statSlides: z.array(statSlideSchema).optional(),
  matchup: z.record(z.any()).optional(),
  fetchedAt: z.string(),
  source: z.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
});
const matchupCardSchema = z.object({
  heroAId: z.number(),
  heroBId: z.number(),
  heroAName: z.string().optional(),
  heroBName: z.string().optional(),
  heroAPortraitSlug: z.string().optional(),
  heroBPortraitSlug: z.string().optional(),
  heroAPortraitUrl: z.string().optional(),
  heroBPortraitUrl: z.string().optional(),
  matchup: z.record(z.any()).optional(),
  statLines: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  fetchedAt: z.string(),
  source: z.enum(["opendota", "opendota_cached", "stale", "manual", "league"]).optional()
});
const sponsorRotationStateSchema = z.object({
  banners: z.array(z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    imageUrl: z.string().optional(),
    durationSeconds: z.number().positive()
  })),
  activeIndex: z.number().nonnegative(),
  startedAt: z.number().optional()
});
const broadcastTimersSchema = z.object({
  pauseMessage: z.string().optional(),
  startingSoonEta: z.string().optional(),
  postgameNotes: z.string().optional(),
  gameStartCountdown: gameStartCountdownSchema.optional()
});
const obsRemoteHintsSchema = z.object({
  desiredSceneName: z.string().optional(),
  overlaySceneCollection: z.string().optional(),
  lastCorrelationId: z.string().optional()
});
z.object({
  version: z.number(),
  seq: z.number(),
  updatedAt: z.string(),
  overlayVisibility: z.record(visibilityModeSchema).default({}),
  sceneHints: obsRemoteHintsSchema.optional(),
  leagueConfig: leagueConfigSchema.optional(),
  tournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  production: productionSettingsSchema.optional(),
  statCarousel: statCarouselSchema.nullable().optional(),
  draft: draftStateSchema.nullable().optional(),
  lowerThirds: lowerThirdStateSchema.nullable().optional(),
  playerStatsCard: playerStatsCardSchema.nullable().optional(),
  heroStatsCard: heroStatsCardSchema.nullable().optional(),
  matchupCard: matchupCardSchema.nullable().optional(),
  sponsor: sponsorRotationStateSchema.nullable().optional(),
  timers: broadcastTimersSchema.optional()
});
const overlayPatchSchema = z.object({
  overlayVisibility: z.record(visibilityModeSchema).optional(),
  leagueConfig: leagueConfigSchema.partial().optional(),
  tournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  playerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  production: productionSettingsSchema.partial().optional(),
  statCarousel: z.union([statCarouselSchema, statCarouselSchema.partial(), z.null()]).optional(),
  draft: z.union([draftStateSchema, draftStateSchema.partial(), z.null()]).optional(),
  lowerThirds: z.union([lowerThirdStateSchema, lowerThirdStateSchema.partial(), z.null()]).optional(),
  playerStatsCard: z.union([playerStatsCardSchema, playerStatsCardSchema.partial(), z.null()]).optional(),
  heroStatsCard: z.union([heroStatsCardSchema, heroStatsCardSchema.partial(), z.null()]).optional(),
  matchupCard: z.union([matchupCardSchema, matchupCardSchema.partial(), z.null()]).optional(),
  sponsor: z.union([
    sponsorRotationStateSchema,
    sponsorRotationStateSchema.partial(),
    z.null()
  ]).optional(),
  timers: z.object({
    pauseMessage: z.string().optional(),
    startingSoonEta: z.string().optional(),
    postgameNotes: z.string().optional(),
    gameStartCountdown: gameStartCountdownPatchSchema.optional()
  }).partial().optional(),
  sceneHints: obsRemoteHintsSchema.partial().optional()
});
function defaultOverlayVisibility() {
  const v = {};
  for (const key of OVERLAY_ROUTES) {
    v[key] = key === "game" ? "visible" : "hidden";
  }
  v.global_kill_switch = "visible";
  return v;
}
function defaultLeagueConfig() {
  return {
    leagueId: null,
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle"
  };
}
function createDefaultEnvelope() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    version: 2,
    seq: 0,
    updatedAt: now,
    overlayVisibility: defaultOverlayVisibility(),
    sceneHints: {},
    leagueConfig: defaultLeagueConfig(),
    tournamentHeroIndex: {},
    playerHeroIndex: {},
    production: {
      gsiManualOverride: false,
      autoShowStatsOnPick: false,
      gsiConnected: false,
      playerMappingPublished: false,
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
const SOCKET_EVENTS = {
  STATE_FULL: "state:full",
  ACK: "ack"
};
const NAMESPACES = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay"
};
function requireBroadcastAuth(req, res, next) {
  let token;
  const header = req.headers.authorization;
  if (header == null ? void 0 : header.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length).trim();
  } else if (typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  if (token !== env.BROADCAST_SECRET) {
    res.status(403).json({ error: "invalid token" });
    return;
  }
  next();
}
function mergeVisibility(prev, incoming) {
  if (!incoming)
    return { ...prev };
  return { ...prev, ...incoming };
}
function mergeTeamSlots(prevSlots, nextSlots) {
  if (!nextSlots)
    return prevSlots;
  if (!(prevSlots == null ? void 0 : prevSlots.length))
    return nextSlots;
  const prevMap = new Map(prevSlots.map((s) => [`${s.type}:${s.order}`, s]));
  return nextSlots.map((s) => {
    const prev = prevMap.get(`${s.type}:${s.order}`);
    if (!(prev == null ? void 0 : prev.playerName) && (prev == null ? void 0 : prev.steam32) === void 0)
      return s;
    return {
      ...s,
      playerName: s.playerName ?? prev.playerName,
      steam32: s.steam32 ?? prev.steam32
    };
  });
}
function mergeDraft(prev, incoming) {
  var _a, _b;
  if (incoming === void 0)
    return prev;
  if (incoming === null)
    return null;
  const inc = incoming;
  if (!prev) {
    return inc;
  }
  const nextRadiant = inc.radiant ? { ...prev.radiant ?? {}, ...inc.radiant } : prev.radiant;
  const nextDire = inc.dire ? { ...prev.dire ?? {}, ...inc.dire } : prev.dire;
  if (nextRadiant == null ? void 0 : nextRadiant.slots) {
    nextRadiant.slots = mergeTeamSlots((_a = prev.radiant) == null ? void 0 : _a.slots, nextRadiant.slots);
  }
  if (nextDire == null ? void 0 : nextDire.slots) {
    nextDire.slots = mergeTeamSlots((_b = prev.dire) == null ? void 0 : _b.slots, nextDire.slots);
  }
  return {
    ...prev,
    ...inc,
    series: inc.series ? { ...prev.series, ...inc.series } : prev.series,
    picksBansOrder: inc.picksBansOrder ?? prev.picksBansOrder,
    radiant: nextRadiant,
    dire: nextDire,
    lastPick: inc.lastPick ?? prev.lastPick
  };
}
function mergeNullableNested(prev, incoming) {
  if (incoming === void 0)
    return prev;
  if (incoming === null)
    return null;
  if (!prev || prev === null)
    return { ...incoming };
  return { ...prev, ...incoming };
}
function mergeLeagueConfig(prev, incoming) {
  if (incoming === void 0)
    return prev;
  return {
    ...prev ?? { leagueId: null, roster: [], aggregationStatus: "idle" },
    ...incoming,
    roster: incoming.roster ?? (prev == null ? void 0 : prev.roster) ?? [],
    matchSetup: incoming.matchSetup !== void 0 ? incoming.matchSetup : (prev == null ? void 0 : prev.matchSetup) ?? null,
    teamColors: incoming.teamColors !== void 0 ? { ...(prev == null ? void 0 : prev.teamColors) ?? {}, ...incoming.teamColors } : prev == null ? void 0 : prev.teamColors
  };
}
function mergeProduction(prev, incoming) {
  if (incoming === void 0)
    return prev;
  return { ...prev ?? {}, ...incoming };
}
function applyOverlayPatch(prev, patch) {
  var _a;
  const overlayVisibility = patch.overlayVisibility !== void 0 ? mergeVisibility(prev.overlayVisibility, patch.overlayVisibility) : prev.overlayVisibility;
  let nextTimers = prev.timers;
  if (patch.timers !== void 0) {
    const { gameStartCountdown: cdPatch, ...restTimers } = patch.timers;
    nextTimers = {
      ...prev.timers ?? {},
      ...restTimers
    };
    if (cdPatch !== void 0) {
      nextTimers = {
        ...nextTimers,
        gameStartCountdown: mergeGameStartCountdown((_a = prev.timers) == null ? void 0 : _a.gameStartCountdown, cdPatch)
      };
    }
  }
  const nextDraft = mergeDraft(prev.draft, patch.draft);
  const nextLeague = mergeLeagueConfig(prev.leagueConfig, patch.leagueConfig);
  const nextProduction = mergeProduction(prev.production, patch.production);
  let tournamentHeroIndex = prev.tournamentHeroIndex;
  if (patch.tournamentHeroIndex !== void 0) {
    tournamentHeroIndex = { ...patch.tournamentHeroIndex };
  }
  let playerHeroIndex = prev.playerHeroIndex;
  if (patch.playerHeroIndex !== void 0) {
    playerHeroIndex = { ...patch.playerHeroIndex };
  }
  let nextHero = mergeNullableNested(prev.heroStatsCard ?? void 0, patch.heroStatsCard);
  let nextSceneHints = patch.sceneHints !== void 0 ? { ...prev.sceneHints ?? {}, ...patch.sceneHints } : prev.sceneHints;
  const nextLower = mergeNullableNested(prev.lowerThirds ?? void 0, patch.lowerThirds);
  const nextPlayer = mergeNullableNested(prev.playerStatsCard ?? void 0, patch.playerStatsCard);
  let nextMatch = mergeNullableNested(prev.matchupCard ?? void 0, patch.matchupCard);
  let nextSponsor = mergeNullableNested(prev.sponsor ?? void 0, patch.sponsor);
  let nextCarousel = mergeNullableNested(prev.statCarousel ?? void 0, patch.statCarousel);
  if (nextHero && patch.heroStatsCard && typeof patch.heroStatsCard === "object") {
    const hc = patch.heroStatsCard;
    if (hc.fetchedAt) {
      nextHero = { ...hc };
    } else {
      nextHero = {
        ...nextHero,
        ...hc,
        tournament: hc.tournament ? { ...nextHero.tournament ?? {}, ...hc.tournament } : nextHero.tournament,
        playerHero: hc.playerHero ? { ...nextHero.playerHero ?? {}, ...hc.playerHero } : nextHero.playerHero,
        statSlides: hc.statSlides ?? nextHero.statSlides
      };
    }
  }
  if (nextMatch && patch.matchupCard && typeof patch.matchupCard === "object") {
    const mc = patch.matchupCard;
    nextMatch = {
      ...nextMatch,
      ...mc,
      matchup: mc.matchup ? { ...nextMatch.matchup ?? {}, ...mc.matchup } : nextMatch.matchup
    };
  }
  return {
    ...prev,
    seq: prev.seq + 1,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    overlayVisibility,
    leagueConfig: nextLeague ?? prev.leagueConfig,
    tournamentHeroIndex: tournamentHeroIndex ?? prev.tournamentHeroIndex,
    playerHeroIndex: playerHeroIndex ?? prev.playerHeroIndex,
    production: nextProduction ?? prev.production,
    statCarousel: nextCarousel === void 0 ? prev.statCarousel : nextCarousel,
    draft: nextDraft === void 0 ? prev.draft : nextDraft,
    lowerThirds: nextLower === void 0 ? prev.lowerThirds : nextLower,
    playerStatsCard: nextPlayer === void 0 ? prev.playerStatsCard : nextPlayer,
    heroStatsCard: nextHero === void 0 ? prev.heroStatsCard : nextHero,
    matchupCard: nextMatch === void 0 ? prev.matchupCard : nextMatch,
    sponsor: nextSponsor === void 0 ? prev.sponsor : nextSponsor,
    timers: nextTimers ?? prev.timers,
    sceneHints: nextSceneHints
  };
}
function createMemoryStateManager(seed) {
  let current = structuredClone(seed);
  return {
    async getState() {
      return structuredClone(current);
    },
    async patchState(patch) {
      current = applyOverlayPatch(current, patch);
      return structuredClone(current);
    },
    async replaceState(state) {
      current = structuredClone(state);
      return structuredClone(current);
    }
  };
}
function createRedisStateManager(options) {
  const client = new Redis(options.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 200, 2e3);
    }
  });
  let initialized = false;
  async function ensureSeed() {
    if (initialized)
      return;
    await client.connect().catch(() => void 0);
    initialized = true;
    const raw = await client.get(options.key);
    if (!raw) {
      await client.set(options.key, JSON.stringify(options.seed));
    }
  }
  return {
    async getState() {
      await ensureSeed();
      const raw = await client.get(options.key);
      if (!raw)
        throw new Error("Redis state missing");
      return JSON.parse(raw);
    },
    async patchState(patch) {
      await ensureSeed();
      let attempts = 0;
      while (attempts++ < 8) {
        await client.watch(options.key);
        const raw = await client.get(options.key);
        const prev = raw ? JSON.parse(raw) : options.seed;
        const next = applyOverlayPatch(prev, patch);
        const res = await client.multi().set(options.key, JSON.stringify(next)).exec();
        if (res)
          return next;
      }
      throw new Error("Redis optimistic lock exhaustion");
    },
    async replaceState(state) {
      await ensureSeed();
      await client.set(options.key, JSON.stringify(state));
      return structuredClone(state);
    },
    async shutdown() {
      await client.quit();
    }
  };
}
async function createAppState() {
  const seed = createDefaultEnvelope();
  if (env.STATE_BACKEND === "memory") {
    logger.info("State backend: memory");
    return createMemoryStateManager(seed);
  }
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  }
  try {
    const ping = new Redis(env.REDIS_URL);
    await ping.ping();
    await ping.quit();
    logger.info({ key: env.REDIS_STATE_KEY }, "State backend: redis");
    return createRedisStateManager({
      url: env.REDIS_URL,
      key: env.REDIS_STATE_KEY,
      seed
    });
  } catch (err) {
    logger.error(err, "Redis unavailable");
    if (env.REDIS_UNAVAILABLE_FALLBACK_MEMORY) {
      logger.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)"
      );
      return createMemoryStateManager(seed);
    }
    throw err;
  }
}
function parseOverlayPatch(body) {
  return overlayPatchSchema.parse(body);
}
const execAsync = promisify(exec);
class ReplayManager {
  constructor() {
    __publicField(this, "dbFile", env.REPLAY_DB_FILE);
    __publicField(this, "matchFile", env.REPLAY_MATCH_FILE);
    __publicField(this, "lastCompletedFile", env.REPLAY_LAST_COMPLETED_FILE);
    __publicField(this, "playbackDir", env.REPLAY_PLAYBACK_DIR);
    __publicField(this, "replayFolder", env.REPLAY_FOLDER);
    // Temp folder for browser mp4 previews (inside build output or root)
    __publicField(this, "previewCacheDir", path.resolve(process.cwd(), "public-preview-cache"));
    if (!fs.existsSync(this.previewCacheDir)) {
      try {
        fs.mkdirSync(this.previewCacheDir, { recursive: true });
      } catch (err) {
        logger.error(err, "Failed to create preview cache directory");
      }
    }
  }
  getPreviewCacheDir() {
    return this.previewCacheDir;
  }
  async getReplayState() {
    let currentMatch = 1;
    let lastCompletedMatch = 0;
    const replays = [];
    try {
      if (fs.existsSync(this.matchFile)) {
        const content = fs.readFileSync(this.matchFile, "utf-8").trim();
        const num2 = parseInt(content, 10);
        if (!isNaN(num2)) currentMatch = num2;
      }
    } catch (err) {
      logger.error(err, "Failed to read active match file");
    }
    try {
      if (fs.existsSync(this.lastCompletedFile)) {
        const content = fs.readFileSync(this.lastCompletedFile, "utf-8").trim();
        const num2 = parseInt(content, 10);
        if (!isNaN(num2)) lastCompletedMatch = num2;
      }
    } catch (err) {
      logger.error(err, "Failed to read last completed match file");
    }
    try {
      if (fs.existsSync(this.dbFile)) {
        const content = fs.readFileSync(this.dbFile, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const match = line.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (match) {
            const file = match[3];
            replays.push({
              match: parseInt(match[1], 10),
              replayId: parseInt(match[2], 10),
              file,
              favorite: parseInt(match[4], 10) === 1,
              duration: parseInt(match[5], 10),
              filename: path.basename(file)
            });
          }
        }
      }
    } catch (err) {
      logger.error(err, "Failed to read or parse replay database CSV");
    }
    replays.sort((a, b) => b.replayId - a.replayId);
    return {
      currentMatch,
      lastCompletedMatch,
      replays
    };
  }
  async toggleFavorite(file, favorite) {
    try {
      if (!fs.existsSync(this.dbFile)) {
        return false;
      }
      const content = fs.readFileSync(this.dbFile, "utf-8");
      const lines = content.split(/\r?\n/);
      const newLines = [];
      if (lines.length > 0) {
        newLines.push(lines[0]);
      }
      let updated = false;
      const favVal = favorite ? "1" : "0";
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const match = line.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        if (match && match[3] === file) {
          newLines.push(`${match[1]},${match[2]},"${match[3]}",${favVal},${match[5]}`);
          updated = true;
        } else {
          newLines.push(line);
        }
      }
      fs.writeFileSync(this.dbFile, newLines.join("\n") + "\n", "utf-8");
      return updated;
    } catch (err) {
      logger.error(err, `Failed to toggle favorite for ${file}`);
      return false;
    }
  }
  async playReplay(file, obs) {
    try {
      if (!fs.existsSync(file)) {
        return { ok: false, error: "File not found" };
      }
      const state = await this.getReplayState();
      const entry = state.replays.find((r) => r.file === file);
      const duration = entry ? entry.duration : 30;
      const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`;
      const probeOut = await execAsync(probeCmd);
      const actualDuration = parseFloat(probeOut.stdout.trim()) || 40;
      const offset = Math.max(0, actualDuration - duration);
      let playbackFile = file;
      if (offset > 1) {
        if (!fs.existsSync(this.playbackDir)) {
          fs.mkdirSync(this.playbackDir, { recursive: true });
        }
        playbackFile = path.join(this.playbackDir, "current_replay.mp4");
        const ffmpegCmd = `ffmpeg -y -ss ${offset} -i "${file}" -t ${duration} -c copy "${playbackFile}"`;
        logger.info({ cmd: ffmpegCmd }, "Running ffmpeg slice command");
        await execAsync(ffmpegCmd);
      }
      if (obs.isConnected()) {
        const setSettingsRes = await obs.setInputSettings("ReplayPlayer", {
          local_file: playbackFile
        });
        if (!setSettingsRes.ok) {
          return { ok: false, error: `Failed to set OBS input settings: ${setSettingsRes.error}` };
        }
        const restartRes = await obs.restartMediaInput("ReplayPlayer");
        if (!restartRes.ok) {
          return { ok: false, error: `Failed to restart OBS media input: ${restartRes.error}` };
        }
        const sceneRes = await obs.setCurrentScene("Replay");
        if (!sceneRes.ok) {
          logger.error({ error: sceneRes.error }, "Failed to switch OBS scene");
        }
        return { ok: true };
      } else {
        return { ok: true, error: "Replay sliced, but OBS was not connected to play it." };
      }
    } catch (err) {
      logger.error(err, "Failed to play replay");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  async generatePreview(file) {
    try {
      if (!fs.existsSync(file)) {
        return { ok: false, error: `Replay file not found: ${file}` };
      }
      const filename = path.basename(file);
      return { ok: true, previewUrl: `/api/replays/media/${encodeURIComponent(filename)}` };
    } catch (err) {
      logger.error(err, "Failed to generate preview url");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
function attachRestRoutes(opts) {
  const { app, state, io, broadcast, obs, opendota } = opts;
  const replayManager = new ReplayManager();
  app.use(
    "/api/replays/media",
    requireBroadcastAuth,
    express.static(env.REPLAY_FOLDER)
  );
  app.get("/health/live", (_req, res) => {
    res.json({
      ok: true,
      service: "broadcast-api",
      /** Bump when deploying; used to confirm apply-player-mapping route is live */
      build: "2026-05-30",
      routes: {
        applyPlayerMapping: "POST /api/match/apply-player-mapping",
        matchSetup: "POST /api/match/setup",
        gameStartTimerStart: "POST /api/timers/game-start/start"
      }
    });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await state.getState();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.get("/api/state", requireBroadcastAuth, async (_req, res) => {
    const s = await state.getState();
    res.json(s);
  });
  app.patch("/api/state", requireBroadcastAuth, async (req, res) => {
    try {
      const patch = parseOverlayPatch(req.body);
      const next = await state.patchState(patch);
      await broadcast.broadcastFull(next);
      res.json(next);
    } catch (err) {
      logger.error(err, "state patch failed");
      res.status(400).json({
        error: err instanceof Error ? err.message : "invalid patch"
      });
    }
  });
  app.post("/api/state/reset", requireBroadcastAuth, async (_req, res) => {
    const fresh = createDefaultEnvelope();
    const saved = await state.replaceState(fresh);
    await broadcast.broadcastFull(saved);
    res.json(saved);
  });
  const gameStartTimerBodySchema = z.object({
    seconds: z.number().int().min(0).max(5999),
    label: z.string().optional()
  });
  async function patchGameStartCountdown(countdown) {
    const next = await state.patchState({
      timers: { gameStartCountdown: countdown }
    });
    await broadcast.broadcastFull(next);
    return next;
  }
  app.post(
    "/api/timers/game-start/start",
    requireBroadcastAuth,
    async (req, res) => {
      var _a, _b;
      const parsed = gameStartTimerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const label = ((_a = parsed.data.label) == null ? void 0 : _a.trim()) || DEFAULT_GAME_START_LABEL;
      const countdown = buildRunningGameStartCountdown(
        parsed.data.seconds,
        label
      );
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: (_b = next.timers) == null ? void 0 : _b.gameStartCountdown });
    }
  );
  app.post(
    "/api/timers/game-start/pause",
    requireBroadcastAuth,
    async (req, res) => {
      var _a, _b, _c, _d;
      const snap = await state.getState();
      const prev = (_a = snap.timers) == null ? void 0 : _a.gameStartCountdown;
      const label = (typeof ((_b = req.body) == null ? void 0 : _b.label) === "string" ? req.body.label.trim() : "") || (prev == null ? void 0 : prev.label) || DEFAULT_GAME_START_LABEL;
      const seconds = typeof ((_c = req.body) == null ? void 0 : _c.seconds) === "number" ? req.body.seconds : gameStartCountdownRemaining(prev);
      const countdown = buildPausedGameStartCountdown(seconds, label);
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: (_d = next.timers) == null ? void 0 : _d.gameStartCountdown });
    }
  );
  app.post(
    "/api/timers/game-start/set",
    requireBroadcastAuth,
    async (req, res) => {
      var _a, _b, _c;
      const parsed = gameStartTimerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const snap = await state.getState();
      const prev = (_a = snap.timers) == null ? void 0 : _a.gameStartCountdown;
      const label = ((_b = parsed.data.label) == null ? void 0 : _b.trim()) || (prev == null ? void 0 : prev.label) || DEFAULT_GAME_START_LABEL;
      const countdown = (prev == null ? void 0 : prev.running) ? buildRunningGameStartCountdown(parsed.data.seconds, label) : buildPausedGameStartCountdown(parsed.data.seconds, label);
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: (_c = next.timers) == null ? void 0 : _c.gameStartCountdown });
    }
  );
  const obsCfgSchema = z.object({
    host: z.string(),
    port: z.coerce.number(),
    password: z.string()
  });
  app.post("/api/obs/config", requireBroadcastAuth, (req, res) => {
    const parsed = obsCfgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    obs.configure(parsed.data);
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:config",
      ok: true
    });
    res.json({ ok: true });
  });
  app.post("/api/obs/connect", requireBroadcastAuth, async (req, res) => {
    const body = req.body;
    if (body && typeof body === "object" && Object.keys(body).length) {
      const parsed = obsCfgSchema.safeParse(body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      obs.configure(parsed.data);
    }
    const result = await obs.connect();
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:connect",
      ok: result.ok,
      error: result.error
    });
    res.json(result);
  });
  app.post("/api/obs/disconnect", requireBroadcastAuth, async (_req, res) => {
    await obs.disconnect();
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:disconnect",
      ok: true
    });
    res.json({ ok: true });
  });
  app.get("/api/obs/scenes", requireBroadcastAuth, async (_req, res) => {
    try {
      const scenes = await obs.listScenes();
      res.json({ ok: true, scenes });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  app.post("/api/obs/program-scene", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ sceneName: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const result = await obs.setProgramScene(parsed.data.sceneName);
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:setProgramScene",
      ok: result.ok,
      sceneName: parsed.data.sceneName,
      error: result.error
    });
    await state.patchState({
      sceneHints: { desiredSceneName: parsed.data.sceneName }
    });
    const envelope = await state.getState();
    await broadcast.broadcastFull(envelope);
    res.json(result);
  });
  app.post(
    "/api/obs/scene-source",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        sceneName: z.string(),
        sourceName: z.string(),
        visible: z.boolean()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      const result = await obs.setSourceVisible(parsed.data);
      res.json(result);
    }
  );
  app.post(
    "/api/opendota/heroes/constants",
    requireBroadcastAuth,
    async (_req, res) => {
      const heroes = await opendota.heroesConstants();
      res.json(heroes);
    }
  );
  app.post(
    "/api/opendota/player/:accountId/heroes",
    requireBroadcastAuth,
    async (req, res) => {
      const heroes = await opendota.playerHeroStats(req.params.accountId);
      res.json(heroes);
    }
  );
  app.post(
    "/api/opendota/hero/:heroId/matchups",
    requireBroadcastAuth,
    async (req, res) => {
      const matchups = await opendota.heroMatchups(Number(req.params.heroId));
      res.json(matchups);
    }
  );
  app.post(
    "/api/opendota/matchups/between",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        heroA: z.number(),
        heroB: z.number()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      const result = await opendota.matchupBetween(
        parsed.data.heroA,
        parsed.data.heroB
      );
      res.json(result);
    }
  );
  app.post("/api/opendota/compose/hero-card", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      accountId: z.number().optional(),
      heroId: z.number(),
      playerLabel: z.string(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const snap = await state.getState();
    const leaguePh = parsed.data.accountId !== void 0 ? leaguePlayerHeroFromIndex(
      snap.playerHeroIndex,
      parsed.data.accountId,
      parsed.data.heroId
    ) : void 0;
    let source = "league";
    let playerHeroPayload;
    if (leaguePh && leaguePh.games > 0) {
      playerHeroPayload = {
        games: leaguePh.games,
        wins: leaguePh.wins,
        losses: leaguePh.games - leaguePh.wins
      };
    } else if (parsed.data.accountId !== void 0) {
      source = "opendota_cached";
      const ph = await opendota.playerHeroStats(parsed.data.accountId);
      if (ph.ok && Array.isArray(ph.data)) {
        const row = ph.data.find(
          (entry) => entry && typeof entry === "object" && entry.hero_id === parsed.data.heroId
        );
        if (row && typeof row.games === "number") {
          playerHeroPayload = {
            games: row.games,
            wins: typeof row.win === "number" ? row.win : 0,
            losses: row.games - (typeof row.win === "number" ? row.win : 0)
          };
        }
      }
      if (!ph.ok) source = "stale";
    }
    const card = {
      playerLabel: parsed.data.playerLabel,
      heroId: parsed.data.heroId,
      playerHero: playerHeroPayload,
      tournament: {},
      matchup: {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source
    };
    if (parsed.data.persist) {
      const next = await state.patchState({ heroStatsCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    return res.json({ ok: true, card });
  });
  app.post("/api/opendota/compose/matchup-card", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      heroAId: z.number(),
      heroBId: z.number(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const data = await opendota.matchupBetween(
      parsed.data.heroAId,
      parsed.data.heroBId
    );
    const card = {
      heroAId: parsed.data.heroAId,
      heroBId: parsed.data.heroBId,
      matchup: data.ok ? data.data ?? {} : {},
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: data.ok ? "opendota_cached" : "stale"
    };
    if (parsed.data.persist) {
      const next = await state.patchState({ matchupCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, upstream: data, matchupCard: card, persisted: next });
    }
    return res.json({ ok: true, upstream: data, matchupCard: card });
  });
  app.post("/api/opendota/cache/clear-memory", requireBroadcastAuth, (_req, res) => {
    opendota.purgeMemory();
    res.json({ ok: true });
  });
  app.get("/api/replays", requireBroadcastAuth, async (_req, res) => {
    try {
      const data = await replayManager.getReplayState();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post("/api/replays/hotkey", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ hotkeyName: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const result = await obs.triggerHotkeyByName(parsed.data.hotkeyName);
    res.json(result);
  });
  app.post("/api/replays/hotkey-sequence", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      keyId: z.string(),
      keyModifiers: z.object({
        shift: z.boolean().optional(),
        control: z.boolean().optional(),
        alt: z.boolean().optional(),
        command: z.boolean().optional()
      }).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const result = await obs.triggerHotkeyBySequence(parsed.data.keyId, parsed.data.keyModifiers || {});
    res.json(result);
  });
  app.post("/api/replays/favorite", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string(), favorite: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const ok = await replayManager.toggleFavorite(parsed.data.file, parsed.data.favorite);
    res.json({ ok });
  });
  app.post("/api/replays/play", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const result = await replayManager.playReplay(parsed.data.file, obs);
    res.json(result);
  });
  app.post("/api/replays/generate-preview", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const result = await replayManager.generatePreview(parsed.data.file);
    res.json(result);
  });
}
let heroCache = null;
let heroById = /* @__PURE__ */ new Map();
let slugIndex = null;
function rebuildSlugIndex() {
  if (!(heroCache == null ? void 0 : heroCache.length)) {
    slugIndex = null;
    return;
  }
  slugIndex = buildHeroSlugIndex(heroCache);
}
async function ensureHeroRegistry(client) {
  if (heroById.size > 0) return heroById;
  const res = await client.heroesConstants();
  if (res.ok && Array.isArray(res.data)) {
    heroCache = res.data;
    heroById = new Map(heroCache.map((h) => [h.id, h]));
    rebuildSlugIndex();
  }
  return heroById;
}
function resolveHeroSlugForDraft(input) {
  if (slugIndex) return resolveHeroSlug(input, slugIndex);
  if (input.heroId != null && input.heroId > 0) {
    const meta = heroById.get(input.heroId);
    if (meta) {
      const slug = normalizeHeroSlug(meta.name);
      if (slug) return { slug, source: "id" };
    }
  }
  if (input.heroClass) {
    const norm = normalizeHeroSlug(input.heroClass);
    if (norm) return { slug: norm, source: "fallback" };
  }
  return { source: "none" };
}
function canonicalHeroSlugForDraft(input) {
  return resolveHeroSlugForDraft(input).slug;
}
function resolveHeroPortraitSlugForHero(heroId, heroName) {
  const resolved = resolveHeroSlugForDraft({ heroId, heroName });
  if (resolved.slug) return resolved.slug;
  const meta = heroById.get(heroId);
  if (!meta) return void 0;
  return normalizeHeroSlug(meta.name) || void 0;
}
function heroPortraitFieldsForHero(heroId, heroName) {
  return heroPortraitFieldsFromSlug(
    resolveHeroPortraitSlugForHero(heroId, heroName)
  );
}
function heroPortraitUrl(heroId, heroName) {
  return heroPortraitFieldsForHero(heroId, heroName).heroPortraitUrl;
}
function heroDisplayName(heroId) {
  const meta = heroById.get(heroId);
  return (meta == null ? void 0 : meta.localized_name) ?? `Hero ${heroId}`;
}
function teamLogoUrlForKey(teamKey) {
  if (!teamKey) return void 0;
  return teamLogoPath(teamKey);
}
function findRosterPlayer(roster, steam32) {
  return roster.find((p) => p.steam32 === steam32);
}
function listHeroesSorted() {
  if (!heroCache) return [];
  return [...heroCache].sort(
    (a, b) => a.localized_name.localeCompare(b.localized_name)
  );
}
function parseEnvMatchIds() {
  var _a;
  const raw = (_a = env.LEAGUE_MATCH_IDS) == null ? void 0 : _a.trim();
  if (!raw) return [];
  return raw.split(/[,\s]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}
async function fetchSteamLeagueMatchIds(leagueId, maxMatches) {
  var _a, _b, _c, _d;
  const key = (_a = env.STEAM_WEB_API_KEY) == null ? void 0 : _a.trim();
  if (!key) return [];
  const ids = [];
  let startAt;
  while (ids.length < maxMatches) {
    const params = new URLSearchParams({
      key,
      league_id: String(leagueId),
      matches_requested: String(Math.min(100, maxMatches - ids.length))
    });
    if (startAt !== void 0) {
      params.set("start_at_match_id", String(startAt));
    }
    const url = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Steam match history HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = await res.json();
    const status = (_b = body.result) == null ? void 0 : _b.status;
    const batch = ((_c = body.result) == null ? void 0 : _c.matches) ?? [];
    if (status !== void 0 && status !== 1 && batch.length === 0) {
      throw new Error(
        `Steam GetMatchHistory status ${status} for league ${leagueId} (no matches in response)`
      );
    }
    if (batch.length === 0) break;
    for (const m of batch) {
      if (typeof m.match_id === "number" && m.match_id > 0) {
        ids.push(m.match_id);
      }
    }
    const last = (_d = batch[batch.length - 1]) == null ? void 0 : _d.match_id;
    if (last === void 0 || batch.length < 100) break;
    startAt = last - 1;
  }
  const unique = [...new Set(ids)].slice(0, maxMatches);
  logger.info({ leagueId, count: unique.length }, "Steam league match IDs loaded");
  return unique;
}
async function resolveLeagueMatchIds(leagueId, maxMatches = 80) {
  var _a, _b;
  const envIds = parseEnvMatchIds();
  const warnings = [];
  if (!((_a = env.STEAM_WEB_API_KEY) == null ? void 0 : _a.trim()) && envIds.length === 0) {
    return {
      matchIds: [],
      source: "env",
      warning: "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs)."
    };
  }
  let steamIds = [];
  if ((_b = env.STEAM_WEB_API_KEY) == null ? void 0 : _b.trim()) {
    try {
      steamIds = await fetchSteamLeagueMatchIds(leagueId, maxMatches);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, leagueId }, "Steam league match history failed");
      warnings.push(msg);
    }
  } else if (envIds.length === 0) {
    warnings.push("STEAM_WEB_API_KEY is not set — cannot load match list from Steam.");
  }
  const combined = [.../* @__PURE__ */ new Set([...envIds, ...steamIds])].slice(0, maxMatches);
  if (combined.length === 0) {
    return {
      matchIds: [],
      source: envIds.length > 0 ? "env" : "steam",
      warning: warnings.join(" ") || `No matches returned for league ${leagueId}. Add LEAGUE_MATCH_IDS or verify the Steam key and league ID.`
    };
  }
  let source = "steam";
  if (envIds.length > 0 && steamIds.length > 0) source = "mixed";
  else if (envIds.length > 0 && steamIds.length === 0) source = "env";
  if (steamIds.length === 0 && envIds.length > 0) {
    warnings.push(`Using ${envIds.length} match ID(s) from LEAGUE_MATCH_IDS only.`);
  }
  return {
    matchIds: combined,
    source,
    warning: warnings.length > 0 ? warnings.join(" ") : void 0
  };
}
const LANE_TIE_THRESHOLD_PCT = 10;
function laneEfficiencyPct(p) {
  const v = p.lane_efficiency_pct ?? p.lane_efficiency;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function isRadiantSlot(slot) {
  return slot !== void 0 && slot < 128;
}
function validAccountId(id) {
  return typeof id === "number" && id > 0 && id < 4294967295;
}
function computeLaneOutcomesForMatch(players) {
  const outcomes = /* @__PURE__ */ new Map();
  if (!(players == null ? void 0 : players.length)) return outcomes;
  const eligible = players.filter(
    (p) => validAccountId(p.account_id) && typeof p.lane === "number" && p.lane > 0 && !p.is_roaming
  );
  const laneIds = [...new Set(eligible.map((p) => p.lane))];
  for (const lane of laneIds) {
    const inLane = eligible.filter((p) => p.lane === lane);
    const radiant = inLane.filter((p) => isRadiantSlot(p.player_slot));
    const dire = inLane.filter((p) => !isRadiantSlot(p.player_slot));
    if (radiant.length === 0 || dire.length === 0) continue;
    const radEff = Math.max(0, ...radiant.map(laneEfficiencyPct));
    const direEff = Math.max(0, ...dire.map(laneEfficiencyPct));
    const diff = radEff - direEff;
    let radOutcome;
    if (Math.abs(diff) <= LANE_TIE_THRESHOLD_PCT) radOutcome = "draw";
    else radOutcome = diff > 0 ? "win" : "loss";
    const direOutcome = radOutcome === "draw" ? "draw" : radOutcome === "win" ? "loss" : "win";
    for (const p of radiant) outcomes.set(p.account_id, radOutcome);
    for (const p of dire) outcomes.set(p.account_id, direOutcome);
  }
  return outcomes;
}
function formatLaneRecord(wins, draws, losses) {
  return `${wins}W · ${draws}D · ${losses}L`;
}
function defaultLeagueStatsDirCandidates() {
  return [
    path.resolve(process.cwd(), "data/league-stats"),
    path.resolve(process.cwd(), "apps/broadcast-api/data/league-stats")
  ];
}
function leagueStatsDir() {
  var _a;
  const configured = (_a = env.LEAGUE_STATS_DIR) == null ? void 0 : _a.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  const leagueId = env.LEAGUE_ID;
  for (const dir of defaultLeagueStatsDirCandidates()) {
    if (existsSync(path.join(dir, `league_${leagueId}_heroes.csv`))) {
      return dir;
    }
  }
  for (const dir of defaultLeagueStatsDirCandidates()) {
    if (existsSync(dir)) return dir;
  }
  return defaultLeagueStatsDirCandidates()[0];
}
function leagueStatsCsvMissingPayload(leagueId) {
  const dir = leagueStatsDir();
  const paths = leagueStatsPaths(leagueId);
  return {
    code: "league_stats_csv_missing",
    error: `No league stats CSV for league ${leagueId}. Click "fetch league stats" in admin (needs STEAM_WEB_API_KEY), or copy league_${leagueId}_heroes.csv into ${dir}`,
    leagueId,
    statsDir: dir,
    expectedFiles: [paths.heroes, paths.playerHeroes]
  };
}
function leagueStatsCsvLoadFailedPayload(leagueId, statsStorage) {
  const dir = leagueStatsDir();
  const paths = leagueStatsPaths(leagueId);
  return {
    code: "league_stats_csv_load_failed",
    error: `League CSV is on disk (${dir}) but could not be loaded into memory. Check file permissions and CSV format, then click "reload CSV".`,
    leagueId,
    statsDir: dir,
    expectedFiles: [paths.heroes, paths.playerHeroes],
    statsStorage
  };
}
function leagueStatsPaths(leagueId) {
  const dir = leagueStatsDir();
  return {
    dir,
    heroes: path.join(dir, `league_${leagueId}_heroes.csv`),
    playerHeroes: path.join(dir, `league_${leagueId}_player_heroes.csv`),
    meta: path.join(dir, `league_${leagueId}_meta.json`)
  };
}
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
function csvCell(value) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#")).map(parseCsvLine);
}
function num(row, idx, fallback = 0) {
  const v = Number(row[idx]);
  return Number.isFinite(v) ? v : fallback;
}
function optNum(row, idx) {
  const v = Number(row[idx]);
  return Number.isFinite(v) ? v : void 0;
}
function shouldCountPlayerLeagueGame(p) {
  const kills = p.kills ?? 0;
  const deaths = p.deaths ?? 0;
  const assists = p.assists ?? 0;
  if (kills === 0 && deaths === 0 && assists === 0) return false;
  if ((p.leaver_status ?? 0) >= 3) return false;
  return true;
}
function isLeaverLikePlayerHeroRow(row) {
  return row.games === 1 && row.kills === 0 && row.deaths === 0 && row.assists === 0;
}
function filterLeaverLikePlayerHeroRows(rows) {
  return rows.filter((row) => !isLeaverLikePlayerHeroRow(row));
}
function buildPlayerHeroIndex(rows) {
  const index = {};
  for (const row of rows) {
    if (row.games <= 0 || isLeaverLikePlayerHeroRow(row)) continue;
    const kda = row.deaths > 0 ? (row.kills + row.assists) / row.deaths : row.kills + row.assists;
    index[`${row.steam32}:${row.heroId}`] = {
      games: row.games,
      wins: row.wins,
      winRate: row.wins / row.games,
      avgKills: row.kills / row.games,
      avgDeaths: row.deaths / row.games,
      avgAssists: row.assists / row.games,
      avgKda: kda,
      maxKills: row.maxKills,
      avgHeroDamage: row.heroDamage / row.games,
      avgGpm: row.goldPerMin / row.games,
      avgLastHits: row.lastHits / row.games,
      laneWins: row.laneWins,
      laneDraws: row.laneDraws,
      laneLosses: row.laneLosses
    };
  }
  return index;
}
async function loadLeagueStatsFromDisk(leagueId) {
  const paths = leagueStatsPaths(leagueId);
  if (!await fileExists(paths.heroes)) {
    return null;
  }
  try {
    const heroesText = await readFile(paths.heroes, "utf8");
    const heroRows = parseCsv(heroesText);
    if (heroRows.length < 2) return null;
    const heroIndex = {};
    for (const row of heroRows.slice(1)) {
      const heroId = num(row, 0);
      if (heroId <= 0) continue;
      heroIndex[String(heroId)] = {
        heroId,
        heroName: row[1] || void 0,
        picks: num(row, 2),
        bans: num(row, 3),
        wins: num(row, 4),
        losses: num(row, 5),
        games: num(row, 6),
        pickRate: optNum(row, 7),
        banRate: optNum(row, 8),
        winRate: optNum(row, 9),
        contestRate: optNum(row, 10)
      };
    }
    let playerHeroes = [];
    if (await fileExists(paths.playerHeroes)) {
      const playerText = await readFile(paths.playerHeroes, "utf8");
      const playerRows = parseCsv(playerText);
      for (const row of playerRows.slice(1)) {
        const steam32 = num(row, 0);
        const heroId = num(row, 1);
        if (steam32 <= 0 || heroId <= 0) continue;
        playerHeroes.push({
          steam32,
          heroId,
          games: num(row, 2),
          wins: num(row, 3),
          kills: num(row, 4),
          deaths: num(row, 5),
          assists: num(row, 6),
          heroDamage: num(row, 7),
          goldPerMin: num(row, 8),
          lastHits: num(row, 9),
          maxKills: num(row, 10),
          laneWins: num(row, 11),
          laneDraws: num(row, 12),
          laneLosses: num(row, 13)
        });
      }
      playerHeroes = filterLeaverLikePlayerHeroRows(playerHeroes);
    }
    let meta = {
      leagueId,
      matchTotal: 0,
      matchDone: 0,
      aggregatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      source: "csv"
    };
    if (await fileExists(paths.meta)) {
      const raw = JSON.parse(await readFile(paths.meta, "utf8"));
      meta = { ...meta, ...raw, leagueId, source: "csv" };
    }
    return { heroIndex, playerHeroes, meta };
  } catch (err) {
    logger.warn({ err, leagueId }, "Failed to load league stats CSV");
    return null;
  }
}
async function saveLeagueStatsToDisk(snapshot) {
  const { leagueId } = snapshot.meta;
  const paths = leagueStatsPaths(leagueId);
  await mkdir(paths.dir, { recursive: true });
  const heroHeader = "heroId,heroName,picks,bans,wins,losses,games,pickRate,banRate,winRate,contestRate";
  const heroLines = [heroHeader];
  for (const agg of Object.values(snapshot.heroIndex).sort(
    (a, b) => a.heroId - b.heroId
  )) {
    heroLines.push(
      [
        agg.heroId,
        csvCell(agg.heroName ?? ""),
        agg.picks,
        agg.bans,
        agg.wins,
        agg.losses,
        agg.games,
        agg.pickRate ?? "",
        agg.banRate ?? "",
        agg.winRate ?? "",
        agg.contestRate ?? ""
      ].join(",")
    );
  }
  await writeFile(paths.heroes, `# BPC league hero stats — league ${leagueId}
${heroLines.join("\n")}
`, "utf8");
  const playerHeader = "steam32,heroId,games,wins,kills,deaths,assists,heroDamage,goldPerMin,lastHits,maxKills,laneWins,laneDraws,laneLosses";
  const playerLines = [playerHeader];
  for (const row of snapshot.playerHeroes.sort(
    (a, b) => a.steam32 - b.steam32 || a.heroId - b.heroId
  )) {
    playerLines.push(
      [
        row.steam32,
        row.heroId,
        row.games,
        row.wins,
        row.kills,
        row.deaths,
        row.assists,
        row.heroDamage,
        row.goldPerMin,
        row.lastHits,
        row.maxKills,
        row.laneWins,
        row.laneDraws,
        row.laneLosses
      ].join(",")
    );
  }
  await writeFile(
    paths.playerHeroes,
    `# BPC league player×hero stats — league ${leagueId}
${playerLines.join("\n")}
`,
    "utf8"
  );
  await writeFile(paths.meta, `${JSON.stringify(snapshot.meta, null, 2)}
`, "utf8");
  return { dir: paths.dir, paths };
}
async function leagueStatsFileInfo(leagueId) {
  const paths = leagueStatsPaths(leagueId);
  const [heroes, playerHeroes, meta] = await Promise.all([
    fileExists(paths.heroes),
    fileExists(paths.playerHeroes),
    fileExists(paths.meta)
  ]);
  return {
    dir: paths.dir,
    heroesPath: paths.heroes,
    playerHeroesPath: paths.playerHeroes,
    metaPath: paths.meta,
    heroesExists: heroes,
    playerHeroesExists: playerHeroes,
    metaExists: meta,
    ready: heroes
  };
}
const ANONYMOUS_ACCOUNT_ID = 4294967295;
function steam32FromMatchPlayer(p) {
  const id = p.account_id;
  if (typeof id !== "number" || !Number.isFinite(id)) return void 0;
  if (id <= 0 || id >= ANONYMOUS_ACCOUNT_ID) return void 0;
  return id;
}
class TournamentAggregator {
  constructor() {
    __publicField(this, "progress", {
      status: "idle",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    });
    __publicField(this, "playerLeagueHeroes", /* @__PURE__ */ new Map());
    __publicField(this, "running", false);
  }
  getProgress() {
    return { ...this.progress, heroIndex: { ...this.progress.heroIndex } };
  }
  /** True while aggregateLeague() is actively executing (use for API guards). */
  isBusy() {
    return this.running;
  }
  getPlayerHeroStats(steam32, heroId) {
    var _a;
    const ph = (_a = this.playerLeagueHeroes.get(steam32)) == null ? void 0 : _a.get(heroId);
    if (!ph || ph.games === 0) return void 0;
    return this.accToPlayerHeroStats(ph);
  }
  /** Aggregate all hero rows for a player in the current league. */
  getPlayerLeagueStats(steam32) {
    const phMap = this.playerLeagueHeroes.get(steam32);
    if (!phMap || phMap.size === 0) return void 0;
    const acc = {
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
    for (const ph of phMap.values()) {
      if (this.isLeaverLikePlayerHeroAcc(ph)) continue;
      acc.games += ph.games;
      acc.wins += ph.wins;
      acc.kills += ph.kills;
      acc.deaths += ph.deaths;
      acc.assists += ph.assists;
      acc.heroDamage += ph.heroDamage;
      acc.goldPerMin += ph.goldPerMin;
      acc.lastHits += ph.lastHits;
      acc.maxKills = Math.max(acc.maxKills, ph.maxKills);
      acc.laneWins += ph.laneWins;
      acc.laneDraws += ph.laneDraws;
      acc.laneLosses += ph.laneLosses;
    }
    if (acc.games === 0) return void 0;
    return this.accToPlayerHeroStats(acc);
  }
  accToPlayerHeroStats(ph) {
    const games = ph.games;
    const kda = ph.deaths > 0 ? (ph.kills + ph.assists) / ph.deaths : ph.kills + ph.assists;
    return {
      games,
      wins: ph.wins,
      winRate: ph.wins / games,
      avgKills: ph.kills / games,
      avgDeaths: ph.deaths / games,
      avgAssists: ph.assists / games,
      avgKda: kda,
      maxKills: ph.maxKills,
      avgHeroDamage: ph.heroDamage / games,
      avgGpm: ph.goldPerMin / games,
      avgLastHits: ph.lastHits / games,
      laneWins: ph.laneWins ?? 0,
      laneDraws: ph.laneDraws ?? 0,
      laneLosses: ph.laneLosses ?? 0
    };
  }
  /** Restore in-memory player stats + hero index from CSV (no API calls). */
  hydrateFromSnapshot(heroIndex, playerHeroes, matchTotal, matchDone) {
    this.playerLeagueHeroes.clear();
    for (const row of playerHeroes) {
      let phMap = this.playerLeagueHeroes.get(row.steam32);
      if (!phMap) {
        phMap = /* @__PURE__ */ new Map();
        this.playerLeagueHeroes.set(row.steam32, phMap);
      }
      phMap.set(row.heroId, {
        games: row.games,
        wins: row.wins,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        heroDamage: row.heroDamage,
        goldPerMin: row.goldPerMin,
        lastHits: row.lastHits,
        maxKills: row.maxKills,
        laneWins: row.laneWins,
        laneDraws: row.laneDraws,
        laneLosses: row.laneLosses
      });
    }
    this.progress = {
      status: "ready",
      progress: 100,
      matchTotal,
      matchDone,
      heroIndex: { ...heroIndex }
    };
  }
  exportPlayerHeroRows() {
    const rows = [];
    for (const [steam32, phMap] of this.playerLeagueHeroes) {
      for (const [heroId, acc] of phMap) {
        rows.push({ steam32, heroId, ...acc });
      }
    }
    return rows;
  }
  async aggregateLeague(leagueId, client, maxMatches = 80, onProgress) {
    var _a, _b;
    if (this.running) {
      throw new Error("Aggregation already running");
    }
    this.running = true;
    this.playerLeagueHeroes.clear();
    this.progress = {
      status: "running",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {}
    };
    try {
      await ensureHeroRegistry(client);
      const resolved = await resolveLeagueMatchIds(leagueId, maxMatches);
      const matchIds = resolved.matchIds;
      if (matchIds.length === 0) {
        throw new Error(
          resolved.warning ?? `No matches found for league ${leagueId}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`
        );
      }
      if (resolved.warning) {
        logger.warn({ leagueId, warning: resolved.warning }, "League match resolve");
      }
      this.progress.matchTotal = matchIds.length;
      const heroAcc = /* @__PURE__ */ new Map();
      let ingested = 0;
      for (let i = 0; i < matchIds.length; i++) {
        const matchId = matchIds[i];
        if (matchId === void 0) continue;
        logger.info(
          { matchId, index: i + 1, total: matchIds.length },
          "Aggregating league match"
        );
        let detail = await client.matchDetails(matchId);
        if (!detail.ok || !((_b = (_a = detail.data) == null ? void 0 : _a.players) == null ? void 0 : _b.length)) {
          await client.requestMatchParse(matchId);
          detail = await client.matchDetails(matchId);
        }
        if (detail.ok && detail.data) {
          if (detail.data.leagueid != null && detail.data.leagueid !== 0 && detail.data.leagueid !== leagueId) {
            logger.warn(
              {
                matchId,
                expectedLeague: leagueId,
                actualLeague: detail.data.leagueid
              },
              "Skipping match — leagueid mismatch"
            );
          } else {
            this.ingestMatch(detail.data, heroAcc);
            ingested += 1;
          }
        }
        this.progress.matchDone = i + 1;
        this.progress.progress = Math.round(
          (i + 1) / Math.max(1, matchIds.length) * 100
        );
        onProgress == null ? void 0 : onProgress(this.getProgress());
      }
      if (ingested === 0) {
        throw new Error(
          `Found ${matchIds.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`
        );
      }
      const index = {};
      for (const [heroId, acc] of heroAcc) {
        const games = acc.wins + acc.losses;
        const pickRate = ingested > 0 ? acc.picks / ingested : 0;
        const banRate = ingested > 0 ? acc.bans / ingested : 0;
        const contestRate = pickRate + banRate;
        const winRate = games > 0 ? acc.wins / games : void 0;
        index[String(heroId)] = {
          heroId,
          heroName: heroDisplayName(heroId),
          picks: acc.picks,
          bans: acc.bans,
          wins: acc.wins,
          losses: acc.losses,
          games,
          pickRate,
          banRate,
          winRate,
          contestRate
        };
      }
      this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: matchIds.length,
        matchDone: matchIds.length,
        heroIndex: index
      };
      return index;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.progress = {
        ...this.progress,
        status: "error",
        error: msg
      };
      throw err;
    } finally {
      this.running = false;
    }
  }
  ingestMatch(match, heroAcc) {
    const radiantWin = match.radiant_win === true;
    const laneOutcomes = computeLaneOutcomesForMatch(match.players);
    for (const pb of this.resolvePickBans(match)) {
      const acc = this.getAcc(heroAcc, pb.hero_id);
      if (pb.is_pick) acc.picks += 1;
      else acc.bans += 1;
    }
    for (const p of match.players ?? []) {
      const steam32 = steam32FromMatchPlayer(p);
      if (steam32 === void 0 || typeof p.hero_id !== "number") {
        continue;
      }
      const won = p.player_slot !== void 0 && p.player_slot < 128 && radiantWin || p.player_slot !== void 0 && p.player_slot >= 128 && !radiantWin;
      const acc = this.getAcc(heroAcc, p.hero_id);
      if (won) acc.wins += 1;
      else acc.losses += 1;
      if (!shouldCountPlayerLeagueGame(p)) continue;
      this.trackPlayerHero(steam32, p.hero_id, won, p, laneOutcomes.get(steam32));
    }
  }
  isLeaverLikePlayerHeroAcc(ph) {
    return ph.games === 1 && ph.kills === 0 && ph.deaths === 0 && ph.assists === 0;
  }
  trackPlayerHero(steam32, heroId, won, p, laneOutcome) {
    let phMap = this.playerLeagueHeroes.get(steam32);
    if (!phMap) {
      phMap = /* @__PURE__ */ new Map();
      this.playerLeagueHeroes.set(steam32, phMap);
    }
    const kills = typeof p.kills === "number" ? p.kills : 0;
    const deaths = typeof p.deaths === "number" ? p.deaths : 0;
    const assists = typeof p.assists === "number" ? p.assists : 0;
    const heroDamage = typeof p.hero_damage === "number" ? p.hero_damage : 0;
    const gpm = typeof p.gold_per_min === "number" ? p.gold_per_min : 0;
    const lastHits = typeof p.last_hits === "number" ? p.last_hits : 0;
    const cur = phMap.get(heroId) ?? {
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
    cur.games += 1;
    if (won) cur.wins += 1;
    if (laneOutcome === "win") cur.laneWins += 1;
    else if (laneOutcome === "draw") cur.laneDraws += 1;
    else if (laneOutcome === "loss") cur.laneLosses += 1;
    cur.kills += kills;
    cur.deaths += deaths;
    cur.assists += assists;
    cur.heroDamage += heroDamage;
    cur.goldPerMin += gpm;
    cur.lastHits += lastHits;
    if (kills > cur.maxKills) cur.maxKills = kills;
    phMap.set(heroId, cur);
  }
  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  resolvePickBans(match) {
    const fromApi = getMatchPickBans(match);
    if (fromApi.length > 0) return fromApi;
    const derived = [];
    for (const p of match.players ?? []) {
      if (typeof p.hero_id !== "number") continue;
      derived.push({
        is_pick: true,
        hero_id: p.hero_id,
        team: p.player_slot !== void 0 && p.player_slot >= 128 ? 1 : 0,
        order: 0
      });
    }
    return derived;
  }
  getAcc(map, heroId) {
    let acc = map.get(heroId);
    if (!acc) {
      acc = { picks: 0, bans: 0, wins: 0, losses: 0 };
      map.set(heroId, acc);
    }
    return acc;
  }
}
const tournamentAggregator = new TournamentAggregator();
async function applyLeagueSnapshot(opts) {
  const { leagueId, state, broadcast, source } = opts;
  const snapshot = source === "csv" ? await loadLeagueStatsFromDisk(leagueId) : null;
  if (!snapshot) return false;
  tournamentAggregator.hydrateFromSnapshot(
    snapshot.heroIndex,
    snapshot.playerHeroes,
    snapshot.meta.matchTotal,
    snapshot.meta.matchDone
  );
  const next = await state.patchState({
    tournamentHeroIndex: snapshot.heroIndex,
    playerHeroIndex: buildPlayerHeroIndex(snapshot.playerHeroes),
    leagueConfig: {
      leagueId,
      aggregationStatus: "ready",
      aggregatedAt: snapshot.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: snapshot.meta.matchTotal,
      aggregationMatchDone: snapshot.meta.matchDone,
      aggregationError: void 0,
      aggregationSource: source,
      statsCsvDir: leagueStatsDir()
    }
  });
  await broadcast.broadcastFull(next);
  return true;
}
async function loadLeagueStatsFromCsvFile(opts) {
  const ok = await applyLeagueSnapshot({ ...opts, source: "csv" });
  if (ok) {
    logger.info(
      { leagueId: opts.leagueId, dir: leagueStatsDir() },
      "League stats loaded from CSV"
    );
  }
  return ok;
}
async function runLeagueAggregation(opts) {
  const { leagueId, state, opendota, broadcast } = opts;
  if (tournamentAggregator.isBusy()) {
    logger.info("League aggregation already running");
    return;
  }
  const runningPatch = await state.patchState({
    leagueConfig: {
      leagueId,
      aggregationStatus: "running",
      aggregationProgress: 0,
      aggregationMatchTotal: 0,
      aggregationMatchDone: 0,
      aggregationError: void 0
    }
  });
  await broadcast.broadcastFull(runningPatch);
  try {
    const index = await tournamentAggregator.aggregateLeague(
      leagueId,
      opendota,
      80,
      async (prog2) => {
        const next2 = await state.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: prog2.progress,
            aggregationMatchTotal: prog2.matchTotal,
            aggregationMatchDone: prog2.matchDone
          }
        });
        await broadcast.broadcastFull(next2);
      }
    );
    const prog = tournamentAggregator.getProgress();
    const aggregatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await saveLeagueStatsToDisk({
      heroIndex: index,
      playerHeroes: tournamentAggregator.exportPlayerHeroRows(),
      meta: {
        leagueId,
        matchTotal: prog.matchTotal,
        matchDone: prog.matchDone,
        aggregatedAt,
        source: "api"
      }
    });
    const next = await state.patchState({
      tournamentHeroIndex: index,
      playerHeroIndex: buildPlayerHeroIndex(
        tournamentAggregator.exportPlayerHeroRows()
      ),
      leagueConfig: {
        leagueId,
        aggregationStatus: "ready",
        aggregatedAt,
        aggregationProgress: 100,
        aggregationMatchTotal: prog.matchTotal,
        aggregationMatchDone: prog.matchDone,
        aggregationError: void 0,
        aggregationSource: "api",
        statsCsvDir: leagueStatsDir()
      }
    });
    await broadcast.broadcastFull(next);
    logger.info(
      { leagueId, matches: prog.matchTotal, dir: leagueStatsDir() },
      "League aggregation ready — saved to CSV"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, leagueId }, "League aggregation failed");
    const next = await state.patchState({
      leagueConfig: {
        leagueId,
        aggregationStatus: "error",
        aggregationError: msg
      }
    });
    await broadcast.broadcastFull(next);
  }
}
async function bootstrapLeagueFromEnv(opts) {
  var _a, _b, _c, _d;
  const { state, opendota, broadcast } = opts;
  const leagueId = env.LEAGUE_ID;
  const snap = await state.getState();
  const needsId = ((_a = snap.leagueConfig) == null ? void 0 : _a.leagueId) !== leagueId || ((_b = snap.leagueConfig) == null ? void 0 : _b.leagueId) === null || ((_c = snap.leagueConfig) == null ? void 0 : _c.leagueId) === void 0;
  if (needsId) {
    await state.patchState({
      leagueConfig: { leagueId, aggregationStatus: "idle" }
    });
  }
  const csvLoaded = await loadLeagueStatsFromCsvFile({
    leagueId,
    state,
    broadcast
  });
  if (csvLoaded) return;
  const after = await state.getState();
  const stateReady = ((_d = after.leagueConfig) == null ? void 0 : _d.aggregationStatus) === "ready";
  const memReady = tournamentAggregator.getProgress().status === "ready";
  const shouldAggregate = env.LEAGUE_AUTO_AGGREGATE && (!stateReady || !memReady) && tournamentAggregator.getProgress().status !== "running";
  if (shouldAggregate) {
    logger.info({ leagueId }, "Starting league aggregation (Steam match list + OpenDota details)");
    void runLeagueAggregation({ leagueId, state, opendota, broadcast });
  } else {
    logger.info(
      { leagueId, dir: leagueStatsDir() },
      "No league CSV found — place stats CSV or run manual aggregate in admin"
    );
  }
}
function leagueInfoFromEnv() {
  return {
    leagueId: env.LEAGUE_ID,
    autoAggregate: env.LEAGUE_AUTO_AGGREGATE,
    statsDir: leagueStatsDir()
  };
}
class LeagueStatsNotReadyError extends Error {
  constructor(message) {
    super(message);
    this.name = "LeagueStatsNotReadyError";
  }
}
function isLeagueAggregationReady(snap) {
  var _a;
  return ((_a = snap.leagueConfig) == null ? void 0 : _a.aggregationStatus) === "ready" && tournamentAggregator.getProgress().status === "ready";
}
function assertLeagueStatsReady(snap) {
  var _a, _b;
  const status = ((_a = snap.leagueConfig) == null ? void 0 : _a.aggregationStatus) ?? "idle";
  if (status === "running") {
    throw new LeagueStatsNotReadyError(
      "League stats aggregation is still running — wait for it to finish"
    );
  }
  if (status === "error") {
    throw new LeagueStatsNotReadyError(
      ((_b = snap.leagueConfig) == null ? void 0 : _b.aggregationError) ?? "League aggregation failed — re-run aggregate in admin"
    );
  }
  if (!isLeagueAggregationReady(snap)) {
    throw new LeagueStatsNotReadyError(
      "League stats not ready — run tournament aggregate first"
    );
  }
}
function normalizeTeamColorHex(raw) {
  if (!raw) return void 0;
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return void 0;
}
function parseRosterCsv(text) {
  var _a;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  let start = 0;
  const header = ((_a = lines[0]) == null ? void 0 : _a.toLowerCase()) ?? "";
  if (header.includes("steam") || header.includes("display")) {
    start = 1;
  }
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) continue;
    const displayName = parts[0] ?? "Player";
    const steam32 = Number(parts[1]);
    if (!Number.isFinite(steam32)) continue;
    let teamName;
    let teamKey;
    let teamColor;
    let avatarUrl;
    if (parts.length >= 4) {
      teamName = parts[2] || void 0;
      teamKey = parts[3] || void 0;
      if (parts.length >= 5) {
        const fifth = parts[4] ?? "";
        if (fifth.startsWith("http://") || fifth.startsWith("https://")) {
          avatarUrl = fifth;
        } else {
          teamColor = normalizeTeamColorHex(fifth);
        }
      }
      if (parts.length >= 6) {
        const sixth = parts[5] ?? "";
        if (sixth.startsWith("http://") || sixth.startsWith("https://")) {
          avatarUrl = sixth;
        }
      }
    } else if (parts.length === 3) {
      teamKey = parts[2] || void 0;
      teamName = teamKey == null ? void 0 : teamKey.replace(/_/g, " ");
    }
    out.push({ displayName, steam32, teamName, teamKey, teamColor, avatarUrl });
  }
  return out;
}
function teamColorsFromRoster(roster) {
  const colors = {};
  for (const row of roster) {
    if (!row.teamKey || !row.teamColor) continue;
    if (!colors[row.teamKey]) {
      colors[row.teamKey] = row.teamColor;
    }
  }
  return colors;
}
function listTeamsFromRoster(roster) {
  const byKey = /* @__PURE__ */ new Map();
  for (const p of roster) {
    const teamKey = p.teamKey ?? slugify(p.teamName ?? "unknown");
    const teamName = p.teamName ?? titleFromKey(teamKey);
    const existing = byKey.get(teamKey);
    if (existing) {
      existing.players.push(p);
      if (p.teamName && !existing.teamName) {
        existing.teamName = p.teamName;
      }
    } else {
      byKey.set(teamKey, {
        teamKey,
        teamName,
        players: [p]
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.teamName.localeCompare(b.teamName)
  );
}
function getTeamByKey(roster, teamKey) {
  return listTeamsFromRoster(roster).find((t) => t.teamKey === teamKey);
}
function teamLogoUrl(teamKey) {
  return teamLogoPath(teamKey);
}
function slugify(s) {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}
function titleFromKey(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function mapPickPlayersOntoSlots(slots, side, leagueConfig) {
  if (!slots) return slots;
  return slots.map((slot) => {
    if (slot.type !== "pick") return slot;
    const steam32 = manualPickSteam32(leagueConfig.matchSetup, side, slot.order);
    const playerName = manualPickDisplayName(leagueConfig, side, slot.order);
    if (steam32 == null && !playerName) {
      const { playerName: _pn, steam32: _s, ...rest } = slot;
      return rest;
    }
    return {
      ...slot,
      steam32: steam32 ?? void 0,
      playerName
    };
  });
}
function applyPickPlayersToDraft(draft, leagueConfig) {
  return {
    ...draft,
    radiant: draft.radiant ? {
      ...draft.radiant,
      slots: mapPickPlayersOntoSlots(
        draft.radiant.slots,
        "radiant",
        leagueConfig
      )
    } : draft.radiant,
    dire: draft.dire ? {
      ...draft.dire,
      slots: mapPickPlayersOntoSlots(draft.dire.slots, "dire", leagueConfig)
    } : draft.dire
  };
}
function draftPatchFromMatchSetup(matchSetup, roster, prev) {
  var _a, _b, _c, _d;
  const radiant = getTeamByKey(roster, matchSetup.radiantTeamKey);
  const dire = getTeamByKey(roster, matchSetup.direTeamKey);
  if (!radiant || !dire) {
    throw new Error("One or both teams not found in roster");
  }
  if (matchSetup.radiantTeamKey === matchSetup.direTeamKey) {
    throw new Error("Radiant and dire must be different teams");
  }
  return {
    series: {
      teamA: radiant.teamName,
      teamB: dire.teamName,
      scoreA: matchSetup.scoreA ?? ((_a = prev == null ? void 0 : prev.series) == null ? void 0 : _a.scoreA) ?? 0,
      scoreB: matchSetup.scoreB ?? ((_b = prev == null ? void 0 : prev.series) == null ? void 0 : _b.scoreB) ?? 0,
      bestOf: matchSetup.seriesBestOf,
      gameNumber: matchSetup.seriesGame,
      logoUrlA: teamLogoUrl(radiant.teamKey),
      logoUrlB: teamLogoUrl(dire.teamKey)
    },
    side: (prev == null ? void 0 : prev.side) ?? "radiant_first_pick",
    phase: (prev == null ? void 0 : prev.phase) ?? "bans",
    reserveSeconds: (prev == null ? void 0 : prev.reserveSeconds) ?? 0,
    radiant: {
      name: radiant.teamName,
      logoUrl: teamLogoUrl(radiant.teamKey),
      slots: (_c = prev == null ? void 0 : prev.radiant) == null ? void 0 : _c.slots
    },
    dire: {
      name: dire.teamName,
      logoUrl: teamLogoUrl(dire.teamKey),
      slots: (_d = prev == null ? void 0 : prev.dire) == null ? void 0 : _d.slots
    }
  };
}
const avatarCache = /* @__PURE__ */ new Map();
async function fetchSteamAvatarUrl(client, steam32) {
  var _a, _b, _c;
  if (steam32 <= 0) return void 0;
  const cached = avatarCache.get(steam32);
  if (cached) return cached;
  const res = await client.playerProfile(steam32);
  if (!res.ok || !res.data) return void 0;
  const body = res.data;
  const url = ((_a = body.profile) == null ? void 0 : _a.avatarfull) ?? body.avatarfull ?? ((_b = body.profile) == null ? void 0 : _b.avatarmedium) ?? body.avatarmedium ?? ((_c = body.profile) == null ? void 0 : _c.avatar) ?? body.avatar;
  if (typeof url === "string" && url.startsWith("http")) {
    avatarCache.set(steam32, url);
    return url;
  }
  return void 0;
}
async function enrichRosterAvatars(roster, client) {
  var _a;
  const out = [];
  for (const player of roster) {
    if ((_a = player.avatarUrl) == null ? void 0 : _a.trim()) {
      out.push(player);
      continue;
    }
    try {
      const url = await fetchSteamAvatarUrl(client, player.steam32);
      out.push(url ? { ...player, avatarUrl: url } : player);
    } catch (err) {
      logger.warn({ err, steam32: player.steam32 }, "avatar fetch failed");
      out.push(player);
    }
  }
  return out;
}
const CACHE_FILE = path.join(process.cwd(), "steam32-vanity-cache.json");
let _vanityCache = null;
function loadVanityCache() {
  if (_vanityCache) return _vanityCache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      _vanityCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      logger.info({ count: Object.keys(_vanityCache).length }, "[steam32] Loaded vanity cache from disk");
      return _vanityCache;
    }
  } catch {
  }
  _vanityCache = {};
  return _vanityCache;
}
function saveVanityCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    logger.warn({ err }, "[steam32] Failed to persist vanity cache");
  }
}
function resolveVanityUrl(vanity, apiKey) {
  return new Promise((resolve) => {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${vanity}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        var _a;
        try {
          const parsed = JSON.parse(data);
          if (((_a = parsed.response) == null ? void 0 : _a.success) === 1 && parsed.response.steamid) {
            const steam32 = Number(BigInt(parsed.response.steamid) - BigInt("76561197960265728"));
            resolve(steam32);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}
async function extractSteam32FromUrl(steamProfileUrl, steamApiKey) {
  if (!steamProfileUrl) return null;
  const matchProfiles = steamProfileUrl.match(/\/profiles\/(\d+)/);
  if (matchProfiles == null ? void 0 : matchProfiles[1]) {
    return Number(BigInt(matchProfiles[1]) - BigInt("76561197960265728"));
  }
  const matchId = steamProfileUrl.match(/\/id\/([^/?#]+)/);
  if (matchId == null ? void 0 : matchId[1]) {
    const vanity = matchId[1].trim().toLowerCase();
    const cache = loadVanityCache();
    if (cache[vanity] != null) {
      logger.debug({ vanity, steam32: cache[vanity] }, "[steam32] Cache hit");
      return cache[vanity];
    }
    if (!steamApiKey) {
      logger.warn({ vanity }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured");
      return null;
    }
    const steam32 = await resolveVanityUrl(vanity, steamApiKey);
    if (steam32 != null && steam32 > 0) {
      cache[vanity] = steam32;
      saveVanityCache(cache);
      logger.info({ vanity, steam32 }, "[steam32] Resolved & cached vanity → steam32");
    } else {
      logger.warn({ vanity }, "[steam32] Steam API could not resolve vanity URL");
    }
    return steam32;
  }
  logger.warn({ url: steamProfileUrl }, "[steam32] Unrecognized Steam profile URL format");
  return null;
}
function fetchUrlJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`BPC League API returned HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}
async function fetchRosterFromBpcLeague(opts) {
  const slug = (opts.seasonSlug || "season-1").trim().toLowerCase();
  logger.info({ slug }, "Starting roster sync from bpcleague.in");
  let rawTeams = [];
  try {
    if (slug === "latest" || slug === "active") {
      const payload = await fetchUrlJson("https://api.bpcleague.in/api/public/tournament");
      rawTeams = payload.teams || [];
    } else {
      const payload = await fetchUrlJson(`https://api.bpcleague.in/api/public/seasons/${slug}`);
      if (payload.snapshot && payload.snapshot.teams) {
        rawTeams = payload.snapshot.teams;
      } else if (payload.tournament && payload.tournament.teams) {
        rawTeams = payload.tournament.teams;
      } else if (payload.participations) {
        rawTeams = payload.participations.map((p) => p.team).filter(Boolean);
      }
    }
  } catch (err) {
    logger.error(err, "Failed to fetch season/tournament data from bpcleague.in");
    throw err;
  }
  if (!rawTeams || rawTeams.length === 0) {
    logger.warn("No teams found in bpcleague.in API response");
    return [];
  }
  const allEntries = [];
  for (const team of rawTeams) {
    const teamName = team.name.trim();
    const teamKey = team.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const teamColor = normalizeTeamColorHex(team.accentColor) || "#ffffff";
    for (const player of team.players || []) {
      allEntries.push({ teamName, teamKey, teamColor, player });
    }
  }
  logger.info({ total: allEntries.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const steam32Results = await Promise.all(
    allEntries.map(
      ({ player }) => extractSteam32FromUrl(player.steamProfile || "", opts.steamApiKey)
    )
  );
  const roster = [];
  for (let i = 0; i < allEntries.length; i++) {
    const { teamName, teamKey, teamColor, player } = allEntries[i];
    const steam32 = steam32Results[i];
    const displayName = player.displayName || player.name || "Player";
    if (steam32 != null && steam32 > 0) {
      roster.push({ displayName, steam32, teamName, teamKey, teamColor });
    } else {
      logger.warn({ displayName, url: player.steamProfile }, "[steam32] Could not resolve — player skipped");
    }
  }
  logger.info({ count: roster.length, total: allEntries.length }, "Completed roster sync from bpcleague.in");
  return roster;
}
async function fetchMatchesFromBpcLeague(seasonSlug) {
  var _a;
  const slug = (seasonSlug || "season-1").trim().toLowerCase();
  logger.info({ slug }, "Fetching tournament matches from bpcleague.in");
  try {
    let payload;
    if (slug === "latest" || slug === "active") {
      payload = await fetchUrlJson("https://api.bpcleague.in/api/public/tournament");
    } else {
      payload = await fetchUrlJson(`https://api.bpcleague.in/api/public/seasons/${slug}`);
    }
    let rawMatches = [];
    if (payload.snapshot && payload.snapshot.matches) {
      rawMatches = payload.snapshot.matches;
    } else if (payload.tournament && ((_a = payload.snapshot) == null ? void 0 : _a.matches)) {
      rawMatches = payload.snapshot.matches;
    } else if (payload.tournament && payload.tournament.matches) {
      rawMatches = payload.tournament.matches;
    } else if (payload.matches) {
      rawMatches = payload.matches;
    }
    return rawMatches.map((m) => {
      var _a2, _b, _c;
      return {
        id: m.id,
        team1: m.team1,
        team2: m.team2,
        winner: m.winner || null,
        status: m.status || "pending",
        stageKey: m.stageKey || "",
        seriesType: ((_a2 = m.meta) == null ? void 0 : _a2.seriesType) || "bo3",
        team1Score: ((_b = m.meta) == null ? void 0 : _b.team1Score) ?? 0,
        team2Score: ((_c = m.meta) == null ? void 0 : _c.team2Score) ?? 0
      };
    });
  } catch (err) {
    logger.error(err, "Failed to fetch matches from bpcleague.in");
    return [];
  }
}
async function fetchSeasonsFromBpcLeague() {
  logger.info("Fetching seasons list from bpcleague.in");
  try {
    const payload = await fetchUrlJson("https://api.bpcleague.in/api/public/seasons");
    const rawSeasons = payload.seasons || [];
    return rawSeasons.map((s) => ({
      slug: s.slug,
      name: s.name || s.slug,
      isActive: s.isActive ?? false
    }));
  } catch (err) {
    logger.error(err, "Failed to fetch seasons from bpcleague.in");
    return [];
  }
}
function pct(n) {
  if (n === void 0 || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmt1(n) {
  if (n === void 0 || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}
function fmtDamage(n) {
  if (n === void 0 || Number.isNaN(n)) return "—";
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
function wlRecord(wins, losses) {
  return `${wins}W / ${losses}L`;
}
function laneStatSlide(ph) {
  const lw = ph.laneWins ?? 0;
  const ld = ph.laneDraws ?? 0;
  const ll = ph.laneLosses ?? 0;
  if (lw + ld + ll === 0) return null;
  return {
    label: "Lane",
    value: formatLaneRecord(lw, ld, ll),
    sublabel: "win · draw · loss (EFF@10)"
  };
}
async function resolvePlayerAvatarUrl(client, steam32, roster) {
  var _a;
  const fromRoster = (_a = roster == null ? void 0 : roster.find((p) => p.steam32 === steam32)) == null ? void 0 : _a.avatarUrl;
  if (fromRoster == null ? void 0 : fromRoster.trim()) return fromRoster;
  return fetchSteamAvatarUrl(client, steam32);
}
function tournamentSlides(agg) {
  const unplayed = agg.games === 0 && agg.picks === 0;
  return [
    {
      label: "Tournament Record",
      value: unplayed ? "Not played" : wlRecord(agg.wins, agg.losses),
      sublabel: unplayed ? agg.bans > 0 ? "Banned in league · never picked" : "Not picked or banned this tournament" : `${pct(agg.winRate)} win rate · ${agg.games} games`
    },
    {
      label: "Picks",
      value: String(agg.picks),
      sublabel: agg.picks > 0 ? `${pct(agg.pickRate)} of drafts` : "Not picked in league"
    },
    {
      label: "Bans",
      value: String(agg.bans),
      sublabel: agg.bans > 0 ? `${pct(agg.banRate)} of drafts` : "Not banned in league"
    },
    {
      label: "Win Rate",
      value: agg.games > 0 ? pct(agg.winRate) : "—",
      sublabel: agg.games > 0 ? "when picked in league" : "No league games on this hero"
    }
  ];
}
function playerHeroSlides(displayName, heroName, ph, agg) {
  if (!ph || ph.games === 0) {
    return [
      {
        label: `${displayName} on ${heroName}`,
        value: "No league games",
        sublabel: "This player hasn't played this hero in the league yet"
      },
      ...agg ? [
        {
          label: "Hero pick rate",
          value: String(agg.picks),
          sublabel: `${pct(agg.pickRate)} of drafts`
        },
        {
          label: "Hero win rate",
          value: pct(agg.winRate),
          sublabel: wlRecord(agg.wins, agg.losses)
        }
      ] : []
    ];
  }
  const losses = ph.games - ph.wins;
  const kdaLine = `${fmt1(ph.avgKills)} / ${fmt1(ph.avgDeaths)} / ${fmt1(ph.avgAssists)}`;
  return [
    {
      label: `${displayName} — record`,
      value: wlRecord(ph.wins, losses),
      sublabel: `${pct(ph.winRate)} · ${ph.games} league game${ph.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(ph.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: fmt1(ph.avgKda),
      sublabel: `${kdaLine} per game`
    },
    {
      label: "Hero damage",
      value: fmtDamage(ph.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...laneStatSlide(ph) ? [laneStatSlide(ph)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(ph.avgGpm)} GPM`,
      sublabel: `${Math.round(ph.avgLastHits)} avg last hits`
    },
    ...agg ? [
      {
        label: "Hero in league",
        value: String(agg.picks),
        sublabel: `${pct(agg.pickRate)} pick · ${pct(agg.winRate)} WR`
      }
    ] : []
  ];
}
function playerLeagueSlides(displayName, pl) {
  if (!pl || pl.games === 0) {
    return [
      {
        label: displayName,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet"
      }
    ];
  }
  const losses = pl.games - pl.wins;
  const kdaLine = `${fmt1(pl.avgKills)} / ${fmt1(pl.avgDeaths)} / ${fmt1(pl.avgAssists)}`;
  return [
    {
      label: `${displayName} — record`,
      value: wlRecord(pl.wins, losses),
      sublabel: `${pct(pl.winRate)} · ${pl.games} league game${pl.games === 1 ? "" : "s"}`
    },
    {
      label: "Peak kills",
      value: String(pl.maxKills),
      sublabel: "best single game in league"
    },
    {
      label: "Avg KDA",
      value: fmt1(pl.avgKda),
      sublabel: `${kdaLine} per game`
    },
    {
      label: "Hero damage",
      value: fmtDamage(pl.avgHeroDamage),
      sublabel: "avg per game"
    },
    ...laneStatSlide(pl) ? [laneStatSlide(pl)] : [],
    {
      label: "Farm pace",
      value: `${Math.round(pl.avgGpm)} GPM`,
      sublabel: `${Math.round(pl.avgLastHits)} avg last hits`
    }
  ];
}
function toPlayerHeroPayload(ph) {
  if (!ph || ph.games === 0) {
    return { games: 0, wins: 0, losses: 0 };
  }
  return {
    games: ph.games,
    wins: ph.wins,
    losses: ph.games - ph.wins,
    winRate: ph.winRate,
    avgKills: ph.avgKills,
    avgDeaths: ph.avgDeaths,
    avgAssists: ph.avgAssists,
    avgKda: ph.avgKda,
    maxKills: ph.maxKills,
    avgHeroDamage: ph.avgHeroDamage,
    avgGpm: ph.avgGpm,
    avgLastHits: ph.avgLastHits,
    laneWins: ph.laneWins,
    laneDraws: ph.laneDraws,
    laneLosses: ph.laneLosses
  };
}
async function buildTournamentHeroCard(client, heroId, heroIndex) {
  await ensureHeroRegistry(client);
  const agg = heroIndex[String(heroId)] ?? {
    picks: 0,
    bans: 0,
    wins: 0,
    losses: 0,
    games: 0
  };
  const name = agg.heroName ?? heroDisplayName(heroId);
  const portrait = heroPortraitFieldsForHero(heroId, name);
  return {
    statsCardKind: "tournament-hero",
    playerLabel: name,
    heroId,
    heroName: name,
    ...portrait,
    tournament: {
      pickRate: agg.pickRate,
      winRate: agg.winRate,
      contestRate: agg.contestRate,
      banRate: agg.banRate,
      picks: agg.picks,
      bans: agg.bans,
      wins: agg.wins,
      losses: agg.losses,
      games: agg.games
    },
    statSlides: tournamentSlides(agg),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function buildPlayerHeroCard(client, steam32, heroId, displayName, heroIndex, roster, playerHeroIndex) {
  await ensureHeroRegistry(client);
  const leaguePh = leaguePlayerHeroFromIndex(
    playerHeroIndex,
    steam32,
    heroId
  );
  const agg = heroIndex[String(heroId)];
  const heroName = heroDisplayName(heroId);
  const portrait = heroPortraitFieldsForHero(heroId, heroName);
  const playerAvatarUrl = await resolvePlayerAvatarUrl(
    client,
    steam32,
    roster
  );
  return {
    statsCardKind: "player-hero",
    steam32,
    playerLabel: displayName,
    heroId,
    heroName,
    ...portrait,
    playerAvatarUrl,
    tournament: agg ? {
      pickRate: agg.pickRate,
      winRate: agg.winRate,
      contestRate: agg.contestRate,
      banRate: agg.banRate,
      picks: agg.picks,
      bans: agg.bans,
      wins: agg.wins,
      losses: agg.losses,
      games: agg.games
    } : void 0,
    playerHero: toPlayerHeroPayload(leaguePh),
    statSlides: playerHeroSlides(displayName, heroName, leaguePh, agg),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
function playerLeagueStatsFromIndex(steam32, playerHeroIndex) {
  return aggregatePlayerLeagueFromIndex(playerHeroIndex, steam32);
}
async function buildPlayerLeagueCard(client, steam32, displayName, playerHeroIndex, roster) {
  await ensureHeroRegistry(client);
  const leaguePl = playerLeagueStatsFromIndex(steam32, playerHeroIndex);
  const playerAvatarUrl = await resolvePlayerAvatarUrl(
    client,
    steam32,
    roster
  );
  const rosterPlayer = findRosterPlayer(roster ?? [], steam32);
  return {
    statsCardKind: "player-league",
    steam32,
    playerLabel: displayName,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl,
    teamLogoUrl: teamLogoUrlForKey(rosterPlayer == null ? void 0 : rosterPlayer.teamKey),
    teamColor: rosterPlayer == null ? void 0 : rosterPlayer.teamColor,
    playerHero: toPlayerHeroPayload(leaguePl),
    statSlides: playerLeagueSlides(displayName, leaguePl),
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "league"
  };
}
async function buildMatchupCard(client, heroAId, heroBId) {
  await ensureHeroRegistry(client);
  const data = await client.matchupBetween(heroAId, heroBId);
  const row = data.ok && data.data && typeof data.data === "object" ? data.data : {};
  const gamesPlayed = typeof row.games_played === "number" ? row.games_played : void 0;
  const wins = typeof row.wins === "number" ? row.wins : typeof row.win === "number" ? row.win : void 0;
  const statLines = [
    {
      label: "Games sampled",
      value: gamesPlayed !== void 0 ? String(gamesPlayed) : "—"
    },
    {
      label: "Hero A wins",
      value: wins !== void 0 ? String(wins) : "—"
    }
  ];
  const portraitA = heroPortraitFieldsForHero(heroAId);
  const portraitB = heroPortraitFieldsForHero(heroBId);
  return {
    heroAId,
    heroBId,
    heroAName: heroDisplayName(heroAId),
    heroBName: heroDisplayName(heroBId),
    heroAPortraitSlug: portraitA.heroPortraitSlug,
    heroBPortraitSlug: portraitB.heroPortraitSlug,
    heroAPortraitUrl: portraitA.heroPortraitUrl,
    heroBPortraitUrl: portraitB.heroPortraitUrl,
    matchup: row,
    statLines,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: data.ok ? "opendota_cached" : "stale"
  };
}
function buildCarouselFromHeroCard(card, slideDurationMs = 4e3) {
  var _a, _b, _c;
  const slides = card.statSlides && card.statSlides.length > 0 ? card.statSlides : [
    {
      label: "Win Rate",
      value: pct((_a = card.tournament) == null ? void 0 : _a.winRate),
      sublabel: card.tournament ? wlRecord(card.tournament.wins ?? 0, card.tournament.losses ?? 0) : void 0
    },
    {
      label: "Picks",
      value: String(((_b = card.tournament) == null ? void 0 : _b.picks) ?? "—"),
      sublabel: pct((_c = card.tournament) == null ? void 0 : _c.pickRate)
    }
  ];
  return {
    heroId: card.heroId,
    heroName: card.heroName,
    heroPortraitSlug: card.heroPortraitSlug,
    heroPortraitUrl: card.heroPortraitUrl,
    playerLabel: card.playerLabel,
    slides,
    activeIndex: 0,
    slideDurationMs,
    startedAt: Date.now()
  };
}
async function listHeroesForAdmin(client) {
  await ensureHeroRegistry(client);
  return listHeroesSorted();
}
class AutopilotManager {
  constructor() {
    __publicField(this, "timer", null);
    __publicField(this, "state", null);
    __publicField(this, "opendota", null);
    __publicField(this, "broadcast", null);
    __publicField(this, "config", {
      enabled: false,
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
    logger.info("Manual autopilot trigger requested");
    await this.triggerRandomCard();
  }
  configure(cfg, opts) {
    this.config = { ...this.config, ...cfg };
    if (opts) {
      this.state = opts.state;
      this.opendota = opts.opendota;
      this.broadcast = opts.broadcast;
    }
    if (this.config.enabled) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }
  startTimer() {
    this.stopTimer();
    if (!this.state || !this.opendota || !this.broadcast) {
      logger.warn("Autopilot cannot start: state, opendota or broadcast functions not configured.");
      return;
    }
    const intervalMs = this.config.intervalMinutes * 60 * 1e3;
    logger.info({ intervalMinutes: this.config.intervalMinutes }, "Starting stats autopilot timer");
    this.timer = setInterval(() => {
      void this.triggerRandomCard();
    }, intervalMs);
  }
  stopTimer() {
    if (this.timer) {
      logger.info("Stopping stats autopilot timer");
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async triggerRandomCard() {
    var _a, _b, _c, _d, _e, _f;
    if (!this.state || !this.opendota || !this.broadcast) return;
    try {
      const snap = await this.state.getState();
      const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
      if (roster.length === 0) {
        logger.debug("Autopilot: Roster is empty, skipping stats trigger");
        return;
      }
      const matchSetup = (_b = snap.leagueConfig) == null ? void 0 : _b.matchSetup;
      let activePlayers = roster;
      if ((matchSetup == null ? void 0 : matchSetup.radiantTeamKey) && (matchSetup == null ? void 0 : matchSetup.direTeamKey)) {
        activePlayers = roster.filter(
          (p) => p.teamKey === matchSetup.radiantTeamKey || p.teamKey === matchSetup.direTeamKey
        );
      }
      if (activePlayers.length === 0) {
        activePlayers = roster;
      }
      const types = this.config.cardTypes.length > 0 ? this.config.cardTypes : ["player-league", "player-hero", "tournament-hero", "matchup"];
      const cardType = types[Math.floor(Math.random() * types.length)];
      logger.info({ cardType }, "Autopilot: Triggering random stats card");
      const until = Date.now() + this.config.durationSeconds * 1e3;
      if (cardType === "player-league") {
        const player = activePlayers[Math.floor(Math.random() * activePlayers.length)];
        const card = await buildPlayerLeagueCard(
          this.opendota,
          player.steam32,
          player.displayName,
          snap.playerHeroIndex,
          roster
        );
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: null,
          overlayVisibility: {
            herostats: { mode: "timed", until }
          }
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ player: player.displayName }, "Autopilot: Displayed player league stats");
      } else if (cardType === "player-hero") {
        const player = activePlayers[Math.floor(Math.random() * activePlayers.length)];
        const playerHeroIndex = snap.playerHeroIndex ?? {};
        const prefix = `${player.steam32}:`;
        const playedHeroIds = Object.keys(playerHeroIndex).filter((k) => k.startsWith(prefix)).map((k) => Number(k.split(":")[1]));
        let heroId = 1;
        if (playedHeroIds.length > 0) {
          heroId = playedHeroIds[Math.floor(Math.random() * playedHeroIds.length)];
        } else {
          const tourneyHeroes = Object.keys(snap.tournamentHeroIndex ?? {});
          if (tourneyHeroes.length > 0) {
            heroId = Number(tourneyHeroes[Math.floor(Math.random() * tourneyHeroes.length)]);
          }
        }
        const card = await buildPlayerHeroCard(
          this.opendota,
          player.steam32,
          heroId,
          player.displayName,
          snap.tournamentHeroIndex ?? {},
          roster,
          snap.playerHeroIndex
        );
        const carousel = buildCarouselFromHeroCard(card, 4e3);
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: carousel,
          overlayVisibility: {
            herostats: { mode: "timed", until }
          }
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ player: player.displayName, heroId }, "Autopilot: Displayed player-hero stats carousel");
      } else if (cardType === "tournament-hero") {
        const indexKeys = Object.keys(snap.tournamentHeroIndex ?? {});
        if (indexKeys.length === 0) return;
        const heroId = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
        const card = await buildTournamentHeroCard(
          this.opendota,
          heroId,
          snap.tournamentHeroIndex ?? {}
        );
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: null,
          overlayVisibility: {
            herostats: { mode: "timed", until }
          }
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ heroId }, "Autopilot: Displayed tournament hero stats");
      } else if (cardType === "matchup") {
        const draftSlots = [
          ...((_d = (_c = snap.draft) == null ? void 0 : _c.radiant) == null ? void 0 : _d.slots) ?? [],
          ...((_f = (_e = snap.draft) == null ? void 0 : _e.dire) == null ? void 0 : _f.slots) ?? []
        ].filter((s) => s.heroId && s.heroId > 0);
        let heroA = 1;
        let heroB = 2;
        if (draftSlots.length >= 2) {
          const slotA = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          let slotB = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          while (slotB.heroId === slotA.heroId && draftSlots.length > 1) {
            slotB = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          }
          heroA = slotA.heroId;
          heroB = slotB.heroId;
        } else {
          const indexKeys = Object.keys(snap.tournamentHeroIndex ?? {});
          if (indexKeys.length >= 2) {
            heroA = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            heroB = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            while (heroB === heroA) {
              heroB = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            }
          }
        }
        const card = await buildMatchupCard(this.opendota, heroA, heroB);
        const next = await this.state.patchState({
          matchupCard: card,
          overlayVisibility: {
            matchup: { mode: "timed", until }
          }
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ heroA, heroB }, "Autopilot: Displayed matchup comparison stats");
      }
    } catch (err) {
      logger.error(err, "Autopilot: Error triggering stats card");
    }
  }
}
const autopilotManager = new AutopilotManager();
function leagueStatsError(res, err) {
  if (err instanceof LeagueStatsNotReadyError) {
    res.status(503).json({ error: err.message });
    return true;
  }
  return false;
}
function attachLeagueAndStatsRoutes(opts) {
  const { app, state, broadcast, opendota, io } = opts;
  autopilotManager.configure({}, { state, opendota, broadcast });
  app.get("/api/league/info", requireBroadcastAuth, async (_req, res) => {
    var _a;
    const snap = await state.getState();
    const csvInfo = await leagueStatsFileInfo(env.LEAGUE_ID);
    res.json({
      ...leagueInfoFromEnv(),
      configuredInEnv: true,
      leagueConfig: snap.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: csvInfo,
      steamApiConfigured: Boolean(env.STEAM_WEB_API_KEY),
      envMatchIdsConfigured: Boolean((_a = env.LEAGUE_MATCH_IDS) == null ? void 0 : _a.trim())
    });
  });
  app.post("/api/league/config", requireBroadcastAuth, async (_req, res) => {
    res.status(400).json({
      error: `League ID is set via LEAGUE_ID env (${env.LEAGUE_ID}). Update .env and restart the API.`
    });
  });
  app.post("/api/league/aggregate", requireBroadcastAuth, async (_req, res) => {
    var _a;
    if (tournamentAggregator.isBusy()) {
      return res.json({ ok: true, started: false, alreadyRunning: true });
    }
    const snap = await state.getState();
    if (((_a = snap.leagueConfig) == null ? void 0 : _a.aggregationStatus) === "running") {
      await state.patchState({
        leagueConfig: {
          leagueId: env.LEAGUE_ID,
          aggregationStatus: "idle",
          aggregationError: void 0
        }
      });
    }
    void runLeagueAggregation({
      leagueId: env.LEAGUE_ID,
      state,
      opendota,
      broadcast
    });
    res.json({ ok: true, started: true, leagueId: env.LEAGUE_ID });
  });
  app.post(
    "/api/league/stats/reload-csv",
    requireBroadcastAuth,
    async (_req, res) => {
      const ok = await loadLeagueStatsFromCsvFile({
        leagueId: env.LEAGUE_ID,
        state,
        broadcast
      });
      if (!ok) {
        const csvInfo = await leagueStatsFileInfo(env.LEAGUE_ID);
        const payload = csvInfo.heroesExists ? leagueStatsCsvLoadFailedPayload(env.LEAGUE_ID, csvInfo) : { ...leagueStatsCsvMissingPayload(env.LEAGUE_ID), statsStorage: csvInfo };
        return res.status(422).json(payload);
      }
      const snap = await state.getState();
      res.json({ ok: true, leagueConfig: snap.leagueConfig });
    }
  );
  app.get(
    "/api/league/stats/storage",
    requireBroadcastAuth,
    async (_req, res) => {
      var _a, _b;
      const info = await leagueStatsFileInfo(env.LEAGUE_ID);
      const snap = await state.getState();
      res.json({
        ...info,
        statsDir: leagueInfoFromEnv().statsDir,
        aggregationSource: (_a = snap.leagueConfig) == null ? void 0 : _a.aggregationSource,
        aggregatedAt: (_b = snap.leagueConfig) == null ? void 0 : _b.aggregatedAt
      });
    }
  );
  app.get(
    "/api/league/aggregate/status",
    requireBroadcastAuth,
    async (_req, res) => {
      const prog = tournamentAggregator.getProgress();
      const snap = await state.getState();
      res.json({
        ...prog,
        inMemoryRunning: tournamentAggregator.isBusy(),
        leagueId: env.LEAGUE_ID,
        leagueConfig: snap.leagueConfig
      });
    }
  );
  app.post("/api/roster/upload", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ csv: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const parsedRoster = parseRosterCsv(parsed.data.csv);
    const roster = await enrichRosterAvatars(parsedRoster, opendota);
    const teamColors = teamColorsFromRoster(roster);
    const next = await state.patchState({
      leagueConfig: { roster, teamColors, leagueId: env.LEAGUE_ID }
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, count: roster.length, teamColors, roster });
  });
  app.post("/api/roster/sync-bpcleague", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ seasonSlug: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const seasonSlug = parsed.data.seasonSlug || "season-1";
      const rawRoster = await fetchRosterFromBpcLeague({
        seasonSlug,
        steamApiKey: env.STEAM_WEB_API_KEY
      });
      const roster = await enrichRosterAvatars(rawRoster, opendota);
      const teamColors = teamColorsFromRoster(roster);
      const next = await state.patchState({
        leagueConfig: { roster, teamColors, leagueId: env.LEAGUE_ID, seasonSlug }
      });
      await broadcast.broadcastFull(next);
      res.json({ ok: true, count: roster.length, teamColors, roster });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal Server Error during sync"
      });
    }
  });
  app.get("/api/roster", requireBroadcastAuth, async (_req, res) => {
    var _a;
    const snap = await state.getState();
    res.json(((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? []);
  });
  app.get("/api/teams", requireBroadcastAuth, async (_req, res) => {
    var _a;
    const snap = await state.getState();
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    res.json(listTeamsFromRoster(roster));
  });
  app.post("/api/match/setup", requireBroadcastAuth, async (req, res) => {
    var _a;
    const parsed = matchSetupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const snap = await state.getState();
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    if (roster.length === 0) {
      return res.status(400).json({ error: "upload roster first" });
    }
    const { seriesBestOf, seriesGame } = parsed.data;
    if (seriesGame > seriesBestOf) {
      return res.status(400).json({
        error: `Game ${seriesGame} is invalid for a BO${seriesBestOf} series`
      });
    }
    try {
      const matchSetup = parsed.data;
      const draftSeed = draftPatchFromMatchSetup(
        matchSetup,
        roster,
        snap.draft
      );
      const next = await state.patchState({
        leagueConfig: { matchSetup },
        draft: draftSeed,
        production: {
          playerMappingPublished: false
        }
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        matchSetup,
        teams: listTeamsFromRoster(roster),
        draft: next.draft
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  app.post(
    "/api/league/stats/resolve",
    requireBroadcastAuth,
    async (_req, res) => {
      var _a, _b;
      const snap = await state.getState();
      const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
      if (roster.length === 0) {
        return res.status(400).json({ error: "upload roster first" });
      }
      const csvInfo = await leagueStatsFileInfo(env.LEAGUE_ID);
      const loaded = await loadLeagueStatsFromCsvFile({
        leagueId: env.LEAGUE_ID,
        state,
        broadcast
      });
      if (!loaded) {
        const payload = csvInfo.heroesExists ? leagueStatsCsvLoadFailedPayload(env.LEAGUE_ID, csvInfo) : { ...leagueStatsCsvMissingPayload(env.LEAGUE_ID), statsStorage: csvInfo };
        return res.status(422).json(payload);
      }
      const after = await state.getState();
      const index = after.playerHeroIndex ?? {};
      const indexKeyCount = Object.keys(index).length;
      const missingSteam32 = [];
      for (const player of roster) {
        const prefix = `${player.steam32}:`;
        const hasRow = Object.keys(index).some((k) => k.startsWith(prefix));
        if (!hasRow) missingSteam32.push(player.steam32);
      }
      const csvSteam32 = new Set(
        Object.keys(index).map((k) => Number(k.split(":")[0]))
      );
      const sampleSteam32 = (_b = roster[0]) == null ? void 0 : _b.steam32;
      const sampleGames = sampleSteam32 != null ? summarizePlayerLeagueFromIndex(index, sampleSteam32).games : 0;
      res.json({
        ok: true,
        loaded: true,
        rosterCount: roster.length,
        csvPlayerCount: csvSteam32.size,
        indexKeyCount,
        matchedRosterCount: roster.length - missingSteam32.length,
        missingSteam32,
        statsStorage: csvInfo,
        indexEmpty: indexKeyCount === 0 ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API" : void 0,
        sampleRosterGamesInIndex: sampleGames,
        leagueConfig: after.leagueConfig
      });
    }
  );
  app.get(
    "/api/league/player/:steam32/stats-audit",
    requireBroadcastAuth,
    async (req, res) => {
      var _a;
      const steam32 = Number(req.params.steam32);
      if (!Number.isFinite(steam32) || steam32 <= 0) {
        return res.status(400).json({ error: "invalid steam32" });
      }
      const snap = await state.getState();
      const index = snap.playerHeroIndex ?? {};
      const prefix = `${steam32}:`;
      const heroRows = Object.entries(index).filter(([k]) => k.startsWith(prefix)).map(([k, row]) => ({
        heroId: Number(k.split(":")[1]),
        games: row.games,
        wins: row.wins
      }));
      const total = summarizePlayerLeagueFromIndex(index, steam32);
      const paths = await leagueStatsFileInfo(env.LEAGUE_ID);
      let csvLines = [];
      try {
        const csvText = await readFile(paths.playerHeroesPath, "utf8");
        csvLines = csvText.split(/\r?\n/).filter((l) => l.startsWith(`${steam32},`));
      } catch {
        csvLines = [];
      }
      const csvGamesSum = csvLines.reduce(
        (n, line) => n + (Number(line.split(",")[2]) || 0),
        0
      );
      res.json({
        steam32,
        leagueId: env.LEAGUE_ID,
        gamesInIndex: total.games,
        winsInIndex: total.wins,
        heroRows,
        csvRowCount: csvLines.length,
        csvGamesSum,
        aggregationMatchTotal: (_a = snap.leagueConfig) == null ? void 0 : _a.aggregationMatchTotal,
        hint: total.games === 0 ? "No league rows in memory — Resolve stats or Fetch league stats" : total.games < csvGamesSum ? "Index out of sync — click Resolve stats" : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)"
      });
    }
  );
  app.post(
    "/api/match/apply-player-mapping",
    requireBroadcastAuth,
    async (req, res) => {
      var _a, _b, _c, _d, _e;
      const bodyParsed = z.object({ pickPlayers: pickPlayersSchema.optional() }).safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return res.status(400).json({ error: bodyParsed.error.flatten() });
      }
      const snap = await state.getState();
      const baseMatchSetup = (_a = snap.leagueConfig) == null ? void 0 : _a.matchSetup;
      const roster = ((_b = snap.leagueConfig) == null ? void 0 : _b.roster) ?? [];
      const draft = snap.draft;
      if (!baseMatchSetup) {
        return res.status(400).json({ error: "save match setup first" });
      }
      if (!draft) {
        return res.status(400).json({ error: "no draft state" });
      }
      if (draft.phase !== "done") {
        return res.status(400).json({
          error: "draft must be complete before applying player mapping"
        });
      }
      const incomingPickPlayers = bodyParsed.data.pickPlayers;
      const matchSetup = incomingPickPlayers ? {
        ...baseMatchSetup,
        pickPlayers: {
          radiant: incomingPickPlayers.radiant ?? ((_c = baseMatchSetup.pickPlayers) == null ? void 0 : _c.radiant),
          dire: incomingPickPlayers.dire ?? ((_d = baseMatchSetup.pickPlayers) == null ? void 0 : _d.dire)
        }
      } : baseMatchSetup;
      const leagueConfig = {
        ...snap.leagueConfig,
        roster,
        matchSetup
      };
      const mappedDraft = applyPickPlayersToDraft(draft, leagueConfig);
      const next = await state.patchState({
        leagueConfig: { matchSetup },
        draft: mappedDraft,
        production: {
          playerMappingPublished: true
        }
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        matchSetup: (_e = next.leagueConfig) == null ? void 0 : _e.matchSetup,
        draft: next.draft,
        production: next.production
      });
    }
  );
  app.post(
    "/api/draft/reset-overlay",
    requireBroadcastAuth,
    async (_req, res) => {
      var _a, _b, _c;
      const snap = await state.getState();
      const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
      const matchSetup = (_b = snap.leagueConfig) == null ? void 0 : _b.matchSetup;
      const epoch = (((_c = snap.production) == null ? void 0 : _c.overlayDraftEpoch) ?? 0) + 1;
      let draft = null;
      if (matchSetup && roster.length > 0) {
        draft = draftPatchFromMatchSetup(
          matchSetup,
          roster,
          null
        );
      }
      const next = await state.patchState({
        draft,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: false,
          overlayDraftEpoch: epoch
        }
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        overlayDraftEpoch: epoch,
        draft: next.draft
      });
    }
  );
  app.post("/api/league/team-colors", requireBroadcastAuth, async (_req, res) => {
    res.status(410).json({
      error: "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors."
    });
  });
  app.get("/api/heroes", requireBroadcastAuth, async (_req, res) => {
    const heroes = await listHeroesForAdmin(opendota);
    res.json(heroes);
  });
  app.post("/api/stats/player-hero", requireBroadcastAuth, async (req, res) => {
    var _a;
    const schema = z.object({
      steam32: z.number(),
      heroId: z.number(),
      displayName: z.string().optional(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    const player = findRosterPlayer(roster, parsed.data.steam32) ?? {
      steam32: parsed.data.steam32,
      displayName: parsed.data.displayName ?? `Player ${parsed.data.steam32}`
    };
    const card = await buildPlayerHeroCard(
      opendota,
      parsed.data.steam32,
      parsed.data.heroId,
      player.displayName,
      snap.tournamentHeroIndex ?? {},
      roster,
      snap.playerHeroIndex
    );
    if (parsed.data.persist) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: null
      });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });
  app.post("/api/stats/player-league", requireBroadcastAuth, async (req, res) => {
    var _a;
    const schema = z.object({
      steam32: z.number(),
      displayName: z.string().optional(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    const player = findRosterPlayer(roster, parsed.data.steam32) ?? {
      steam32: parsed.data.steam32,
      displayName: parsed.data.displayName ?? `Player ${parsed.data.steam32}`
    };
    const card = await buildPlayerLeagueCard(
      opendota,
      parsed.data.steam32,
      player.displayName,
      snap.playerHeroIndex,
      roster
    );
    if (parsed.data.persist) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: null
      });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });
  app.post(
    "/api/stats/tournament-hero",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        heroId: z.number(),
        persist: z.boolean().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      const snap = await state.getState();
      try {
        assertLeagueStatsReady(snap);
      } catch (err) {
        if (leagueStatsError(res, err)) return;
        throw err;
      }
      const card = await buildTournamentHeroCard(
        opendota,
        parsed.data.heroId,
        snap.tournamentHeroIndex ?? {}
      );
      if (parsed.data.persist) {
        const next = await state.patchState({
          heroStatsCard: card,
          statCarousel: null
        });
        await broadcast.broadcastFull(next);
        return res.json({ ok: true, card, persisted: next });
      }
      res.json({ ok: true, card });
    }
  );
  app.post("/api/stats/matchup", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      heroAId: z.number(),
      heroBId: z.number(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }
    await state.getState();
    const card = await buildMatchupCard(
      opendota,
      parsed.data.heroAId,
      parsed.data.heroBId
    );
    if (parsed.data.persist) {
      const next = await state.patchState({ matchupCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });
  app.post("/api/producer/h2h", requireBroadcastAuth, async (req, res) => {
    var _a;
    const schema = z.object({
      player1Steam32: z.number(),
      player2Steam32: z.number()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }
    const snap = await state.getState();
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    const p1 = findRosterPlayer(roster, parsed.data.player1Steam32);
    const p2 = findRosterPlayer(roster, parsed.data.player2Steam32);
    if (!p1 || !p2) {
      return res.status(404).json({ error: "Players not found in roster" });
    }
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
    const p1Stats = aggregatePlayerLeagueFromIndex(snap.playerHeroIndex, parsed.data.player1Steam32);
    const p2Stats = aggregatePlayerLeagueFromIndex(snap.playerHeroIndex, parsed.data.player2Steam32);
    const payload = {
      player1: { ...p1, stats: p1Stats },
      player2: { ...p2, stats: p2Stats }
    };
    io.of("/overlay").emit("SHOW_H2H", payload);
    res.json({ ok: true, payload });
  });
  app.post("/api/stats/carousel", requireBroadcastAuth, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const schema = z.object({
      type: z.enum(["player-hero", "tournament-hero", "last-pick"]),
      heroId: z.number().optional(),
      steam32: z.number().optional(),
      slideDurationMs: z.number().optional(),
      overlaySeconds: z.number().optional(),
      persist: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    let card;
    if (parsed.data.type === "last-pick") {
      const lp = (_b = snap.draft) == null ? void 0 : _b.lastPick;
      if (!lp) return res.status(400).json({ error: "no last pick" });
      const side = lp.side === "dire" || lp.side === "B" ? "dire" : "radiant";
      const teamSlots = side === "radiant" ? (_d = (_c = snap.draft) == null ? void 0 : _c.radiant) == null ? void 0 : _d.slots : (_f = (_e = snap.draft) == null ? void 0 : _e.dire) == null ? void 0 : _f.slots;
      const slotOrder = pickSlotOrderForHero(side, lp.heroId, teamSlots);
      const manualSteam32 = slotOrder !== void 0 ? manualPickSteam32((_g = snap.leagueConfig) == null ? void 0 : _g.matchSetup, side, slotOrder) : void 0;
      const player = manualSteam32 != null && manualSteam32 > 0 ? findRosterPlayer(roster, manualSteam32) : void 0;
      card = player && manualSteam32 ? await buildPlayerHeroCard(
        opendota,
        manualSteam32,
        lp.heroId,
        player.displayName,
        snap.tournamentHeroIndex ?? {},
        roster,
        snap.playerHeroIndex
      ) : await buildTournamentHeroCard(
        opendota,
        lp.heroId,
        snap.tournamentHeroIndex ?? {}
      );
    } else if (parsed.data.type === "player-hero") {
      if (parsed.data.heroId === void 0 || parsed.data.steam32 === void 0)
        return res.status(400).json({ error: "steam32 and heroId required" });
      const player = findRosterPlayer(roster, parsed.data.steam32);
      card = await buildPlayerHeroCard(
        opendota,
        parsed.data.steam32,
        parsed.data.heroId,
        (player == null ? void 0 : player.displayName) ?? "Player",
        snap.tournamentHeroIndex ?? {},
        roster,
        snap.playerHeroIndex
      );
    } else {
      if (parsed.data.heroId === void 0)
        return res.status(400).json({ error: "heroId required" });
      card = await buildTournamentHeroCard(
        opendota,
        parsed.data.heroId,
        snap.tournamentHeroIndex ?? {}
      );
    }
    const carousel = buildCarouselFromHeroCard(
      card,
      parsed.data.slideDurationMs ?? 4e3
    );
    const until = Date.now() + (parsed.data.overlaySeconds ?? 12) * 1e3;
    if (parsed.data.persist !== false) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: carousel,
        overlayVisibility: {
          herostats: { mode: "timed", until }
        }
      });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, carousel, persisted: next });
    }
    res.json({ ok: true, card, carousel });
  });
  app.post("/api/stats/stop", requireBroadcastAuth, async (_req, res) => {
    const next = await state.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden"
      }
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, persisted: next });
  });
  app.post("/api/production/settings", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      autoShowStatsOnPick: z.boolean().optional(),
      playerMappingPublished: z.boolean().optional(),
      overlayDraftEpoch: z.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const next = await state.patchState({ production: parsed.data });
    await broadcast.broadcastFull(next);
    res.json(next.production);
  });
  app.get("/api/league/bpc-matches", requireBroadcastAuth, async (req, res) => {
    const seasonSlug = req.query.seasonSlug;
    const matches = await fetchMatchesFromBpcLeague(seasonSlug);
    res.json(matches);
  });
  app.get("/api/league/bpc-seasons", requireBroadcastAuth, async (_req, res) => {
    const seasons = await fetchSeasonsFromBpcLeague();
    res.json(seasons);
  });
  app.get("/api/autopilot/config", requireBroadcastAuth, (_req, res) => {
    res.json({
      config: autopilotManager.getConfig(),
      isActive: autopilotManager.isActive()
    });
  });
  app.post("/api/autopilot/config", requireBroadcastAuth, (req, res) => {
    const schema = z.object({
      enabled: z.boolean().optional(),
      intervalMinutes: z.number().min(1).optional(),
      durationSeconds: z.number().min(5).optional(),
      cardTypes: z.array(z.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    autopilotManager.configure(parsed.data);
    res.json({
      config: autopilotManager.getConfig(),
      isActive: autopilotManager.isActive()
    });
  });
  app.post("/api/autopilot/trigger", requireBroadcastAuth, async (_req, res) => {
    await autopilotManager.triggerNow();
    res.json({ ok: true, msg: "Autopilot triggered successfully" });
  });
}
const DRAFT_STATES = /* @__PURE__ */ new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME"
]);
function asRecord(v) {
  return v && typeof v === "object" ? v : null;
}
function slotHeroId(slot) {
  const r = asRecord(slot);
  if (!r) return null;
  const id = r.hero_id ?? r.heroid ?? r.id;
  if (typeof id === "number" && id > 0) return id;
  if (typeof id === "string") {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function heroClassString(v) {
  if (typeof v === "string" && v.length > 0) return v;
  return void 0;
}
const gsiHeroSlugDebugLogged = /* @__PURE__ */ new Set();
function gsiHeroSlugDebugEnabled() {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}
function maybeLogHeroSlugResolution(slotKey, heroId, heroClass, resolved) {
  if (!gsiHeroSlugDebugEnabled()) return;
  if (gsiHeroSlugDebugLogged.has(slotKey)) return;
  gsiHeroSlugDebugLogged.add(slotKey);
  console.log("[gsi:hero-slug]", {
    slot: slotKey,
    heroId,
    heroClass,
    resolvedSlug: resolved.slug,
    source: resolved.source
  });
}
function mediaForHero(heroId, heroClass, heroName, debugSlotKey) {
  const resolved = resolveHeroSlugForDraft({
    heroId: heroId ?? void 0,
    heroClass,
    heroName
  });
  if (debugSlotKey) {
    maybeLogHeroSlugResolution(debugSlotKey, heroId, heroClass, resolved);
  }
  const slug = resolved.slug ?? canonicalHeroSlugForDraft({ heroId, heroClass });
  if (slug) {
    return { ...heroPortraitMediaFromSlug(slug), slug };
  }
  if (heroId) {
    const flat = heroPortraitUrl(heroId, heroName);
    if (flat) {
      return {
        staticUrl: flat,
        staticFallbackUrl: flat,
        slug: resolveHeroSlugForDraft({ heroId, heroName }).slug
      };
    }
  }
  return {};
}
function displayNameForHero(heroId, heroClass) {
  if (heroId) return heroDisplayName(heroId);
  if (heroClass) {
    return heroClass.replace(/^npc_dota_hero_/, "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return void 0;
}
function flatDraftSlotObject(sideData, type, order) {
  const prefix = `${type}${order}`;
  const heroId = gsiNumber(sideData[`${prefix}_id`]);
  const heroClass = heroClassString(sideData[`${prefix}_class`]);
  if (!heroId && !heroClass) {
    return null;
  }
  const obj = {};
  if (heroId > 0) obj.hero_id = heroId;
  if (heroClass) obj.class = heroClass;
  return obj;
}
function parseSideSlots(sideData, side) {
  var _a;
  const slots = [];
  const seen = /* @__PURE__ */ new Set();
  const pushSlot = (type, order, heroId, heroClass) => {
    const key = `${type}-${order}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!heroId && !heroClass) return;
    const media = mediaForHero(
      heroId,
      heroClass,
      displayNameForHero(heroId, heroClass),
      `${side}-${type}${order}`
    );
    slots.push({
      order,
      type,
      heroId,
      heroName: displayNameForHero(heroId, heroClass),
      heroPortraitSlug: media.slug,
      heroPortraitUrl: media.staticUrl,
      heroPortraitAnimatedUrl: media.animatedUrl
    });
  };
  for (const [key, val] of Object.entries(sideData)) {
    const m = /^(pick|ban)(\d+)$/i.exec(key);
    if (!m) continue;
    const type = ((_a = m[1]) == null ? void 0 : _a.toLowerCase()) === "ban" ? "ban" : "pick";
    const order = Number(m[2]);
    const heroId = slotHeroId(val);
    const rec = asRecord(val);
    const heroClass = heroClassString((rec == null ? void 0 : rec.class) ?? (rec == null ? void 0 : rec.hero_class));
    pushSlot(type, order, heroId, heroClass);
  }
  for (let i = 0; i < 7; i++) {
    const banObj = flatDraftSlotObject(sideData, "ban", i);
    if (banObj) {
      pushSlot(
        "ban",
        i,
        gsiNumber(banObj.hero_id) > 0 ? gsiNumber(banObj.hero_id) : null,
        heroClassString(banObj.class)
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    const pickObj = flatDraftSlotObject(sideData, "pick", i);
    if (pickObj) {
      pushSlot(
        "pick",
        i,
        gsiNumber(pickObj.hero_id) > 0 ? gsiNumber(pickObj.hero_id) : null,
        heroClassString(pickObj.class)
      );
    }
  }
  slots.sort((a, b) => a.order - b.order);
  return slots;
}
function resolveGsiSideData(draft, side) {
  const nested = side === "radiant" ? asRecord(draft.radiant) ?? asRecord(draft.team2) : asRecord(draft.dire) ?? asRecord(draft.team3);
  return nested ?? {};
}
function activeTeamFromGsi(draft) {
  const t = draft.activeteam ?? draft.active_team;
  if (t === 2 || t === "2" || t === "radiant") return "radiant";
  if (t === 3 || t === "3" || t === "dire") return "dire";
  return null;
}
function gsiNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function turnActionFromGsi(draft) {
  const p = draft.pick;
  if (p === true || p === 1 || p === "1") return "pick";
  if (p === false || p === 0 || p === "0") return "ban";
  return "pick";
}
function reserveSecondsFromGsi(draft, activeTeam) {
  const team2 = asRecord(draft.team2);
  const team3 = asRecord(draft.team3);
  const radiant = gsiNumber(draft.radiant_bonus_time) || gsiNumber(team2 == null ? void 0 : team2.bonus_time);
  const dire = gsiNumber(draft.dire_bonus_time) || gsiNumber(team3 == null ? void 0 : team3.bonus_time);
  if (activeTeam === "radiant") return radiant;
  if (activeTeam === "dire") return dire;
  return Math.max(radiant, dire);
}
const CM_BANS_PER_TEAM = 7;
const CM_PICKS_PER_TEAM = 5;
function countFilled(slots, type) {
  return slots.filter(
    (s) => s.type === type && (s.heroId || s.heroPortraitUrl)
  ).length;
}
function draftRosterComplete(radiantSlots, direSlots) {
  return countFilled(radiantSlots, "pick") >= CM_PICKS_PER_TEAM && countFilled(direSlots, "pick") >= CM_PICKS_PER_TEAM;
}
function draftHasStarted(radiantSlots, direSlots) {
  return countFilled(radiantSlots, "ban") > 0 || countFilled(direSlots, "ban") > 0 || countFilled(radiantSlots, "pick") > 0 || countFilled(direSlots, "pick") > 0;
}
function startSecondsFromGsi(map, gameState, draftRec) {
  const clock = gsiNumber(map == null ? void 0 : map.clock_time);
  const teamTimer = gsiNumber(
    draftRec.activeteam_time_remaining ?? draftRec.active_team_time_remaining
  );
  const fromClock = () => {
    if (clock < 0) return Math.max(0, Math.round(-clock));
    if (clock > 0 && clock <= 120) return Math.round(clock);
    return void 0;
  };
  if (gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME") {
    return fromClock() ?? (teamTimer > 0 ? teamTimer : void 0);
  }
  if (gameState === "DOTA_GAMERULES_STATE_PRE_GAME") {
    return fromClock();
  }
  if (gameState === "DOTA_GAMERULES_STATE_HERO_SELECTION") {
    if (teamTimer > 0) return teamTimer;
    return fromClock();
  }
  return void 0;
}
function inferDraftPhase(inDraft, gameState, radiantSlots, direSlots, activeTeam) {
  if (!inDraft || draftRosterComplete(radiantSlots, direSlots)) {
    return "done";
  }
  if (gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || gameState === "DOTA_GAMERULES_STATE_PRE_GAME" && !draftHasStarted(radiantSlots, direSlots)) {
    return "starting";
  }
  if (gameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" && !draftHasStarted(radiantSlots, direSlots) && !activeTeam) {
    return "starting";
  }
  const radiantBans = countFilled(radiantSlots, "ban");
  const direBans = countFilled(direSlots, "ban");
  if (radiantBans < CM_BANS_PER_TEAM || direBans < CM_BANS_PER_TEAM) {
    return "bans";
  }
  return "picks";
}
function heroIdFromGsiPlayerEntry(val) {
  const r = asRecord(val);
  if (!r) return null;
  const heroRec = asRecord(r.hero);
  if (heroRec) {
    const fromHero = slotHeroId(heroRec);
    if (fromHero) return fromHero;
  }
  return slotHeroId(val);
}
function collectGsiPlayerHeroByOrder(payload, side) {
  const byPickOrder = /* @__PURE__ */ new Map();
  const playerRoot = asRecord(payload.player);
  const heroRoot = asRecord(payload.hero);
  const teamHeroData = side === "radiant" ? asRecord(heroRoot == null ? void 0 : heroRoot.team2) ?? asRecord(heroRoot == null ? void 0 : heroRoot.radiant) : asRecord(heroRoot == null ? void 0 : heroRoot.team3) ?? asRecord(heroRoot == null ? void 0 : heroRoot.dire);
  const teamPlayerData = side === "radiant" ? asRecord(playerRoot == null ? void 0 : playerRoot.team2) ?? asRecord(playerRoot == null ? void 0 : playerRoot.radiant) : asRecord(playerRoot == null ? void 0 : playerRoot.team3) ?? asRecord(playerRoot == null ? void 0 : playerRoot.dire);
  if (teamHeroData) {
    for (const [key, val] of Object.entries(teamHeroData)) {
      const m = /^player(\d+)$/i.exec(key);
      if (!m) continue;
      const pickOrder = Number(m[1]);
      const heroId = heroIdFromGsiPlayerEntry(val);
      if (heroId && heroId > 0 && Number.isFinite(pickOrder)) {
        let steam32;
        if (teamPlayerData) {
          const pData = asRecord(teamPlayerData[key]);
          if (pData == null ? void 0 : pData.accountid) {
            const num2 = parseInt(String(pData.accountid), 10);
            if (Number.isFinite(num2) && num2 > 0) steam32 = num2;
          }
        }
        byPickOrder.set(pickOrder, { heroId, steam32 });
      }
    }
  }
  if (teamPlayerData) {
    for (const [key, val] of Object.entries(teamPlayerData)) {
      const m = /^player(\d+)$/i.exec(key);
      if (!m) continue;
      const pickOrder = Number(m[1]);
      const existing = byPickOrder.get(pickOrder);
      if (existing == null ? void 0 : existing.heroId) continue;
      const heroId = heroIdFromGsiPlayerEntry(val);
      if (heroId && heroId > 0 && Number.isFinite(pickOrder)) {
        const pData = asRecord(val);
        let steam32;
        if (pData == null ? void 0 : pData.accountid) {
          const num2 = parseInt(String(pData.accountid), 10);
          if (Number.isFinite(num2) && num2 > 0) steam32 = num2;
        }
        byPickOrder.set(pickOrder, { heroId, steam32 });
      }
    }
  }
  return byPickOrder;
}
function applyPlayerHeroLocks(slots, side, payload) {
  const byPickOrder = collectGsiPlayerHeroByOrder(payload, side);
  return slots.map((slot) => {
    if (slot.type !== "pick") return slot;
    const heroInfo = byPickOrder.get(slot.order);
    if (!heroInfo || !heroInfo.heroId || heroInfo.heroId <= 0) return slot;
    const media = mediaForHero(
      heroInfo.heroId,
      void 0,
      displayNameForHero(heroInfo.heroId, void 0),
      `${side}-player${slot.order}`
    );
    return {
      ...slot,
      heroId: heroInfo.heroId,
      steam32: heroInfo.steam32,
      heroName: displayNameForHero(heroInfo.heroId, void 0),
      heroPortraitSlug: media.slug,
      heroPortraitUrl: media.staticUrl,
      heroPortraitAnimatedUrl: media.animatedUrl
    };
  });
}
const CM_PICK_ORDER_RADIANT_FIRST = [
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
];
const CM_PICK_ORDER_DIRE_FIRST = [
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
function cmPickSequenceIndex(side, order, draftSide) {
  const seq = draftSide === "dire_first_pick" ? CM_PICK_ORDER_DIRE_FIRST : CM_PICK_ORDER_RADIANT_FIRST;
  const idx = seq.findIndex((p) => p.side === side && p.order === order);
  return idx >= 0 ? idx : order;
}
function filledPickKey(side, slot) {
  if (slot.type !== "pick" || !slot.heroId) return null;
  return `${side}:${slot.order}:${slot.heroId}`;
}
function slotToLastPick(side, slot) {
  return {
    side,
    heroId: slot.heroId,
    heroName: slot.heroName,
    heroPortraitSlug: slot.heroPortraitSlug,
    playerName: slot.playerName
  };
}
function latestPickInCmOrder(entries, draftSide) {
  let best = entries[0];
  let bestIdx = cmPickSequenceIndex(best.side, best.slot.order, draftSide);
  for (const entry of entries.slice(1)) {
    const idx = cmPickSequenceIndex(entry.side, entry.slot.order, draftSide);
    if (idx > bestIdx) {
      best = entry;
      bestIdx = idx;
    }
  }
  return best;
}
function lastPickChanged(a, b) {
  if (!a) return true;
  return a.heroId !== b.heroId || a.side !== b.side;
}
function detectLastPick(radiant, dire, prev) {
  var _a, _b, _c, _d;
  const current = [];
  for (const s of radiant) {
    if (s.type === "pick" && s.heroId) current.push({ side: "radiant", slot: s });
  }
  for (const s of dire) {
    if (s.type === "pick" && s.heroId) current.push({ side: "dire", slot: s });
  }
  if (current.length === 0) return void 0;
  const prevKeys = /* @__PURE__ */ new Set();
  for (const side of ["radiant", "dire"]) {
    const slots = side === "radiant" ? (_a = prev == null ? void 0 : prev.radiant) == null ? void 0 : _a.slots : (_b = prev == null ? void 0 : prev.dire) == null ? void 0 : _b.slots;
    for (const s of slots ?? []) {
      const k = filledPickKey(side, s);
      if (k) prevKeys.add(k);
    }
  }
  const newlyFilled = current.filter(
    ({ side, slot }) => !prevKeys.has(filledPickKey(side, slot))
  );
  const draftSide = prev == null ? void 0 : prev.side;
  if (newlyFilled.length === 0) {
    if (draftRosterComplete(radiant, dire) && prev && !draftRosterComplete(((_c = prev.radiant) == null ? void 0 : _c.slots) ?? [], ((_d = prev.dire) == null ? void 0 : _d.slots) ?? [])) {
      const e = latestPickInCmOrder(current, draftSide);
      const final = slotToLastPick(e.side, e.slot);
      if (lastPickChanged(prev.lastPick, final)) return final;
    }
    return prev == null ? void 0 : prev.lastPick;
  }
  if (newlyFilled.length === 1) {
    const one = newlyFilled[0];
    return slotToLastPick(one.side, one.slot);
  }
  const best = latestPickInCmOrder(newlyFilled, draftSide);
  return slotToLastPick(best.side, best.slot);
}
function teamSideFromMatchSetup(matchSetup, side, roster, fallbackName, prev) {
  var _a, _b;
  if (!matchSetup) {
    return {
      name: fallbackName,
      logoUrl: side === "radiant" ? ((_a = prev == null ? void 0 : prev.radiant) == null ? void 0 : _a.logoUrl) ?? (prev == null ? void 0 : prev.series.logoUrlA) : ((_b = prev == null ? void 0 : prev.dire) == null ? void 0 : _b.logoUrl) ?? (prev == null ? void 0 : prev.series.logoUrlB)
    };
  }
  const key = side === "radiant" ? matchSetup.radiantTeamKey : matchSetup.direTeamKey;
  const team = getTeamByKey(roster, key);
  if (!team) {
    return { name: fallbackName };
  }
  return {
    name: team.teamName,
    logoUrl: teamLogoUrl(team.teamKey)
  };
}
function parseGsiToDraft(payload, prev, roster, matchSetup) {
  var _a, _b;
  const map = asRecord(payload.map);
  const gameState = typeof (map == null ? void 0 : map.game_state) === "string" ? map.game_state : "";
  const inDraft = DRAFT_STATES.has(gameState);
  const draft = asRecord(payload.draft);
  if (!draft && !inDraft) {
    return { inDraft: false, draftPatch: null };
  }
  const gsiRadiantName = typeof (map == null ? void 0 : map.team_name_radiant) === "string" ? map.team_name_radiant : "Radiant";
  const gsiDireName = typeof (map == null ? void 0 : map.team_name_dire) === "string" ? map.team_name_dire : "Dire";
  const radiantSide = teamSideFromMatchSetup(
    matchSetup,
    "radiant",
    roster,
    gsiRadiantName,
    prev
  );
  const direSide = teamSideFromMatchSetup(
    matchSetup,
    "dire",
    roster,
    gsiDireName,
    prev
  );
  const draftRec = draft ?? {};
  const radiantRaw = resolveGsiSideData(draftRec, "radiant");
  const direRaw = resolveGsiSideData(draftRec, "dire");
  let radiantSlots = parseSideSlots(radiantRaw, "radiant");
  let direSlots = parseSideSlots(direRaw, "dire");
  const rosterComplete = draftRosterComplete(radiantSlots, direSlots);
  if (rosterComplete) {
    radiantSlots = applyPlayerHeroLocks(radiantSlots, "radiant", payload);
    direSlots = applyPlayerHeroLocks(direSlots, "dire", payload);
  }
  const activeTeam = draft ? activeTeamFromGsi(draftRec) : null;
  const timer = gsiNumber(
    draftRec.activeteam_time_remaining ?? draftRec.active_team_time_remaining
  );
  const turnAction = draft ? turnActionFromGsi(draftRec) : void 0;
  const reserveSeconds = draft ? reserveSecondsFromGsi(draftRec, activeTeam) : 0;
  const picksBansOrder = [
    ...radiantSlots.map((s) => ({
      team: "A",
      heroId: s.heroId,
      player: s.playerName,
      isBan: s.type === "ban",
      order: s.order,
      heroName: s.heroName,
      heroPortraitUrl: s.heroPortraitUrl
    })),
    ...direSlots.map((s) => ({
      team: "B",
      heroId: s.heroId,
      player: s.playerName,
      isBan: s.type === "ban",
      order: s.order,
      heroName: s.heroName,
      heroPortraitUrl: s.heroPortraitUrl
    }))
  ];
  const lastPick = detectLastPick(radiantSlots, direSlots, prev);
  const phase = inferDraftPhase(
    inDraft,
    gameState,
    radiantSlots,
    direSlots,
    activeTeam
  );
  let startSecondsRemaining = startSecondsFromGsi(map, gameState, draftRec);
  if (phase === "starting" && startSecondsRemaining === void 0) {
    if ((prev == null ? void 0 : prev.phase) === "starting" && prev.startSecondsRemaining !== void 0) {
      startSecondsRemaining = prev.startSecondsRemaining;
    } else if (timer > 0 && !draftHasStarted(radiantSlots, direSlots)) {
      startSecondsRemaining = timer;
    }
  }
  const draftPatch = {
    source: "gsi",
    phase,
    gameState,
    reserveSeconds: Math.max(0, Math.round(reserveSeconds)),
    activeTeam: phase === "starting" ? null : activeTeam,
    turnAction: phase === "starting" ? void 0 : turnAction,
    startSecondsRemaining: phase === "starting" ? Math.max(
      0,
      Math.round(
        startSecondsRemaining ?? ((prev == null ? void 0 : prev.phase) === "starting" ? prev.startSecondsRemaining : void 0) ?? 30
      )
    ) : void 0,
    turnSecondsRemaining: phase === "starting" ? void 0 : Math.max(0, Math.round(timer)),
    series: {
      teamA: radiantSide.name,
      teamB: direSide.name,
      scoreA: (prev == null ? void 0 : prev.series.scoreA) ?? 0,
      scoreB: (prev == null ? void 0 : prev.series.scoreB) ?? 0,
      bestOf: prev == null ? void 0 : prev.series.bestOf,
      gameNumber: prev == null ? void 0 : prev.series.gameNumber,
      logoUrlA: radiantSide.logoUrl ?? (prev == null ? void 0 : prev.series.logoUrlA),
      logoUrlB: direSide.logoUrl ?? (prev == null ? void 0 : prev.series.logoUrlB)
    },
    radiant: {
      name: radiantSide.name,
      logoUrl: radiantSide.logoUrl,
      slots: radiantSlots,
      bonusTime: Math.max(0, Math.round(gsiNumber(draftRec.radiant_bonus_time) || gsiNumber((_a = asRecord(draftRec.team2)) == null ? void 0 : _a.bonus_time) || 0))
    },
    dire: {
      name: direSide.name,
      logoUrl: direSide.logoUrl,
      slots: direSlots,
      bonusTime: Math.max(0, Math.round(gsiNumber(draftRec.dire_bonus_time) || gsiNumber((_b = asRecord(draftRec.team3)) == null ? void 0 : _b.bonus_time) || 0))
    },
    picksBansOrder,
    lastPick
  };
  return { inDraft: inDraft || Boolean(draft), draftPatch };
}
const seenItems = /* @__PURE__ */ new Map();
const HYPE_ITEMS = {
  "item_blink": "CRITICAL MOBILITY: BLINK DAGGER",
  "item_black_king_bar": "MAGIC IMMUNITY: BKB ONLINE",
  "item_rapier": "ALL IN: DIVINE RAPIER",
  "item_radiance": "FARMING ACCELERATOR: RADIANCE",
  "item_manta": "ILLUSIONS READY: MANTA STYLE",
  "item_ultimate_scepter": "AGHANIM'S SCEPTER SECURED",
  "item_bfury": "CLEAVE ACTIVE: BATTLE FURY",
  "item_heart": "MASSIVE SURVIVABILITY: HEART",
  "item_monkey_king_bar": "TRUE STRIKE: MKB ONLINE",
  "item_bloodthorn": "SILENCE READY: BLOODTHORN",
  "item_refresher": "DOUBLE ULTIMATE: REFRESHER",
  "item_sheepstick": "HEX READY: SCYTHE OF VYSE"
};
function getPlayerItems(payload, teamKey, playerKey) {
  var _a, _b;
  try {
    return ((_b = (_a = payload == null ? void 0 : payload.items) == null ? void 0 : _a[teamKey]) == null ? void 0 : _b[playerKey]) || {};
  } catch {
    return {};
  }
}
function getPlayerHero(payload, teamKey, playerKey) {
  var _a, _b, _c;
  try {
    return ((_c = (_b = (_a = payload == null ? void 0 : payload.hero) == null ? void 0 : _a[teamKey]) == null ? void 0 : _b[playerKey]) == null ? void 0 : _c.name) || "unknown_hero";
  } catch {
    return "unknown_hero";
  }
}
function getPlayerName(payload, teamKey, playerKey) {
  var _a, _b, _c;
  try {
    return ((_c = (_b = (_a = payload == null ? void 0 : payload.player) == null ? void 0 : _a[teamKey]) == null ? void 0 : _b[playerKey]) == null ? void 0 : _c.name) || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}
function detectPowerSpikes(payload, io) {
  var _a;
  if (!(payload == null ? void 0 : payload.items)) return;
  const clockTime = ((_a = payload == null ? void 0 : payload.map) == null ? void 0 : _a.clock_time) || 0;
  if (clockTime < 0) return;
  const checkTeam = (teamKey) => {
    var _a2;
    for (let i = 0; i <= 9; i++) {
      const playerKey = `player${i}`;
      const items = getPlayerItems(payload, teamKey, playerKey);
      const playerName = getPlayerName(payload, teamKey, playerKey);
      if (!playerName || playerName === "Unknown Player") continue;
      if (!seenItems.has(playerName)) {
        seenItems.set(playerName, /* @__PURE__ */ new Set());
      }
      const playerSeenItems = seenItems.get(playerName);
      const currentItems = /* @__PURE__ */ new Set();
      for (const slotKey in items) {
        const itemName = (_a2 = items[slotKey]) == null ? void 0 : _a2.name;
        if (itemName && itemName !== "empty") {
          currentItems.add(itemName);
        }
      }
      for (const item of currentItems) {
        if (!playerSeenItems.has(item)) {
          playerSeenItems.add(item);
          if (HYPE_ITEMS[item]) {
            const heroName = getPlayerHero(payload, teamKey, playerKey);
            const hypeText = HYPE_ITEMS[item];
            logger.info({ playerName, heroName, item, hypeText }, "Power Spike Detected!");
            io.of("/overlay").emit("POWER_SPIKE", {
              playerName,
              heroName,
              item,
              hypeText
            });
          }
        }
      }
    }
  };
  checkTeam("team2");
  checkTeam("team3");
}
let lastGsiAt = 0;
let gsiDebounce = null;
function attachGsiRoutes(opts) {
  const { app, state, broadcast, opendota, io } = opts;
  app.post("/gsi", async (req, res) => {
    var _a, _b;
    const token = typeof req.query.token === "string" ? req.query.token : void 0;
    if (env.GSI_TOKEN && token !== env.GSI_TOKEN) {
      res.status(403).json({ error: "invalid gsi token" });
      return;
    }
    const payload = req.body;
    lastGsiAt = Date.now();
    await ensureHeroRegistry(opendota);
    try {
      detectPowerSpikes(payload, io);
    } catch (err) {
      logger.error(err, "Power spike evaluation failed");
    }
    const snap = await state.getState();
    const roster = ((_a = snap.leagueConfig) == null ? void 0 : _a.roster) ?? [];
    const matchSetup = ((_b = snap.leagueConfig) == null ? void 0 : _b.matchSetup) ?? null;
    const parsed = parseGsiToDraft(
      payload,
      snap.draft ?? null,
      roster,
      matchSetup
    );
    const apply = async () => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j;
      const current = await state.getState();
      let patch = {
        production: {
          gsiLastSeen: (/* @__PURE__ */ new Date()).toISOString(),
          gsiConnected: true
        }
      };
      if (parsed.draftPatch) {
        patch = {
          ...patch,
          draft: {
            ...current.draft ?? {
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
            ...parsed.draftPatch
          }
        };
      }
      const next = await state.patchState(patch);
      await broadcast.broadcastFull(next);
      if (((_a2 = current.production) == null ? void 0 : _a2.autoShowStatsOnPick) && ((_b2 = parsed.draftPatch) == null ? void 0 : _b2.lastPick)) {
        try {
          assertLeagueStatsReady(current);
        } catch {
          return;
        }
        const lp = parsed.draftPatch.lastPick;
        const side = lp.side === "dire" || lp.side === "B" ? "dire" : "radiant";
        const teamSlots = side === "radiant" ? ((_c = parsed.draftPatch.radiant) == null ? void 0 : _c.slots) ?? ((_e = (_d = current.draft) == null ? void 0 : _d.radiant) == null ? void 0 : _e.slots) : ((_f = parsed.draftPatch.dire) == null ? void 0 : _f.slots) ?? ((_h = (_g = current.draft) == null ? void 0 : _g.dire) == null ? void 0 : _h.slots);
        const slotOrder = pickSlotOrderForHero(side, lp.heroId, teamSlots);
        const manualSteam32 = slotOrder !== void 0 ? manualPickSteam32((_i = current.leagueConfig) == null ? void 0 : _i.matchSetup, side, slotOrder) : void 0;
        const roster2 = ((_j = current.leagueConfig) == null ? void 0 : _j.roster) ?? [];
        const player = manualSteam32 != null && manualSteam32 > 0 ? findRosterPlayer(roster2, manualSteam32) : void 0;
        const card = player && manualSteam32 ? await buildPlayerHeroCard(
          opendota,
          manualSteam32,
          lp.heroId,
          player.displayName,
          current.tournamentHeroIndex ?? {},
          roster2,
          current.playerHeroIndex
        ) : await buildTournamentHeroCard(
          opendota,
          lp.heroId,
          current.tournamentHeroIndex ?? {}
        );
        const carousel = buildCarouselFromHeroCard(card);
        const until = Date.now() + 12e3;
        const updated = await state.patchState({
          heroStatsCard: card,
          statCarousel: carousel,
          overlayVisibility: {
            herostats: { mode: "timed", until }
          }
        });
        await broadcast.broadcastFull(updated);
      }
    };
    if (gsiDebounce) clearTimeout(gsiDebounce);
    gsiDebounce = setTimeout(() => {
      void apply().catch((err) => logger.error(err, "gsi apply failed"));
    }, 150);
    res.json({ ok: true, inDraft: parsed.inDraft });
  });
  app.get("/gsi/status", (_req, res) => {
    res.json({
      lastSeen: lastGsiAt ? new Date(lastGsiAt).toISOString() : null,
      connected: Date.now() - lastGsiAt < 5e3
    });
  });
}
function attachGsiHeartbeat(state, broadcast, io) {
  var _a, _b;
  (_b = (_a = setInterval(() => {
    void (async () => {
      var _a2;
      if (Date.now() - lastGsiAt > 8e3 && lastGsiAt > 0) {
        const snap = await state.getState();
        if ((_a2 = snap.production) == null ? void 0 : _a2.gsiConnected) {
          const next = await state.patchState({
            production: { gsiConnected: false }
          });
          await broadcast.broadcastFull(next);
        }
      }
    })();
  }, 3e3)).unref) == null ? void 0 : _b.call(_a);
}
function authorizeSocket(kind, handshake) {
  var _a, _b;
  const h = handshake;
  let token = "";
  if (typeof ((_a = h.auth) == null ? void 0 : _a.token) === "string") token = h.auth.token;
  else if (typeof ((_b = h.query) == null ? void 0 : _b.token) === "string") token = h.query.token;
  if (!token) {
    return kind === "overlay" && env.NODE_ENV === "development";
  }
  return token === env.BROADCAST_SECRET;
}
async function createBroadcastServer(deps) {
  const { state, obs, opendota } = deps;
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: env.NODE_ENV === "production" ? parseCorsOrigins() : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const overlayPath = path.join(__dirname, "../../overlay-web/dist");
  const adminPath = path.join(__dirname, "../../admin-web/dist");
  app.use("/overlay", express.static(overlayPath));
  app.use("/admin", express.static(adminPath));
  app.get("/admin/*", (req, res) => {
    res.sendFile(path.join(adminPath, "index.html"));
  });
  app.get("/overlay/*", (req, res) => {
    res.sendFile(path.join(overlayPath, "index.html"));
  });
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: env.NODE_ENV === "production" ? { origin: parseCorsOrigins() } : { origin: true },
    transports: ["websocket", "polling"]
  });
  const broadcastFns = {
    async broadcastFull(envelope) {
      const envelopeToSend = envelope ?? await state.getState();
      io.of(NAMESPACES.OVERLAY).emit(SOCKET_EVENTS.STATE_FULL, envelopeToSend);
      io.of(NAMESPACES.PRODUCER).emit(
        SOCKET_EVENTS.STATE_FULL,
        envelopeToSend
      );
      logger.debug({ seq: envelopeToSend.seq }, "Emitted state snapshot");
    }
  };
  attachRestRoutes({
    app,
    state,
    io,
    broadcast: broadcastFns,
    obs,
    opendota
  });
  attachLeagueAndStatsRoutes({
    app,
    state,
    io,
    broadcast: broadcastFns,
    opendota
  });
  attachGsiRoutes({
    app,
    state,
    broadcast: broadcastFns,
    opendota,
    io
  });
  attachGsiHeartbeat(state, broadcastFns);
  const producerNs = io.of(NAMESPACES.PRODUCER);
  const overlayNs = io.of(NAMESPACES.OVERLAY);
  producerNs.use((socket, next) => {
    const ok = authorizeSocket("producer", socket.handshake);
    next(ok ? void 0 : new Error("unauthorized producer"));
  });
  overlayNs.use((socket, next) => {
    const ok = authorizeSocket("overlay", socket.handshake);
    next(ok ? void 0 : new Error("unauthorized overlay"));
  });
  producerNs.on("connection", (socket) => {
    logger.info({ id: socket.id }, "producer connected");
    void state.getState().then((snap) => {
      socket.emit(SOCKET_EVENTS.STATE_FULL, snap);
    });
  });
  overlayNs.on("connection", (socket) => {
    logger.info({ id: socket.id }, "overlay viewer connected");
    void state.getState().then((snap) => {
      socket.emit(SOCKET_EVENTS.STATE_FULL, snap);
    });
  });
  const heartbeatMs = Number(process.env.STATE_HEARTBEAT_MS ?? 8e3);
  if (!Number.isNaN(heartbeatMs) && heartbeatMs > 500) {
    const t = setInterval(() => {
      void state.getState().then((snap) => {
        io.of(NAMESPACES.OVERLAY).emit(SOCKET_EVENTS.STATE_FULL, snap);
      });
    }, heartbeatMs);
    if (typeof t.unref === "function") t.unref();
  }
  return { app, httpServer, io, broadcast: broadcastFns };
}
async function bootstrapBroadcastServer() {
  const state = await createAppState();
  const obs = new OBSController();
  const opendota = new OpenDotaClient();
  if (env.REDIS_URL) opendota.attachRedis(env.REDIS_URL);
  void ensureHeroRegistry(opendota).catch(
    (err) => logger.warn(err, "hero registry preload deferred")
  );
  const ctx = await createBroadcastServer({ state, obs, opendota });
  await bootstrapLeagueFromEnv({
    state,
    opendota,
    broadcast: ctx.broadcast
  });
  ctx.httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, leagueId: env.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only"
    );
  });
  const shutdown = async () => {
    var _a;
    logger.info("Shutting down");
    await ctx.io.close();
    await obs.disconnect();
    await opendota.shutdown();
    await ((_a = state.shutdown) == null ? void 0 : _a.call(state));
    ctx.httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  return { obs, opendota, state, shutdown };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  void bootstrapBroadcastServer().catch((err) => {
    logger.error(err, "fatal startup");
    process.exit(1);
  });
}
export {
  bootstrapBroadcastServer
};

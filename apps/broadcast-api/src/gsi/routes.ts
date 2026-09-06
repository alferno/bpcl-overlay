import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import type { StateManager } from "@bpc/state-manager";
import { parseGsiToDraft } from "./parser.js";
import { detectPowerSpikes } from "./power-spikes.js";
import { detectFocusedPlayer } from "./live-player-card.js";
import { ensureHeroRegistry } from "../services/hero-registry.js";
import type { BroadcastFns } from "../routes.js";
import { emitBountyStats, emitWisdomStats } from "../routes.js";
import { StateAdapter } from "../production/StateAdapter.js";


import { logger } from "../logger.js";
import { env } from "../env.js";
import { globalEventBus } from "../events/EventBus.js";
import { EventEngine } from "../events/EventEngine.js";
import { GameStateStore } from "./GameStateStore.js";
import { RoshanDetector } from "../events/detectors/RoshanDetector.js";
import { TormentorDetector } from "../events/detectors/TormentorDetector.js";
import { BountyDetector } from "../events/detectors/BountyDetector.js";
import { MatchStateDetector } from "../events/detectors/MatchStateDetector.js";
import { ShrineDetector } from "../events/detectors/ShrineDetector.js";
import { MatchEventManager } from "./match-events.js";
import { enrichRosterMmr, clearMmrCache } from "../services/rank-medals-service.js";

export const globalEventEngine = new EventEngine(globalEventBus);
export const globalGameStateStore = new GameStateStore(globalEventEngine, globalEventBus);
export const globalStateAdapter = new StateAdapter(globalEventBus);

const matchEventManagers = new Map<string, MatchEventManager>();
const multiKillTrackers = new Map<string, Record<number, { lastKillTime: number; count: number; totalKills?: number }>>();

function getMatchEventManager(matchId: string) {
  let manager = matchEventManagers.get(matchId);
  if (!manager) {
    manager = new MatchEventManager(matchId);
    matchEventManagers.set(matchId, manager);
  }
  return manager;
}

globalEventEngine.registerDetector(new RoshanDetector());
globalEventEngine.registerDetector(new TormentorDetector());
globalEventEngine.registerDetector(new BountyDetector());
globalEventEngine.registerDetector(new MatchStateDetector());
globalEventEngine.registerDetector(new ShrineDetector());

globalEventBus.on("*", (event: any) => {
  const matchId = globalGameStateStore.session?.matchId;
  if (matchId) {
    const manager = getMatchEventManager(String(matchId));
    manager.addEvent({
      time: event.gameTime || 0,
      type: event.type,
      description: `Timeline Event: ${event.type}`,
      metadata: event
    });
  }
  // Clear rank medal MMR cache when a new match starts
  if (event.type === "MATCH_INITIALIZED") {
    clearMmrCache();
    // Reset ability accuracy tracking for the new game
    import("../services/ability-accuracy.js").then((mod) => mod.abilityAccuracyTracker.reset());
    import("../services/combatlog-watcher.js").then((mod) => mod.combatLogWatcher.resetForNewMatch());
  }
});


import {
  buildCarouselFromHeroCard,
  buildPlayerHeroCard,
  buildTournamentHeroCard,
} from "../services/stats-builder.js";
import type { OpenDotaClient } from "../opendota-client.js";
import { findRosterPlayer, heroPortraitFieldsForHero, heroDisplayName } from "../services/hero-registry.js";
import {
  manualPickSteam32,
  pickSlotOrderForHero,
} from "@bpc/shared-types";
import type { RosterPlayer, MatchSetup } from "@bpc/shared-types";
import { assertLeagueStatsReady } from "../services/league-stats-guard.js";
import { parsePostGamePayload } from "../services/post-game-mvp.js";
import { getTeamByKey } from "../services/roster-teams.js";
import { rankMvpCandidates } from "../services/mvp-scorer.js";
import { recordMatchEnd, getCurrentSeriesContext } from "../services/series-history.js";
import { reportMatchResult } from "../services/bpcl-api.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── GSI Payload Dump ──────────────────────────────────────────────────────────
// Deep-merges every incoming GSI tick into a running accumulator so that
// all fields (including rare event types) are captured across multiple ticks.
// Call POST /gsi/dump to flush the current snapshot to disk.
let gsiDumpAccumulator: Record<string, any> = {};
let gsiDumpTickCount = 0;
let gsiDumpEventTypes = new Set<string>();

function deepMergeForDump(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv) &&
        tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
      deepMergeForDump(tv, sv);
    } else if (Array.isArray(sv) && Array.isArray(tv)) {
      // For arrays (events), union all unique event_type objects
      for (const item of sv) {
        if (item?.event_type) {
          const exists = tv.some((e: any) => e.event_type === item.event_type);
          if (!exists) tv.push(item);
        } else if (!tv.some((e: any) => JSON.stringify(e) === JSON.stringify(item))) {
          tv.push(item);
        }
      }
    } else {
      target[key] = sv;
    }
  }
  return target;
}

function accumulateGsiPayload(payload: Record<string, any>): void {
  gsiDumpTickCount++;
  deepMergeForDump(gsiDumpAccumulator, payload);
  // Track all seen event types
  if (Array.isArray(payload?.events)) {
    for (const ev of payload.events) {
      if (ev?.event_type) gsiDumpEventTypes.add(ev.event_type);
    }
  }
}

async function flushGsiDump(outputPath?: string): Promise<string> {
  const filePath = outputPath ?? path.resolve("payload_dump.json");
  await mkdir(path.dirname(filePath), { recursive: true });
  const dump = {
    _meta: {
      capturedAt: new Date().toISOString(),
      ticksAccumulated: gsiDumpTickCount,
      eventTypesSeen: Array.from(gsiDumpEventTypes).sort(),
      note: "Deep-merged across multiple GSI ticks. All known fields and event types are represented.",
    },
    ...gsiDumpAccumulator,
  };
  await writeFile(filePath, JSON.stringify(dump, null, 2), "utf8");
  logger.info({ filePath, ticks: gsiDumpTickCount, events: gsiDumpEventTypes.size }, "[GSI Dump] Payload dump saved");
  return filePath;
}

export let globalLatestGsiPayload: any = null;

let lastGsiAt = 0;
let gsiDebounce: ReturnType<typeof setTimeout> | null = null;
let globalLastProcessedEventTime: number = 0;
let globalPrevPayload: Record<string, any> | null = null;

let globalLastAutoReplaySaveAt = 0;
let globalStatMilestonesTriggered = new Set<number>();

// ── Substitute Detection ───────────────────────────────────────────────────
// We only run substitute detection once per unique set of 10 lobby players.
// This avoids spamming the community API on every GSI tick.
let globalLastLobbyKey: string = "";

/**
 * Extract the 10 actual steam32 IDs currently in the GSI lobby.
 * Returns [radiantIds (5), direIds (5)] or null if not available.
 */
function extractGsiLobbyPlayers(payload: Record<string, unknown>): { radiant: (number | null)[]; dire: (number | null)[] } | null {
  const playerRoot = payload.player as Record<string, any> | undefined;
  if (!playerRoot) return null;

  // Log once per match or per unique lobby to confirm structure
  if (!globalLastLobbyKey) {
    logger.info({ playerRoot }, "[GSI DEBUG] Confirming player payload structure");
  }

  const extractTeam = (gsiKey: "team2" | "team3"): (number | null)[] => {
    const teamData = playerRoot[gsiKey] as Record<string, any> | undefined;
    const ids: (number | null)[] = [];
    for (let i = 0; i <= 9; i++) {
      const pData = teamData?.[`player${i}`] as Record<string, any> | undefined;
      if (!pData) continue;
      const accountId = pData.accountid;
      if (accountId == null) continue;
      const n = parseInt(String(accountId), 10);
      if (Number.isFinite(n) && n > 0) {
        ids.push(n);
      }
    }
    // Pad to exactly 5 slots with nulls if needed
    while (ids.length < 5) ids.push(null);
    return ids.slice(0, 5);
  };

  const radiant = extractTeam("team2");
  const dire = extractTeam("team3");

  // Only return if we have at least some players
  const total = [...radiant, ...dire].filter(Boolean).length;
  if (total === 0) return null;

  return { radiant, dire };
}

function findGsiPlayerName(payload: Record<string, unknown>, steam32: number): string | undefined {
  const playerRoot = payload.player as Record<string, any> | undefined;
  if (!playerRoot) return undefined;
  for (const teamKey of ["team2", "team3"]) {
    const teamData = playerRoot[teamKey] as Record<string, any> | undefined;
    if (!teamData) continue;
    for (let i = 0; i <= 9; i++) {
      const pData = teamData[`player${i}`] as Record<string, any> | undefined;
      if (!pData) continue;
      const accountId = pData.accountid;
      if (accountId && parseInt(String(accountId), 10) === steam32) {
        return pData.name;
      }
    }
  }
  return undefined;
}

/**
 * Auto-detect match setup from GSI payload and roster.
 * 1. Checks GSI map team names.
 * 2. Checks lobby players steam32 against roster to infer teams.
 * 3. Extracts series score and format from GSI map node.
 */
async function autoDetectMatchSetup(
  payload: Record<string, unknown>,
  lobbyPlayers: { radiant: (number | null)[]; dire: (number | null)[] },
  currentRoster: RosterPlayer[],
  currentMatchSetup: MatchSetup | null
): Promise<{ setup: MatchSetup | null; newRosterPlayers?: RosterPlayer[] }> {
  const mapData = payload.map as Record<string, any> | undefined;
  
  const toSet = (arr: (number | null)[]) =>
    new Set<number>(arr.filter((x): x is number => x != null && x > 0));

  const lobbyRadiantSet = toSet(lobbyPlayers.radiant);
  const lobbyDireSet = toSet(lobbyPlayers.dire);

  const lobbyKey = `r:${[...lobbyRadiantSet].sort().join(",")}|d:${[...lobbyDireSet].sort().join(",")}`;
  
  // 1. Infer Teams
  let radiantTeamKey = currentMatchSetup?.radiantTeamKey;
  let direTeamKey = currentMatchSetup?.direTeamKey;
  
  // Infer from GSI team names first if they exist and aren't default
  const mapRadiantName = mapData?.team_name_radiant;
  const mapDireName = mapData?.team_name_dire;
  
  const findTeamByKeyOrName = (nameOrKey: string) => {
    if (!nameOrKey) return undefined;
    const normalized = nameOrKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!normalized || normalized === "radiant" || normalized === "dire") return undefined;
    
    // Look in roster
    const team = currentRoster.find(
      (p) => p.teamKey?.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized || 
             p.teamName?.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized
    );
    return team?.teamKey;
  };

  const mapInferredRadiant = findTeamByKeyOrName(mapRadiantName);
  const mapInferredDire = findTeamByKeyOrName(mapDireName);
  
  // Fallback: Infer from majority of players on side
  const inferTeamFromPlayers = (playerSet: Set<number>) => {
    const counts: Record<string, number> = {};
    for (const steam32 of playerSet) {
      const p = currentRoster.find(r => r.steam32 === steam32);
      if (p?.teamKey) {
        counts[p.teamKey] = (counts[p.teamKey] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : undefined;
  };

  const playerInferredRadiant = inferTeamFromPlayers(lobbyRadiantSet);
  const playerInferredDire = inferTeamFromPlayers(lobbyDireSet);

  radiantTeamKey = mapInferredRadiant || playerInferredRadiant || radiantTeamKey || "radiant";
  direTeamKey = mapInferredDire || playerInferredDire || direTeamKey || "dire";

  // Check if teams have changed completely (not just swapped sides)
  const isNewSeries = currentMatchSetup
    ? (currentMatchSetup.radiantTeamKey !== radiantTeamKey || currentMatchSetup.direTeamKey !== direTeamKey) &&
      (currentMatchSetup.radiantTeamKey !== direTeamKey || currentMatchSetup.direTeamKey !== radiantTeamKey)
    : false;

  // 2. Fetch Series Info from GSI
  // GSI match_series_type: 0=bo1, 1=bo3, 2=bo5
  let seriesBestOf = currentMatchSetup?.seriesBestOf ?? 3;
  if (typeof mapData?.match_series_type === "number") {
    if (mapData.match_series_type === 0) seriesBestOf = 1;
    else if (mapData.match_series_type === 1) seriesBestOf = 3;
    else if (mapData.match_series_type === 2) seriesBestOf = 5;
  }
  
  if (isNewSeries) {
    logger.info({ radiantTeamKey, direTeamKey }, "New series detected from GSI lobby players, resetting scores.");
  }
  
  const draftData = payload.draft as Record<string, any> | undefined;
  
  const didSwapSides = currentMatchSetup
    ? currentMatchSetup.radiantTeamKey === direTeamKey && currentMatchSetup.direTeamKey === radiantTeamKey
    : false;

  const prevScoreA = didSwapSides ? (currentMatchSetup?.scoreB ?? 0) : (currentMatchSetup?.scoreA ?? 0);
  const prevScoreB = didSwapSides ? (currentMatchSetup?.scoreA ?? 0) : (currentMatchSetup?.scoreB ?? 0);

  const scoreA = isNewSeries 
    ? 0 
    : currentMatchSetup?.forceManualScore 
      ? prevScoreA
      : (draftData?.radiant?.series_wins ?? mapData?.radiant_series_wins ?? prevScoreA);
      
  const scoreB = isNewSeries 
    ? 0 
    : currentMatchSetup?.forceManualScore 
      ? prevScoreB
      : (draftData?.dire?.series_wins ?? mapData?.dire_series_wins ?? prevScoreB);
  
  const seriesGame = isNewSeries ? 1 : (currentMatchSetup?.seriesGame ?? 1);
  const forceManualScore = isNewSeries ? false : (currentMatchSetup?.forceManualScore ?? false);

  // 3. Smart Swap for Pick Players
  const existingRadiant: (number | null)[] = currentMatchSetup?.pickPlayers?.radiant ?? [null, null, null, null, null];
  const existingDire: (number | null)[] = currentMatchSetup?.pickPlayers?.dire ?? [null, null, null, null, null];

  const smartSwapTeam = (existing: (number | null)[], lobby: (number | null)[]) => {
    const lobbySet = new Set(lobby.filter((id): id is number => id != null && id > 0));
    const existingSet = new Set(existing.filter((id): id is number => id != null && id > 0));
    
    const leftIds = new Set(existing.filter((id): id is number => id != null && id > 0 && !lobbySet.has(id)));
    const joinedIds = lobby.filter((id): id is number => id != null && id > 0 && !existingSet.has(id));

    const result = [...existing];
    for (let i = 0; i < result.length; i++) {
      if (result[i] && leftIds.has(result[i]!)) result[i] = null;
    }
    for (const newId of joinedIds) {
      const emptyIndex = result.indexOf(null);
      if (emptyIndex !== -1) result[emptyIndex] = newId;
    }
    return result;
  };

  const newRadiant = smartSwapTeam(existingRadiant, lobbyPlayers.radiant);
  const newDire = smartSwapTeam(existingDire, lobbyPlayers.dire);

  // Check if anything actually changed
  const pickPlayersMatch = JSON.stringify(newRadiant) === JSON.stringify(existingRadiant) && 
                           JSON.stringify(newDire) === JSON.stringify(existingDire);
  
  const setupMatches = currentMatchSetup?.radiantTeamKey === radiantTeamKey &&
                       currentMatchSetup?.direTeamKey === direTeamKey &&
                       currentMatchSetup?.scoreA === scoreA &&
                       currentMatchSetup?.scoreB === scoreB &&
                       currentMatchSetup?.seriesBestOf === seriesBestOf &&
                       currentMatchSetup?.seriesGame === seriesGame &&
                       currentMatchSetup?.forceManualScore === forceManualScore;

  let newRosterPlayers: RosterPlayer[] | undefined = undefined;

  const lobbySet = new Set<number>([...lobbyRadiantSet, ...lobbyDireSet]);
  const rosterMap = new Map<number, RosterPlayer>(currentRoster.map((p) => [p.steam32, p]));
  const missingSteamIds = [...lobbySet].filter(id => !rosterMap.has(id));

  if (missingSteamIds.length > 0) {
    try {
      const { fetchCommunityPlayers } = await import("../services/bpcleague-sync.js");
      const communityPlayers = await fetchCommunityPlayers();
      const communityMap = new Map(communityPlayers.filter(p => p.steam32).map(p => [p.steam32!, p]));
      
      const added: RosterPlayer[] = [];
      missingSteamIds.forEach(id => {
        const comm = communityMap.get(id);
        if (comm) {
          logger.info({ steam32: id, displayName: comm.displayName }, "[GSI] Sub player resolved from community");
          added.push({
            steam32: id,
            displayName: comm.displayName,
            avatarUrl: comm.avatarUrl,
            bpcId: comm.bpcId,
          });
        } else {
          const gsiName = findGsiPlayerName(payload, id) || "Unknown Player";
          logger.info({ steam32: id, displayName: gsiName }, "[GSI] Unknown sub player in lobby, using GSI name");
          added.push({
            steam32: id,
            displayName: gsiName,
            avatarUrl: "",
          });
        }
      });
      if (added.length > 0) {
        newRosterPlayers = added;
      }
    } catch (err) {
      logger.warn({ err }, "[GSI] Failed to lookup subs in community API");
    }
  }

  if (pickPlayersMatch && setupMatches && lobbyKey === globalLastLobbyKey && currentMatchSetup) {
    return { setup: null, newRosterPlayers }; // no changes to setup, but might have new players
  }

  globalLastLobbyKey = lobbyKey;
   
  return {
    setup: {
      radiantTeamKey,
      direTeamKey,
      seriesBestOf: seriesBestOf as 1 | 3 | 5,
      seriesGame,
      scoreA,
      scoreB,
      forceManualScore,
      stageLabel: currentMatchSetup?.stageLabel,
      pickPlayers: { radiant: newRadiant, dire: newDire },
      playerMemes: currentMatchSetup?.playerMemes,
      previousDrafts: currentMatchSetup?.previousDrafts,
    },
    newRosterPlayers
  };
}

export function getWisdomStats() {
  return globalStateAdapter.getWisdomStats();
}

export function getBountyStats() {
  return globalStateAdapter.getBountyStats();
}
const RESPAWN_SECONDS = 600;

// [LEGACY ROSHAN KILLER DETECTION REMOVED]

// [LEGACY ROSHAN DROPS REMOVED]

// [LEGACY TORMENTOR DETECTION LOGIC REMOVED]

// ── Post-game MVP tracking ──────────────────────────────────────────────────
/** Tracks whether we have already fired the MVP card for the current post-game. */
let postGameMvpFiredForMatchId: number | string = 0;
let lastKnownGameState = "";

import type { OBSController } from "../obs-controller.js";
import type { ReplayManager } from "../services/replay-manager.js";

export function attachGsiRoutes(opts: {
  app: Express;
  state: StateManager;
  broadcast: BroadcastFns;
  opendota: OpenDotaClient;
  io: IOServer;
  obs: OBSController;
  replayManager: ReplayManager;
}): void {
  const { app, state, broadcast, opendota, io, obs, replayManager } = opts;

  // Start combatlog watcher if path is configured
  import("../services/combatlog-watcher.js").then((mod) => {
    mod.combatLogWatcher.start(io);
  }).catch((err) => logger.error({ err }, "Failed to start combatlog watcher"));

  // ── GSI Payload Dump endpoint ──────────────────────────────────────────────
  // GET  /gsi/dump        — returns current accumulated dump as JSON
  // POST /gsi/dump        — flushes current dump to payload_dump.json and resets
  // POST /gsi/dump/reset  — clears accumulator without saving
  app.get("/gsi/dump", (_req, res) => {
    res.json({
      ticks: gsiDumpTickCount,
      eventTypesSeen: Array.from(gsiDumpEventTypes).sort(),
      payload: gsiDumpAccumulator,
    });
  });

  app.post("/gsi/dump", async (_req, res) => {
    try {
      const filePath = await flushGsiDump();
      const ticks = gsiDumpTickCount;
      const events = Array.from(gsiDumpEventTypes).sort();
      // Reset after save
      gsiDumpAccumulator = {};
      gsiDumpTickCount = 0;
      gsiDumpEventTypes = new Set();
      res.json({ ok: true, filePath, ticks, eventTypesSeen: events });
    } catch (err) {
      logger.error(err, "[GSI Dump] Failed to flush");
      res.status(500).json({ error: "Failed to flush dump" });
    }
  });

  app.post("/gsi/dump/reset", (_req, res) => {
    const ticks = gsiDumpTickCount;
    gsiDumpAccumulator = {};
    gsiDumpTickCount = 0;
    gsiDumpEventTypes = new Set();
    res.json({ ok: true, message: `Reset accumulator after ${ticks} ticks` });
  });

  app.post("/gsi", async (req, res) => {
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;
    if (env.GSI_TOKEN && token !== env.GSI_TOKEN) {
      res.status(403).json({ error: "invalid gsi token" });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    globalLatestGsiPayload = payload;
    lastGsiAt = Date.now();

    // Accumulate into the dump regardless of auth/game state
    accumulateGsiPayload(payload as Record<string, any>);
    
    // Sync replay rewind state BEFORE firing any events
    const syncClockTime = (payload?.map as any)?.clock_time || 0;
    globalStateAdapter.syncClock(syncClockTime);

    // Process through the new Event Engine
    globalGameStateStore.processPayload(payload as Record<string, any>);

    await ensureHeroRegistry(opendota);

    // Trigger power spike evaluation
    try {
      void detectPowerSpikes(payload, io, state);
    } catch (err) {
      logger.error(err, "Power spike evaluation failed");
    }

    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    const matchSetup = snap.leagueConfig?.matchSetup ?? null;
    const parsed = parseGsiToDraft(
      payload,
      snap.draft ?? null,
      roster,
      matchSetup,
      getCurrentSeriesContext(),
    );

    const focusedPlayer = detectFocusedPlayer(payload);
    if (focusedPlayer) {
      parsed.focusedPlayerSteam32 = focusedPlayer.steam32;
      parsed.focusedPlayerHeroId = focusedPlayer.heroId;
      parsed.focusedPlayerName = focusedPlayer.playerName;
      (parsed as any).focusedPlayerAbilityCount = focusedPlayer.abilityCount;
    }

    // ── Auto-Detect Match Setup ─────────────────────────────────────────────
    const lobbyPlayers = extractGsiLobbyPlayers(payload);
    if (lobbyPlayers) {
      // Run async but don't block the main apply path
      autoDetectMatchSetup(payload, lobbyPlayers, roster, matchSetup).then(async (result) => {
        if (!result) return;
        const { setup: newSetup, newRosterPlayers } = result;
        if (!newSetup && (!newRosterPlayers || newRosterPlayers.length === 0)) return;
        try {
          const cur = await state.getState();
          const patch: any = {};
          if (newSetup || (newRosterPlayers && newRosterPlayers.length > 0)) {
            patch.leagueConfig = { ...(cur.leagueConfig ?? {}) };
            if (newSetup) {
              patch.leagueConfig.matchSetup = newSetup;
            }
            if (newRosterPlayers && newRosterPlayers.length > 0) {
              patch.leagueConfig.roster = [...(cur.leagueConfig?.roster ?? []), ...newRosterPlayers];
            }
          }
          await state.patchState(patch);
          logger.info({ newSetup, newSubs: newRosterPlayers?.length }, "[GSI] Auto-detected and patched Match Setup/Roster from lobby");
        } catch (err) {
          logger.warn({ err }, "[GSI] Failed to patch auto-detected Match Setup");
        }
      }).catch((err) => {
        logger.warn({ err }, "[GSI] Auto-detect Match Setup error");
      });

      // ── Rank Medal MMR Enrichment ──────────────────────────────────────────
      // Run once per unique lobby: fill missing player MMRs from OpenDota so
      // the rank medals overlay always has something to show.
      const allLobbyIds = [...lobbyPlayers.radiant, ...lobbyPlayers.dire]
        .filter((id): id is number => id != null && id > 0);
      if (allLobbyIds.length > 0) {
        enrichRosterMmr(allLobbyIds, roster, opendota).then(async (enrichedRoster) => {
          // Only patch if MMR data actually changed
          const changed = enrichedRoster.some((p, i) => {
            const orig = roster.find(r => r.steam32 === p.steam32);
            return orig?.mmr !== p.mmr;
          });
          if (!changed) return;
          try {
            const cur = await state.getState();
            // Merge enriched MMRs into the current roster without replacing other fields
            const curRoster = cur.leagueConfig?.roster ?? [];
            const enrichedMap = new Map(enrichedRoster.map(p => [p.steam32, p]));
            const mergedRoster = curRoster.map(p => {
              const enriched = enrichedMap.get(p.steam32);
              if (enriched?.mmr && !p.mmr) return { ...p, mmr: enriched.mmr };
              return p;
            });
            // Also add new players that weren't in roster (subs with MMR from OpenDota)
            for (const [steam32, player] of enrichedMap) {
              if (!curRoster.find(p => p.steam32 === steam32) && player.mmr) {
                mergedRoster.push(player);
              }
            }
            await state.patchState({ leagueConfig: { ...cur.leagueConfig, roster: mergedRoster } });
            logger.info({ enriched: allLobbyIds.length }, "[RankMedals] Patched roster with enriched MMR data");
          } catch (err) {
            logger.warn({ err }, "[RankMedals] Failed to patch enriched MMR roster");
          }
        }).catch(err => {
          logger.warn({ err }, "[RankMedals] MMR enrichment error");
        });
      }
    }

    const apply = async () => {
      const current = await state.getState();

      // Sync active hero unit names to AbilityAccuracyTracker
      const activeHeroes: string[] = [];
      ["team2", "team3"].forEach((teamKey) => {
        const hList = (payload?.hero as any)?.[teamKey];
        if (hList) {
          for (const k of Object.keys(hList)) {
            if (hList[k]?.name) activeHeroes.push(hList[k].name);
          }
        }
      });
      import("../services/ability-accuracy.js").then(mod => {
        mod.abilityAccuracyTracker.setActiveHeroes(activeHeroes);
      });

      let patch: Record<string, unknown> = {
        production: {
          gsiLastSeen: new Date().toISOString(),
          gsiConnected: true,
        },
      };

      if (parsed.draftPatch) {
        patch = {
          ...patch,
          draft: {
            ...(current.draft ?? {
              series: {
                teamA: "Radiant",
                teamB: "Dire",
                scoreA: 0,
                scoreB: 0,
              },
              side: "radiant_first_pick",
              phase: "picks",
              reserveSeconds: 0,
            }),
            ...parsed.draftPatch,
          },
        };
      }


      const radiantScanCooldown = (payload?.map as any)?.radiant_scan_cooldown ?? 0;
      const direScanCooldown = (payload?.map as any)?.dire_scan_cooldown ?? 0;
      const radiantGlyphCooldown = (payload?.map as any)?.radiant_glyph_cooldown ?? 0;
      const direGlyphCooldown = (payload?.map as any)?.dire_glyph_cooldown ?? 0;
      
      const clockTime = (payload?.map as any)?.clock_time || 0;
      const prevClockTime = (globalPrevPayload?.map as any)?.clock_time || 0;

      // ── Combat Log Clock Calibration ────────────────────────────────────────
      // Calibrate the log timestamp → in-game clock_time offset every tick.
      if (clockTime < prevClockTime) {
        globalLastProcessedEventTime = 0;
        globalPrevPayload = null;
      }


      // ── Event Array Processing ────────────────────────────────────────────────
      const matchId = (payload?.map as any)?.matchid || "unknown_match";
      const eventManager = getMatchEventManager(matchId);

      // Multi-kill tracking
      const mkTracker = multiKillTrackers.get(matchId) || {};
      if (!multiKillTrackers.has(matchId)) multiKillTrackers.set(matchId, mkTracker);

      ["team2", "team3"].forEach((teamKey) => {
        const players = (payload?.player as any)?.[teamKey];
        if (!players) return;
        for (const pKey of Object.keys(players)) {
          const p = players[pKey];
          if (p && p.accountid) {
            const steam32 = parseInt(p.accountid.toString(), 10);
            const kills = p.kills || 0;
            const t = mkTracker[steam32] || { lastKillTime: 0, count: 0, totalKills: 0 };
            if (kills > (t.totalKills || 0)) {
              const killDiff = kills - (t.totalKills || 0);
              if (clockTime - t.lastKillTime <= 18) {
                t.count += killDiff;
              } else {
                t.count = killDiff;
              }
              if (t.count > 1) {
                eventManager.addEvent({
                  time: clockTime,
                  type: "multi_kill",
                  description: `Multi-kill ${t.count}`,
                  steam32,
                  metadata: { count: t.count }
                });
              }
              t.lastKillTime = clockTime;
              t.totalKills = kills;
              mkTracker[steam32] = t;
            }
          }
        }
      });

      // Buildings tracking
      const buildings = payload?.buildings as any;
      if (buildings && clockTime > 0) {
        let currentTowersDestroyed = 0;
        let radiantRaxDestroyed = 0;
        let direRaxDestroyed = 0;

        ["radiant", "dire"].forEach(team => {
          const towers = buildings[team]?.towers;
          if (towers) {
            for (const tKey of Object.keys(towers)) {
              const t = towers[tKey];
              if (!t.health || t.health <= 0) currentTowersDestroyed++;
            }
          }
          const rax = buildings[team]?.barracks;
          if (rax) {
            let teamRaxDestroyed = 0;
            for (const rKey of Object.keys(rax)) {
              const r = rax[rKey];
              if (!r.health || r.health <= 0) teamRaxDestroyed++;
            }
            if (team === "radiant") radiantRaxDestroyed = teamRaxDestroyed;
            if (team === "dire") direRaxDestroyed = teamRaxDestroyed;
          }
        });

        // First Tower
        // Only trigger if exactly 1 tower is destroyed and we never triggered it before
        if (currentTowersDestroyed >= 1 && !eventManager.hasEvent("first_tower")) {
          eventManager.addEvent({
            time: clockTime,
            type: "first_tower",
            description: "First tower destroyed",
          });
          if (currentTowersDestroyed === 1) { // Only show UI if we actually caught it falling, not mid-game reconnect
            io.emit("first_tower_destroyed");
          }
        }

        // Mega Creeps
        if (radiantRaxDestroyed === 6 && !eventManager.hasEvent("mega_creeps", e => e.metadata?.team === "radiant")) {
          eventManager.addEvent({ time: clockTime, type: "mega_creeps", description: "Mega creeps claimed against Radiant", metadata: { team: "radiant" } });
          io.emit("mega_creeps_claimed", { team: "radiant" });
        }
        if (direRaxDestroyed === 6 && !eventManager.hasEvent("mega_creeps", e => e.metadata?.team === "dire")) {
          eventManager.addEvent({ time: clockTime, type: "mega_creeps", description: "Mega creeps claimed against Dire", metadata: { team: "dire" } });
          io.emit("mega_creeps_claimed", { team: "dire" });
        }
      }

      let bountyDetectedViaEvents = false;
      if (payload?.events && Array.isArray(payload.events)) {
        for (const ev of payload.events) {
          if (ev.game_time && ev.game_time > globalLastProcessedEventTime) {
            if (ev.event_type === "kill_streak") {
              eventManager.addEvent({
                time: ev.game_time,
                type: "kill_streak",
                description: `Kill streak ${ev.kill_streak}`,
                steam32: ev.player_id,
                metadata: { streak: ev.kill_streak, raw: ev }
              });
            }

            // Auto-Replay Triggers
            // Note: "aegis_stolen" was never a real GSI event type and has
            // been removed. Roshan killer attribution now comes from
            // detectRoshanKillerTeam() (net-worth delta) instead of a
            // "roshan_killed" event, since GSI doesn't reliably populate a
            // killer for Roshan even with the events block enabled.
            if (
              ev.event_type === "first_blood" ||
              (ev.event_type === "kill_streak" && ev.kill_streak >= 3)
            ) {
              const now = Date.now();
              if (now - globalLastAutoReplaySaveAt > 30000) {
                globalLastAutoReplaySaveAt = now;
                logger.info({ event: ev.event_type, game_time: ev.game_time }, "Triggering auto-replay save via GSI event");
                // Delay slightly to let the play finish before saving
                setTimeout(() => {
                  replayManager.triggerSaveReplay(30, obs).catch(e => logger.error(e, "Auto-replay save failed"));
                }, 5000);
              }
            }

            globalLastProcessedEventTime = ev.game_time;
          }
        }

        // [LEGACY BOUNTY DETECTOR REMOVED]
      }

      // [LEGACY WISDOM SHRINE XP FALLBACK REMOVED]

      // [LEGACY WISDOM SHRINE XP FALLBACK REMOVED]

      // [LEGACY TORMENTOR LOOP REMOVED]
      
      globalPrevPayload = payload;



      let finalRadiantScanCooldown = radiantScanCooldown;
      let finalDireScanCooldown = direScanCooldown;
      let finalRadiantGlyphCooldown = radiantGlyphCooldown;
      let finalDireGlyphCooldown = direGlyphCooldown;
      let finalRadiantScanCharges = (payload?.map as any)?.radiant_scan_charges ?? 2;
      let finalDireScanCharges = (payload?.map as any)?.dire_scan_charges ?? 2;
      let finalRoshanState = (payload?.map as any)?.roshan_state;
      let finalRoshanRespawnTimer = (payload?.map as any)?.roshan_state_end_seconds;

      // Draft phase / Pre-horn overrides
      if (clockTime < 0) {
        finalRadiantScanCooldown = 210;
        finalDireScanCooldown = 210;
        finalRadiantGlyphCooldown = 300;
        finalDireGlyphCooldown = 300;
        finalRadiantScanCharges = 0;
        finalDireScanCharges = 0;
        finalRoshanState = "alive";
        finalRoshanRespawnTimer = 0;
      }

      // [LEGACY ROSHAN AND AEGIS EVENT LOGIC REMOVED]

      const engineTormentor = globalStateAdapter.getTormentorState(clockTime);

      patch.minimapState = {
        gameState: (payload?.map as any)?.game_state,
        roshanState: finalRoshanState,
        roshanRespawnTimer: finalRoshanRespawnTimer,
        tormentorRadiant: engineTormentor.tormentorRadiant,
        tormentorRadiantRespawnTimer: engineTormentor.tormentorRadiantRespawnTimer,
        tormentorDire: engineTormentor.tormentorDire,
        tormentorDireRespawnTimer: engineTormentor.tormentorDireRespawnTimer,
        radiantScanActive: finalRadiantScanCooldown === 0,
        radiantScanCooldown: finalRadiantScanCooldown,
        radiantScanCharges: finalRadiantScanCharges,
        direScanActive: finalDireScanCooldown === 0,
        direScanCooldown: finalDireScanCooldown,
        direScanCharges: finalDireScanCharges,
        radiantGlyphActive: finalRadiantGlyphCooldown === 0,
        radiantGlyphCooldown: finalRadiantGlyphCooldown,
        direGlyphActive: finalDireGlyphCooldown === 0,
        direGlyphCooldown: finalDireGlyphCooldown,
      };

      if (focusedPlayer) {
        const steam32 = parsed.focusedPlayerSteam32;
        const heroId = parsed.focusedPlayerHeroId;
        const playerNameFromGsi = parsed.focusedPlayerName;
        const abilityCount = (parsed as any).focusedPlayerAbilityCount;

        if (steam32 && heroId) {
          const cardChanged = current.livePlayerCard?.steam32 !== steam32 || current.livePlayerCard?.heroId !== heroId || current.livePlayerCard?.abilityCount !== abilityCount;
          const visChanged = current.overlayVisibility?.liveplayercard !== "visible";

          // Build enemy hero kills list with resolved portrait fields
          const resolvedEnemyHeroKills = focusedPlayer.enemyHeroKills?.map((e) => {
            const portraitFields = e.heroId > 0
              ? heroPortraitFieldsForHero(e.heroId)
              : {};
            return {
              heroId: e.heroId,
              heroClass: e.heroClass,
              heroPortraitSlug: portraitFields.heroPortraitSlug,
              heroPortraitUrl: portraitFields.heroPortraitUrl,
              kills: e.kills,
            };
          });

          // Always update live stats on every tick (kills/deaths/assists/lh/dn update every second)
          const liveStatsPatch: Record<string, unknown> = {
            liveKills: focusedPlayer.kills ?? 0,
            liveDeaths: focusedPlayer.deaths ?? 0,
            liveAssists: focusedPlayer.assists ?? 0,
            liveLastHits: focusedPlayer.lastHits ?? 0,
            liveDenies: focusedPlayer.denies ?? 0,
            enemyHeroKills: resolvedEnemyHeroKills,
            liveItems: focusedPlayer.items,
            liveNeutralItem: focusedPlayer.neutralItem,
          };

          if (cardChanged || visChanged) {
            const player = findRosterPlayer(roster, steam32);
            // Fallback to GSI name if player is not in active roster
            const displayName = player?.displayName || playerNameFromGsi || "Unknown";
            
            patch = {
              ...patch,
              ...(cardChanged ? {
                livePlayerCard: {
                  steam32,
                  bpcId: player?.bpcId,
                  heroId,
                  playerLabel: displayName,
                  playerAvatarUrl: player?.avatarUrl,
                  fetchedAt: new Date().toISOString(),
                  source: "manual",
                  abilityCount,
                  ...liveStatsPatch,
                }
              } : {
                livePlayerCard: {
                  ...(current.livePlayerCard ?? {}),
                  ...liveStatsPatch,
                }
              }),
              overlayVisibility: {
                ...(patch.overlayVisibility as any || {}),
                liveplayercard: "visible",
                kdaCard: "visible",
              },
            };
          } else {
            // Card identity unchanged — just stream live stats
            patch = {
              ...patch,
              livePlayerCard: {
                ...(current.livePlayerCard ?? {}),
                ...liveStatsPatch,
              },
            };
          }
        }
      } else {
        const liveCardVisible = current.overlayVisibility?.liveplayercard === "visible";
        const kdaCardVisible = current.overlayVisibility?.kdaCard === "visible";
        const hasCard = current.livePlayerCard !== null && current.livePlayerCard !== undefined;
        if (liveCardVisible || kdaCardVisible || hasCard) {
          patch = {
            ...patch,
            livePlayerCard: null,
            overlayVisibility: {
              ...(patch.overlayVisibility as any || {}),
              liveplayercard: "hidden",
              kdaCard: "hidden",
            },
          };
          if (liveCardVisible || kdaCardVisible) {
            logger.info("[GSI Automation] Hero focus lost — hiding LivePlayer + KDA cards");
          }
        }
      }

      const next = await state.patchState(patch);
      await broadcast.broadcastFull(next);

      // ── Post-game MVP auto-selection ────────────────────────────────────
      const currentGameState =
        typeof (payload?.map as any)?.game_state === "string"
          ? (payload.map as any).game_state
          : "";

      const enteredPostGame =
        currentGameState === "DOTA_GAMERULES_STATE_POST_GAME" &&
        lastKnownGameState !== "DOTA_GAMERULES_STATE_POST_GAME";

      // Update known state after comparison
      lastKnownGameState = currentGameState;

      const winTeam = (payload?.map as any)?.win_team;
      const hasWinner = winTeam && winTeam.toLowerCase() !== "none";
      const hasRadiantWinField = typeof (payload?.map as any)?.radiant_win !== "undefined";

      if ((enteredPostGame || currentGameState === "DOTA_GAMERULES_STATE_POST_GAME") && (hasWinner || hasRadiantWinField)) {
        try {
          const postGame = parsePostGamePayload(payload);

          // Track Series History exactly once at the edge
          if (enteredPostGame && postGame.matchId && postGame.isPostGame) {
            const radName = snap.draft?.radiant?.name || "Radiant";
            const direName = snap.draft?.dire?.name || "Dire";
            const actualWinner = winTeam?.toLowerCase() === "radiant" || winTeam?.toLowerCase() === "dire" 
              ? winTeam.toLowerCase() as "radiant" | "dire"
              : (payload?.map as any)?.radiant_win ? "radiant" : "dire";
            
            void recordMatchEnd(postGame.matchId, radName, direName, actualWinner, snap.draft);
          }

          // Fire exactly once per match (key by matchId or by the transition)
          const fireKey = postGame.matchId || "post_game_transition";
          const alreadyFired = postGameMvpFiredForMatchId === fireKey && !enteredPostGame;

          if (postGame.isPostGame && !alreadyFired && postGame.match.players && postGame.match.players.length >= 2) {
            const ranked = rankMvpCandidates(postGame.match);
            // Auto-selection only: Standout Player must come from the winning
            // team. (Manual /api/standout/compute is untouched — producers can
            // still pick anyone there.)
            const winner = ranked.find((c) => c.won);
            if (!winner && ranked.length > 0) {
              logger.warn(
                { matchId: postGame.matchId },
                "[post-game] No winning-team candidate found in ranked MVP list — will retry on next GSI tick",
              );
            }

            if (winner) {
              // Only latch "fired" once we've actually got a valid winner,
              // so an early/incomplete post-game tick (e.g. radiant_win not
              // yet populated) doesn't permanently block the real push.
              postGameMvpFiredForMatchId = fireKey;
              const mvpSnap = await state.getState();
              const mvpRoster = mvpSnap.leagueConfig?.roster ?? [];
              const rosterPlayer = winner.accountId
                ? findRosterPlayer(mvpRoster, winner.accountId)
                : undefined;

              const portraitFields = winner.heroId
                ? heroPortraitFieldsForHero(winner.heroId, winner.heroName)
                : {};

              let winningTeamName: string | undefined;
              let winningTeamLogoUrl: string | undefined;
              const actualWinnerSide = winTeam?.toLowerCase() === "radiant" || winTeam?.toLowerCase() === "dire"
                ? winTeam.toLowerCase() as "radiant" | "dire"
                : (payload?.map as any)?.radiant_win ? "radiant" : "dire";
              
              if (mvpSnap.leagueConfig?.matchSetup) {
                const ms = mvpSnap.leagueConfig.matchSetup;
                const tk = actualWinnerSide === "radiant" ? ms.radiantTeamKey : ms.direTeamKey;
                if (tk) {
                  const teamData = getTeamByKey(mvpRoster, tk);
                  winningTeamName = teamData?.teamName;
                  winningTeamLogoUrl = `/teams/${tk}.png`;
                }
              }

              const winningTeam = ranked
                .filter(p => p.side === winner.side)
                .map(p => {
                  const r = p.accountId ? findRosterPlayer(mvpRoster, p.accountId) : undefined;
                  let pLabel = r?.displayName ?? p.personaname ?? `Player ${p.accountId ?? "?"}`;
                  
                  if (pLabel.startsWith("Player ") && p.accountId) {
                    const tKey = p.side === "radiant" ? "team2" : "team3";
                    const pIdx = p.playerSlot < 128 ? p.playerSlot : p.playerSlot - 128;
                    const gName = (payload?.player as any)?.[tKey]?.[`player${pIdx}`]?.name;
                    if (typeof gName === "string" && gName.length > 0) {
                      pLabel = gName;
                    }
                  }

                  return {
                    steam32: p.accountId,
                    heroId: p.heroId,
                    heroName: p.heroId ? heroDisplayName(p.heroId) : p.heroName,
                    bpcId: r?.bpcId,
                    playerLabel: pLabel,
                  };
                });

              const standoutCard = {
                playerLabel:
                  rosterPlayer?.displayName ??
                  winner.personaname ??
                  `Player ${winner.accountId ?? "?"}`,
                heroId: winner.heroId,
                heroName: winner.heroId ? heroDisplayName(winner.heroId) : winner.heroName,
                steam32: winner.accountId,
                bpcId: rosterPlayer?.bpcId,
                ...portraitFields,
                xpm: winner.raw.xpm,
                gpm: winner.raw.gpm,
                networth: winner.raw.networth,
                kills: winner.raw.kills,
                deaths: winner.raw.deaths,
                assists: winner.raw.assists,
                heroDamage: winner.raw.heroDamage,
                lastHits: winner.raw.lastHits,
                teamKills: winner.raw.teamKills,
                items: winner.raw.items,
                hasScepter: winner.raw.hasScepter,
                hasShard: winner.raw.hasShard,
                winningTeamName,
                winningTeamLogoUrl,
                winningTeam,
              };

              // Resolve player label from GSI player name if roster match failed
              if (standoutCard.playerLabel.startsWith("Player ") && winner.accountId) {
                const teamKey = winner.side === "radiant" ? "team2" : "team3";
                const playerIdx = winner.playerSlot < 128 ? winner.playerSlot : winner.playerSlot - 128;
                const gsiName = (payload?.player as any)?.[teamKey]?.[`player${playerIdx}`]?.name;
                if (typeof gsiName === "string" && gsiName.length > 0) {
                  standoutCard.playerLabel = gsiName;
                }
              }

              setTimeout(async () => {
                const mvpUpdated = await state.patchState({
                  standoutPlayerCard: standoutCard,
                  overlayVisibility: { standoutplayer: "visible" },
                });
                await broadcast.broadcastFull(mvpUpdated);

                logger.info(
                  { mvpScore: winner.mvpScore, heroId: winner.heroId, accountId: winner.accountId },
                  "[post-game] Standout Player auto-selected and pushed to overlay after 5s delay",
                );

                // Report match result to API only on auto standout player show
                const team1Name = mvpSnap.leagueConfig?.matchSetup?.radiantTeamKey 
                  ? getTeamByKey(mvpRoster, mvpSnap.leagueConfig.matchSetup.radiantTeamKey)?.teamName || "Radiant"
                  : "Radiant";
                const team2Name = mvpSnap.leagueConfig?.matchSetup?.direTeamKey
                  ? getTeamByKey(mvpRoster, mvpSnap.leagueConfig.matchSetup.direTeamKey)?.teamName || "Dire"
                  : "Dire";
                
                const seriesCtx = getCurrentSeriesContext();
                const gameNum = seriesCtx?.gameNumber;

                void reportMatchResult(
                  team1Name,
                  team2Name,
                  winningTeamName || (actualWinnerSide === "radiant" ? team1Name : team2Name),
                  gameNum
                );
              }, 5000);
            }
          }
        } catch (err) {
          logger.error(err, "[post-game] MVP auto-selection failed");
        }
      }

      // Reset post-game tracking when a new game starts
      if (
        currentGameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" ||
        currentGameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME"
      ) {
        postGameMvpFiredForMatchId = 0;
      }

      const lastPickChanged =
        parsed.draftPatch?.lastPick &&
        (!current.draft?.lastPick ||
          parsed.draftPatch.lastPick.heroId !== current.draft.lastPick.heroId ||
          parsed.draftPatch.lastPick.side !== current.draft.lastPick.side);

      if (
        current.production?.autoShowStatsOnPick &&
        lastPickChanged
      ) {
        try {
          assertLeagueStatsReady(current);
        } catch {
          return;
        }
        const lp = parsed.draftPatch?.lastPick;
        if (!lp) return;
        const side =
          lp.side === "dire" || lp.side === "B" ? "dire" : "radiant";
        const teamSlots =
          side === "radiant"
            ? parsed.draftPatch?.radiant?.slots ?? current.draft?.radiant?.slots
            : parsed.draftPatch?.dire?.slots ?? current.draft?.dire?.slots;
        const slotOrder = pickSlotOrderForHero(side, lp.heroId, teamSlots);
        const manualSteam32 =
          slotOrder !== undefined
            ? manualPickSteam32(current.leagueConfig?.matchSetup, side, slotOrder)
            : undefined;
        const roster = current.leagueConfig?.roster ?? [];
        const player =
          manualSteam32 != null && manualSteam32 > 0
            ? findRosterPlayer(roster, manualSteam32)
            : undefined;

        const card =
          player && manualSteam32
            ? await buildPlayerHeroCard(
                opendota,
                manualSteam32,
                lp.heroId,
                player.displayName,
                current.lifetimeTournamentHeroIndex ?? {},
                roster,
                current.lifetimePlayerHeroIndex,
              )
            : await buildTournamentHeroCard(
                opendota,
                lp.heroId,
                current.lifetimeTournamentHeroIndex ?? {},
              );
        const carousel = buildCarouselFromHeroCard(card);
        const until = Date.now() + 12000;
        const updated = await state.patchState({
          heroStatsCard: card,
          statCarousel: carousel,
          overlayVisibility: {
            herostats: { mode: "timed", until },
          },
        });
        await broadcast.broadcastFull(updated);
      }
    };

    if (gsiDebounce) clearTimeout(gsiDebounce);
    gsiDebounce = setTimeout(() => {
      void apply().catch((err) => logger.error(err, "gsi apply failed"));
    }, 150);

    const clockTime = (payload?.map as any)?.clock_time ?? 0;
    if (clockTime > 0) {
      // [LEGACY BOUNTY MILESTONE LOOP REMOVED]

      // [LEGACY WISDOM MILESTONE LOOP REMOVED]
      // Top Stats: 24 (1440) -> hero_damage, 42 (2520) -> tower_damage
      const statMilestones = [1440, 2520];
      for (const m of statMilestones) {
        if (clockTime >= m && clockTime < m + 30 && !globalStatMilestonesTriggered.has(m)) {
          globalStatMilestonesTriggered.add(m);
          
          const statType = m === 1440 ? "hero_damage" : "tower_damage";
          const title = m === 1440 ? "Hero Damage" : "Tower Damage";
          
          let highestValue = -1;
          let highestPlayerName = "";
          let highestHeroName = "";

          for (const teamKey of ["team2", "team3"]) {
            const players = (payload?.player as any)?.[teamKey];
            const heroes = (payload?.hero as any)?.[teamKey];
            if (players && heroes) {
              for (const pKey of Object.keys(players)) {
                const p = players[pKey];
                const h = heroes[pKey];
                if (p && h) {
                  const val = p[statType] ?? 0;
                  if (val > highestValue) {
                    highestValue = val;
                    const roster = (await state.getState()).leagueConfig?.roster ?? [];
                    const steam32 = p.accountid ? parseInt(p.accountid.toString(), 10) : undefined;
                    const rosterPlayer = steam32 ? roster.find((rp: any) => rp.steam32 === steam32) : undefined;
                    highestPlayerName = rosterPlayer?.displayName ?? p.name ?? "Unknown";
                    highestHeroName = h.name ?? ""; // e.g. npc_dota_hero_antimage
                    const heroId = h.id ? parseInt(h.id.toString(), 10) : undefined;
                    
                    if (heroId) {
                      const portraitFields = heroPortraitFieldsForHero(heroId, highestHeroName);
                      highestHeroName = heroDisplayName(heroId) || highestHeroName;
                      // Provide portrait directly so frontend doesn't need to guess
                      (highestPlayerName as any) = { 
                        name: highestPlayerName, 
                        portrait: portraitFields.heroPortraitUrl, 
                        heroId 
                      };
                    }
                  }
                }
              }
            }
          }

          if (highestValue >= 0) {
            const payload = {
              title,
              value: highestValue,
              playerName: typeof highestPlayerName === "string" ? highestPlayerName : (highestPlayerName as any).name,
              heroName: highestHeroName,
              heroId: typeof highestPlayerName !== "string" ? (highestPlayerName as any).heroId : undefined,
              portraitUrl: typeof highestPlayerName !== "string" ? (highestPlayerName as any).portrait : undefined
            };
            logger.info(payload, `[stats] Emitting TOP_STAT_ALERT for ${title}`);
            io.of("/overlay").emit("TOP_STAT_ALERT", payload);
          }
        }
      }
    }

    res.json({ ok: true, inDraft: parsed.inDraft });
  });

  app.get("/gsi/status", (_req, res) => {
    res.json({
      lastSeen: lastGsiAt ? new Date(lastGsiAt).toISOString() : null,
      connected: Date.now() - lastGsiAt < 5000,
    });
  });
}

export function attachGsiHeartbeat(
  state: StateManager,
  broadcast: BroadcastFns,
  io: IOServer,
): void {
  void io;
  setInterval(() => {
    void (async () => {
      if (Date.now() - lastGsiAt > 8000 && lastGsiAt > 0) {
        const snap = await state.getState();
        if (snap.production?.gsiConnected) {
          // Mark GSI as disconnected but do NOT force-hide overlays.
          // LivePlayer + KDA cards auto-hide via hero focus logic.
          // Draft/Versus/Game overlays stay visible until the actual game state changes.
          const next = await state.patchState({
            production: { gsiConnected: false },
          });
          await broadcast.broadcastFull(next);
          logger.info("[GSI Heartbeat] GSI offline for 8s: marked disconnected (overlays preserved)");
        }
      }
    })();
  }, 3000).unref?.();
}

// [LEGACY COMBATLOG WISDOM DETECTOR REMOVED]

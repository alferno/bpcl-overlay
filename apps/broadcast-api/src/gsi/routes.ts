import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import type { StateManager } from "@bpc/state-manager";
import { parseGsiToDraft } from "./parser.js";
import { detectPowerSpikes } from "./power-spikes.js";
import { detectFocusedPlayer } from "./live-player-card.js";
import { ensureHeroRegistry } from "../services/hero-registry.js";
import type { BroadcastFns } from "../routes.js";
import { emitBountyStats, emitWisdomStats } from "../routes.js";
import { logger } from "../logger.js";
import { env } from "../env.js";
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
let globalLastTormentorKillClockTime: number | null = null;
let globalVersusTimeout: ReturnType<typeof setTimeout> | null = null;
let globalGameTimeout: ReturnType<typeof setTimeout> | null = null;
let globalLastProcessedEventTime: number = 0;
let globalPrevPayload: Record<string, any> | null = null;
let globalLastMatchId: string | number | null = null;
let globalRadiantScanCharges = 2;
let globalDireScanCharges = 2;
let globalLastRadiantScanCooldown = 0;
let globalLastDireScanCooldown = 0;

// ── Roshan Kill Tracking ───────────────────────────────────────────────────────
let globalRoshanKillCount = 0;
let globalLastRoshanState: string | null = null;
let globalPendingAegisKillInfo: any = null;
let globalPendingAegisSearchUntil = 0;

let globalLastAutoReplaySaveAt = 0;
let globalPreGameTimeout: ReturnType<typeof setTimeout> | null = null;

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

  // 2. Fetch Series Info from GSI
  // GSI match_series_type: 0=bo1, 1=bo3, 2=bo5
  let seriesBestOf = currentMatchSetup?.seriesBestOf ?? 3;
  if (typeof mapData?.match_series_type === "number") {
    if (mapData.match_series_type === 0) seriesBestOf = 1;
    else if (mapData.match_series_type === 1) seriesBestOf = 3;
    else if (mapData.match_series_type === 2) seriesBestOf = 5;
  }
  
  const scoreA = mapData?.radiant_series_wins ?? currentMatchSetup?.scoreA ?? 0;
  const scoreB = mapData?.dire_series_wins ?? currentMatchSetup?.scoreB ?? 0;
  
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
                       currentMatchSetup?.seriesBestOf === seriesBestOf;

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
          logger.info({ steam32: id }, "[GSI] Unknown sub player in lobby");
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
      seriesGame: currentMatchSetup?.seriesGame ?? 1,
      scoreA,
      scoreB,
      stageLabel: currentMatchSetup?.stageLabel,
      pickPlayers: { radiant: newRadiant, dire: newDire },
      playerMemes: currentMatchSetup?.playerMemes,
      previousDrafts: currentMatchSetup?.previousDrafts,
    },
    newRosterPlayers
  };
}

// ── Bounty Rune Tracking ──────────────────────────────────────────────────────
//
// Patch 7.41d: bounty gold is determined at CONSUMPTION TIME (pickup),
// not spawn time. Formula: goldPerHero = 40 + 6 * floor(clockTime / 240)
// Team total = goldPerHero * 5
//
// This means stacked runes all share the same gold value when picked up
// at a given moment — no FIFO pool needed, no spawn tracking needed.
let globalBountyRadiantCount = 0;
let globalBountyRadiantGold = 0;
let globalBountyDireCount = 0;
let globalBountyDireGold = 0;
/**
 * Total bounty pickup events seen so far in the events array.
 * GSI resends the FULL events array every tick, so we track the running
 * total to only process net-new events each tick.
 */
let globalBountyEventsProcessedTotal = 0;
/** Fallback: previous rune_pickups per player key to detect delta. */
const globalPrevRunePickups: Map<string, number> = new Map();

/** Gold granted to the team for a bounty rune consumed at `clockTime`.
 *
 * Formula (from game data, patch 7.41d):
 *   goldPerHero = 40 + 6 × floor(In-Game-Time-in-minutes / 5)
 *               = 40 + 6 × floor(clockTime_seconds / 300)
 *
 * Note: Spawn interval = 240s (4 min), Gold increase interval = 300s (5 min) — different!
 *
 * Examples at consumption time:
 *   0:00 →  40g/hero → 200g team
 *   5:00 →  46g/hero → 230g team
 *  10:00 →  52g/hero → 260g team
 *  15:00 →  58g/hero → 290g team
 */
function bountyGoldAtConsumption(clockTime: number): number {
  const goldPerHero = 40 + 6 * Math.floor(Math.max(0, clockTime) / 300);
  return goldPerHero * 5;
}

// ── Wisdom Rune Tracking ──────────────────────────────────────────────────────
let globalWisdomRadiantCount = 0;
let globalWisdomRadiantXp = 0;
let globalWisdomDireCount = 0;
let globalWisdomDireXp = 0;
const globalPrevXp: Map<string, number> = new Map();

export interface WisdomHistoryEntry {
  time: number;
  team: "radiant" | "dire";
  xp: number;
}
let globalBountyMilestonesTriggered = new Set<number>();
export const globalWisdomHistory: WisdomHistoryEntry[] = [];
let globalWisdomMilestonesTriggered = new Set<number>();
let globalStatMilestonesTriggered = new Set<number>();
let globalLastWisdomCountForEmit = 0;

export function getWisdomStats() {
  return {
    radiant: { count: globalWisdomRadiantCount, xp: globalWisdomRadiantXp },
    dire:    { count: globalWisdomDireCount,    xp: globalWisdomDireXp },
    history: globalWisdomHistory,
  };
}

export interface BountyHistoryEntry {
  time: number;
  team: "radiant" | "dire";
  count: number;
  gold: number;
}
export const globalBountyHistory: BountyHistoryEntry[] = [];

export function getBountyStats() {
  return {
    radiant: { count: globalBountyRadiantCount, gold: globalBountyRadiantGold },
    dire:    { count: globalBountyDireCount,    gold: globalBountyDireGold },
    history: globalBountyHistory,
  };
}

const SHARD_VALUE = 1400;
const TOLERANCE = 100;
const RESPAWN_SECONDS = 600;

// ── Roshan Killer Team Detection (net-worth delta) ──────────────────────────
// GSI has no reliable killer attribution for Roshan (Valve confirms this is a
// known gap: ValveSoftware/Dota2-Gameplay#33015, "who killed roshan?"). We
// infer the killer the same way we infer Tormentor kills: compare each
// team's aggregate net worth against the tick *before* Roshan's state
// flipped from "alive". If neither team clearly spiked, return null rather
// than guess.
const ROSHAN_KILL_MIN_NW_GAP = 300;

function sumTeamNetWorth(payload: any, teamKey: "team2" | "team3"): number | null {
  const teamPlayers = payload?.player?.[teamKey];
  if (!teamPlayers) return null;

  let total = 0;
  let sawAny = false;
  for (let i = 0; i < 5; i++) {
    const p = teamPlayers[`player${i}`];
    if (p && typeof p.net_worth === "number") {
      total += p.net_worth;
      sawAny = true;
    }
  }
  return sawAny ? total : null;
}

function detectRoshanKillerTeam(
  prevPayload: any,
  currPayload: any,
): "radiant" | "dire" | null {
  const prevRadiant = sumTeamNetWorth(prevPayload, "team2");
  const currRadiant = sumTeamNetWorth(currPayload, "team2");
  const prevDire = sumTeamNetWorth(prevPayload, "team3");
  const currDire = sumTeamNetWorth(currPayload, "team3");

  if (prevRadiant === null || currRadiant === null || prevDire === null || currDire === null) {
    return null;
  }

  const gap = (currRadiant - prevRadiant) - (currDire - prevDire);
  if (Math.abs(gap) < ROSHAN_KILL_MIN_NW_GAP) {
    return null; // too close to call — don't guess
  }

  return gap > 0 ? "radiant" : "dire";
}

// ── Roshan Drops by Kill Number ──────────────────────────────────────────────
// GSI's payload.roshan.drops is unreliable / undocumented. Instead we compute
// drops deterministically from the kill number, which matches Dota 2 exactly:
//   Kill 1 : Aegis
//   Kill 2 : Aegis + Aghanim's Banner
//   Kill 3 : Aegis + Aghanim's Banner + Cheese
//   Kill 4+: Aegis + Cheese + Aghanim's Banner + Refresher Shard
function getRoshanDropsByKillNumber(killNumber: number): string[] {
  if (killNumber <= 1)  return ["item_aegis"];
  if (killNumber === 2) return ["item_aegis", "item_banner"];
  if (killNumber === 3) return ["item_aegis", "item_banner", "item_cheese"];
  // Kill 4 and beyond
  return ["item_aegis", "item_cheese", "item_banner", "item_refresher_shard"];
}

function getLowestNetWorthCandidates(payload: any, teamKey: "team2" | "team3") {
  const teamPlayers = payload?.player?.[teamKey];
  const teamHeroes = payload?.hero?.[teamKey];
  if (!teamPlayers || !teamHeroes) return [];

  const candidates: { id: string; net_worth: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const pKey = `player${i}`;
    const p = teamPlayers[pKey];
    const h = teamHeroes[pKey];
    if (p && h && h.aghanims_shard !== true && h.aghanims_shard !== 1) {
      candidates.push({
        id: pKey,
        net_worth: p.net_worth || 0,
      });
    }
  }

  return candidates
    .sort((a, b) => a.net_worth - b.net_worth)
    .slice(0, 2)
    .map((c) => c.id);
}

function detectTormentorKillViaShard(
  prevPayload: any,
  currPayload: any,
  candidateIds: string[],
  teamKey: "team2" | "team3"
): { killed: boolean; recipientId?: string; nwDelta?: number; goldDelta?: number } {
  let match: { id: string; nwDelta: number; goldDelta: number; net_worth: number } | null = null;
  let multipleMatches = false;

  for (const id of candidateIds) {
    const prevPlayer = prevPayload?.player?.[teamKey]?.[id];
    const currPlayer = currPayload?.player?.[teamKey]?.[id];
    const prevHero = prevPayload?.hero?.[teamKey]?.[id];
    const currHero = currPayload?.hero?.[teamKey]?.[id];

    if (!prevPlayer || !currPlayer || !prevHero || !currHero) continue;

    const nwDelta = (currPlayer.net_worth || 0) - (prevPlayer.net_worth || 0);
    const goldDelta =
      ((currPlayer.gold_reliable || 0) + (currPlayer.gold_unreliable || 0)) -
      ((prevPlayer.gold_reliable || 0) + (prevPlayer.gold_unreliable || 0));

    const currHasShard = currHero.aghanims_shard === true || currHero.aghanims_shard === 1;
    const prevHasShard = prevHero.aghanims_shard === true || prevHero.aghanims_shard === 1;

    // We blend both logic approaches here to be completely foolproof:
    // 1. Shard flag transitions to true AND they didn't buy it (nwDelta > 800).
    // 2. OR fallback to just a massive net-worth jump in the expected range (1300-1800)
    //    even if the shard flag check somehow fails.
    if ((!prevHasShard && currHasShard && nwDelta > 800) || (nwDelta >= 1300 && nwDelta <= 1800)) {
      const currentNetWorth = currPlayer.net_worth || 0;
      if (!match) {
        match = { id, nwDelta, goldDelta, net_worth: currentNetWorth };
      } else {
        multipleMatches = true;
        if (currentNetWorth < match.net_worth) {
          match = { id, nwDelta, goldDelta, net_worth: currentNetWorth };
        }
      }
    }
  }

  if (match) {
    if (multipleMatches) {
      logger.warn(
        { teamKey, matches: candidateIds, selectedId: match.id },
        "Multiple candidates showed Tormentor kill delta in the same tick. Selected the one with lower net worth."
      );
    }
    return { killed: true, recipientId: `${teamKey}-${match.id}`, nwDelta: match.nwDelta, goldDelta: match.goldDelta };
  }

  return { killed: false };
}

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
    }

    const apply = async () => {
      const current = await state.getState();

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

      // ── Overlay Orchestration Automation ─────────────────────────────────────
      const prevPhase = current.draft?.phase;
      const newPhase = parsed.draftPatch?.phase ?? prevPhase;
      const prevGameState = current.draft?.gameState;
      const newGameState = parsed.draftPatch?.gameState ?? prevGameState;
      const overlayVisibilityPatch: Record<string, string> = {};

      // ── Draft / Strategy Time Guard: force-hide Standout Player ─────────────
      // Whenever GSI reports we're in hero selection (draft) or strategy time,
      // the Standout Player card should never be on screen — whether it got
      // there via the post-game auto-selector or a manual producer push.
      const isDraftOrStrategyTime =
        newGameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" ||
        newGameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME";
      if (isDraftOrStrategyTime && current.overlayVisibility?.standoutplayer === "visible") {
        overlayVisibilityPatch.standoutplayer = "hidden";
        logger.info(
          { newGameState },
          "[GSI Automation] Draft/Strategy time active, force-hiding Standout Player",
        );
      }

      const clearAutomationTimers = (reason: string) => {
        let cleared = false;
        if (globalVersusTimeout) {
          clearTimeout(globalVersusTimeout);
          globalVersusTimeout = null;
          cleared = true;
        }
        if (globalGameTimeout) {
          clearTimeout(globalGameTimeout);
          globalGameTimeout = null;
          cleared = true;
        }
        if (cleared) {
          logger.info(`[GSI Automation] ${reason}, cancelled pending transition timers`);
        }
      };

      // Transition 0: None ➔ Draft (when draft starts)
      if (newGameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" && prevGameState !== "DOTA_GAMERULES_STATE_HERO_SELECTION") {
        clearAutomationTimers("Draft started");
        overlayVisibilityPatch.draft = "visible";
        overlayVisibilityPatch.versus = "hidden";
        overlayVisibilityPatch.game = "hidden";
        logger.info("[GSI Automation] Draft started, switching to Draft overlay");
      }

      // Clear timers if we go back to draft starting
      if (newPhase !== "done") {
        clearAutomationTimers("Draft resumed/state bounced");
      }

      // Transition 1: Draft ➔ Versus (Delay 5s) and Versus ➔ Game (Delay 80s)
      if (prevPhase !== "done" && newPhase === "done" && parsed.inDraft) {
        clearAutomationTimers("Draft finished");
        logger.info("[GSI Automation] Draft done, scheduling Versus in 5s and Game in 85s");
        
        // 5s to show Versus
        globalVersusTimeout = setTimeout(async () => {
          globalVersusTimeout = null;
          try {
            const snap = await state.getState();
            await state.patchState({
              overlayVisibility: {
                ...(snap.overlayVisibility ?? {}),
                draft: "hidden",
                versus: "visible",
              }
            });
            broadcast.broadcastFull(await state.getState());
          } catch (e) {
            logger.error({ err: e }, "Failed to switch to Versus");
          }
        }, 5000);

        // 85s to show Game (5s wait + 40s flip + 40s hold = 85s total from draft end)
        globalGameTimeout = setTimeout(async () => {
          globalGameTimeout = null;
          try {
            const snap = await state.getState();
            await state.patchState({
              overlayVisibility: {
                ...(snap.overlayVisibility ?? {}),
                versus: "hidden",
                game: "visible",
              }
            });
            broadcast.broadcastFull(await state.getState());
          } catch (e) {
            logger.error({ err: e }, "Failed to switch to Game");
          }
        }, 85000);
      }

      // Transition 2 (Fallback): If we enter PreGame and are still in Draft/Versus, immediately go to Game
      const isEdgePreGame = prevGameState !== "DOTA_GAMERULES_STATE_PRE_GAME" && newGameState === "DOTA_GAMERULES_STATE_PRE_GAME";
      if (
        isEdgePreGame &&
        (current.overlayVisibility?.draft === "visible" || current.overlayVisibility?.versus === "visible")
      ) {
        clearAutomationTimers("Pre-game edge triggered");
        overlayVisibilityPatch.draft = "hidden";
        overlayVisibilityPatch.versus = "hidden";
        overlayVisibilityPatch.game = "visible";
        logger.info("[GSI Automation] Pre-game started, forcing switch to Game overlay");
      }

      // Transition 3: Game ➔ Post-Game or Disconnect
      if (
        newGameState === "DOTA_GAMERULES_STATE_POST_GAME" ||
        newGameState === "DOTA_GAMERULES_STATE_DISCONNECT"
      ) {
        if (
          current.overlayVisibility?.game === "visible" ||
          current.overlayVisibility?.draft === "visible" ||
          current.overlayVisibility?.versus === "visible"
        ) {
          clearAutomationTimers("Game ended/disconnected");
          overlayVisibilityPatch.draft = "hidden";
          overlayVisibilityPatch.versus = "hidden";
          overlayVisibilityPatch.game = "hidden";
          logger.info("[GSI Automation] Game ended/disconnected, hiding all overlays");
        }
      }

      if (Object.keys(overlayVisibilityPatch).length > 0) {
        patch.overlayVisibility = {
          ...(current.overlayVisibility ?? {}),
          ...overlayVisibilityPatch,
        };
      }

      const radiantScanCooldown = (payload?.map as any)?.radiant_scan_cooldown ?? 0;
      const direScanCooldown = (payload?.map as any)?.dire_scan_cooldown ?? 0;
      const radiantGlyphCooldown = (payload?.map as any)?.radiant_glyph_cooldown ?? 0;
      const direGlyphCooldown = (payload?.map as any)?.dire_glyph_cooldown ?? 0;
      
      const clockTime = (payload?.map as any)?.clock_time || 0;
      const gameTime = (payload?.map as any)?.game_time || 0;

      // Snapshot of the previous tick, captured before globalPrevPayload gets
      // overwritten with the current tick further down. Roshan Kill Detection
      // below needs the *pre-death* tick to compute net-worth deltas — using
      // globalPrevPayload directly there would just see the current tick.
      const roshanPrevPayload = globalPrevPayload;

      // Handle new games or large rewinds
      const currentMatchId = (payload?.map as any)?.matchid;
      const prevClockTime = (globalPrevPayload?.map as any)?.clock_time || 0;
      
      if (currentMatchId !== undefined && globalLastMatchId !== currentMatchId) {
        globalLastMatchId = currentMatchId;
        globalLastTormentorKillClockTime = null;
        globalLastProcessedEventTime = 0;
        globalPrevPayload = null;
        globalRadiantScanCharges = 2;
        globalDireScanCharges = 2;
        globalLastRadiantScanCooldown = 0;
        globalLastDireScanCooldown = 0;
        globalRoshanKillCount = 0;
        globalLastRoshanState = null;
        // Reset bounty tracking for new match
        globalBountyRadiantCount = 0;
        globalBountyRadiantGold = 0;
        globalBountyDireCount = 0;
        globalBountyDireGold = 0;
        globalBountyEventsProcessedTotal = 0;
        globalBountyHistory.length = 0;
        globalPrevRunePickups.clear();
        globalBountyMilestonesTriggered.clear();

        // Reset wisdom tracking
        globalWisdomRadiantCount = 0;
        globalWisdomRadiantXp = 0;
        globalWisdomDireCount = 0;
        globalWisdomDireXp = 0;
        globalWisdomHistory.length = 0;
        globalPrevXp.clear();
        globalWisdomMilestonesTriggered.clear();
        globalStatMilestonesTriggered.clear();
      } else if (clockTime < prevClockTime || clockTime < (globalLastTormentorKillClockTime || 0)) {
        globalLastTormentorKillClockTime = null;
        globalLastProcessedEventTime = 0;
        globalPrevPayload = null;
        globalRadiantScanCharges = 2;
        globalDireScanCharges = 2;
        globalLastRadiantScanCooldown = 0;
        globalLastDireScanCooldown = 0;
        globalPendingAegisSearchUntil = 0;
        globalPendingAegisKillInfo = null;
      }


      // ── Event Array Processing ────────────────────────────────────────────────
      let bountyDetectedViaEvents = false;
      if (payload?.events && Array.isArray(payload.events)) {
        for (const ev of payload.events) {
          if (ev.game_time && ev.game_time > globalLastProcessedEventTime) {
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

        // ── Bounty Rune pickup via events array (primary detection) ────────────
        // Patch 7.41d: gold is at consumption time = current clockTime.
        // Every rune in a stack picked at the same moment has the SAME value.
        // GSI resends the full events array each tick, so we track the running
        // total to find only net-new events.
        const allBountyEvents = (payload.events as any[]).filter(
          (ev) => ev.event_type === "bounty_rune_pickup" && typeof ev.game_time === "number",
        );
        const newBountyCount = allBountyEvents.length - globalBountyEventsProcessedTotal;

        if (newBountyCount > 0) {
          bountyDetectedViaEvents = true;
          const newEvents = allBountyEvents.slice(globalBountyEventsProcessedTotal);
          globalBountyEventsProcessedTotal = allBountyEvents.length;

          // Gold is the same for every rune picked right now (consumption-time)
          const goldPerRune = bountyGoldAtConsumption(clockTime);
          const radiantPickups = newEvents.filter((ev) => ev.team === 2).length;
          const direPickups    = newEvents.filter((ev) => ev.team === 3).length;

          if (radiantPickups > 0) {
            globalBountyRadiantCount += radiantPickups;
            globalBountyRadiantGold  += goldPerRune * radiantPickups;
            globalBountyHistory.push({ time: clockTime, team: "radiant", count: radiantPickups, gold: goldPerRune * radiantPickups });
            logger.info(
              { radiantPickups, goldPerRune, totalGold: goldPerRune * radiantPickups },
              "[bounty] Radiant bounty pickups (events array, 7.41d consumption-time)",
            );
          }
          if (direPickups > 0) {
            globalBountyDireCount += direPickups;
            globalBountyDireGold  += goldPerRune * direPickups;
            globalBountyHistory.push({ time: clockTime, team: "dire", count: direPickups, gold: goldPerRune * direPickups });
            logger.info(
              { direPickups, goldPerRune, totalGold: goldPerRune * direPickups },
              "[bounty] Dire bounty pickups (events array, 7.41d consumption-time)",
            );
          }
        }
      }

      // ── Bounty Rune Fallback: runes_activated delta ───────────────────────────
      // Used when bounty_rune_pickup events are not present in the events array.
      if (!bountyDetectedViaEvents && clockTime > 0) {
        const goldPerRune = bountyGoldAtConsumption(clockTime);
        for (const [teamKey, side] of [["team2", "radiant"], ["team3", "dire"]] as const) {
          const teamPlayers = (payload?.player as any)?.[teamKey];
          if (!teamPlayers) continue;
          for (let i = 0; i < 5; i++) {
            const pKey = side === "radiant" ? `player${i}` : `player${i + 5}`;
            const player = teamPlayers[pKey];
            if (!player) continue;
            
            // Check bounty_runes_activated directly from the payload
            const currentPickups = Number(player.bounty_runes_activated ?? 0);
            const cacheKey = `bounty-${teamKey}-${pKey}`;
            const prevPickups = globalPrevRunePickups.get(cacheKey) ?? currentPickups;
            
            if (currentPickups > prevPickups) {
              const delta = currentPickups - prevPickups;
              if (side === "radiant") {
                globalBountyRadiantCount += delta;
                globalBountyRadiantGold  += goldPerRune * delta;
                globalBountyHistory.push({ time: clockTime, team: "radiant", count: delta, gold: goldPerRune * delta });
              } else {
                globalBountyDireCount += delta;
                globalBountyDireGold  += goldPerRune * delta;
                globalBountyHistory.push({ time: clockTime, team: "dire", count: delta, gold: goldPerRune * delta });
              }
              logger.info(
                { team: side, delta, goldPerRune, cacheKey, currentPickups },
                "[bounty] Bounty Rune activated (via bounty_runes_activated fallback)",
              );
            }
            globalPrevRunePickups.set(cacheKey, currentPickups);
          }
        }
      }

      // ── Wisdom Rune Fallback: XP jump delta ──────────────────────────────
      // Patch 7.41 renamed this to the Wisdom Shrine and changed the curve
      // from a flat 280/interval to 200 base + 300 per subsequent shrine
      // (200, 500, 800, 1100, ...). Using the old 280*n formula makes every
      // real spike fall outside the tolerance band below, so it never counts.
      if (clockTime >= 420) {
        const currentInterval = Math.floor(clockTime / 420);
        const expectedXpPerHero = 200 + 300 * (currentInterval - 1);
        const expectedTeamXp = expectedXpPerHero * 2;
        
        for (const [teamKey, side] of [["team2", "radiant"], ["team3", "dire"]] as const) {
          const teamPlayers = (payload?.player as any)?.[teamKey];
          const teamHeroes = (payload?.hero as any)?.[teamKey];
          if (!teamPlayers || !teamHeroes) continue;
          
          const heroes = [];
          for (let i = 0; i < 5; i++) {
            const pKey = side === "radiant" ? `player${i}` : `player${i + 5}`;
            const player = teamPlayers[pKey];
            const hero = teamHeroes[pKey];
            if (!player || !hero) continue;
            
            // In GSI, xp and level are fields under the 'hero' object, not 'player'
            const currentXp = Number(hero.xp ?? hero.experience ?? 0);
            const level = Number(hero.level ?? 1);
            const cacheKey = `${teamKey}-${pKey}`;
            const prevXp = globalPrevXp.get(cacheKey) ?? currentXp;
            
            heroes.push({ pKey, currentXp, prevXp, level, cacheKey });
          }
          
          // Sort by previous XP to find the two lowest XP players who are not max level
          const eligibleHeroes = heroes.filter(h => h.level < 30).sort((a, b) => a.prevXp - b.prevXp);
          const lowestTwo = eligibleHeroes.slice(0, 2);
          
          let spikeDetected = false;
          for (const hero of lowestTwo) {
            if (hero.currentXp > hero.prevXp) {
              const delta = hero.currentXp - hero.prevXp;
              // 0.85 tolerance because in rare edge cases XP might be slightly misreported or split across ticks
              if (delta >= expectedXpPerHero * 0.85) {
                spikeDetected = true;
                break;
              }
            }
          }
          
          if (spikeDetected) {
            const runesPicked = 1;
            const xpGained = expectedTeamXp;
            if (side === "radiant") {
              globalWisdomRadiantCount += runesPicked;
              globalWisdomRadiantXp += xpGained;
              globalWisdomHistory.push({ time: clockTime, team: "radiant", xp: xpGained });
            } else {
              globalWisdomDireCount += runesPicked;
              globalWisdomDireXp += xpGained;
              globalWisdomHistory.push({ time: clockTime, team: "dire", xp: xpGained });
            }
            logger.info(
              { team: side, runesPicked, expectedTeamXp },
              "[wisdom] Wisdom Shrine pickup detected via lowest XP spike"
            );
          }
          
          // Update global cache for ALL heroes
          for (const hero of heroes) {
            globalPrevXp.set(hero.cacheKey, hero.currentXp);
          }
        }
      }

      if (clockTime >= 1200) {
        const timeSinceKill = globalLastTormentorKillClockTime !== null ? clockTime - globalLastTormentorKillClockTime : Infinity;
        if (timeSinceKill >= RESPAWN_SECONDS) {
          if (globalPrevPayload && payload) {
            const clockGap = clockTime - prevClockTime;
            
            // Only run detection if the heartbeat gap is reasonable (e.g. <= 15 seconds)
            if (clockGap >= 0 && clockGap <= 15) {
              let killed = false;
              for (const teamKey of ["team2", "team3"] as const) {
                if (killed) break;
                // Use globalPrevPayload for candidates so we catch the transition before the flag sets
                const candidateIds = getLowestNetWorthCandidates(globalPrevPayload, teamKey);
                const result = detectTormentorKillViaShard(globalPrevPayload, payload, candidateIds, teamKey);
                if (result.killed) {
                  killed = true;
                  globalLastTormentorKillClockTime = clockTime;
                  logger.info(
                    { recipientId: result.recipientId, nwDelta: result.nwDelta, goldDelta: result.goldDelta },
                    "Detected Tormentor kill via net-worth delta"
                  );
                }
              }
            }
          }
        }
      }
      
      globalPrevPayload = payload;

      let tormRadState = "dead";
      let tormRadTimer = 0;
      let tormDireState = "dead";
      let tormDireTimer = 0;

      if (clockTime >= 1200) {
        const intervals = Math.floor((clockTime - 1200) / 300);
        const isRadiant = intervals % 2 === 0;

        let isAlive = true;
        let respawnTimer = 0;

        if (globalLastTormentorKillClockTime !== null) {
          const timeSinceKill = clockTime - globalLastTormentorKillClockTime;
          if (timeSinceKill >= 0 && timeSinceKill < 600) {
            isAlive = false;
            respawnTimer = 600 - timeSinceKill;
          }
        }

        if (isRadiant) {
          tormRadState = isAlive ? "alive" : "dead";
          tormRadTimer = respawnTimer;
        } else {
          tormDireState = isAlive ? "alive" : "dead";
          tormDireTimer = respawnTimer;
        }
      } else {
        tormRadState = "dead";
        tormRadTimer = Math.max(0, 1200 - clockTime);
        tormDireState = "dead";
        tormDireTimer = Math.max(0, 1200 - clockTime);
      }

      // Track Scan Charges
      if (radiantScanCooldown === 0) {
        globalRadiantScanCharges = 2;
      } else if (radiantScanCooldown > globalLastRadiantScanCooldown + 5) {
        if (globalRadiantScanCharges === 0) {
          globalRadiantScanCharges = 1;
        } else {
          globalRadiantScanCharges -= 1;
        }
      }
      globalLastRadiantScanCooldown = radiantScanCooldown;

      if (direScanCooldown === 0) {
        globalDireScanCharges = 2;
      } else if (direScanCooldown > globalLastDireScanCooldown + 5) {
        if (globalDireScanCharges === 0) {
          globalDireScanCharges = 1;
        } else {
          globalDireScanCharges -= 1;
        }
      }
      globalLastDireScanCooldown = direScanCooldown;

      let finalRadiantScanCooldown = radiantScanCooldown;
      let finalDireScanCooldown = direScanCooldown;
      let finalRadiantGlyphCooldown = radiantGlyphCooldown;
      let finalDireGlyphCooldown = direGlyphCooldown;
      let finalRadiantScanCharges = globalRadiantScanCharges;
      let finalDireScanCharges = globalDireScanCharges;
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

      // ── Roshan Kill Detection (event-driven) ─────────────────────────────────
      // We detect a ROSHAN_KILLED event from the GSI events array. The
      // roshan_killed event provides killed_by_team ("radiant" | "dire") and
      // killer_player_id directly — no net-worth delta heuristics needed.
      // The aegis_picked_up event provides player_id and snatched: true/false
      // so we don't need to scan item inventories either.
      const prevRoshanState = globalLastRoshanState;
      if (
        finalRoshanState &&
        prevRoshanState === "alive" &&
        finalRoshanState !== "alive" &&
        clockTime > 0
      ) {
        globalRoshanKillCount += 1;
        const killNumber = globalRoshanKillCount;

        // Read killer info from the roshan_killed event
        let killerTeam: "radiant" | "dire" | null = null;
        let killerPlayerId: number | undefined;

        if (Array.isArray(payload?.events)) {
          const rkEvent = payload.events.find((e: any) => e.event_type === "roshan_killed");
          if (rkEvent) {
            if (rkEvent.killed_by_team === "radiant") killerTeam = "radiant";
            else if (rkEvent.killed_by_team === "dire") killerTeam = "dire";
            killerPlayerId = typeof rkEvent.killer_player_id === "number" ? rkEvent.killer_player_id : undefined;
          }
        }

        // Resolve killer player name from the player block (player_id 0-4 = team2, 5-9 = team3)
        let killerPlayerName: string | undefined;
        if (killerPlayerId !== undefined) {
          const killerTeamKey = killerPlayerId < 5 ? "team2" : "team3";
          killerPlayerName = (payload?.player as any)?.[killerTeamKey]?.[`player${killerPlayerId}`]?.name;
        }

        const drops = getRoshanDropsByKillNumber(killNumber);

        const draftSnap = current.draft;
        const matchSetupSnap = current.leagueConfig?.matchSetup;
        let teamName: string | undefined;
        let teamLogoUrl: string | undefined;

        if (killerTeam) {
          const roster = current.leagueConfig?.roster ?? [];
          if (killerTeam === "radiant") {
            const tk = matchSetupSnap?.radiantTeamKey;
            teamName = draftSnap?.radiant?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Radiant";
            teamLogoUrl = draftSnap?.radiant?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
          } else {
            const tk = matchSetupSnap?.direTeamKey;
            teamName = draftSnap?.dire?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Dire";
            teamLogoUrl = draftSnap?.dire?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
          }
        }

        logger.info(
          { killNumber, clockTime, killerTeam, killerPlayerId, killerPlayerName, teamName, drops },
          "[roshan] Roshan killed — emitting ROSHAN_KILLED event",
        );

        io.of("/overlay").emit("ROSHAN_KILLED", {
          killNumber,
          clockTime,
          teamName,
          teamLogoUrl,
          killerTeam,
          killerPlayerName,
          drops,
        });

        // Cache kill info for the aegis_picked_up handler below
        globalPendingAegisKillInfo = {
          killNumber,
          clockTime,
          teamName,
          teamLogoUrl,
          killerTeam,
          drops,
        };
        globalPendingAegisSearchUntil = clockTime + 30;
      }

      // ── Aegis Pickup / Steal Detection (event-driven) ─────────────────────────
      // aegis_picked_up fires with player_id and snatched: true if stolen.
      if (Array.isArray(payload?.events) && globalPendingAegisKillInfo && globalPendingAegisSearchUntil > 0 && clockTime <= globalPendingAegisSearchUntil) {
        const aegisEvent = payload.events.find((e: any) => e.event_type === "aegis_picked_up");
        if (aegisEvent) {
          const pickerPlayerId: number | undefined = typeof aegisEvent.player_id === "number" ? aegisEvent.player_id : undefined;
          const isSteal: boolean = aegisEvent.snatched === true;

          // Resolve picker's name and team from player_id
          let pickerPlayerName: string | undefined;
          let pickerTeam: "radiant" | "dire" | null = null;
          if (pickerPlayerId !== undefined) {
            const pickerTeamKey = pickerPlayerId < 5 ? "team2" : "team3";
            pickerTeam = pickerPlayerId < 5 ? "radiant" : "dire";
            pickerPlayerName = (payload?.player as any)?.[pickerTeamKey]?.[`player${pickerPlayerId}`]?.name;
          }

          if (isSteal) {
            const draftSnap = current.draft;
            const matchSetupSnap = current.leagueConfig?.matchSetup;
            const roster = current.leagueConfig?.roster ?? [];
            let thiefTeamName: string | undefined;
            let thiefTeamLogoUrl: string | undefined;

            if (pickerTeam === "radiant") {
              const tk = matchSetupSnap?.radiantTeamKey;
              thiefTeamName = draftSnap?.radiant?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Radiant";
              thiefTeamLogoUrl = draftSnap?.radiant?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
            } else if (pickerTeam === "dire") {
              const tk = matchSetupSnap?.direTeamKey;
              thiefTeamName = draftSnap?.dire?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Dire";
              thiefTeamLogoUrl = draftSnap?.dire?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
            }

            const stealInfo = {
              killNumber: globalPendingAegisKillInfo.killNumber,
              clockTime,
              teamName: thiefTeamName,
              teamLogoUrl: thiefTeamLogoUrl,
              killerTeam: globalPendingAegisKillInfo.killerTeam,
              pickerTeam,
              pickerPlayerName,
              drops: globalPendingAegisKillInfo.drops,
            };

            logger.info(
              { killNumber: stealInfo.killNumber, pickerTeam, pickerPlayerName },
              "[roshan] Aegis snatched! Emitting AEGIS_STOLEN event",
            );

            io.of("/overlay").emit("AEGIS_STOLEN", stealInfo);
          } else {
            logger.info(
              { killNumber: globalPendingAegisKillInfo.killNumber, pickerTeam, pickerPlayerName },
              "[roshan] Aegis picked up normally",
            );
          }

          // Clear pending state once aegis event is handled
          globalPendingAegisSearchUntil = 0;
          globalPendingAegisKillInfo = null;
        }
      } else if (clockTime > globalPendingAegisSearchUntil && globalPendingAegisSearchUntil > 0) {
        // Timeout — aegis event never came (e.g. aegis expired)
        globalPendingAegisSearchUntil = 0;
        globalPendingAegisKillInfo = null;
      }

      // Update last known Roshan state
      if (finalRoshanState) {
        globalLastRoshanState = finalRoshanState;
      }

      patch.minimapState = {
        roshanState: finalRoshanState,
        roshanRespawnTimer: finalRoshanRespawnTimer,
        tormentorRadiant: tormRadState,
        tormentorRadiantRespawnTimer: tormRadTimer,
        tormentorDire: tormDireState,
        tormentorDireRespawnTimer: tormDireTimer,
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
      // Bounties: 20 (1200), 35 (2100), 50 (3000), 60 (3600)
      const bountyMilestones = [1200, 2100, 3000, 3600];
      for (const m of bountyMilestones) {
        if (clockTime >= m && clockTime < m + 30 && !globalBountyMilestonesTriggered.has(m)) {
          globalBountyMilestonesTriggered.add(m);
          emitBountyStats(io, state).catch(e => logger.error(e, "failed to emit bounty stats"));
        }
      }

      // Wisdoms: 21 (1260), 36 (2160), 51 (3060), 61 (3660)
      const wisdomMilestones = [1260, 2160, 3060, 3660];
      for (const m of wisdomMilestones) {
        if (clockTime >= m && clockTime < m + 30 && !globalWisdomMilestonesTriggered.has(m)) {
          globalWisdomMilestonesTriggered.add(m);
          emitWisdomStats(io, state).catch(e => logger.error(e, "failed to emit wisdom stats"));
        }
      }

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

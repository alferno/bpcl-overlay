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
import { rankMvpCandidates } from "../services/mvp-scorer.js";

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
    if (!teamData) return [null, null, null, null, null];
    return [0, 1, 2, 3, 4].map((i) => {
      const pData = teamData[`player${i}`] as Record<string, any> | undefined;
      if (!pData) return null;
      const accountId = pData.accountid;
      if (accountId == null) return null;
      const n = parseInt(String(accountId), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    });
  };

  const radiant = extractTeam("team2");
  const dire = extractTeam("team3");

  // Only return if we have at least some players
  const total = [...radiant, ...dire].filter(Boolean).length;
  if (total === 0) return null;

  return { radiant, dire };
}

/**
 * Detect substitute players: compare actual GSI lobby players against the current matchSetup.pickPlayers.
 * If mismatches are found, patch matchSetup.pickPlayers to reflect the actual players.
 * For unknown players (not in roster), attempts to look them up in the community API.
 * Returns the patched pickPlayers, or null if no changes were needed.
 */
async function detectAndApplySubstitutes(
  lobbyPlayers: { radiant: (number | null)[]; dire: (number | null)[] },
  currentRoster: RosterPlayer[],
  currentMatchSetup: MatchSetup | null | undefined,
): Promise<{ radiant: (number | null)[]; dire: (number | null)[] } | null> {
  const existingRadiant: (number | null)[] = currentMatchSetup?.pickPlayers?.radiant ?? [null, null, null, null, null];
  const existingDire: (number | null)[] = currentMatchSetup?.pickPlayers?.dire ?? [null, null, null, null, null];

  const toSet = (arr: (number | null)[]) =>
    new Set<number>(arr.filter((x): x is number => x != null && x > 0));

  const existingRadiantSet = toSet(existingRadiant);
  const existingDireSet = toSet(existingDire);
  const lobbyRadiantSet = toSet(lobbyPlayers.radiant);
  const lobbyDireSet = toSet(lobbyPlayers.dire);

  const lobbySet = new Set<number>([...lobbyRadiantSet, ...lobbyDireSet]);

  // If lobby is empty or doesn't have enough players, skip
  if (lobbySet.size < 2) return null;

  // Build a key to track if this is a new lobby configuration. This MUST be
  // side-aware (not just the combined set of all 10 IDs) — otherwise a side
  // swap between series games (same 10 players, radiant/dire flipped) looks
  // identical to "no change" and gets skipped, leaving pickPlayers stuck
  // pointing the wrong steam32 IDs at the wrong side.
  const lobbyKey = `r:${[...lobbyRadiantSet].sort().join(",")}|d:${[...lobbyDireSet].sort().join(",")}`;
  if (lobbyKey === globalLastLobbyKey) return null;

  // Check per-side, not as a combined union — a side swap has the exact same
  // 10 people, so a union-based check would (wrongly) call that "no change".
  const setsEqual = (a: Set<number>, b: Set<number>) =>
    a.size === b.size && [...a].every((id) => b.has(id));
  const allMatch =
    setsEqual(existingRadiantSet, lobbyRadiantSet) &&
    setsEqual(existingDireSet, lobbyDireSet);
  if (allMatch) {
    globalLastLobbyKey = lobbyKey;
    return null;
  }

  // Build existing set of all assigned steam32 IDs from the match setup —
  // used below to tell genuinely-new (sub) players apart from known ones.
  const existingSet = new Set<number>([...existingRadiantSet, ...existingDireSet]);

  // There's a mismatch — detect which players are subs (in lobby but not in existing setup)
  const rosterMap = new Map<number, RosterPlayer>(currentRoster.map((p) => [p.steam32, p]));
  const { fetchCommunityPlayers } = await import("../services/bpcleague-sync.js");
  const communityPlayers = await fetchCommunityPlayers();
  const communityMap = new Map(communityPlayers.filter(p => p.steam32).map(p => [p.steam32!, p]));

  const resolvePlayer = (steam32: number): { displayName: string; avatarUrl?: string; bpcId?: string } => {
    // Check main roster first
    const rosterEntry = rosterMap.get(steam32);
    if (rosterEntry) return { displayName: rosterEntry.displayName, avatarUrl: rosterEntry.avatarUrl, bpcId: rosterEntry.bpcId };
    
    // Fallback to community players
    const communityEntry = communityMap.get(steam32);
    if (communityEntry) {
      return { 
        displayName: communityEntry.displayName, 
        avatarUrl: communityEntry.avatarUrl, 
        bpcId: communityEntry.bpcId 
      };
    }
    
    // Unknown player
    return { displayName: `Sub#${steam32}` };
  };

  logger.info(
    { lobbySet: [...lobbySet], existingSet: [...existingSet] },
    "[GSI] Substitute detected — updating pickPlayers from lobby",
  );

  // Smart swap logic to preserve Pos 1-5 overlay layout:
  // 1. Clear slots for players who left the lobby.
  // 2. Insert new players into the newly emptied (or already empty) slots.
  const smartSwapTeam = (existing: (number | null)[], lobby: (number | null)[]) => {
    const lobbySet = new Set(lobby.filter((id): id is number => id != null && id > 0));
    const existingSet = new Set(existing.filter((id): id is number => id != null && id > 0));
    
    const leftIds = new Set(existing.filter((id): id is number => id != null && id > 0 && !lobbySet.has(id)));
    const joinedIds = lobby.filter((id): id is number => id != null && id > 0 && !existingSet.has(id));

    const result = [...existing];
    
    // Clear slots for players who left
    for (let i = 0; i < result.length; i++) {
      if (result[i] && leftIds.has(result[i]!)) {
        result[i] = null;
      }
    }

    // Insert new players into available slots
    for (const newId of joinedIds) {
      const emptyIndex = result.indexOf(null);
      if (emptyIndex !== -1) {
        result[emptyIndex] = newId;
      }
    }

    return result;
  };

  const newRadiant = smartSwapTeam(existingRadiant, lobbyPlayers.radiant);
  const newDire = smartSwapTeam(existingDire, lobbyPlayers.dire);

  // Log any new (substitute) players
  [...newRadiant, ...newDire].forEach((id) => {
    if (id && !existingSet.has(id) && !rosterMap.has(id)) {
      const info = resolvePlayer(id);
      logger.info({ steam32: id, ...info }, "[GSI] Sub player resolved from community");
    }
  });

  globalLastLobbyKey = lobbyKey;
  return { radiant: newRadiant, dire: newDire };
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
export const globalWisdomHistory: WisdomHistoryEntry[] = [];

let globalLastBountyCountForEmit = 0;
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

// ── Roshan Drops ─────────────────────────────────────────────────────────────
// Requires "roshan" "1" in the GSI cfg data block. Shape hasn't been verified
// against a live payload yet — this handles the two most common GSI shapes
// (object map of slot -> item, or an array) and logs anything else so it can
// be tightened up once a real payload is captured.
function extractRoshanDrops(payload: any): string[] {
  const drops = payload?.roshan?.drops?.items ?? payload?.roshan?.drops;
  if (!drops) return [];

  let names: string[] = [];

  if (Array.isArray(drops)) {
    names = drops
      .map((d: any) => (typeof d === "string" ? d : d?.name))
      .filter((n: any): n is string => typeof n === "string");
  } else if (typeof drops === "object") {
    names = Object.values(drops)
      .map((d: any) => (typeof d === "string" ? d : d?.name))
      .filter((n: any): n is string => typeof n === "string");
  } else {
    logger.warn({ drops }, "[roshan] Unrecognized roshan.drops shape — update extractRoshanDrops");
    return [];
  }

  return Array.from(new Set(names)); // dedupe
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

  app.post("/gsi", async (req, res) => {
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;
    if (env.GSI_TOKEN && token !== env.GSI_TOKEN) {
      res.status(403).json({ error: "invalid gsi token" });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    lastGsiAt = Date.now();
    await ensureHeroRegistry(opendota);

    // Trigger power spike evaluation
    try {
      detectPowerSpikes(payload, io);
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

    // ── Substitute Detection ────────────────────────────────────────────────
    // Extract the actual 10 players from the GSI lobby and compare against
    // matchSetup.pickPlayers. If a substitute is detected, patch the state.
    const lobbyPlayers = extractGsiLobbyPlayers(payload);
    if (lobbyPlayers && matchSetup) {
      // Run async but don't block the main apply path
      detectAndApplySubstitutes(lobbyPlayers, roster, matchSetup).then(async (newPickPlayers) => {
        if (!newPickPlayers) return;
        try {
          const cur = await state.getState();
          const currentSetup = cur.leagueConfig?.matchSetup;
          if (!currentSetup) return;
          await state.patchState({
            leagueConfig: {
              ...(cur.leagueConfig ?? {}),
              matchSetup: {
                ...currentSetup,
                pickPlayers: newPickPlayers,
              },
            },
          });
          logger.info({ newPickPlayers }, "[GSI] Patched pickPlayers with substitute data");
        } catch (err) {
          logger.warn({ err }, "[GSI] Failed to patch pickPlayers after substitute detection");
        }
      }).catch((err) => {
        logger.warn({ err }, "[GSI] Substitute detection error");
      });
    } else if (lobbyPlayers && !matchSetup) {
      // No matchSetup: store lobby players as a best-effort pickPlayers
      // This allows the draft overlay to show correct data even without a full match setup
      const lobbyKey = [...[...lobbyPlayers.radiant, ...lobbyPlayers.dire].filter(Boolean)].sort().join(",");
      if (lobbyKey !== globalLastLobbyKey && lobbyKey.length > 0) {
        globalLastLobbyKey = lobbyKey;
        // Don't auto-create a matchSetup, just log for now
        logger.info({ radiant: lobbyPlayers.radiant, dire: lobbyPlayers.dire }, "[GSI] Lobby players detected (no matchSetup)");
      }
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

        // Reset wisdom tracking
        globalWisdomRadiantCount = 0;
        globalWisdomRadiantXp = 0;
        globalWisdomDireCount = 0;
        globalWisdomDireXp = 0;
        globalWisdomHistory.length = 0;
        globalPrevXp.clear();
      } else if (clockTime < prevClockTime || clockTime < (globalLastTormentorKillClockTime || 0)) {
        globalLastTormentorKillClockTime = null;
        globalLastProcessedEventTime = 0;
        globalPrevPayload = null;
        globalRadiantScanCharges = 2;
        globalDireScanCharges = 2;
        globalLastRadiantScanCooldown = 0;
        globalLastDireScanCooldown = 0;
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
      // runes_activated (the real GSI field — NOT rune_pickups, which doesn't
      // exist in the payload) tracks ALL rune types, so to reduce noise we
      // only count a pickup as "bounty" if it's within 30s of a 4-min spawn
      // boundary.
      if (!bountyDetectedViaEvents && clockTime > 0) {
        const nearestSpawnDiff = clockTime % 240;
        const nearBountyWindow = nearestSpawnDiff <= 30 || nearestSpawnDiff >= 210;
        const goldPerRune = bountyGoldAtConsumption(clockTime);
        for (const [teamKey, side] of [["team2", "radiant"], ["team3", "dire"]] as const) {
          const teamPlayers = (payload?.player as any)?.[teamKey];
          if (!teamPlayers) continue;
          for (let i = 0; i < 5; i++) {
            const pKey = `player${i}`;
            const player = teamPlayers[pKey];
            if (!player) continue;
            const currentPickups = Number(player.runes_activated ?? 0);
            const cacheKey = `${teamKey}-${pKey}`;
            const prevPickups = globalPrevRunePickups.get(cacheKey) ?? currentPickups;
            if (currentPickups > prevPickups && nearBountyWindow) {
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
              logger.debug(
                { team: side, delta, goldPerRune, cacheKey },
                "[bounty] Rune pickups delta fallback (near spawn window, 7.41d consumption-time)",
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
          if (!teamPlayers) continue;
          
          let heroesGotSpike = 0;
          
          for (let i = 0; i < 5; i++) {
            const pKey = `player${i}`;
            const player = teamPlayers[pKey];
            if (!player) continue;
            
            const currentXp = Number(player.experience ?? 0);
            const cacheKey = `${teamKey}-${pKey}`;
            const prevXp = globalPrevXp.get(cacheKey) ?? currentXp;
            
            if (currentXp > prevXp) {
              const delta = currentXp - prevXp;
              // 0.85 tolerance because in rare edge cases XP might be slightly misreported or split across ticks
              if (delta >= expectedXpPerHero * 0.85) {
                heroesGotSpike += 1;
              }
            }
            globalPrevXp.set(cacheKey, currentXp);
          }
          
          // Wisdom rune hits 2 heroes (picker + lowest XP). 
          if (heroesGotSpike >= 2) {
            const runesPicked = Math.floor(heroesGotSpike / 2);
            if (runesPicked > 0) {
              const xpGained = expectedTeamXp * runesPicked;
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
                { team: side, heroesGotSpike, runesPicked, expectedTeamXp },
                "[wisdom] Wisdom Rune pickup detected via XP spike fallback"
              );
            }
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

      // ── Roshan Kill Detection ────────────────────────────────────────────────
      const prevRoshanState = globalLastRoshanState;
      if (
        finalRoshanState &&
        prevRoshanState === "alive" &&
        finalRoshanState !== "alive" &&
        clockTime > 0
      ) {
        // Roshan just died — increment kill count
        globalRoshanKillCount += 1;
        const killNumber = globalRoshanKillCount;
        const killerTeam = detectRoshanKillerTeam(roshanPrevPayload, payload);
        const drops = extractRoshanDrops(payload);

        // Determine which team picked up aegis by scanning player items
        let aegisTeam: "radiant" | "dire" | null = null;
        let pickerPlayerName: string | undefined = undefined;

        for (const [gsiTeamKey, side] of [["team2", "radiant"], ["team3", "dire"]] as const) {
          const teamItems = (payload?.items as any)?.[gsiTeamKey];
          if (teamItems) {
            for (const playerKey of Object.keys(teamItems)) {
              const slots = teamItems[playerKey];
              if (slots) {
                for (const slotKey of Object.keys(slots)) {
                  if (slots[slotKey]?.name === "item_aegis") {
                    aegisTeam = side;
                    pickerPlayerName = (payload?.player as any)?.[gsiTeamKey]?.[playerKey]?.name;
                    break;
                  }
                }
              }
              if (aegisTeam) break;
            }
          }
          if (aegisTeam) break;
        }

        // Resolve team name + logo from draft state or matchSetup
        const draftSnap = current.draft;
        const matchSetupSnap = current.leagueConfig?.matchSetup;
        let teamName: string | undefined;
        let teamLogoUrl: string | undefined;

        // Prefer the aegis holder's team (definitive), but aegis pickup often
        // isn't reflected in inventory on the same tick the kill is detected.
        // Fall back to killerTeam (net-worth-delta based, computed above) so
        // the alert still shows a team instead of rendering blank.
        const displayTeam = aegisTeam ?? killerTeam;

        if (displayTeam) {
          if (displayTeam === "radiant") {
            teamName = draftSnap?.radiant?.name ?? matchSetupSnap?.radiantTeamKey ?? "Radiant";
            teamLogoUrl = draftSnap?.radiant?.logoUrl ?? (matchSetupSnap?.radiantTeamKey ? `/teams/${matchSetupSnap.radiantTeamKey}.png` : undefined);
          } else {
            teamName = draftSnap?.dire?.name ?? matchSetupSnap?.direTeamKey ?? "Dire";
            teamLogoUrl = draftSnap?.dire?.logoUrl ?? (matchSetupSnap?.direTeamKey ? `/teams/${matchSetupSnap.direTeamKey}.png` : undefined);
          }
        } else {
          // Neither aegis holder nor a confident net-worth-delta winner yet —
          // still fire the event without a team rather than guess.
          teamName = undefined;
          teamLogoUrl = undefined;
        }

        logger.info(
          { killNumber, clockTime, aegisTeam, teamName, killerTeam, pickerPlayerName, drops },
          "[roshan] Roshan killed — emitting ROSHAN_KILLED event",
        );

        io.of("/overlay").emit("ROSHAN_KILLED", {
          killNumber,
          clockTime,
          teamName,
          teamLogoUrl,
          killerTeam,
          pickerTeam: aegisTeam,
          pickerPlayerName,
          drops,
        });
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

      if (enteredPostGame || currentGameState === "DOTA_GAMERULES_STATE_POST_GAME") {
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
                current.tournamentHeroIndex ?? {},
                roster,
                current.playerHeroIndex,
              )
            : await buildTournamentHeroCard(
                opendota,
                lp.heroId,
                current.tournamentHeroIndex ?? {},
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

    const currentBountyCount = globalBountyRadiantCount + globalBountyDireCount;
    if (currentBountyCount !== globalLastBountyCountForEmit) {
      globalLastBountyCountForEmit = currentBountyCount;
      emitBountyStats(io, state).catch(e => logger.error(e, "failed to emit bounty stats"));
    }

    const currentWisdomCount = globalWisdomRadiantCount + globalWisdomDireCount;
    if (currentWisdomCount !== globalLastWisdomCountForEmit) {
      globalLastWisdomCountForEmit = currentWisdomCount;
      emitWisdomStats(io, state).catch(e => logger.error(e, "failed to emit wisdom stats"));
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

import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import type { StateManager } from "@bpc/state-manager";
import { parseGsiToDraft } from "./parser.js";
import { detectPowerSpikes } from "./power-spikes.js";
import { detectFocusedPlayer } from "./live-player-card.js";
import { ensureHeroRegistry } from "../services/hero-registry.js";
import type { BroadcastFns } from "../routes.js";
import { logger } from "../logger.js";
import { env } from "../env.js";
import {
  buildCarouselFromHeroCard,
  buildPlayerHeroCard,
  buildTournamentHeroCard,
} from "../services/stats-builder.js";
import type { OpenDotaClient } from "../opendota-client.js";
import { findRosterPlayer, heroPortraitFieldsForHero } from "../services/hero-registry.js";
import {
  manualPickSteam32,
  pickSlotOrderForHero,
} from "@bpc/shared-types";
import { assertLeagueStatsReady } from "../services/league-stats-guard.js";
import { parsePostGamePayload } from "../services/post-game-mvp.js";
import { rankMvpCandidates } from "../services/mvp-scorer.js";

let lastGsiAt = 0;
let gsiDebounce: ReturnType<typeof setTimeout> | null = null;
let globalLastTormentorKillClockTime: number | null = null;
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
let globalLastRoshanKillerTeam: "radiant" | "dire" | null = null;

let globalLastAutoReplaySaveAt = 0;

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

export function getWisdomStats() {
  return {
    radiant: { count: globalWisdomRadiantCount, xp: globalWisdomRadiantXp },
    dire:    { count: globalWisdomDireCount,    xp: globalWisdomDireXp },
  };
}

export function getBountyStats() {
  return {
    radiant: { count: globalBountyRadiantCount, gold: globalBountyRadiantGold },
    dire:    { count: globalBountyDireCount,    gold: globalBountyDireGold },
  };
}

const SHARD_VALUE = 1400;
const TOLERANCE = 100;
const RESPAWN_SECONDS = 600;

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

      const radiantScanCooldown = (payload?.map as any)?.radiant_scan_cooldown ?? 0;
      const direScanCooldown = (payload?.map as any)?.dire_scan_cooldown ?? 0;
      const radiantGlyphCooldown = (payload?.map as any)?.radiant_glyph_cooldown ?? 0;
      const direGlyphCooldown = (payload?.map as any)?.dire_glyph_cooldown ?? 0;
      
      const clockTime = (payload?.map as any)?.clock_time || 0;
      const gameTime = (payload?.map as any)?.game_time || 0;

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
        globalLastRoshanKillerTeam = null;
        // Reset bounty tracking for new match
        globalBountyRadiantCount = 0;
        globalBountyRadiantGold = 0;
        globalBountyDireCount = 0;
        globalBountyDireGold = 0;
        globalBountyEventsProcessedTotal = 0;
        globalPrevRunePickups.clear();

        // Reset wisdom tracking
        globalWisdomRadiantCount = 0;
        globalWisdomRadiantXp = 0;
        globalWisdomDireCount = 0;
        globalWisdomDireXp = 0;
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
            if (ev.event_type === "roshan_killed") {
              globalLastRoshanKillerTeam = ev.killer_team === 2 ? "radiant" : ev.killer_team === 3 ? "dire" : null;
            }
            
            // Auto-Replay Triggers
            if (
              ev.event_type === "first_blood" || 
              ev.event_type === "aegis_stolen" || 
              ev.event_type === "roshan_killed" ||
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
            logger.info(
              { radiantPickups, goldPerRune, totalGold: goldPerRune * radiantPickups },
              "[bounty] Radiant bounty pickups (events array, 7.41d consumption-time)",
            );
          }
          if (direPickups > 0) {
            globalBountyDireCount += direPickups;
            globalBountyDireGold  += goldPerRune * direPickups;
            logger.info(
              { direPickups, goldPerRune, totalGold: goldPerRune * direPickups },
              "[bounty] Dire bounty pickups (events array, 7.41d consumption-time)",
            );
          }
        }
      }

      // ── Bounty Rune Fallback: rune_pickups delta ──────────────────────────────
      // Used when bounty_rune_pickup events are not present in the events array.
      // rune_pickups tracks ALL rune types, so to reduce noise we only count
      // a pickup as "bounty" if it's within 30s of a 4-min spawn boundary.
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
            const currentPickups = Number(player.rune_pickups ?? 0);
            const cacheKey = `${teamKey}-${pKey}`;
            const prevPickups = globalPrevRunePickups.get(cacheKey) ?? currentPickups;
            if (currentPickups > prevPickups && nearBountyWindow) {
              const delta = currentPickups - prevPickups;
              if (side === "radiant") {
                globalBountyRadiantCount += delta;
                globalBountyRadiantGold  += goldPerRune * delta;
              } else {
                globalBountyDireCount += delta;
                globalBountyDireGold  += goldPerRune * delta;
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
      if (clockTime >= 420) {
        const currentInterval = Math.floor(clockTime / 420);
        const expectedXpPerHero = 280 * currentInterval;
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
              if (side === "radiant") {
                globalWisdomRadiantCount += runesPicked;
                globalWisdomRadiantXp += expectedTeamXp * runesPicked;
              } else {
                globalWisdomDireCount += runesPicked;
                globalWisdomDireXp += expectedTeamXp * runesPicked;
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

        if (aegisTeam) {
          if (aegisTeam === "radiant") {
            teamName = draftSnap?.radiant?.name ?? matchSetupSnap?.radiantTeamKey ?? "Radiant";
            teamLogoUrl = draftSnap?.radiant?.logoUrl ?? (matchSetupSnap?.radiantTeamKey ? `/teams/${matchSetupSnap.radiantTeamKey}.png` : undefined);
          } else {
            teamName = draftSnap?.dire?.name ?? matchSetupSnap?.direTeamKey ?? "Dire";
            teamLogoUrl = draftSnap?.dire?.logoUrl ?? (matchSetupSnap?.direTeamKey ? `/teams/${matchSetupSnap.direTeamKey}.png` : undefined);
          }
        } else {
          // Fallback — aegis not yet visible in GSI tick, still fire event without team
          teamName = undefined;
          teamLogoUrl = undefined;
        }

        logger.info(
          { killNumber, clockTime, aegisTeam, teamName, killerTeam: globalLastRoshanKillerTeam, pickerPlayerName },
          "[roshan] Roshan killed — emitting ROSHAN_KILLED event",
        );

        io.of("/overlay").emit("ROSHAN_KILLED", {
          killNumber,
          clockTime,
          teamName,
          teamLogoUrl,
          killerTeam: globalLastRoshanKillerTeam,
          pickerTeam: aegisTeam,
          pickerPlayerName,
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
        const visChanged = current.overlayVisibility?.liveplayercard === "visible";
        const hasCard = current.livePlayerCard !== null && current.livePlayerCard !== undefined;
        if (visChanged || hasCard) {
          patch = {
            ...patch,
            livePlayerCard: null,
            overlayVisibility: {
              ...(patch.overlayVisibility as any || {}),
              liveplayercard: "hidden",
            },
          };
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
            postGameMvpFiredForMatchId = fireKey;

            const ranked = rankMvpCandidates(postGame.match);
            const winner = ranked[0];

            if (winner) {
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
                  `Player ${winner.accountId ?? "?"}`,
                heroId: winner.heroId,
                heroName: winner.heroName,
                steam32: winner.accountId,
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

              const mvpUpdated = await state.patchState({
                standoutPlayerCard: standoutCard,
                overlayVisibility: { standoutplayer: "visible" },
              });
              await broadcast.broadcastFull(mvpUpdated);

              logger.info(
                { mvpScore: winner.mvpScore, heroId: winner.heroId, accountId: winner.accountId },
                "[post-game] Standout Player auto-selected and pushed to overlay",
              );
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
          const next = await state.patchState({
            production: { gsiConnected: false },
          });
          await broadcast.broadcastFull(next);
        }
      }
    })();
  }, 3000).unref?.();
}

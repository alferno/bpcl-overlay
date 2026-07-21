import type { OverlayEnvelope } from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import { logger } from "../logger.js";
import { env, parseLeagueIds } from "../env.js";
import type { OpenDotaClient } from "../opendota-client.js";
import type { BroadcastFns } from "../routes.js";
import { tournamentAggregator } from "./tournament-aggregator.js";
import {
  leagueStatsDir,
  loadLeagueStatsFromDisk,
  saveLeagueStatsToDisk,
  buildPlayerHeroIndex,
} from "./league-stats-store.js";
import { fetchRosterFromBpcLeague } from "./bpcleague-sync.js";
import { enrichRosterAvatars } from "./steam-profile.js";
import { teamColorsFromRoster } from "./roster-parser.js";

async function applyLeagueSnapshot(opts: {
  leagueId: number;
  state: StateManager;
  broadcast: BroadcastFns;
  source: "csv" | "api";
}): Promise<boolean> {
  const { leagueId, state, broadcast, source } = opts;
  const snapshot =
    source === "csv" ? await loadLeagueStatsFromDisk(leagueId) : null;

  if (!snapshot) return false;

  tournamentAggregator.hydrateFromSnapshot(
    snapshot.heroIndex,
    snapshot.playerHeroes,
    snapshot.meta.matchTotal,
    snapshot.meta.matchDone,
  );

  const currentSnap = await state.getState();
  const next = await state.patchState({
    tournamentHeroIndex: snapshot.heroIndex,
    playerHeroIndex: buildPlayerHeroIndex(snapshot.playerHeroes),
    leagueConfig: {
      ...currentSnap.leagueConfig,
      leagueId,
      aggregationStatus: "ready",
      aggregatedAt: snapshot.meta.aggregatedAt,
      aggregationProgress: 100,
      aggregationMatchTotal: snapshot.meta.matchTotal,
      aggregationMatchDone: snapshot.meta.matchDone,
      aggregationError: undefined,
      aggregationSource: source,
      statsCsvDir: leagueStatsDir(),
    },
  });
  await broadcast.broadcastFull(next);
  return true;
}

export async function loadLeagueStatsFromCsvFile(opts: {
  leagueId: number;
  state: StateManager;
  broadcast: BroadcastFns;
}): Promise<boolean> {
  const ok = await applyLeagueSnapshot({ ...opts, source: "csv" });
  if (ok) {
    logger.info(
      { leagueId: opts.leagueId, dir: leagueStatsDir() },
      "League stats loaded from CSV",
    );
  }
  return ok;
}

export async function runLeagueAggregation(opts: {
  leagueId: number;
  leagueIds?: number[];
  state: StateManager;
  opendota: OpenDotaClient;
  broadcast: BroadcastFns;
}): Promise<void> {
  const { leagueId, leagueIds, state, opendota, broadcast } = opts;

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
      aggregationError: undefined,
    },
  });
  await broadcast.broadcastFull(runningPatch);

  try {
    const defaultIds = parseLeagueIds();
    const targetLeagueIds = leagueIds && leagueIds.length > 0 ? leagueIds : (defaultIds ?? [leagueId]);
    const currentLeagueId = targetLeagueIds[targetLeagueIds.length - 1] ?? leagueId;

    const currentIndex = await tournamentAggregator.aggregateLeagues(
      [currentLeagueId],
      opendota,
      80,
      async (prog) => {
        const next = await state.patchState({
          leagueConfig: {
            aggregationStatus: "running",
            aggregationProgress: prog.progress,
            aggregationMatchTotal: prog.matchTotal,
            aggregationMatchDone: prog.matchDone,
          },
        });
        await broadcast.broadcastFull(next);
      },
    );
    const currentPlayerHeroes = tournamentAggregator.exportPlayerHeroRows();
    let currentMatchTotal = tournamentAggregator.getProgress().matchTotal;
    let currentMatchDone = tournamentAggregator.getProgress().matchDone;

    let lifetimeIndex = currentIndex;
    let lifetimePlayerHeroes = currentPlayerHeroes;

    if (targetLeagueIds.length > 1) {
      lifetimeIndex = await tournamentAggregator.aggregateLeagues(
        targetLeagueIds,
        opendota,
        800, // higher limit for historical
        async (prog) => {
          const next = await state.patchState({
            leagueConfig: {
              aggregationStatus: "running",
              aggregationProgress: prog.progress,
              aggregationMatchTotal: prog.matchTotal,
              aggregationMatchDone: prog.matchDone,
            },
          });
          await broadcast.broadcastFull(next);
        },
      );
      lifetimePlayerHeroes = tournamentAggregator.exportPlayerHeroRows();
    }
    const aggregatedAt = new Date().toISOString();

    await saveLeagueStatsToDisk({
      heroIndex: currentIndex,
      playerHeroes: currentPlayerHeroes,
      meta: {
        leagueId: currentLeagueId,
        matchTotal: currentMatchTotal,
        matchDone: currentMatchDone,
        aggregatedAt,
        source: "api",
      },
    });

    const next = await state.patchState({
      tournamentHeroIndex: currentIndex,
      playerHeroIndex: buildPlayerHeroIndex(currentPlayerHeroes),
      lifetimeTournamentHeroIndex: lifetimeIndex,
      lifetimePlayerHeroIndex: buildPlayerHeroIndex(lifetimePlayerHeroes),
      leagueConfig: {
        leagueId: currentLeagueId,
        leagueIds: targetLeagueIds,
        aggregationStatus: "ready",
        aggregatedAt,
        aggregationProgress: 100,
        aggregationMatchTotal: currentMatchTotal,
        aggregationMatchDone: currentMatchDone,
        aggregationError: undefined,
        aggregationSource: "api",
        statsCsvDir: leagueStatsDir(),
      },
    });
    await broadcast.broadcastFull(next);
    logger.info(
      { leagueId: currentLeagueId, matches: currentMatchTotal, dir: leagueStatsDir() },
      "League aggregation ready — saved to CSV",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, leagueId }, "League aggregation failed");
    const next = await state.patchState({
      leagueConfig: {
        leagueId,
        aggregationStatus: "error",
        aggregationError: msg,
      },
    });
    await broadcast.broadcastFull(next);
  }
}

export async function bootstrapLeagueFromEnv(opts: {
  state: StateManager;
  opendota: OpenDotaClient;
  broadcast: BroadcastFns;
}): Promise<void> {
  const { state, opendota, broadcast } = opts;
  const leagueId = env.LEAGUE_ID;

  const snap = await state.getState();
  const stateLeagueId = snap.leagueConfig?.leagueId;
  const needsId = stateLeagueId == null;

  if (needsId) {
    await state.patchState({
      leagueConfig: { leagueId, aggregationStatus: "idle" },
    });
  }

  const activeLeagueId = needsId ? leagueId : stateLeagueId!;

  // Auto fetch roster
  try {
    logger.info("Auto-fetching roster from BPC League API...");
    const rawRoster = await fetchRosterFromBpcLeague({
      steamApiKey: env.STEAM_WEB_API_KEY,
    });
    const roster = await enrichRosterAvatars(rawRoster, opendota);
    const teamColors = teamColorsFromRoster(roster);

    const currentSnap = await state.getState();
    const next = await state.patchState({
      leagueConfig: { ...currentSnap.leagueConfig, roster, teamColors, leagueId: activeLeagueId },
    });
    await broadcast.broadcastFull(next);
    logger.info({ count: roster.length }, "Auto-fetched and applied roster.");
  } catch (err) {
    logger.error({ err }, "Failed to auto-fetch roster");
  }

  const csvLoaded = await loadLeagueStatsFromCsvFile({
    leagueId: activeLeagueId,
    state,
    broadcast,
  });

  if (csvLoaded) return;

  const after = await state.getState();
  const stateReady = after.leagueConfig?.aggregationStatus === "ready";
  const memReady = tournamentAggregator.getProgress().status === "ready";
  const shouldAggregate =
    env.LEAGUE_AUTO_AGGREGATE &&
    (!stateReady || !memReady) &&
    tournamentAggregator.getProgress().status !== "running";

  if (shouldAggregate) {
    logger.info({ leagueId: activeLeagueId }, "Starting league aggregation (Steam match list + OpenDota details)");
    void runLeagueAggregation({ leagueId: activeLeagueId, state, opendota, broadcast });
  } else {
    logger.info(
      { leagueId: activeLeagueId, dir: leagueStatsDir() },
      "No league CSV found — place stats CSV or run manual aggregate in admin",
    );
  }
}

export function leagueInfoFromEnv(): {
  leagueId: number;
  autoAggregate: boolean;
  statsDir: string;
} {
  return {
    leagueId: env.LEAGUE_ID,
    autoAggregate: env.LEAGUE_AUTO_AGGREGATE,
    statsDir: leagueStatsDir(),
  };
}

export function currentLeagueId(snap: OverlayEnvelope): number {
  return snap.leagueConfig?.leagueId ?? env.LEAGUE_ID;
}

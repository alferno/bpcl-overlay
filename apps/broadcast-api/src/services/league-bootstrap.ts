import type { OverlayEnvelope } from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import { logger } from "../logger.js";
import { env } from "../env.js";
import type { OpenDotaClient } from "../opendota-client.js";
import type { BroadcastFns } from "../routes.js";
import { tournamentAggregator } from "./tournament-aggregator.js";
import {
  leagueStatsDir,
  loadLeagueStatsFromDisk,
  saveLeagueStatsToDisk,
  buildPlayerHeroIndex,
} from "./league-stats-store.js";

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
  state: StateManager;
  opendota: OpenDotaClient;
  broadcast: BroadcastFns;
}): Promise<void> {
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
      aggregationError: undefined,
    },
  });
  await broadcast.broadcastFull(runningPatch);

  try {
    const index = await tournamentAggregator.aggregateLeague(
      leagueId,
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

    const prog = tournamentAggregator.getProgress();
    const aggregatedAt = new Date().toISOString();

    await saveLeagueStatsToDisk({
      heroIndex: index,
      playerHeroes: tournamentAggregator.exportPlayerHeroRows(),
      meta: {
        leagueId,
        matchTotal: prog.matchTotal,
        matchDone: prog.matchDone,
        aggregatedAt,
        source: "api",
      },
    });

    const next = await state.patchState({
      tournamentHeroIndex: index,
      playerHeroIndex: buildPlayerHeroIndex(
        tournamentAggregator.exportPlayerHeroRows(),
      ),
      leagueConfig: {
        leagueId,
        aggregationStatus: "ready",
        aggregatedAt,
        aggregationProgress: 100,
        aggregationMatchTotal: prog.matchTotal,
        aggregationMatchDone: prog.matchDone,
        aggregationError: undefined,
        aggregationSource: "api",
        statsCsvDir: leagueStatsDir(),
      },
    });
    await broadcast.broadcastFull(next);
    logger.info(
      { leagueId, matches: prog.matchTotal, dir: leagueStatsDir() },
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
  const needsId =
    snap.leagueConfig?.leagueId !== leagueId ||
    snap.leagueConfig?.leagueId === null ||
    snap.leagueConfig?.leagueId === undefined;

  if (needsId) {
    await state.patchState({
      leagueConfig: { leagueId, aggregationStatus: "idle" },
    });
  }

  const csvLoaded = await loadLeagueStatsFromCsvFile({
    leagueId,
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
    logger.info({ leagueId }, "Starting league aggregation from OpenDota/Steam");
    void runLeagueAggregation({ leagueId, state, opendota, broadcast });
  } else {
    logger.info(
      { leagueId, dir: leagueStatsDir() },
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

import type { OverlayEnvelope } from "@bpc/shared-types";
import { tournamentAggregator } from "./tournament-aggregator.js";

export class LeagueStatsNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeagueStatsNotReadyError";
  }
}

export function isLeagueAggregationReady(
  snap: Pick<OverlayEnvelope, "leagueConfig" | "tournamentHeroIndex">,
): boolean {
  return (
    snap.leagueConfig?.aggregationStatus === "ready" &&
    tournamentAggregator.getProgress().status === "ready"
  );
}

export function assertLeagueStatsReady(
  snap: Pick<OverlayEnvelope, "leagueConfig" | "tournamentHeroIndex">,
): void {
  const status = snap.leagueConfig?.aggregationStatus ?? "idle";
  if (status === "running") {
    throw new LeagueStatsNotReadyError(
      "League stats aggregation is still running — wait for it to finish",
    );
  }
  if (status === "error") {
    throw new LeagueStatsNotReadyError(
      snap.leagueConfig?.aggregationError ??
        "League aggregation failed — re-run aggregate in admin",
    );
  }
  if (!isLeagueAggregationReady(snap)) {
    throw new LeagueStatsNotReadyError(
      "League stats not ready — run tournament aggregate first",
    );
  }
}

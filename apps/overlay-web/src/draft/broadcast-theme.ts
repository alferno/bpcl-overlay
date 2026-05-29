import type { DraftState, LeagueConfig } from "@bpc/shared-types";

import { resolveTurnAction } from "./slot-utils";

export function formatDraftPhase(phase: DraftState["phase"]): string {
  switch (phase) {
    case "starting":
      return "STRATEGY";
    case "bans":
      return "BAN PHASE";
    case "picks":
      return "PICK PHASE";
    case "done":
      return "DRAFT COMPLETE";
    case "paused":
      return "PAUSED";
    default:
      return "DRAFT";
  }
}

export function resolveSeriesMeta(
  draft: DraftState,
  leagueConfig?: LeagueConfig,
): { bestOf: 1 | 3 | 5; game: number } {
  const bestOf =
    draft.series.bestOf ??
    leagueConfig?.matchSetup?.seriesBestOf ??
    3;
  const game =
    draft.series.gameNumber ??
    leagueConfig?.matchSetup?.seriesGame ??
    draft.series.scoreA + draft.series.scoreB + 1;
  return { bestOf, game };
}

export function formatSeriesLabel(
  draft: DraftState,
  leagueConfig?: LeagueConfig,
): string {
  const { bestOf, game } = resolveSeriesMeta(draft, leagueConfig);
  const boLabel = bestOf === 1 ? "BO1" : bestOf === 5 ? "BO5" : "BO3";
  return `${boLabel} · GAME ${game}`;
}

export function resolveActiveTeamName(draft: DraftState): string | undefined {
  if (!draft.activeTeam) return undefined;
  if (draft.activeTeam === "radiant") {
    return draft.radiant?.name ?? draft.series.teamA;
  }
  return draft.dire?.name ?? draft.series.teamB;
}

export function resolveTurnTimerLabel(draft: DraftState): string {
  const action = resolveTurnAction(draft);
  return action === "ban" ? "BAN TIMER" : "PICK TIMER";
}

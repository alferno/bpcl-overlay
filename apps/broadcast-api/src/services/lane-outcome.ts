import type { OpenDotaMatchPlayer } from "../opendota-client.js";

/** Lane outcome vs lane opponent(s), aligned with OpenDota EFF@10 comparison. */
export type LaneOutcome = "win" | "draw" | "loss";

/** |efficiency diff| ≤ this → draw (Dotabuff-style ~10%). */
export const LANE_TIE_THRESHOLD_PCT = 10;

function laneEfficiencyPct(p: OpenDotaMatchPlayer): number {
  const v = p.lane_efficiency_pct ?? p.lane_efficiency;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isRadiantSlot(slot: number | undefined): boolean {
  return slot !== undefined && slot < 128;
}

function validAccountId(id: number | undefined): id is number {
  return typeof id === "number" && id > 0 && id < 4294967295;
}

/**
 * Per-player lane W/D/L for one match using max lane_efficiency_pct per team per lane.
 */
export function computeLaneOutcomesForMatch(
  players: OpenDotaMatchPlayer[] | undefined,
): Map<number, LaneOutcome> {
  const outcomes = new Map<number, LaneOutcome>();
  if (!players?.length) return outcomes;

  const eligible = players.filter(
    (p) =>
      validAccountId(p.account_id) &&
      typeof p.lane === "number" &&
      p.lane > 0 &&
      !p.is_roaming,
  );

  const laneIds = [...new Set(eligible.map((p) => p.lane as number))];

  for (const lane of laneIds) {
    const inLane = eligible.filter((p) => p.lane === lane);
    const radiant = inLane.filter((p) => isRadiantSlot(p.player_slot));
    const dire = inLane.filter((p) => !isRadiantSlot(p.player_slot));
    if (radiant.length === 0 || dire.length === 0) continue;

    const radEff = Math.max(0, ...radiant.map(laneEfficiencyPct));
    const direEff = Math.max(0, ...dire.map(laneEfficiencyPct));
    const diff = radEff - direEff;

    let radOutcome: LaneOutcome;
    if (Math.abs(diff) <= LANE_TIE_THRESHOLD_PCT) radOutcome = "draw";
    else radOutcome = diff > 0 ? "win" : "loss";

    const direOutcome: LaneOutcome =
      radOutcome === "draw"
        ? "draw"
        : radOutcome === "win"
          ? "loss"
          : "win";

    for (const p of radiant) outcomes.set(p.account_id!, radOutcome);
    for (const p of dire) outcomes.set(p.account_id!, direOutcome);
  }

  return outcomes;
}

export function formatLaneRecord(
  wins: number,
  draws: number,
  losses: number,
): string {
  return `${wins}W · ${draws}D · ${losses}L`;
}

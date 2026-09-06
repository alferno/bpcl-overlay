import { EventDetector } from "../EventEngine.js";
import { MatchSession } from "../../gsi/MatchSession.js";
import { CanonicalEvent, TormentorKilledEvent } from "../CanonicalEvent.js";

export class TormentorDetector implements EventDetector {
  private prevTormentorState: string | null = null;

  public process(prev: any, curr: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    const clockTime = (curr?.map as any)?.clock_time || 0;
    const prevClockTime = (prev?.map as any)?.clock_time || 0;

    // Reset state if match reset or time goes backwards
    if (clockTime < prevClockTime) {
      this.reset();
    }

    const events: CanonicalEvent[] = [];
    const currState = curr?.map?.tormentor_state; // "respawning" (and likely undefined or "alive" when alive)
    const currLocation = curr?.map?.tormentor_state_location; // "bottom" or "top"

    // If we transition into "respawning"
    if (this.prevTormentorState !== null && currState === "respawning" && this.prevTormentorState !== "respawning") {
      const team = currLocation === "bottom" ? "radiant" : "dire";
      events.push({
        id: `tormentor_killed_${session.matchId}_${clockTime}`,
        type: "TORMENTOR_KILLED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: team,
        // we omit playerId, goldDelta, etc. since GSI doesn't provide them natively
        // for Tormentor kills, and we are not inventing heuristics.
      });
    } 
    // If we transition OUT of "respawning" (i.e. it respawned)
    else if (this.prevTormentorState !== null && this.prevTormentorState === "respawning" && currState !== "respawning") {
      const team = currLocation === "bottom" ? "radiant" : "dire";
      events.push({
        id: `tormentor_respawned_${session.matchId}_${clockTime}`,
        type: "TORMENTOR_RESPAWNED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: team,
      });
    }

    // Cache current state for next tick
    // Note: if GSI omits it when alive, it will be undefined, which is fine.
    this.prevTormentorState = currState ?? null;

    return events.length > 0 ? events : null;
  }

  public reset(): void {
    this.prevTormentorState = null;
  }
}

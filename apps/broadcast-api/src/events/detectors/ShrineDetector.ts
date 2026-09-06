import { EventDetector } from "../EventEngine.js";
import { MatchSession } from "../../gsi/MatchSession.js";
import { CanonicalEvent, WisdomShrineEvent } from "../CanonicalEvent.js";

export class ShrineDetector implements EventDetector {
  public process(prev: any, curr: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    const events: CanonicalEvent[] = [];
    const clockTime = (curr?.map as any)?.clock_time || 0;
    const prevClockTime = (prev?.map as any)?.clock_time || 0;

    if (clockTime < prevClockTime) {
      this.reset();
    }

    const radiantShrine = (curr?.map as any)?.radiant_wisdom_shrine;
    const direShrine = (curr?.map as any)?.dire_wisdom_shrine;
    const prevRadiantShrine = (prev?.map as any)?.radiant_wisdom_shrine;
    const prevDireShrine = (prev?.map as any)?.dire_wisdom_shrine;

    // Detect Radiant Shrine Taken (true -> false)
    if (prevRadiantShrine === true && radiantShrine === false) {
      events.push({
        id: `shrine_taken_radiant_${session.matchId}_${clockTime}`,
        type: "WISDOM_SHRINE_TAKEN",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0, // State transition is deterministic
        source: "GSI_STATE_DIFF",
        team: "radiant",
      } as WisdomShrineEvent);
    }
    // Detect Radiant Shrine Respawn (false -> true)
    else if (prevRadiantShrine === false && radiantShrine === true) {
      events.push({
        id: `shrine_respawn_radiant_${session.matchId}_${clockTime}`,
        type: "WISDOM_SHRINE_RESPAWNED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: "radiant",
      } as WisdomShrineEvent);
    }

    if (prevDireShrine === true && direShrine === false) {
      events.push({
        id: `shrine_taken_dire_${session.matchId}_${clockTime}`,
        type: "WISDOM_SHRINE_TAKEN",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: "dire",
      } as WisdomShrineEvent);
    }
    // Detect Dire Shrine Respawn (false -> true)
    else if (prevDireShrine === false && direShrine === true) {
      events.push({
        id: `shrine_respawn_dire_${session.matchId}_${clockTime}`,
        type: "WISDOM_SHRINE_RESPAWNED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: "dire",
      } as WisdomShrineEvent);
    }

    return events.length > 0 ? events : null;
  }

  public reset(): void {
    // No internal state needed
  }
}

import { EventDetector } from "../EventEngine.js";
import { MatchSession } from "../../gsi/MatchSession.js";
import { CanonicalEvent, BaseEvent, MatchLifecycleEvent } from "../CanonicalEvent.js";
import { logger } from "../../logger.js";

export class MatchStateDetector implements EventDetector {
  public process(prev: any, curr: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    const events: CanonicalEvent[] = [];
    const clockTime = (curr?.map as any)?.clock_time || 0;
    
    const currGameState = (curr?.map as any)?.game_state;
    const prevGameState = (prev?.map as any)?.game_state;

    const isCurrentlyPaused = (curr?.map as any)?.paused === true;
    const wasPaused = (prev?.map as any)?.paused === true;
    
    // Check for game state changes
    if (currGameState && currGameState !== prevGameState) {
        let type: CanonicalEvent["type"] | null = null;
        
        if (currGameState === "DOTA_GAMERULES_STATE_PRE_GAME" && prevGameState !== "DOTA_GAMERULES_STATE_PRE_GAME") {
          type = "MATCH_STARTED";
          session.status = "RUNNING";
        } else if (currGameState === "DOTA_GAMERULES_STATE_POST_GAME" && prevGameState !== "DOTA_GAMERULES_STATE_POST_GAME") {
          type = "MATCH_ENDED";
          session.status = "POST_GAME";
        } else if (
          currGameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" ||
          currGameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME"
        ) {
          session.status = "DRAFTING";
        }
        
        if (type) {
          events.push({
            id: `match_state_${type}_${session.matchId}_${clockTime}`,
            type,
            matchId: session.matchId,
            gameTime: clockTime,
            receivedAt: Date.now(),
            confidence: 1.0,
            source: "GSI_STATE_DIFF"
          } as MatchLifecycleEvent);
        }

        events.push({
          id: `match_state_changed_${session.matchId}_${clockTime}_${currGameState}`,
          type: "MATCH_STATE_CHANGED",
          gameTime: clockTime,
          receivedAt: Date.now(),
          confidence: 1.0,
          source: "GSI_STATE_DIFF",
          metadata: {
            previousState: prevGameState,
            newState: currGameState
          }
        } as BaseEvent & { metadata: any });
    }

    // Check for pause transitions
    if (prev) {
      if (isCurrentlyPaused && !wasPaused) {
        session.isPaused = true;
        events.push({
          id: `match_paused_${session.matchId}_${clockTime}`,
          type: "MATCH_PAUSED",
          matchId: session.matchId,
          gameTime: clockTime,
          receivedAt: Date.now(),
          confidence: 1.0,
          source: "GSI_STATE_DIFF"
        } as MatchLifecycleEvent);
      } else if (!isCurrentlyPaused && wasPaused) {
        session.isPaused = false;
        events.push({
          id: `match_resumed_${session.matchId}_${clockTime}`,
          type: "MATCH_RESUMED",
          matchId: session.matchId,
          gameTime: clockTime,
          receivedAt: Date.now(),
          confidence: 1.0,
          source: "GSI_STATE_DIFF"
        } as MatchLifecycleEvent);
      }
    }

    return events.length > 0 ? events : null;
  }

  public reset(): void {
  }
}

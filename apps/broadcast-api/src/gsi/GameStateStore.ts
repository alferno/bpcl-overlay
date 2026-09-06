import { MatchSession } from "./MatchSession.js";
import { EventEngine } from "../events/EventEngine.js";
import { EventBus } from "../events/EventBus.js";
import { MatchLifecycleEvent } from "../events/CanonicalEvent.js";
import { logger } from "../logger.js";

export class GameStateStore {
  public previousState: Record<string, any> | null = null;
  public currentState: Record<string, any> | null = null;
  public session: MatchSession = new MatchSession(null);
  
  constructor(private eventEngine: EventEngine, private eventBus: EventBus) {}

  public processPayload(payload: Record<string, any>): void {
    if (!payload) return;

    const currentMatchId = (payload?.map as any)?.matchid;
    const isNewMatch = this.session.updateMatchId(currentMatchId);

    if (isNewMatch) {
      logger.info({ matchId: this.session.matchId }, "[GameStateStore] New match detected, resetting state");
      this.previousState = null;
      this.currentState = null;
      this.eventEngine.reset();
      
      this.eventBus.emit({
        id: `match_initialized_${this.session.matchId}_${Date.now()}`,
        type: "MATCH_INITIALIZED",
        matchId: this.session.matchId,
        gameTime: (payload?.map as any)?.clock_time || 0,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF"
      } as MatchLifecycleEvent);
    }

    // Filter out duplicate or out-of-order payloads based on clock_time or tick if needed
    // (We will let detectors handle more granular diffing)
    
    this.previousState = this.currentState;
    this.currentState = payload;

    if (this.previousState && this.currentState) {
      try {
        this.eventEngine.process(this.previousState, this.currentState, this.session);
      } catch (err) {
        logger.error(err, "[GameStateStore] EventEngine process error");
      }
    }
  }

  public getMapValue<T>(key: string): T | undefined {
    return (this.currentState?.map as any)?.[key];
  }
}

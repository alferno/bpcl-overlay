import { EventBus } from "./EventBus.js";
import { MatchSession } from "../gsi/MatchSession.js";
import { CanonicalEvent } from "./CanonicalEvent.js";

export interface EventDetector {
  /** Returns one or more emitted events if detected */
  process(previousState: any, currentState: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null;
  /** Reset internal detector state (called on new match) */
  reset(): void;
}

export class EventEngine {
  private detectors: EventDetector[] = [];

  constructor(private eventBus: EventBus) {}

  public registerDetector(detector: EventDetector): void {
    this.detectors.push(detector);
  }

  public process(previousState: any, currentState: any, session: MatchSession): void {
    for (const detector of this.detectors) {
      const result = detector.process(previousState, currentState, session);
      if (result) {
        const events = Array.isArray(result) ? result : [result];
        for (const ev of events) {
          this.eventBus.emit(ev);
        }
      }
    }
  }

  public reset(): void {
    for (const detector of this.detectors) {
      detector.reset();
    }
  }
}

import { EventEmitter } from "events";
import { CanonicalEvent, EventType } from "./CanonicalEvent.js";
import { logger } from "../logger.js";

type EventHandler<T extends CanonicalEvent> = (event: T) => void | Promise<void>;

export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase max listeners if needed
    this.emitter.setMaxListeners(50);
  }

  emit(event: CanonicalEvent): void {
    logger.debug({ eventType: event.type, eventId: event.id, gameTime: event.gameTime }, "Emitting event");
    this.emitter.emit(event.type, event);
    this.emitter.emit("*", event); // catch-all for debugging/logging
  }

  on<T extends CanonicalEvent>(eventType: EventType | "*", handler: EventHandler<T>): void {
    this.emitter.on(eventType, handler as any);
  }

  off<T extends CanonicalEvent>(eventType: EventType | "*", handler: EventHandler<T>): void {
    this.emitter.off(eventType, handler as any);
  }
}

export const globalEventBus = new EventBus();

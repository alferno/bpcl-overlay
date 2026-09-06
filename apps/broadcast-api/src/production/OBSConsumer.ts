import { EventBus } from "../events/EventBus.js";
import { ReplayManager } from "../services/replay-manager.js";
import { OBSController } from "../obs-controller.js";
import { logger } from "../logger.js";

export class OBSConsumer {
  private lastAutoReplaySaveAt = 0;

  constructor(
    private eventBus: EventBus,
    private replayManager: ReplayManager,
    private obs: OBSController
  ) {
    this.registerListeners();
  }

  private registerListeners() {
    this.eventBus.on("FIRST_BLOOD", (event) => {
      this.triggerAutoReplay(event.type, event.gameTime);
    });

    this.eventBus.on("KILL_STREAK", (event: any) => {
      if (event.metadata?.killStreak >= 3) {
        this.triggerAutoReplay(event.type, event.gameTime);
      }
    });
  }

  private triggerAutoReplay(eventType: string, gameTime: number) {
    const now = Date.now();
    if (now - this.lastAutoReplaySaveAt > 30000) {
      this.lastAutoReplaySaveAt = now;
      logger.info({ event: eventType, game_time: gameTime }, "[OBSConsumer] Triggering auto-replay save via GSI event");
      
      // Delay slightly to let the play finish before saving
      setTimeout(() => {
        this.replayManager.triggerSaveReplay(30, this.obs).catch(e => logger.error(e, "[OBSConsumer] Auto-replay save failed"));
      }, 5000);
    }
  }
}

import { EventBus } from "../events/EventBus.js";
import { StateManager } from "@bpc/state-manager";
import { logger } from "../logger.js";

export class OverlayController {
  private versusTimeout: NodeJS.Timeout | null = null;
  private gameTimeout: NodeJS.Timeout | null = null;

  constructor(
    private eventBus: EventBus,
    private state: StateManager,
    private broadcast: { broadcastFull: (envelope?: any) => Promise<void> }
  ) {
    this.registerListeners();
  }

  private registerListeners() {
    this.eventBus.on("MATCH_STATE_CHANGED", async (event: any) => {
      const { newState, previousState } = event.metadata;
      
      const patch: Record<string, any> = {};
      const current = await this.state.getState();
      const overlayVisibilityPatch: Record<string, string> = {};

      const isDraftOrStrategyTime =
        newState === "DOTA_GAMERULES_STATE_HERO_SELECTION" ||
        newState === "DOTA_GAMERULES_STATE_STRATEGY_TIME";

      if (isDraftOrStrategyTime && current.overlayVisibility?.standoutplayer === "visible") {
        overlayVisibilityPatch.standoutplayer = "hidden";
        logger.info({ newState }, "[OverlayController] Draft/Strategy time active, force-hiding Standout Player");
      }

      if (newState === "DOTA_GAMERULES_STATE_HERO_SELECTION" && previousState !== "DOTA_GAMERULES_STATE_HERO_SELECTION") {
        this.clearAutomationTimers("Draft started");
        overlayVisibilityPatch.draft = "visible";
        overlayVisibilityPatch.versus = "hidden";
        overlayVisibilityPatch.game = "hidden";
        logger.info("[OverlayController] Draft started, switching to Draft overlay");
      }

      const isEdgePreGame = previousState !== "DOTA_GAMERULES_STATE_PRE_GAME" && newState === "DOTA_GAMERULES_STATE_PRE_GAME";
      if (
        isEdgePreGame &&
        (current.overlayVisibility?.draft === "visible" || current.overlayVisibility?.versus === "visible")
      ) {
        this.clearAutomationTimers("Pre-game edge triggered");
        overlayVisibilityPatch.draft = "hidden";
        overlayVisibilityPatch.versus = "hidden";
        overlayVisibilityPatch.game = "visible";
        logger.info("[OverlayController] Pre-game started, forcing switch to Game overlay");
      }

      if (
        newState === "DOTA_GAMERULES_STATE_POST_GAME" ||
        newState === "DOTA_GAMERULES_STATE_DISCONNECT"
      ) {
        if (
          current.overlayVisibility?.game === "visible" ||
          current.overlayVisibility?.draft === "visible" ||
          current.overlayVisibility?.versus === "visible"
        ) {
          this.clearAutomationTimers("Game ended/disconnected");
          overlayVisibilityPatch.draft = "hidden";
          overlayVisibilityPatch.versus = "hidden";
          overlayVisibilityPatch.game = "hidden";
          logger.info("[OverlayController] Game ended/disconnected, hiding all overlays");
        }
      }

      if (Object.keys(overlayVisibilityPatch).length > 0) {
        patch.overlayVisibility = {
          ...(current.overlayVisibility ?? {}),
          ...overlayVisibilityPatch,
        };
        const next = await this.state.patchState(patch);
        await this.broadcast.broadcastFull(next);
      }
    });

    this.eventBus.on("DRAFT_STATE_CHANGED", async (event: any) => {
      const { newPhase, prevPhase, inDraft } = event.metadata;
      
      if (newPhase !== "done") {
        this.clearAutomationTimers("Draft resumed/state bounced");
      }

      if (prevPhase !== "done" && newPhase === "done" && inDraft) {
        this.clearAutomationTimers("Draft finished");
        logger.info("[OverlayController] Draft done, scheduling Versus in 5s and Game in 85s");
        
        this.versusTimeout = setTimeout(async () => {
          this.versusTimeout = null;
          try {
            const snap = await this.state.getState();
            await this.state.patchState({
              overlayVisibility: {
                ...(snap.overlayVisibility ?? {}),
                draft: "hidden",
                versus: "visible",
              }
            });
            this.broadcast.broadcastFull(await this.state.getState());
          } catch (e) {
            logger.error({ err: e }, "Failed to switch to Versus");
          }
        }, 5000);

        this.gameTimeout = setTimeout(async () => {
          this.gameTimeout = null;
          try {
            const snap = await this.state.getState();
            await this.state.patchState({
              overlayVisibility: {
                ...(snap.overlayVisibility ?? {}),
                versus: "hidden",
                game: "visible",
              }
            });
            this.broadcast.broadcastFull(await this.state.getState());
          } catch (e) {
            logger.error({ err: e }, "Failed to switch to Game");
          }
        }, 85000);
      }
    });
  }

  private clearAutomationTimers(reason: string) {
    let cleared = false;
    if (this.versusTimeout) {
      clearTimeout(this.versusTimeout);
      this.versusTimeout = null;
      cleared = true;
    }
    if (this.gameTimeout) {
      clearTimeout(this.gameTimeout);
      this.gameTimeout = null;
      cleared = true;
    }
    if (cleared) {
      logger.info(`[OverlayController] ${reason}, cancelled pending transition timers`);
    }
  }
}

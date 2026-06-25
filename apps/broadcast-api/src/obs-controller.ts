import OBSWebSocket, { type OBSEventTypes } from "obs-websocket-js";
import { logger } from "./logger.js";

export type OBSConnectionSettings = {
  host: string;
  port: number;
  password: string;
};

export class OBSController {
  private client = new OBSWebSocket();
  private settings: OBSConnectionSettings | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  configure(settings: OBSConnectionSettings): void {
    this.settings = settings;
  }

  /** obs-websocket-js internal flag indicates identified session */
  isConnected(): boolean {
    try {
      return Boolean((this.client as unknown as { identified?: boolean }).identified);
    } catch {
      return false;
    }
  }

  async connect(
    overrides?: OBSConnectionSettings,
  ): Promise<{ ok: boolean; error?: string }> {
    if (overrides) this.settings = overrides;
    if (!this.settings)
      return { ok: false, error: "OBS settings not configured" };

    try {
      if (this.isConnected())
        await this.client.disconnect();

      await this.client.connect(
        `ws://${this.settings.host}:${this.settings.port}`,
        this.settings.password,
      );
      logger.info("OBS websocket connected");
      return { ok: true };
    } catch (err) {
      logger.error(err, "OBS websocket connect failed");
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.isConnected())
      await this.client.disconnect().catch(() => undefined);
    logger.info("OBS websocket disconnected");
  }

  async listScenes(): Promise<string[]> {
    const data = await this.client.call("GetSceneList");
    const scenes =
      (
        data as {
          scenes?: Array<{ sceneName?: string }>;
        }
      ).scenes ?? [];
    return scenes.map((s) => s.sceneName ?? "").filter(Boolean);
  }

  async setProgramScene(
    sceneName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("SetCurrentProgramScene", { sceneName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getCurrentProgramScene(): Promise<{ ok: boolean; sceneName?: string; error?: string }> {
    try {
      const data = await this.client.call("GetCurrentProgramScene");
      return { ok: true, sceneName: data.currentProgramSceneName as string };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async setSourceVisible(input: {
    sceneName: string;
    sourceName: string;
    visible: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const list = await this.client.call("GetSceneItemList", {
        sceneName: input.sceneName,
      });
      const items =
        (
          list as {
            sceneItems?: Array<{ sceneItemId: number; sourceName?: string }>;
          }
        ).sceneItems ?? [];

      const item = items.find(
        (it) =>
          typeof it.sceneItemId === "number" &&
          it.sourceName === input.sourceName,
      );

      if (!item) return { ok: false, error: "Scene item not found" };

      await this.client.call("SetSceneItemEnabled", {
        sceneName: input.sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemEnabled: input.visible,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async triggerHotkeyByName(
    hotkeyName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("TriggerHotkeyByName", { hotkeyName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async triggerHotkeyBySequence(
    keyId: string,
    keyModifiers: { shift?: boolean; control?: boolean; alt?: boolean; command?: boolean }
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("TriggerHotkeyByKeySequence", { keyId, keyModifiers });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async setInputSettings(
    inputName: string,
    inputSettings: any,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("SetInputSettings", { inputName, inputSettings });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async restartMediaInput(
    inputName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("TriggerMediaInputAction", {
        inputName,
        mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async setCurrentScene(
    sceneName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("SetCurrentProgramScene", { sceneName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  scheduleReconnect(delayMs = 3000): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delayMs);
  }

  async saveReplayBuffer(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.call("SaveReplayBuffer");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  on<Event extends keyof OBSEventTypes>(
    event: Event,
    handler: (data: OBSEventTypes[Event]) => void
  ): void {
    this.client.on(event, handler);
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { z } from "zod";

export const SettingsSchema = z.object({
  obs: z.object({
    port: z.string().default("4455"),
    password: z.string().default("bpcls2"),
  }).default({ port: "4455", password: "bpcls2" }),
  layoutConfig: z.record(z.any()).default({
    kdaCard: { x: 1, y: 1, scale: 1.0 },
    livePlayerCard: { x: -15, y: 95, scale: 0.8 },
    minimapIcons: { x: 1, y: 280, scale: 1.0 },
  }),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

export class SettingsManager {
  private filePath: string;
  private currentSettings: AppSettings;

  constructor(filePath?: string) {
    this.filePath = filePath || env.SETTINGS_FILE;
    this.currentSettings = SettingsSchema.parse({});
  }

  async load(): Promise<AppSettings> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data);
      this.currentSettings = SettingsSchema.parse(parsed);
      logger.info({ file: this.filePath }, "Loaded settings successfully");
    } catch (err: any) {
      if (err.code === "ENOENT") {
        logger.info({ file: this.filePath }, "Settings file not found, creating with defaults");
        await this.save();
      } else {
        logger.error({ err, file: this.filePath }, "Failed to load settings file, using defaults");
      }
    }
    return this.currentSettings;
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (partial.obs) {
      this.currentSettings.obs = { ...this.currentSettings.obs, ...partial.obs };
    }
    if (partial.layoutConfig) {
      this.currentSettings.layoutConfig = { ...this.currentSettings.layoutConfig, ...partial.layoutConfig };
    }
    await this.save();
    return this.currentSettings;
  }

  getSettings(): AppSettings {
    return this.currentSettings;
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(this.currentSettings, null, 2), "utf-8");
    } catch (err) {
      logger.error({ err, file: this.filePath }, "Failed to save settings file");
    }
  }
}

// Export a singleton instance
export const settingsManager = new SettingsManager();

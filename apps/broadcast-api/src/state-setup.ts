import {
  createDefaultEnvelope,
  type OverlayPatch,
  overlayPatchSchema,
} from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import {
  createMemoryStateManager,
  createRedisStateManager,
} from "@bpc/state-manager";
import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { settingsManager } from "./services/settings-manager.js";

export async function createAppState(): Promise<StateManager> {
  const seed = createDefaultEnvelope();
  const settings = await settingsManager.load();
  if (settings.layoutConfig) {
    if (!seed.production) seed.production = {} as any;
    seed.production.layoutConfig = settings.layoutConfig as any;
  }

  if (env.STATE_BACKEND === "memory") {
    logger.info("State backend: memory");
    return createMemoryStateManager(seed);
  }

  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL required when STATE_BACKEND=redis");
  }

  try {
    const ping = new Redis(env.REDIS_URL);
    await ping.ping();
    await ping.quit();
    logger.info({ key: env.REDIS_STATE_KEY }, "State backend: redis");
    return createRedisStateManager({
      url: env.REDIS_URL,
      key: env.REDIS_STATE_KEY,
      seed,
    });
  } catch (err) {
    logger.error(err, "Redis unavailable");
    if (env.REDIS_UNAVAILABLE_FALLBACK_MEMORY) {
      logger.warn(
        "Falling back to memory state (REDIS_UNAVAILABLE_FALLBACK_MEMORY=true)",
      );
      return createMemoryStateManager(seed);
    }
    throw err;
  }
}

export function parseOverlayPatch(body: unknown): OverlayPatch {
  return overlayPatchSchema.parse(body);
}

import type { OverlayEnvelope, OverlayPatch } from "@bpc/shared-types";
import { Redis } from "ioredis";
import { applyOverlayPatch } from "./merge-patch.js";
import type { StateManager } from "./types.js";

/** Single-writer optimistic lock using WATCH/MULTI on key */
export function createRedisStateManager(options: {
  url: string;
  key: string;
  seed: OverlayEnvelope;
}): StateManager {
  const client = new Redis(options.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      return Math.min(times * 200, 2000);
    },
  });

  let initialized = false;

  async function ensureSeed() {
    if (initialized) return;
    await client.connect().catch(() => undefined);
    initialized = true;
    const raw = await client.get(options.key);
    if (!raw) {
      await client.set(options.key, JSON.stringify(options.seed));
    }
  }

  return {
    async getState(): Promise<OverlayEnvelope> {
      await ensureSeed();
      const raw = await client.get(options.key);
      if (!raw) throw new Error("Redis state missing");
      return JSON.parse(raw) as OverlayEnvelope;
    },

    async patchState(patch: OverlayPatch): Promise<OverlayEnvelope> {
      await ensureSeed();
      let attempts = 0;
      while (attempts++ < 8) {
        await client.watch(options.key);
        const raw = await client.get(options.key);
        const prev = (raw
          ? (JSON.parse(raw) as OverlayEnvelope)
          : options.seed) as OverlayEnvelope;
        const next = applyOverlayPatch(prev, patch);
        const res = await client
          .multi()
          .set(options.key, JSON.stringify(next))
          .exec();
        if (res) return next;
      }
      throw new Error("Redis optimistic lock exhaustion");
    },

    async replaceState(state: OverlayEnvelope): Promise<OverlayEnvelope> {
      await ensureSeed();
      await client.set(options.key, JSON.stringify(state));
      return structuredClone(state);
    },

    async shutdown() {
      await client.quit();
    },
  };
}

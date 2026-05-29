import type { OverlayEnvelope, OverlayPatch } from "@bpc/shared-types";
import { applyOverlayPatch } from "./merge-patch.js";
import type { StateManager } from "./types.js";

export function createMemoryStateManager(
  seed: OverlayEnvelope,
): StateManager {
  let current = structuredClone(seed);

  return {
    async getState() {
      return structuredClone(current);
    },

    async patchState(patch: OverlayPatch) {
      current = applyOverlayPatch(current, patch);
      return structuredClone(current);
    },

    async replaceState(state: OverlayEnvelope) {
      current = structuredClone(state);
      return structuredClone(current);
    },
  };
}

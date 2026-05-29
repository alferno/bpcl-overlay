export type {
  OverlayEnvelope,
  OverlayPatch,
} from "@bpc/shared-types";

export type { StateManager } from "./types.js";
export { applyOverlayPatch } from "./merge-patch.js";
export { createMemoryStateManager } from "./memory-state-manager.js";
export { createRedisStateManager } from "./redis-state-manager.js";

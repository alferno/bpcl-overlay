import type { OverlayEnvelope, OverlayPatch } from "@bpc/shared-types";

/** Authoritative overlay state store */
export interface StateManager {
  getState(): Promise<OverlayEnvelope>;
  /** Applies a partial mutation; increments seq */
  patchState(patch: OverlayPatch): Promise<OverlayEnvelope>;
  replaceState(state: OverlayEnvelope): Promise<OverlayEnvelope>;
  shutdown?(): Promise<void>;
}

import type { OverlayEnvelope, VisibilityMode } from "@bpc/shared-types";

export function visibilityActive(
  mode: VisibilityMode | undefined | null,
  now: number,
): boolean {
  if (!mode || mode === "visible") return true;
  if (mode === "hidden") return false;
  if (
    typeof mode === "object" &&
    mode.mode === "timed" &&
    typeof mode.until === "number"
  ) {
    return now < mode.until;
  }
  return true;
}

export function routeVisible(
  route: string,
  state: OverlayEnvelope | null | undefined,
  now = Date.now(),
): boolean {
  if (!state) return false;
  const vis = state.overlayVisibility as Record<string, VisibilityMode | undefined>;

  if (!visibilityActive(vis.global_kill_switch, now)) return false;
  if (vis.__all__ !== undefined && !visibilityActive(vis.__all__, now)) return false;

  return visibilityActive(vis[route], now);
}

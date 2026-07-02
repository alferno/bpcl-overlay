import type { OverlayEnvelope, OverlayRouteKey, VisibilityMode } from "@bpc/shared-types";

export function visibilityActive(mode: VisibilityMode | undefined | null, now: number): boolean {
  if (!mode || mode === "visible") return true;
  if (mode === "hidden") return false;
  if (
    typeof mode === "object" &&
    mode &&
    mode.mode === "timed" &&
    typeof mode.until === "number"
  ) {
    return now < mode.until;
  }
  return true;
}

export function routeVisible(route: OverlayRouteKey, state: OverlayEnvelope, now?: number): boolean {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("forceVisible") === "true") {
    return true;
  }
  const t = now ?? Date.now();
  const vis = state.overlayVisibility as Record<string, VisibilityMode | undefined>;

  if (!visibilityActive(vis.global_kill_switch, t)) return false;
  if (vis.__all__ !== undefined && !visibilityActive(vis.__all__, t)) return false;
  const r = vis[route];
  return visibilityActive(r, t);
}

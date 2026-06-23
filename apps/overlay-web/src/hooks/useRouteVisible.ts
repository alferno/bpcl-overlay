import { useState, useEffect } from "react";
import type { OverlayEnvelope, OverlayRouteKey } from "@bpc/shared-types";
import { routeVisible } from "../visibility";

export function useRouteVisible(route: OverlayRouteKey, state: OverlayEnvelope): boolean {
  const [visible, setVisible] = useState(() => routeVisible(route, state));

  useEffect(() => {
    // Recheck immediately on state change
    const isVis = routeVisible(route, state);
    setVisible(isVis);

    if (!isVis) return;

    // Check if the visibility setting is timed
    const mode = state.overlayVisibility?.[route];
    if (mode && typeof mode === "object" && mode.mode === "timed" && typeof mode.until === "number") {
      const delay = mode.until - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => {
          setVisible(false);
        }, delay);
        return () => clearTimeout(timer);
      } else {
        setVisible(false);
      }
    }
  }, [route, state]);

  return visible;
}

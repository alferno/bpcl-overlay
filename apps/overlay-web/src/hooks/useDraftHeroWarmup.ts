import type { DraftState } from "@bpc/shared-types";
import { useEffect } from "react";
import { ensureOverlayHeroIndex } from "../hero-portrait";

/** Warm WebMs for heroes appearing in draft bans/picks. */
export function useDraftHeroWarmup(draft: DraftState | null | undefined): void {
  useEffect(() => {
    if (!draft) return;
    void ensureOverlayHeroIndex();
  }, [draft]);
}

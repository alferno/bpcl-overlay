import type { DraftState } from "@bpc/shared-types";
import { useEffect } from "react";

import {
  ensureOverlayHeroIndex,
  getHeroIdToSlugMap,
  resolveSlotSlug,
} from "../hero-portrait";
import { warmHeroWebm } from "../hero-video-pool";

/** Warm WebMs for heroes appearing in draft bans/picks. */
export function useDraftHeroWarmup(draft: DraftState | null | undefined): void {
  const radiantSlots = draft?.radiant?.slots;
  const direSlots = draft?.dire?.slots;

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;

    void ensureOverlayHeroIndex().then(() => {
      if (cancelled) return;
      const heroIdToSlug = getHeroIdToSlugMap();
      const slugs = new Set<string>();

      for (const slot of [...(radiantSlots ?? []), ...(direSlots ?? [])]) {
        const slug = resolveSlotSlug(slot);
        if (slug) slugs.add(slug);
        else if (slot.heroId != null) {
          const fromId = heroIdToSlug.get(slot.heroId);
          if (fromId) slugs.add(fromId);
        }
      }

      for (const slug of slugs) {
        void warmHeroWebm(slug);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [draft, radiantSlots, direSlots]);
}

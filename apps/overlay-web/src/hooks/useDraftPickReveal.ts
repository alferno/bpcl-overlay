import type { LastPick } from "@bpc/shared-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { lastPickCinematicKey } from "../draft/cinematic-pick";
import {
  ensureOverlayHeroIndex,
  getHeroIdToSlugMap,
} from "../hero-portrait";
import { warmHeroWebm } from "../hero-video-pool";

/** Hero cinematic overlay visible duration (fade starts at end) */
export const DRAFT_INTRO_VISIBLE_MS = 4000;
/** Tournament stats panel duration */
export const DRAFT_STATS_VISIBLE_MS = 8000;

export function useDraftPickReveal(lastPick: LastPick | null | undefined) {
  const [introPick, setIntroPick] = useState<LastPick | null>(null);
  const [statsPick, setStatsPick] = useState<LastPick | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPickRef = useRef(lastPick);
  lastPickRef.current = lastPick;

  const heroId = lastPick?.heroId;
  const side = lastPick?.side;
  const pickKey =
    heroId != null && side != null ? `${side}-${heroId}` : null;

  // Start intro before paint so the pick card never flashes ahead of cinematic.
  useLayoutEffect(() => {
    if (!pickKey) return;
    if (activeKeyRef.current === pickKey) return;

    const pick = lastPickRef.current;
    if (!pick?.heroId) return;

    activeKeyRef.current = pickKey;
    setIntroPick(pick);
    setStatsPick(pick);

    void ensureOverlayHeroIndex().then(() => {
      const slug = getHeroIdToSlugMap().get(pick.heroId);
      if (slug) void warmHeroWebm(slug);
    });

    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    if (statsTimerRef.current) clearTimeout(statsTimerRef.current);

    introTimerRef.current = setTimeout(() => {
      setIntroPick(null);
      introTimerRef.current = null;
    }, DRAFT_INTRO_VISIBLE_MS);

    statsTimerRef.current = setTimeout(() => {
      setStatsPick(null);
      statsTimerRef.current = null;
    }, DRAFT_STATS_VISIBLE_MS);
  }, [pickKey]);

  // Enrich labels when GSI adds heroName / playerName for the same pick.
  useEffect(() => {
    if (!pickKey || activeKeyRef.current !== pickKey) return;
    const pick = lastPickRef.current;
    if (!pick?.heroId) return;

    setIntroPick((prev) =>
      prev && prev.heroId === pick.heroId ? pick : prev,
    );
    setStatsPick((prev) =>
      prev && prev.heroId === pick.heroId ? pick : prev,
    );
  }, [pickKey, lastPick?.heroName, lastPick?.playerName]);

  useEffect(
    () => () => {
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      if (statsTimerRef.current) clearTimeout(statsTimerRef.current);
    },
    [],
  );

  const pendingIntro =
    pickKey != null &&
    lastPick?.heroId != null &&
    activeKeyRef.current !== pickKey;

  const cinematicPickKey =
    introPick != null
      ? lastPickCinematicKey(introPick)
      : pendingIntro && lastPick
        ? lastPickCinematicKey(lastPick)
        : null;

  return { introPick, statsPick, cinematicPickKey };
}

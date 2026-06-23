import type { DraftState, LastPick } from "@bpc/shared-types";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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
const MAX_STATS_VISIBLE = 4;
const STATS_TICK_MS = 250;

export type StatsQueueItem = {
  key: string;
  pick: LastPick;
  statsUntil: number;
  /** Whether this item is a ban (affects display in stats panel) */
  isBan?: boolean;
};

/** Extract all filled ban hero IDs from a draft state as a set of "side-heroId" keys */
function collectFilledBanKeys(draft: DraftState | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!draft) return keys;
  for (const slot of draft.radiant?.slots ?? []) {
    if (slot.type === "ban" && slot.heroId) {
      keys.add(`radiant-ban-${slot.heroId}`);
    }
  }
  for (const slot of draft.dire?.slots ?? []) {
    if (slot.type === "ban" && slot.heroId) {
      keys.add(`dire-ban-${slot.heroId}`);
    }
  }
  return keys;
}

/** Build a LastPick-like object from a ban slot */
function banSlotToLastPick(
  draft: DraftState,
  side: "radiant" | "dire",
  heroId: number,
): LastPick {
  const slots = side === "radiant" ? draft.radiant?.slots : draft.dire?.slots;
  const slot = (slots ?? []).find(
    (s) => s.type === "ban" && s.heroId === heroId,
  );
  return {
    heroId,
    heroName: slot?.heroName ?? undefined,
    side,
    playerName: undefined,
    heroPortraitSlug: slot?.heroPortraitSlug,
  } as LastPick;
}

export function useDraftPickReveal(
  lastPick: LastPick | null | undefined,
  overlayDraftEpoch?: number,
  draft?: DraftState | null,
) {
  const [introPick, setIntroPick] = useState<LastPick | null>(null);
  const [statsQueue, setStatsQueue] = useState<StatsQueueItem[]>([]);
  const cinematicQueueRef = useRef<LastPick[]>([]);
  const seenPickKeysRef = useRef<Set<string>>(new Set());
  const seenBanKeysRef = useRef<Set<string>>(new Set());
  const introBusyRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPickRef = useRef(lastPick);
  lastPickRef.current = lastPick;

  const clearAll = useCallback(() => {
    cinematicQueueRef.current = [];
    seenPickKeysRef.current = new Set();
    seenBanKeysRef.current = new Set();
    introBusyRef.current = false;
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    introTimerRef.current = null;
    setIntroPick(null);
    setStatsQueue([]);
  }, []);

  useEffect(() => {
    clearAll();
  }, [overlayDraftEpoch, clearAll]);

  const playNextCinematic = useCallback(() => {
    if (introBusyRef.current) return;
    const next = cinematicQueueRef.current.shift();
    if (!next?.heroId) {
      if (cinematicQueueRef.current.length > 0) playNextCinematic();
      return;
    }

    introBusyRef.current = true;
    setIntroPick(next);
    void ensureOverlayHeroIndex().then(() => {
      const slug = getHeroIdToSlugMap().get(next.heroId);
      if (slug) void warmHeroWebm(slug);
    });

    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    introTimerRef.current = setTimeout(() => {
      introBusyRef.current = false;
      setIntroPick(null);
      introTimerRef.current = null;
      playNextCinematic();
    }, DRAFT_INTRO_VISIBLE_MS);
  }, []);

  // ─── Pick detection (cinematic + stats) ───
  const heroId = lastPick?.heroId;
  const side = lastPick?.side;
  const pickKey =
    heroId != null && side != null ? `${side}-${heroId}` : null;

  useLayoutEffect(() => {
    if (!pickKey) return;
    if (seenPickKeysRef.current.has(pickKey)) return;

    const pick = lastPickRef.current;
    if (!pick?.heroId) return;

    seenPickKeysRef.current.add(pickKey);
    cinematicQueueRef.current.push(pick);
    playNextCinematic();

    const statsUntil = Date.now() + DRAFT_STATS_VISIBLE_MS;
    setStatsQueue((prev) => [
      ...prev,
      { key: pickKey, pick, statsUntil },
    ]);
  }, [pickKey, playNextCinematic]);

  // ─── Ban detection (stats only, no cinematic) ───
  useEffect(() => {
    if (!draft) return;
    const currentBanKeys = collectFilledBanKeys(draft);

    for (const banKey of currentBanKeys) {
      if (seenBanKeysRef.current.has(banKey)) continue;
      seenBanKeysRef.current.add(banKey);

      // Parse "radiant-ban-123" → { side: "radiant", heroId: 123 }
      const parts = banKey.split("-");
      const banSide = parts[0] as "radiant" | "dire";
      const banHeroId = Number(parts[2]);
      if (!banHeroId) continue;

      const banPick = banSlotToLastPick(draft, banSide, banHeroId);
      const statsUntil = Date.now() + DRAFT_STATS_VISIBLE_MS;
      setStatsQueue((prev) => [
        ...prev,
        { key: banKey, pick: banPick, statsUntil, isBan: true },
      ]);
    }
  }, [draft?.radiant?.slots, draft?.dire?.slots, draft]);

  // ─── Stats queue expiry ───
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setStatsQueue((prev) => {
        const next = prev.filter((item) => item.statsUntil > now);
        return next.length === prev.length ? prev : next;
      });
    }, STATS_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
    },
    [],
  );

  const pendingIntro =
    pickKey != null &&
    lastPick?.heroId != null &&
    !seenPickKeysRef.current.has(pickKey);

  const cinematicPickKey =
    introPick != null
      ? lastPickCinematicKey(introPick)
      : pendingIntro && lastPick
        ? lastPickCinematicKey(lastPick)
        : cinematicQueueRef.current[0]
          ? lastPickCinematicKey(cinematicQueueRef.current[0])
          : null;

  const activeStats = statsQueue
    .filter((item) => item.statsUntil > Date.now())
    .slice(-MAX_STATS_VISIBLE);

  return {
    introPick,
    statsQueue: activeStats,
    cinematicPickKey,
  };
}

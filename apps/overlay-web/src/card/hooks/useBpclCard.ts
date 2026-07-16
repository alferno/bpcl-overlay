/**
 * useBpclCard — shared hook for resolving a BPCL player card from a steam32 ID.
 *
 * Usage (in any overlay page):
 *   const { cardData, member, ready } = useBpclCard(steam32, displayName);
 *
 * Returns:
 *   - cardData:  CardData ready for <Card data={cardData} />, or null if no steam32
 *   - member:    Raw BpclMember from community API (may be undefined for non-BPCL players)
 *   - ready:     true once the community API has loaded at least once
 *   - tier:      "default" | "basic" | "gold" | "holo"
 *
 * The hook re-resolves whenever steam32 or the community cache updates.
 * It does NOT render anything — it only prepares the data.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getBpclMember,
  refreshMembers,
  getMemberCount,
  subscribeBpclMembers,
} from '../api/bpclMembers';
import { buildCardData, buildFallbackCardData } from '../utils/buildCardData';
import type { CardData } from '../types/card';
import type { BpclMember } from '../api/bpclMembers';

export interface BpclCardResult {
  /** CardData ready for <Card data={cardData} />, or null if steam32 is 0/undefined */
  cardData: CardData | null;
  /** Raw member from community API — undefined if player not in BPCL community */
  member: BpclMember | undefined;
  /** Card tier: "default" | "basic" | "gold" | "holo" */
  tier: 'default' | 'basic' | 'gold' | 'holo';
  /** true once the community cache has data (may still be loading on first render) */
  ready: boolean;
}

export function useBpclCard(
  steam32: number | undefined | null,
  displayName?: string,
  avatarOverride?: string | null,
): BpclCardResult {
  const [result, setResult] = useState<BpclCardResult>(() =>
    resolve(steam32, displayName, avatarOverride),
  );

  // Re-resolve when steam32 or name changes
  useEffect(() => {
    setResult(resolve(steam32, displayName, avatarOverride));
  }, [steam32, displayName, avatarOverride]);

  // When community data loads (async), re-resolve once
  const refresh = useCallback(() => {
    setResult(resolve(steam32, displayName, avatarOverride));
  }, [steam32, displayName, avatarOverride]);

  useEffect(() => subscribeBpclMembers(refresh), [refresh]);

  useEffect(() => {
    // If we already have data, no need to wait
    if (getMemberCount() > 0 || !steam32 || steam32 <= 0) return;

    // Not loaded yet — wait for first fetch and refresh
    let cancelled = false;
    refreshMembers().then(() => {
      if (!cancelled) refresh();
    });
    return () => { cancelled = true; };
  }, [steam32, refresh]);

  return result;
}

function resolve(
  steam32: number | undefined | null,
  displayName?: string,
  avatarOverride?: string | null,
): BpclCardResult {
  const ready = getMemberCount() > 0;

  if (!steam32 || steam32 <= 0) {
    return { cardData: null, member: undefined, tier: 'default', ready };
  }

  const member = getBpclMember(steam32);
  const tier = member?.cardTier ?? 'default';
  const cardData = member
    ? buildCardData(member, displayName ?? 'Player', avatarOverride ?? null)
    : buildFallbackCardData(displayName ?? 'Player', avatarOverride ?? null);

  return { cardData, member, tier, ready };
}

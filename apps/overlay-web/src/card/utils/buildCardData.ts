/**
 * buildCardData — maps a BPCL community member + live player context → CardData
 *
 * Card tier comes directly from `players[].cardTier` in the API.
 * Stats come from `players[].card.cardPayload.stats` and are normalized on fetch.
 * Avatar comes from `players[].avatarUrl`.
 */

import type { CardData } from '../types/card';
import type { BpclMember } from '../api/bpclMembers';

/**
 * Build a `CardData` object ready for the `<Card>` component.
 *
 * @param member  - The BpclMember from the community API (may be undefined for fallback)
 * @param name    - Display name to show on the card (from roster or live GSI)
 * @param avatar  - Optional avatar URL override (e.g. from Steam if API has none)
 */
export function buildCardData(
  member: BpclMember | undefined,
  name: string,
  avatarOverride?: string | null,
): CardData {
  // Tier from API or fallback
  const tier: string = member?.cardTier ?? 'default';

  // Stats from API card field
  const stats = member?.card?.stats?.length
    ? member.card.stats.map((s) => ({
        id: s.id,
        label: s.label,
        value: s.value,
      }))
    : [];

  // Avatar: prefer API, then override, then null
  const avatar: string | null = member?.avatarUrl || avatarOverride || null;

  return {
    id: member ? `bpcl-${member.steam32Id}` : 'bpcl-unknown',
    name: name || 'Player',
    theme: tier,
    avatar,
    avatarFit: 'cover',
    avatarPosition: '50% 30%',
    badge: tier !== 'default' ? tier.charAt(0).toUpperCase() + tier.slice(1) : undefined,
    stats,
    visible: true,
  };
}

/**
 * Fallback card when steam32 is not in the community list (no bpcId match).
 */
export function buildFallbackCardData(name: string, avatarUrl?: string | null): CardData {
  return {
    id: 'bpcl-fallback',
    name: name || 'Player',
    theme: 'default',
    avatar: avatarUrl ?? null,
    avatarFit: 'cover',
    avatarPosition: '50% 30%',
    stats: [],
    visible: true,
  };
}

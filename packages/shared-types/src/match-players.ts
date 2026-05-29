import type { LeagueConfig, MatchSetup } from "@bpc/shared-types";

/** steam32 assigned in admin for a CM pick slot (0–4), or null if unset. */
export function manualPickSteam32(
  matchSetup: MatchSetup | null | undefined,
  side: "radiant" | "dire",
  slotOrder: number,
): number | null | undefined {
  const slots =
    side === "radiant"
      ? matchSetup?.pickPlayers?.radiant
      : matchSetup?.pickPlayers?.dire;
  if (!slots || slotOrder < 0 || slotOrder >= slots.length) return undefined;
  return slots[slotOrder] ?? null;
}

/** Roster displayName for a manually assigned pick slot. */
export function manualPickDisplayName(
  leagueConfig: LeagueConfig | null | undefined,
  side: "radiant" | "dire",
  slotOrder: number,
): string | undefined {
  const steam32 = manualPickSteam32(leagueConfig?.matchSetup, side, slotOrder);
  if (steam32 == null || !leagueConfig?.roster?.length) return undefined;
  return leagueConfig.roster.find((p) => p.steam32 === steam32)?.displayName;
}

/** Find pick slot order for a hero on a team side (for GSI last-pick stats). */
export function pickSlotOrderForHero(
  side: "radiant" | "dire",
  heroId: number,
  slots: Array<{ type?: string; order?: number; heroId?: number | null }> | undefined,
): number | undefined {
  const pick = slots?.find(
    (s) => s.type === "pick" && s.heroId === heroId,
  );
  return pick?.order;
}

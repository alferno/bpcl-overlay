import type {
  DraftState,
  LastPick,
  LeagueConfig,
  PlayerHeroLeagueStats,
} from "@bpc/shared-types";
import {
  manualPickDisplayName,
  manualPickSteam32,
  pickSlotOrderForHero,
} from "@bpc/shared-types";

export function resolvePickSide(
  pick: LastPick,
): "radiant" | "dire" {
  return pick.side === "dire" || pick.side === "B" ? "dire" : "radiant";
}

export function resolvePickPlayerContext(
  pick: LastPick,
  draft: DraftState | null | undefined,
  leagueConfig: LeagueConfig | undefined,
  playerHeroIndex: Record<string, PlayerHeroLeagueStats> | undefined,
): {
  side: "radiant" | "dire";
  slotOrder?: number;
  steam32?: number | null;
  playerName?: string;
  playerHeroStats?: PlayerHeroLeagueStats;
} {
  const side = resolvePickSide(pick);
  const teamSlots =
    side === "radiant" ? draft?.radiant?.slots : draft?.dire?.slots;
  const slotOrder = pickSlotOrderForHero(side, pick.heroId, teamSlots);
  const steam32 =
    slotOrder !== undefined
      ? manualPickSteam32(leagueConfig?.matchSetup, side, slotOrder)
      : undefined;
  const playerName =
    slotOrder !== undefined
      ? manualPickDisplayName(leagueConfig, side, slotOrder)
      : undefined;

  const playerHeroStats =
    steam32 != null && steam32 > 0
      ? playerHeroIndex?.[`${steam32}:${pick.heroId}`]
      : undefined;

  return { side, slotOrder, steam32, playerName, playerHeroStats };
}

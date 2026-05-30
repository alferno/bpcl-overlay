import type {
  DraftState,
  LastPick,
  LeagueConfig,
  PlayerHeroLeagueStats,
  ProductionSettings,
} from "@bpc/shared-types";
import {
  manualPickDisplayName,
  manualPickSteam32,
  pickSlotOrderForHero,
} from "@bpc/shared-types";

import { countPlayerLeagueGames } from "./player-league-games";

export function isPlayerMappingPublished(
  production?: ProductionSettings | null,
): boolean {
  return Boolean(production?.playerMappingPublished);
}

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
  production?: ProductionSettings | null,
) {
  const side = resolvePickSide(pick);
  const slotOrder = pickSlotOrderForHero(
    side,
    pick.heroId,
    side === "radiant" ? draft?.radiant?.slots : draft?.dire?.slots,
  );

  if (!isPlayerMappingPublished(production)) {
    return { side, slotOrder, steam32: undefined, playerName: undefined };
  }

  const steam32 =
    slotOrder !== undefined
      ? manualPickSteam32(leagueConfig?.matchSetup, side, slotOrder)
      : undefined;
  const playerName =
    slotOrder !== undefined
      ? manualPickDisplayName(leagueConfig, side, slotOrder)
      : undefined;

  const avatarUrl =
    steam32 != null && steam32 > 0
      ? leagueConfig?.roster?.find((p) => p.steam32 === steam32)?.avatarUrl
      : undefined;

  const playerHeroStats =
    steam32 != null && steam32 > 0
      ? playerHeroIndex?.[`${steam32}:${pick.heroId}`]
      : undefined;

  const playerLeagueGames =
    steam32 != null && steam32 > 0
      ? countPlayerLeagueGames(playerHeroIndex, steam32)
      : 0;

  return {
    side,
    slotOrder,
    steam32,
    playerName,
    avatarUrl,
    playerHeroStats,
    playerLeagueGames,
  };
}

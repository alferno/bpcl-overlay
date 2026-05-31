import { summarizePlayerLeagueFromIndex } from "@bpc/shared-types";

/** Total league games across all heroes for one steam32 (from playerHeroIndex). */
export function countPlayerLeagueGames(
  index: Parameters<typeof summarizePlayerLeagueFromIndex>[0],
  steam32: number,
): number {
  return summarizePlayerLeagueFromIndex(index, steam32).games;
}

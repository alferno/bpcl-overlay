import type { PlayerHeroLeagueStats } from "@bpc/shared-types";

/** Total league games across all heroes for one steam32 (from playerHeroIndex). */
export function countPlayerLeagueGames(
  index: Record<string, PlayerHeroLeagueStats> | undefined,
  steam32: number,
): number {
  if (!index || steam32 <= 0) return 0;
  const prefix = `${steam32}:`;
  let total = 0;
  for (const [key, row] of Object.entries(index)) {
    if (key.startsWith(prefix) && row.games > 0) total += row.games;
  }
  return total;
}

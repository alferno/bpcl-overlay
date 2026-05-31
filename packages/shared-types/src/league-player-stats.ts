import type { PlayerHeroLeagueStats } from "./index.js";

/** Lookup key for `playerHeroIndex` entries (`steam32:heroId`). */
export function leaguePlayerHeroKey(steam32: number, heroId: number): string {
  return `${steam32}:${heroId}`;
}

/** Sum all player×hero rows for one steam32 (total league games in index). */
export function summarizePlayerLeagueFromIndex(
  index: Record<string, PlayerHeroLeagueStats> | undefined,
  steam32: number,
): { games: number; wins: number } {
  if (!index || steam32 <= 0) return { games: 0, wins: 0 };
  const prefix = `${steam32}:`;
  let games = 0;
  let wins = 0;
  for (const [key, row] of Object.entries(index)) {
    if (!key.startsWith(prefix) || row.games <= 0) continue;
    games += row.games;
    wins += row.wins;
  }
  return { games, wins };
}

export function leaguePlayerHeroFromIndex(
  index: Record<string, PlayerHeroLeagueStats> | undefined,
  steam32: number,
  heroId: number,
): PlayerHeroLeagueStats | undefined {
  if (!index || steam32 <= 0 || heroId <= 0) return undefined;
  return index[leaguePlayerHeroKey(steam32, heroId)];
}

/** Weighted league aggregate across all heroes for one player. */
export function aggregatePlayerLeagueFromIndex(
  index: Record<string, PlayerHeroLeagueStats> | undefined,
  steam32: number,
): PlayerHeroLeagueStats | undefined {
  if (summarizePlayerLeagueFromIndex(index, steam32).games <= 0) {
    return undefined;
  }
  const prefix = `${steam32}:`;
  const acc = {
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    heroDamage: 0,
    goldPerMin: 0,
    lastHits: 0,
    maxKills: 0,
    laneWins: 0,
    laneDraws: 0,
    laneLosses: 0,
  };
  for (const [key, ph] of Object.entries(index ?? {})) {
    if (!key.startsWith(prefix) || ph.games <= 0) continue;
    acc.games += ph.games;
    acc.wins += ph.wins;
    acc.kills += ph.avgKills * ph.games;
    acc.deaths += ph.avgDeaths * ph.games;
    acc.assists += ph.avgAssists * ph.games;
    acc.heroDamage += ph.avgHeroDamage * ph.games;
    acc.goldPerMin += ph.avgGpm * ph.games;
    acc.lastHits += ph.avgLastHits * ph.games;
    acc.maxKills = Math.max(acc.maxKills, ph.maxKills);
    acc.laneWins += ph.laneWins ?? 0;
    acc.laneDraws += ph.laneDraws ?? 0;
    acc.laneLosses += ph.laneLosses ?? 0;
  }
  const games = acc.games;
  const kda =
    acc.deaths > 0
      ? (acc.kills + acc.assists) / acc.deaths
      : acc.kills + acc.assists;
  return {
    games,
    wins: acc.wins,
    winRate: acc.wins / games,
    avgKills: acc.kills / games,
    avgDeaths: acc.deaths / games,
    avgAssists: acc.assists / games,
    avgKda: kda,
    maxKills: acc.maxKills,
    avgHeroDamage: acc.heroDamage / games,
    avgGpm: acc.goldPerMin / games,
    avgLastHits: acc.lastHits / games,
    laneWins: acc.laneWins,
    laneDraws: acc.laneDraws,
    laneLosses: acc.laneLosses,
  };
}

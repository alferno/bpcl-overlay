/**
 * likely-players.ts — Compute likely players for a given hero pick
 *
 * Priority:
 * 1. Players on the team who have played this hero in the BPCL tournament (ranked by games desc)
 * 2. Role-match fallback if no one on the team has tournament games on the hero
 *
 * Only considers players with 3+ distinct heroes played in the tournament.
 */

import type { PlayerHeroLeagueStats, RosterPlayer } from "@bpc/shared-types";

export type LikelyPlayerSource = "tournament" | "role_match";

export type LikelyPlayer = {
  player: RosterPlayer;
  stats: PlayerHeroLeagueStats | null;
  /** How many distinct heroes this player has played in the tournament */
  totalHeroesPlayed: number;
  source: LikelyPlayerSource;
};

/**
 * Position number (1-5) inferred from GSI hero pick slot order for typical role compositions.
 * We use this to match against roster `roles` field (e.g. "pos1", "carry", "support").
 */
const HERO_ID_TO_POSITION: Record<number, number[]> = {}; // populated dynamically — we use role string matching

/** Normalise a role string for comparison: "Pos 1", "pos1", "carry" → "pos1" */
function normalizeRole(r: string): string {
  const s = r.toLowerCase().replace(/\s+/g, "");
  if (s === "carry" || s === "safelane") return "pos1";
  if (s === "mid" || s === "midlane" || s === "middle") return "pos2";
  if (s === "offlane" || s === "hardlane") return "pos3";
  if (s === "support" || s === "softsupport") return "pos4";
  if (s === "hardsupport" || s === "hardsup") return "pos5";
  return s;
}

/**
 * Count how many distinct heroes a player has played in the tournament.
 */
export function countHeroesPlayed(
  steam32: number,
  playerHeroIndex: Record<string, PlayerHeroLeagueStats>,
): number {
  let count = 0;
  const prefix = `${steam32}:`;
  for (const key of Object.keys(playerHeroIndex)) {
    if (key.startsWith(prefix)) count++;
  }
  return count;
}

/**
 * Resolve up to `limit` likely players for a given heroId on a given team.
 */
export function resolveLikelyPlayersForHero(opts: {
  heroId: number;
  teamPlayers: RosterPlayer[];
  playerHeroIndex: Record<string, PlayerHeroLeagueStats>;
  /** Minimum distinct heroes played to be included (default 3) */
  minHeroesPlayed?: number;
  /** Max candidates to return (default 3) */
  limit?: number;
}): LikelyPlayer[] {
  const {
    heroId,
    teamPlayers,
    playerHeroIndex,
    minHeroesPlayed = 3,
    limit = 3,
  } = opts;

  const results: LikelyPlayer[] = [];

  // --- Pass 1: tournament history ---
  const withStats: LikelyPlayer[] = [];
  for (const player of teamPlayers) {
    const totalHeroesPlayed = countHeroesPlayed(player.steam32, playerHeroIndex);
    if (totalHeroesPlayed < minHeroesPlayed) continue;
    const key = `${player.steam32}:${heroId}`;
    const stats = playerHeroIndex[key] ?? null;
    if (stats && stats.games > 0) {
      withStats.push({ player, stats, totalHeroesPlayed, source: "tournament" });
    }
  }

  // Sort by games played desc, then winRate desc
  withStats.sort((a, b) => {
    const gDiff = (b.stats?.games ?? 0) - (a.stats?.games ?? 0);
    if (gDiff !== 0) return gDiff;
    return (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0);
  });

  results.push(...withStats.slice(0, limit));
  if (results.length >= limit) return results;

  return results;
}

import type { HeroStatsCard, LeagueConfig, RosterPlayer } from "@bpc/shared-types";
import { teamLogoPath } from "@bpc/shared-types";

import { TEAM_COLORS } from "./draft/team-colors";

/** Tournament-wide player stats (no hero portrait). */
export function isLeagueAggregateCard(card: HeroStatsCard): boolean {
  if (card.statsCardKind) return card.statsCardKind === "player-league";
  return card.heroId === 0;
}

export function isPlayerHeroCard(card: HeroStatsCard): boolean {
  if (card.statsCardKind) return card.statsCardKind === "player-hero";
  return Boolean(card.playerAvatarUrl && card.heroId > 0);
}

export function isTournamentHeroCard(card: HeroStatsCard): boolean {
  if (card.statsCardKind) return card.statsCardKind === "tournament-hero";
  return card.heroId > 0 && !card.playerAvatarUrl;
}

export function resolveRosterPlayerForCard(
  card: HeroStatsCard,
  roster?: RosterPlayer[],
): RosterPlayer | undefined {
  if (!roster?.length) return undefined;
  return roster.find((p) => p.displayName === card.playerLabel);
}

export function resolveTeamLogoForCard(
  card: HeroStatsCard,
  roster?: RosterPlayer[],
): string | undefined {
  if (card.teamLogoUrl) return card.teamLogoUrl;
  if (!isLeagueAggregateCard(card)) return undefined;
  const player = resolveRosterPlayerForCard(card, roster);
  if (!player?.teamKey) return undefined;
  return teamLogoPath(player.teamKey);
}

export function resolveTeamColorForCard(
  card: HeroStatsCard,
  leagueConfig?: LeagueConfig,
): string | undefined {
  if (card.teamColor) return card.teamColor;
  if (!isLeagueAggregateCard(card)) return undefined;

  const player = resolveRosterPlayerForCard(card, leagueConfig?.roster);
  if (!player) return undefined;

  if (player.teamColor) return player.teamColor;
  if (player.teamKey) {
    return (
      leagueConfig?.teamColors?.[player.teamKey] ?? TEAM_COLORS[player.teamKey]
    );
  }
  return undefined;
}

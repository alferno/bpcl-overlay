import type { HeroStatsCard } from "@bpc/shared-types";
import { useEffect, useState } from "react";

import { useOverlayState } from "../OverlaySocketLayer";
import {
  isLeagueAggregateCard,
  isPlayerHeroCard,
  isTournamentHeroCard,
  resolveTeamColorForCard,
} from "../hero-stats-card";
import {
  ensureOverlayHeroIndex,
  heroPortraitHintsFromFields,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import {
  leagueTeamHeaderLabelStyle,
  leagueTeamSubtitleStyle,
  leagueTeamTitleStyle,
} from "../stats-panel-theme";
import { HeroPortrait } from "./HeroPortrait";
import { PlayerAvatar } from "./PlayerAvatar";
import { StatTile } from "./StatTile";

export function HeroStatsCardPanel({ card }: { card: HeroStatsCard }) {
  const { state } = useOverlayState();
  const slides = card.statSlides ?? [];
  const leagueAggregate = isLeagueAggregateCard(card);
  const playerHero = isPlayerHeroCard(card);
  const tournamentHero = isTournamentHeroCard(card);
  const teamColor = leagueAggregate
    ? resolveTeamColorForCard(card, state.leagueConfig)
    : undefined;

  const portraitHints = heroPortraitHintsFromFields(card);

  const [portraitUrl, setPortraitUrl] = useState<string | undefined>(() =>
    leagueAggregate
      ? undefined
      : resolveOverlayPortraitForHero(card.heroId, card.heroName, portraitHints),
  );

  useEffect(() => {
    if (leagueAggregate) return;
    const resolve = () =>
      resolveOverlayPortraitForHero(card.heroId, card.heroName, portraitHints);
    setPortraitUrl(resolve());
    void ensureOverlayHeroIndex().then(() => setPortraitUrl(resolve()));
  }, [
    card.heroId,
    card.heroName,
    card.heroPortraitSlug,
    card.heroPortraitUrl,
    leagueAggregate,
  ]);

  const showPlayerAvatar = leagueAggregate || playerHero;
  const showHeroPortrait = playerHero || tournamentHero;

  const headerLabel = tournamentHero
    ? "Tournament hero"
    : showPlayerAvatar
      ? "Player spotlight"
      : "Tournament hero";

  const mainTitle = tournamentHero
    ? (card.heroName ?? card.playerLabel)
    : card.playerLabel;

  const subtitle =
    tournamentHero ? null : (card.heroName ?? `#${card.heroId}`);

  const labelClass = leagueAggregate
    ? "text-xs uppercase tracking-[0.35em]"
    : "text-xs uppercase tracking-[0.35em] text-purple-300";
  const subtitleClass = leagueAggregate
    ? "text-xl font-semibold"
    : "text-xl font-semibold text-purple-100";

  return (
    <div className="relative flex items-center gap-5">
      {showPlayerAvatar ? (
        <PlayerAvatar
          url={card.playerAvatarUrl}
          name={card.playerLabel}
          size={leagueAggregate ? 96 : 88}
          neonColor={teamColor}
        />
      ) : null}
      {showHeroPortrait ? (
        <HeroPortrait
          url={portraitUrl}
          heroName={card.heroName}
          size={playerHero ? 112 : 128}
        />
      ) : null}
      <div
        className={`relative ${leagueAggregate ? "min-w-[360px] max-w-[440px]" : "min-w-[340px] max-w-[400px]"}`}
      >
        <p
          className={labelClass}
          style={
            teamColor ? leagueTeamHeaderLabelStyle(teamColor) : undefined
          }
        >
          {headerLabel}
        </p>
        <p
          className="mt-1 text-2xl font-black text-white"
          style={teamColor ? leagueTeamTitleStyle(teamColor) : undefined}
        >
          {mainTitle}
        </p>
        {subtitle ? (
          <p
            className={subtitleClass}
            style={teamColor ? leagueTeamSubtitleStyle(teamColor) : undefined}
          >
            {subtitle}
          </p>
        ) : null}

        {slides.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {slides.map((slide) => (
              <StatTile
                key={slide.label}
                slide={slide}
                accentColor={teamColor}
                leagueReadable={Boolean(teamColor)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

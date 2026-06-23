import type {
  DraftState,
  LastPick,
  LeagueConfig,
  PlayerHeroLeagueStats,
  ProductionSettings,
  TournamentHeroAggregate,
} from "@bpc/shared-types";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { resolvePickPlayerContext } from "../../draft/resolve-pick-player";
import { findPickSlotForLastPick } from "../../draft/slot-utils";
import { HeroPortrait } from "../HeroPortrait";
import { PlayerAvatar } from "../PlayerAvatar";
import { StatTile } from "../StatTile";
import {
  ensureOverlayHeroIndex,
  resolvePickStatsPortrait,
} from "../../hero-portrait";
import { STATS_PANEL_SHELL_CLASS } from "../../overlay-layout";
import {
  buildDraftPlayerHeroSlides,
  buildDraftTournamentHeroSlides,
  buildDraftBanHeroSlides,
} from "../../player-hero-slides";

export function DraftPickStatsPanel({
  pick,
  draft,
  leagueConfig,
  tournamentStats,
  playerHeroIndex,
  production,
  stacked = false,
  isBan = false,
}: {
  pick: LastPick;
  draft?: DraftState | null;
  leagueConfig?: LeagueConfig;
  tournamentStats?: TournamentHeroAggregate;
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>;
  production?: ProductionSettings | null;
  /** Inside DraftPickStatsStack — no absolute positioning */
  stacked?: boolean;
  /** Whether this is a ban (affects header label and accent) */
  isBan?: boolean;
}) {
  const heroName =
    pick.heroName ?? tournamentStats?.heroName ?? `#${pick.heroId}`;
  const pickSlot = useMemo(
    () => findPickSlotForLastPick(draft, pick),
    [draft, pick],
  );
  const [portraitUrl, setPortraitUrl] = useState<string | undefined>(() =>
    resolvePickStatsPortrait(pick, pickSlot, tournamentStats),
  );

  useEffect(() => {
    setPortraitUrl(resolvePickStatsPortrait(pick, pickSlot, tournamentStats));
    void ensureOverlayHeroIndex().then(() => {
      setPortraitUrl(resolvePickStatsPortrait(pick, pickSlot, tournamentStats));
    });
  }, [
    pick.heroId,
    pick.heroName,
    pick.side,
    pickSlot,
    tournamentStats?.heroName,
  ]);

  const { playerName, playerHeroStats, steam32, playerLeagueGames, avatarUrl } =
    resolvePickPlayerContext(
    pick,
    draft,
    leagueConfig,
    playerHeroIndex,
    production,
  );

  const showingPlayer = Boolean(
    playerName && steam32 != null && steam32 > 0,
  );

  const slides = isBan
    ? buildDraftBanHeroSlides(tournamentStats)
    : showingPlayer
      ? buildDraftPlayerHeroSlides(
          playerName!,
          heroName,
          playerHeroStats,
          tournamentStats,
          playerLeagueGames,
        )
      : buildDraftTournamentHeroSlides(tournamentStats);

  const headerLabel = isBan
    ? "Banned hero"
    : showingPlayer
      ? "Player spotlight"
      : "Tournament hero";
  const titleLabel = showingPlayer ? playerName! : heroName;
  const subtitleLabel = showingPlayer ? heroName : undefined;
  const headerAccentClass = isBan ? "text-red-400" : "text-purple-300";

  return (
    <motion.div
      className={
        stacked
          ? "pointer-events-none w-full max-w-[440px]"
          : "pointer-events-none absolute right-8 top-8 z-[55]"
      }
      initial={{ opacity: 0, x: 24, y: -8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 16, y: -4 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={STATS_PANEL_SHELL_CLASS}>
        <div className="flex items-center gap-5">
          {showingPlayer ? (
            <PlayerAvatar url={avatarUrl} name={playerName} size={88} />
          ) : null}
          <HeroPortrait url={portraitUrl} heroName={heroName} size={112} />
          <div className="min-w-[280px] max-w-[360px]">
            <p className={`text-xs uppercase tracking-[0.35em] ${headerAccentClass}`}>
              {headerLabel}
            </p>
            <p className="mt-1 text-2xl font-black text-white">{titleLabel}</p>
            {subtitleLabel ? (
              <p className="text-xl font-semibold text-purple-100">
                {subtitleLabel}
              </p>
            ) : null}

            {slides.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {slides.map((slide) => (
                  <StatTile key={slide.label} slide={slide} />
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-neutral-400">
                No tournament data for this hero yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

import type {
  DraftState,
  LastPick,
  LeagueConfig,
  PlayerHeroLeagueStats,
  TournamentHeroAggregate,
} from "@bpc/shared-types";
import { motion } from "framer-motion";

import { resolvePickPlayerContext } from "../../draft/resolve-pick-player";
import { HeroPortrait } from "../HeroPortrait";
import { StatTile } from "../StatTile";
import { resolveSlotFlatPortraitUrl } from "../../hero-portrait";
import { STATS_PANEL_SHELL_CLASS } from "../../overlay-layout";
import {
  buildDraftPlayerHeroSlides,
  buildDraftTournamentHeroSlides,
} from "../../player-hero-slides";

export function DraftPickStatsPanel({
  pick,
  draft,
  leagueConfig,
  tournamentStats,
  playerHeroIndex,
}: {
  pick: LastPick;
  draft?: DraftState | null;
  leagueConfig?: LeagueConfig;
  tournamentStats?: TournamentHeroAggregate;
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>;
}) {
  const heroName =
    pick.heroName ?? tournamentStats?.heroName ?? `#${pick.heroId}`;
  const portraitUrl = resolveSlotFlatPortraitUrl({
    order: 0,
    type: "pick",
    heroId: pick.heroId,
    heroName: pick.heroName,
  });

  const { playerName, playerHeroStats, steam32 } = resolvePickPlayerContext(
    pick,
    draft,
    leagueConfig,
    playerHeroIndex,
  );

  const showingPlayer = Boolean(
    playerName && steam32 != null && steam32 > 0,
  );

  const slides = showingPlayer
    ? buildDraftPlayerHeroSlides(
        playerName!,
        heroName,
        playerHeroStats,
        tournamentStats,
      )
    : buildDraftTournamentHeroSlides(tournamentStats);

  const headerLabel = showingPlayer ? "Player spotlight" : "Tournament hero";
  const titleLabel = showingPlayer ? playerName! : heroName;
  const subtitleLabel = showingPlayer ? heroName : undefined;

  return (
    <motion.div
      className="pointer-events-none absolute right-8 top-8 z-[55]"
      initial={{ opacity: 0, x: 24, y: -8 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 16, y: -4 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={STATS_PANEL_SHELL_CLASS}>
        <div className="flex items-center gap-6">
          <HeroPortrait url={portraitUrl} heroName={heroName} size={128} />
          <div className="min-w-[300px] max-w-[360px]">
            <p className="text-xs uppercase tracking-[0.35em] text-purple-300">
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

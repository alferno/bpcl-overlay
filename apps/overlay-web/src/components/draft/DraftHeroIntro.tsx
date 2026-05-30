import type {
  DraftState,
  LastPick,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";
import { motion } from "framer-motion";
import { useEffect, useState, type CSSProperties } from "react";

import {
  heroCardInnerGlow,
  neonSlotShadow,
  neonTextShadow,
} from "../../draft/neon-effects";
import {
  ensureOverlayHeroIndex,
  resolveOverlayPortraitForHero,
} from "../../hero-portrait";
import { findPickSlotForLastPick } from "../../draft/slot-utils";
import { colorAlpha, resolveDraftTeamColors } from "../../draft/team-colors";
import { resolvePickPlayerContext } from "../../draft/resolve-pick-player";

function resolveSideLogo(
  draft: DraftState,
  side: LastPick["side"],
): string | undefined {
  const isRadiant = side === "radiant" || side === "A";
  return isRadiant
    ? (draft.radiant?.logoUrl ?? draft.series.logoUrlA)
    : (draft.dire?.logoUrl ?? draft.series.logoUrlB);
}

function resolveSideName(
  draft: DraftState,
  side: LastPick["side"],
): string {
  const isRadiant = side === "radiant" || side === "A";
  return isRadiant
    ? (draft.radiant?.name ?? draft.series.teamA)
    : (draft.dire?.name ?? draft.series.teamB);
}

function introCardFrameStyle(accent: string): CSSProperties {
  const a = (n: number) => colorAlpha(accent, n);
  return {
    border: `1px solid ${a(0.75)}`,
    boxShadow: [
      neonSlotShadow(accent, true),
      `inset 0 0 32px ${a(0.2)}`,
      `0 0 28px ${a(0.38)}`,
      `0 24px 64px rgb(0 0 0 / 0.65)`,
    ].join(", "),
  };
}

export function DraftHeroIntro({
  draft,
  pick,
  leagueConfig,
  production,
}: {
  draft: DraftState;
  pick: LastPick;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
}) {
  const teamColors = resolveDraftTeamColors(draft, leagueConfig);
  const isRadiant = pick.side === "radiant" || pick.side === "A";
  const accent = isRadiant ? teamColors.radiant : teamColors.dire;
  const logo = resolveSideLogo(draft, pick.side);
  const teamName = resolveSideName(draft, pick.side);

  const { playerName } = resolvePickPlayerContext(
    pick,
    draft,
    leagueConfig,
    undefined,
    production,
  );

  const pickSlot = findPickSlotForLastPick(draft, pick);
  const [portraitUrl, setPortraitUrl] = useState<string | undefined>(() =>
    resolveOverlayPortraitForHero(pick.heroId, pick.heroName, {
      heroPortraitSlug: pick.heroPortraitSlug ?? pickSlot?.heroPortraitSlug,
      heroPortraitUrl: pickSlot?.heroPortraitUrl,
      heroPortraitAnimatedUrl: pickSlot?.heroPortraitAnimatedUrl,
    }),
  );

  useEffect(() => {
    const resolve = () =>
      resolveOverlayPortraitForHero(pick.heroId, pick.heroName, {
        heroPortraitSlug: pick.heroPortraitSlug ?? pickSlot?.heroPortraitSlug,
        heroPortraitUrl: pickSlot?.heroPortraitUrl,
        heroPortraitAnimatedUrl: pickSlot?.heroPortraitAnimatedUrl,
      });
    setPortraitUrl(resolve());
    void ensureOverlayHeroIndex().then(() => setPortraitUrl(resolve()));
  }, [
    pick.heroId,
    pick.heroName,
    pick.heroPortraitSlug,
    pick.side,
    pickSlot?.heroPortraitSlug,
    pickSlot?.heroPortraitUrl,
    pickSlot?.heroPortraitAnimatedUrl,
  ]);

  return (
    <motion.div
      className="relative flex shrink-0 flex-col items-center"
      initial={{ scale: 0.88, y: 32, opacity: 0, filter: "blur(6px)" }}
      animate={{ scale: 1, y: 0, opacity: 1, filter: "blur(0px)" }}
      exit={{ scale: 0.94, y: -16, opacity: 0, filter: "blur(4px)" }}
      transition={{
        duration: 0.6,
        delay: 0.2,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
        <div className="mb-5 flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-10 w-10 object-contain opacity-90" />
          ) : null}
          <p
            className="font-heading text-sm font-bold uppercase tracking-[0.24em]"
            style={{ color: accent }}
          >
            {teamName}
          </p>
        </div>

        <div
          className="draft-pick-card draft-pick-card--filled relative h-[340px] w-[280px] overflow-hidden rounded-xl"
          style={introCardFrameStyle(accent)}
        >
          <div className="pointer-events-none absolute inset-0 bg-black" />
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{ background: heroCardInnerGlow(accent, true) }}
          />
          {portraitUrl ? (
            <div
              className="draft-hero-contained-stage pointer-events-none absolute inset-0 z-[2] overflow-hidden"
              style={{ ["--hero-glow" as string]: colorAlpha(accent, 0.5) }}
            >
              <div className="draft-hero-contained-fig">
                <img
                  src={portraitUrl}
                  alt={pick.heroName ?? "hero"}
                  className="draft-hero-portrait h-full w-full max-w-none object-cover object-[center_18%]"
                />
              </div>
            </div>
          ) : null}
          <div className="draft-hero-card-vignette pointer-events-none absolute inset-0 z-[3]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-2/5 bg-gradient-to-t from-black via-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-[5] px-4 pb-5 pt-8 text-center">
            <p
              className="font-display text-4xl tracking-wide text-white"
              style={{ textShadow: neonTextShadow(accent) }}
            >
              {(pick.heroName ?? `HERO ${pick.heroId}`).toUpperCase()}
            </p>
            {playerName ? (
              <p className="mt-1 font-heading text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                {playerName}
              </p>
            ) : null}
          </div>
        </div>
    </motion.div>
  );
}

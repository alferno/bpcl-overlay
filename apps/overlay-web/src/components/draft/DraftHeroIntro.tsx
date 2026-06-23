import type {
  DraftState,
  LastPick,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { withBaseUrl } from "../../asset-paths";
import {
  neonTextShadow,
} from "../../draft/neon-effects";
import {
  resolveSlotMedia,
} from "../../hero-portrait";
import { findPickSlotForLastPick } from "../../draft/slot-utils";
import { colorAlpha, resolveDraftTeamColors } from "../../draft/team-colors";
import { resolvePickPlayerContext } from "../../draft/resolve-pick-player";
import { whenHeroWebmReady } from "../../hero-video-pool";

function resolveSideLogo(
  draft: DraftState,
  side: LastPick["side"],
): string | undefined {
  const isRadiant = side === "radiant" || side === "A";
  const url = isRadiant
    ? (draft.radiant?.logoUrl ?? draft.series.logoUrlA)
    : (draft.dire?.logoUrl ?? draft.series.logoUrlB);
  return withBaseUrl(url);
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

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

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

  // Resolve animated WebM for full hero model
  const slotMedia = pickSlot ? resolveSlotMedia(pickSlot) : undefined;
  const [videoUrl, setVideoUrl] = useState<string | undefined>(slotMedia?.animated);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setVideoReady(false);
    const slug = slotMedia?.slug;
    if (!slug) return;
    let cancelled = false;
    void whenHeroWebmReady(slug).then((url) => {
      if (!cancelled && url) setVideoUrl(url);
    });
    return () => { cancelled = true; };
  }, [slotMedia?.slug, slotMedia?.animated]);

  const heroDisplayName = (pick.heroName ?? `HERO ${pick.heroId}`).toUpperCase();

  return (
    <motion.div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
    >
      {/* ─── Accent spotlight behind hero ─── */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, delay: 0.1 }}
        style={{
          background: [
            `radial-gradient(ellipse 45% 50% at 50% 40%, ${colorAlpha(accent, 0.30)} 0%, transparent 70%)`,
            `radial-gradient(ellipse 25% 35% at 50% 38%, ${colorAlpha(accent, 0.12)} 0%, transparent 55%)`,
          ].join(", "),
        }}
      />

      {/* ─── Hero WebM model — positioned in upper-center ─── */}
      <div className="absolute inset-x-0 top-0 bottom-[35%] flex items-end justify-center">
        {videoUrl ? (
          <motion.video
            ref={videoRef}
            key={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="draft-hero-portrait h-full w-auto max-w-[55%] object-contain object-bottom"
            style={{
              opacity: videoReady ? 1 : 0,
              ["--hero-glow" as string]: colorAlpha(accent, 0.4),
            }}
            onCanPlayThrough={() => setVideoReady(true)}
            initial={{ scale: 1.08, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
          >
            <source src={videoUrl} type="video/webm" />
          </motion.video>
        ) : null}
      </div>

      {/* ─── Bottom text area ─── */}
      <div className="absolute inset-x-0 bottom-[36%] z-[3] flex flex-col items-center">
        {/* Team badge */}
        <motion.div
          className="mb-3 flex items-center gap-2.5"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.25, ease: EASE_OUT_EXPO }}
        >
          {logo ? (
            <img
              src={logo}
              alt=""
              className="h-7 w-7 object-contain"
              style={{ filter: `drop-shadow(0 0 8px ${colorAlpha(accent, 0.5)})` }}
            />
          ) : null}
          <p
            className="font-heading text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{ color: accent }}
          >
            {teamName}
            {playerName ? (
              <span className="ml-3 text-slate-400">{playerName}</span>
            ) : null}
          </p>
        </motion.div>

        {/* Hero name */}
        <motion.div
          className="text-center"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT_EXPO }}
        >
          <p
            className="font-display text-5xl tracking-[0.06em] text-white"
            style={{
              textShadow: [
                neonTextShadow(accent),
                `0 0 40px ${colorAlpha(accent, 0.35)}`,
                `0 4px 16px rgb(0 0 0 / 0.8)`,
              ].join(", "),
            }}
          >
            {heroDisplayName}
          </p>
          {/* Accent underline */}
          <motion.div
            className="mx-auto mt-2 h-[2px] rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              boxShadow: `0 0 12px ${colorAlpha(accent, 0.45)}`,
            }}
            initial={{ width: 0 }}
            animate={{ width: "50%" }}
            transition={{ duration: 0.6, delay: 0.45, ease: EASE_OUT_EXPO }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

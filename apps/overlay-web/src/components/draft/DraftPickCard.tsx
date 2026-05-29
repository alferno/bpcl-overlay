import type { CSSProperties } from "react";
import type { DraftSlot, LeagueConfig } from "@bpc/shared-types";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { DraftHeroMedia } from "./DraftHeroMedia";
import { DraftPickCardLabel } from "./DraftPickCardLabel";
import {
  heroCardInnerGlow,
  pickCardInnerRim,
  pickCardOuterFrame,
  readableTextShadow,
  pickCardCornerHue,
  pickCardEdgeHueOverlay,
  slotFloorBackground,
} from "../../draft/neon-effects";
import { pickSlotRosterLabel } from "../../draft/roster-label";
import {
  formatCardLabelText,
  wrapCardLabelLines,
} from "../../draft/wrap-card-label";
import { resolveSlotMedia, draftHeroAnimationEnabled } from "../../hero-portrait";
import { colorAlpha } from "../../draft/team-colors";

function PickCardTeamHueEdge({
  accent,
  active,
  subdued = false,
}: {
  accent: string;
  active: boolean;
  subdued?: boolean;
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[4] rounded-[inherit]"
        style={{
          background: pickCardEdgeHueOverlay(accent, active && !subdued),
          opacity: subdued ? 0.38 : 0.52,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[4] rounded-[inherit]"
        style={{
          background: pickCardCornerHue(accent, active && !subdued),
          opacity: subdued ? 0.34 : 0.48,
        }}
      />
    </>
  );
}

function PickCardInnerRim({
  accent,
  active,
}: {
  accent: string;
  active: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[7] rounded-[inherit]"
      style={{ boxShadow: pickCardInnerRim(accent, active) }}
    />
  );
}

export function DraftPickCard({
  slot,
  teamLogoUrl,
  teamColor,
  isActive,
  animate = true,
  hideHeroUntilCinematic = false,
  heroSelectionMode = false,
  leagueConfig,
  teamSide,
}: {
  slot: DraftSlot | null;
  teamLogoUrl?: string;
  teamColor?: string;
  isActive?: boolean;
  animate?: boolean;
  /** Slot has a pick in GSI but cinematic plays first — show empty card */
  hideHeroUntilCinematic?: boolean;
  /** After CM draft — show manually assigned roster name */
  heroSelectionMode?: boolean;
  leagueConfig?: LeagueConfig;
  teamSide: "radiant" | "dire";
}) {
  const media = slot ? resolveSlotMedia(slot) : {};
  const hasPick = Boolean(
    slot?.heroId || media.static || media.animated,
  );
  const showHeroVisual = hasPick && !hideHeroUntilCinematic;
  const prevHideCinematicRef = useRef(hideHeroUntilCinematic);
  const webmFirst =
    showHeroVisual &&
    prevHideCinematicRef.current &&
    !hideHeroUntilCinematic;
  prevHideCinematicRef.current = hideHeroUntilCinematic;
  const accent = teamColor ?? "#ffffff";
  const [sweep, setSweep] = useState(false);

  const rosterLabel =
    heroSelectionMode && slot
      ? pickSlotRosterLabel(slot, leagueConfig, teamSide)
      : undefined;

  const underHeroLabel = heroSelectionMode
    ? rosterLabel ?? slot?.heroName
    : slot?.heroName;

  const labelVariant = heroSelectionMode && rosterLabel ? "roster-player" : "hero";

  useEffect(() => {
    if (!showHeroVisual) return;
    setSweep(true);
    const t = window.setTimeout(() => setSweep(false), 700);
    return () => window.clearTimeout(t);
  }, [showHeroVisual, slot?.heroId]);

  const active = Boolean(isActive);

  return (
    <motion.div
      layout
      className={`draft-pick-card relative h-full min-w-0 w-full overflow-hidden rounded-md ${
        active ? "draft-pick-pulse" : ""
      } ${sweep ? "energy-sweep" : ""} ${showHeroVisual ? "draft-pick-card--filled" : "draft-pick-card--empty"}`}
      style={{
        ...pickCardOuterFrame(accent, active, showHeroVisual),
        ...(active
          ? ({
              ["--pick-glow" as string]: colorAlpha(accent, 0.75),
              ["--pick-glow-soft" as string]: colorAlpha(accent, 0.28),
            } as CSSProperties)
          : {}),
      }}
      initial={showHeroVisual ? { scale: 0.94, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <PickCardTeamHueEdge
        accent={accent}
        active={active}
        subdued={!showHeroVisual}
      />
      <PickCardInnerRim accent={accent} active={active} />

      {showHeroVisual && slot && (media.static || media.animated) ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-black" />
          <div
            className="pointer-events-none absolute inset-0 z-[1] mix-blend-soft-light opacity-[0.42]"
            style={{ background: heroCardInnerGlow(accent, active) }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-2/5"
            style={{ background: slotFloorBackground(accent) }}
          />
          <DraftHeroMedia
            staticUrl={media.static}
            staticFallback={media.staticFallback}
            animatedUrl={media.animated}
            heroSlug={media.slug}
            alt={slot.heroName ?? "hero"}
            animate={animate && draftHeroAnimationEnabled()}
            variant="slot"
            webmFirst={webmFirst}
            glowColor={colorAlpha(accent, 0.32)}
          />
          <div className="draft-hero-card-vignette pointer-events-none absolute inset-0 z-[3]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[48%] bg-gradient-to-t from-black/95 via-black/70 to-transparent" />
          {underHeroLabel ? (
            <DraftPickCardLabel
              label={underHeroLabel}
              accent={accent}
              variant={labelVariant}
            />
          ) : null}
        </>
      ) : showHeroVisual && slot ? (
        <div className="flex h-full flex-col items-center justify-center bg-black px-1">
          {underHeroLabel ? (
            <DraftPickCardLabel
              label={underHeroLabel}
              accent={accent}
              variant={labelVariant}
            />
          ) : (
            <p
              className="draft-pick-slot-label draft-pick-slot-label--hero draft-pick-slot-label--wrap px-2 text-center font-heading text-base font-bold leading-[1.12] tracking-[0.04em] text-white"
              style={{ textShadow: readableTextShadow(accent) }}
            >
              {wrapCardLabelLines(
                formatCardLabelText(
                  slot.heroName ?? `Hero ${slot.heroId ?? ""}`,
                  "hero",
                ),
                "hero",
              ).map((line, i) => (
                <span key={`${line}-${i}`} className="block">
                  {line}
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <div className="relative flex h-full flex-col items-center justify-center bg-black p-2">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-3/5"
            style={{ background: slotFloorBackground(accent) }}
          />
          {teamLogoUrl ? (
            <img
              src={teamLogoUrl}
              alt=""
              className="relative z-[1] max-h-[78%] max-w-[78%] object-contain opacity-35"
              style={{ filter: `drop-shadow(0 0 12px ${colorAlpha(accent, 0.35)})` }}
            />
          ) : (
            <div className="relative z-[1] h-10 w-10 rounded-full bg-white/[0.04]" />
          )}
        </div>
      )}
    </motion.div>
  );
}

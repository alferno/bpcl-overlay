import type { CSSProperties } from "react";
import type {
  DraftSlot,
  LeagueConfig,
  ProductionSettings,
  DraftState,
} from "@bpc/shared-types";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { DraftHeroMedia } from "./DraftHeroMedia";
import { DraftHistoryTags } from "./DraftHistoryTags";
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
import { resolveSlotMedia } from "../../hero-portrait";
import { colorAlpha } from "../../draft/team-colors";


export function DraftPickCard({
  slot,
  teamLogoUrl,
  teamColor,
  isActive,
  heroSelectionMode = false,
  leagueConfig,
  production,
  teamSide,
  previousDrafts,
}: {
  slot: DraftSlot | null;
  teamLogoUrl?: string;
  teamColor?: string;
  isActive?: boolean;
  heroSelectionMode?: boolean;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
  teamSide: "radiant" | "dire";
  previousDrafts?: DraftState[];
}) {
  const media = slot ? resolveSlotMedia(slot) : {};
  const hasPick = Boolean(
    slot?.heroId || media.static,
  );
  const showHeroVisual = hasPick;
  const accent = teamColor ?? "#ffffff";
  const [sweep, setSweep] = useState(false);

  const rosterLabel =
    heroSelectionMode && slot
      ? pickSlotRosterLabel(slot, leagueConfig, teamSide, production)
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
    <div style={{ perspective: "1200px", width: "100%", height: "100%" }}>
      <motion.div
        layout
        className={`relative h-full min-w-0 w-full ${
          active ? "draft-pick-pulse" : ""
        } ${sweep ? "energy-sweep" : ""}`}
        style={{
          transformStyle: "preserve-3d",
        }}
        initial={false}
        animate={{
          rotateY: showHeroVisual ? 180 : 0,
          z: showHeroVisual ? 40 : 0,
          scale: showHeroVisual ? 1.05 : 1,
        }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
      >
        {/* FRONT FACE (Team Logo & Empty State) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-md draft-pick-card--empty flex flex-col items-center justify-center p-2"
          style={{
            backfaceVisibility: "hidden",
            border: `1px solid ${colorAlpha(accent, active ? 0.8 : 0.4)}`,
            background: "rgba(0,0,0,0.3)",
            boxShadow: active ? `0 0 16px ${colorAlpha(accent, 0.3)}` : "none",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-3/5"
            style={{ background: slotFloorBackground(accent) }}
          />
          <div className="relative z-[1] flex h-full flex-col items-center justify-center">
            <span 
              className="font-heading text-2xl font-bold uppercase tracking-widest text-white/50"
              style={{ textShadow: `0 0 12px ${colorAlpha(accent, 0.4)}` }}
            >
              BPCL S2
            </span>
          </div>
        </div>

        {/* BACK FACE (Hero Picked Reveal) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-md draft-pick-card--filled"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            border: `1px solid ${colorAlpha(accent, active ? 0.8 : 0.4)}`,
            background: "rgba(0,0,0,0.3)",
            boxShadow: active ? `0 0 16px ${colorAlpha(accent, 0.3)}` : "none",
          }}
        >
          {slot && media.static ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-black" />
              <DraftHistoryTags currentSlot={slot} currentTeamSide={teamSide} previousDrafts={previousDrafts} />
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
                heroSlug={media.slug}
                alt={slot.heroName ?? "hero"}
                variant="slot"
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
          ) : slot ? (
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
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

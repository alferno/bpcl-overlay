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
}: {
  slot: DraftSlot | null;
  teamLogoUrl?: string;
  teamColor?: string;
  isActive?: boolean;
  heroSelectionMode?: boolean;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
  teamSide: "radiant" | "dire";
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
          ...(active ? {
            "--pick-glow": colorAlpha(accent, 0.8),
            "--pick-glow-soft": colorAlpha(accent, 0.3),
          } as CSSProperties : {}),
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
            border: `1px solid ${colorAlpha(accent, active ? 1 : 0.25)}`,
            background: `linear-gradient(180deg, ${colorAlpha(accent, 0.05)} 0%, ${colorAlpha(accent, 0.15)} 100%)`,
            boxShadow: active ? `0 0 20px ${colorAlpha(accent, 0.3)}` : "none",
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-3/5"
            style={{ background: slotFloorBackground(accent) }}
          />
          <div className="relative z-[1] flex h-full flex-col items-center justify-center opacity-30">
            {teamLogoUrl ? (
              <img src={teamLogoUrl} alt="Team Logo" className="w-16 h-16 object-contain filter grayscale opacity-50 mix-blend-overlay" />
            ) : (
              <span 
                className="font-heading text-xl font-bold uppercase tracking-widest text-white/50"
                style={{ textShadow: `0 0 12px ${colorAlpha(accent, 0.4)}` }}
              >
                BPCL S2
              </span>
            )}
          </div>
        </div>

        {/* BACK FACE (Hero Picked Reveal) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-md draft-pick-card--filled"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "rgba(0,0,0,0.8)",
            boxShadow: `0 0 15px ${colorAlpha(accent, 0.4)}`,
          }}
        >
          {slot && media.static ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-black" />
              <DraftHistoryTags currentSlot={slot} />
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
                variant="slot"
                webmFirst={true}
                glowColor={colorAlpha(accent, 0.32)}
              />
              <div className="draft-hero-card-vignette pointer-events-none absolute inset-0 z-[3]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[48%] bg-gradient-to-t from-black/95 via-black/70 to-transparent" />
              
              {/* Explicit Border Layer ON TOP of everything */}
              <div 
                className="pointer-events-none absolute inset-0 z-[10] rounded-md"
                style={{
                  border: `2px solid ${colorAlpha(accent, 0.9)}`,
                  boxShadow: `inset 0 0 20px ${colorAlpha(accent, 0.5)}`
                }}
              />
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

import type { CSSProperties } from "react";
import type { DraftSlot } from "@bpc/shared-types";
import { motion } from "framer-motion";

import { neonSlotShadow } from "../../draft/neon-effects";
import { resolveSlotFlatPortraitUrl } from "../../hero-portrait";
import { colorAlpha } from "../../draft/team-colors";

import { DraftHistoryTags } from "./DraftHistoryTags";

const BAN_TILE_CLASS = "mx-auto w-full h-full aspect-square rounded-sm bg-black";

export function DraftBanTile({
  slot,
  teamColor,
  isActive,
}: {
  slot: DraftSlot | null;
  teamColor?: string;
  isActive?: boolean;
}) {
  const portraitUrl = slot ? resolveSlotFlatPortraitUrl(slot) : undefined;
  const filled = Boolean(slot?.heroId || portraitUrl);
  const accent = teamColor ?? "#ffffff";

  if (!filled) {
    return (
      <div
        className={`${BAN_TILE_CLASS} transition-shadow ${isActive ? "draft-pick-pulse" : ""}`}
        style={{
          border: `1px solid ${colorAlpha(accent, isActive ? 1 : 0.25)}`,
          background: `linear-gradient(180deg, ${colorAlpha(accent, 0.05)} 0%, ${colorAlpha(accent, 0.15)} 100%)`,
          boxShadow: isActive ? `0 0 20px ${colorAlpha(accent, 0.3)}` : "none",
          ...(isActive ? {
            "--pick-glow": colorAlpha(accent, 0.8),
            "--pick-glow-soft": colorAlpha(accent, 0.4),
          } as CSSProperties : {}),
        }}
      />
    );
  }

  return (
    <motion.div
      className={`relative overflow-hidden ${BAN_TILE_CLASS}`}
      style={{
        border: `1px solid ${colorAlpha(accent, 0.8)}`,
      }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <DraftHistoryTags currentSlot={slot} />
      <img
        src={portraitUrl}
        alt=""
        className="h-full w-full scale-[0.92] object-cover object-[center_12%] grayscale-[0.65] saturate-50 opacity-75"
      />
      <div className="pointer-events-none absolute inset-0 bg-red-950/25" />
      <div
        className="animate-ban-slash pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="h-[2px] w-[130%] rotate-[-42deg] bg-gradient-to-r from-transparent via-red-400/70 to-transparent shadow-[0_0_6px_rgb(248_113_113/0.4)]" />
      </div>
    </motion.div>
  );
}

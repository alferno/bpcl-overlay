import type { DraftSlot } from "@bpc/shared-types";
import { motion } from "framer-motion";

import { neonSlotShadow } from "../../draft/neon-effects";
import { resolveSlotFlatPortraitUrl } from "../../hero-portrait";
import { colorAlpha } from "../../draft/team-colors";

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
        className={`${BAN_TILE_CLASS} transition-shadow`}
        style={{
          border: `1px solid ${colorAlpha(accent, isActive ? 0.8 : 0.4)}`,
          background: "rgba(0,0,0,0.3)",
          boxShadow: isActive ? `0 0 16px ${colorAlpha(accent, 0.3)}` : "none",
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
      <img
        src={portraitUrl}
        alt={slot?.heroName ?? "banned hero"}
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

import type {
  DraftState,
  LastPick,
  LeagueConfig,
} from "@bpc/shared-types";
import { AnimatePresence, motion } from "framer-motion";

import { colorAlpha, resolveDraftTeamColors } from "../../draft/team-colors";
import { DraftHeroIntro } from "./DraftHeroIntro";

/** Overlap into the draft blast bar (px from bottom of 1080 canvas) */
const CINEMATIC_OVERLAP_DRAFT_PX = 120;
/** Max black veil opacity — keeps draft/UI readable under spotlight */
const DIM_VEIL_MAX = 0.4;

const VEIL_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Full-screen dim + centered hero cinematic (4s). Stats render separately top-right.
 */
export function DraftPickRevealLayer({
  draft,
  introPick,
  statsPick,
  leagueConfig,
}: {
  draft: DraftState;
  introPick: LastPick | null;
  statsPick: LastPick | null;
  leagueConfig?: LeagueConfig;
}) {
  const pick = introPick ?? statsPick;
  if (!pick) return null;

  const teamColors = resolveDraftTeamColors(draft, leagueConfig);
  const isRadiant = pick.side === "radiant" || pick.side === "A";
  const accent = isRadiant ? teamColors.radiant : teamColors.dire;
  const showSpotlight = Boolean(introPick);

  const veilBackground = showSpotlight
    ? [
        `radial-gradient(ellipse 42% 36% at 50% 46%, ${colorAlpha(accent, 0.42)} 0%, ${colorAlpha(accent, 0.12)} 42%, transparent 68%)`,
        `radial-gradient(ellipse 52% 46% at 50% 46%, transparent 0%, transparent 32%, rgb(0 0 0 / ${DIM_VEIL_MAX}) 100%)`,
        `radial-gradient(ellipse 120% 100% at 50% 48%, rgb(0 0 0 / 0.12) 0%, rgb(0 0 0 / ${DIM_VEIL_MAX}) 78%)`,
        `radial-gradient(ellipse 80% 40% at 50% 100%, rgb(0 0 0 / 0.28) 0%, rgb(0 0 0 / ${DIM_VEIL_MAX}) 100%)`,
      ].join(", ")
    : `radial-gradient(ellipse 100% 100% at 50% 40%, rgb(0 0 0 / 0.22) 0%, rgb(0 0 0 / ${DIM_VEIL_MAX}) 100%)`;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
      style={{ bottom: showSpotlight ? -CINEMATIC_OVERLAP_DRAFT_PX : 0 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: VEIL_EASE }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{ duration: 0.55, ease: VEIL_EASE }}
        style={{ background: veilBackground }}
      />

      <div className="relative z-[1] flex items-center justify-center px-8">
        <AnimatePresence mode="wait">
          {introPick ? (
            <DraftHeroIntro
              key={`intro-${introPick.side}-${introPick.heroId}`}
              draft={draft}
              pick={introPick}
              leagueConfig={leagueConfig}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

import type {
  DraftState,
  LastPick,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";
import { AnimatePresence, motion } from "framer-motion";

import { colorAlpha, resolveDraftTeamColors } from "../../draft/team-colors";
import { DraftHeroIntro } from "./DraftHeroIntro";

const VEIL_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Full-screen cinematic hero reveal — PGL/BLAST style.
 * Dims the entire screen, shows the hero model large & centered with accent glow.
 */
export function DraftPickRevealLayer({
  draft,
  introPick,
  leagueConfig,
  production,
}: {
  draft: DraftState;
  introPick: LastPick;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
}) {
  const teamColors = resolveDraftTeamColors(draft, leagueConfig);
  const isRadiant = introPick.side === "radiant" || introPick.side === "A";
  const accent = isRadiant ? teamColors.radiant : teamColors.dire;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: VEIL_EASE }}
    >
      {/* Full-screen dim veil with team-colored accent */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{ duration: 0.55, ease: VEIL_EASE }}
        style={{
          background: [
            `radial-gradient(ellipse 60% 50% at 50% 50%, ${colorAlpha(accent, 0.15)} 0%, transparent 70%)`,
            `linear-gradient(180deg, rgb(0 0 0 / 0.82) 0%, rgb(0 0 0 / 0.88) 40%, rgb(0 0 0 / 0.92) 100%)`,
          ].join(", "),
        }}
      />

      {/* Hero cinematic content */}
      <div className="relative z-[1] h-full w-full">
        <AnimatePresence mode="wait">
          <DraftHeroIntro
            key={`intro-${introPick.side}-${introPick.heroId}`}
            draft={draft}
            pick={introPick}
            leagueConfig={leagueConfig}
            production={production}
          />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

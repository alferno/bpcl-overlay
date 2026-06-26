import { motion } from "framer-motion";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroPortrait } from "../components/HeroPortrait";
import {
  heroPortraitHintsFromFields,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import { useRouteVisible } from "../hooks/useRouteVisible";

export default function MatchupPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("matchup", state);
  const m = state.matchupCard;

  const lines = m?.statLines ?? [];
  const portraitA = m
    ? resolveOverlayPortraitForHero(
        m.heroAId,
        m.heroAName,
        heroPortraitHintsFromFields({
          heroPortraitSlug: m.heroAPortraitSlug,
          heroPortraitUrl: m.heroAPortraitUrl,
        }),
      )
    : undefined;
  const portraitB = m
    ? resolveOverlayPortraitForHero(
        m.heroBId,
        m.heroBName,
        heroPortraitHintsFromFields({
          heroPortraitSlug: m.heroBPortraitSlug,
          heroPortraitUrl: m.heroBPortraitUrl,
        }),
      )
    : undefined;

  return (
    <HudCanvas blend>
      <FadePanel show={visible} panelKey={`matchup-${m?.heroAId}-${m?.heroBId}`}>
        <div className="relative flex h-full items-center justify-center gap-16 p-14 overflow-hidden">
          {m ? (
            <>
              {/* Flex wrapper to dynamically size the background */}
              <div className="relative flex items-center justify-center gap-16 p-16">
                {/* Solid Background that fills the dynamically sized wrapper */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="absolute inset-0 bg-emerald-950 rounded-[2.5rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] z-0"
                />

                {/* Hero A (Slides in from Left) */}
                <motion.div 
                  className="flex flex-col items-center gap-4 relative z-10 w-[350px]"
                  initial={{ x: -800, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -800, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 }}
                >
                  <HeroPortrait
                    url={portraitA}
                    heroName={m.heroAName}
                    size={220}
                  />
                  <p className="text-4xl font-black text-emerald-300 text-center leading-tight text-balance break-words">
                    {m.heroAName ?? `#${m.heroAId}`}
                  </p>
                </motion.div>

                {/* Center Panel (Pops in after slide) */}
                <motion.div 
                  className="min-w-[28rem] rounded-[2rem] bg-black/95 p-12 text-xl text-neutral-200 shadow-[0_0_50px_rgba(6,182,212,0.3)] backdrop-blur-2xl relative z-10 border border-cyan-500/20"
                  initial={{ scale: 0.5, opacity: 0, y: 50 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.5, opacity: 0, y: 50 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.6 }}
                >
                  <p className="mb-6 text-center text-xs uppercase tracking-[0.5em] text-neutral-400">
                    Matchup
                  </p>
                  {lines.length > 0 ? (
                    lines.map((row, i) => (
                      <div
                        key={i}
                        className="flex justify-between gap-16 border-b border-white/10 py-3"
                      >
                        <span className="text-neutral-500">{row.label}</span>
                        <span className="font-bold tabular-nums">{row.value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-neutral-500">No stat lines</p>
                  )}
                </motion.div>

                {/* Hero B (Slides in from Right) */}
                <motion.div 
                  className="flex flex-col items-center gap-4 relative z-10 w-[350px]"
                  initial={{ x: 800, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 800, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.2 }}
                >
                  <HeroPortrait
                    url={portraitB}
                    heroName={m.heroBName}
                    size={220}
                  />
                  <p className="text-4xl font-black text-rose-300 text-center leading-tight text-balance break-words">
                    {m.heroBName ?? `#${m.heroBId}`}
                  </p>
                </motion.div>
              </div>
            </>
          ) : (
            <p className="w-full text-center text-4xl text-neutral-600">
              Matchup overlay idle
            </p>
          )}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

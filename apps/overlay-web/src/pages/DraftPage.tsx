import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";

import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { DraftBlastBar } from "../components/draft/DraftBlastBar";
import { DraftPickRevealLayer } from "../components/draft/DraftPickRevealLayer";
import { DraftPickStatsPanel } from "../components/draft/DraftPickStatsPanel";
import { DraftStartingPanel } from "../components/draft/DraftStartingPanel";
import { useDraftPickReveal } from "../hooks/useDraftPickReveal";
import { useDraftHeroWarmup } from "../hooks/useDraftHeroWarmup";
import { loadHeroRenderManifest } from "../hero-render-manifest";
import { loadHeroPortraitManifest } from "../hero-portrait-manifest";
import { warmHeroFlatPortraitCache } from "../hero-portrait";
import { routeVisible } from "../visibility";

export default function DraftPage() {
  useEffect(() => {
    void Promise.all([loadHeroRenderManifest(), loadHeroPortraitManifest()]).then(
      () => warmHeroFlatPortraitCache(),
    );
  }, []);

  const { state } = useOverlayState();
  const visible = routeVisible("draft", state);
  const draft = state.draft;
  useDraftHeroWarmup(draft);
  const { introPick, statsPick, cinematicPickKey } = useDraftPickReveal(
    draft?.phase === "done" ? null : draft?.lastPick,
  );

  const heroStats =
    statsPick?.heroId != null
      ? state.tournamentHeroIndex?.[String(statsPick.heroId)]
      : undefined;

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <div className="relative h-full w-full max-w-none font-body">
          {draft ? (
            draft.phase === "starting" ? (
              <DraftStartingPanel
                draft={draft}
                leagueConfig={state.leagueConfig}
              />
            ) : (
              <DraftBlastBar
                draft={draft}
                leagueConfig={state.leagueConfig}
                cinematicPickKey={cinematicPickKey}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center font-heading text-2xl tracking-wide text-slate-500">
              Draft standby
            </div>
          )}

          <AnimatePresence>
            {draft && (introPick || statsPick) ? (
              <DraftPickRevealLayer
                key={`reveal-${statsPick?.side ?? introPick?.side}-${statsPick?.heroId ?? introPick?.heroId}`}
                draft={draft}
                introPick={introPick}
                statsPick={statsPick}
                leagueConfig={state.leagueConfig}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {draft && statsPick ? (
              <DraftPickStatsPanel
                key={`stats-${statsPick.side}-${statsPick.heroId}`}
                pick={statsPick}
                draft={draft}
                leagueConfig={state.leagueConfig}
                tournamentStats={heroStats}
                playerHeroIndex={state.playerHeroIndex}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

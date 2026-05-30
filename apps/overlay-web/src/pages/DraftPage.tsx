import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";

import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { DraftBlastBar } from "../components/draft/DraftBlastBar";
import { DraftPickRevealLayer } from "../components/draft/DraftPickRevealLayer";
import { DraftPickStatsStack } from "../components/draft/DraftPickStatsStack";
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
  const { introPick, statsQueue, cinematicPickKey } = useDraftPickReveal(
    draft?.lastPick,
    state.production?.overlayDraftEpoch,
  );

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
                production={state.production}
                cinematicPickKey={cinematicPickKey}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center font-heading text-2xl tracking-wide text-slate-500">
              Draft standby
            </div>
          )}

          <AnimatePresence>
            {draft && introPick ? (
              <DraftPickRevealLayer
                key={`reveal-${introPick.side}-${introPick.heroId}`}
                draft={draft}
                introPick={introPick}
                leagueConfig={state.leagueConfig}
                production={state.production}
              />
            ) : null}
          </AnimatePresence>

          <DraftPickStatsStack
            items={statsQueue}
            draft={draft}
            leagueConfig={state.leagueConfig}
            tournamentHeroIndex={state.tournamentHeroIndex}
            playerHeroIndex={state.playerHeroIndex}
            production={state.production}
          />
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

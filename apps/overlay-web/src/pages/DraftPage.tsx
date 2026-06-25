import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";

import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { DraftBlastBar } from "../components/draft/DraftBlastBar";
// import { DraftPickRevealLayer } from "../components/draft/DraftPickRevealLayer";
import { DraftPickStatsStack } from "../components/draft/DraftPickStatsStack";
import { DraftStartingPanel } from "../components/draft/DraftStartingPanel";
import { DraftDataOverlay } from "../components/draft/DraftDataOverlay";
import { useDraftPickReveal } from "../hooks/useDraftPickReveal";
import { useDraftHeroWarmup } from "../hooks/useDraftHeroWarmup";
import { loadHeroRenderManifest } from "../hero-render-manifest";
import { loadHeroPortraitManifest } from "../hero-portrait-manifest";
import { warmHeroFlatPortraitCache } from "../hero-portrait";
import { routeVisible } from "../visibility";
import { resolveDraftTeamColors } from "../draft/team-colors";

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
    draft,
  );

  const teamColors = resolveDraftTeamColors(draft, state.leagueConfig);

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <div className="relative h-full w-full max-w-none font-body overflow-hidden bg-black/40">
          {/* Top Half Trophy Background */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[65%] w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/40 via-emerald-900/10 to-transparent mix-blend-screen" />
            <img src={`${import.meta.env.BASE_URL}emerald-trophy.png`} alt="BPCL Trophy" className="h-full w-full object-cover opacity-100" style={{ objectPosition: 'center 20%' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          </div>

          {draft && draft.phase !== "starting" && (
            <DraftDataOverlay 
              leagueConfig={state.leagueConfig} 
              teamColors={teamColors} 
              playerHeroIndex={state.playerHeroIndex}
            />
          )}
          
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
            {/* Cinematic hero focus removed in favor of 3D card flips */}
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

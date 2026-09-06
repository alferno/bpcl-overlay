import type {
  DraftState,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";

import { resolveTurnAction } from "../../draft/slot-utils";
import { resolveDraftTeamColors } from "../../draft/team-colors";
import { resolveBroadcastTheme } from "../../draft/theme-colors";
import { DraftBroadcastShell } from "./DraftBroadcastShell";
import { DraftCenterHub } from "./DraftCenterHub";
import { DraftTeamColumn } from "./DraftTeamColumn";
import { draftTeamSides } from "./DraftTeamFaceoff";

export function DraftBlastBar({
  draft,
  leagueConfig,
  production,
  cinematicPickKey = null,
}: {
  draft: DraftState;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
  /** Hide newest pick on board until cinematic ends */
  cinematicPickKey?: string | null;
}) {
  const active = draft.activeTeam ?? null;
  const turnAction = resolveTurnAction(draft);
  const teamColors = resolveDraftTeamColors(draft, leagueConfig);
  const theme = resolveBroadcastTheme(production);
  const heroSelectionMode = draft.phase === "done";
  const { radiantName, direName, radiantLogo, direLogo } = draftTeamSides(draft, leagueConfig);

  return (
    <DraftBroadcastShell
      teamColors={teamColors}
      draft={draft}
      leagueConfig={leagueConfig}
    >
      <div className="relative flex min-w-0 w-full max-w-none items-start justify-between gap-4 font-body px-8">
        <DraftTeamColumn
          slots={draft.radiant?.slots}
          teamLogoUrl={radiantLogo}
          teamName={radiantName}
          isActive={active === "radiant"}
          heroSelectionMode={heroSelectionMode}
          leagueConfig={leagueConfig}
          teamColor={teamColors.radiant}
          turnAction={turnAction}
          edge="start"
          teamSide="radiant"
          cinematicPickKey={cinematicPickKey}
          production={production}
        />

        <div className="flex flex-col items-center gap-2">
          <DraftCenterHub
            draft={draft}
            teamColors={teamColors}
            leagueConfig={leagueConfig}
            production={production}
          />

          {!production?.hideDraftScore && (
            <div 
              className="flex items-center gap-6 px-8 py-2.5 rounded-xl bg-gradient-to-b from-slate-900/90 to-black/90 backdrop-blur-xl border relative overflow-hidden mt-1"
              style={{
                borderColor: `${theme.primary}66`, // 40% opacity
                boxShadow: `0 0 30px ${theme.primary}33, inset 0 2px 10px ${theme.primary}1A`
              }}
            >
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, ${theme.primary}1A, transparent)` }}
              />
              
              <span 
                className="text-4xl font-heading font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] relative z-10"
                style={{ textShadow: `0 2px 10px rgba(0,0,0,0.5), 0 0 15px ${theme.primary}80` }}
              >
                {draft?.series?.scoreA ?? leagueConfig?.matchSetup?.scoreA ?? 0}
              </span>
              <span 
                className="text-2xl font-black relative z-10"
                style={{ color: theme.accent, filter: `drop-shadow(0 0 10px ${theme.primary}CC)` }}
              >
                —
              </span>
              <span 
                className="text-4xl font-heading font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] relative z-10"
                style={{ textShadow: `0 2px 10px rgba(0,0,0,0.5), 0 0 15px ${theme.primary}80` }}
              >
                {draft?.series?.scoreB ?? leagueConfig?.matchSetup?.scoreB ?? 0}
              </span>
            </div>
          )}
        </div>

        <DraftTeamColumn
          slots={draft.dire?.slots}
          teamLogoUrl={direLogo}
          teamName={direName}
          isActive={active === "dire"}
          heroSelectionMode={heroSelectionMode}
          leagueConfig={leagueConfig}
          teamColor={teamColors.dire}
          turnAction={turnAction}
          edge="end"
          teamSide="dire"
          cinematicPickKey={cinematicPickKey}
          production={production}
        />
      </div>
    </DraftBroadcastShell>
  );
}

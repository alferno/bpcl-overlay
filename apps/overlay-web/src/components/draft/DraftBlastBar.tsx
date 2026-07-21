import type {
  DraftState,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";

import { resolveTurnAction } from "../../draft/slot-utils";
import { resolveDraftTeamColors } from "../../draft/team-colors";
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
  const heroSelectionMode = draft.phase === "done";
  const { radiantName, direName, radiantLogo, direLogo } = draftTeamSides(draft, leagueConfig);

  return (
    <DraftBroadcastShell
      teamColors={teamColors}
      draft={draft}
      leagueConfig={leagueConfig}
    >
      <div className="relative flex min-w-0 w-full max-w-none items-stretch gap-2 font-body">
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

        <DraftCenterHub
          draft={draft}
          teamColors={teamColors}
          leagueConfig={leagueConfig}
        />

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

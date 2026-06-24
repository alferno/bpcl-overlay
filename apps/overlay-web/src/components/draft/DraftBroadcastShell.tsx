import type { ReactNode } from "react";
import type { DraftState, LeagueConfig } from "@bpc/shared-types";

import {
  hudChromeShadow,
  hudTopLineGradient,
} from "../../draft/neon-effects";
import { colorAlpha } from "../../draft/team-colors";
import { DraftBroadcastHeader } from "./DraftBroadcastHeader";

export function DraftBroadcastShell({
  children,
  teamColors,
  draft,
  leagueConfig,
  className = "",
}: {
  children: ReactNode;
  teamColors?: { radiant: string; dire: string };
  draft?: DraftState;
  leagueConfig?: LeagueConfig;
  className?: string;
}) {
  return (
    <div className={`absolute inset-x-0 bottom-0 left-0 right-0 w-full max-w-none pb-4 pt-12 flex flex-col items-center ${className}`}>
      <div className="relative w-[1800px] max-w-[95vw] px-2 flex flex-col gap-2">
        {draft ? (
          <DraftBroadcastHeader
            draft={draft}
            stageLabel={leagueConfig?.matchSetup?.stageLabel}
            teamColors={teamColors}
            leagueConfig={leagueConfig}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

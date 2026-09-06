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
    <div 
      className={`absolute inset-x-0 bottom-0 left-0 right-0 w-full max-w-full flex flex-col items-center ${className}`}
      style={{
        background: `linear-gradient(180deg, transparent, rgba(0,0,0,0.8) 15%, black 100%)`
      }}
    >
      <div className="relative w-full max-w-full px-0 flex flex-col">
        {draft ? (
          <DraftBroadcastHeader
            draft={draft}
            stageLabel={leagueConfig?.matchSetup?.stageLabel}
            teamColors={teamColors}
            leagueConfig={leagueConfig}
          />
        ) : null}
        <div className="bg-black/40 backdrop-blur-md w-full px-4 py-3 pb-8 shadow-2xl border-t border-b-8 border-white/10"
             style={{ 
               boxShadow: `0 -10px 40px ${colorAlpha(teamColors?.radiant ?? '#000', 0.1)}`, 
               borderTopColor: colorAlpha(teamColors?.radiant ?? '#fff', 0.3),
               borderBottomColor: colorAlpha(teamColors?.radiant ?? '#000', 0.4)
             }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

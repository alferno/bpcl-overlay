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
  const left = teamColors ? colorAlpha(teamColors.radiant, 0.18) : "transparent";
  const right = teamColors ? colorAlpha(teamColors.dire, 0.18) : "transparent";
  const chrome = teamColors
    ? hudChromeShadow(teamColors.radiant, teamColors.dire)
    : null;

  return (
    <div className={`absolute inset-x-0 bottom-0 left-0 right-0 w-full max-w-none pb-0 pt-12 ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 left-0 right-0 h-[440px] w-full overflow-hidden">
        <div className="broadcast-vignette absolute inset-0" />
        {teamColors ? (
          <>
            <div
              className="absolute inset-y-0 left-0 w-[55%]"
              style={{
                background: `linear-gradient(90deg, ${left} 0%, transparent 78%)`,
              }}
            />
            <div
              className="absolute inset-y-0 right-0 w-[55%]"
              style={{
                background: `linear-gradient(270deg, ${right} 0%, transparent 78%)`,
              }}
            />
          </>
        ) : null}
      </div>

      <div className="relative w-full max-w-none px-2 pb-2 pt-1">
        {teamColors ? (
          <div
            className="pointer-events-none absolute inset-x-3 top-0 h-[2px] rounded-full"
            style={{
              background: hudTopLineGradient(teamColors.radiant, teamColors.dire),
              boxShadow: `0 0 16px ${colorAlpha(teamColors.radiant, 0.35)}, 0 0 16px ${colorAlpha(teamColors.dire, 0.35)}`,
            }}
          />
        ) : null}

        <div
          className="broadcast-bar relative w-full max-w-none px-0 py-4"
          style={
            chrome
              ? {
                  border: `1px solid ${chrome.borderColor}`,
                  boxShadow: chrome.outer,
                }
              : undefined
          }
        >
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
    </div>
  );
}

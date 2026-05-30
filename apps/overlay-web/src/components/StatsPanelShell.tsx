import type { HeroStatsCard, LeagueConfig } from "@bpc/shared-types";
import type { ReactNode } from "react";

import { colorAlpha } from "../draft/team-colors";
import {
  isLeagueAggregateCard,
  resolveTeamColorForCard,
  resolveTeamLogoForCard,
} from "../hero-stats-card";
import {
  leagueTeamLogoGlowStyle,
  leagueTeamLogoImageClassName,
  leagueTeamStatsShell,
} from "../stats-panel-theme";
import { STATS_PANEL_SHELL_CLASS } from "../overlay-layout";

export function StatsPanelShell({
  card,
  leagueConfig,
  children,
}: {
  card?: HeroStatsCard | null;
  leagueConfig?: LeagueConfig;
  children: ReactNode;
}) {
  const leagueThemed =
    card && isLeagueAggregateCard(card) ? card : undefined;
  const teamColor = leagueThemed
    ? resolveTeamColorForCard(leagueThemed, leagueConfig)
    : undefined;
  const teamLogoUrl = leagueThemed
    ? resolveTeamLogoForCard(leagueThemed, leagueConfig?.roster)
    : undefined;

  if (teamColor) {
    const themed = leagueTeamStatsShell(teamColor);
    return (
      <div className={themed.className} style={themed.style}>
        {teamLogoUrl ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
            aria-hidden
          >
            <div
              className="absolute h-[85%] w-[68%] max-h-[240px] max-w-[300px]"
              style={leagueTeamLogoGlowStyle(teamColor)}
            />
            <img
              src={teamLogoUrl}
              alt=""
              className={leagueTeamLogoImageClassName()}
              style={{
                filter: `drop-shadow(0 0 28px ${colorAlpha(teamColor, 0.5)}) drop-shadow(0 0 56px ${colorAlpha(teamColor, 0.22)})`,
              }}
            />
          </div>
        ) : null}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return <div className={STATS_PANEL_SHELL_CLASS}>{children}</div>;
}

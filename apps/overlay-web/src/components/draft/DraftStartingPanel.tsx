import type { DraftState, LeagueConfig } from "@bpc/shared-types";

import { formatSeriesLabel } from "../../draft/broadcast-theme";
import { DRAFT_PICK_HEIGHT } from "../../draft/dimensions";
import { neonPanelShadow } from "../../draft/neon-effects";
import { formatDraftSeconds } from "../../draft/slot-utils";
import { useDraftCountdown } from "../../draft/useDraftCountdown";
import { colorAlpha, resolveDraftTeamColors } from "../../draft/team-colors";
import { withBaseUrl } from "../../asset-paths";
import { draftTeamSides } from "./DraftTeamFaceoff";
import { DraftBroadcastShell } from "./DraftBroadcastShell";

/** Match draft board column height (bans + divider + picks + padding). */
const STARTING_COLUMN_MIN_H = DRAFT_PICK_HEIGHT + 108;

const STARTING_LOGO = "h-[168px] w-[168px]";

export function DraftStartingPanel({
  draft,
  leagueConfig,
}: {
  draft: DraftState;
  leagueConfig?: LeagueConfig;
}) {
  const serverStart = draft.startSecondsRemaining;
  const seconds = useDraftCountdown(serverStart, "draft-starting");
  const teamColors = resolveDraftTeamColors(draft, leagueConfig);
  const sides = draftTeamSides(draft);
  const seriesLabel = formatSeriesLabel(draft, leagueConfig);

  const teamSides = {
    radiantName: sides.radiantName,
    radiantLogo: sides.radiantLogo,
    direName: sides.direName,
    direLogo: sides.direLogo,
  };

  return (
    <DraftBroadcastShell
      teamColors={teamColors}
      draft={draft}
      leagueConfig={leagueConfig}
    >
      <div className="relative flex min-w-0 w-full max-w-none items-stretch gap-2 font-body">
        <StartingTeamColumn
          name={teamSides.radiantName}
          logoUrl={teamSides.radiantLogo}
          teamColor={teamColors.radiant}
          align="start"
        />

        <div className="relative flex w-[280px] shrink-0 flex-col items-center justify-center px-2">
          <div className="broadcast-glass w-full rounded-xl px-6 py-8 text-center">
            <p className="font-heading text-sm font-semibold tracking-[0.22em] text-zinc-400">
              {seriesLabel}
            </p>
            {sides.scoreLabel ? (
              <p className="mt-1 font-heading text-xs font-bold tracking-[0.2em] text-slate-500">
                SERIES {sides.scoreLabel}
              </p>
            ) : null}
            <p className="mt-4 font-heading text-xs font-bold tracking-[0.38em] text-draft-muted">
              DRAFT STARTING
            </p>
            <p className="mt-3 font-heading text-7xl font-bold tabular-nums tracking-tight text-slate-100">
              {serverStart !== undefined ? formatDraftSeconds(seconds) : "—"}
            </p>
          </div>
        </div>

        <StartingTeamColumn
          name={teamSides.direName}
          logoUrl={teamSides.direLogo}
          teamColor={teamColors.dire}
          align="end"
        />
      </div>
    </DraftBroadcastShell>
  );
}

function StartingTeamColumn({
  name,
  logoUrl,
  teamColor,
  align,
}: {
  name: string;
  logoUrl?: string;
  teamColor: string;
  align: "start" | "end";
}) {
  const edgeRadius =
    align === "start"
      ? "rounded-none rounded-r-lg"
      : "rounded-none rounded-l-lg";

  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden px-8 py-6 ${edgeRadius}`}
      style={{
        minHeight: STARTING_COLUMN_MIN_H,
        background:
          "linear-gradient(180deg, rgb(14 14 16 / 0.98) 0%, rgb(4 4 6 / 1) 100%)",
        boxShadow: neonPanelShadow(teamColor, "idle"),
      }}
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <StartingTeamLogo name={name} logoUrl={logoUrl} teamColor={teamColor} />
        <p className="max-w-[min(100%,420px)] truncate font-display text-4xl tracking-wide text-slate-100">
          {name.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

function StartingTeamLogo({
  name,
  logoUrl,
  teamColor,
}: {
  name: string;
  logoUrl?: string;
  teamColor: string;
}) {
  return (
    <div className="relative shrink-0">
      <div
        className="pointer-events-none absolute inset-0 m-auto h-32 w-32 rounded-full blur-2xl"
        style={{ backgroundColor: colorAlpha(teamColor, 0.28) }}
      />
      <div
        className={`relative flex ${STARTING_LOGO} items-center justify-center rounded-xl border bg-gradient-to-b from-zinc-800/80 to-zinc-950 p-4`}
        style={{
          borderColor: colorAlpha(teamColor, 0.35),
          boxShadow: `0 8px 32px ${colorAlpha(teamColor, 0.12)}`,
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="h-24 w-24 rounded-lg bg-white/[0.04]" />
        )}
      </div>
    </div>
  );
}

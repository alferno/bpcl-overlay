import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import { withBaseUrl } from "../../asset-paths";

import { formatSeriesLabel } from "../../draft/broadcast-theme";
import { colorAlpha } from "../../draft/team-colors";

export function draftTeamSides(draft: DraftState, leagueConfig?: LeagueConfig) {
  let radiantName = draft.radiant?.name ?? draft.series.teamA ?? "Radiant";
  let direName = draft.dire?.name ?? draft.series.teamB ?? "Dire";
  let radiantLogo = withBaseUrl(draft.radiant?.logoUrl ?? draft.series.logoUrlA);
  let direLogo = withBaseUrl(draft.dire?.logoUrl ?? draft.series.logoUrlB);

  // Force resolve from live leagueConfig if available
  if (leagueConfig?.matchSetup) {
    const roster = leagueConfig.roster ?? [];
    const rKey = leagueConfig.matchSetup.radiantTeamKey;
    const dKey = leagueConfig.matchSetup.direTeamKey;

    if (rKey) {
      const p = roster.find(r => r.teamKey === rKey);
      if (p) radiantName = p.teamName || p.teamKey || radiantName;
    }
    if (dKey) {
      const p = roster.find(r => r.teamKey === dKey);
      if (p) direName = p.teamName || p.teamKey || direName;
    }
  }

  return {
    radiantName,
    direName,
    radiantLogo,
    direLogo,
    scoreLabel:
      draft.series.scoreA > 0 || draft.series.scoreB > 0
        ? `${draft.series.scoreA} – ${draft.series.scoreB}`
        : null,
  };
}

export function DraftTeamFaceoff({
  draft,
  size = "large",
  teamColors,
  leagueConfig,
  spread = false,
}: {
  draft: DraftState;
  size?: "medium" | "large";
  teamColors?: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
  /** Wider logo separation for pre-draft countdown */
  spread?: boolean;
}) {
  const { radiantName, direName, radiantLogo, direLogo, scoreLabel } =
    draftTeamSides(draft, leagueConfig);

  const logoBox = size === "large" ? "h-[120px] w-[120px]" : "h-[76px] w-[76px]";
  const nameClass =
    size === "large"
      ? "font-display text-2xl tracking-wide"
      : "font-display text-xl tracking-wide";

  if (spread) {
    return (
      <div className="flex w-full max-w-[1100px] flex-col items-center gap-8">
        <div className="text-center">
          <p className="font-heading text-sm font-semibold tracking-[0.28em] text-slate-400">
            {formatSeriesLabel(draft, leagueConfig)}
          </p>
        </div>

        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-6 px-4">
          <TeamSide
            name={radiantName}
            logoUrl={radiantLogo}
            boxClass={logoBox}
            nameClass={nameClass}
            teamColor={teamColors?.radiant}
            align="end"
          />

          <div className="flex flex-col items-center justify-center gap-2 px-6 pt-10">
            <span className="font-display text-4xl leading-none tracking-[0.2em] text-slate-300">
              VS
            </span>
            {scoreLabel ? (
              <p className="font-heading text-sm font-bold tracking-[0.2em] text-slate-400">
                {scoreLabel}
              </p>
            ) : null}
          </div>

          <TeamSide
            name={direName}
            logoUrl={direLogo}
            boxClass={logoBox}
            nameClass={nameClass}
            teamColor={teamColors?.dire}
            align="start"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-heading text-sm font-semibold tracking-[0.22em] text-slate-400">
        {scoreLabel
          ? `SERIES ${scoreLabel}`
          : formatSeriesLabel(draft, leagueConfig)}
      </p>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-5">
          <TeamLogoMark
            name={radiantName}
            logoUrl={radiantLogo}
            boxClass={logoBox}
            teamColor={teamColors?.radiant}
          />
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-3xl leading-none tracking-widest text-slate-300">
              VS
            </span>
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <TeamLogoMark
            name={direName}
            logoUrl={direLogo}
            boxClass={logoBox}
            teamColor={teamColors?.dire}
          />
        </div>
        <div className="flex items-start justify-center gap-5">
          <p
            className={`w-[140px] truncate text-center ${nameClass} text-slate-200`}
          >
            {radiantName.toUpperCase()}
          </p>
          <span className="w-12 shrink-0" aria-hidden />
          <p
            className={`w-[140px] truncate text-center ${nameClass} text-slate-200`}
          >
            {direName.toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamSide({
  name,
  logoUrl,
  boxClass,
  nameClass,
  teamColor,
  align,
}: {
  name: string;
  logoUrl?: string;
  boxClass: string;
  nameClass: string;
  teamColor?: string;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex flex-col gap-4 ${
        align === "end" ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <TeamLogoMark
        name={name}
        logoUrl={logoUrl}
        boxClass={boxClass}
        teamColor={teamColor}
      />
      <p className={`max-w-[220px] truncate ${nameClass} text-slate-100`}>
        {name.toUpperCase()}
      </p>
    </div>
  );
}

function TeamLogoMark({
  name,
  logoUrl,
  boxClass,
  teamColor,
}: {
  name: string;
  logoUrl?: string;
  boxClass: string;
  teamColor?: string;
}) {
  const accent = teamColor ?? "#60a5fa";
  return (
    <div className="relative shrink-0">
      <div
        className="animate-logo-glow pointer-events-none absolute inset-0 m-auto h-24 w-24 rounded-full blur-2xl"
        style={{ backgroundColor: colorAlpha(accent, 0.28) }}
      />
      <div
        className={`relative flex ${boxClass} items-center justify-center rounded-xl border bg-gradient-to-b from-zinc-800/80 to-zinc-950 p-3`}
        style={{
          borderColor: colorAlpha(accent, 0.35),
          boxShadow: `0 8px 32px ${colorAlpha(accent, 0.12)}`,
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-white/[0.04]" />
        )}
      </div>
    </div>
  );
}

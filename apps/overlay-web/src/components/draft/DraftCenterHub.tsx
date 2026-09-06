import type { DraftState, LeagueConfig, ProductionSettings } from "@bpc/shared-types";
import { BROADCAST_LEAGUE_TITLE } from "@bpc/shared-types";
import { formatDraftSeconds, resolveTurnAction } from "../../draft/slot-utils";
import { useDraftCountdown } from "../../draft/useDraftCountdown";
import { colorAlpha } from "../../draft/team-colors";
import { resolveBroadcastTheme } from "../../draft/theme-colors";
import { resolveSeriesMeta } from "../../draft/broadcast-theme";
import { withBaseUrl } from "../../asset-paths";
import { memo } from "react";

export const DraftCenterHub = memo(function DraftCenterHub({
  draft,
  teamColors,
  leagueConfig,
  production,
}: {
  draft: DraftState;
  teamColors: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
}) {
  const action = resolveTurnAction(draft);
  const timerKey = `${draft.activeTeam}-${action}-${draft.turnSecondsRemaining}`;
  const turnSeconds = useDraftCountdown(draft.turnSecondsRemaining, timerKey);
  const reserveDisplayRadiant = Math.max(0, Math.floor(draft.radiant?.bonusTime ?? draft.reserveSeconds ?? 0));
  const reserveDisplayDire = Math.max(0, Math.floor(draft.dire?.bonusTime ?? draft.reserveSeconds ?? 0));
  const theme = resolveBroadcastTheme(production);

  const logoA = withBaseUrl(draft.radiant?.logoUrl ?? draft.series.logoUrlA);
  const logoB = withBaseUrl(draft.dire?.logoUrl ?? draft.series.logoUrlB);
  const { bestOf, game } = resolveSeriesMeta(draft, leagueConfig);
  const boLabel = bestOf === 1 ? "BO1" : bestOf === 5 ? "BO5" : "BO3";
  const stage = leagueConfig?.matchSetup?.stageLabel ?? "";

  const showTurnArrow = Boolean(draft.activeTeam) && draft.phase !== "done";
  const teamNameA = draft.radiant?.name ?? draft.series.teamA;
  const teamNameB = draft.dire?.name ?? draft.series.teamB;

  const isRadiantReserveActive = draft.activeTeam === "radiant" && turnSeconds === 0 && draft.phase !== "done";
  const isDireReserveActive = draft.activeTeam === "dire" && turnSeconds === 0 && draft.phase !== "done";

  return (
    <div className="relative flex w-[300px] shrink-0 flex-col justify-center rounded-lg px-6 py-4 font-body"
      style={{
        height: 236, // Match DRAFT_PICK_HEIGHT
        background: "linear-gradient(135deg, rgb(30 35 45 / 0.95) 0%, rgb(15 17 22 / 0.98) 100%)",
        borderLeft: `3px solid ${teamColors.radiant}`,
        borderRight: `3px solid ${teamColors.dire}`,
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Top: Game Number */}
      <div className="absolute top-3 left-0 right-0 flex justify-center">
        <div className="text-[10px] font-black tracking-[0.2em] text-amber-500 uppercase whitespace-nowrap">
          {stage}
        </div>
      </div>

      {/* Middle: Team Logos & Priority */}
      <div className="flex items-center justify-between px-2 mb-4 mt-4">
        <div className="flex flex-col items-center gap-2 z-10">
          <TeamLogo src={logoA} color={teamColors.radiant} />
          <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase truncate w-24 text-center">
            {teamNameA}
          </span>
        </div>
        
        {/* Priority Arrow */}
        <div className="flex flex-col items-center justify-center relative w-16">
          {showTurnArrow ? (
            <div 
              className="font-bold text-4xl leading-none transition-transform duration-300"
              style={{
                color: theme.accent,
                filter: `drop-shadow(0 0 12px ${theme.primary}80)`,
                transform: draft.activeTeam === "radiant" ? "scaleX(-1)" : "none",
              }}
            >
              ➤
            </div>
          ) : (
            <div className="text-slate-500 font-bold text-2xl">—</div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 z-10">
          <TeamLogo src={logoB} color={teamColors.dire} />
          <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase truncate w-24 text-center">
            {teamNameB}
          </span>
        </div>
      </div>

      {/* Bottom: Timers */}
      <div className="flex items-center justify-between">
        <div className={`text-center w-20 transition-colors duration-300 ${isRadiantReserveActive ? 'animate-pulse' : ''}`}>
          <p className={`text-[9px] font-bold tracking-widest ${isRadiantReserveActive ? 'text-amber-500' : 'text-slate-400'}`}>RESERVE</p>
          <p className={`font-heading text-xl font-bold tabular-nums leading-none ${isRadiantReserveActive ? 'text-amber-400' : 'text-slate-200'}`}>
            {formatDraftSeconds(reserveDisplayRadiant)}
          </p>
        </div>
        
        <div className="text-center rounded px-4 py-1">
          <p 
            className="text-[10px] font-bold tracking-widest"
            style={{ color: theme.accent }}
          >
            {action === "ban" ? "BANNING" : "PICKING"}
          </p>
          <p className="font-heading text-4xl font-bold tabular-nums text-white leading-none drop-shadow-md">
            {formatDraftSeconds(turnSeconds)}
          </p>
        </div>

        <div className={`text-center w-20 transition-colors duration-300 ${isDireReserveActive ? 'animate-pulse' : ''}`}>
          <p className={`text-[9px] font-bold tracking-widest ${isDireReserveActive ? 'text-amber-500' : 'text-slate-400'}`}>RESERVE</p>
          <p className={`font-heading text-xl font-bold tabular-nums leading-none ${isDireReserveActive ? 'text-amber-400' : 'text-slate-200'}`}>
            {formatDraftSeconds(reserveDisplayDire)}
          </p>
        </div>
      </div>
    </div>
  );
});

function TeamLogo({ src, color }: { src?: string; color: string }) {
  return (
    <div className="h-[72px] w-[72px] p-1.5 rounded-lg bg-black/60 border flex items-center justify-center shrink-0"
         style={{ borderColor: colorAlpha(color, 0.4), boxShadow: `0 4px 16px ${colorAlpha(color, 0.2)}` }}>
      {src ? (
        <img src={src} className="h-full w-full object-contain filter drop-shadow-md" alt="" />
      ) : (
        <div className="h-10 w-10 rounded bg-white/5" />
      )}
    </div>
  );
}

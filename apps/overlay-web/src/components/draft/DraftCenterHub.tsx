import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import { BROADCAST_LEAGUE_TITLE } from "@bpc/shared-types";
import { formatDraftSeconds, resolveTurnAction } from "../../draft/slot-utils";
import { useDraftCountdown } from "../../draft/useDraftCountdown";
import { colorAlpha } from "../../draft/team-colors";
import { resolveSeriesMeta } from "../../draft/broadcast-theme";
import { withBaseUrl } from "../../asset-paths";

export function DraftCenterHub({
  draft,
  teamColors,
  leagueConfig,
}: {
  draft: DraftState;
  teamColors: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
}) {
  const action = resolveTurnAction(draft);
  const timerKey = `${draft.activeTeam}-${action}-${draft.turnSecondsRemaining}`;
  const turnSeconds = useDraftCountdown(draft.turnSecondsRemaining, timerKey);
  const reserveDisplayRadiant = Math.max(0, Math.floor(draft.radiant?.bonusTime ?? draft.reserveSeconds ?? 0));
  const reserveDisplayDire = Math.max(0, Math.floor(draft.dire?.bonusTime ?? draft.reserveSeconds ?? 0));

  const logoA = withBaseUrl(draft.radiant?.logoUrl ?? draft.series.logoUrlA);
  const logoB = withBaseUrl(draft.dire?.logoUrl ?? draft.series.logoUrlB);
  const { bestOf, game } = resolveSeriesMeta(draft, leagueConfig);
  const boLabel = bestOf === 1 ? "BO1" : bestOf === 5 ? "BO5" : "BO3";
  const stage = leagueConfig?.matchSetup?.stageLabel ?? "";

  const showTurnArrow = Boolean(draft.activeTeam) && draft.phase !== "done";
  const emeraldAccent = "#10b981"; // Regen rune green
  const teamNameA = draft.radiant?.name ?? draft.series.teamA;
  const teamNameB = draft.dire?.name ?? draft.series.teamB;

  const isRadiantReserveActive = draft.activeTeam === "radiant" && turnSeconds === 0 && draft.phase !== "done";
  const isDireReserveActive = draft.activeTeam === "dire" && turnSeconds === 0 && draft.phase !== "done";

  return (
    <div className="relative flex h-full w-[400px] shrink-0 flex-col justify-center rounded-lg px-6 py-4 font-body"
      style={{
        background: "linear-gradient(180deg, rgb(30 32 36 / 0.95) 0%, rgb(18 20 24 / 0.95) 100%)",
        border: `1px solid rgba(255,255,255,0.1)`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      {/* Middle: Team Logos & Priority */}
      <div className="flex items-center justify-between px-2 mb-6 mt-2">
        <div className="flex flex-col items-center gap-2">
          <TeamLogo src={logoA} color={teamColors.radiant} />
          <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase truncate w-24 text-center">
            {teamNameA}
          </span>
        </div>
        
        {/* Priority Arrow */}
        <div className="flex flex-col items-center justify-center relative w-16">
          {showTurnArrow ? (
            <div 
              className="text-emerald-400 font-bold text-4xl leading-none transition-transform duration-300"
              style={{
                transform: draft.activeTeam === "radiant" ? "scaleX(-1)" : "none",
              }}
            >
              ➤
            </div>
          ) : (
            <div className="text-slate-600 font-bold text-2xl">—</div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <TeamLogo src={logoB} color={teamColors.dire} />
          <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase truncate w-24 text-center">
            {teamNameB}
          </span>
        </div>
      </div>

      {/* Bottom: Timers */}
      <div className="flex items-center justify-between">
        <div className={`text-center w-20 transition-colors duration-300 ${isRadiantReserveActive ? 'animate-pulse' : ''}`}>
          <p className={`text-[9px] font-bold tracking-widest ${isRadiantReserveActive ? 'text-amber-500' : 'text-slate-500'}`}>RESERVE</p>
          <p className={`font-heading text-xl font-bold tabular-nums leading-none ${isRadiantReserveActive ? 'text-amber-400' : 'text-slate-300'}`}>
            {formatDraftSeconds(reserveDisplayRadiant)}
          </p>
        </div>
        
        <div className="text-center rounded px-4 py-1">
          <p className="text-[10px] font-bold tracking-widest text-emerald-500">{action === "ban" ? "BANNING" : "PICKING"}</p>
          <p className="font-heading text-3xl font-bold tabular-nums text-white leading-none">
            {formatDraftSeconds(turnSeconds)}
          </p>
        </div>

        <div className={`text-center w-20 transition-colors duration-300 ${isDireReserveActive ? 'animate-pulse' : ''}`}>
          <p className={`text-[9px] font-bold tracking-widest ${isDireReserveActive ? 'text-amber-500' : 'text-slate-500'}`}>RESERVE</p>
          <p className={`font-heading text-xl font-bold tabular-nums leading-none ${isDireReserveActive ? 'text-amber-400' : 'text-slate-300'}`}>
            {formatDraftSeconds(reserveDisplayDire)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamLogo({ src, color }: { src?: string; color: string }) {
  return (
    <div className="h-16 w-16 p-1 rounded-lg bg-black/50 border flex items-center justify-center shrink-0"
         style={{ borderColor: colorAlpha(color, 0.3), boxShadow: `0 0 16px ${colorAlpha(color, 0.15)}` }}>
      {src ? (
        <img src={src} className="h-full w-full object-contain" alt="" />
      ) : (
        <div className="h-8 w-8 rounded bg-white/5" />
      )}
    </div>
  );
}

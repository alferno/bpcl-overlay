import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import { BROADCAST_LEAGUE_TITLE } from "@bpc/shared-types";

export function DraftBroadcastHeader({
  draft,
  stageLabel,
  teamColors,
  leagueConfig,
}: {
  draft: DraftState;
  stageLabel?: string;
  teamColors?: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
}) {
  const stage = stageLabel?.trim() ?? "";
  const teamNameA = draft.radiant?.name ?? draft.series.teamA;
  const teamNameB = draft.dire?.name ?? draft.series.teamB;

  return (
    <div
      className="relative flex w-full justify-between items-center gap-3 rounded-lg border border-white/10 px-6 py-2 font-body"
      style={{
        background: "linear-gradient(180deg, rgb(30 32 36 / 0.95) 0%, rgb(18 20 24 / 0.95) 100%)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <p className="flex-1 truncate text-left font-dota text-lg font-bold uppercase tracking-widest text-slate-100" style={{ textShadow: teamColors?.radiant ? `0 0 10px ${teamColors.radiant}80` : undefined }}>
        {teamNameA || "RADIANT"}
      </p>

      <p className="flex-1 truncate text-center font-dota text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
        {BROADCAST_LEAGUE_TITLE} {stage ? `- ${stage}` : ""}
      </p>

      <p className="flex-1 truncate text-right font-dota text-lg font-bold uppercase tracking-widest text-slate-100" style={{ textShadow: teamColors?.dire ? `0 0 10px ${teamColors.dire}80` : undefined }}>
        {teamNameB || "DIRE"}
      </p>
    </div>
  );
}

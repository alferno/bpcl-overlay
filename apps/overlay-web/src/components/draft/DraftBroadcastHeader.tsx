import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import { BROADCAST_LEAGUE_TITLE } from "@bpc/shared-types";

export function DraftBroadcastHeader({
  stageLabel,
}: {
  draft: DraftState;
  stageLabel?: string;
  teamColors?: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
}) {
  const stage = stageLabel?.trim() ?? "";

  return (
    <div
      className="relative flex w-full justify-between items-center gap-3 rounded-lg border border-white/10 px-6 py-2 font-body"
      style={{
        background: "linear-gradient(180deg, rgb(30 32 36 / 0.95) 0%, rgb(18 20 24 / 0.95) 100%)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <p className="truncate text-left font-dota text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
        {BROADCAST_LEAGUE_TITLE}
      </p>

      <p className="truncate text-right font-dota text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
        {stage || "\u00a0"}
      </p>
    </div>
  );
}

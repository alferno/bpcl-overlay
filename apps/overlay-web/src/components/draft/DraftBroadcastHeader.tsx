import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import { BROADCAST_LEAGUE_TITLE } from "@bpc/shared-types";

import { resolveSeriesMeta } from "../../draft/broadcast-theme";
import { colorAlpha } from "../../draft/team-colors";

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
  const scoreA = draft.series?.scoreA ?? 0;
  const scoreB = draft.series?.scoreB ?? 0;
  const stage = stageLabel?.trim() ?? "";
  const accent = teamColors?.radiant ?? "#94a3b8";

  const { bestOf, game } = resolveSeriesMeta(draft, leagueConfig);
  const boLabel = bestOf === 1 ? "BO1" : bestOf === 5 ? "BO5" : "BO3";

  return (
    <div
      className="relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-white/10 px-6 py-2 font-body"
      style={{
        background: "linear-gradient(180deg, rgb(30 32 36 / 0.95) 0%, rgb(18 20 24 / 0.95) 100%)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <p className="truncate text-left font-dota text-sm font-semibold uppercase tracking-[0.12em] text-slate-300">
        {BROADCAST_LEAGUE_TITLE}
      </p>

      <div className="flex flex-col items-center px-4">
        <div className="flex items-baseline gap-2">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
            Series {boLabel} - Game {game}
          </p>
        </div>
        <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums leading-none text-white">
          {scoreA}
          <span className="mx-3 text-zinc-500">–</span>
          {scoreB}
        </p>
      </div>

      <p className="truncate text-right font-dota text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
        {stage || "\u00a0"}
      </p>
    </div>
  );
}

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
      className="relative mb-2 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-white/[0.08] px-3 py-2.5 font-body"
      style={{
        background:
          "linear-gradient(180deg, rgb(18 18 20 / 0.98) 0%, rgb(8 8 10 / 0.95) 100%)",
        boxShadow: `0 4px 24px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.06)`,
      }}
    >
      <p className="broadcast-header-side-title truncate text-left font-dota font-semibold uppercase tracking-[0.12em] text-slate-200">
        {BROADCAST_LEAGUE_TITLE}
      </p>

      <div className="flex flex-col items-center px-4">
        <div className="flex items-baseline gap-2">
          <p
            className="font-heading text-sm font-bold uppercase tracking-[0.32em] text-white"
            style={{ textShadow: "0 0 14px rgb(255 255 255 / 0.4)" }}
          >
            Series
          </p>
          <p className="font-heading text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
            {boLabel} · Game {game}
          </p>
        </div>
        <p
          className="mt-1 font-heading text-3xl font-bold tabular-nums leading-none text-white"
          style={{ textShadow: `0 0 20px ${colorAlpha(accent, 0.35)}` }}
        >
          {scoreA}
          <span className="mx-2 text-zinc-500">–</span>
          {scoreB}
        </p>
      </div>

      <p className="broadcast-header-side-title truncate text-right font-dota font-semibold uppercase tracking-[0.14em] text-slate-300">
        {stage || "\u00a0"}
      </p>
    </div>
  );
}

import type {
  DraftState,
  LeagueConfig,
  PlayerHeroLeagueStats,
  ProductionSettings,
  TournamentHeroAggregate,
} from "@bpc/shared-types";
import { AnimatePresence } from "framer-motion";

import type { StatsQueueItem } from "../../hooks/useDraftPickReveal";
import { DraftPickStatsPanel } from "./DraftPickStatsPanel";

export function DraftPickStatsStack({
  items,
  draft,
  leagueConfig,
  tournamentHeroIndex,
  playerHeroIndex,
  production,
}: {
  items: StatsQueueItem[];
  draft?: DraftState | null;
  leagueConfig?: LeagueConfig;
  tournamentHeroIndex?: Record<string, TournamentHeroAggregate>;
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>;
  production?: ProductionSettings | null;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-8 top-8 z-[55] flex max-h-[min(920px,85vh)] flex-col items-end gap-3 overflow-hidden">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const heroStats =
            item.pick.heroId != null
              ? tournamentHeroIndex?.[String(item.pick.heroId)]
              : undefined;
          return (
            <DraftPickStatsPanel
              key={item.key}
              pick={item.pick}
              draft={draft}
              leagueConfig={leagueConfig}
              tournamentStats={heroStats}
              playerHeroIndex={playerHeroIndex}
              production={production}
              stacked
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

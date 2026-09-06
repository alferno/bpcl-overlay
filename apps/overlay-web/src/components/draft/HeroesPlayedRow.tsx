import type { PlayerHeroLeagueStats } from "@bpc/shared-types";
import { useMemo } from "react";
import { resolveOverlayPortraitForHero } from "../../hero-portrait";

type HeroEntry = {
  heroId: number;
  games: number;
  wins: number;
  winRate: number;
};

function HeroChip({ heroId, games, wins, winRate }: HeroEntry) {
  const pct = Math.round(winRate * 100);
  const losses = games - wins;
  const borderColor =
    pct >= 60
      ? "border-emerald-500/60"
      : pct >= 45
        ? "border-yellow-500/40"
        : "border-red-500/40";
  const bg =
    pct >= 60
      ? "bg-emerald-900/20"
      : pct >= 45
        ? "bg-yellow-900/10"
        : "bg-red-900/10";

  const portraitUrl = heroPortraitUrl(heroId);

  return (
    <div
      className={`relative flex flex-col items-center gap-0.5 p-1 rounded-md border ${borderColor} ${bg} min-w-[48px]`}
      title={`${games} game${games === 1 ? "" : "s"} · ${wins}W ${losses}L (${pct}%)`}
    >
      <div className="w-9 h-9 rounded overflow-hidden bg-slate-800">
        {portraitUrl ? (
          <img src={portraitUrl} alt={`hero ${heroId}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-[10px]">{heroId}</div>
        )}
      </div>
      <span className="text-[9px] font-mono text-slate-300 leading-none">{games}G</span>
      <span className={`text-[9px] font-mono leading-none ${pct >= 60 ? "text-emerald-400" : pct >= 45 ? "text-yellow-300" : "text-red-400"}`}>
        {pct}%
      </span>
    </div>
  );
}

/**
 * Horizontal strip of hero icons for all heroes a player has played in the tournament.
 * Only renders when the player has played 3+ distinct heroes.
 */
export function HeroesPlayedRow({
  steam32,
  playerHeroIndex,
  maxShown = 8,
  minHeroesRequired = 3,
}: {
  steam32: number;
  playerHeroIndex: Record<string, PlayerHeroLeagueStats>;
  maxShown?: number;
  minHeroesRequired?: number;
}) {
  const heroes = useMemo(() => {
    const prefix = `${steam32}:`;
    const entries: HeroEntry[] = [];
    for (const [key, stats] of Object.entries(playerHeroIndex)) {
      if (!key.startsWith(prefix) || stats.games <= 0) continue;
      const heroId = parseInt(key.split(":")[1], 10);
      if (isNaN(heroId)) continue;
      entries.push({
        heroId,
        games: stats.games,
        wins: stats.wins,
        winRate: stats.winRate,
      });
    }
    // Sort by games desc
    entries.sort((a, b) => b.games - a.games);
    return entries;
  }, [steam32, playerHeroIndex]);

  if (heroes.length < minHeroesRequired) return null;

  const shown = heroes.slice(0, maxShown);
  const remaining = heroes.length - shown.length;

  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-2">
        Heroes in BPCL ({heroes.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((h) => (
          <HeroChip key={h.heroId} {...h} />
        ))}
        {remaining > 0 && (
          <div className="flex items-center justify-center w-9 h-9 rounded-md border border-white/10 text-slate-400 text-[11px] font-mono">
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}

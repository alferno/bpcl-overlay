import type { LikelyPlayer } from "../../draft/likely-players";
import { PlayerAvatar } from "../PlayerAvatar";
import { withBaseUrl } from "../../asset-paths";

function WinLossBadge({ wins, losses, winRate }: { wins: number; losses: number; winRate: number }) {
  const pct = Math.round(winRate * 100);
  const color = pct >= 60 ? "text-emerald-400" : pct >= 45 ? "text-yellow-300" : "text-red-400";
  return (
    <span className={`text-[11px] font-mono font-bold tabular-nums ${color}`}>
      {wins}W/{losses}L · {pct}%
    </span>
  );
}

function SourceBadge({ source }: { source: "tournament" | "role_match" }) {
  if (source === "tournament") {
    return (
      <span className="text-[9px] uppercase tracking-wider text-purple-300 bg-purple-900/40 border border-purple-500/20 rounded px-1.5 py-0.5">
        BPCL Played
      </span>
    );
  }
  return (
    <span className="text-[9px] uppercase tracking-wider text-slate-400 bg-slate-800/40 border border-slate-600/20 rounded px-1.5 py-0.5">
      Role match
    </span>
  );
}

export function LikelyPlayersChip({ candidates }: { candidates: LikelyPlayer[] }) {
  if (!candidates.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Likely to play</p>
      {candidates.map(({ player, stats, source }) => {
        const losses = stats ? stats.games - stats.wins : 0;
        return (
          <div
            key={player.steam32}
            className="flex items-center gap-2.5 bg-slate-900/60 border border-white/5 rounded-lg px-3 py-2"
          >
            <PlayerAvatar url={player.avatarUrl ? withBaseUrl(player.avatarUrl) : undefined} name={player.displayName} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-bold leading-tight truncate">
                {player.displayName}
              </div>
              {stats && stats.games > 0 ? (
                <WinLossBadge wins={stats.wins} losses={losses} winRate={stats.winRate} />
              ) : (
                <span className="text-slate-500 text-[11px]">No games on hero</span>
              )}
            </div>
            <SourceBadge source={source} />
          </div>
        );
      })}
    </div>
  );
}

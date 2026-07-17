import type { LeagueConfig, PlayerHeroLeagueStats } from "@bpc/shared-types";
import { colorAlpha } from "../../draft/team-colors";
import { withBaseUrl } from "../../asset-paths";

export function DraftDataOverlay({
  leagueConfig,
  teamColors,
  playerHeroIndex,
}: {
  leagueConfig?: LeagueConfig;
  teamColors: { radiant: string; dire: string };
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>;
}) {
  return (
    <DraftStatsView
      leagueConfig={leagueConfig}
      teamColors={teamColors}
      playerHeroIndex={playerHeroIndex}
    />
  );
}



function DraftStatsView({
  leagueConfig,
  teamColors,
  playerHeroIndex,
}: {
  leagueConfig?: LeagueConfig;
  teamColors: { radiant: string; dire: string };
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>;
}) {
  const matchSetup = leagueConfig?.matchSetup;
  const roster = leagueConfig?.roster ?? [];
  const radiantKey = matchSetup?.radiantTeamKey;
  const direKey = matchSetup?.direTeamKey;

  const radiantRaw = radiantKey ? roster.filter((p) => p.teamKey === radiantKey) : [];
  const direRaw = direKey ? roster.filter((p) => p.teamKey === direKey) : [];

  const getOrderedPlayers = (raw: typeof roster, pickPlayers?: number[]) => {
    return Array.from({ length: 5 })
      .map((_, i) => {
        const steam32 = pickPlayers?.[i] ?? raw[i]?.steam32;
        if (!steam32) return null;
        return roster.find((p) => p.steam32 === steam32) || raw[i];
      })
      .filter((p): p is typeof roster[0] => Boolean(p));
  };

  const radiantPlayers = getOrderedPlayers(radiantRaw, matchSetup?.pickPlayers?.radiant);
  const direPlayers = getOrderedPlayers(direRaw, matchSetup?.pickPlayers?.dire);

  const getPlayerStats = (steam32: number) => {
    if (!playerHeroIndex) return null;
    let games = 0;
    let wins = 0;
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;

    for (const [key, stats] of Object.entries(playerHeroIndex)) {
      if (key.startsWith(`${steam32}:`)) {
        games += stats.games;
        wins += stats.wins;
        totalKills += stats.avgKills * stats.games;
        totalDeaths += stats.avgDeaths * stats.games;
        totalAssists += stats.avgAssists * stats.games;
      }
    }

    if (games === 0) return null;
    const losses = games - wins;
    const winRate = Math.round((wins / games) * 100);
    const kda = totalDeaths > 0 ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : (totalKills + totalAssists).toFixed(2);
    
    return `${wins}W - ${losses}L • ${kda} KDA • ${winRate}% WIN`;
  };

  const renderTeamStats = (players: typeof roster, color: string, isRight: boolean) => {
    return (
      <div className="flex flex-col gap-4 w-[450px]">
        {players.map((p) => {
          const meme = matchSetup?.playerMemes?.[String(p.steam32)];
          const stats = !meme ? getPlayerStats(p.steam32) : null;
          
          return (
            <div key={p.steam32} className={`flex items-center gap-4 bg-slate-950/80 backdrop-blur-md rounded-xl p-3 border shadow-2xl ${isRight ? 'flex-row-reverse text-right' : ''}`} style={{ borderColor: colorAlpha(color, 0.4), boxShadow: `0 10px 30px ${colorAlpha(color, 0.15)}` }}>
              <div className="h-16 w-16 rounded-lg bg-slate-900 border border-white/20 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-slate-500">
                {p.avatarUrl ? <img src={withBaseUrl(p.avatarUrl)} alt="" className="w-full h-full object-cover" /> : p.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-white font-black text-xl leading-tight truncate" style={{ textShadow: `0 0 15px ${colorAlpha(color, 0.8)}` }}>{p.displayName}</div>
                {meme ? (
                  <div className={`mt-1`}>
                    <span className="text-amber-400 text-xs font-mono font-black uppercase tracking-wider truncate bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(251,191,36,0.2)] inline-block">
                      {meme}
                    </span>
                  </div>
                ) : p.roles && p.roles.length > 0 ? (
                  <div className="text-sky-400 text-[11px] mt-1 font-mono font-bold uppercase tracking-widest">
                    {p.roles.join(" / ")}
                  </div>
                ) : stats ? (
                  <div className="text-slate-400 text-[11px] mt-1 font-mono uppercase tracking-widest">{stats}</div>
                ) : (
                  <div className="text-slate-600 text-[11px] mt-1 font-mono uppercase tracking-widest">Awaiting Stats...</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="absolute inset-x-0 top-10 left-0 right-0 w-full max-w-[1700px] mx-auto px-4 z-10 pointer-events-none">
      <div className="flex justify-between items-start w-full relative">
        {/* Radiant Stats */}
        {renderTeamStats(radiantPlayers, teamColors.radiant, false)}


        {/* Dire Stats */}
        {renderTeamStats(direPlayers, teamColors.dire, true)}
      </div>
    </div>
  );
}

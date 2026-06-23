import type { LeagueConfig } from "@bpc/shared-types";
import { colorAlpha } from "../../draft/team-colors";

export function DraftDataOverlay({
  leagueConfig,
  teamColors,
}: {
  leagueConfig?: LeagueConfig;
  teamColors: { radiant: string; dire: string };
}) {
  const matchSetup = leagueConfig?.matchSetup;
  const seriesGame = matchSetup?.seriesGame ?? 1;
  const isSeriesGame = seriesGame > 1;

  if (isSeriesGame) {
    return <DraftComparisonView game={seriesGame} teamColors={teamColors} />;
  }

  return (
    <DraftStatsView
      leagueConfig={leagueConfig}
      teamColors={teamColors}
    />
  );
}

function DraftComparisonView({ game, teamColors }: { game: number; teamColors: { radiant: string; dire: string } }) {
  // Placeholder for previous game draft comparison
  return (
    <div className="absolute inset-x-0 top-16 left-0 right-0 w-full max-w-[1600px] mx-auto px-4 z-10 pointer-events-none flex flex-col items-center">
      <div className="bg-slate-950/80 backdrop-blur-md border border-white/10 rounded-xl p-6 w-full shadow-2xl">
        <h3 className="text-xl font-black uppercase text-center text-slate-300 tracking-widest mb-6">Game {game - 1} Draft Comparison</h3>
        <div className="flex justify-between items-stretch gap-8">
          <div className="flex-1 flex flex-col gap-2 p-4 border-r border-white/10" style={{ borderRightColor: colorAlpha(teamColors.radiant, 0.3) }}>
            <span className="text-sm font-bold text-emerald-400 mb-2">RADIANT PICKS (G{game - 1})</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 flex-1 bg-black/50 border border-emerald-500/20 rounded-lg flex items-center justify-center text-slate-600 text-xs font-mono shadow-inner shadow-emerald-500/5">Hero {i}</div>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2 p-4 border-l border-white/10" style={{ borderLeftColor: colorAlpha(teamColors.dire, 0.3) }}>
            <span className="text-sm font-bold text-red-400 mb-2 text-right">DIRE PICKS (G{game - 1})</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 flex-1 bg-black/50 border border-red-500/20 rounded-lg flex items-center justify-center text-slate-600 text-xs font-mono shadow-inner shadow-red-500/5">Hero {i}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftStatsView({
  leagueConfig,
  teamColors,
}: {
  leagueConfig?: LeagueConfig;
  teamColors: { radiant: string; dire: string };
}) {
  const matchSetup = leagueConfig?.matchSetup;
  const roster = leagueConfig?.roster ?? [];
  const radiantKey = matchSetup?.radiantTeamKey;
  const direKey = matchSetup?.direTeamKey;

  const radiantPlayers = roster.filter((p) => p.teamKey === radiantKey);
  const direPlayers = roster.filter((p) => p.teamKey === direKey);

  const renderTeamStats = (players: typeof roster, color: string, isRight: boolean) => {
    return (
      <div className="flex flex-col gap-4 w-[450px]">
        {players.map((p) => {
          const meme = matchSetup?.playerMemes?.[String(p.steam32)];
          return (
            <div key={p.steam32} className={`flex items-center gap-4 bg-slate-950/80 backdrop-blur-md rounded-xl p-3 border shadow-2xl ${isRight ? 'flex-row-reverse text-right' : ''}`} style={{ borderColor: colorAlpha(color, 0.4), boxShadow: `0 10px 30px ${colorAlpha(color, 0.15)}` }}>
              <div className="h-16 w-16 rounded-lg bg-slate-900 border border-white/20 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-slate-500">
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : p.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-white font-black text-xl leading-tight truncate" style={{ textShadow: `0 0 15px ${colorAlpha(color, 0.8)}` }}>{p.displayName}</div>
                {meme ? (
                  <div className={`mt-1`}>
                    <span className="text-amber-400 text-xs font-mono font-black uppercase tracking-wider truncate bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(251,191,36,0.2)] inline-block">
                      {meme}
                    </span>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs mt-1 font-mono uppercase tracking-widest">Awaiting Stats...</div>
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
      <div className="flex justify-between items-start w-full">
        {/* Radiant Stats */}
        {renderTeamStats(radiantPlayers, teamColors.radiant, false)}
        
        {/* Dire Stats */}
        {renderTeamStats(direPlayers, teamColors.dire, true)}
      </div>
    </div>
  );
}

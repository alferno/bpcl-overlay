import { useOverlayState } from "../OverlaySocketLayer";
import { withBaseUrl } from "../asset-paths";

function getRankFromMmr(mmr?: number) {
  if (mmr === undefined || mmr === null || mmr === 0) return "uncalibrated";
  if (mmr >= 5620) return "immortal";
  if (mmr >= 4620) return "divine";
  if (mmr >= 3850) return "ancient";
  if (mmr >= 3080) return "legend";
  if (mmr >= 2310) return "archon";
  if (mmr >= 1540) return "crusader";
  if (mmr >= 770) return "guardian";
  return "herald";
}

export function RankMedalsHUD() {
  const { state } = useOverlayState();
  const roster = state?.leagueConfig?.roster || [];
  const matchSetup = state?.leagueConfig?.matchSetup;

  // Determine Radiant players (from pickPlayers, or fallback to roster team mapping)
  const radiantRaw = roster.filter((p) => p.teamKey === matchSetup?.radiantTeamKey);
  const radiantPlayers = Array.from({ length: 5 }).map((_, i) => {
    if (matchSetup?.pickPlayers?.radiant?.[i]) return matchSetup.pickPlayers.radiant[i];
    return radiantRaw[i]?.steam32 ?? -(i + 1);
  });

  // Determine Dire players
  const direRaw = roster.filter((p) => p.teamKey === matchSetup?.direTeamKey);
  const direPlayers = Array.from({ length: 5 }).map((_, i) => {
    if (matchSetup?.pickPlayers?.dire?.[i]) return matchSetup.pickPlayers.dire[i];
    return direRaw[i]?.steam32 ?? -(i + 10);
  });

  const renderMedal = (steam32: number | null | undefined, index: number) => {
    const player = steam32 ? roster.find((p) => p.steam32 === steam32) : null;
    let mmr = player?.mmr;

    // Developer Test Mode: if steam32 is negative, inject a mock MMR
    if (steam32 && steam32 < 0) {
      const mockMmrs = [500, 1200, 2000, 2500, 3500, 4200, 5000, 6000, 6500, 0];
      mmr = mockMmrs[(Math.abs(steam32) - 1) % mockMmrs.length];
    }
    
    const rankTier = getRankFromMmr(mmr);
    const medalUrl = withBaseUrl(`/medals/${rankTier}.png`);
    
    return (
      <div key={`slot-${index}-${steam32 || 'empty'}`} className="w-[62px] flex items-center justify-center shrink-0">
        <img 
          src={medalUrl} 
          alt={rankTier} 
          className={`w-11 h-11 object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)] ${!steam32 ? 'opacity-30' : ''}`} 
        />
      </div>
    );
  };

  return (
    <div className="absolute top-[72px] left-0 w-full flex justify-center pointer-events-none z-50">
      <div className="flex items-start">
        {/* Radiant Side */}
        <div className="flex gap-[0px] mr-[165px]">
          {radiantPlayers.map((steam32, i) => renderMedal(steam32, i))}
        </div>
        
        {/* Dire Side */}
        <div className="flex gap-[0px]">
          {direPlayers.map((steam32, i) => renderMedal(steam32, i))}
        </div>
      </div>
    </div>
  );
}

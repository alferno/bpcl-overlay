import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";
import { withBaseUrl } from "../asset-paths";

export default function HighlightsPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("highlights", state);

  const matchSetup = state.leagueConfig?.matchSetup;
  const teamColors = state.leagueConfig?.teamColors || {};

  if (!matchSetup) {
    return null;
  }

  const { radiantTeamKey, direTeamKey, scoreA, scoreB, seriesBestOf } = matchSetup;
  
  const radiantLogo = withBaseUrl(`/teams/${radiantTeamKey}.png`);
  const direLogo = withBaseUrl(`/teams/${direTeamKey}.png`);
  const radiantColor = teamColors[radiantTeamKey] || "#10b981"; // Default emerald
  const direColor = teamColors[direTeamKey] || "#ef4444"; // Default red

  // Determine series string
  const seriesString = seriesBestOf === 1 ? "BO1" : `BO${seriesBestOf}`;

  return (
    <HudCanvas blend={false}>
      <FadePanel show={visible}>
        <div className="absolute inset-0 pointer-events-none flex items-end justify-end">
          {/* Diagonal Container anchored bottom-right */}
          <div 
            className="relative w-[800px] h-[220px] bg-slate-950/95 shadow-2xl overflow-hidden flex items-center pl-24 pr-12 text-white border-t-2 border-l-2 border-white/10"
            style={{ clipPath: "polygon(15% 0, 100% 0, 100% 100%, 0 100%)" }}
          >
            {/* Background Accent Gradients based on team colors */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                background: `linear-gradient(135deg, ${radiantColor} 0%, transparent 40%, transparent 60%, ${direColor} 100%)`
              }}
            />
            
            {/* Content Wrapper */}
            <div className="relative z-10 flex w-full items-center justify-between gap-8 mt-4">
              
              {/* Radiant Side */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <img 
                  src={radiantLogo} 
                  alt={radiantTeamKey} 
                  className="h-20 w-20 object-contain drop-shadow-lg"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div 
                  className="h-1 w-12 rounded-full" 
                  style={{ backgroundColor: radiantColor }}
                />
              </div>

              {/* Score Center */}
              <div className="flex flex-col items-center justify-center min-w-[200px]">
                <p className="text-sm font-black tracking-[0.3em] uppercase text-cyan-400 mb-1 drop-shadow-md">
                  {seriesString} Match Score
                </p>
                <div className="flex items-center gap-6 text-[4rem] font-black leading-none drop-shadow-2xl font-mono">
                  <span style={{ color: radiantColor }}>{scoreA}</span>
                  <span className="text-slate-500 pb-2">-</span>
                  <span style={{ color: direColor }}>{scoreB}</span>
                </div>
              </div>

              {/* Dire Side */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <img 
                  src={direLogo} 
                  alt={direTeamKey} 
                  className="h-20 w-20 object-contain drop-shadow-lg"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div 
                  className="h-1 w-12 rounded-full" 
                  style={{ backgroundColor: direColor }}
                />
              </div>

            </div>
          </div>
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

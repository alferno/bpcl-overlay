import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";

export default function HighlightsPage() {
  const { state } = useOverlayState();
  // Always visible because it's used in a standalone OBS scene for highlights
  const visible = true;

  const matchSetup = state.leagueConfig?.matchSetup;
  const highlights = state.leagueConfig?.highlights || {};

  const sponsorText = highlights.sponsorText || "Powered by: Nuvorn Technologies";
  const mainHeading = highlights.mainHeading || "CURRENT SERIES";
  const upNext = highlights.upNext || [];

  // Fetch overrides from highlights, fallback to matchSetup, fallback to empty defaults
  const team1Raw = highlights.team1 || matchSetup?.radiantTeamKey || "TEAM 1";
  const team2Raw = highlights.team2 || matchSetup?.direTeamKey || "TEAM 2";
  const score1 = highlights.score1 ?? matchSetup?.scoreA ?? 0;
  const score2 = highlights.score2 ?? matchSetup?.scoreB ?? 0;
  const bestOf = highlights.seriesFormat || (matchSetup?.seriesBestOf === 1 ? "BO1" : matchSetup?.seriesBestOf ? `BO${matchSetup.seriesBestOf}` : "BO3");

  // Formatted names
  const team1 = team1Raw.replace(/-/g, " ").toUpperCase();
  const team2 = team2Raw.replace(/-/g, " ").toUpperCase();

  return (
    <HudCanvas blend={true}>
      <style>{`
        @keyframes slow-spin-wobble {
          0% { transform: translateY(0px) rotate(-4deg) scale(1); }
          50% { transform: translateY(-8px) rotate(4deg) scale(1.05); }
          100% { transform: translateY(0px) rotate(-4deg) scale(1); }
        }
      `}</style>
      <FadePanel show={visible}>
        <div className="absolute inset-0 pointer-events-none flex items-end justify-end">
          {/* Main Container anchored bottom-right */}
          <div 
            className="relative w-[800px] min-h-[400px] bg-[#0c0d10] text-white flex flex-col pt-10 pb-8 pl-16 pr-10 border-r-[6px] border-cyan-400 shadow-2xl"
            style={{ clipPath: "polygon(10% 0, 100% 0, 100% 100%, 0 100%)" }}
          >
            {/* Spinning/Wobbling Highlights Box */}
            <div 
              className="absolute -top-6 right-16 bg-cyan-600 text-white font-black uppercase tracking-[0.25em] px-8 py-2 border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)] z-10"
              style={{ animation: "slow-spin-wobble 3.5s infinite ease-in-out" }}
            >
              Highlights
            </div>
            {/* Top Row: Team Names & Sponsor */}
            <div className="flex flex-col items-center justify-center mb-8 pl-8">
              <div className="flex items-baseline justify-center w-full gap-4 font-black text-3xl tracking-wide font-sans">
                <span className="flex-1 text-right">{team1}</span>
                <span className="text-cyan-400 text-xl italic font-bold">vs</span>
                <span className="flex-1 text-left">{team2}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-cyan-400 text-[10px] font-bold tracking-widest uppercase">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 22h20L12 2zm0 3.8l7.2 14.2H4.8L12 5.8z"/>
                </svg>
                {sponsorText}
              </div>
            </div>

            {/* Score & Details Row */}
            <div className="flex items-start gap-12 mb-6 pl-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Series Score</span>
                <div className="bg-cyan-800 text-cyan-300 font-black px-3 py-1 text-sm tracking-widest uppercase border border-cyan-500/50">
                  {bestOf} {score1}-{score2}
                </div>
              </div>
            </div>

            {/* Main Heading */}
            <div className="mb-4 pl-8">
              <h1 className="text-5xl font-black text-cyan-400 tracking-wider uppercase drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
                {mainHeading}
              </h1>
            </div>

            {/* Cyan Dividers */}
            <div className="flex gap-2 mb-6 pl-8">
              <div className="h-1 w-24 bg-cyan-400"></div>
              <div className="h-1 w-8 bg-cyan-700"></div>
              <div className="h-1 w-8 bg-cyan-900"></div>
            </div>

            {/* Up Next List */}
            {upNext.length > 0 && (
              <div className="space-y-2 pl-8">
                {upNext.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#15171c] py-3 px-4 border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 tracking-wider uppercase">
                        UP NEXT
                      </span>
                      <span className="text-sm font-bold tracking-wide text-slate-100">
                        {item}
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
            
          </div>
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

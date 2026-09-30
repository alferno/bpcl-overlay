import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";
import { resolveOverlayPortraitForHero } from "../hero-portrait";

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PowerSpikeAlert() {
  const { socket } = useOverlayState();
  const [spike, setSpike] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;
    
    const handler = (data: any) => {
      setSpike(data);
      setTimeout(() => setSpike(null), 8000); // hide after 8s
    };

    socket.on("POWER_SPIKE", handler);
    return () => {
      socket.off("POWER_SPIKE", handler);
    };
  }, [socket]);

  return (
    <AnimatePresence>
      {spike && (
        <motion.div
          initial={{ x: 100, opacity: 0, scale: 0.8 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 100, opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="absolute top-32 right-8 w-80 bg-slate-950/90 border border-yellow-500/30 rounded-xl shadow-[0_0_30px_rgba(234,179,8,0.2)] overflow-hidden backdrop-blur-xl"
        >
          <div className="bg-gradient-to-r from-yellow-600 to-amber-600 px-3 py-1 flex items-center justify-center gap-2">
            <span className="text-yellow-100 font-black text-[10px] tracking-widest uppercase animate-pulse">
              ⚠️ Power Spike ⚠️
            </span>
          </div>

          <div className="p-4 flex flex-col items-center gap-3 relative">
            <div className="absolute inset-0 bg-yellow-500/5 mix-blend-overlay animate-pulse" />
            
            <div className="text-center z-10">
              <div className="text-white font-black text-lg">{spike.playerName}</div>
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">{spike.heroName}</div>
            </div>

            <div className="flex items-center gap-4 z-10 my-2">
              <div className="relative w-16 h-16 rounded-full border-2 border-yellow-400/80 shadow-[0_0_15px_rgba(234,179,8,0.5)] overflow-hidden bg-slate-900 shrink-0">
                <img 
                  src={resolveOverlayPortraitForHero(undefined, spike.rawHeroName || spike.heroName) || ""}
                  alt={spike.heroName}
                  className="w-full h-full object-cover transform scale-110 object-[center_25%]"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>

              <div className="text-yellow-500/50 flex-shrink-0 animate-pulse">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>

              <div className="relative w-20 h-14 bg-slate-900 border-2 border-yellow-500/40 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(234,179,8,0.2)] shrink-0">
                <img 
                  src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${
                    spike.item.replace('item_', '') === 'banner' || spike.item.replace('item_', '') === 'aghanims_banner'
                      ? 'roshans_banner'
                      : spike.item.replace('item_', '')
                  }.png`} 
                  alt={spike.item}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            </div>

            <div className="z-10 mt-1 flex flex-col items-center gap-1 w-full">
              <div className="bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 rounded text-center w-full">
                <div className="text-yellow-400 font-black text-sm tracking-tight uppercase">
                  {spike.cleanItemName || spike.hypeText}
                </div>
                {spike.categoryText && (
                  <div className="text-yellow-200/70 text-[10px] uppercase font-bold tracking-widest mt-0.5">
                    {spike.categoryText}
                  </div>
                )}
              </div>

              {spike.clockTime > 0 && (
                <div className="bg-slate-900/80 border border-slate-700/50 px-3 py-1.5 rounded flex flex-col items-center justify-center w-full mt-1">
                  <div className="text-slate-300 text-xs font-medium">
                    Acquired at <span className="text-white font-bold">{formatTime(spike.clockTime)}</span>
                  </div>
                  


                  {spike.fastestDiff !== null && spike.fastestDiff !== undefined && spike.fastestDiff < 0 ? (
                    <div className="text-[11px] font-bold mt-1 text-green-400 animate-pulse drop-shadow-md">
                      🏆 NEW RECORD! {formatTime(Math.abs(spike.fastestDiff))} faster than fastest!
                    </div>
                  ) : spike.slowestDiff !== null && spike.slowestDiff !== undefined && spike.slowestDiff > 0 ? (
                    <div className="text-[11px] font-bold mt-1 text-red-500">
                      🐌 {formatTime(Math.abs(spike.slowestDiff))} slower than slowest record
                    </div>
                  ) : spike.timingDiff !== null && spike.timingDiff !== undefined ? (
                    <div className={`text-[11px] font-bold mt-1 ${spike.timingDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {spike.timingDiff < 0 
                        ? `🚀 ${formatTime(Math.abs(spike.timingDiff))} faster than average`
                        : `🐢 ${formatTime(Math.abs(spike.timingDiff))} slower than average`}
                    </div>
                  ) : null}

                  {spike.isLeagueData ? (
                    <div className="text-[9px] text-yellow-500/70 uppercase font-bold tracking-wider mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                      BPC League Data
                      {spike.timesBought && (
                        <span className="text-slate-400 normal-case tracking-normal ml-1">
                          ({spike.timesBought} {spike.timesBought === 1 ? 'purchase' : 'purchases'})
                        </span>
                      )}
                    </div>
                  ) : spike.averageTime !== null ? (
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      Global Data
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

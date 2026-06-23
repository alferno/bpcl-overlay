import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

export function H2HMatchupGraphic() {
  const { socket } = useOverlayState();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!socket) return;
    
    const handler = (payload: any) => {
      setData(payload);
      setTimeout(() => setData(null), 15000); // hide after 15s
    };

    socket.on("SHOW_H2H", handler);
    return () => {
      socket.off("SHOW_H2H", handler);
    };
  }, [socket]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[700px] rounded-2xl bg-slate-950/90 border border-white/10 shadow-2xl overflow-hidden backdrop-blur-xl"
      >
        <div className="bg-gradient-to-r from-cyan-600 to-emerald-600 py-2 text-center text-xs font-black tracking-[0.2em] text-white uppercase shadow-md">
          Head-To-Head Matchup
        </div>
        
        <div className="flex p-6 items-center gap-6">
          {/* Player 1 */}
          <div className="flex flex-col items-center flex-1 gap-3">
            <div className="relative w-24 h-24 rounded-full border-2 border-cyan-500 overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.5)]">
              {data.player1.avatarUrl ? (
                <img src={data.player1.avatarUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-800" />
              )}
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-white">{data.player1.displayName}</h3>
              <p className="text-[10px] text-cyan-400 uppercase tracking-widest font-bold">{data.player1.teamName || "Pos 1"}</p>
            </div>
          </div>

          {/* Stats Center */}
          <div className="flex flex-col flex-[1.5] gap-2">
            <div className="flex justify-between items-center text-sm font-black tracking-tighter uppercase px-2 py-1 bg-black/20 rounded-md">
              <div className="text-cyan-400 w-1/3 text-left">{Math.round(data.player1.stats?.avgGpm || 0)}</div>
              <div className="text-slate-400 text-[10px] tracking-widest w-1/3 text-center">Avg GPM</div>
              <div className="text-emerald-400 w-1/3 text-right">{Math.round(data.player2.stats?.avgGpm || 0)}</div>
            </div>
            <div className="flex justify-between items-center text-sm font-black tracking-tighter uppercase px-2 py-1 bg-black/20 rounded-md">
              <div className="text-cyan-400 w-1/3 text-left">{(data.player1.stats?.avgKills || 0).toFixed(1)}</div>
              <div className="text-slate-400 text-[10px] tracking-widest w-1/3 text-center">Avg Kills</div>
              <div className="text-emerald-400 w-1/3 text-right">{(data.player2.stats?.avgKills || 0).toFixed(1)}</div>
            </div>
            <div className="flex justify-between items-center text-sm font-black tracking-tighter uppercase px-2 py-1 bg-black/20 rounded-md">
              <div className="text-cyan-400 w-1/3 text-left">{(data.player1.stats?.avgAssists || 0).toFixed(1)}</div>
              <div className="text-slate-400 text-[10px] tracking-widest w-1/3 text-center">Avg Assists</div>
              <div className="text-emerald-400 w-1/3 text-right">{(data.player2.stats?.avgAssists || 0).toFixed(1)}</div>
            </div>
            <div className="flex justify-between items-center text-sm font-black tracking-tighter uppercase px-2 py-1 bg-black/20 rounded-md">
              <div className="text-cyan-400 w-1/3 text-left">{data.player1.stats?.games || 0}</div>
              <div className="text-slate-400 text-[10px] tracking-widest w-1/3 text-center">Matches</div>
              <div className="text-emerald-400 w-1/3 text-right">{data.player2.stats?.games || 0}</div>
            </div>
          </div>

          {/* Player 2 */}
          <div className="flex flex-col items-center flex-1 gap-3">
            <div className="relative w-24 h-24 rounded-full border-2 border-emerald-500 overflow-hidden shadow-[0_0_15px_rgba(16,185,129,0.5)]">
              {data.player2.avatarUrl ? (
                <img src={data.player2.avatarUrl} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-slate-800" />
              )}
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-white">{data.player2.displayName}</h3>
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">{data.player2.teamName || "Pos 1"}</p>
            </div>
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}

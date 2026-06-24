import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";
import { withBaseUrl } from "../asset-paths";

export function H2HMatchupGraphic() {
  const { socket } = useOverlayState();
  const [data, setData] = useState<any>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!socket) return;
    
    const handler = (payload: any) => {
      setData(payload);
      setFlipped(false);
      
      setTimeout(() => {
        setFlipped(true);
      }, 1500);

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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          {/* Container for cards and V/S */}
          <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
            
            {/* Player 1 Card Container */}
            <motion.div
              initial={{ x: -1000, opacity: 0, rotateY: 15 }}
              animate={{ x: -300, opacity: 1, rotateY: 0 }}
              exit={{ x: -1000, opacity: 0, rotateY: -15 }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
              className="absolute w-[400px] h-[600px]"
              style={{ perspective: 1500 }}
            >
              <motion.div
                animate={{ rotateY: flipped ? 180 : 0 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="w-full h-full relative"
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front side (Player Card image) */}
                <div 
                  className="absolute inset-0 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <img 
                    src={withBaseUrl(`/cards/${data.player1.steam32}.png`)} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="%231e293b"/></svg>';
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Back side (Stats) */}
                <div 
                  className="absolute inset-0 rounded-2xl bg-slate-900/95 border-2 border-cyan-500/50 p-8 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(6,182,212,0.4)] backdrop-blur-xl"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <div className="flex flex-col items-center mb-10 w-full relative">
                    <div className="absolute inset-0 bg-cyan-500/20 blur-3xl -z-10 rounded-full" />
                    <div className="w-32 h-32 rounded-full border-4 border-cyan-500 overflow-hidden shadow-[0_0_25px_rgba(6,182,212,0.6)] mb-6">
                      {data.player1.avatarUrl ? (
                        <img src={data.player1.avatarUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-800" />
                      )}
                    </div>
                    <h3 className="text-3xl font-black text-white text-center drop-shadow-md">{data.player1.displayName}</h3>
                    <p className="text-lg text-cyan-400 uppercase tracking-[0.2em] font-bold mt-2 text-center">{data.player1.teamName || "Pos 1"}</p>
                  </div>
                  
                  <div className="flex flex-col gap-4 w-full px-4">
                    <StatRow label="Avg GPM" value={Math.round(data.player1.stats?.avgGpm || 0)} color="text-cyan-400" />
                    <StatRow label="Avg Kills" value={(data.player1.stats?.avgKills || 0).toFixed(1)} color="text-cyan-400" />
                    <StatRow label="Avg Assists" value={(data.player1.stats?.avgAssists || 0).toFixed(1)} color="text-cyan-400" />
                    <StatRow label="Matches" value={data.player1.stats?.games || 0} color="text-cyan-400" />
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* V/S text */}
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -45, z: -500 }}
              animate={{ scale: 1, opacity: 1, rotate: 0, z: 0 }}
              exit={{ scale: 0, opacity: 0, y: 100 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 150, damping: 15 }}
              className="absolute z-10 flex items-center justify-center"
            >
              <div className="relative">
                <div className="absolute inset-0 blur-xl bg-gradient-to-br from-yellow-400 to-red-600 opacity-60 rounded-full scale-150 animate-pulse" />
                <div className="text-[120px] font-black italic tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-yellow-300 via-amber-500 to-red-600 drop-shadow-[0_10px_20px_rgba(0,0,0,0.9)]">
                  V/S
                </div>
              </div>
            </motion.div>

            {/* Player 2 Card Container */}
            <motion.div
              initial={{ x: 1000, opacity: 0, rotateY: -15 }}
              animate={{ x: 300, opacity: 1, rotateY: 0 }}
              exit={{ x: 1000, opacity: 0, rotateY: 15 }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
              className="absolute w-[400px] h-[600px]"
              style={{ perspective: 1500 }}
            >
              <motion.div
                animate={{ rotateY: flipped ? -180 : 0 }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="w-full h-full relative"
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front side (Player Card image) */}
                <div 
                  className="absolute inset-0 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  <img 
                    src={withBaseUrl(`/cards/${data.player2.steam32}.png`)} 
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="%231e293b"/></svg>';
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Back side (Stats) */}
                <div 
                  className="absolute inset-0 rounded-2xl bg-slate-900/95 border-2 border-emerald-500/50 p-8 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.4)] backdrop-blur-xl"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(-180deg)" }}
                >
                  <div className="flex flex-col items-center mb-10 w-full relative">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-3xl -z-10 rounded-full" />
                    <div className="w-32 h-32 rounded-full border-4 border-emerald-500 overflow-hidden shadow-[0_0_25px_rgba(16,185,129,0.6)] mb-6">
                      {data.player2.avatarUrl ? (
                        <img src={data.player2.avatarUrl} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-800" />
                      )}
                    </div>
                    <h3 className="text-3xl font-black text-white text-center drop-shadow-md">{data.player2.displayName}</h3>
                    <p className="text-lg text-emerald-400 uppercase tracking-[0.2em] font-bold mt-2 text-center">{data.player2.teamName || "Pos 1"}</p>
                  </div>
                  
                  <div className="flex flex-col gap-4 w-full px-4">
                    <StatRow label="Avg GPM" value={Math.round(data.player2.stats?.avgGpm || 0)} color="text-emerald-400" />
                    <StatRow label="Avg Kills" value={(data.player2.stats?.avgKills || 0).toFixed(1)} color="text-emerald-400" />
                    <StatRow label="Avg Assists" value={(data.player2.stats?.avgAssists || 0).toFixed(1)} color="text-emerald-400" />
                    <StatRow label="Matches" value={data.player2.stats?.games || 0} color="text-emerald-400" />
                  </div>
                </div>
              </motion.div>
            </motion.div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex justify-between items-center px-6 py-4 bg-black/50 rounded-xl border border-white/5 shadow-inner">
      <span className="text-slate-400 text-sm tracking-[0.2em] uppercase font-bold">{label}</span>
      <span className={`text-2xl font-black ${color} drop-shadow-sm`}>{value}</span>
    </div>
  );
}

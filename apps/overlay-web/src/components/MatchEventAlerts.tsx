import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

interface MegaCreepsEvent {
  team: "radiant" | "dire";
}

export function MatchEventAlerts() {
  const { socket } = useOverlayState();
  const [activeAlert, setActiveAlert] = useState<{ id: string; type: "tower" | "mega"; data?: any } | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onFirstTower = () => {
      const id = Date.now().toString();
      setActiveAlert({ id, type: "tower" });
      setTimeout(() => {
        setActiveAlert(current => current?.id === id ? null : current);
      }, 7000);
    };

    const onMegaCreeps = (ev: MegaCreepsEvent) => {
      const id = Date.now().toString();
      setActiveAlert({ id, type: "mega", data: ev });
      setTimeout(() => {
        setActiveAlert(current => current?.id === id ? null : current);
      }, 8000);
    };

    socket.on("first_tower_destroyed", onFirstTower);
    socket.on("mega_creeps_claimed", onMegaCreeps);

    return () => {
      socket.off("first_tower_destroyed", onFirstTower);
      socket.off("mega_creeps_claimed", onMegaCreeps);
    };
  }, [socket]);

  return (
    <div style={{ position: "absolute", left: "50%", top: 120, transform: "translateX(-50%)", zIndex: 60, pointerEvents: "none" }}>
      <AnimatePresence mode="wait">
        {activeAlert?.type === "tower" && (
          <motion.div
            key={activeAlert.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="flex flex-col items-center justify-center px-8 py-4 rounded-xl border-2 border-white/20 bg-black/80 backdrop-blur-md shadow-[0_0_30px_rgba(255,200,0,0.3)]"
          >
            <h1 className="text-3xl font-black tracking-widest text-[#ffd700] uppercase" style={{ textShadow: "0 0 16px rgba(255,215,0,0.6)" }}>
              First Tower
            </h1>
            <p className="text-lg font-bold text-gray-200 mt-1 tracking-wide uppercase">
              Destroyed
            </p>
          </motion.div>
        )}

        {activeAlert?.type === "mega" && (
          <motion.div
            key={activeAlert.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="flex flex-col items-center justify-center px-10 py-6 rounded-xl border-2 bg-black/90 backdrop-blur-md shadow-[0_0_40px_rgba(255,0,0,0.4)]"
            style={{ borderColor: activeAlert.data?.team === "radiant" ? "rgba(0, 255, 0, 0.4)" : "rgba(255, 0, 0, 0.4)" }}
          >
            <h1 className="text-5xl font-black tracking-widest text-[#ff3333] uppercase animate-pulse" style={{ textShadow: "0 0 20px rgba(255,0,0,0.8)" }}>
              MEGA CREEPS
            </h1>
            <p className="text-xl font-bold text-white mt-2 tracking-wide uppercase">
              Claimed Against {activeAlert.data?.team}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

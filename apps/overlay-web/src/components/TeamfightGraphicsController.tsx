import React, { useEffect, useState } from "react";
import { useOverlayState } from "../OverlaySocketLayer";
import { DamageBreakdownHUD } from "./DamageBreakdownHUD";
import { WinProbabilityGraphic } from "./WinProbabilityGraphic";
import { AnimatePresence, motion } from "framer-motion";

export function TeamfightGraphicsController() {
  const { socket } = useOverlayState();
  const [activeGraphic, setActiveGraphic] = useState<"none" | "damage" | "winprob">("none");
  const [winProbHistory, setWinProbHistory] = useState<Array<{ chance: number; clockTime: number }>>([]);

  useEffect(() => {
    if (!socket) return;

    const handleTeamfightEnded = (event: any) => {
      const newEntry = {
        chance: event?.radiantWinChance ?? 50,
        clockTime: event?.gameTime ?? 0,
      };

      setWinProbHistory((prev) => [...prev, newEntry].slice(-2));

      // 1. Wait 5 seconds after fight ends
      const t1 = setTimeout(() => {
        setActiveGraphic("damage"); // Show Damage Breakdown
        
        // 2. Keep Damage on screen for 5 seconds, then switch to Win %
        const t2 = setTimeout(() => {
          setActiveGraphic("winprob");
          
          // 3. Keep Win % on screen for 5 seconds, then hide
          const t3 = setTimeout(() => {
            setActiveGraphic("none");
          }, 5000);
          
        }, 5000);
        
      }, 5000);

      // We won't clear timeouts for now unless component unmounts, assuming fights don't overlap within 15s.
      return () => {
        clearTimeout(t1);
      };
    };

    socket.on("TEAMFIGHT_ENDED", handleTeamfightEnded);

    return () => {
      socket.off("TEAMFIGHT_ENDED", handleTeamfightEnded);
    };
  }, [socket]);

  const currentProb = winProbHistory.length > 0 ? winProbHistory[winProbHistory.length - 1] : undefined;
  const previousProb = winProbHistory.length > 1 ? winProbHistory[winProbHistory.length - 2] : undefined;

  return (
    <>
      <AnimatePresence>
        {activeGraphic === "damage" && (
          <motion.div
            key="damage"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <DamageBreakdownHUD />
          </motion.div>
        )}

        {activeGraphic === "winprob" && (
          <motion.div
            key="winprob"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <WinProbabilityGraphic current={currentProb} previous={previousProb} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

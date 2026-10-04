import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

interface DamageData {
  physical: number;
  magical: number;
  pure: number;
  total: number;
}

export function DamageBreakdownHUD() {
  const { socket } = useOverlayState();
  const [damageByPlayer, setDamageByPlayer] = useState<Record<number, DamageData>>({});

  useEffect(() => {
    if (!socket) return;
    
    // We expect to receive this event frequently from the GSI pipeline
    const handler = (data: Record<number, DamageData>) => {
      console.log("[DamageBreakdownHUD] Received data:", data);
      setDamageByPlayer(data);
    };

    socket.on("DAMAGE_BREAKDOWNS", handler);
    return () => {
      socket.off("DAMAGE_BREAKDOWNS", handler);
    };
  }, [socket]);

  // Hardcoded pixel offsets for 1080p standard Dota UI to align under the top portraits.
  // The center is 960.

  const maxDamage = Math.max(1, ...Object.values(damageByPlayer).map(d => d?.total || 0));

  const DamageBar = ({ data, isRadiant, maxDamage }: { data: DamageData | undefined, isRadiant: boolean, maxDamage: number }) => {
    const total = data?.total || 0;
    const physPct = total > 0 ? ((data?.physical || 0) / total) : 0;
    const magPct = total > 0 ? ((data?.magical || 0) / total) : 0;
    const purePct = total > 0 ? ((data?.pure || 0) / total) : 0;

    const fillPct = maxDamage > 0 ? (total / maxDamage) : 0;
    
    // Scale height between 8px (min) and 150px (max)
    const barHeight = total === 0 ? 8 : Math.max(8, fillPct * 150);
    const isTopDamage = total === maxDamage && total > 0;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 50, gap: 8 }}>
        <div style={{
          color: isTopDamage ? "#FBBF24" : "white", // Gold text for top damage
          fontSize: isTopDamage ? 12 : 11,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          textShadow: isTopDamage ? "0px 0px 8px rgba(251,191,36,0.8)" : "0px 2px 4px rgba(0,0,0,1)",
          background: "rgba(0,0,0,0.6)",
          padding: "2px 6px",
          borderRadius: 4,
          border: isTopDamage ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(255,255,255,0.1)",
          transition: "all 0.4s ease",
          zIndex: 2
        }}>
          {total > 1000 ? (total / 1000).toFixed(1) + "k" : total}
        </div>
        
        <div style={{ 
          height: barHeight, 
          width: 20, 
          background: "rgba(0,0,0,0.8)", 
          borderRadius: 4, 
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          border: isTopDamage ? "1px solid rgba(251,191,36,0.8)" : "1px solid rgba(255,255,255,0.2)",
          boxShadow: isTopDamage ? "0 0 12px rgba(251,191,36,0.6)" : "0 4px 12px rgba(0,0,0,0.9)",
          transition: "height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease, border 0.4s ease"
        }}>
          {/* Physical */}
          <div style={{ height: `${physPct * 100}%`, width: "100%", background: "linear-gradient(180deg, #F87171 0%, #DC2626 100%)", transition: "height 0.4s ease" }} />
          {/* Magical */}
          <div style={{ height: `${magPct * 100}%`, width: "100%", background: "linear-gradient(180deg, #60A5FA 0%, #2563EB 100%)", transition: "height 0.4s ease" }} />
          {/* Pure */}
          <div style={{ height: `${purePct * 100}%`, width: "100%", background: "linear-gradient(180deg, #FCD34D 0%, #D97706 100%)", transition: "height 0.4s ease" }} />
        </div>
      </div>
    );
  };

  const getPosition = (index: number) => {
    // 0-4 Radiant (0 is leftmost)
    // 5-9 Dire (5 is right of center)
    // Center of screen is 960. The clock sits in the middle.
    const clockWidth = 160;
    const pWidth = 72; // Reduced gap between each bar
    const center = 960;
    
    if (index < 5) {
      // 4 is closest to center
      const offsetFromCenter = (clockWidth / 2) + (4 - index) * pWidth + (pWidth / 2);
      return center - offsetFromCenter;
    } else {
      // 5 is closest to center
      const offsetFromCenter = (clockWidth / 2) + (index - 5) * pWidth + (pWidth / 2);
      return center + offsetFromCenter;
    }
  };

  return (
    <div style={{
      position: "absolute",
      top: 90, // moved down slightly (was 74)
      left: 0,
      width: 1920,
      pointerEvents: "none",
      zIndex: 40,
    }}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
        const data = damageByPlayer[i];
        const xPos = getPosition(i);
        return (
          <div key={i} style={{
            position: "absolute",
            left: xPos,
            transform: "translateX(-50%)", // center under portrait
          }}>
            <DamageBar data={data} isRadiant={i < 5} maxDamage={maxDamage} />
          </div>
        );
      })}
    </div>
  );
}

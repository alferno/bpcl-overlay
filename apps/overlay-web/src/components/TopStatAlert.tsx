import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

interface TopStatPayload {
  title: string;
  value: number;
  playerName: string;
  heroName: string;
  heroId?: number;
  portraitUrl?: string;
}

import { resolveOverlayPortraitForHero } from "../hero-portrait";

export function TopStatAlert() {
  const { socket } = useOverlayState();
  const [alert, setAlert] = useState<TopStatPayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: TopStatPayload) => {
      setAlert(data);
      // Automatically hide after 10 seconds
      setTimeout(() => setAlert(null), 10000);
    };

    socket.on("TOP_STAT_ALERT", handler);
    return () => {
      socket.off("TOP_STAT_ALERT", handler);
    };
  }, [socket]);

  // Clean the hero name, e.g., "npc_dota_hero_antimage" -> "antimage"
  const cleanHeroName = alert?.heroName?.replace("npc_dota_hero_", "") ?? "";
  
  // Try to use the robust resolver that understands the local file manifest
  const resolvedUrl = resolveOverlayPortraitForHero(alert?.heroId, alert?.heroName, { 
    heroPortraitUrl: alert?.portraitUrl 
  });
  
  const imageUrl = resolvedUrl || alert?.portraitUrl || (cleanHeroName ? `/heroes/portraits/${cleanHeroName}.png` : "");

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ x: 120, opacity: 0, scale: 0.88 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 120, opacity: 0, scale: 0.88 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          style={{
            position: "absolute",
            right: 32,
            top: "50%",
            transform: "translateY(-50%)",
            width: 320,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 0 40px rgba(16, 185, 129, 0.25), 0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            backdropFilter: "blur(20px)",
            background: "rgba(6, 24, 16, 0.92)",
            zIndex: 50,
          }}
        >
          {/* Emerald Top Accent */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: "linear-gradient(90deg, #10B981, #34D399)",
            }}
          />

          <div style={{ padding: "16px 20px" }}>
            <div style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#34D399", // Emerald-400
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 12
            }}>
              Highest {alert.title}
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Hero Image */}
              {imageUrl && (
                <div style={{
                  width: 72,
                  height: 40,
                  borderRadius: 6,
                  overflow: "hidden",
                  boxShadow: "0 0 10px rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  flexShrink: 0
                }}>
                  <img 
                    src={imageUrl}
                    alt={alert.heroName}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/heroes/portraits/unknown.png";
                    }}
                  />
                </div>
              )}

              {/* Player Info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ color: "white", fontSize: 18, fontWeight: "bold", lineHeight: 1.1 }}>
                  {alert.playerName}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                  {new Intl.NumberFormat("en-US").format(alert.value)} dmg
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

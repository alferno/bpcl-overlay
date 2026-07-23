import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";
import { withBaseUrl } from "../asset-paths";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RoshanKillEvent {
  killNumber: number;
  clockTime: number;
  teamName?: string;
  teamLogoUrl?: string;
  killerTeam?: "radiant" | "dire" | null;
  pickerTeam?: "radiant" | "dire" | null;
  pickerPlayerName?: string;
  drops?: string[];
}

const ITEM_ICON_BASE = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items";

function itemIconUrl(itemName: string): string {
  let cleanName = itemName.replace("item_", "");
  if (cleanName === "banner" || cleanName === "aghanims_banner") {
    cleanName = "roshans_banner";
  }
  return `${ITEM_ICON_BASE}/${cleanName}.png`;
}

function itemDisplayName(itemName: string): string {
  const DISPLAY_NAMES: Record<string, string> = {
    item_aegis:           "Aegis of the Immortal",
    item_banner:          "Aghanim's Banner",
    item_roshans_banner:  "Aghanim's Banner",
    item_cheese:          "Cheese",
    item_refresher_shard: "Refresher Shard",
  };
  if (DISPLAY_NAMES[itemName]) return DISPLAY_NAMES[itemName];
  return itemName
    .replace("item_", "")
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function formatClockTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

const KILL_ORDINALS: Record<number, string> = {
  1: "FIRST",
  2: "SECOND",
  3: "THIRD",
  4: "FOURTH",
  5: "FIFTH",
};

function ordinalLabel(n: number): string {
  return KILL_ORDINALS[n] ?? `${n}TH`;
}

// ── Roshan Skull Icon SVG ───────────────────────────────────────────────────────

function RoshanSkull({ theme }: { theme: any }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 40, height: 40, flexShrink: 0 }}
    >
      {/* Outer skull shape */}
      <ellipse cx="32" cy="28" rx="20" ry="22" fill={theme.skullFill} />
      <ellipse cx="32" cy="28" rx="20" ry="22" stroke={theme.primary} strokeWidth="1.5" />
      {/* Eyes */}
      <ellipse cx="23" cy="26" rx="5" ry="5.5" fill={theme.primary} opacity="0.9" />
      <ellipse cx="41" cy="26" rx="5" ry="5.5" fill={theme.primary} opacity="0.9" />
      <ellipse cx="23" cy="26" rx="2.5" ry="2.8" fill="#1e1a2e" />
      <ellipse cx="41" cy="26" rx="2.5" ry="2.8" fill="#1e1a2e" />
      {/* Nose */}
      <path d="M30 35 L32 31 L34 35 Z" fill={theme.primary} opacity="0.6" />
      {/* Teeth */}
      <rect x="23" y="44" width="5" height="7" rx="1" fill={theme.primary} opacity="0.8" />
      <rect x="30" y="44" width="4" height="8" rx="1" fill={theme.primary} opacity="0.8" />
      <rect x="36" y="44" width="5" height="7" rx="1" fill={theme.primary} opacity="0.8" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AegisStolenAlert() {
  const { socket } = useOverlayState();
  const [event, setEvent] = useState<RoshanKillEvent | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: RoshanKillEvent) => {
      // Clear any existing auto-hide timer
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      setEvent(data);
      // Auto-hide after 10 seconds
      hideTimerRef.current = setTimeout(() => setEvent(null), 10000);
    };

    socket.on("AEGIS_STOLEN", handler);
    return () => {
      socket.off("AEGIS_STOLEN", handler);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [socket]);

  const ordinal = event ? ordinalLabel(event.killNumber) : "";

  const theme = {
    primary: "#eab308", // Yellow-500
    glow: "234,179,8",
    gradientStart: "#eab308",
    gradientMid: "#facc15",
    gradientEnd: "#fef08a",
    bgStart: "rgba(18,15,8,0.97)",
    bgMid: "rgba(30,25,10,0.97)",
    bgEnd: "rgba(20,10,10,0.97)",
    skullFill: "rgba(234,179,8,0.18)"
  };

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.killNumber}
          initial={{ x: 120, opacity: 0, scale: 0.88 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 120, opacity: 0, scale: 0.88 }}
          transition={{
            type: "spring",
            stiffness: 320,
            damping: 22,
            duration: 0.45,
          }}
          style={{
            position: "relative",
            zIndex: 60,
            pointerEvents: "none",
            width: 300,
          }}
        >
          {/* Fade-out overlay — starts after 7.5s, completes at 10s */}
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 7.5, duration: 2.5, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              background: "transparent",
              pointerEvents: "none",
            }}
          />

          {/* Card wrapper */}
          <div
            style={{
              background:
                `linear-gradient(135deg, ${theme.bgStart} 0%, ${theme.bgMid} 60%, ${theme.bgEnd} 100%)`,
              borderRadius: 10,
              border: `1px solid rgba(${theme.glow},0.35)`,
              boxShadow:
                `0 0 40px rgba(${theme.glow},0.25), 0 8px 32px rgba(0,0,0,0.8), inset 0 0 20px rgba(${theme.glow},0.05)`,
              overflow: "hidden",
              backdropFilter: "blur(16px)",
            }}
          >
            {/* ── Top accent bar ── */}
            <div
              style={{
                height: 3,
                background:
                  `linear-gradient(90deg, transparent 0%, ${theme.primary} 30%, ${theme.gradientMid} 70%, transparent 100%)`,
                boxShadow: `0 0 12px rgba(${theme.glow},0.8)`,
              }}
            />

            {/* ── Header ── */}
            <div
              style={{
                padding: "10px 14px 6px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                borderBottom: `1px solid rgba(${theme.glow},0.15)`,
              }}
            >
              {/* Skull icon with pulse */}
              <motion.div
                animate={{ scale: [1, 1.12, 1], filter: ["brightness(1)", "brightness(1.4)", "brightness(1)"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <RoshanSkull theme={theme} />
              </motion.div>

              <div style={{ flex: 1 }}>
                {/* "FIRST ROSH" label */}
                <div
                  style={{
                    fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    lineHeight: 1,
                    background:
                      `linear-gradient(90deg, ${theme.gradientStart} 0%, ${theme.gradientMid} 50%, ${theme.gradientEnd} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: `drop-shadow(0 0 6px rgba(${theme.glow},0.6))`,
                  }}
                >
                  AEGIS STOLEN
                </div>
                {/* Kill count indicator */}
                <div
                  style={{
                    fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: `rgba(${theme.glow},0.6)`,
                    lineHeight: 1,
                    marginTop: 2,
                  }}
                >
                  Stolen from {event.killerTeam === 'radiant' ? 'Radiant' : event.killerTeam === 'dire' ? 'Dire' : 'enemy'}
                </div>
              </div>
            </div>

            {/* ── Kill time row ── */}
            <div
              style={{
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span
                style={{
                  fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "rgba(148,163,184,0.7)",
                }}
              >
                Killed at
              </span>
              <span
                style={{
                  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                  fontSize: 22,
                  letterSpacing: "0.06em",
                  color: "#f1f5f9",
                  filter: "drop-shadow(0 0 4px rgba(255,255,255,0.3))",
                }}
              >
                {formatClockTime(event.clockTime)}
              </span>
            </div>

            {/* ── Team row (conditionally shown) ── */}
            {event.teamName && (
              <div
                style={{
                  padding: "8px 14px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Team logo */}
                {event.teamLogoUrl && (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    <img
                      src={withBaseUrl(event.teamLogoUrl)}
                      alt={event.teamName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  </div>
                )}

                {/* Team name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: theme.primary,
                      lineHeight: 1,
                    }}
                  >
                    Stolen by
                  </div>
                  <div
                    style={{
                      fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: "#f1f5f9",
                      lineHeight: 1.2,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {event.pickerPlayerName ? event.pickerPlayerName : event.teamName}
                  </div>
                </div>

                {/* Roshan drop icons — falls back to Aegis-only if drops wasn't populated */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {(event.drops && event.drops.length > 0 ? event.drops : ["item_aegis"]).map((item) => (
                    <div
                      key={item}
                      title={itemDisplayName(item)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        background:
                          "linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(245,158,11,0.1) 100%)",
                        border: "1px solid rgba(251,191,36,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 0 10px rgba(251,191,36,0.15)",
                      }}
                    >
                      <img
                        src={itemIconUrl(item)}
                        alt={itemDisplayName(item)}
                        style={{ width: 26, height: 20, objectFit: "contain" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Bottom accent bar ── */}
            <div
              style={{
                height: 2,
                background:
                  `linear-gradient(90deg, transparent 0%, rgba(${theme.glow},0.4) 50%, transparent 100%)`,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

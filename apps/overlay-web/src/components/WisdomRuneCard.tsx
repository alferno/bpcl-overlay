import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamWisdomData {
  name: string;
  count: number;
  xp: number;
}

interface WisdomStatsPayload {
  leagueTitle: string;
  radiant: TeamWisdomData;
  dire: TeamWisdomData;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatXp(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`;
  return String(xp);
}

// XP/Book/Crystal icon — inline SVG to avoid asset deps
function XpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path d="M10 2L15 6L10 18L5 6L10 2Z" fill="#A855F7" stroke="#6B21A8" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 2V18M5 6H15" stroke="#D8B4FE" strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

// Wisdom Rune icon
function WisdomIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <path d="M10 3L16 7V13L10 17L4 13V7L10 3Z" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 3L10 10M10 10L16 7M10 10L4 7" stroke="#93C5FD" strokeWidth="1" />
      <circle cx="10" cy="10" r="2" fill="#60A5FA" />
    </svg>
  );
}

// ── Tilted Divider (SVG line) ──────────────────────────────────────────────────

function TiltedDivider() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: 32,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox="0 0 32 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Shadow line */}
        <line
          x1="20"
          y1="0"
          x2="12"
          y2="100"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="4"
        />
        {/* Main divider */}
        <line
          x1="18"
          y1="0"
          x2="10"
          y2="100"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

// ── Team Panel ─────────────────────────────────────────────────────────────────

function TeamPanel({
  team,
  side,
}: {
  team: TeamWisdomData;
  side: "radiant" | "dire";
}) {
  const isRadiant = side === "radiant";
  const accentColor = isRadiant ? "#4ADE80" : "#F87171";
  const bgGradient = isRadiant
    ? "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, transparent 60%)"
    : "linear-gradient(225deg, rgba(239,68,68,0.12) 0%, transparent 60%)";
  const teamLabel = team.name.length > 10 ? team.name.slice(0, 10) + "…" : team.name;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: isRadiant ? "flex-start" : "flex-end",
        padding: "12px 14px",
        background: bgGradient,
        gap: 6,
        minWidth: 0,
      }}
    >
      {/* Team name */}
      <div
        style={{
          color: accentColor,
          fontWeight: 900,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {teamLabel}
      </div>

      {/* Wisdom count row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexDirection: isRadiant ? "row" : "row-reverse",
        }}
      >
        <WisdomIcon />
        <span
          style={{
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 22,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {team.count}
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            alignSelf: "flex-end",
            paddingBottom: 2,
          }}
        >
          {team.count === 1 ? "rune" : "runes"}
        </span>
      </div>

      {/* XP row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexDirection: isRadiant ? "row" : "row-reverse",
          background: "rgba(168,85,247,0.08)",
          border: "1px solid rgba(168,85,247,0.18)",
          borderRadius: 6,
          padding: "3px 8px",
        }}
      >
        <XpIcon />
        <span
          style={{
            color: "#D8B4FE",
            fontWeight: 800,
            fontSize: 15,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{formatXp(team.xp)}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function WisdomRuneCard() {
  const { socket } = useOverlayState();
  const [stats, setStats] = useState<WisdomStatsPayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: WisdomStatsPayload) => {
      setStats(data);
      setTimeout(() => setStats(null), 8000);
    };

    socket.on("WISDOM_STATS", handler);
    return () => {
      socket.off("WISDOM_STATS", handler);
    };
  }, [socket]);

  return (
    <AnimatePresence>
      {stats && (
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
            width: 340,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 0 40px rgba(59,130,246,0.15), 0 0 40px rgba(168,85,247,0.1), 0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            background: "rgba(8,12,22,0.92)",
            zIndex: 50,
          }}
        >
          {/* ── Banner Strip ── */}
          <div
            style={{
              background: "linear-gradient(90deg, #1D4ED8 0%, #312E81 50%, #6B21A8 100%)",
              padding: "5px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Wisdom icon left */}
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, opacity: 0.9 }}>
              <circle cx="8" cy="8" r="7" fill="#60A5FA" />
              <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1E3A8A">W</text>
            </svg>
            <span
              style={{
                color: "rgba(255,255,255,0.92)",
                fontWeight: 800,
                fontSize: 9.5,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {stats.leagueTitle}
            </span>
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, opacity: 0.9 }}>
              <circle cx="8" cy="8" r="7" fill="#D8B4FE" />
              <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#4C1D95">W</text>
            </svg>
          </div>

          {/* ── Sub-header label ── */}
          <div
            style={{
              textAlign: "center",
              padding: "4px 0 2px",
              color: "rgba(255,255,255,0.3)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
            }}
          >
            Wisdom Rune Tracker
          </div>

          {/* ── Two-column body with tilted divider ── */}
          <div style={{ position: "relative", display: "flex", minHeight: 90 }}>
            <TiltedDivider />
            <TeamPanel team={stats.radiant} side="radiant" />
            <TeamPanel team={stats.dire} side="dire" />
          </div>

          {/* ── Subtle glow strip at bottom ── */}
          <div
            style={{
              height: 2,
              background: "linear-gradient(90deg, #3B82F6 0%, transparent 40%, transparent 60%, #A855F7 100%)",
              opacity: 0.6,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

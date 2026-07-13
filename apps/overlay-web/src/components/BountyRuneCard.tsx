import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOverlayState } from "../OverlaySocketLayer";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamBountyData {
  name: string;
  count: number;
  gold: number;
}

interface BountyStatsPayload {
  leagueTitle: string;
  radiant: TeamBountyData;
  dire: TeamBountyData;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGold(gold: number): string {
  if (gold >= 1000) return `${(gold / 1000).toFixed(1)}k`;
  return String(gold);
}

// Coin/bag icon — inline SVG to avoid asset deps
function GoldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" fill="#F59E0B" stroke="#92400E" strokeWidth="1.2" />
      <text x="10" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#78350F">g</text>
    </svg>
  );
}

// Bounty bag icon
function BountyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14, flexShrink: 0 }}>
      <ellipse cx="10" cy="13" rx="7" ry="6" fill="#059669" stroke="#065F46" strokeWidth="1.2" />
      <rect x="7" y="5" width="6" height="5" rx="2" fill="#10B981" stroke="#065F46" strokeWidth="1" />
      <line x1="10" y1="5" x2="10" y2="3" stroke="#6EE7B7" strokeWidth="1.5" strokeLinecap="round" />
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
  team: TeamBountyData;
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

      {/* Bounty count row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexDirection: isRadiant ? "row" : "row-reverse",
        }}
      >
        <BountyIcon />
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

      {/* Gold row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexDirection: isRadiant ? "row" : "row-reverse",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.18)",
          borderRadius: 6,
          padding: "3px 8px",
        }}
      >
        <GoldIcon />
        <span
          style={{
            color: "#FCD34D",
            fontWeight: 800,
            fontSize: 15,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{formatGold(team.gold)}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function BountyRuneCard() {
  const { socket } = useOverlayState();
  const [stats, setStats] = useState<BountyStatsPayload | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: BountyStatsPayload) => {
      setStats(data);
      setTimeout(() => setStats(null), 8000);
    };

    socket.on("BOUNTY_STATS", handler);
    return () => {
      socket.off("BOUNTY_STATS", handler);
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
            boxShadow: "0 0 40px rgba(16,185,129,0.15), 0 0 40px rgba(239,68,68,0.1), 0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            background: "rgba(8,12,22,0.92)",
            zIndex: 50,
          }}
        >
          {/* ── Banner Strip ── */}
          <div
            style={{
              background: "linear-gradient(90deg, #065F46 0%, #1E3A5F 50%, #7F1D1D 100%)",
              padding: "5px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Bounty icon left */}
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 12, height: 12, opacity: 0.9 }}>
              <circle cx="8" cy="8" r="7" fill="#6EE7B7" />
              <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#065F46">$</text>
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
              <circle cx="8" cy="8" r="7" fill="#FCA5A5" />
              <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7F1D1D">$</text>
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
            Bounty Rune Tracker
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
              background: "linear-gradient(90deg, #10B981 0%, transparent 40%, transparent 60%, #EF4444 100%)",
              opacity: 0.6,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import React from "react";

function formatTime(seconds: number) {
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60).toString().padStart(2, "0");
  return `${seconds < 0 ? "-" : ""}${m}:${s}`;
}

export interface WinProbabilityProps {
  current?: { chance: number; clockTime: number };
  previous?: { chance: number; clockTime: number };
}

export function WinProbabilityGraphic({ current, previous }: WinProbabilityProps) {
  if (!current) return null;

  const currentRadiantChance = current.chance;
  const previousRadiantChance = previous?.chance;

  // Logic: Winning side is Green, Losing side is Red.
  // Radiant pushes from left to right. Dire pushes from right to left.
  const radiantWinning = currentRadiantChance >= 50;
  const leftColor = radiantWinning ? "#10B981" : "#EF4444";
  const rightColor = radiantWinning ? "#EF4444" : "#10B981";

  // Dot color for previous point can just be gray or a muted color to show it's historical
  const prevColor = "#A1A1AA";

  const displayChance = radiantWinning ? currentRadiantChance : 100 - currentRadiantChance;

  return (
    <div style={{
      position: "absolute",
      top: 270,
      left: 120, // Much wider
      right: 120,
      height: 60,
      zIndex: 45,
      pointerEvents: "none",
      fontFamily: "var(--font-dota, sans-serif)",
    }}>
      {/* The Split Color Baseline */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: 0,
        right: 0,
        height: 8,
        display: "flex",
        transform: "translateY(-50%)",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 4px 12px rgba(0,0,0,0.9)",
        border: "1px solid rgba(255,255,255,0.2)"
      }}>
        {/* Left Side (Radiant side) */}
        <div style={{ width: `${currentRadiantChance}%`, background: leftColor, transition: "width 0.5s ease, background 0.5s ease" }} />
        {/* Right Side (Dire side) */}
        <div style={{ width: `${100 - currentRadiantChance}%`, background: rightColor, transition: "width 0.5s ease, background 0.5s ease" }} />
      </div>

      {/* Previous Point (Grayed out) */}
      {previous && previousRadiantChance !== undefined && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${previousRadiantChance}%`,
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: 0.6,
          transition: "opacity 0.3s ease",
          zIndex: 2
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: prevColor, marginBottom: 12, textShadow: "0 2px 4px black", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 4 }}>
            {previousRadiantChance >= 50 ? previousRadiantChance : 100 - previousRadiantChance}%
          </div>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "transparent", border: `3px solid ${prevColor}`, boxShadow: "0 2px 6px black" }} />
          <div style={{ fontSize: 13, fontWeight: 800, color: prevColor, marginTop: 12, textShadow: "0 2px 4px black", background: "rgba(0,0,0,0.6)", padding: "1px 4px", borderRadius: 4 }}>
            {formatTime(previous.clockTime)}
          </div>
        </div>
      )}

      {/* Current Point */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: `${currentRadiantChance}%`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 3
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 14, textShadow: "0 2px 6px rgba(0,0,0,1)", background: "rgba(0,0,0,0.7)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }}>
          {displayChance}%
        </div>
        <div style={{ 
          width: 24, 
          height: 24, 
          borderRadius: "50%", 
          background: "white", 
          border: "4px solid rgba(0,0,0,0.8)", 
          boxShadow: `0 0 16px white, 0 4px 8px rgba(0,0,0,0.8)` 
        }} />
        <div style={{ fontSize: 16, fontWeight: 900, color: "white", marginTop: 14, background: "rgba(0,0,0,0.8)", padding: "2px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 4px 8px rgba(0,0,0,0.8)" }}>
          {formatTime(current.clockTime)}
        </div>
      </div>
    </div>
  );
}

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
  
  // Slick gradients instead of flat colors
  const leftColor = radiantWinning 
    ? "linear-gradient(90deg, #059669 0%, #10B981 100%)" 
    : "linear-gradient(90deg, #991B1B 0%, #DC2626 100%)";
  const rightColor = radiantWinning 
    ? "linear-gradient(90deg, #DC2626 0%, #991B1B 100%)" 
    : "linear-gradient(90deg, #10B981 0%, #059669 100%)";

  const prevColor = "#9CA3AF";

  const displayChance = radiantWinning ? currentRadiantChance : 100 - currentRadiantChance;

  return (
    <div style={{
      position: "absolute",
      top: 90, // Match DamageBreakdownHUD top position
      left: 140, // Nice margins
      right: 140,
      height: 60,
      zIndex: 45,
      pointerEvents: "none",
      fontFamily: "var(--font-dota, sans-serif)",
    }}>
      {/* Title / Label */}
      <div style={{
        position: "absolute",
        top: -30,
        left: "50%",
        transform: "translateX(-50%)",
        color: "white",
        fontSize: 16,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 2,
        textShadow: "0 2px 6px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)",
      }}>
        Win Probability
      </div>

      {/* The Split Color Baseline Track */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: 0,
        right: 0,
        height: 12,
        display: "flex",
        transform: "translateY(-50%)",
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.9), inset 0 2px 6px rgba(0,0,0,0.8)",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(0,0,0,0.7)"
      }}>
        {/* Left Side (Radiant side) */}
        <div style={{ width: `${currentRadiantChance}%`, background: leftColor, transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
        {/* Right Side (Dire side) */}
        <div style={{ width: `${100 - currentRadiantChance}%`, background: rightColor, transition: "width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
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
          transition: "opacity 0.3s ease, left 0.8s ease",
          zIndex: 2
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "white", marginBottom: 12, textShadow: "0 1px 3px black", background: "rgba(0,0,0,0.8)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }}>
            {previousRadiantChance >= 50 ? previousRadiantChance : 100 - previousRadiantChance}%
          </div>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: prevColor, border: "2px solid rgba(0,0,0,0.8)", boxShadow: "0 2px 4px black" }} />
          <div style={{ fontSize: 12, fontWeight: 800, color: "#D1D5DB", marginTop: 12, textShadow: "0 1px 3px black", background: "rgba(0,0,0,0.8)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)" }}>
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
        transition: "left 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
        zIndex: 3
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 12, textShadow: "0 2px 4px rgba(0,0,0,0.8)", background: "rgba(0,0,0,0.8)", padding: "2px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          {displayChance}%
        </div>
        
        {/* Diamond Indicator */}
        <div style={{ 
          width: 18, 
          height: 18, 
          transform: "rotate(45deg)",
          background: "white", 
          border: "3px solid rgba(0,0,0,0.9)", 
          boxShadow: `0 0 12px white, inset 0 0 4px rgba(0,0,0,0.5)` 
        }} />
        
        <div style={{ fontSize: 15, fontWeight: 900, color: "white", marginTop: 12, background: "rgba(0,0,0,0.8)", padding: "2px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 4px 12px rgba(0,0,0,0.5)", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>
          {formatTime(current.clockTime)}
        </div>
      </div>
    </div>
  );
}

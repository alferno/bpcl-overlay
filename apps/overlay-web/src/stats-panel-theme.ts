import type { CSSProperties } from "react";

import { colorAlpha } from "./draft/team-colors";
import { neonPanelShadow, neonTextShadow } from "./draft/neon-effects";

const SHELL_BASE =
  "relative overflow-hidden rounded-2xl p-6 backdrop-blur-sm";

/** Dark league shell — team tint only on neon edges; logo layer separate. */
export function leagueTeamStatsShell(teamColor: string): {
  className: string;
  style: CSSProperties;
} {
  return {
    className: SHELL_BASE,
    style: {
      background: `linear-gradient(165deg, rgba(2, 3, 6, 0.99) 0%, rgba(4, 5, 9, 0.99) 35%, rgba(6, 6, 11, 1) 70%, rgba(3, 3, 8, 1) 100%)`,
      boxShadow: [
        "0 24px 48px -16px rgba(0, 0, 0, 0.85)",
        neonPanelShadow(teamColor, "idle"),
      ].join(", "),
    },
  };
}

/** Radial bloom behind centered team logo. */
export function leagueTeamLogoGlowStyle(teamColor: string): CSSProperties {
  return {
    background: `radial-gradient(ellipse 70% 65% at 50% 50%, ${colorAlpha(teamColor, 0.28)} 0%, ${colorAlpha(teamColor, 0.08)} 45%, transparent 72%)`,
    filter: `blur(2px)`,
  };
}

export function leagueTeamLogoImageClassName(): string {
  return "max-h-[78%] max-w-[62%] object-contain select-none opacity-[0.2] mix-blend-screen drop-shadow-[0_0_28px_rgba(255,255,255,0.12)]";
}

/** Neon-framed stat tile on league player cards. */
export function leagueTeamStatTileStyle(teamColor: string): CSSProperties {
  const a = (n: number) => colorAlpha(teamColor, n);
  return {
    border: `1px solid ${a(0.55)}`,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    boxShadow: [
      `inset 0 1px 0 ${a(0.45)}`,
      `inset 0 0 20px ${a(0.06)}`,
      `0 0 0 1px ${a(0.12)}`,
      `0 0 12px ${a(0.35)}`,
      `0 0 24px ${a(0.14)}`,
    ].join(", "),
  };
}

export function leagueTeamStatLabelStyle(teamColor: string): CSSProperties {
  return {
    color: colorAlpha(teamColor, 0.72),
    textShadow: neonTextShadow(teamColor),
  };
}

export function leagueTeamStatValueStyle(teamColor: string): CSSProperties {
  return {
    color: "rgb(255 255 255)",
    textShadow: [
      neonTextShadow(teamColor),
      `0 0 20px ${colorAlpha(teamColor, 0.42)}`,
    ].join(", "),
  };
}

export function leagueTeamStatSublabelStyle(teamColor: string): CSSProperties {
  return {
    color: "rgb(163 163 163)",
    textShadow: `0 0 8px ${colorAlpha(teamColor, 0.22)}`,
  };
}

export function leagueTeamHeaderLabelStyle(teamColor: string): CSSProperties {
  return {
    color: colorAlpha(teamColor, 0.78),
    textShadow: neonTextShadow(teamColor),
  };
}

export function leagueTeamSubtitleStyle(teamColor: string): CSSProperties {
  return {
    color: "rgb(212 212 212)",
    textShadow: `0 0 10px ${colorAlpha(teamColor, 0.2)}`,
  };
}

export function leagueTeamTitleStyle(teamColor: string): CSSProperties {
  return {
    color: "rgb(255 255 255)",
    textShadow: [
      "0 1px 2px rgb(0 0 0 / 0.9)",
      `0 0 18px ${colorAlpha(teamColor, 0.35)}`,
    ].join(", "),
  };
}

/** Neon ring on Steam avatar for league cards. */
export function leagueTeamAvatarNeonStyle(teamColor: string): CSSProperties {
  const a = (n: number) => colorAlpha(teamColor, n);
  return {
    borderColor: a(0.7),
    boxShadow: [
      `0 0 0 1px ${a(0.35)}`,
      `0 0 14px ${a(0.55)}`,
      `0 0 28px ${a(0.22)}`,
      `inset 0 0 12px ${a(0.12)}`,
    ].join(", "),
  };
}

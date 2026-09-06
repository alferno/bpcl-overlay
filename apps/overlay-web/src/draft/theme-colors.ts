import type { ProductionSettings } from "@bpc/shared-types";

// Represents a unified color palette for a broadcast theme.
export type ThemePalette = {
  primary: string; // Used for borders, text, active glows
  accent: string;  // Used for secondary elements or bright highlights
  glow: string;    // Used for box shadows and ambient light
  name: string;
};

// Map of available themes using Tailwind-equivalent hex colors.
export const BROADCAST_THEMES: Record<string, ThemePalette> = {
  emerald: {
    name: "emerald",
    primary: "#10b981", // emerald-500
    accent: "#34d399",  // emerald-400
    glow: "rgba(16,185,129,0.25)",
  },
  purple: {
    name: "purple",
    primary: "#a855f7", // purple-500
    accent: "#c084fc",  // purple-400
    glow: "rgba(168,85,247,0.25)",
  },
  golden: {
    name: "golden",
    primary: "#eab308", // yellow-500
    accent: "#facc15",  // yellow-400
    glow: "rgba(234,179,8,0.25)",
  },
  blue: {
    name: "blue",
    primary: "#3b82f6", // blue-500
    accent: "#60a5fa",  // blue-400
    glow: "rgba(59,130,246,0.25)",
  },
  red: {
    name: "red",
    primary: "#ef4444", // red-500
    accent: "#f87171",  // red-400
    glow: "rgba(239,68,68,0.25)",
  }
};

export function resolveBroadcastTheme(production?: ProductionSettings | null): ThemePalette {
  const themeName = (production as any)?.themeColor ?? "purple";
  return BROADCAST_THEMES[themeName] ?? BROADCAST_THEMES["purple"];
}

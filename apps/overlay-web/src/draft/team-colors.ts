import type { DraftState, LeagueConfig } from "@bpc/shared-types";

/** Map CSV `teamKey` → brand hex (e.g. `#c23c2a`). Edit for your league. */
export const TEAM_COLORS: Record<string, string> = {
  // "team_liquid": "#1e4d8c",
};

/** Default side tints — restrained broadcast palette */
export const SIDE_COLORS = {
  radiant: "#5b8fd4",
  dire: "#b86b9a",
} as const;

export type DraftSide = keyof typeof SIDE_COLORS;

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function colorAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function resolveDraftTeamColor(
  side: DraftSide,
  draft?: DraftState | null,
  leagueConfig?: LeagueConfig,
): string {
  const fromState =
    side === "radiant" ? draft?.radiant?.color : draft?.dire?.color;
  if (fromState) return fromState;

  const key =
    side === "radiant"
      ? leagueConfig?.matchSetup?.radiantTeamKey
      : leagueConfig?.matchSetup?.direTeamKey;
  if (key && leagueConfig?.teamColors?.[key]) return leagueConfig.teamColors[key];
  if (key && TEAM_COLORS[key]) return TEAM_COLORS[key];

  return SIDE_COLORS[side];
}

export function resolveDraftTeamColors(
  draft?: DraftState | null,
  leagueConfig?: LeagueConfig,
): { radiant: string; dire: string } {
  return {
    radiant: resolveDraftTeamColor("radiant", draft, leagueConfig),
    dire: resolveDraftTeamColor("dire", draft, leagueConfig),
  };
}

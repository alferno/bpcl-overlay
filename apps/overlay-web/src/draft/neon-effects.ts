import type { CSSProperties } from "react";

import { colorAlpha } from "./team-colors";

/** Layered neon border + bloom (reference HUD intensity, team-colored). */
export function neonPanelShadow(
  color: string,
  mode: "idle" | "active" = "idle",
): string {
  const a = (n: number) => colorAlpha(color, n);
  if (mode === "active") {
    return [
      `0 0 0 1px ${a(0.92)}`,
      `0 0 0 2px ${a(0.22)}`,
      `0 0 14px ${a(0.62)}`,
      `0 0 32px ${a(0.38)}`,
      `0 0 56px ${a(0.16)}`,
      `inset 0 1px 0 rgb(255 255 255 / 0.12)`,
      `inset 0 -48px 64px ${a(0.14)}`,
    ].join(", ");
  }
  return [
    `0 0 0 1px ${a(0.58)}`,
    `0 0 10px ${a(0.34)}`,
    `0 0 26px ${a(0.16)}`,
    `inset 0 1px 0 rgb(255 255 255 / 0.06)`,
    `inset 0 -36px 52px ${a(0.11)}`,
  ].join(", ");
}

/** Pick card outer border + depth shadow (team-colored). */
export function pickCardOuterFrame(
  color: string,
  active = false,
  filled = true,
): { border: string; boxShadow: string } {
  const a = (n: number) => colorAlpha(color, n);
  return {
    border: `2px solid ${a(active ? 0.82 : 0.55)}`,
    boxShadow: [
      "0 0 0 1px rgb(0 0 0 / 0.9)",
      `0 0 0 3px ${a(active ? 0.38 : 0.2)}`,
      neonSlotShadow(color, active),
      filled
        ? `0 14px 36px rgb(0 0 0 / 0.65), 0 6px 18px rgb(0 0 0 / 0.5)`
        : `0 10px 28px rgb(0 0 0 / 0.55), 0 4px 12px rgb(0 0 0 / 0.45)`,
      `0 0 24px ${a(active ? 0.22 : 0.1)}`,
      `inset 0 1px 0 rgb(255 255 255 / ${active ? 0.16 : 0.09})`,
      `inset 0 -2px 8px ${a(active ? 0.2 : 0.1)}`,
      `inset 0 0 24px ${a(active ? 0.14 : 0.07)}`,
    ].join(", "),
  };
}

/** Inner rim highlight on pick cards. */
export function pickCardInnerRim(color: string, active = false): string {
  const a = (n: number) => colorAlpha(color, n);
  return [
    "inset 0 0 0 1px rgb(255 255 255 / 0.11)",
    `inset 0 0 0 2px ${a(active ? 0.18 : 0.09)}`,
    "inset 0 2px 16px rgb(255 255 255 / 0.04)",
    `inset 0 -12px 24px ${a(0.05)}`,
  ].join(", ");
}

/** Hero / ban slot neon frame. */
export function neonSlotShadow(color: string, active = false): string {
  const a = (n: number) => colorAlpha(color, n);
  if (active) {
    return [
      `0 0 0 1px ${a(0.95)}`,
      `0 0 0 2px ${a(0.2)}`,
      `0 0 12px ${a(0.65)}`,
      `0 0 28px ${a(0.35)}`,
      `inset 0 -32px 48px ${a(0.22)}`,
    ].join(", ");
  }
  return [
    `0 0 0 1px ${a(0.48)}`,
    `0 0 8px ${a(0.28)}`,
    `0 0 18px ${a(0.1)}`,
    `inset 0 -24px 40px ${a(0.14)}`,
  ].join(", ");
}

/** Readable white label with subtle team-colored halo. */
export function neonTextShadow(color: string): string {
  return `0 0 12px ${colorAlpha(color, 0.55)}, 0 1px 2px rgb(0 0 0 / 0.85)`;
}

/** High-contrast shadow for labels on busy hero art / video. */
export function readableTextShadow(color: string): string {
  return [
    "0 1px 0 rgb(0 0 0 / 1)",
    "0 2px 4px rgb(0 0 0 / 0.95)",
    "0 4px 12px rgb(0 0 0 / 0.9)",
    `0 0 20px ${colorAlpha(color, 0.28)}`,
  ].join(", ");
}

/** Bottom scrim behind pick-card captions. */
export function pickCardLabelScrim(color: string): string {
  const a = (n: number) => colorAlpha(color, n);
  return [
    `linear-gradient(to top, rgb(0 0 0 / 0.94) 0%, rgb(0 0 0 / 0.82) 38%, rgb(0 0 0 / 0.45) 68%, transparent 100%)`,
    `linear-gradient(90deg, ${a(0.05)} 0%, transparent 32%, transparent 68%, ${a(0.05)} 100%)`,
  ].join(", ");
}

/** Radial bloom behind hero portrait inside a pick card. */
export function heroCardInnerGlow(color: string, active = false): string {
  const a = (n: number) => colorAlpha(color, n);
  const peak = active ? 0.22 : 0.14;
  return `radial-gradient(ellipse 90% 80% at 50% 40%, ${a(peak)} 0%, ${a(0.06)} 50%, transparent 78%)`;
}

/** Inset team-color wash on pick card edges (CSV brand hex). */
export function pickCardEdgeHueOverlay(color: string, active = false): string {
  const a = (n: number) => colorAlpha(color, n);
  const strong = active ? 0.3 : 0.22;
  const mid = active ? 0.14 : 0.1;
  const soft = active ? 0.045 : 0.03;
  return [
    `linear-gradient(to right, ${a(strong)} 0%, ${a(mid)} 16%, ${a(soft)} 28%, transparent 56%)`,
    `linear-gradient(to left, ${a(strong)} 0%, ${a(mid)} 16%, ${a(soft)} 28%, transparent 56%)`,
    `linear-gradient(to top, ${a(strong * 0.85)} 0%, ${a(mid)} 18%, ${a(soft)} 32%, transparent 58%)`,
    `linear-gradient(to bottom, ${a(strong * 0.45)} 0%, ${a(mid * 0.55)} 14%, transparent 40%)`,
  ].join(", ");
}

/** Corner bloom reinforcing the edge hue on filled pick cards. */
export function pickCardCornerHue(color: string, active = false): string {
  const a = (n: number) => colorAlpha(color, n);
  const peak = active ? 0.24 : 0.16;
  const soft = peak * 0.65;
  return [
    `radial-gradient(ellipse 72% 52% at 0% 0%, ${a(peak)} 0%, transparent 68%)`,
    `radial-gradient(ellipse 72% 52% at 100% 0%, ${a(peak)} 0%, transparent 68%)`,
    `radial-gradient(ellipse 65% 48% at 0% 100%, ${a(soft)} 0%, transparent 64%)`,
    `radial-gradient(ellipse 65% 48% at 100% 100%, ${a(soft)} 0%, transparent 64%)`,
  ].join(", ");
}

/** Bottom atmospheric glow inside empty pick slots. */
export function slotFloorBackground(color: string): string {
  const a = (n: number) => colorAlpha(color, n);
  return `linear-gradient(to top, ${a(0.24)} 0%, ${a(0.09)} 34%, ${a(0.03)} 60%, transparent 80%)`;
}

/** Outer HUD chrome — dual-team top edge + side bloom. */
export function hudChromeShadow(
  radiant: string,
  dire: string,
): { outer: string; borderColor: string } {
  return {
    borderColor: "rgb(255 255 255 / 0.1)",
    outer: [
      `0 0 0 1px rgb(255 255 255 / 0.08)`,
      `-24px 0 48px -8px ${colorAlpha(radiant, 0.22)}`,
      `24px 0 48px -8px ${colorAlpha(dire, 0.22)}`,
      `0 -8px 40px ${colorAlpha(radiant, 0.08)}`,
      `0 24px 64px rgb(0 0 0 / 0.85)`,
    ].join(", "),
  };
}

export function hudTopLineGradient(radiant: string, dire: string): string {
  return `linear-gradient(90deg, ${colorAlpha(radiant, 0.95)} 0%, ${colorAlpha(radiant, 0.35)} 18%, rgb(255 255 255 / 0.55) 50%, ${colorAlpha(dire, 0.35)} 82%, ${colorAlpha(dire, 0.95)} 100%)`;
}

/** Bright glow for active team logo in draft center hub. */
export function logoActiveGlow(color: string): string {
  const a = (n: number) => colorAlpha(color, n);
  return [
    `0 0 0 2px ${a(0.95)}`,
    `0 0 0 4px ${a(0.35)}`,
    `0 0 18px ${a(0.85)}`,
    `0 0 36px ${a(0.55)}`,
    `0 0 64px ${a(0.28)}`,
    `inset 0 0 20px ${a(0.25)}`,
    `inset 0 1px 0 rgb(255 255 255 / 0.18)`,
  ].join(", ");
}

/** Team name badge (boxed label like reference). */
export function teamBadgeStyle(color: string, active: boolean): CSSProperties {
  const a = (n: number) => colorAlpha(color, n);
  return {
    border: `1px solid ${a(active ? 0.88 : 0.62)}`,
    background: `linear-gradient(180deg, ${a(0.16)} 0%, ${a(0.06)} 100%)`,
    boxShadow: [
      `0 0 12px ${a(active ? 0.45 : 0.28)}`,
      `0 0 24px ${a(active ? 0.2 : 0.1)}`,
      `inset 0 0 16px ${a(0.08)}`,
    ].join(", "),
  };
}

import type { DraftSlot, LastPick } from "@bpc/shared-types";

export function lastPickCinematicKey(pick: LastPick): string {
  const side =
    pick.side === "dire" || pick.side === "B" ? "dire" : "radiant";
  return `${side}-${pick.heroId}`;
}

/** True while cinematic plays — hide hero on the matching draft pick card */
export function slotAwaitingCinematicReveal(
  teamSide: "radiant" | "dire",
  slot: DraftSlot | null | undefined,
  cinematicPickKey: string | null | undefined,
): boolean {
  if (!cinematicPickKey || !slot?.heroId || slot.type !== "pick") {
    return false;
  }
  const alt = teamSide === "radiant" ? "A" : "B";
  return (
    cinematicPickKey === `${teamSide}-${slot.heroId}` ||
    cinematicPickKey === `${alt}-${slot.heroId}`
  );
}

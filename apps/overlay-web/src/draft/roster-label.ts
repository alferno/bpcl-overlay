import type { DraftSlot, LeagueConfig } from "@bpc/shared-types";
import { manualPickDisplayName } from "@bpc/shared-types";

/** Player label for a pick slot from admin manual assignment (post-draft only). */
export function pickSlotRosterLabel(
  slot: DraftSlot | null | undefined,
  leagueConfig: LeagueConfig | undefined,
  side: "radiant" | "dire",
): string | undefined {
  if (slot?.type !== "pick" || slot.order === undefined) return undefined;
  return manualPickDisplayName(leagueConfig, side, slot.order);
}

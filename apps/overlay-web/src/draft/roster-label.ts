import type {
  DraftSlot,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";
import { manualPickDisplayName } from "@bpc/shared-types";

import { isPlayerMappingPublished } from "./resolve-pick-player";

/** Player label for a pick slot from admin manual assignment (after publish only). */
export function pickSlotRosterLabel(
  slot: DraftSlot | null | undefined,
  leagueConfig: LeagueConfig | undefined,
  side: "radiant" | "dire",
  production?: ProductionSettings | null,
): string | undefined {
  if (!isPlayerMappingPublished(production)) return undefined;
  if (slot?.type !== "pick" || slot.order === undefined) return undefined;
  return manualPickDisplayName(leagueConfig, side, slot.order);
}

import type { DraftSlot } from "@bpc/shared-types";

/** Captain's Mode: 7 bans and 5 picks per team */
export const CM_BAN_COUNT = 7;
export const CM_PICK_COUNT = 5;

export function splitTeamSlots(slots: DraftSlot[] | undefined): {
  bans: DraftSlot[];
  picks: DraftSlot[];
} {
  const list = slots ?? [];
  const bans = list.filter((s) => s.type === "ban").sort((a, b) => a.order - b.order);
  const picks = list.filter((s) => s.type === "pick").sort((a, b) => a.order - b.order);
  return { bans, picks };
}

/** Pad to fixed slot count by GSI order index (pick0 → slot 0, etc.). */
export function padSlots(slots: DraftSlot[], count: number): (DraftSlot | null)[] {
  return Array.from({ length: count }, (_, i) => {
    const slot = slots.find((s) => s.order === i);
    if (!slot) return null;
    return slot.heroId || slot.heroPortraitUrl || slot.heroName ? slot : null;
  });
}

export function prepareTeamBoard(slots: DraftSlot[] | undefined): {
  bans: (DraftSlot | null)[];
  picks: (DraftSlot | null)[];
} {
  const { bans, picks } = splitTeamSlots(slots);
  return {
    bans: padSlots(bans, CM_BAN_COUNT),
    picks: padSlots(picks, CM_PICK_COUNT),
  };
}

export function formatDraftSeconds(total: number | undefined): string {
  const s = Math.max(0, Math.floor(total ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function resolveTurnAction(draft: {
  turnAction?: "pick" | "ban";
  phase?: string;
}): "pick" | "ban" {
  if (draft.turnAction) return draft.turnAction;
  if (draft.phase === "bans") return "ban";
  return "pick";
}

/** e.g. "Emberfall turn to ban" */
export function formatTeamTurnLabel(
  teamName: string,
  action: "pick" | "ban",
): string {
  const verb = action === "ban" ? "ban" : "pick";
  return `${teamName} turn to ${verb}`;
}

import type { DraftSlot, DraftState } from "@bpc/shared-types";

export function DraftHistoryTags({
  currentSlot,
  currentTeamSide,
  previousDrafts,
}: {
  currentSlot: DraftSlot | null;
  currentTeamSide: "radiant" | "dire";
  previousDrafts?: DraftState[];
}) {
  if (!currentSlot?.heroId || !previousDrafts || previousDrafts.length === 0) {
    return null;
  }

  const lastDraft = previousDrafts[previousDrafts.length - 1];
  if (!lastDraft) return null;

  const opponentSide = currentTeamSide === "radiant" ? "dire" : "radiant";

  // Check last game picks
  const lastGameOurPicks = lastDraft[currentTeamSide]?.slots?.filter(s => s.type === "pick") || [];
  const lastGameOpponentPicks = lastDraft[opponentSide]?.slots?.filter(s => s.type === "pick") || [];
  
  // Check last game bans
  const lastGameAllBans = [
    ...(lastDraft.radiant?.slots?.filter(s => s.type === "ban") || []),
    ...(lastDraft.dire?.slots?.filter(s => s.type === "ban") || [])
  ];

  let tagText = "";
  let tagColor = "";
  
  // Logic priority based on user request:
  // 1. PRIO BANNED: if banned then picked
  // 2. STOLEN: if picked and then picked (by other)
  // 3. SAME: if picked and then picked (by same)

  if (lastGameAllBans.some(s => s.heroId === currentSlot.heroId)) {
    tagText = "PRIO BANNED";
    tagColor = "bg-rose-950/80 text-rose-400 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.4)]";
  } else if (lastGameOpponentPicks.some(s => s.heroId === currentSlot.heroId)) {
    tagText = "STOLEN";
    tagColor = "bg-amber-950/80 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.4)]";
  } else if (lastGameOurPicks.some(s => s.heroId === currentSlot.heroId)) {
    tagText = "SAME";
    tagColor = "bg-emerald-950/80 text-emerald-400 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
  }

  if (!tagText) return null;

  return (
    <div className="absolute top-1 left-1 z-[10] pointer-events-none">
      <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-black tracking-widest uppercase shadow-lg backdrop-blur-sm ${tagColor}`}>
        {tagText}
      </span>
    </div>
  );
}

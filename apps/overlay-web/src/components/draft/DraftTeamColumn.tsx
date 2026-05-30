import type {
  DraftSlot,
  LeagueConfig,
  ProductionSettings,
} from "@bpc/shared-types";

import { DRAFT_PICK_HEIGHT } from "../../draft/dimensions";
import {
  neonPanelShadow,
} from "../../draft/neon-effects";
import {
  draftHeroAnimationEnabled,
  isPickSlotFilled,
} from "../../hero-portrait";
import { prepareTeamBoard } from "../../draft/slot-utils";
import { slotAwaitingCinematicReveal } from "../../draft/cinematic-pick";
import { colorAlpha } from "../../draft/team-colors";
import { DraftBanTile } from "./DraftBanTile";
import { DraftPickCard } from "./DraftPickCard";

export function DraftTeamColumn({
  slots,
  teamLogoUrl,
  isActive,
  heroSelectionMode = false,
  leagueConfig,
  teamColor,
  turnAction,
  edge,
  teamSide,
  cinematicPickKey = null,
  production,
}: {
  slots: DraftSlot[] | undefined;
  teamLogoUrl?: string;
  isActive: boolean;
  heroSelectionMode?: boolean;
  leagueConfig?: LeagueConfig;
  production?: ProductionSettings | null;
  teamColor: string;
  turnAction: "pick" | "ban";
  edge?: "start" | "end";
  teamSide: "radiant" | "dire";
  cinematicPickKey?: string | null;
}) {
  const { bans, picks } = prepareTeamBoard(slots);
  const firstEmptyPick = picks.findIndex(
    (s) => !s?.heroId && !s?.heroPortraitUrl && !s?.heroName,
  );
  const firstEmptyBan = bans.findIndex(
    (s) => !s?.heroId && !s?.heroPortraitUrl && !s?.heroName,
  );
  const heroAnimate = draftHeroAnimationEnabled();

  const edgeRadius =
    edge === "start"
      ? "rounded-none rounded-r-lg"
      : edge === "end"
        ? "rounded-none rounded-l-lg"
        : "rounded-lg";

  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-3 transition-all duration-500 ${edgeRadius}`}
      style={{
        background: "linear-gradient(180deg, rgb(14 14 16 / 0.98) 0%, rgb(4 4 6 / 1) 100%)",
        boxShadow: neonPanelShadow(teamColor, isActive ? "active" : "idle"),
      }}
    >
      <div className="grid min-w-0 grid-cols-7 gap-x-2 gap-y-1.5 opacity-95">
        {bans.map((slot, i) => (
          <DraftBanTile
            key={`ban-${i}`}
            slot={slot}
            teamColor={teamColor}
            isActive={
              isActive &&
              turnAction === "ban" &&
              !slot?.heroId &&
              i === firstEmptyBan
            }
          />
        ))}
      </div>

      <div
        className="h-px w-full opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${colorAlpha(teamColor, 0.55)}, transparent)`,
          boxShadow: `0 0 8px ${colorAlpha(teamColor, 0.35)}`,
        }}
      />

      <div
        className="grid min-w-0 grid-cols-5 gap-2"
        style={{ height: DRAFT_PICK_HEIGHT }}
      >
        {picks.map((slot, i) => (
          <div key={`pick-${i}`} className="flex min-h-0 flex-col gap-0.5">
            <div
              className="relative z-[1] min-h-0 flex-1 overflow-hidden"
              style={{ height: DRAFT_PICK_HEIGHT }}
            >
              <DraftPickCard
                slot={slot}
                teamLogoUrl={teamLogoUrl}
                teamColor={teamColor}
                isActive={
                  isActive &&
                  turnAction === "pick" &&
                  !slot?.heroId &&
                  !slot?.heroPortraitUrl &&
                  i === firstEmptyPick
                }
                animate={
                  heroAnimate &&
                  isPickSlotFilled(slot) &&
                  !slotAwaitingCinematicReveal(
                    teamSide,
                    slot,
                    cinematicPickKey,
                  )
                }
                hideHeroUntilCinematic={
                  slotAwaitingCinematicReveal(
                    teamSide,
                    slot,
                    cinematicPickKey,
                  )
                }
                heroSelectionMode={heroSelectionMode}
                leagueConfig={leagueConfig}
                production={production}
                teamSide={teamSide}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

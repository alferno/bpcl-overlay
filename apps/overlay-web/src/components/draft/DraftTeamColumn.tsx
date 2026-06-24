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
  teamName,
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
  teamName?: string;
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

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-lg transition-all duration-500"
      style={{
        background: "linear-gradient(180deg, rgb(18 20 24 / 0.6) 0%, rgb(10 12 14 / 0.8) 100%)",
        border: `1px solid ${colorAlpha(teamColor, 0.3)}`,
        boxShadow: isActive ? `0 0 20px ${colorAlpha(teamColor, 0.2)}` : "0 4px 12px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex flex-col gap-3 p-4">
        {/* Picks on top */}
        <div
          className="grid min-w-0 grid-cols-5 gap-3"
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

        {/* Bans below */}
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
      </div>

      {/* Team Name Footer */}
      <div 
        className={`w-full py-2 px-4 ${teamSide === "dire" ? "text-right" : "text-left"}`}
        style={{
          background: colorAlpha(teamColor, 0.15),
          borderTop: `1px solid ${colorAlpha(teamColor, 0.3)}`
        }}
      >
        <span className="font-heading text-xl font-bold uppercase tracking-wider text-white" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>
          {teamName || (teamSide === "radiant" ? "RADIANT" : "DIRE")}
        </span>
      </div>
    </div>
  );
}

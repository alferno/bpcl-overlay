import type {
  DraftSlot,
  DraftState,
  LeagueConfig,
  MatchSetup,
  RosterPlayer,
} from "@bpc/shared-types";
import { manualPickDisplayName, manualPickSteam32 } from "@bpc/shared-types";
import {
  getTeamByKey,
  teamLogoUrl,
} from "./roster-teams.js";

function mapPickPlayersOntoSlots(
  slots: DraftSlot[] | undefined,
  side: "radiant" | "dire",
  leagueConfig: LeagueConfig,
): DraftSlot[] | undefined {
  if (!slots) return slots;
  return slots.map((slot) => {
    if (slot.type !== "pick") return slot;
    const steam32 = manualPickSteam32(leagueConfig.matchSetup, side, slot.order);
    const playerName = manualPickDisplayName(leagueConfig, side, slot.order);
    if (steam32 == null && !playerName) {
      const { playerName: _pn, steam32: _s, ...rest } = slot;
      return rest as DraftSlot;
    }
    return {
      ...slot,
      steam32: steam32 ?? undefined,
      playerName,
    };
  });
}

/** Apply admin pickPlayers onto filled draft pick slots (post-draft). */
export function applyPickPlayersToDraft(
  draft: DraftState,
  leagueConfig: LeagueConfig,
): DraftState {
  return {
    ...draft,
    radiant: draft.radiant
      ? {
          ...draft.radiant,
          slots: mapPickPlayersOntoSlots(
            draft.radiant.slots,
            "radiant",
            leagueConfig,
          ),
        }
      : draft.radiant,
    dire: draft.dire
      ? {
          ...draft.dire,
          slots: mapPickPlayersOntoSlots(draft.dire.slots, "dire", leagueConfig),
        }
      : draft.dire,
  };
}

/** Seed draft series / side logos from producer match setup */
export function draftPatchFromMatchSetup(
  matchSetup: MatchSetup,
  roster: RosterPlayer[],
  prev: DraftState | null | undefined,
): Partial<DraftState> {
  const radiant = getTeamByKey(roster, matchSetup.radiantTeamKey);
  const dire = getTeamByKey(roster, matchSetup.direTeamKey);
  if (!radiant || !dire) {
    throw new Error("One or both teams not found in roster");
  }
  if (matchSetup.radiantTeamKey === matchSetup.direTeamKey) {
    throw new Error("Radiant and dire must be different teams");
  }

  return {
    series: {
      teamA: radiant.teamName,
      teamB: dire.teamName,
      scoreA: matchSetup.scoreA ?? prev?.series?.scoreA ?? 0,
      scoreB: matchSetup.scoreB ?? prev?.series?.scoreB ?? 0,
      bestOf: matchSetup.seriesBestOf,
      gameNumber: matchSetup.seriesGame,
      logoUrlA: teamLogoUrl(radiant.teamKey),
      logoUrlB: teamLogoUrl(dire.teamKey),
    },
    side: prev?.side ?? "radiant_first_pick",
    phase: prev?.phase ?? "bans",
    reserveSeconds: prev?.reserveSeconds ?? 0,
    radiant: {
      name: radiant.teamName,
      logoUrl: teamLogoUrl(radiant.teamKey),
      slots: prev?.radiant?.slots,
    },
    dire: {
      name: dire.teamName,
      logoUrl: teamLogoUrl(dire.teamKey),
      slots: prev?.dire?.slots,
    },
  };
}

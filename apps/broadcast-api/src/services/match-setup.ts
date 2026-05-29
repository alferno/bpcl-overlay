import type { DraftState, MatchSetup, RosterPlayer } from "@bpc/shared-types";
import {
  getTeamByKey,
  teamLogoUrl,
} from "./roster-teams.js";

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

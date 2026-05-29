import type { MatchSetup, RosterPlayer } from "@bpc/shared-types";
import { teamLogoPath } from "@bpc/shared-types";

export type TeamInfo = {
  teamKey: string;
  teamName: string;
  players: RosterPlayer[];
};

export function listTeamsFromRoster(roster: RosterPlayer[]): TeamInfo[] {
  const byKey = new Map<string, TeamInfo>();

  for (const p of roster) {
    const teamKey =
      p.teamKey ??
      slugify(p.teamName ?? "unknown");
    const teamName = p.teamName ?? titleFromKey(teamKey);

    const existing = byKey.get(teamKey);
    if (existing) {
      existing.players.push(p);
      if (p.teamName && !existing.teamName) {
        existing.teamName = p.teamName;
      }
    } else {
      byKey.set(teamKey, {
        teamKey,
        teamName,
        players: [p],
      });
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );
}

export function getTeamByKey(
  roster: RosterPlayer[],
  teamKey: string,
): TeamInfo | undefined {
  return listTeamsFromRoster(roster).find((t) => t.teamKey === teamKey);
}

export function playersForMatchSide(
  roster: RosterPlayer[],
  matchSetup: MatchSetup | null | undefined,
  side: "radiant" | "dire",
): RosterPlayer[] {
  if (!matchSetup) return [];
  const key =
    side === "radiant"
      ? matchSetup.radiantTeamKey
      : matchSetup.direTeamKey;
  return getTeamByKey(roster, key)?.players ?? [];
}

export function findPlayerOnSide(
  roster: RosterPlayer[],
  matchSetup: MatchSetup | null | undefined,
  side: "radiant" | "dire",
  opts: { steam32?: number; displayName?: string },
): RosterPlayer | undefined {
  const pool = playersForMatchSide(roster, matchSetup, side);
  if (opts.steam32 !== undefined) {
    return pool.find((p) => p.steam32 === opts.steam32);
  }
  if (opts.displayName) {
    const norm = opts.displayName.trim().toLowerCase();
    return pool.find((p) => p.displayName.trim().toLowerCase() === norm);
  }
  return undefined;
}

export function findPlayerInMatch(
  roster: RosterPlayer[],
  matchSetup: MatchSetup | null | undefined,
  opts: { steam32?: number; displayName?: string },
): RosterPlayer | undefined {
  return (
    findPlayerOnSide(roster, matchSetup, "radiant", opts) ??
    findPlayerOnSide(roster, matchSetup, "dire", opts)
  );
}

export function teamLogoUrl(teamKey: string): string {
  return teamLogoPath(teamKey);
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function titleFromKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

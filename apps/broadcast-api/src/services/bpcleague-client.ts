import { logger } from "../logger.js";
import { batchResolveSteam32 } from "./steam32-resolver.js";
import type { RosterPlayer } from "@bpc/shared-types";

const BPCL_BASE = "https://api.bpcleague.in/api/public";

// ---- API response types -----------------------------------------------

interface BpclPlayer {
  id: string;
  name: string;
  displayName: string;
  role: string;
  mmr: number;
  steamProfile: string;
  isCaptain: boolean;
}

interface BpclTeam {
  id: string;
  name: string;
  abbr: string;
  logoUrl: string;
  accentColor: string;
  groupKey: string;
  players: BpclPlayer[];
}

interface BpclSeasonResponse {
  snapshot?: {
    teams?: Record<string, BpclTeam>;
    matches?: BpclMatch[];
  };
}

interface BpclMatch {
  id: string;
  stageKey: string;
  team1: string;
  team2: string;
  status: "upcoming" | "in_progress" | "completed";
  slotAt: string | null;
  meta?: {
    seriesType?: string;
    team1Score?: number | null;
    team2Score?: number | null;
    score?: string;
  };
}

interface BpclTournamentResponse {
  schedule?: BpclMatch[];
  matches?: BpclMatch[];
}

interface CommunityMember {
  slug: string;
  displayName: string;
  avatarUrl: string;
}

// ---- Exported types ----------------------------------------------------

export interface SyncedTeam {
  teamKey: string; // e.g. "warpath"
  teamName: string;
  logoUrl: string;
  accentColor: string;
  players: RosterPlayer[];
}

export interface LiveMatch {
  id: string;
  stageKey: string;
  team1Key: string;
  team2Key: string;
  team1Name: string;
  team2Name: string;
  seriesType: string;
  status: string;
  slotAt: string | null;
}

// ---- Client -------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`BPCLeague API error ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch and resolve all teams + players from the given season slug.
 * Returns an array of SyncedTeam, each with players having steam32 set.
 */
export async function fetchSyncedTeams(
  seasonSlug: string
): Promise<SyncedTeam[]> {
  logger.info({ seasonSlug }, "[BPCLeague] Fetching season data");

  const [seasonData, communityData] = await Promise.all([
    fetchJson<BpclSeasonResponse>(`${BPCL_BASE}/seasons/${seasonSlug}`),
    fetchJson<{ players?: CommunityMember[] }>(`${BPCL_BASE}/community`).catch(
      () => ({ players: [] })
    ),
  ]);

  // Build avatar lookup from community data (slug → avatarUrl)
  const avatarBySlug: Record<string, string> = {};
  for (const member of communityData?.players ?? []) {
    if (member.slug && member.avatarUrl) {
      avatarBySlug[member.slug] = member.avatarUrl;
    }
  }

  const teamsMap = seasonData?.snapshot?.teams ?? {};
  const teamEntries = Object.entries(teamsMap);

  if (teamEntries.length === 0) {
    logger.warn("[BPCLeague] No teams found in season snapshot");
    return [];
  }

  // Collect all profile URLs for batch resolution
  const allPlayers: { teamKey: string; team: BpclTeam; player: BpclPlayer }[] = [];
  for (const [, team] of teamEntries) {
    const teamKey = team.name.toLowerCase().replace(/\s+/g, "-");
    for (const player of team.players) {
      allPlayers.push({ teamKey, team, player });
    }
  }

  logger.info(`[BPCLeague] Resolving Steam32 IDs for ${allPlayers.length} players...`);
  const steam32Ids = await batchResolveSteam32(
    allPlayers.map((p) => p.player.steamProfile)
  );

  // Group back into teams
  const syncedTeams: Map<string, SyncedTeam> = new Map();

  for (let i = 0; i < allPlayers.length; i++) {
    const { teamKey, team, player } = allPlayers[i];
    const steam32 = steam32Ids[i];

    if (!syncedTeams.has(teamKey)) {
      syncedTeams.set(teamKey, {
        teamKey,
        teamName: team.name,
        // Prefix with base URL if relative
        logoUrl: team.logoUrl?.startsWith("/")
          ? `https://bpcleague.in${team.logoUrl}`
          : team.logoUrl,
        accentColor: team.accentColor ?? "#ffffff",
        players: [],
      });
    }

    if (steam32 == null) {
      logger.warn(
        { player: player.displayName, url: player.steamProfile },
        "[BPCLeague] Could not resolve Steam32 — player will be skipped for GSI mapping"
      );
    }

    syncedTeams.get(teamKey)!.players.push({
      steam32: steam32 ?? 0,
      displayName: player.displayName,
      teamName: team.name,
      teamKey,
      teamColor: team.accentColor,
      // Prefer community avatar over nothing
      avatarUrl: player.steamProfile
        ? undefined
        : avatarBySlug[player.displayName.toLowerCase()],
    });
  }

  const result = [...syncedTeams.values()];
  logger.info(`[BPCLeague] Synced ${result.length} teams with ${allPlayers.length} total players`);
  return result;
}

/**
 * Fetch upcoming / live matches from the tournament endpoint.
 */
export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  logger.info("[BPCLeague] Fetching tournament matches");

  const [tournamentData, seasonData] = await Promise.all([
    fetchJson<BpclTournamentResponse>(`${BPCL_BASE}/tournament`),
    fetchJson<BpclSeasonResponse>(`${BPCL_BASE}/seasons/season-2`).catch(() => null),
  ]);

  const rawMatches: BpclMatch[] =
    (tournamentData.schedule ?? tournamentData.matches ?? []).filter(
      (m) => m.status === "upcoming" || m.status === "in_progress"
    );

  // Build a team name lookup from snapshot
  const teamsMap = seasonData?.snapshot?.teams ?? {};
  const teamNameByKey: Record<string, string> = {};
  for (const team of Object.values(teamsMap)) {
    const key = team.name.toLowerCase().replace(/\s+/g, "-");
    teamNameByKey[key] = team.name;
    // Also map by the bracket token (e.g. "Group A #1")
    teamNameByKey[team.name] = team.name;
  }

  return rawMatches.map((m) => ({
    id: m.id,
    stageKey: m.stageKey,
    team1Key: m.team1,
    team2Key: m.team2,
    team1Name: teamNameByKey[m.team1] ?? m.team1,
    team2Name: teamNameByKey[m.team2] ?? m.team2,
    seriesType: m.meta?.seriesType ?? "bo1",
    status: m.status,
    slotAt: m.slotAt,
  }));
}

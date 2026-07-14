import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import type { RosterPlayer } from "@bpc/shared-types";
import { normalizeTeamColorHex } from "./roster-parser.js";
import { logger } from "../logger.js";
import { fetchCachedJson } from "./bpcleague-cache.js";

/**
 * Fetches the active season slug from the bpcleague.in API.
 * Returns the first season with `isActive: true`, or falls back to "season-2".
 * Result is cached for 5 minutes to avoid redundant calls during a session.
 */
export async function fetchActiveSeasonSlug(): Promise<string> {
  try {
    const payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/seasons", 5 * 60 * 1000);
    const seasons: Array<{ slug: string; name: string; isActive?: boolean }> =
      payload.seasons || payload || [];
    const active = seasons.find((s) => s.isActive);
    const slug = active?.slug ?? "season-2";
    logger.info({ slug }, "[BPCLeague] Active season slug resolved");
    return slug;
  } catch (err) {
    logger.warn({ err }, "[BPCLeague] Failed to fetch seasons list — falling back to season-2");
    return "season-2";
  }
}

// ---- Persistent vanity → steam32 cache --------------------------------
const CACHE_FILE = path.join(process.cwd(), "steam32-vanity-cache.json");
let _vanityCache: Record<string, number> | null = null;

function loadVanityCache(): Record<string, number> {
  if (_vanityCache) return _vanityCache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      _vanityCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      logger.info({ count: Object.keys(_vanityCache!).length }, "[steam32] Loaded vanity cache from disk");
      return _vanityCache!;
    }
  } catch { /* ignore */ }
  _vanityCache = {};
  return _vanityCache;
}

function saveVanityCache(cache: Record<string, number>): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    logger.warn({ err }, "[steam32] Failed to persist vanity cache");
  }
}
// -----------------------------------------------------------------------

type RawPlayer = {
  id?: string;
  displayName: string;
  name?: string;
  steamProfile?: string;
  role?: string;
  roles?: string[];
  mmr?: number;
  isCaptain?: boolean;
  bpc_id?: string;
  bpcId?: string;
};

type RawTeam = {
  name: string;
  abbr?: string;
  accentColor?: string;
  logoUrl?: string;
  players?: RawPlayer[];
};

export function resolveVanityUrl(vanity: string, apiKey: string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${vanity}`;
    https.get(url, (res) => {
      if (res.statusCode !== 200) { resolve(null); return; }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.response?.success === 1 && parsed.response.steamid) {
            const steam32 = Number(BigInt(parsed.response.steamid) - BigInt("76561197960265728"));
            resolve(steam32);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

export async function extractSteam32FromUrl(steamProfileUrl: string, steamApiKey?: string): Promise<number | null> {
  if (!steamProfileUrl) return null;

  // Try matching /profiles/(\d+) — direct math, no API call needed
  const matchProfiles = steamProfileUrl.match(/\/profiles\/(\d+)/);
  if (matchProfiles?.[1]) {
    return Number(BigInt(matchProfiles[1]) - BigInt("76561197960265728"));
  }

  // Try matching /id/vanity — check cache first, then Steam API
  const matchId = steamProfileUrl.match(/\/id\/([^/?#]+)/);
  if (matchId?.[1]) {
    const vanity = matchId[1].trim().toLowerCase();
    const cache = loadVanityCache();

    if (cache[vanity] != null) {
      logger.debug({ vanity, steam32: cache[vanity] }, "[steam32] Cache hit");
      return cache[vanity];
    }

    if (!steamApiKey) {
      logger.warn({ vanity }, "[steam32] Vanity URL found but STEAM_WEB_API_KEY not configured");
      return null;
    }

    const steam32 = await resolveVanityUrl(vanity, steamApiKey);
    if (steam32 != null && steam32 > 0) {
      cache[vanity] = steam32;
      saveVanityCache(cache);
      logger.info({ vanity, steam32 }, "[steam32] Resolved & cached vanity → steam32");
    } else {
      logger.warn({ vanity }, "[steam32] Steam API could not resolve vanity URL");
    }
    return steam32;
  }

  logger.warn({ url: steamProfileUrl }, "[steam32] Unrecognized Steam profile URL format");
  return null;
}



export async function fetchRosterFromBpcLeague(opts: {
  seasonSlug?: string;
  steamApiKey?: string;
}): Promise<RosterPlayer[]> {
  const slug = opts.seasonSlug
    ? opts.seasonSlug.trim().toLowerCase()
    : await fetchActiveSeasonSlug();
  logger.info({ slug }, "Starting roster sync from bpcleague.in");

  let rawTeams: RawTeam[] = [];

  try {
    if (slug === "latest" || slug === "active") {
      const payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/tournament", 15 * 60 * 1000);
      rawTeams = payload.teams || [];
    } else {
      const payload = await fetchCachedJson<any>(`https://api.bpcleague.in/api/public/seasons/${slug}`, 15 * 60 * 1000);
      if (payload.tournament && payload.tournament.teams) {
        rawTeams = payload.tournament.teams;
      }
    }
  } catch (err) {
    logger.error(err, "Failed to fetch season/tournament data from bpcleague.in");
    throw err;
  }

  if (!rawTeams || rawTeams.length === 0) {
    logger.warn("No teams found in bpcleague.in API response");
    return [];
  }

  // Flatten all players across all teams first, then resolve Steam32 IDs in parallel
  const allEntries: { teamName: string; teamKey: string; teamColor: string; player: RawPlayer }[] = [];

  for (const team of rawTeams) {
    const teamName = team.name.trim();
    const teamKey = team.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const teamColor = normalizeTeamColorHex(team.accentColor) || "#ffffff";
    for (const player of (team.players || [])) {
      allEntries.push({ teamName, teamKey, teamColor, player });
    }
  }

  // Batch-resolve all Steam32 IDs in parallel (cached vanity lookups resolve instantly)
  logger.info({ total: allEntries.length }, "[steam32] Resolving Steam32 IDs in parallel");
  const steam32Results = await Promise.all(
    allEntries.map(({ player }) =>
      extractSteam32FromUrl(player.steamProfile || "", opts.steamApiKey)
    )
  );

  const roster: RosterPlayer[] = [];
  for (let i = 0; i < allEntries.length; i++) {
    const { teamName, teamKey, teamColor, player } = allEntries[i];
    const steam32 = steam32Results[i];
    const displayName = player.displayName || player.name || "Player";
    const roles = player.roles || [];
    const mmr = player.mmr;

    const bpcId = player.bpc_id || player.bpcId || player.id;

    if (steam32 != null && steam32 > 0) {
      roster.push({ displayName, steam32, teamName, teamKey, teamColor, roles, mmr, bpcId });
    } else {
      logger.warn({ displayName, url: player.steamProfile }, "[steam32] Could not resolve — player skipped");
    }
  }

  logger.info({ count: roster.length, total: allEntries.length }, "Completed roster sync from bpcleague.in");
  return roster;
}

export type BpcMatch = {
  id: string;
  team1: string;
  team2: string;
  winner: string | null;
  status: string;
  stageKey: string;
  seriesType: string;
  team1Score: number;
  team2Score: number;
};

export async function fetchMatchesFromBpcLeague(seasonSlug?: string): Promise<BpcMatch[]> {
  const slug = seasonSlug
    ? seasonSlug.trim().toLowerCase()
    : await fetchActiveSeasonSlug();
  logger.info({ slug }, "Fetching tournament matches from bpcleague.in");

  try {
    let payload;
    if (slug === "latest" || slug === "active") {
      payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/tournament", 2 * 60 * 1000);
    } else {
      payload = await fetchCachedJson<any>(`https://api.bpcleague.in/api/public/seasons/${slug}`, 2 * 60 * 1000);
    }

    let rawMatches: any[] = [];
    if (payload.tournament && payload.tournament.matches) {
      rawMatches = payload.tournament.matches;
    } else if (payload.matches) {
      rawMatches = payload.matches;
    }

    return rawMatches.map((m: any) => ({
      id: m.id,
      team1: m.team1,
      team2: m.team2,
      winner: m.winner || null,
      status: m.status || "pending",
      stageKey: m.stageKey || "",
      seriesType: m.meta?.seriesType || "bo3",
      team1Score: m.meta?.team1Score ?? 0,
      team2Score: m.meta?.team2Score ?? 0,
    }));
  } catch (err) {
    logger.error(err, "Failed to fetch matches from bpcleague.in");
    return [];
  }
}

export type BpcSeason = {
  slug: string;
  name: string;
  isActive: boolean;
};

export async function fetchSeasonsFromBpcLeague(): Promise<BpcSeason[]> {
  logger.info("Fetching seasons list from bpcleague.in");
  try {
    const payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/seasons", 15 * 60 * 1000);
    const rawSeasons = payload.seasons || [];
    return rawSeasons.map((s: any) => ({
      slug: s.slug,
      name: s.name || s.slug,
      isActive: s.isActive ?? false,
    }));
  } catch (err) {
    logger.error(err, "Failed to fetch seasons from bpcleague.in");
    return [];
  }
}

export async function fetchSeasonConfigFromBpcLeague(seasonSlug?: string): Promise<any> {
  const slug = seasonSlug
    ? seasonSlug.trim().toLowerCase()
    : await fetchActiveSeasonSlug();
  logger.info({ slug }, "Fetching season config from bpcleague.in");

  try {
    let payload;
    if (slug === "latest" || slug === "active") {
      payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/tournament", 15 * 60 * 1000);
    } else {
      payload = await fetchCachedJson<any>(`https://api.bpcleague.in/api/public/seasons/${slug}`, 15 * 60 * 1000);
    }
    return payload.season || payload.tournament || null;
  } catch (err) {
    logger.error(err, "Failed to fetch season config from bpcleague.in");
    return null;
  }
}


// ── Community player lookup (for substitute detection) ─────────────────────

/**
 * Fetches all community players from bpcleague.in and caches for 10 minutes.
 * Used to look up substitute players who aren't in the main roster.
 */
export async function fetchCommunityPlayers(): Promise<Array<{ bpcId: string; displayName: string; slug: string; avatarUrl?: string }>> {
  try {
    const payload = await fetchCachedJson<any>("https://api.bpcleague.in/api/public/community", 10 * 60 * 1000);
    const players = (payload.players || []).map((p: any) => ({
      bpcId: p.bpcId || "",
      displayName: p.displayName || "",
      slug: p.slug || "",
      avatarUrl: p.avatarUrl || p.card?.avatarUrl || undefined,
    }));
    logger.info({ count: players.length }, "[Community] Fetched community player list");
    return players;
  } catch (err) {
    logger.warn({ err }, "[Community] Failed to fetch community players");
    return [];
  }
}

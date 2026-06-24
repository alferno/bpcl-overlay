import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import type { RosterPlayer } from "@bpc/shared-types";
import { normalizeTeamColorHex } from "./roster-parser.js";
import { logger } from "../logger.js";

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
  displayName: string;
  name?: string;
  steamProfile?: string;
  role?: string;
  roles?: string[];
  mmr?: number;
  isCaptain?: boolean;
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

function fetchUrlJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`BPC League API returned HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

export async function fetchRosterFromBpcLeague(opts: {
  seasonSlug?: string;
  steamApiKey?: string;
}): Promise<RosterPlayer[]> {
  const slug = (opts.seasonSlug || "season-1").trim().toLowerCase();
  logger.info({ slug }, "Starting roster sync from bpcleague.in");

  let rawTeams: RawTeam[] = [];

  try {
    if (slug === "latest" || slug === "active") {
      const payload = await fetchUrlJson("https://api.bpcleague.in/api/public/tournament");
      rawTeams = payload.teams || [];
    } else {
      const payload = await fetchUrlJson(`https://api.bpcleague.in/api/public/seasons/${slug}`);
      if (payload.snapshot && payload.snapshot.teams) {
        rawTeams = payload.snapshot.teams;
      } else if (payload.tournament && payload.tournament.teams) {
        rawTeams = payload.tournament.teams;
      } else if (payload.participations) {
        // Fallback or structure checks
        rawTeams = payload.participations.map((p: any) => p.team).filter(Boolean);
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

    if (steam32 != null && steam32 > 0) {
      roster.push({ displayName, steam32, teamName, teamKey, teamColor, roles });
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
  const slug = (seasonSlug || "season-1").trim().toLowerCase();
  logger.info({ slug }, "Fetching tournament matches from bpcleague.in");

  try {
    let payload;
    if (slug === "latest" || slug === "active") {
      payload = await fetchUrlJson("https://api.bpcleague.in/api/public/tournament");
    } else {
      payload = await fetchUrlJson(`https://api.bpcleague.in/api/public/seasons/${slug}`);
    }

    let rawMatches: any[] = [];
    if (payload.snapshot && payload.snapshot.matches) {
      rawMatches = payload.snapshot.matches;
    } else if (payload.tournament && payload.snapshot?.matches) {
      rawMatches = payload.snapshot.matches;
    } else if (payload.tournament && payload.tournament.matches) {
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
    const payload = await fetchUrlJson("https://api.bpcleague.in/api/public/seasons");
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



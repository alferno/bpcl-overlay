import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

const SERIES_FILE = path.join(process.cwd(), "data", "series-history.json");

export interface SeriesContext {
  lastMatchId: number;
  radiantTeam: string;
  direTeam: string;
  radiantWins: number;
  direWins: number;
  gameNumber: number; // 1, 2, 3...
  lastDraft: {
    radiantPicks: number[];
    direPicks: number[];
    bans: number[]; // both teams
  } | null;
}

// Ensure data directory exists
if (!fs.existsSync(path.dirname(SERIES_FILE))) {
  fs.mkdirSync(path.dirname(SERIES_FILE), { recursive: true });
}

let currentSeries: SeriesContext | null = null;

// Load from disk on startup
if (fs.existsSync(SERIES_FILE)) {
  try {
    currentSeries = JSON.parse(fs.readFileSync(SERIES_FILE, "utf-8"));
  } catch (e) {
    logger.error({ err: e }, "Failed to load series history");
  }
}

function saveSeries() {
  if (currentSeries) {
    fs.writeFileSync(SERIES_FILE, JSON.stringify(currentSeries, null, 2));
  }
}

/**
 * Record a game ending. Identifies the teams and increments the series score if they match.
 */
export async function recordMatchEnd(
  matchId: number,
  radiantName: string,
  direName: string,
  winner: "radiant" | "dire" | "none",
  draftSnap?: any, // Pass the draft state directly from GSI to bypass Steam API
) {
  // Use a generic placeholder if team names are missing
  const radName = radiantName || "Radiant";
  const dirName = direName || "Dire";

  let radiantWins = 0;
  let direWins = 0;
  let gameNumber = 1;

  if (currentSeries && currentSeries.lastMatchId === matchId && matchId > 0) {
    logger.info({ matchId }, "Match end already recorded for this series; ignoring duplicate match ID (replay re-watch).");
    return;
  }

  // Check if this continues the previous series
  if (
    currentSeries &&
    ((currentSeries.radiantTeam === radName && currentSeries.direTeam === dirName) ||
     (currentSeries.radiantTeam === dirName && currentSeries.direTeam === radName))
  ) {
    radiantWins = currentSeries.radiantWins;
    direWins = currentSeries.direWins;
    gameNumber = currentSeries.gameNumber + 1;

    // Increment based on winner and current orientation
    if (winner === "radiant") {
      if (currentSeries.radiantTeam === radName) radiantWins++;
      else direWins++;
    } else if (winner === "dire") {
      if (currentSeries.direTeam === dirName) direWins++;
      else radiantWins++;
    }
  } else {
    // New series starting
    if (winner === "radiant") radiantWins++;
    else if (winner === "dire") direWins++;
  }

  currentSeries = {
    lastMatchId: matchId,
    radiantTeam: radName,
    direTeam: dirName,
    radiantWins,
    direWins,
    gameNumber,
    lastDraft: null,
  };

  logger.info({ matchId, radName, dirName, winner, radiantWins, direWins }, "Recorded match end for series history");

  // Populate lastDraft immediately from the GSI snapshot (works for private lobbies & replays)
  if (draftSnap) {
    const radiantPicks = draftSnap.radiant?.slots?.filter((s: any) => s.type === "pick" && s.heroId).map((s: any) => s.heroId) || [];
    const direPicks = draftSnap.dire?.slots?.filter((s: any) => s.type === "pick" && s.heroId).map((s: any) => s.heroId) || [];
    const bans = [
      ...(draftSnap.radiant?.slots?.filter((s: any) => s.type === "ban" && s.heroId).map((s: any) => s.heroId) || []),
      ...(draftSnap.dire?.slots?.filter((s: any) => s.type === "ban" && s.heroId).map((s: any) => s.heroId) || []),
    ];
    
    if (radiantPicks.length > 0 || direPicks.length > 0) {
      currentSeries.lastDraft = { radiantPicks, direPicks, bans };
      logger.info({ matchId, radiantPicks, direPicks, bans }, "Stored draft from live GSI for series history");
    }
  }

  // Fetch the draft from Steam API as a fallback if GSI didn't have it
  if (matchId > 0 && !currentSeries.lastDraft) {
    try {
      await fetchAndStorePreviousDraft(matchId);
    } catch (e) {
      logger.error({ err: e, matchId }, "Failed to fetch previous draft at post-game");
    }
  }

  saveSeries();
}

/**
 * Check if the provided teams are part of an ongoing series.
 */
export function getSeriesContext(teamA: string, teamB: string): SeriesContext | null {
  if (!currentSeries) return null;

  const tA = teamA || "Radiant";
  const tB = teamB || "Dire";

  const isMatch =
    (currentSeries.radiantTeam === tA && currentSeries.direTeam === tB) ||
    (currentSeries.radiantTeam === tB && currentSeries.direTeam === tA);

  if (isMatch) return currentSeries;
  return null;
}

export function getCurrentSeriesContext(): SeriesContext | null {
  return currentSeries;
}

/**
 * Fetches match details using Steam Web API and extracts picks/bans.
 */
async function fetchAndStorePreviousDraft(matchId: number) {
  const key = env.STEAM_WEB_API_KEY?.trim();
  if (!key) {
    logger.warn("No STEAM_WEB_API_KEY configured; cannot fetch draft data for series history.");
    return;
  }

  const url = `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/?key=${key}&match_id=${matchId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Steam GetMatchDetails HTTP ${res.status}`);
  }

  const body = await res.json();
  const match = body?.result;
  if (!match || !Array.isArray(match.picks_bans)) {
    logger.warn({ matchId }, "No picks_bans array found in Steam API response");
    return;
  }

  const radiantPicks: number[] = [];
  const direPicks: number[] = [];
  const bans: number[] = [];

  for (const pb of match.picks_bans) {
    if (pb.is_pick) {
      if (pb.team === 0) radiantPicks.push(pb.hero_id);
      else direPicks.push(pb.hero_id);
    } else {
      bans.push(pb.hero_id);
    }
  }

  if (currentSeries) {
    currentSeries.lastDraft = { radiantPicks, direPicks, bans };
    saveSeries();
    logger.info({ matchId, radiantPicks, direPicks, bans }, "Fetched and stored draft for series history");
  }
}

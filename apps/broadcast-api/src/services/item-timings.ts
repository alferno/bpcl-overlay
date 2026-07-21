import { logger } from "../logger.js";
import { HYPE_ITEMS } from "../gsi/power-spikes.js";
import { env } from "../env.js";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── CSV paths ────────────────────────────────────────────────────────────────
const DATA_DIR = path.resolve("data/timings");
const GLOBAL_CSV  = path.join(DATA_DIR, "item_timings_global.csv");
const LEAGUE_CSV  = path.join(DATA_DIR, "item_timings_league.csv");

// ── In-memory caches ─────────────────────────────────────────────────────────
// itemKey (without "item_" prefix) → heroId → avgTimeSec
const averageTimingsCache: Record<string, Record<number, number>> = {};
// itemKey (without "item_" prefix) → heroId → { time, count }
const leagueTimingsCache:  Record<string, Record<number, { time: number; count: number }>> = {};

let isPreloading = false;

// ── CSV helpers ───────────────────────────────────────────────────────────────

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/** Parse a simple 4-column CSV: heroId,item,avgTimeSec,count */
function parseTimingsCsv(raw: string): Array<{ heroId: number; item: string; avgTimeSec: number; count: number }> {
  const rows: Array<{ heroId: number; item: string; avgTimeSec: number; count: number }> = [];
  const lines = raw.trim().split("\n");
  for (let i = 1; i < lines.length; i++) {  // skip header
    const [heroIdStr, item, timeStr, countStr] = lines[i].split(",");
    const heroId = Number(heroIdStr);
    const avgTimeSec = Number(timeStr);
    const count = Number(countStr) || 1;
    if (!item || isNaN(heroId) || isNaN(avgTimeSec)) continue;
    rows.push({ heroId, item, avgTimeSec, count });
  }
  return rows;
}

function serializeTimingsCsv(
  data: Array<{ heroId: number; item: string; avgTimeSec: number; count: number }>,
): string {
  const header = "heroId,item,avgTimeSec,count";
  const rows = data.map((r) => `${r.heroId},${r.item},${r.avgTimeSec},${r.count}`);
  return [header, ...rows].join("\n");
}

// ── Boot-time load from CSV ───────────────────────────────────────────────────

/** Load both CSVs from disk into the in-memory caches. Call once at startup. */
export async function loadTimingsFromCsv(): Promise<void> {
  let globalLoaded = 0;
  let leagueLoaded = 0;

  if (existsSync(GLOBAL_CSV)) {
    try {
      const raw = await readFile(GLOBAL_CSV, "utf8");
      for (const { heroId, item, avgTimeSec } of parseTimingsCsv(raw)) {
        if (!averageTimingsCache[item]) averageTimingsCache[item] = {};
        averageTimingsCache[item][heroId] = avgTimeSec;
        globalLoaded++;
      }
    } catch (err) {
      logger.warn({ err }, "[ItemTimings] Failed to load global timings CSV");
    }
  }

  if (existsSync(LEAGUE_CSV)) {
    try {
      const raw = await readFile(LEAGUE_CSV, "utf8");
      for (const { heroId, item, avgTimeSec, count } of parseTimingsCsv(raw)) {
        if (!leagueTimingsCache[item]) leagueTimingsCache[item] = {};
        leagueTimingsCache[item][heroId] = { time: avgTimeSec, count };
        leagueLoaded++;
      }
    } catch (err) {
      logger.warn({ err }, "[ItemTimings] Failed to load league timings CSV");
    }
  }

  logger.info(
    { globalLoaded, leagueLoaded },
    "[ItemTimings] Loaded timings from CSV cache",
  );
}

// ── Global timings (OpenDota /scenarios/itemTimings) ─────────────────────────

interface OpenDotaItemTiming {
  hero_id: number;
  item: string;
  time: number;
  games: string;
  wins: string;
}

/** Fetch global average item timings from OpenDota and persist to CSV. */
export async function preloadItemTimings(): Promise<void> {
  if (isPreloading) return;
  isPreloading = true;

  const itemKeys = Object.keys(HYPE_ITEMS).map((k) => k.replace("item_", ""));
  logger.info({ items: itemKeys.length }, "[ItemTimings] Preloading global averages from OpenDota...");

  const rows: Array<{ heroId: number; item: string; avgTimeSec: number; count: number }> = [];

  for (const item of itemKeys) {
    try {
      const res = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?item=${item}`, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        logger.warn({ item, status: res.status }, "[ItemTimings] Failed to fetch global timing");
        continue;
      }

      const data = (await res.json()) as OpenDotaItemTiming[];

      // Weighted average across time buckets
      const grouped: Record<number, { sum: number; totalGames: number }> = {};
      for (const row of data) {
        if (!row.hero_id || !row.time || !row.games) continue;
        const heroId = Number(row.hero_id);
        const time   = Number(row.time);
        const games  = Number(row.games);
        if (!grouped[heroId]) grouped[heroId] = { sum: 0, totalGames: 0 };
        grouped[heroId].sum        += time * games;
        grouped[heroId].totalGames += games;
      }

      if (!averageTimingsCache[item]) averageTimingsCache[item] = {};
      for (const [heroIdStr, agg] of Object.entries(grouped)) {
        if (agg.totalGames > 0) {
          const avg = Math.round(agg.sum / agg.totalGames);
          averageTimingsCache[item][Number(heroIdStr)] = avg;
          rows.push({ heroId: Number(heroIdStr), item, avgTimeSec: avg, count: agg.totalGames });
        }
      }

      logger.debug({ item, heroesIndexed: Object.keys(grouped).length }, "[ItemTimings] Global timing loaded");

      // Be polite to OpenDota
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.warn({ item, error: String(err) }, "[ItemTimings] Error fetching global timing");
    }
  }

  // Persist to disk
  try {
    await ensureDataDir();
    await writeFile(GLOBAL_CSV, serializeTimingsCsv(rows), "utf8");
    logger.info({ rows: rows.length, path: GLOBAL_CSV }, "[ItemTimings] Global timings CSV saved");
  } catch (err) {
    logger.warn({ err }, "[ItemTimings] Failed to save global timings CSV");
  }

  isPreloading = false;
}

// ── League timings (OpenDota Explorer SQL) ────────────────────────────────────

let leagueTimingsFetchedForLeagueKey = "";

export function resetLeagueTimingsMatchState() {
  // No-op — league timings are now loaded from CSV at boot and are always ready.
  // Kept for API compatibility.
}

/** Fetch league-specific item timings from OpenDota Explorer and persist to CSV.
 *  Safe to call multiple times — deduplicates on leagueIds key. */
export async function fetchAndSaveLeagueTimingsCsv(leagueIds: number[]): Promise<void> {
  if (!leagueIds.length) return;
  const key = leagueIds.slice().sort().join(",");
  if (leagueTimingsFetchedForLeagueKey === key) {
    logger.info({ leagueIds }, "[ItemTimings] League timings already fetched for this set — skipping");
    return;
  }
  leagueTimingsFetchedForLeagueKey = key;

  const itemKeys = Object.keys(HYPE_ITEMS).map((k) => `'${k.replace("item_", "")}'`);
  const sql = `
    SELECT
      player_matches.hero_id,
      pl->>'key' as item,
      avg((pl->>'time')::int) as avg_time,
      count(*) as times_bought
    FROM player_matches
    JOIN matches USING(match_id)
    CROSS JOIN unnest(purchase_log) as pl
    WHERE matches.leagueid IN (${leagueIds.join(",")})
    AND pl->>'key' IN (${itemKeys.join(",")})
    GROUP BY player_matches.hero_id, pl->>'key'
  `;

  logger.info({ leagueIds }, "[ItemTimings] Fetching league item timings from OpenDota Explorer...");

  try {
    const url = "https://api.opendota.com/api/explorer?sql=" + encodeURIComponent(sql);
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[ItemTimings] League timings fetch failed");
      return;
    }
    const data = await res.json();
    if (!data.rows?.length) {
      logger.warn("[ItemTimings] League timings returned 0 rows");
      return;
    }

    const rows: Array<{ heroId: number; item: string; avgTimeSec: number; count: number }> = [];

    for (const row of data.rows) {
      if (!row.hero_id || !row.item || !row.avg_time) continue;
      const heroId    = Number(row.hero_id);
      const avgTimeSec = Math.round(Number(row.avg_time));
      const count     = Number(row.times_bought) || 1;
      const item      = row.item as string;

      if (!leagueTimingsCache[item]) leagueTimingsCache[item] = {};
      leagueTimingsCache[item][heroId] = { time: avgTimeSec, count };
      rows.push({ heroId, item, avgTimeSec, count });
    }

    logger.info({ rows: rows.length }, "[ItemTimings] League timings loaded into cache");

    // Persist
    await ensureDataDir();
    await writeFile(LEAGUE_CSV, serializeTimingsCsv(rows), "utf8");
    logger.info({ rows: rows.length, path: LEAGUE_CSV }, "[ItemTimings] League timings CSV saved");
  } catch (err) {
    logger.warn({ err: String(err) }, "[ItemTimings] Error fetching league timings");
  }
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getAverageItemTiming(heroId: number, itemKey: string): number | null {
  const cleanKey = itemKey.replace("item_", "");
  return averageTimingsCache[cleanKey]?.[heroId] ?? null;
}

export function getLeagueItemTiming(heroId: number, itemKey: string): { time: number; count: number } | null {
  const cleanKey = itemKey.replace("item_", "");
  return leagueTimingsCache[cleanKey]?.[heroId] ?? null;
}

/** How many heroes have global timing data loaded (useful for health checks). */
export function getGlobalTimingsCacheSize(): number {
  return Object.values(averageTimingsCache).reduce((acc, h) => acc + Object.keys(h).length, 0);
}

/** How many heroes have league timing data loaded. */
export function getLeagueTimingsCacheSize(): number {
  return Object.values(leagueTimingsCache).reduce((acc, h) => acc + Object.keys(h).length, 0);
}

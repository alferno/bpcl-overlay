import { logger } from "../logger.js";
import { HYPE_ITEMS } from "../gsi/power-spikes.js";
import { env } from "../env.js";

// memory cache: itemKey -> heroId -> averageTimeInSeconds
const averageTimingsCache: Record<string, Record<number, number>> = {};
let isPreloading = false;

interface OpenDotaItemTiming {
  hero_id: number;
  item: string;
  time: number;
  games: string;
  wins: string;
}

export async function preloadItemTimings() {
  if (isPreloading) return;
  isPreloading = true;

  const itemKeys = Object.keys(HYPE_ITEMS).map((k) => k.replace("item_", ""));
  logger.info({ items: itemKeys.length }, "Preloading average item timings from OpenDota...");

  // Fetch in background asynchronously
  void (async () => {
    for (const item of itemKeys) {
      try {
        const res = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?item=${item}`, {
          signal: AbortSignal.timeout(30_000), // 30s timeout per item
        });
        
        if (!res.ok) {
          logger.warn({ item, status: res.status }, "Failed to fetch item timing from OpenDota");
          continue;
        }

        const data = (await res.json()) as OpenDotaItemTiming[];
        
        // Group by hero_id to calculate weighted average
        const grouped: Record<number, { sum: number; totalGames: number }> = {};
        
        for (const row of data) {
          if (!row.hero_id || !row.time || !row.games) continue;
          
          const heroId = Number(row.hero_id);
          const time = Number(row.time);
          const games = Number(row.games);
          
          if (!grouped[heroId]) grouped[heroId] = { sum: 0, totalGames: 0 };
          
          grouped[heroId].sum += (time * games);
          grouped[heroId].totalGames += games;
        }

        averageTimingsCache[item] = {};
        for (const [heroIdStr, agg] of Object.entries(grouped)) {
          if (agg.totalGames > 0) {
            averageTimingsCache[item][Number(heroIdStr)] = Math.round(agg.sum / agg.totalGames);
          }
        }
        
        logger.debug({ item, heroesIndexed: Object.keys(grouped).length }, "Loaded item timing");
        
        // Sleep 2 seconds between requests to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (err) {
        logger.warn({ item, error: String(err) }, "Error fetching item timing");
      }
    }
    
    logger.info("Finished preloading average item timings.");
  })();
}

export function getAverageItemTiming(heroId: number, itemKey: string): number | null {
  const cleanKey = itemKey.replace("item_", "");
  if (!averageTimingsCache[cleanKey]) return null;
  return averageTimingsCache[cleanKey][heroId] ?? null;
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "../logger.js";

interface CacheEntry {
  timestamp: number;
  data: any;
}

// Ensure cache directory exists
const CACHE_DIR = path.resolve(process.cwd(), "../../data/system/cache");
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (err) {
  logger.warn({ err }, "[Cache] Failed to create cache directory");
}

function getCacheFilePath(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

/**
 * Fetches JSON from the given URL. If a valid cache exists on disk (within ttlMs),
 * returns that instead. If the network request fails, falls back to an expired cache if available.
 */
export async function fetchCachedJson<T>(url: string, ttlMs: number): Promise<T> {
  const cacheFile = getCacheFilePath(url);
  const now = Date.now();

  let cachedEntry: CacheEntry | null = null;

  try {
    if (fs.existsSync(cacheFile)) {
      const content = fs.readFileSync(cacheFile, "utf-8");
      cachedEntry = JSON.parse(content);
      
      // If within TTL, return instantly
      if (cachedEntry && now - cachedEntry.timestamp < ttlMs) {
        logger.debug({ url }, "[Cache] Hit (Valid)");
        return cachedEntry.data;
      }
    }
  } catch (err) {
    logger.warn({ err, url }, "[Cache] Failed to read cache file");
  }

  // Cache is missing or expired, fetch from network
  logger.info({ url }, "[Cache] Miss or expired — fetching from network");
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const data = await res.json();
    
    // Write back to cache
    try {
      const newEntry: CacheEntry = { timestamp: now, data };
      fs.writeFileSync(cacheFile, JSON.stringify(newEntry, null, 2));
    } catch (err) {
      logger.warn({ err, url }, "[Cache] Failed to write cache file");
    }

    return data;
  } catch (err) {
    logger.error({ err, url }, "[Cache] Network request failed");
    
    // Fall back to expired cache if we have one (to prevent the app from breaking if hostinger bans us)
    if (cachedEntry) {
      logger.warn({ url }, "[Cache] Falling back to EXPIRED cache due to network failure");
      return cachedEntry.data;
    }

    throw err;
  }
}

/**
 * Force flush the entire cache directory.
 */
export function clearBpclCache(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        if (file.endsWith(".json")) {
          fs.unlinkSync(path.join(CACHE_DIR, file));
        }
      }
      logger.info("[Cache] Cleared all cached API responses");
    }
  } catch (err) {
    logger.error({ err }, "[Cache] Failed to clear cache directory");
  }
}

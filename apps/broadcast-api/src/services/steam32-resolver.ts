import { logger } from "../logger.js";
import path from "node:path";
import fs from "node:fs";

const STEAM64_OFFSET = 76561197960265728n;
const CACHE_FILE = path.join(process.cwd(), "steam32-cache.json");

// In-memory cache for this process
let steam32Cache: Record<string, number> = {};

function loadCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      steam32Cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      logger.info(`Loaded ${Object.keys(steam32Cache).length} cached Steam32 IDs`);
    }
  } catch {
    steam32Cache = {};
  }
}
loadCache();

function saveCache(): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(steam32Cache, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to persist Steam32 cache");
  }
}

// Convert Steam64 number-string to Steam32
export function steam64ToSteam32(steam64Str: string): number {
  try {
    const steam64 = BigInt(steam64Str);
    return Number(steam64 - STEAM64_OFFSET);
  } catch {
    return 0;
  }
}

/**
 * Synchronously extracts a Steam32 ID from an already-unambiguous identifier:
 *  - a bare Steam32 int ("123456789")
 *  - a bare Steam64 int ("76561198083722417")
 *  - a /profiles/<steam64>/ URL
 * Returns null for anything requiring a network lookup (vanity /id/ URLs) or
 * unrecognized input — callers should fall back to resolveSteamProfileToSteam32
 * for those.
 */
export function parseSteamIdentifierSync(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const profilesMatch = s.toLowerCase().match(/\/profiles\/(\d+)/);
  if (profilesMatch) {
    const steam32 = steam64ToSteam32(profilesMatch[1]);
    return steam32 > 0 ? steam32 : null;
  }

  if (/^\d+$/.test(s)) {
    // Steam64 IDs are 17 digits and start at 76561197960265728.
    if (s.length >= 17) {
      const steam32 = steam64ToSteam32(s);
      return steam32 > 0 ? steam32 : null;
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

/** True if the raw column value is a Steam profile URL of any kind. */
export function isSteamProfileUrl(raw: string): boolean {
  return /^https?:\/\/(www\.)?steamcommunity\.com\/(profiles|id)\//i.test(
    raw.trim(),
  );
}

/**
 * Resolves a Steam profile URL to a Steam32 account ID.
 *
 * Handles:
 *  - /profiles/76561xxxxxxxxxx/ → direct math conversion
 *  - /id/vanityurl/            → Steam API lookup (cached to disk)
 */
export async function resolveSteamProfileToSteam32(
  profileUrl: string
): Promise<number | null> {
  if (!profileUrl) return null;

  // Normalize only the scheme/host/prefix and keep the vanity slug case-sensitive
  const trimmed = profileUrl.trim();
  const match = trimmed.match(/^(https?:\/\/(?:www\.)?steamcommunity\.com\/(?:profiles|id)\/)(.*)$/i);
  const url = match ? (match[1].toLowerCase() + match[2]) : trimmed.toLowerCase();

  // Extract Steam64 from /profiles/ URL
  const profilesMatch = url.match(/\/profiles\/(\d+)/);
  if (profilesMatch) {
    const steam32 = steam64ToSteam32(profilesMatch[1]);
    return steam32 > 0 ? steam32 : null;
  }

  // Extract vanity slug from /id/ URL
  const vanityMatch = url.match(/\/id\/([^/]+)/);
  if (vanityMatch) {
    const vanity = vanityMatch[1];

    // Check in-memory / disk cache first
    if (steam32Cache[vanity]) {
      return steam32Cache[vanity];
    }

    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      logger.warn(
        { vanity },
        "STEAM_API_KEY not set — cannot resolve vanity URL to Steam32"
      );
      return null;
    }

    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?vanityurl=${encodeURIComponent(vanity)}&key=${apiKey}`
      );
      const json = (await res.json()) as {
        response?: { success: number; steamid?: string };
      };

      if (json.response?.success === 1 && json.response.steamid) {
        const steam32 = steam64ToSteam32(json.response.steamid);
        if (steam32 > 0) {
          steam32Cache[vanity] = steam32;
          saveCache();
          logger.info({ vanity, steam32 }, "Resolved vanity → Steam32 (cached)");
          return steam32;
        }
      }

      logger.warn({ vanity, response: json.response }, "Steam vanity URL did not resolve");
      return null;
    } catch (err) {
      logger.warn({ vanity, err }, "Failed to resolve Steam vanity URL");
      return null;
    }
  }

  logger.warn({ profileUrl }, "Unrecognized Steam profile URL format");
  return null;
}

/**
 * Batch-resolve an array of profile URLs, resolving all vanity URLs in parallel.
 * Already-cached entries resolve instantly.
 */
export async function batchResolveSteam32(
  profileUrls: string[]
): Promise<(number | null)[]> {
  return Promise.all(profileUrls.map((url) => resolveSteamProfileToSteam32(url)));
}

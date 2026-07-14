import type { OpenDotaClient } from "../opendota-client.js";
import { logger } from "../logger.js";

const avatarCache = new Map<number, string>();

type OpenDotaPlayerProfile = {
  profile?: { avatarfull?: string; avatarmedium?: string; avatar?: string };
  avatarfull?: string;
  avatarmedium?: string;
  avatar?: string;
};

export function steamProfileUrl(steam32: number): string {
  return `https://steamcommunity.com/profiles/${76561197960265728 + steam32}`;
}

export async function fetchSteamAvatarUrl(
  client: OpenDotaClient,
  steam32: number,
): Promise<string | undefined> {
  if (steam32 <= 0) return undefined;
  const cached = avatarCache.get(steam32);
  if (cached) return cached;

  let url: string | undefined = undefined;

  // Primary: Use official Steam API if we have the key (much more reliable than OpenDota)
  const apiKey = process.env.STEAM_WEB_API_KEY;
  if (apiKey) {
    try {
      const steam64 = BigInt(steam32) + BigInt("76561197960265728");
      const https = await import("node:https");
      url = await new Promise<string | undefined>((resolve) => {
        https.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steam64}`, (res) => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const avatar = parsed.response?.players?.[0]?.avatarfull;
              resolve(avatar);
            } catch {
              resolve(undefined);
            }
          });
        }).on("error", () => resolve(undefined));
      });
    } catch (err) {
      logger.warn({ err, steam32 }, "Failed to fetch avatar from Steam API");
    }
  }

  // Fallback: Use OpenDota if Steam API failed or key is missing
  if (!url) {
    const res = await client.playerProfile(steam32);
    if (res.ok && res.data) {
      const body = res.data as OpenDotaPlayerProfile;
      url =
        body.profile?.avatarfull ??
        body.avatarfull ??
        body.profile?.avatarmedium ??
        body.avatarmedium ??
        body.profile?.avatar ??
        body.avatar;
    }
  }

  if (typeof url === "string" && url.startsWith("http")) {
    avatarCache.set(steam32, url);
    return url;
  }

  return undefined;
}

/** Fill missing roster avatarUrl from OpenDota (respects CSV overrides). */
export async function enrichRosterAvatars<
  T extends { steam32: number; avatarUrl?: string },
>(roster: T[], client: OpenDotaClient): Promise<T[]> {
  return Promise.all(
    roster.map(async (player) => {
      if (player.avatarUrl?.trim()) return player;
      try {
        const url = await fetchSteamAvatarUrl(client, player.steam32);
        return url ? { ...player, avatarUrl: url } : player;
      } catch (err) {
        logger.warn({ err, steam32: player.steam32 }, "avatar fetch failed");
        return player;
      }
    })
  );
}

export function clearAvatarCache(): void {
  avatarCache.clear();
}

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

  const res = await client.playerProfile(steam32);
  if (!res.ok || !res.data) return undefined;

  const body = res.data as OpenDotaPlayerProfile;
  const url =
    body.profile?.avatarfull ??
    body.avatarfull ??
    body.profile?.avatarmedium ??
    body.avatarmedium ??
    body.profile?.avatar ??
    body.avatar;

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
  const out: T[] = [];
  for (const player of roster) {
    if (player.avatarUrl?.trim()) {
      out.push(player);
      continue;
    }
    try {
      const url = await fetchSteamAvatarUrl(client, player.steam32);
      out.push(url ? { ...player, avatarUrl: url } : player);
    } catch (err) {
      logger.warn({ err, steam32: player.steam32 }, "avatar fetch failed");
      out.push(player);
    }
  }
  return out;
}

export function clearAvatarCache(): void {
  avatarCache.clear();
}

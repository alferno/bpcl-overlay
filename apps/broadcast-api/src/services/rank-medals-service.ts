import type { OpenDotaClient } from "../opendota-client.js";
import type { RosterPlayer } from "@bpc/shared-types";
import { logger } from "../logger.js";

/**
 * MMR → rank tier mapping.
 * Matches the bracket used in RankMedalsHUD.tsx.
 */
export function getRankFromMmr(mmr?: number): string {
  if (mmr === undefined || mmr === null || mmr === 0) return "uncalibrated";
  if (mmr >= 5620) return "immortal";
  if (mmr >= 4620) return "divine";
  if (mmr >= 3850) return "ancient";
  if (mmr >= 3080) return "legend";
  if (mmr >= 2310) return "archon";
  if (mmr >= 1540) return "crusader";
  if (mmr >= 770) return "guardian";
  return "herald";
}

// ── Per-session MMR cache to avoid spamming OpenDota ─────────────────────────
// Keyed by steam32 → { mmr, fetchedAt }
const mmrCache = new Map<number, { mmr: number | undefined; fetchedAt: number }>();

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedMmr(steam32: number): number | undefined | null {
  const entry = mmrCache.get(steam32);
  if (!entry) return null; // null = "not cached"
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    mmrCache.delete(steam32);
    return null;
  }
  return entry.mmr; // undefined = "cached but no mmr found"
}

function setCachedMmr(steam32: number, mmr: number | undefined): void {
  mmrCache.set(steam32, { mmr, fetchedAt: Date.now() });
}

/**
 * OpenDota /players/{id} response shape (relevant MMR fields).
 */
type OpenDotaPlayerData = {
  solo_competitive_rank?: number | null;
  competitive_rank?: number | null;
  rank_tier?: number | null;
  mmr_estimate?: { estimate?: number } | null;
  leaderboard_rank?: number | null;
};

/**
 * Derive MMR from OpenDota player data.
 * Priority: solo_competitive_rank → competitive_rank → mmr_estimate → rank_tier conversion
 */
function extractMmrFromOpenDota(data: OpenDotaPlayerData): number | undefined {
  // Direct MMR fields (most accurate)
  if (typeof data.solo_competitive_rank === "number" && data.solo_competitive_rank > 0) {
    return data.solo_competitive_rank;
  }
  if (typeof data.competitive_rank === "number" && data.competitive_rank > 0) {
    return data.competitive_rank;
  }

  // MMR estimate from OpenDota algorithm
  const est = data.mmr_estimate?.estimate;
  if (typeof est === "number" && est > 0) {
    return Math.round(est);
  }

  // Convert rank_tier to approximate MMR (rank_tier is a 2-digit number: tens=badge, ones=stars)
  // e.g. 54 = Ancient 4, 70 = Divine 0 (Immortal threshold)
  if (typeof data.rank_tier === "number" && data.rank_tier > 0) {
    return rankTierToMmr(data.rank_tier);
  }

  return undefined;
}

/**
 * Convert Dota 2 rank_tier to an approximate MMR midpoint.
 * rank_tier = (badge * 10) + stars  where badge: 1=Herald…8=Immortal
 */
function rankTierToMmr(rankTier: number): number {
  const badge = Math.floor(rankTier / 10);
  const stars = rankTier % 10; // 1-5 within a badge

  // MMR bracket floor per badge (roughly)
  const floors: Record<number, number> = {
    1: 0,     // Herald
    2: 770,   // Guardian
    3: 1540,  // Crusader
    4: 2310,  // Archon
    5: 3080,  // Legend
    6: 3850,  // Ancient
    7: 4620,  // Divine
    8: 5620,  // Immortal
  };

  const floor = floors[badge] ?? 0;
  // Each star step within a badge ≈ 154 MMR (770/5)
  return floor + Math.max(0, stars - 1) * 154;
}

/**
 * Fetch MMR for a single player from OpenDota.
 * Returns undefined if not available.
 */
async function fetchMmrFromOpenDota(
  opendota: OpenDotaClient,
  steam32: number,
): Promise<number | undefined> {
  try {
    const res = await opendota.playerProfile(steam32);
    if (!res.ok || !res.data) {
      logger.debug({ steam32, status: res.status }, "[RankMedals] OpenDota player profile unavailable");
      return undefined;
    }
    const mmr = extractMmrFromOpenDota(res.data as OpenDotaPlayerData);
    logger.info({ steam32, mmr }, "[RankMedals] MMR resolved from OpenDota");
    return mmr;
  } catch (err) {
    logger.warn({ err, steam32 }, "[RankMedals] OpenDota MMR fetch failed");
    return undefined;
  }
}

/**
 * Resolve MMR for a player using the priority chain:
 *   1. Roster MMR (from BPCL API sync)
 *   2. OpenDota /players/{id}
 *   3. undefined → overlay shows "uncalibrated"
 */
export async function resolvePlayerMmr(
  steam32: number,
  rosterPlayer: RosterPlayer | undefined,
  opendota: OpenDotaClient,
): Promise<number | undefined> {
  // 1. Roster MMR (most trusted — comes from BPCL league API)
  if (typeof rosterPlayer?.mmr === "number" && rosterPlayer.mmr > 0) {
    logger.debug({ steam32, mmr: rosterPlayer.mmr }, "[RankMedals] MMR from roster");
    return rosterPlayer.mmr;
  }

  // Check session cache before hitting external API
  const cached = getCachedMmr(steam32);
  if (cached !== null) {
    return cached;
  }

  // 2. OpenDota API fallback
  const mmr = await fetchMmrFromOpenDota(opendota, steam32);
  setCachedMmr(steam32, mmr);
  return mmr;
}

/**
 * Enrich a set of steam32 IDs with MMR data, patching any roster entries that
 * are missing MMR.  Returns an updated copy of the roster.
 *
 * This is called once per unique lobby from the GSI handler so we don't spam
 * external APIs on every tick.
 */
export async function enrichRosterMmr(
  steam32Ids: number[],
  roster: RosterPlayer[],
  opendota: OpenDotaClient,
): Promise<RosterPlayer[]> {
  if (steam32Ids.length === 0) return roster;

  const rosterMap = new Map<number, RosterPlayer>(roster.map((p) => [p.steam32, p]));
  let changed = false;

  await Promise.all(
    steam32Ids.map(async (steam32) => {
      if (steam32 <= 0) return;

      const player = rosterMap.get(steam32);

      // Skip if already has MMR from roster
      if (typeof player?.mmr === "number" && player.mmr > 0) return;

      // Skip if we already tried and failed for this player this session
      const cached = getCachedMmr(steam32);
      if (cached !== null) {
        // If cached and player exists in roster, patch it
        if (cached !== undefined && player) {
          rosterMap.set(steam32, { ...player, mmr: cached });
          changed = true;
        }
        return;
      }

      // Fetch from OpenDota
      const mmr = await fetchMmrFromOpenDota(opendota, steam32);
      setCachedMmr(steam32, mmr);

      if (mmr !== undefined) {
        if (player) {
          rosterMap.set(steam32, { ...player, mmr });
        } else {
          // Player is not in roster yet (sub / unregistered) — still cache for overlay
          rosterMap.set(steam32, {
            steam32,
            displayName: `Player ${steam32}`,
            mmr,
          });
        }
        changed = true;
      }
    }),
  );

  if (!changed) return roster;

  // Merge updated entries back into the roster array (preserving original order)
  const updated = roster.map((p) => rosterMap.get(p.steam32) ?? p);

  // Add any brand-new (non-roster) entries that got MMR
  const rosterSteam32s = new Set(roster.map((p) => p.steam32));
  for (const [steam32, player] of rosterMap) {
    if (!rosterSteam32s.has(steam32)) {
      updated.push(player);
    }
  }

  logger.info(
    { enriched: steam32Ids.length },
    "[RankMedals] Roster MMR enrichment complete",
  );
  return updated;
}

/**
 * Clear the in-process MMR session cache (call on new match detected).
 */
export function clearMmrCache(): void {
  mmrCache.clear();
  logger.info("[RankMedals] MMR cache cleared for new match");
}

import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../env.js";
import { logger } from "../logger.js";

/** Amateur / private leagues: Steam match history + optional env IDs only. */
export type LeagueMatchSource = "steam" | "env" | "mixed";

export type LeagueMatchResolveResult = {
  matchIds: number[];
  source: LeagueMatchSource;
  warning?: string;
};

type SteamMatchHistoryResponse = {
  result?: {
    status?: number;
    matches?: Array<{ match_id?: number }>;
    total_results?: number;
  };
};

function parseEnvMatchIds(): number[] {
  const raw = env.LEAGUE_MATCH_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function fetchSteamLeagueMatchIds(
  leagueId: number,
  maxMatches: number,
): Promise<number[]> {
  const key = env.STEAM_WEB_API_KEY?.trim();
  if (!key) return [];

  const ids: number[] = [];
  let startAt: number | undefined;

  while (ids.length < maxMatches) {
    const params = new URLSearchParams({
      key,
      league_id: String(leagueId),
      matches_requested: String(Math.min(100, maxMatches - ids.length)),
    });
    if (startAt !== undefined) {
      params.set("start_at_match_id", String(startAt));
    }

    const url = `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Steam match history HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as SteamMatchHistoryResponse;
    const status = body.result?.status;
    const batch = body.result?.matches ?? [];

    if (status !== undefined && status !== 1 && batch.length === 0) {
      throw new Error(
        `Steam GetMatchHistory status ${status} for league ${leagueId} (no matches in response)`,
      );
    }

    if (batch.length === 0) break;

    for (const m of batch) {
      if (typeof m.match_id === "number" && m.match_id > 0) {
        ids.push(m.match_id);
      }
    }

    const last = batch[batch.length - 1]?.match_id;
    if (last === undefined || batch.length < 100) break;
    startAt = last - 1;
  }

  const unique = [...new Set(ids)].slice(0, maxMatches);
  logger.info({ leagueId, count: unique.length }, "Steam league match IDs loaded");
  return unique;
}

/**
 * Resolve league match IDs for amateur/private leagues via Steam Web API.
 * OpenDota does not publish match lists for excluded-tier leagues.
 */
export async function resolveLeagueMatchIds(
  leagueId: number,
  maxMatches = 80,
): Promise<LeagueMatchResolveResult> {
  const envIds = parseEnvMatchIds();
  const warnings: string[] = [];

  if (!env.STEAM_WEB_API_KEY?.trim() && envIds.length === 0) {
    return {
      matchIds: [],
      source: "env",
      warning:
        "Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS (comma-separated match IDs).",
    };
  }

  let steamIds: number[] = [];
  if (env.STEAM_WEB_API_KEY?.trim()) {
    try {
      steamIds = await fetchSteamLeagueMatchIds(leagueId, maxMatches);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, leagueId }, "Steam league match history failed");
      warnings.push(msg);
    }
  } else if (envIds.length === 0) {
    warnings.push("STEAM_WEB_API_KEY is not set — cannot load match list from Steam.");
  }

  const combined = [...new Set([...envIds, ...steamIds])].slice(0, maxMatches);

  if (combined.length === 0) {
    return {
      matchIds: [],
      source: envIds.length > 0 ? "env" : "steam",
      warning:
        warnings.join(" ") ||
        `No matches returned for league ${leagueId}. Add LEAGUE_MATCH_IDS or verify the Steam key and league ID.`,
    };
  }

  let source: LeagueMatchSource = "steam";
  if (envIds.length > 0 && steamIds.length > 0) source = "mixed";
  else if (envIds.length > 0 && steamIds.length === 0) source = "env";

  if (steamIds.length === 0 && envIds.length > 0) {
    warnings.push(`Using ${envIds.length} match ID(s) from LEAGUE_MATCH_IDS only.`);
  }

  return {
    matchIds: combined,
    source,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}

/** Hint for error messages — where broadcast-api expects .env */
export function broadcastApiEnvPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../.env");
}

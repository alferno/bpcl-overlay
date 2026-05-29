import { env } from "../env.js";
import { logger } from "../logger.js";
import type { OpenDotaClient } from "../opendota-client.js";

export type LeagueMatchSource = "opendota" | "steam" | "env" | "mixed";

export type LeagueMatchResolveResult = {
  matchIds: number[];
  source: LeagueMatchSource;
  leagueName?: string;
  tier?: string;
  warning?: string;
};

type SteamMatchHistoryResponse = {
  result?: {
    status?: number;
    matches?: Array<{ match_id?: number }>;
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
  const key = env.STEAM_WEB_API_KEY;
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
    const batch = body.result?.matches ?? [];
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

  return [...new Set(ids)].slice(0, maxMatches);
}

export async function resolveLeagueMatchIds(
  leagueId: number,
  client: OpenDotaClient,
  maxMatches = 80,
): Promise<LeagueMatchResolveResult> {
  let leagueName: string | undefined;
  let tier: string | undefined;
  let warning: string | undefined;

  const leagueRes = await client.leagueInfo(leagueId);
  if (leagueRes.ok && leagueRes.data && typeof leagueRes.data === "object") {
    const info = leagueRes.data as { name?: string; tier?: string };
    leagueName = info.name;
    tier = info.tier;
  }

  const opendotaRes = await client.leagueMatches(leagueId);
  const opendotaIds =
    opendotaRes.ok && Array.isArray(opendotaRes.data)
      ? (opendotaRes.data as Array<{ match_id?: number }>)
          .map((m) => m.match_id)
          .filter((id): id is number => typeof id === "number")
      : [];

  const envIds = parseEnvMatchIds();
  let steamIds: number[] = [];

  if (opendotaIds.length > 0) {
    const matchIds = [...new Set([...envIds, ...opendotaIds])].slice(0, maxMatches);
    return {
      matchIds,
      source: envIds.length > 0 ? "mixed" : "opendota",
      leagueName,
      tier,
    };
  }

  if (tier === "excluded" || tier === "amateur") {
    warning =
      `OpenDota does not index match lists for tier "${tier}" leagues. ` +
      "Using Steam Web API or LEAGUE_MATCH_IDS instead.";
  } else if (opendotaIds.length === 0) {
    warning = "OpenDota returned 0 matches for this league.";
  }

  try {
    steamIds = await fetchSteamLeagueMatchIds(leagueId, maxMatches);
  } catch (err) {
    logger.warn(err, "Steam league match history failed");
    if (!env.STEAM_WEB_API_KEY) {
      warning =
        (warning ? warning + " " : "") +
        "Set STEAM_WEB_API_KEY in .env to load amateur league matches from Steam.";
    } else {
      warning =
        (warning ? warning + " " : "") +
        (err instanceof Error ? err.message : String(err));
    }
  }

  const combined = [...new Set([...envIds, ...steamIds])].slice(0, maxMatches);

  if (combined.length === 0) {
    return {
      matchIds: [],
      source: envIds.length > 0 ? "env" : "opendota",
      leagueName,
      tier,
      warning:
        (warning ? warning + " " : "") +
        "No match IDs found. Add STEAM_WEB_API_KEY and/or comma-separated LEAGUE_MATCH_IDS.",
    };
  }

  let source: LeagueMatchSource = "steam";
  if (envIds.length > 0 && steamIds.length > 0) source = "mixed";
  else if (envIds.length > 0 && steamIds.length === 0) source = "env";
  else if (steamIds.length > 0) source = "steam";

  return { matchIds: combined, source, leagueName, tier, warning };
}

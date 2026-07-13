import Bottleneck from "bottleneck";
import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

const OPEN_DOTA_BASE = "https://api.opendota.com/api";

export type CachedResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  status: number;
  stale?: boolean;
  error?: string;
};

type Entry = { expiry: number; body: CachedResponse };

export type OpenDotaPickBan = {
  is_pick: boolean;
  hero_id: number;
  team: number;
  order: number;
};

export type OpenDotaMatchPlayer = {
  account_id?: number;
  hero_id?: number;
  player_slot?: number;
  /** 0 = played normally; non-zero = disconnected / abandoned */
  leaver_status?: number;
  win?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  hero_damage?: number;
  hero_healing?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  net_worth?: number;
  last_hits?: number;
  denies?: number;
  /** 1 safe · 2 mid · 3 off (OpenDota lane id) */
  lane?: number;
  lane_role?: number;
  lane_efficiency?: number;
  lane_efficiency_pct?: number;
  is_roaming?: boolean;
  // End-of-game inventory (main slots 0–5)
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  // Neutral item slot
  item_neutral?: number;
  // Backpack slots
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  // Aghanim upgrades (1 = owned)
  aghanims_scepter?: number;
  aghanims_shard?: number;
};


export type OpenDotaMatch = {
  match_id: number;
  radiant_win?: boolean;
  /** Match duration in seconds */
  duration?: number;
  /** When set and non-zero, must match the league being aggregated */
  leagueid?: number;
  /** Legacy / alternate API spelling */
  pick_bans?: OpenDotaPickBan[];
  /** OpenDota match detail uses this field name */
  picks_bans?: OpenDotaPickBan[];
  players?: OpenDotaMatchPlayer[];
};

/** Draft events from an OpenDota match (handles field name variants). */
export function getMatchPickBans(match: OpenDotaMatch): OpenDotaPickBan[] {
  const rows = match.picks_bans ?? match.pick_bans;
  return Array.isArray(rows) ? rows : [];
}

export class OpenDotaClient {
  private limiter: Bottleneck;
  private memory = new Map<string, Entry>();
  private redis: Redis | null = null;

  constructor(private readonly ttlSeconds = 600) {
    const perMinute = env.OPENDOTA_RATE_PER_MINUTE;
    const minTime = Math.max(750, Math.floor(60000 / Math.max(1, perMinute)));
    this.limiter = new Bottleneck({
      minTime,
      maxConcurrent: 1,
      reservoir: Math.max(1, perMinute),
      reservoirRefreshAmount: Math.max(1, perMinute),
      reservoirRefreshInterval: 60 * 1000,
    });
  }

  attachRedis(url: string): void {
    this.redis = new Redis(url);
  }

  async shutdown(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  async getCached<T>(
    key: string,
    urlPath: string,
  ): Promise<CachedResponse<T>> {
    const now = Date.now();
    const mem = this.memory.get(key);
    if (mem && mem.expiry > now) return mem.body as CachedResponse<T>;

    if (this.redis) {
      try {
        const raw = await this.redis.get(`opendota:${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedResponse<T>;
          const body = { ...parsed, stale: true };
          return body;
        }
      } catch (err) {
        logger.warn(err, "Redis OpenDota read failed");
      }
    }

    const fresh = await this.fetchLive<T>(urlPath);
    if (fresh.ok) {
      this.memory.set(key, {
        expiry: now + this.ttlSeconds * 1000,
        body: fresh,
      });

      if (this.redis) {
        await this.redis
          .setex(`opendota:${key}`, this.ttlSeconds, JSON.stringify(fresh))
          .catch(() => undefined);
      }
    }

    return fresh;
  }

  async fetchLive<T>(
    urlPath: string,
    method: "GET" | "POST" = "GET",
  ): Promise<CachedResponse<T>> {
    return this.limiter.schedule(async (): Promise<CachedResponse<T>> => {
      try {
        const res = await fetch(`${OPEN_DOTA_BASE}${urlPath}`, {
          method,
          signal: AbortSignal.timeout(90_000),
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            error: text.slice(0, 280),
          };
        }

        try {
          return {
            ok: true,
            status: res.status,
            data: JSON.parse(text) as T,
          };
        } catch {
          return { ok: false, status: res.status, error: "invalid json" };
        }
      } catch (err) {
        return {
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });
  }

  async playerProfile(
    accountId: number | string,
  ): Promise<CachedResponse<Record<string, unknown>>> {
    return this.getCached<Record<string, unknown>>(
      `players:${accountId}:profile`,
      `/players/${accountId}`,
    );
  }

  async playerHeroStats(accountId: number | string): Promise<
    CachedResponse<unknown[]>
  > {
    return this.getCached<unknown[]>(
      `players:${accountId}:heroes`,
      `/players/${accountId}/heroes`,
    );
  }

  async heroMatchups(heroId: number): Promise<CachedResponse<unknown>> {
    return this.getCached<unknown>(
      `heroes:${heroId}:matchups`,
      `/heroes/${heroId}/matchups`,
    );
  }

  async leagueMatches(leagueId: number): Promise<CachedResponse<unknown>> {
    return this.getCached<unknown>(
      `leagues:${leagueId}:matches`,
      `/leagues/${leagueId}/matches`,
    );
  }

  async leagueInfo(
    leagueId: number,
  ): Promise<CachedResponse<{ leagueid?: number; name?: string; tier?: string }>> {
    return this.getCached(
      `leagues:${leagueId}:info`,
      `/leagues/${leagueId}`,
    );
  }

  async requestMatchParse(matchId: number | string): Promise<CachedResponse<unknown>> {
    return this.fetchLive(`/request/${matchId}`, "POST");
  }

  async matchDetails(matchId: number | string): Promise<CachedResponse<OpenDotaMatch>> {
    const { existsSync } = await import("node:fs");
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");

    const diskPath = path.resolve(process.cwd(), `data/matches/${matchId}.json`);
    try {
      if (existsSync(diskPath)) {
        const raw = await readFile(diskPath, "utf-8");
        return { ok: true, status: 200, data: JSON.parse(raw) };
      }
    } catch {}

    const res = await this.getCached<OpenDotaMatch>(
      `matches:${matchId}:detail`,
      `/matches/${matchId}`,
    );

    if (res.ok && res.data && res.data.players && res.data.players.length > 0) {
      try {
        await mkdir(path.resolve(process.cwd(), "data/matches"), { recursive: true });
        await writeFile(diskPath, JSON.stringify(res.data));
      } catch (err) {
        logger.warn(err, "Failed to write match to cold storage");
      }
    }
    return res;
  }

  async heroesConstants(): Promise<CachedResponse<unknown[]>> {
    return this.getCached<unknown[]>(`constants:heroes`, `/heroes`);
  }

  /** Head-to-head between two heroes using OpenDota matchups response */
  async matchupBetween(
    heroA: number,
    heroB: number,
  ): Promise<CachedResponse<Record<string, unknown>>> {
    const left = await this.heroMatchups(heroA);
    if (!left.ok || left.data === undefined || left.data === null) {
      return {
        ok: false,
        status: left.status,
        error: left.error ?? "matchup unavailable",
      };
    }

    const rows = Array.isArray(left.data) ? left.data : [];
    let matchRow: Record<string, unknown> = {};
    for (const raw of rows) {
      if (raw && typeof raw === "object" && "hero_id" in raw) {
        const hid = (raw as { hero_id?: unknown }).hero_id;
        if (typeof hid === "number" && hid === heroB) {
          matchRow = raw as Record<string, unknown>;
          break;
        }
      }
    }

    return {
      ok: true,
      status: left.status ?? 200,
      data: matchRow,
    };
  }

  purgeMemory(): void {
    this.memory.clear();
  }
}

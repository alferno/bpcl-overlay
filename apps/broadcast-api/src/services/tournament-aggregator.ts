import type {
  PlayerHeroLeagueStats,
  TournamentHeroAggregate,
} from "@bpc/shared-types";
import {
  getMatchPickBans,
  type OpenDotaClient,
  type OpenDotaMatch,
  type OpenDotaMatchPlayer,
  type OpenDotaPickBan,
} from "../opendota-client.js";
import {
  ensureHeroRegistry,
  heroDisplayName,
} from "./hero-registry.js";
import { logger } from "../logger.js";
import { resolveLeagueMatchIds } from "./league-match-resolver.js";
import { computeLaneOutcomesForMatch } from "./lane-outcome.js";
import {
  shouldCountPlayerLeagueGame,
  type LeaguePlayerHeroRow,
} from "./league-stats-store.js";

/** OpenDota / Valve: 0 and 4294967295 (0xFFFFFFFF) mean anonymous / invalid. */
const ANONYMOUS_ACCOUNT_ID = 4294967295;

export function steam32FromMatchPlayer(
  p: OpenDotaMatchPlayer,
): number | undefined {
  const id = p.account_id;
  if (typeof id !== "number" || !Number.isFinite(id)) return undefined;
  if (id <= 0 || id >= ANONYMOUS_ACCOUNT_ID) return undefined;
  return id;
}

export type AggregationProgress = {
  status: "idle" | "running" | "ready" | "error";
  progress: number;
  matchTotal: number;
  matchDone: number;
  error?: string;
  heroIndex: Record<string, TournamentHeroAggregate>;
};

export type { PlayerHeroLeagueStats };

export type PlayerLeagueStats = PlayerHeroLeagueStats;

type HeroAcc = {
  picks: number;
  bans: number;
  wins: number;
  losses: number;
};

type PlayerHeroAcc = {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  heroDamage: number;
  goldPerMin: number;
  lastHits: number;
  maxKills: number;
  laneWins: number;
  laneDraws: number;
  laneLosses: number;
};

export class TournamentAggregator {
  private progress: AggregationProgress = {
    status: "idle",
    progress: 0,
    matchTotal: 0,
    matchDone: 0,
    heroIndex: {},
  };

  private playerLeagueHeroes = new Map<number, Map<number, PlayerHeroAcc>>();
  private running = false;

  getProgress(): AggregationProgress {
    return { ...this.progress, heroIndex: { ...this.progress.heroIndex } };
  }

  /** True while aggregateLeague() is actively executing (use for API guards). */
  isBusy(): boolean {
    return this.running;
  }

  getPlayerHeroStats(
    steam32: number,
    heroId: number,
  ): PlayerHeroLeagueStats | undefined {
    const ph = this.playerLeagueHeroes.get(steam32)?.get(heroId);
    if (!ph || ph.games === 0) return undefined;

    return this.accToPlayerHeroStats(ph);
  }

  /** Aggregate all hero rows for a player in the current league. */
  getPlayerLeagueStats(steam32: number): PlayerLeagueStats | undefined {
    const phMap = this.playerLeagueHeroes.get(steam32);
    if (!phMap || phMap.size === 0) return undefined;

    const acc: PlayerHeroAcc = {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      heroDamage: 0,
      goldPerMin: 0,
      lastHits: 0,
      maxKills: 0,
      laneWins: 0,
      laneDraws: 0,
      laneLosses: 0,
    };

    for (const ph of phMap.values()) {
      if (this.isLeaverLikePlayerHeroAcc(ph)) continue;
      acc.games += ph.games;
      acc.wins += ph.wins;
      acc.kills += ph.kills;
      acc.deaths += ph.deaths;
      acc.assists += ph.assists;
      acc.heroDamage += ph.heroDamage;
      acc.goldPerMin += ph.goldPerMin;
      acc.lastHits += ph.lastHits;
      acc.maxKills = Math.max(acc.maxKills, ph.maxKills);
      acc.laneWins += ph.laneWins;
      acc.laneDraws += ph.laneDraws;
      acc.laneLosses += ph.laneLosses;
    }

    if (acc.games === 0) return undefined;
    return this.accToPlayerHeroStats(acc);
  }

  private accToPlayerHeroStats(ph: PlayerHeroAcc): PlayerHeroLeagueStats {
    const games = ph.games;
    const kda =
      ph.deaths > 0
        ? (ph.kills + ph.assists) / ph.deaths
        : ph.kills + ph.assists;

    return {
      games,
      wins: ph.wins,
      winRate: ph.wins / games,
      avgKills: ph.kills / games,
      avgDeaths: ph.deaths / games,
      avgAssists: ph.assists / games,
      avgKda: kda,
      maxKills: ph.maxKills,
      avgHeroDamage: ph.heroDamage / games,
      avgGpm: ph.goldPerMin / games,
      avgLastHits: ph.lastHits / games,
      laneWins: ph.laneWins ?? 0,
      laneDraws: ph.laneDraws ?? 0,
      laneLosses: ph.laneLosses ?? 0,
    };
  }

  /** Restore in-memory player stats + hero index from CSV (no API calls). */
  hydrateFromSnapshot(
    heroIndex: Record<string, TournamentHeroAggregate>,
    playerHeroes: LeaguePlayerHeroRow[],
    matchTotal: number,
    matchDone: number,
  ): void {
    this.playerLeagueHeroes.clear();
    for (const row of playerHeroes) {
      let phMap = this.playerLeagueHeroes.get(row.steam32);
      if (!phMap) {
        phMap = new Map();
        this.playerLeagueHeroes.set(row.steam32, phMap);
      }
      phMap.set(row.heroId, {
        games: row.games,
        wins: row.wins,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        heroDamage: row.heroDamage,
        goldPerMin: row.goldPerMin,
        lastHits: row.lastHits,
        maxKills: row.maxKills,
        laneWins: row.laneWins,
        laneDraws: row.laneDraws,
        laneLosses: row.laneLosses,
      });
    }

    this.progress = {
      status: "ready",
      progress: 100,
      matchTotal,
      matchDone,
      heroIndex: { ...heroIndex },
    };
  }

  exportPlayerHeroRows(): LeaguePlayerHeroRow[] {
    const rows: LeaguePlayerHeroRow[] = [];
    for (const [steam32, phMap] of this.playerLeagueHeroes) {
      for (const [heroId, acc] of phMap) {
        rows.push({ steam32, heroId, ...acc });
      }
    }
    return rows;
  }

  async aggregateLeagues(
    leagueIds: number[],
    client: OpenDotaClient,
    maxMatches = 80,
    onProgress?: (progress: AggregationProgress) => void,
  ): Promise<Record<string, TournamentHeroAggregate>> {
    if (this.running) {
      throw new Error("Aggregation already running");
    }
    this.running = true;
    this.playerLeagueHeroes.clear();

    this.progress = {
      status: "running",
      progress: 0,
      matchTotal: 0,
      matchDone: 0,
      heroIndex: {},
    };

    try {
      await ensureHeroRegistry(client);
      
      const allMatchIds: number[] = [];
      let combinedWarning = "";
      for (const lid of leagueIds) {
        const resolved = await resolveLeagueMatchIds(lid, maxMatches);
        allMatchIds.push(...resolved.matchIds);
        if (resolved.warning) {
          combinedWarning += `[League ${lid}]: ${resolved.warning} `;
          logger.warn({ leagueId: lid, warning: resolved.warning }, "League match resolve");
        }
      }
      
      const matchIds = Array.from(new Set(allMatchIds));

      if (matchIds.length === 0) {
        throw new Error(
          combinedWarning ||
            `No matches found for leagues ${leagueIds.join(", ")}. Set STEAM_WEB_API_KEY in apps/broadcast-api/.env and/or LEAGUE_MATCH_IDS.`,
        );
      }

      this.progress.matchTotal = matchIds.length;

      const heroAcc = new Map<number, HeroAcc>();
      let ingested = 0;

      for (let i = 0; i < matchIds.length; i++) {
        const matchId = matchIds[i];
        if (matchId === undefined) continue;

        logger.info(
          { matchId, index: i + 1, total: matchIds.length },
          "Aggregating league match",
        );

        let detail = await client.matchDetails(matchId);
        if (!detail.ok || !detail.data?.players?.length) {
          await client.requestMatchParse(matchId);
          detail = await client.matchDetails(matchId);
        }
        if (detail.ok && detail.data) {
          if (
            detail.data.leagueid != null &&
            detail.data.leagueid !== 0 &&
            !leagueIds.includes(detail.data.leagueid)
          ) {
            logger.warn(
              {
                matchId,
                expectedLeagues: leagueIds,
                got: detail.data.leagueid,
              },
              "Match leagueId mismatch",
            );
          } else {
            this.ingestMatch(detail.data, heroAcc);
            ingested += 1;
          }
        }

        this.progress.matchDone = i + 1;
        this.progress.progress = Math.round(
          ((i + 1) / Math.max(1, matchIds.length)) * 100,
        );
        onProgress?.(this.getProgress());
      }

      if (ingested === 0) {
        throw new Error(
          `Found ${matchIds.length} match ID(s) but none had parseable data on OpenDota yet. Wait a few minutes after matches finish, then refresh.`,
        );
      }

      const index: Record<string, TournamentHeroAggregate> = {};
      for (const [heroId, acc] of heroAcc) {
        const games = acc.wins + acc.losses;
        const pickRate = ingested > 0 ? acc.picks / ingested : 0;
        const banRate = ingested > 0 ? acc.bans / ingested : 0;
        const contestRate = pickRate + banRate;
        const winRate = games > 0 ? acc.wins / games : undefined;

        index[String(heroId)] = {
          heroId,
          heroName: heroDisplayName(heroId),
          picks: acc.picks,
          bans: acc.bans,
          wins: acc.wins,
          losses: acc.losses,
          games,
          pickRate,
          banRate,
          winRate,
          contestRate,
        };
      }

      this.progress = {
        status: "ready",
        progress: 100,
        matchTotal: matchIds.length,
        matchDone: matchIds.length,
        heroIndex: index,
      };

      return index;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.progress = {
        ...this.progress,
        status: "error",
        error: msg,
      };
      throw err;
    } finally {
      this.running = false;
    }
  }

  private ingestMatch(
    match: OpenDotaMatch,
    heroAcc: Map<number, HeroAcc>,
  ): void {
    const radiantWin = match.radiant_win === true;
    const laneOutcomes = computeLaneOutcomesForMatch(match.players);

    for (const pb of this.resolvePickBans(match)) {
      const acc = this.getAcc(heroAcc, pb.hero_id);
      if (pb.is_pick) acc.picks += 1;
      else acc.bans += 1;
    }

    for (const p of match.players ?? []) {
      const steam32 = steam32FromMatchPlayer(p);
      if (steam32 === undefined || typeof p.hero_id !== "number") {
        continue;
      }
      const won =
        (p.player_slot !== undefined && p.player_slot < 128 && radiantWin) ||
        (p.player_slot !== undefined && p.player_slot >= 128 && !radiantWin);

      const acc = this.getAcc(heroAcc, p.hero_id);
      if (won) acc.wins += 1;
      else acc.losses += 1;

      if (!shouldCountPlayerLeagueGame(p)) continue;
      this.trackPlayerHero(steam32, p.hero_id, won, p, laneOutcomes.get(steam32));
    }
  }

  private isLeaverLikePlayerHeroAcc(ph: PlayerHeroAcc): boolean {
    return (
      ph.games === 1 &&
      ph.kills === 0 &&
      ph.deaths === 0 &&
      ph.assists === 0
    );
  }

  private trackPlayerHero(
    steam32: number,
    heroId: number,
    won: boolean,
    p: OpenDotaMatchPlayer,
    laneOutcome?: "win" | "draw" | "loss",
  ): void {
    let phMap = this.playerLeagueHeroes.get(steam32);
    if (!phMap) {
      phMap = new Map();
      this.playerLeagueHeroes.set(steam32, phMap);
    }

    const kills = typeof p.kills === "number" ? p.kills : 0;
    const deaths = typeof p.deaths === "number" ? p.deaths : 0;
    const assists = typeof p.assists === "number" ? p.assists : 0;
    const heroDamage = typeof p.hero_damage === "number" ? p.hero_damage : 0;
    const gpm = typeof p.gold_per_min === "number" ? p.gold_per_min : 0;
    const lastHits = typeof p.last_hits === "number" ? p.last_hits : 0;

    const cur = phMap.get(heroId) ?? {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      heroDamage: 0,
      goldPerMin: 0,
      lastHits: 0,
      maxKills: 0,
      laneWins: 0,
      laneDraws: 0,
      laneLosses: 0,
    };

    cur.games += 1;
    if (won) cur.wins += 1;
    if (laneOutcome === "win") cur.laneWins += 1;
    else if (laneOutcome === "draw") cur.laneDraws += 1;
    else if (laneOutcome === "loss") cur.laneLosses += 1;
    cur.kills += kills;
    cur.deaths += deaths;
    cur.assists += assists;
    cur.heroDamage += heroDamage;
    cur.goldPerMin += gpm;
    cur.lastHits += lastHits;
    if (kills > cur.maxKills) cur.maxKills = kills;

    phMap.set(heroId, cur);
  }

  /** OpenDota uses `picks_bans`; fall back to player hero slots when draft data is missing. */
  private resolvePickBans(match: OpenDotaMatch): OpenDotaPickBan[] {
    const fromApi = getMatchPickBans(match);
    if (fromApi.length > 0) return fromApi;

    const derived: OpenDotaPickBan[] = [];
    for (const p of match.players ?? []) {
      if (typeof p.hero_id !== "number") continue;
      derived.push({
        is_pick: true,
        hero_id: p.hero_id,
        team: p.player_slot !== undefined && p.player_slot >= 128 ? 1 : 0,
        order: 0,
      });
    }
    return derived;
  }

  private getAcc(map: Map<number, HeroAcc>, heroId: number): HeroAcc {
    let acc = map.get(heroId);
    if (!acc) {
      acc = { picks: 0, bans: 0, wins: 0, losses: 0 };
      map.set(heroId, acc);
    }
    return acc;
  }
}

export const tournamentAggregator = new TournamentAggregator();

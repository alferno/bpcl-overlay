import type {
  HeroStatsCard,
  MatchupCard,
  PlayerHeroLeagueStats,
  RosterPlayer,
  StatCarouselState,
  StatSlide,
  TournamentHeroAggregate,
} from "@bpc/shared-types";
import type { OpenDotaClient } from "../opendota-client.js";
import {
  ensureHeroRegistry,
  findRosterPlayer,
  heroDisplayName,
  heroPortraitFieldsForHero,
  heroPortraitUrl,
  listHeroesSorted,
  teamLogoUrlForKey,
  type HeroMeta,
} from "./hero-registry.js";
import {
  aggregatePlayerLeagueFromIndex,
  leaguePlayerHeroFromIndex,
} from "@bpc/shared-types";
import { formatLaneRecord } from "./lane-outcome.js";
import { fetchSteamAvatarUrl } from "./steam-profile.js";

function pct(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmt1(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

function fmtDamage(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function wlRecord(wins: number, losses: number): string {
  return `${wins}W / ${losses}L`;
}

function laneStatSlide(
  ph: Pick<
    PlayerHeroLeagueStats,
    "laneWins" | "laneDraws" | "laneLosses"
  >,
): StatSlide | null {
  const lw = ph.laneWins ?? 0;
  const ld = ph.laneDraws ?? 0;
  const ll = ph.laneLosses ?? 0;
  if (lw + ld + ll === 0) return null;
  return {
    label: "Lane",
    value: formatLaneRecord(lw, ld, ll),
    sublabel: "win · draw · loss (EFF@10)",
  };
}

async function resolvePlayerAvatarUrl(
  client: OpenDotaClient,
  steam32: number,
  roster?: RosterPlayer[],
): Promise<string | undefined> {
  const fromRoster = roster?.find((p) => p.steam32 === steam32)?.avatarUrl;
  if (fromRoster?.trim()) return fromRoster;
  return fetchSteamAvatarUrl(client, steam32);
}

function tournamentSlides(agg: TournamentHeroAggregate): StatSlide[] {
  const unplayed = agg.games === 0 && agg.picks === 0;

  return [
    {
      label: "Tournament Record",
      value: unplayed ? "Not played" : wlRecord(agg.wins, agg.losses),
      sublabel: unplayed
        ? agg.bans > 0
          ? "Banned in league · never picked"
          : "Not picked or banned this tournament"
        : `${pct(agg.winRate)} win rate · ${agg.games} games`,
    },
    {
      label: "Picks",
      value: String(agg.picks),
      sublabel:
        agg.picks > 0
          ? `${pct(agg.pickRate)} of drafts`
          : "Not picked in league",
    },
    {
      label: "Bans",
      value: String(agg.bans),
      sublabel:
        agg.bans > 0
          ? `${pct(agg.banRate)} of drafts`
          : "Not banned in league",
    },
    {
      label: "Win Rate",
      value: agg.games > 0 ? pct(agg.winRate) : "—",
      sublabel:
        agg.games > 0 ? "when picked in league" : "No league games on this hero",
    },
  ];
}

function playerHeroSlides(
  displayName: string,
  heroName: string,
  ph: PlayerHeroLeagueStats | undefined,
  agg: TournamentHeroAggregate | undefined,
): StatSlide[] {
  if (!ph || ph.games === 0) {
    return [
      {
        label: `${displayName} on ${heroName}`,
        value: "No league games",
        sublabel: "This player hasn't played this hero in the league yet",
      },
      ...(agg
        ? [
            {
              label: "Hero pick rate",
              value: String(agg.picks),
              sublabel: `${pct(agg.pickRate)} of drafts`,
            },
            {
              label: "Hero win rate",
              value: pct(agg.winRate),
              sublabel: wlRecord(agg.wins, agg.losses),
            },
          ]
        : []),
    ];
  }

  const losses = ph.games - ph.wins;
  const kdaLine = `${fmt1(ph.avgKills)} / ${fmt1(ph.avgDeaths)} / ${fmt1(ph.avgAssists)}`;

  return [
    {
      label: `${displayName} — record`,
      value: wlRecord(ph.wins, losses),
      sublabel: `${pct(ph.winRate)} · ${ph.games} league game${ph.games === 1 ? "" : "s"}`,
    },
    {
      label: "Peak kills",
      value: String(ph.maxKills),
      sublabel: "best single game in league",
    },
    {
      label: "Avg KDA",
      value: fmt1(ph.avgKda),
      sublabel: `${kdaLine} per game`,
    },
    {
      label: "Hero damage",
      value: fmtDamage(ph.avgHeroDamage),
      sublabel: "avg per game",
    },
    ...(laneStatSlide(ph) ? [laneStatSlide(ph)!] : []),
    {
      label: "Farm pace",
      value: `${Math.round(ph.avgGpm)} GPM`,
      sublabel: `${Math.round(ph.avgLastHits)} avg last hits`,
    },
    ...(agg
      ? [
          {
            label: "Hero in league",
            value: String(agg.picks),
            sublabel: `${pct(agg.pickRate)} pick · ${pct(agg.winRate)} WR`,
          },
        ]
      : []),
  ];
}

function playerLeagueSlides(
  displayName: string,
  pl: PlayerHeroLeagueStats | undefined,
): StatSlide[] {
  if (!pl || pl.games === 0) {
    return [
      {
        label: displayName,
        value: "No league games",
        sublabel: "This player has no recorded games in the league yet",
      },
    ];
  }

  const losses = pl.games - pl.wins;
  const kdaLine = `${fmt1(pl.avgKills)} / ${fmt1(pl.avgDeaths)} / ${fmt1(pl.avgAssists)}`;

  return [
    {
      label: `${displayName} — record`,
      value: wlRecord(pl.wins, losses),
      sublabel: `${pct(pl.winRate)} · ${pl.games} league game${pl.games === 1 ? "" : "s"}`,
    },
    {
      label: "Peak kills",
      value: String(pl.maxKills),
      sublabel: "best single game in league",
    },
    {
      label: "Avg KDA",
      value: fmt1(pl.avgKda),
      sublabel: `${kdaLine} per game`,
    },
    {
      label: "Hero damage",
      value: fmtDamage(pl.avgHeroDamage),
      sublabel: "avg per game",
    },
    ...(laneStatSlide(pl) ? [laneStatSlide(pl)!] : []),
    {
      label: "Farm pace",
      value: `${Math.round(pl.avgGpm)} GPM`,
      sublabel: `${Math.round(pl.avgLastHits)} avg last hits`,
    },
  ];
}

function toPlayerHeroPayload(ph: PlayerHeroLeagueStats | undefined) {
  if (!ph || ph.games === 0) {
    return { games: 0, wins: 0, losses: 0 };
  }
  return {
    games: ph.games,
    wins: ph.wins,
    losses: ph.games - ph.wins,
    winRate: ph.winRate,
    avgKills: ph.avgKills,
    avgDeaths: ph.avgDeaths,
    avgAssists: ph.avgAssists,
    avgKda: ph.avgKda,
    maxKills: ph.maxKills,
    avgHeroDamage: ph.avgHeroDamage,
    avgGpm: ph.avgGpm,
    avgLastHits: ph.avgLastHits,
    laneWins: ph.laneWins,
    laneDraws: ph.laneDraws,
    laneLosses: ph.laneLosses,
  };
}

export async function buildTournamentHeroCard(
  client: OpenDotaClient,
  heroId: number,
  heroIndex: Record<string, TournamentHeroAggregate>,
): Promise<HeroStatsCard> {
  await ensureHeroRegistry(client);
  const agg =
    heroIndex[String(heroId)] ??
    ({
      heroId,
      picks: 0,
      bans: 0,
      wins: 0,
      losses: 0,
      games: 0,
    } as TournamentHeroAggregate);

  const name = agg.heroName ?? heroDisplayName(heroId);
  const portrait = heroPortraitFieldsForHero(heroId, name);

  return {
    statsCardKind: "tournament-hero",
    playerLabel: name,
    heroId,
    heroName: name,
    ...portrait,
    tournament: {
      pickRate: agg.pickRate,
      winRate: agg.winRate,
      contestRate: agg.contestRate,
      banRate: agg.banRate,
      picks: agg.picks,
      bans: agg.bans,
      wins: agg.wins,
      losses: agg.losses,
      games: agg.games,
    },
    statSlides: tournamentSlides(agg),
    fetchedAt: new Date().toISOString(),
    source: "league",
  };
}

export async function buildPlayerHeroCard(
  client: OpenDotaClient,
  steam32: number,
  heroId: number,
  displayName: string,
  heroIndex: Record<string, TournamentHeroAggregate>,
  roster?: RosterPlayer[],
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>,
): Promise<HeroStatsCard> {
  await ensureHeroRegistry(client);

  const leaguePh = leaguePlayerHeroFromIndex(
    playerHeroIndex,
    steam32,
    heroId,
  );
  const agg = heroIndex[String(heroId)];
  const heroName = heroDisplayName(heroId);
  const portrait = heroPortraitFieldsForHero(heroId, heroName);
  const playerAvatarUrl = await resolvePlayerAvatarUrl(
    client,
    steam32,
    roster,
  );

  return {
    statsCardKind: "player-hero",
    playerLabel: displayName,
    heroId,
    heroName,
    ...portrait,
    playerAvatarUrl,
    tournament: agg
      ? {
          pickRate: agg.pickRate,
          winRate: agg.winRate,
          contestRate: agg.contestRate,
          banRate: agg.banRate,
          picks: agg.picks,
          bans: agg.bans,
          wins: agg.wins,
          losses: agg.losses,
          games: agg.games,
        }
      : undefined,
    playerHero: toPlayerHeroPayload(leaguePh),
    statSlides: playerHeroSlides(displayName, heroName, leaguePh, agg),
    fetchedAt: new Date().toISOString(),
    source: "league",
  };
}

function playerLeagueStatsFromIndex(
  steam32: number,
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>,
): PlayerHeroLeagueStats | undefined {
  return aggregatePlayerLeagueFromIndex(playerHeroIndex, steam32);
}

export async function buildPlayerLeagueCard(
  client: OpenDotaClient,
  steam32: number,
  displayName: string,
  playerHeroIndex?: Record<string, PlayerHeroLeagueStats>,
  roster?: RosterPlayer[],
): Promise<HeroStatsCard> {
  await ensureHeroRegistry(client);
  const leaguePl = playerLeagueStatsFromIndex(steam32, playerHeroIndex);
  const playerAvatarUrl = await resolvePlayerAvatarUrl(
    client,
    steam32,
    roster,
  );
  const rosterPlayer = findRosterPlayer(roster ?? [], steam32);

  return {
    statsCardKind: "player-league",
    playerLabel: displayName,
    heroId: 0,
    heroName: "League aggregate",
    playerAvatarUrl,
    teamLogoUrl: teamLogoUrlForKey(rosterPlayer?.teamKey),
    teamColor: rosterPlayer?.teamColor,
    playerHero: toPlayerHeroPayload(leaguePl),
    statSlides: playerLeagueSlides(displayName, leaguePl),
    fetchedAt: new Date().toISOString(),
    source: "league",
  };
}

export async function buildMatchupCard(
  client: OpenDotaClient,
  heroAId: number,
  heroBId: number,
): Promise<MatchupCard> {
  await ensureHeroRegistry(client);
  const data = await client.matchupBetween(heroAId, heroBId);
  const row: Record<string, unknown> =
    data.ok && data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : {};

  const gamesPlayed =
    typeof row.games_played === "number" ? row.games_played : undefined;
  const wins =
    typeof row.wins === "number"
      ? row.wins
      : typeof (row as { win?: number }).win === "number"
        ? (row as { win: number }).win
        : undefined;

  const statLines = [
    {
      label: "Games sampled",
      value: gamesPlayed !== undefined ? String(gamesPlayed) : "—",
    },
    {
      label: "Hero A wins",
      value: wins !== undefined ? String(wins) : "—",
    },
  ];

  const portraitA = heroPortraitFieldsForHero(heroAId);
  const portraitB = heroPortraitFieldsForHero(heroBId);

  return {
    heroAId,
    heroBId,
    heroAName: heroDisplayName(heroAId),
    heroBName: heroDisplayName(heroBId),
    heroAPortraitSlug: portraitA.heroPortraitSlug,
    heroBPortraitSlug: portraitB.heroPortraitSlug,
    heroAPortraitUrl: portraitA.heroPortraitUrl,
    heroBPortraitUrl: portraitB.heroPortraitUrl,
    matchup: row,
    statLines,
    fetchedAt: new Date().toISOString(),
    source: data.ok ? "opendota_cached" : "stale",
  };
}

export function buildCarouselFromHeroCard(
  card: HeroStatsCard,
  slideDurationMs = 4000,
): StatCarouselState {
  const slides =
    card.statSlides && card.statSlides.length > 0
      ? card.statSlides
      : [
          {
            label: "Win Rate",
            value: pct(card.tournament?.winRate),
            sublabel: card.tournament
              ? wlRecord(card.tournament.wins ?? 0, card.tournament.losses ?? 0)
              : undefined,
          },
          {
            label: "Picks",
            value: String(card.tournament?.picks ?? "—"),
            sublabel: pct(card.tournament?.pickRate),
          },
        ];

  return {
    heroId: card.heroId,
    heroName: card.heroName,
    heroPortraitSlug: card.heroPortraitSlug,
    heroPortraitUrl: card.heroPortraitUrl,
    playerLabel: card.playerLabel,
    slides,
    activeIndex: 0,
    slideDurationMs,
    startedAt: Date.now(),
  };
}

export async function listHeroesForAdmin(
  client: OpenDotaClient,
): Promise<HeroMeta[]> {
  await ensureHeroRegistry(client);
  return listHeroesSorted();
}

export {
  findRosterPlayer,
  heroDisplayName,
  heroPortraitFieldsForHero,
  heroPortraitUrl,
};

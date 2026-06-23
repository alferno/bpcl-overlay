import type {
  PlayerHeroLeagueStats,
  StatSlide,
  TournamentHeroAggregate,
} from "@bpc/shared-types";

import { formatPct, formatPctRounded } from "./stats-format";

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

function laneRecord(ph: PlayerHeroLeagueStats): string | null {
  const lw = ph.laneWins ?? 0;
  const ld = ph.laneDraws ?? 0;
  const ll = ph.laneLosses ?? 0;
  if (lw + ld + ll === 0) return null;
  return `${lw}W · ${ld}D · ${ll}L`;
}

/** Compact player×hero slides for draft pick stats panel (max 4 tiles). */
export function buildDraftPlayerHeroSlides(
  playerName: string,
  heroName: string,
  ph: PlayerHeroLeagueStats | undefined,
  tournament?: TournamentHeroAggregate,
  playerLeagueGames?: number,
): StatSlide[] {
  if (!ph || ph.games === 0) {
    const slides: StatSlide[] = [
      {
        label: `${playerName} on ${heroName}`,
        value: "No league games",
        sublabel: "No recorded games on this hero in the league",
      },
    ];
    if (tournament?.pickRate != null) {
      slides.push({
        label: "Hero pick rate",
        value: formatPctRounded(tournament.pickRate),
      });
    }
    if (tournament?.winRate != null) {
      slides.push({
        label: "Hero win rate",
        value: formatPctRounded(tournament.winRate),
      });
    }
    return slides.slice(0, 4);
  }

  const losses = ph.games - ph.wins;
  const kdaLine = `${fmt1(ph.avgKills)} / ${fmt1(ph.avgDeaths)} / ${fmt1(ph.avgAssists)}`;
  const gameLabel =
    playerLeagueGames != null && playerLeagueGames > ph.games
      ? `${ph.games} on ${heroName} · ${playerLeagueGames} league`
      : `${ph.games} league game${ph.games === 1 ? "" : "s"}`;

  return [
    {
      label: "League record",
      value: wlRecord(ph.wins, losses),
      sublabel: `${formatPct(ph.winRate)} · ${gameLabel}`,
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
    ...(laneRecord(ph)
      ? [
          {
            label: "Lane",
            value: laneRecord(ph)!,
            sublabel: "win · draw · loss",
          },
        ]
      : []),
    {
      label: "Farm pace",
      value: `${Math.round(ph.avgGpm)} GPM`,
      sublabel: `${Math.round(ph.avgLastHits)} avg last hits`,
    },
  ];
}

export function buildDraftTournamentHeroSlides(
  stats?: TournamentHeroAggregate,
): StatSlide[] {
  const slides: StatSlide[] = [];
  if (stats?.winRate != null) {
    slides.push({
      label: "Tournament WR",
      value: formatPctRounded(stats.winRate),
    });
  }
  if (stats?.pickRate != null) {
    slides.push({ label: "Pick Rate", value: formatPctRounded(stats.pickRate) });
  }
  if (stats?.contestRate != null) {
    slides.push({
      label: "Contested",
      value: formatPctRounded(stats.contestRate),
    });
  }
  if (stats && stats.games > 0) {
    slides.push({ label: "Games", value: String(stats.games) });
  }
  return slides.slice(0, 4);
}

/** Ban-specific slides: times banned, picked, contested, win rate when picked */
export function buildDraftBanHeroSlides(
  stats?: TournamentHeroAggregate,
): StatSlide[] {
  const slides: StatSlide[] = [];
  if (stats?.bans != null && stats.bans > 0) {
    slides.push({
      label: "Times Banned",
      value: String(stats.bans),
      sublabel: stats.banRate != null ? `${formatPctRounded(stats.banRate)} ban rate` : undefined,
    });
  }
  if (stats?.picks != null) {
    slides.push({
      label: "Times Picked",
      value: String(stats.picks),
      sublabel: stats.pickRate != null ? `${formatPctRounded(stats.pickRate)} pick rate` : undefined,
    });
  }
  if (stats?.contestRate != null) {
    slides.push({
      label: "Contested",
      value: formatPctRounded(stats.contestRate),
      sublabel: `${(stats.picks ?? 0) + (stats.bans ?? 0)} total contests`,
    });
  }
  if (stats?.winRate != null && (stats.games ?? 0) > 0) {
    slides.push({
      label: "Win Rate",
      value: formatPctRounded(stats.winRate),
      sublabel: `${stats.games} game${stats.games === 1 ? "" : "s"} played`,
    });
  }
  return slides.slice(0, 4);
}

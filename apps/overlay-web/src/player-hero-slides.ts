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

/** Compact player×hero slides for draft pick stats panel (max 4 tiles). */
export function buildDraftPlayerHeroSlides(
  playerName: string,
  heroName: string,
  ph: PlayerHeroLeagueStats | undefined,
  tournament?: TournamentHeroAggregate,
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

  return [
    {
      label: "League record",
      value: wlRecord(ph.wins, losses),
      sublabel: `${formatPct(ph.winRate)} · ${ph.games} game${ph.games === 1 ? "" : "s"}`,
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

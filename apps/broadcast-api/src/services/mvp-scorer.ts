/**
 * mvp-scorer.ts
 * ─────────────
 * Pure, side-effect-free MVP scoring engine for BPCL Standout Player overlay.
 *
 * Scoring model
 * ─────────────
 * Each player receives a composite score built from five categories:
 *
 *   1. Combat     – KDA ratio, kill participation
 *   2. Economy    – GPM, XPM, net-worth share of team
 *   3. Impact     – Hero damage per minute, hero healing per minute
 *   4. Laning     – Last hits, denies, lane efficiency
 *   5. Reliability – Penalises leavers / low game time
 *
 * All raw values are normalised to [0, 1] relative to the 10-player lobby
 * before weighting, so no single sky-high number can dominate.
 *
 * Weights are exposed as MvpWeights and can be overridden per call.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawMatchPlayer {
  account_id?: number;
  personaname?: string;      // In-game steam name
  hero_id?: number;
  hero_name?: string;        // optional – supplied by server enrichment
  player_slot?: number;      // 0-4 radiant, 128-132 dire
  leaver_status?: number;    // 0 = stayed; >0 = abandoned
  win?: number;              // 1 = won
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
  lane_efficiency?: number;  // 0-1 from OpenDota
  duration?: number;         // seconds – injected from match root
  // items at end of game
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  item_neutral?: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  aghanims_scepter?: number; // 1 if purchased
  aghanims_shard?: number;   // 1 if purchased
  // ability upgrades (optional, used to count ability points)
  ability_upgrades_arr?: number[];
}

export interface RawMatch {
  match_id: number;
  duration?: number;          // seconds
  radiant_win?: boolean;
  players?: RawMatchPlayer[];
}

export interface MvpWeights {
  /** KDA ratio (kills+assists)/(deaths+1) */
  kda: number;
  /** Kill participation share of own team kills */
  killParticipation: number;
  /** Gold per minute, normalised across all 10 players */
  gpm: number;
  /** XP per minute */
  xpm: number;
  /** Net-worth share of own team */
  networthShare: number;
  /** Hero damage per minute */
  damagePm: number;
  /** Hero healing per minute */
  healingPm: number;
  /** Last hits */
  lastHits: number;
  /** Denies */
  denies: number;
  /** Lane efficiency (OpenDota 0-1) */
  laneEfficiency: number;
  /** Win bonus (flat boost to the winning team) */
  winBonus: number;
}

export const DEFAULT_MVP_WEIGHTS: MvpWeights = {
  kda: 2.5,
  killParticipation: 2.0,
  gpm: 1.8,
  xpm: 1.2,
  networthShare: 1.5,
  damagePm: 1.6,
  healingPm: 0.6,
  lastHits: 1.0,
  denies: 0.4,
  laneEfficiency: 0.8,
  winBonus: 1.0,
};

export interface MvpScoreBreakdown {
  kda: number;
  killParticipation: number;
  gpm: number;
  xpm: number;
  networthShare: number;
  damagePm: number;
  healingPm: number;
  lastHits: number;
  denies: number;
  laneEfficiency: number;
  winBonus: number;
}

export interface MvpCandidate {
  rank?: number;
  accountId: number | undefined;
  personaname: string | undefined;
  heroId: number | undefined;
  heroName: string | undefined;
  playerSlot: number;
  side: "radiant" | "dire";
  won: boolean;
  /** Final composite MVP score (higher = better) */
  mvpScore: number;
  /** Per-category normalised contributions (each 0-1 × weight) */
  breakdown: MvpScoreBreakdown;
  /** Raw stat snapshot for overlay card construction */
  raw: {
    kills: number;
    deaths: number;
    assists: number;
    heroDamage: number;
    gpm: number;
    xpm: number;
    networth: number;
    lastHits: number;
    teamKills: number;
    items: number[];        // [i0,i1,i2,i3,i4,i5, neutral, bp0,bp1,bp2]
    hasScepter: boolean;
    hasShard: boolean;
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Normalise an array of values to [0,1] using min-max scaling. */
function minMaxNorm(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

/** Safe division — returns 0 when denominator is 0. */
function safe(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

// ─── Core scorer ─────────────────────────────────────────────────────────────

export function scoreMvp(
  match: RawMatch,
  weights: MvpWeights = DEFAULT_MVP_WEIGHTS,
): MvpCandidate[] {
  const players = match.players ?? [];
  if (players.length === 0) return [];

  const durationMin = Math.max(1, (match.duration ?? 1800) / 60);

  // Separate into sides
  const radiantSlots = new Set([0, 1, 2, 3, 4]);
  const isRadiant = (p: RawMatchPlayer) =>
    (p.player_slot ?? 0) < 128;

  const radiantPlayers = players.filter(isRadiant);
  const direPlayers    = players.filter((p) => !isRadiant(p));

  const radiantKills = radiantPlayers.reduce((s, p) => s + (p.kills ?? 0), 0);
  const direKills    = direPlayers.reduce(  (s, p) => s + (p.kills ?? 0), 0);

  const radiantNetworth = radiantPlayers.reduce((s, p) => s + (p.net_worth ?? 0), 0);
  const direNetworth    = direPlayers.reduce(  (s, p) => s + (p.net_worth ?? 0), 0);

  // ── Raw vectors ────────────────────────────────────────────────────────────
  const raw = players.map((p) => {
    const side: "radiant" | "dire" = isRadiant(p) ? "radiant" : "dire";
    const teamKills = side === "radiant" ? radiantKills : direKills;
    const teamNetworth = side === "radiant" ? radiantNetworth : direNetworth;

    const k = p.kills ?? 0;
    const d = p.deaths ?? 0;
    const a = p.assists ?? 0;

    return {
      kda:              safe(k + a, d + 1),
      killParticipation:safe(k + a, Math.max(1, teamKills)),
      gpm:              p.gold_per_min ?? 0,
      xpm:              p.xp_per_min ?? 0,
      networthShare:    safe(p.net_worth ?? 0, Math.max(1, teamNetworth)),
      damagePm:         safe(p.hero_damage ?? 0, durationMin),
      healingPm:        safe(p.hero_healing ?? 0, durationMin),
      lastHits:         p.last_hits ?? 0,
      denies:           p.denies ?? 0,
      laneEfficiency:   p.lane_efficiency ?? 0,
      winBonus:         (match.radiant_win ? side === "radiant" : side === "dire") ? 1 : 0,
      leaver:           (p.leaver_status ?? 0) > 0,
    };
  });

  // ── Normalise each metric across all 10 players ────────────────────────────
  const keys = [
    "kda", "killParticipation", "gpm", "xpm", "networthShare",
    "damagePm", "healingPm", "lastHits", "denies", "laneEfficiency",
  ] as const;

  const normed: Record<string, number[]> = {};
  for (const key of keys) {
    normed[key] = minMaxNorm(raw.map((r) => r[key]));
  }
  // winBonus is already 0/1, no normalisation needed
  normed["winBonus"] = raw.map((r) => r.winBonus);

  // ── Build candidates ───────────────────────────────────────────────────────
  return players.map((p, i) => {
    const r = raw[i];
    if (r.leaver) {
      // Leavers always score zero
      return buildCandidate(p, match, 0, zeroBreakdown(), durationMin);
    }

    const b: MvpScoreBreakdown = {
      kda:              normed["kda"][i] * weights.kda,
      killParticipation:normed["killParticipation"][i] * weights.killParticipation,
      gpm:              normed["gpm"][i] * weights.gpm,
      xpm:              normed["xpm"][i] * weights.xpm,
      networthShare:    normed["networthShare"][i] * weights.networthShare,
      damagePm:         normed["damagePm"][i] * weights.damagePm,
      healingPm:        normed["healingPm"][i] * weights.healingPm,
      lastHits:         normed["lastHits"][i] * weights.lastHits,
      denies:           normed["denies"][i] * weights.denies,
      laneEfficiency:   normed["laneEfficiency"][i] * weights.laneEfficiency,
      winBonus:         normed["winBonus"][i] * weights.winBonus,
    };

    const total = Object.values(b).reduce((s, v) => s + v, 0);
    return buildCandidate(p, match, total, b, durationMin);
  });
}

function zeroBreakdown(): MvpScoreBreakdown {
  return {
    kda: 0, killParticipation: 0, gpm: 0, xpm: 0, networthShare: 0,
    damagePm: 0, healingPm: 0, lastHits: 0, denies: 0,
    laneEfficiency: 0, winBonus: 0,
  };
}

function buildCandidate(
  p: RawMatchPlayer,
  match: RawMatch,
  mvpScore: number,
  breakdown: MvpScoreBreakdown,
  _durationMin: number,
): MvpCandidate {
  const side: "radiant" | "dire" = (p.player_slot ?? 0) < 128 ? "radiant" : "dire";
  const radiantPlayers = (match.players ?? []).filter((x) => (x.player_slot ?? 0) < 128);
  const direPlayers    = (match.players ?? []).filter((x) => (x.player_slot ?? 0) >= 128);
  const teamKills =
    side === "radiant"
      ? radiantPlayers.reduce((s, x) => s + (x.kills ?? 0), 0)
      : direPlayers.reduce(  (s, x) => s + (x.kills ?? 0), 0);

  return {
    accountId:  p.account_id,
    personaname:p.personaname,
    heroId:     p.hero_id,
    heroName:   p.hero_name,
    playerSlot: p.player_slot ?? 0,
    side,
    won:        match.radiant_win ? side === "radiant" : side === "dire",
    mvpScore,
    breakdown,
    raw: {
      kills:       p.kills ?? 0,
      deaths:      p.deaths ?? 0,
      assists:     p.assists ?? 0,
      heroDamage:  p.hero_damage ?? 0,
      gpm:         p.gold_per_min ?? 0,
      xpm:         p.xp_per_min ?? 0,
      networth:    p.net_worth ?? 0,
      lastHits:    p.last_hits ?? 0,
      teamKills,
      items: [
        p.item_0 ?? 0,
        p.item_1 ?? 0,
        p.item_2 ?? 0,
        p.item_3 ?? 0,
        p.item_4 ?? 0,
        p.item_5 ?? 0,
        p.item_neutral ?? 0,
        p.backpack_0 ?? 0,
        p.backpack_1 ?? 0,
        p.backpack_2 ?? 0,
      ],
      hasScepter: (p.aghanims_scepter ?? 0) === 1 || [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5, p.item_neutral, p.backpack_0, p.backpack_1, p.backpack_2].some(i => [108, 271, 127, 256].includes(i ?? 0)),
      hasShard:   (p.aghanims_shard ?? 0) === 1 || [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5, p.item_neutral, p.backpack_0, p.backpack_1, p.backpack_2].some(i => [609, 125].includes(i ?? 0)),
    },
  };
}

/** Return candidates sorted best → worst, with rank attached (1-indexed). */
export function rankMvpCandidates(
  match: RawMatch,
  weights?: MvpWeights,
): (MvpCandidate & { rank: number })[] {
  const scored = scoreMvp(match, weights);
  const sorted = [...scored].sort((a, b) => b.mvpScore - a.mvpScore);
  return sorted.map((c, i) => ({ ...c, rank: i + 1 }));
}

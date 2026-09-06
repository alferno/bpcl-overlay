/**
 * ability-accuracy.ts — Live ability accuracy tracking
 *
 * Tracks per-ability attempt/hit counts from the Dota 2 combat log file.
 * Hit = the ability connected on an ENEMY HERO (target_name starts with npc_dota_hero_).
 * Attempts = every cast of the tracked ability by the tracked hero.
 *
 * To add a new ability: append one entry to TRACKED_ABILITIES. Nothing else changes.
 */

import { logger } from "../logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

export type AbilityAccuracyConfig = {
  /** Internal Dota ability name (from dota2-abilities / hero_abilities.json) */
  abilityName: string;
  /** Internal hero unit name (e.g. npc_dota_hero_pudge) */
  heroName: string;
  /** Friendly display name shown on overlay */
  displayName: string;
  /** Optional ability icon URL override — falls back to Dota CDN icon by abilityName */
  iconUrl?: string;
};

/**
 * Extensible list of tracked skillshot/targeted abilities.
 * Add a new entry here to start tracking a new ability — no other changes needed.
 */
export const TRACKED_ABILITIES: AbilityAccuracyConfig[] = [
  {
    abilityName: "pudge_meat_hook",
    heroName: "npc_dota_hero_pudge",
    displayName: "Hook",
  },
  {
    abilityName: "rattletrap_hookshot",
    heroName: "npc_dota_hero_rattletrap",
    displayName: "Hookshot",
  },
  {
    abilityName: "mirana_arrow",
    heroName: "npc_dota_hero_mirana",
    displayName: "Arrow",
  },
  {
    abilityName: "invoker_sun_strike",
    heroName: "npc_dota_hero_invoker",
    displayName: "Sunstrike",
  },
  {
    // Hoodwink's Sharpshooter is a charge-and-release ability.
    // We track the _release event — that is when the arrow actually launches
    // and can connect with a hero.
    abilityName: "hoodwink_sharpshooter_release",
    heroName: "npc_dota_hero_hoodwink",
    displayName: "Sharpshooter",
  },
  {
    abilityName: "muerta_dead_shot",
    heroName: "npc_dota_hero_muerta",
    displayName: "Dead Shot",
  },
];

// Build fast lookup maps
const abilityToConfig = new Map<string, AbilityAccuracyConfig>();
const heroToAbilities = new Map<string, string[]>();
for (const cfg of TRACKED_ABILITIES) {
  abilityToConfig.set(cfg.abilityName, cfg);
  const existing = heroToAbilities.get(cfg.heroName) ?? [];
  existing.push(cfg.abilityName);
  heroToAbilities.set(cfg.heroName, existing);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AbilityAccuracyEntry = {
  abilityName: string;
  displayName: string;
  heroName: string;
  attempts: number;
  hits: number;
  /** Percentage string, e.g. "60%". Empty string if no attempts yet. */
  accuracyPct: string;
};

export type AbilityAccuracySnapshot = {
  /** Only entries for abilities where the hero is currently in-game */
  entries: AbilityAccuracyEntry[];
  /** All entries regardless of current heroes in-game */
  allEntries: AbilityAccuracyEntry[];
  /** Game time (clock_time from GSI) when last updated, or null */
  updatedAt: number | null;
};

// ── Tracker ───────────────────────────────────────────────────────────────────

/**
 * Combatlog line format (type 5 = DOTA_COMBATLOG_ABILITY):
 * type: 5 attacker_name: npc_dota_hero_pudge ability_name: pudge_meat_hook target_name: npc_dota_hero_lion ...
 *
 * A "hit" is when target_name starts with npc_dota_hero_ (enemy hero connection only).
 */
export class AbilityAccuracyTracker {
  // abilityName → { attempts, hits }
  private counters = new Map<string, { attempts: number; hits: number }>();
  // heroName → steam32 (populated from GSI to filter per-player)
  private activeHeroes = new Set<string>();
  private updatedAt: number | null = null;

  constructor() {
    this.reset();
  }

  /** Call on every new match start to clear all counters. */
  reset(): void {
    this.counters.clear();
    this.activeHeroes.clear();
    this.updatedAt = null;
    for (const cfg of TRACKED_ABILITIES) {
      this.counters.set(cfg.abilityName, { attempts: 0, hits: 0 });
    }
    logger.info("[AbilityAccuracy] Counters reset for new match");
  }

  /**
   * Update the set of hero unit names currently in the game from GSI.
   * Used to filter which entries are "active" vs "not in this game".
   */
  setActiveHeroes(heroNames: string[]): void {
    this.activeHeroes = new Set(heroNames);
  }

  /**
   * Process one line from the Dota 2 combat log file.
   * Returns true if a counter changed (caller should emit update).
   */
  processLine(line: string): boolean {
    // Only care about ability cast events (type 5)
    if (!line.includes("type: 5") && !line.startsWith("5 ")) return false;

    const attackerMatch = line.match(/attacker_name:\s*(\S+)/);
    const abilityMatch = line.match(/ability_name:\s*(\S+)/);
    const targetMatch = line.match(/target_name:\s*(\S+)/);

    if (!attackerMatch || !abilityMatch) return false;

    const attackerName = attackerMatch[1];
    const abilityName = abilityMatch[1];
    const targetName = targetMatch?.[1] ?? "";

    // Only process abilities we're tracking
    const cfg = abilityToConfig.get(abilityName);
    if (!cfg) return false;

    // Attacker must be the expected hero
    if (attackerName !== cfg.heroName) return false;

    const counter = this.counters.get(abilityName);
    if (!counter) return false;

    counter.attempts++;

    // Hit = landed on an enemy hero (hero unit names start with npc_dota_hero_)
    const isHeroHit = targetName.startsWith("npc_dota_hero_") && targetName !== cfg.heroName;
    if (isHeroHit) {
      counter.hits++;
    }

    this.updatedAt = Date.now();
    logger.debug(
      { abilityName, attackerName, targetName, isHeroHit, counter },
      "[AbilityAccuracy] Ability event processed",
    );
    return true;
  }

  /** Get full snapshot of all tracked abilities. */
  getSnapshot(): AbilityAccuracySnapshot {
    const allEntries: AbilityAccuracyEntry[] = [];
    for (const cfg of TRACKED_ABILITIES) {
      const c = this.counters.get(cfg.abilityName) ?? { attempts: 0, hits: 0 };
      const accuracyPct =
        c.attempts > 0 ? `${Math.round((c.hits / c.attempts) * 100)}%` : "";
      allEntries.push({
        abilityName: cfg.abilityName,
        displayName: cfg.displayName,
        heroName: cfg.heroName,
        attempts: c.attempts,
        hits: c.hits,
        accuracyPct,
      });
    }

    // Active entries = ability's hero is currently in the game
    const entries = allEntries.filter((e) => this.activeHeroes.has(e.heroName));

    return { entries, allEntries, updatedAt: this.updatedAt };
  }

  /** Quick check: is there any non-zero data to show? */
  hasData(): boolean {
    for (const [, c] of this.counters) {
      if (c.attempts > 0) return true;
    }
    return false;
  }
}

export const abilityAccuracyTracker = new AbilityAccuracyTracker();

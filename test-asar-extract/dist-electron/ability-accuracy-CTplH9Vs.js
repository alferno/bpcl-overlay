var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { l as logger } from "./main-DUTMvFFB.js";
const TRACKED_ABILITIES = [
  {
    abilityName: "pudge_meat_hook",
    heroName: "npc_dota_hero_pudge",
    displayName: "Hook"
  },
  {
    abilityName: "rattletrap_hookshot",
    heroName: "npc_dota_hero_rattletrap",
    displayName: "Hookshot"
  },
  {
    abilityName: "mirana_arrow",
    heroName: "npc_dota_hero_mirana",
    displayName: "Arrow"
  },
  {
    abilityName: "invoker_sun_strike",
    heroName: "npc_dota_hero_invoker",
    displayName: "Sunstrike"
  },
  {
    // Hoodwink's Sharpshooter is a charge-and-release ability.
    // We track the _release event — that is when the arrow actually launches
    // and can connect with a hero.
    abilityName: "hoodwink_sharpshooter_release",
    heroName: "npc_dota_hero_hoodwink",
    displayName: "Sharpshooter"
  },
  {
    abilityName: "muerta_dead_shot",
    heroName: "npc_dota_hero_muerta",
    displayName: "Dead Shot"
  }
];
const abilityToConfig = /* @__PURE__ */ new Map();
const heroToAbilities = /* @__PURE__ */ new Map();
for (const cfg of TRACKED_ABILITIES) {
  abilityToConfig.set(cfg.abilityName, cfg);
  const existing = heroToAbilities.get(cfg.heroName) ?? [];
  existing.push(cfg.abilityName);
  heroToAbilities.set(cfg.heroName, existing);
}
class AbilityAccuracyTracker {
  constructor() {
    // abilityName → { attempts, hits }
    __publicField(this, "counters", /* @__PURE__ */ new Map());
    // heroName → steam32 (populated from GSI to filter per-player)
    __publicField(this, "activeHeroes", /* @__PURE__ */ new Set());
    __publicField(this, "updatedAt", null);
    this.reset();
  }
  /** Call on every new match start to clear all counters. */
  reset() {
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
  setActiveHeroes(heroNames) {
    this.activeHeroes = new Set(heroNames);
  }
  /**
   * Process one line from the Dota 2 combat log file.
   * Returns true if a counter changed (caller should emit update).
   */
  processLine(line) {
    if (!line.includes("type: 5") && !line.startsWith("5 ")) return false;
    const attackerMatch = line.match(/attacker_name:\s*(\S+)/);
    const abilityMatch = line.match(/ability_name:\s*(\S+)/);
    const targetMatch = line.match(/target_name:\s*(\S+)/);
    if (!attackerMatch || !abilityMatch) return false;
    const attackerName = attackerMatch[1];
    const abilityName = abilityMatch[1];
    const targetName = (targetMatch == null ? void 0 : targetMatch[1]) ?? "";
    const cfg = abilityToConfig.get(abilityName);
    if (!cfg) return false;
    if (attackerName !== cfg.heroName) return false;
    const counter = this.counters.get(abilityName);
    if (!counter) return false;
    counter.attempts++;
    const isHeroHit = targetName.startsWith("npc_dota_hero_") && targetName !== cfg.heroName;
    if (isHeroHit) {
      counter.hits++;
    }
    this.updatedAt = Date.now();
    logger.debug(
      { abilityName, attackerName, targetName, isHeroHit, counter },
      "[AbilityAccuracy] Ability event processed"
    );
    return true;
  }
  /** Get full snapshot of all tracked abilities. */
  getSnapshot() {
    const allEntries = [];
    for (const cfg of TRACKED_ABILITIES) {
      const c = this.counters.get(cfg.abilityName) ?? { attempts: 0, hits: 0 };
      const accuracyPct = c.attempts > 0 ? `${Math.round(c.hits / c.attempts * 100)}%` : "";
      allEntries.push({
        abilityName: cfg.abilityName,
        displayName: cfg.displayName,
        heroName: cfg.heroName,
        attempts: c.attempts,
        hits: c.hits,
        accuracyPct
      });
    }
    const entries = allEntries.filter((e) => this.activeHeroes.has(e.heroName));
    return { entries, allEntries, updatedAt: this.updatedAt };
  }
  /** Quick check: is there any non-zero data to show? */
  hasData() {
    for (const [, c] of this.counters) {
      if (c.attempts > 0) return true;
    }
    return false;
  }
}
const abilityAccuracyTracker = new AbilityAccuracyTracker();
export {
  AbilityAccuracyTracker,
  TRACKED_ABILITIES,
  abilityAccuracyTracker
};

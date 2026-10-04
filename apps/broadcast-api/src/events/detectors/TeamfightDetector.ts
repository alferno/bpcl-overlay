import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";
import type { EventDetector } from "../EventEngine.js";
import type { CanonicalEvent } from "../CanonicalEvent.js";
import type { MatchSession } from "../../gsi/MatchSession.js";

interface DamageSnapshot {
  time: number;
  totalDamage: number;
}

export class TeamfightDetector implements EventDetector {
  private damageHistory: DamageSnapshot[] = [];
  
  private activeFight = false;
  private lastFightEndTime = 0;
  
  // Fight starts if 3000 damage is dealt within 5 seconds.
  private readonly START_THRESHOLD = 3000;
  private readonly START_WINDOW = 5;
  
  // Fight ends if less than 500 damage is dealt over an 8+ second window.
  private readonly END_THRESHOLD = 500;
  private readonly END_WINDOW = 10;
  
  private readonly COOLDOWN_SECONDS = 30;

  public process(previousState: any, currentState: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    if (!currentState?.player || !currentState?.map) return null;
    const clockTime = currentState.map.clock_time;
    if (clockTime == null) return null;

    let currentTotalDamage = 0;

    // Sum up hero_damage across all 10 players
    ["team2", "team3"].forEach(team => {
      const players = currentState.player[team];
      if (players) {
        for (let i = 0; i < 10; i++) {
          const p = players[`player${i}`];
          if (p?.hero_damage) {
            currentTotalDamage += p.hero_damage;
          }
        }
      }
    });

    if (currentTotalDamage === 0) return null;

    this.damageHistory.push({ time: clockTime, totalDamage: currentTotalDamage });

    // Keep history up to the max window we need (END_WINDOW = 10s)
    this.damageHistory = this.damageHistory.filter(h => clockTime - h.time <= this.END_WINDOW);

    if (this.damageHistory.length < 2) return null;

    const events: CanonicalEvent[] = [];

    if (!this.activeFight) {
      // Look for a 5-second burst to START a fight
      const fiveSecHistory = this.damageHistory.filter(h => clockTime - h.time <= this.START_WINDOW);
      if (fiveSecHistory.length > 0) {
        const oldest = fiveSecHistory[0];
        const damageDiff = currentTotalDamage - oldest.totalDamage;

        if (damageDiff > this.START_THRESHOLD && (clockTime - this.lastFightEndTime > this.COOLDOWN_SECONDS)) {
          this.activeFight = true;
          logger.info({ clockTime, damageBurst: damageDiff }, "TEAMFIGHT_STARTED detected!");
          
          events.push({
            id: randomUUID(),
            type: "TEAMFIGHT_STARTED",
            gameTime: clockTime,
            receivedAt: Date.now(),
            confidence: 0.9,
            source: "GSI_HEURISTIC",
            damageBurst: damageDiff
          } as any);
        }
      }
    } else {
      // Look for an 8-10 second lull to END a fight
      const oldest = this.damageHistory[0];
      const timeSpan = clockTime - oldest.time;
      const damageDiff = currentTotalDamage - oldest.totalDamage;

      // We ensure we are checking a full 8-10 second window to confirm a lull.
      if (timeSpan >= 8 && damageDiff < this.END_THRESHOLD) {
        this.activeFight = false;
        this.lastFightEndTime = clockTime;
        logger.info({ clockTime }, "TEAMFIGHT_ENDED detected!");

        events.push({
          id: randomUUID(),
          type: "TEAMFIGHT_ENDED",
          gameTime: clockTime,
          receivedAt: Date.now(),
          confidence: 0.9,
          source: "GSI_HEURISTIC",
          radiantWinChance: currentState.map?.radiant_win_chance
        } as any);
      }
    }
    
    return events.length > 0 ? events : null;
  }

  public reset(): void {
    this.damageHistory = [];
    this.activeFight = false;
    this.lastFightEndTime = 0;
  }
}

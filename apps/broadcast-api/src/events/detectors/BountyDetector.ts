import { EventDetector } from "../EventEngine.js";
import { MatchSession } from "../../gsi/MatchSession.js";
import { CanonicalEvent, BountyRuneEvent } from "../CanonicalEvent.js";

function bountyGoldAtConsumption(clockTime: number): number {
  const goldPerHero = 40 + 6 * Math.floor(Math.max(0, clockTime) / 300);
  return goldPerHero * 5;
}

export class BountyDetector implements EventDetector {
  private bountyEventsProcessedTotal = 0;
  private prevRunePickups = new Map<string, number>();

  public process(prev: any, curr: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    const events: CanonicalEvent[] = [];
    const clockTime = (curr?.map as any)?.clock_time || 0;
    const prevClockTime = (prev?.map as any)?.clock_time || 0;

    if (clockTime < prevClockTime) {
      this.reset();
    }

    let bountyDetectedViaEvents = false;

    // 1. Detect via events array
    if (curr?.events && Array.isArray(curr.events)) {
      const allBountyEvents = curr.events.filter(
        (ev: any) => ev.event_type === "bounty_rune_pickup" && typeof ev.game_time === "number"
      );

      // GSI occasionally clears the events array during live play, or we simulated a reset
      if (allBountyEvents.length < this.bountyEventsProcessedTotal) {
        this.bountyEventsProcessedTotal = 0;
      }

      const newBountyCount = allBountyEvents.length - this.bountyEventsProcessedTotal;

      if (newBountyCount > 0) {
        bountyDetectedViaEvents = true;
        const newEvents = allBountyEvents.slice(this.bountyEventsProcessedTotal);
        const startIndex = this.bountyEventsProcessedTotal;
        this.bountyEventsProcessedTotal = allBountyEvents.length;

        const goldPerRune = bountyGoldAtConsumption(clockTime);

        for (let i = 0; i < newEvents.length; i++) {
          const ev = newEvents[i];
          let team: "radiant" | "dire" | null = null;
          if (ev.team === 2 || ev.team === "radiant") team = "radiant";
          else if (ev.team === 3 || ev.team === "dire") team = "dire";

          if (team) {

            events.push({
              id: `bounty_${team}_${session.matchId}_${clockTime}_${startIndex + i}`,
              type: "BOUNTY_RUNE_PICKED",
              gameTime: clockTime,
              receivedAt: Date.now(),
              confidence: 1.0,
              source: "GSI_EVENTS_ARRAY",
              team,
              goldGained: goldPerRune,
              playerId: ev.player_id,
            });
          }
        }
      }
    }

    // 2. Fallback via bounty_runes_activated
    if (!bountyDetectedViaEvents && clockTime > 0) {
      const goldPerRune = bountyGoldAtConsumption(clockTime);
      for (const [teamKey, side] of [["team2", "radiant"], ["team3", "dire"]] as const) {
        const teamPlayers = (curr?.player as any)?.[teamKey];
        if (!teamPlayers) continue;
        for (let i = 0; i < 5; i++) {
          const pKey = side === "radiant" ? `player${i}` : `player${i + 5}`;
          const player = teamPlayers[pKey];
          if (!player) continue;
          
          const currentPickups = Number(player.bounty_runes_activated ?? 0);
          const cacheKey = `bounty-${teamKey}-${pKey}`;
          const prevPickups = this.prevRunePickups.get(cacheKey) ?? currentPickups;
          
          if (currentPickups > prevPickups) {
            const delta = currentPickups - prevPickups;
            const event: BountyRuneEvent = {
              id: `bounty_fallback_${side}_${session.matchId}_${clockTime}_${pKey}_${delta}`,
              type: "BOUNTY_RUNE_PICKED",
              gameTime: clockTime,
              receivedAt: Date.now(),
              confidence: 0.9,
              source: "GSI_STATE_DIFF",
              team: side,
              goldGained: goldPerRune * delta,
            };
            events.push(event);
          }
          this.prevRunePickups.set(cacheKey, currentPickups);
        }
      }
    }

    return events.length > 0 ? events : null;
  }

  public reset(): void {
    this.bountyEventsProcessedTotal = 0;
    this.prevRunePickups.clear();
  }
}

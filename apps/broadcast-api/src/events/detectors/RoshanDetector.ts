import { EventDetector } from "../EventEngine.js";
import { MatchSession } from "../../gsi/MatchSession.js";
import { CanonicalEvent, RoshanKilledEvent, AegisPickedUpEvent } from "../CanonicalEvent.js";
import { logger } from "../../logger.js";

// Kill 1 : Aegis
// Kill 2 : Aegis + Aghanim's Banner
// Kill 3 : Aegis + Aghanim's Banner + Cheese
// Kill 4+: Aegis + Cheese + Aghanim's Banner + Refresher Shard
function getRoshanDropsByKillNumber(killNumber: number): string[] {
  if (killNumber <= 1)  return ["item_aegis"];
  if (killNumber === 2) return ["item_aegis", "item_roshans_banner"];
  return ["item_aegis", "item_roshans_banner", "item_refresher_shard", "item_cheese"];
}

export class RoshanDetector implements EventDetector {
  // To link Aegis to the correct kill without a timer window, we just track the current kill number
  private lastKillNumber: number = 0;

  public process(prev: any, curr: any, session: MatchSession): CanonicalEvent | CanonicalEvent[] | null {
    const events: CanonicalEvent[] = [];
    const clockTime = (curr?.map as any)?.clock_time || 0;
    const finalRoshanState = (curr?.map as any)?.roshan_state;
    const prevRoshanState = (prev?.map as any)?.roshan_state;

    // Reset state if match rewinds
    const prevClockTime = (prev?.map as any)?.clock_time || 0;
    if (clockTime < prevClockTime) {
      this.reset();
    }

    // Roshan Kill Detection
    if (
      finalRoshanState &&
      prevRoshanState === "alive" &&
      finalRoshanState !== "alive" &&
      clockTime > 0
    ) {
      this.lastKillNumber += 1;
      const killNumber = this.lastKillNumber;

      let killerTeam: "radiant" | "dire" | "none" = "none";
      let killerPlayerId: number | undefined;

      if (Array.isArray(curr?.events)) {
        const rkEvent = curr.events.find((e: any) => e.event_type === "roshan_killed");
        if (rkEvent) {
          if (rkEvent.killed_by_team === "radiant") killerTeam = "radiant";
          else if (rkEvent.killed_by_team === "dire") killerTeam = "dire";
          killerPlayerId = typeof rkEvent.killer_player_id === "number" ? rkEvent.killer_player_id : undefined;
        }
      }

      let killerPlayerName: string | undefined;
      if (killerPlayerId !== undefined) {
        const killerTeamKey = killerPlayerId < 5 ? "team2" : "team3";
        killerPlayerName = (curr?.player as any)?.[killerTeamKey]?.[`player${killerPlayerId}`]?.name;
      }

      const drops = getRoshanDropsByKillNumber(killNumber);

      const killEvent: RoshanKilledEvent = {
        id: `roshan_killed_${session.matchId}_${killNumber}`,
        type: "ROSHAN_KILLED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_EVENTS_ARRAY",
        team: killerTeam,
        killNumber,
        drops,
        killerPlayerName,
      };

      events.push(killEvent);

      this.lastKillNumber = killNumber;
    }

    // Roshan Respawn Detection
    // GSI states: "alive", "respawn_base", "respawn_variable"
    if (
      finalRoshanState === "alive" &&
      prevRoshanState &&
      prevRoshanState !== "alive" &&
      clockTime > 0
    ) {
      events.push({
        id: `roshan_respawned_${session.matchId}_${clockTime}`,
        type: "ROSHAN_RESPAWNED",
        gameTime: clockTime,
        receivedAt: Date.now(),
        confidence: 1.0,
        source: "GSI_STATE_DIFF",
        team: "none"
      });
    }

    // Aegis Pickup / Steal Detection (independent of kill timer)
    if (Array.isArray(curr?.events)) {
      const aegisEvent = curr.events.find((e: any) => e.event_type === "aegis_picked_up");
      if (aegisEvent) {
        const pickerPlayerId: number | undefined = typeof aegisEvent.player_id === "number" ? aegisEvent.player_id : undefined;
        const isSteal: boolean = aegisEvent.snatched === true;

        let pickerPlayerName: string | undefined;
        let pickerTeam: "radiant" | "dire" | "none" = "none";
        if (pickerPlayerId !== undefined) {
          const pickerTeamKey = pickerPlayerId < 5 ? "team2" : "team3";
          pickerTeam = pickerPlayerId < 5 ? "radiant" : "dire";
          pickerPlayerName = (curr?.player as any)?.[pickerTeamKey]?.[`player${pickerPlayerId}`]?.name;
        }

        // If we don't have a killNumber yet (e.g. joined mid-game), assume 1
        const aegisKillNumber = Math.max(1, this.lastKillNumber);

        const pickupEvent: AegisPickedUpEvent = {
          id: `aegis_${isSteal ? "snatched" : "picked_up"}_${session.matchId}_${aegisKillNumber}`,
          type: isSteal ? "AEGIS_SNATCHED" : "AEGIS_PICKED_UP",
          gameTime: clockTime,
          receivedAt: Date.now(),
          confidence: 1.0,
          source: "GSI_EVENTS_ARRAY",
          team: pickerTeam,
          playerId: pickerPlayerId,
          playerName: pickerPlayerName,
          snatched: isSteal,
          killNumber: aegisKillNumber,
        };

        events.push(pickupEvent);
      }
    }
    return events.length > 0 ? events : null;
  }

  public reset(): void {
    this.lastKillNumber = 0;
  }
}

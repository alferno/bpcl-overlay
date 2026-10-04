import { EventBus } from "../events/EventBus.js";
import { StateManager } from "@bpc/state-manager";
import type { Server as IOServer } from "socket.io";
import { getTeamByKey } from "../services/roster-teams.js";
import { logger } from "../logger.js";

export class OverlayConsumer {
  constructor(
    private eventBus: EventBus,
    private state: StateManager,
    private io: IOServer
  ) {
    this.registerListeners();
  }

  private registerListeners() {
    this.eventBus.on("ROSHAN_KILLED", async (e: any) => {
      try {
        const current = await this.state.getState();
        const draftSnap = current.draft;
        const matchSetupSnap = current.leagueConfig?.matchSetup;
        const roster = current.leagueConfig?.roster ?? [];
        
        let teamName: string | undefined;
        let teamLogoUrl: string | undefined;

        if (e.team === "radiant") {
          const tk = matchSetupSnap?.radiantTeamKey;
          teamName = draftSnap?.radiant?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Radiant";
          teamLogoUrl = draftSnap?.radiant?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
        } else if (e.team === "dire") {
          const tk = matchSetupSnap?.direTeamKey;
          teamName = draftSnap?.dire?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Dire";
          teamLogoUrl = draftSnap?.dire?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
        }

        const payload = {
          killNumber: e.killNumber,
          clockTime: e.gameTime,
          teamName,
          teamLogoUrl,
          killerTeam: e.team,
          killerPlayerName: e.killerPlayerName,
          drops: e.drops,
        };

        this.io.of("/overlay").emit("ROSHAN_KILLED", payload);
        logger.info({ killNumber: e.killNumber, team: e.team }, "[OverlayConsumer] Broadcasted ROSHAN_KILLED to overlay");
      } catch (err) {
        logger.error({ err }, "Error processing ROSHAN_KILLED for overlay");
      }
    });

    this.eventBus.on("AEGIS_SNATCHED", async (e: any) => {
      try {
        const current = await this.state.getState();
        const draftSnap = current.draft;
        const matchSetupSnap = current.leagueConfig?.matchSetup;
        const roster = current.leagueConfig?.roster ?? [];

        let thiefTeamName: string | undefined;
        let thiefTeamLogoUrl: string | undefined;

        if (e.team === "radiant") {
          const tk = matchSetupSnap?.radiantTeamKey;
          thiefTeamName = draftSnap?.radiant?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Radiant";
          thiefTeamLogoUrl = draftSnap?.radiant?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
        } else if (e.team === "dire") {
          const tk = matchSetupSnap?.direTeamKey;
          thiefTeamName = draftSnap?.dire?.name ?? (tk ? getTeamByKey(roster, tk)?.teamName : undefined) ?? tk ?? "Dire";
          thiefTeamLogoUrl = draftSnap?.dire?.logoUrl ?? (tk ? `/teams/${tk}.png` : undefined);
        }

        // Figure out the killer team (usually the opposite of the thief if it was a true steal)
        const killerTeam = e.team === "radiant" ? "dire" : e.team === "dire" ? "radiant" : "none";

        const stealInfo = {
          killNumber: e.killNumber,
          clockTime: e.gameTime,
          teamName: thiefTeamName,
          teamLogoUrl: thiefTeamLogoUrl,
          killerTeam,
          pickerTeam: e.team,
          pickerPlayerName: e.playerName,
          drops: [], // We don't track drops strictly for the steal event in the new engine, overlay handles it
        };

        this.io.of("/overlay").emit("AEGIS_STOLEN", stealInfo);
        logger.info({ killNumber: e.killNumber, team: e.team }, "[OverlayConsumer] Broadcasted AEGIS_STOLEN to overlay");
      } catch (err) {
        logger.error({ err }, "Error processing AEGIS_SNATCHED for overlay");
      }
    });
  }
}

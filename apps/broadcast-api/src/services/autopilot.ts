import type { StateManager } from "@bpc/state-manager";
import type { OpenDotaClient } from "../opendota-client.js";
import type { BroadcastFns } from "../routes.js";
import { logger } from "../logger.js";
import {
  buildCarouselFromHeroCard,
  buildMatchupCard,
  buildPlayerHeroCard,
  buildPlayerLeagueCard,
  buildTournamentHeroCard,
} from "./stats-builder.js";

export type AutopilotConfig = {
  enabled: boolean;
  intervalMinutes: number;
  durationSeconds: number;
  cardTypes: ("player-league" | "player-hero" | "tournament-hero" | "matchup")[];
};

class AutopilotManager {
  private timer: NodeJS.Timeout | null = null;
  private state: StateManager | null = null;
  private opendota: OpenDotaClient | null = null;
  private broadcast: BroadcastFns | null = null;
  
  private config: AutopilotConfig = {
    enabled: false,
    intervalMinutes: 5,
    durationSeconds: 12,
    cardTypes: ["player-league", "player-hero", "tournament-hero", "matchup"],
  };

  public getConfig(): AutopilotConfig {
    return { ...this.config };
  }

  public isActive(): boolean {
    return this.timer !== null;
  }

  public async triggerNow() {
    logger.info("Manual autopilot trigger requested");
    await this.triggerRandomCard();
  }

  public configure(
    cfg: Partial<AutopilotConfig>,
    opts?: { state: StateManager; opendota: OpenDotaClient; broadcast: BroadcastFns }
  ) {
    this.config = { ...this.config, ...cfg };
    
    if (opts) {
      this.state = opts.state;
      this.opendota = opts.opendota;
      this.broadcast = opts.broadcast;
    }

    if (this.config.enabled) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  private startTimer() {
    this.stopTimer();
    if (!this.state || !this.opendota || !this.broadcast) {
      logger.warn("Autopilot cannot start: state, opendota or broadcast functions not configured.");
      return;
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    logger.info({ intervalMinutes: this.config.intervalMinutes }, "Starting stats autopilot timer");
    
    this.timer = setInterval(() => {
      void this.triggerRandomCard();
    }, intervalMs);
  }

  private stopTimer() {
    if (this.timer) {
      logger.info("Stopping stats autopilot timer");
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async triggerRandomCard() {
    if (!this.state || !this.opendota || !this.broadcast) return;

    try {
      const snap = await this.state.getState();
      const roster = snap.leagueConfig?.roster ?? [];
      if (roster.length === 0) {
        logger.debug("Autopilot: Roster is empty, skipping stats trigger");
        return;
      }

      // Filter players active in current match setup
      const matchSetup = snap.leagueConfig?.matchSetup;
      let activePlayers = roster;
      if (matchSetup?.radiantTeamKey && matchSetup?.direTeamKey) {
        activePlayers = roster.filter(
          (p) =>
            p.teamKey === matchSetup.radiantTeamKey ||
            p.teamKey === matchSetup.direTeamKey
        );
      }

      if (activePlayers.length === 0) {
        activePlayers = roster; // Fallback
      }

      // Pick card type from config
      const types = this.config.cardTypes.length > 0
        ? this.config.cardTypes
        : ["player-league", "player-hero", "tournament-hero", "matchup"];
      const cardType = types[Math.floor(Math.random() * types.length)];
      
      logger.info({ cardType }, "Autopilot: Triggering random stats card");
      const until = Date.now() + this.config.durationSeconds * 1000;

      if (cardType === "player-league") {
        const player = activePlayers[Math.floor(Math.random() * activePlayers.length)];
        const card = await buildPlayerLeagueCard(
          this.opendota,
          player.steam32,
          player.displayName,
          snap.playerHeroIndex,
          roster
        );
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: null,
          overlayVisibility: {
            herostats: { mode: "timed", until },
          },
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ player: player.displayName }, "Autopilot: Displayed player league stats");
      } 
      
      else if (cardType === "player-hero") {
        const player = activePlayers[Math.floor(Math.random() * activePlayers.length)];
        // Find heroes player has stats for
        const playerHeroIndex = snap.playerHeroIndex ?? {};
        const prefix = `${player.steam32}:`;
        const playedHeroIds = Object.keys(playerHeroIndex)
          .filter((k) => k.startsWith(prefix))
          .map((k) => Number(k.split(":")[1]));

        let heroId = 1; // Fallback Antimage
        if (playedHeroIds.length > 0) {
          heroId = playedHeroIds[Math.floor(Math.random() * playedHeroIds.length)];
        } else {
          // Check active draft picks or tournament index
          const tourneyHeroes = Object.keys(snap.tournamentHeroIndex ?? {});
          if (tourneyHeroes.length > 0) {
            heroId = Number(tourneyHeroes[Math.floor(Math.random() * tourneyHeroes.length)]);
          }
        }

        const card = await buildPlayerHeroCard(
          this.opendota,
          player.steam32,
          heroId,
          player.displayName,
          snap.tournamentHeroIndex ?? {},
          roster,
          snap.playerHeroIndex
        );

        const carousel = buildCarouselFromHeroCard(card, 4000);
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: carousel,
          overlayVisibility: {
            herostats: { mode: "timed", until },
          },
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ player: player.displayName, heroId }, "Autopilot: Displayed player-hero stats carousel");
      } 
      
      else if (cardType === "tournament-hero") {
        const indexKeys = Object.keys(snap.tournamentHeroIndex ?? {});
        if (indexKeys.length === 0) return;
        const heroId = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
        const card = await buildTournamentHeroCard(
          this.opendota,
          heroId,
          snap.tournamentHeroIndex ?? {}
        );
        const next = await this.state.patchState({
          heroStatsCard: card,
          statCarousel: null,
          overlayVisibility: {
            herostats: { mode: "timed", until },
          },
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ heroId }, "Autopilot: Displayed tournament hero stats");
      } 
      
      else if (cardType === "matchup") {
        // Pick two random heroes from active draft, or tournament index
        const draftSlots = [
          ...(snap.draft?.radiant?.slots ?? []),
          ...(snap.draft?.dire?.slots ?? []),
        ].filter((s) => s.heroId && s.heroId > 0);
        
        let heroA = 1;
        let heroB = 2;
        
        if (draftSlots.length >= 2) {
          const slotA = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          let slotB = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          while (slotB.heroId === slotA.heroId && draftSlots.length > 1) {
            slotB = draftSlots[Math.floor(Math.random() * draftSlots.length)];
          }
          heroA = slotA.heroId!;
          heroB = slotB.heroId!;
        } else {
          const indexKeys = Object.keys(snap.tournamentHeroIndex ?? {});
          if (indexKeys.length >= 2) {
            heroA = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            heroB = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            while (heroB === heroA) {
              heroB = Number(indexKeys[Math.floor(Math.random() * indexKeys.length)]);
            }
          }
        }

        const card = await buildMatchupCard(this.opendota, heroA, heroB);
        const next = await this.state.patchState({
          matchupCard: card,
          overlayVisibility: {
            matchup: { mode: "timed", until },
          },
        });
        await this.broadcast.broadcastFull(next);
        logger.info({ heroA, heroB }, "Autopilot: Displayed matchup comparison stats");
      }
    } catch (err) {
      logger.error(err, "Autopilot: Error triggering stats card");
    }
  }
}

export const autopilotManager = new AutopilotManager();

import { EventBus } from "../events/EventBus.js";

export interface WisdomHistoryEntry {
  time: number;
  team: "radiant" | "dire";
  xp: number;
}

export interface BountyHistoryEntry {
  time: number;
  team: "radiant" | "dire";
  count: number;
  gold: number;
}

export interface StateAdapterWisdomStats {
  radiant: { count: number; xp: number };
  dire: { count: number; xp: number };
  history: WisdomHistoryEntry[];
}

export interface StateAdapterBountyStats {
  radiant: { count: number; gold: number };
  dire: { count: number; gold: number };
  history: BountyHistoryEntry[];
}



export class StateAdapter {
  // Wisdom Shrine State
  public wisdomRadiantCount = 0;
  public wisdomDireCount = 0;
  public wisdomHistory: WisdomHistoryEntry[] = [];

  // Bounty Rune State
  public bountyRadiantCount = 0;
  public bountyDireCount = 0;
  public bountyHistory: BountyHistoryEntry[] = [];

  // Tormentor State
  public tormentorRadiantKillTime: number | null = null;
  public tormentorDireKillTime: number | null = null;

  // Roshan / Aegis State
  public roshanKillCount = 0;
  public roshanLastKillTime: number | null = null;
  public roshanState: "alive" | "dead" = "alive";
  public aegisHolderPlayerId: number | null = null;
  public aegisHolderTeam: "radiant" | "dire" | "none" = "none";
  public aegisSnatched = false;

  constructor(private eventBus: EventBus) {
    this.registerListeners();
  }

  private registerListeners() {
    this.eventBus.on("MATCH_INITIALIZED", () => {
      // Reset match state
      this.wisdomRadiantCount = 0;
      this.wisdomDireCount = 0;
      this.wisdomHistory = [];

      this.bountyRadiantCount = 0;
      this.bountyDireCount = 0;
      this.bountyHistory = [];

      this.tormentorRadiantKillTime = null;
      this.tormentorDireKillTime = null;

      this.roshanKillCount = 0;
      this.roshanLastKillTime = null;
      this.roshanState = "alive";
      this.aegisHolderPlayerId = null;
      this.aegisHolderTeam = "none";
      this.aegisSnatched = false;
    });

    this.eventBus.on("WISDOM_SHRINE_TAKEN", (event) => {
      const team = (event as any).team;
      
      // A shrine can only spawn ONE rune every 7 minutes (420s).
      // If we already saw this specific shrine taken during this 7-min cycle, ignore flickers.
      const cycle = Math.floor(Math.max(0, event.gameTime) / 420);
      const alreadyTaken = this.wisdomHistory.some(h => 
        h.team === team && Math.floor(Math.max(0, h.time) / 420) === cycle
      );
      if (alreadyTaken) return;

      const nominalXp = 283 + Math.floor(Math.max(0, event.gameTime - 420) / 420) * 283;

      if (team === "radiant") {
        this.wisdomRadiantCount++;
        this.wisdomHistory.push({ time: event.gameTime, team: "radiant", xp: nominalXp });
      } else if (team === "dire") {
        this.wisdomDireCount++;
        this.wisdomHistory.push({ time: event.gameTime, team: "dire", xp: nominalXp });
      }
    });

    this.eventBus.on("BOUNTY_RUNE_PICKED", (event) => {
      const e = event as any; // or cast to BountyRuneEvent
      const goldPerHero = 40 + 6 * Math.floor(Math.max(0, e.gameTime) / 300);
      const teamGold = goldPerHero * 5;

      if (e.team === "radiant") {
        this.bountyRadiantCount++;
        this.bountyHistory.push({ time: e.gameTime, team: "radiant", count: 1, gold: teamGold });
      } else if (e.team === "dire") {
        this.bountyDireCount++;
        this.bountyHistory.push({ time: e.gameTime, team: "dire", count: 1, gold: teamGold });
      }
    });

    this.eventBus.on("TORMENTOR_KILLED", (event) => {
      const e = event as any;
      if (e.team === "radiant") {
        this.tormentorRadiantKillTime = e.gameTime;
      } else if (e.team === "dire") {
        this.tormentorDireKillTime = e.gameTime;
      }
    });

    this.eventBus.on("TORMENTOR_RESPAWNED", (e: any) => {
      // We don't strictly need to track respawn since we use killTime + 600s
      // but if the clock rewinds or we get an authoritative respawn early, we can clear it.
      if (e.team === "radiant") this.tormentorRadiantKillTime = null;
      if (e.team === "dire") this.tormentorDireKillTime = null;
    });

    this.eventBus.on("ROSHAN_KILLED", (e: any) => {
      this.roshanKillCount = e.killNumber;
      this.roshanLastKillTime = e.gameTime;
      this.roshanState = "dead";
      this.aegisHolderPlayerId = null;
      this.aegisHolderTeam = "none";
      this.aegisSnatched = false;
    });

    this.eventBus.on("ROSHAN_RESPAWNED", (e: any) => {
      this.roshanState = "alive";
      this.aegisHolderPlayerId = null;
      this.aegisHolderTeam = "none";
      this.aegisSnatched = false;
    });

    this.eventBus.on("AEGIS_PICKED_UP", (e: any) => {
      this.aegisHolderPlayerId = e.playerId ?? null;
      this.aegisHolderTeam = e.team;
      this.aegisSnatched = false;
    });

    this.eventBus.on("AEGIS_SNATCHED", (e: any) => {
      this.aegisHolderPlayerId = e.playerId ?? null;
      this.aegisHolderTeam = e.team;
      this.aegisSnatched = true;
    });
  }

  public getWisdomStats(): StateAdapterWisdomStats {
      // We compute total nominal XP based on count for the overlay
      let radiantXp = 0;
      let direXp = 0;
      for (const h of this.wisdomHistory) {
        if (h.team === "radiant") radiantXp += h.xp;
        if (h.team === "dire") direXp += h.xp;
      }
  
      return {
        radiant: { count: this.wisdomRadiantCount, xp: radiantXp },
        dire: { count: this.wisdomDireCount, xp: direXp },
        history: this.wisdomHistory,
      };
    }
  
    public getBountyStats(): StateAdapterBountyStats {
      let radiantGold = 0;
      let direGold = 0;
      for (const h of this.bountyHistory) {
        if (h.team === "radiant") radiantGold += h.gold;
        if (h.team === "dire") direGold += h.gold;
      }
  
      return {
        radiant: { count: this.bountyRadiantCount, gold: radiantGold },
        dire: { count: this.bountyDireCount, gold: direGold },
        history: this.bountyHistory,
      };
    }

    public getTormentorState(clockTime: number) {
      let tormRadState = "dead";
      let tormRadTimer = Math.max(0, 1200 - clockTime);
      let tormDireState = "dead";
      let tormDireTimer = Math.max(0, 1200 - clockTime);

      if (clockTime >= 1200) {
        if (this.tormentorRadiantKillTime !== null) {
          const timeSinceKill = clockTime - this.tormentorRadiantKillTime;
          if (timeSinceKill < 600) {
            tormRadState = "dead";
            tormRadTimer = 600 - timeSinceKill;
          } else {
            tormRadState = "alive";
            tormRadTimer = 0;
          }
        } else {
          tormRadState = "alive";
          tormRadTimer = 0;
        }

        if (this.tormentorDireKillTime !== null) {
          const timeSinceKill = clockTime - this.tormentorDireKillTime;
          if (timeSinceKill < 600) {
            tormDireState = "dead";
            tormDireTimer = 600 - timeSinceKill;
          } else {
            tormDireState = "alive";
            tormDireTimer = 0;
          }
        } else {
          tormDireState = "alive";
          tormDireTimer = 0;
        }
      }

      return {
        tormentorRadiant: tormRadState,
        tormentorRadiantRespawnTimer: tormRadTimer,
        tormentorDire: tormDireState,
        tormentorDireRespawnTimer: tormDireTimer,
      };
    }

  private lastClockTime = 0;
  
  public syncClock(clockTime: number) {
    if (clockTime < this.lastClockTime - 10) {
      // Replay rewound
      this.wisdomHistory = this.wisdomHistory.filter(h => h.time <= clockTime);
      this.wisdomRadiantCount = this.wisdomHistory.filter(h => h.team === "radiant").length;
      this.wisdomDireCount = this.wisdomHistory.filter(h => h.team === "dire").length;

      this.bountyHistory = this.bountyHistory.filter(h => h.time <= clockTime);
      this.bountyRadiantCount = this.bountyHistory.filter(h => h.team === "radiant").reduce((acc, h) => acc + h.count, 0);
      this.bountyDireCount = this.bountyHistory.filter(h => h.team === "dire").reduce((acc, h) => acc + h.count, 0);
    }
    this.lastClockTime = clockTime;
  }
}

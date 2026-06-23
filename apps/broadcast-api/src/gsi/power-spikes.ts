import type { Server as IOServer } from "socket.io";
import { logger } from "../logger.js";

// Keep track of which items each player has seen so we only trigger on NEW purchases
// Map<steamId or playerName, Set<string>>
const seenItems = new Map<string, Set<string>>();

const HYPE_ITEMS: Record<string, string> = {
  "item_blink": "CRITICAL MOBILITY: BLINK DAGGER",
  "item_black_king_bar": "MAGIC IMMUNITY: BKB ONLINE",
  "item_rapier": "ALL IN: DIVINE RAPIER",
  "item_radiance": "FARMING ACCELERATOR: RADIANCE",
  "item_manta": "ILLUSIONS READY: MANTA STYLE",
  "item_ultimate_scepter": "AGHANIM'S SCEPTER SECURED",
  "item_bfury": "CLEAVE ACTIVE: BATTLE FURY",
  "item_heart": "MASSIVE SURVIVABILITY: HEART",
  "item_monkey_king_bar": "TRUE STRIKE: MKB ONLINE",
  "item_bloodthorn": "SILENCE READY: BLOODTHORN",
  "item_refresher": "DOUBLE ULTIMATE: REFRESHER",
  "item_sheepstick": "HEX READY: SCYTHE OF VYSE",
};

function getPlayerItems(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    return payload?.items?.[teamKey]?.[playerKey] || {};
  } catch {
    return {};
  }
}

function getPlayerHero(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    return payload?.hero?.[teamKey]?.[playerKey]?.name || "unknown_hero";
  } catch {
    return "unknown_hero";
  }
}

function getPlayerName(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    return payload?.player?.[teamKey]?.[playerKey]?.name || "Unknown Player";
  } catch {
    return "Unknown Player";
  }
}

export function detectPowerSpikes(payload: any, io: IOServer) {
  if (!payload?.items) return;

  const clockTime = payload?.map?.clock_time || 0;
  // Don't trigger hype alerts before the game starts (e.g. strategy time items)
  if (clockTime < 0) return;

  const checkTeam = (teamKey: "team2" | "team3") => {
    for (let i = 0; i <= 9; i++) {
      const playerKey = `player${i}`;
      const items = getPlayerItems(payload, teamKey, playerKey);
      
      const playerName = getPlayerName(payload, teamKey, playerKey);
      if (!playerName || playerName === "Unknown Player") continue;

      if (!seenItems.has(playerName)) {
        seenItems.set(playerName, new Set<string>());
      }
      const playerSeenItems = seenItems.get(playerName)!;

      // Extract all current items in inventory
      const currentItems = new Set<string>();
      for (const slotKey in items) {
        const itemName = items[slotKey]?.name;
        if (itemName && itemName !== "empty") {
          currentItems.add(itemName);
        }
      }

      // Check for newly acquired items
      for (const item of currentItems) {
        if (!playerSeenItems.has(item)) {
          playerSeenItems.add(item);
          
          if (HYPE_ITEMS[item]) {
            const heroName = getPlayerHero(payload, teamKey, playerKey);
            const hypeText = HYPE_ITEMS[item];
            
            logger.info({ playerName, heroName, item, hypeText }, "Power Spike Detected!");
            
            // Emit to overlays
            io.of("/overlay").emit("POWER_SPIKE", {
              playerName,
              heroName,
              item,
              hypeText,
            });
          }
        }
      }
    }
  };

  checkTeam("team2");
  checkTeam("team3");
}

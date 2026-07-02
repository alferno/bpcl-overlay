import type { Server as IOServer } from "socket.io";
import { logger } from "../logger.js";
import { heroDisplayName } from "../services/hero-registry.js";
import { getAverageItemTiming } from "../services/item-timings.js";

// Keep track of which items each player has seen so we only trigger on NEW purchases
// Map<steamId or playerName, Set<string>>
const seenItems = new Map<string, Set<string>>();

export const HYPE_ITEMS: Record<string, { name: string, category: string }> = {
  "item_blink": { name: "Blink Dagger", category: "CRITICAL MOBILITY" },
  "item_black_king_bar": { name: "Black King Bar", category: "MAGIC IMMUNITY" },
  "item_rapier": { name: "Divine Rapier", category: "ALL IN" },
  "item_gem": { name: "Gem of True Sight", category: "TRUE SIGHT" },
  "item_radiance": { name: "Radiance", category: "FARMING ACCELERATOR" },
  "item_manta": { name: "Manta Style", category: "ILLUSIONS READY" },
  "item_ultimate_scepter": { name: "Aghanim's Scepter", category: "ULTIMATE UPGRADE" },
  "item_bfury": { name: "Battle Fury", category: "CLEAVE ACTIVE" },
  "item_heart": { name: "Heart of Tarrasque", category: "MASSIVE SURVIVABILITY" },
  "item_monkey_king_bar": { name: "Monkey King Bar", category: "TRUE STRIKE" },
  "item_bloodthorn": { name: "Bloodthorn", category: "SILENCE READY" },
  "item_refresher": { name: "Refresher Orb", category: "DOUBLE ULTIMATE" },
  "item_sheepstick": { name: "Scythe of Vyse", category: "HEX READY" },
};

function getPlayerItems(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    return payload?.items?.[teamKey]?.[playerKey] || {};
  } catch {
    return {};
  }
}

function getPlayerHeroData(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    const raw = payload?.hero?.[teamKey]?.[playerKey];
    if (!raw) return { id: 0, name: "unknown_hero" };
    return {
      id: Number(raw.hero_id ?? raw.id ?? 0),
      name: raw.name || "unknown_hero"
    };
  } catch {
    return { id: 0, name: "unknown_hero" };
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
            const heroData = getPlayerHeroData(payload, teamKey, playerKey);
            const cleanHeroName = heroData.id > 0 ? heroDisplayName(heroData.id) : heroData.name;
            const hypeData = HYPE_ITEMS[item];
            
            const averageTime = getAverageItemTiming(heroData.id, item);
            let timingDiff = null;
            if (averageTime !== null && clockTime > 0) {
              timingDiff = clockTime - averageTime; // negative means faster, positive means slower
            }
            
            logger.info({ playerName, cleanHeroName, item, hypeData, clockTime, averageTime, timingDiff }, "Power Spike Detected!");
            
            // Emit to overlays
            io.of("/overlay").emit("POWER_SPIKE", {
              playerName,
              heroName: cleanHeroName,
              item,
              cleanItemName: hypeData.name,
              categoryText: hypeData.category,
              clockTime,
              averageTime,
              timingDiff
            });
          }
        }
      }
    }
  };

  checkTeam("team2");
  checkTeam("team3");
}

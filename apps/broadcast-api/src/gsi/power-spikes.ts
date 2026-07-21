import type { Server as IOServer } from "socket.io";
import type { StateManager } from "@bpc/state-manager";
import { logger } from "../logger.js";
import { heroDisplayName } from "../services/hero-registry.js";
import { getAverageItemTiming, getLeagueItemTiming } from "../services/item-timings.js";

// Keep track of which items each player has seen so we only trigger on NEW purchases
// Map<steamId or playerName, Set<string>>
const seenItems = new Map<string, Set<string>>();
let currentMatchId: string | number | null = null;
const globalSeenDroppables = new Set<string>();

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

function getPlayerSteam32(payload: any, teamKey: "team2" | "team3", playerKey: string) {
  try {
    const raw = payload?.player?.[teamKey]?.[playerKey];
    if (!raw) return null;
    const accountId = Number(raw.accountid);
    return isNaN(accountId) ? null : accountId;
  } catch {
    return null;
  }
}

export async function detectPowerSpikes(payload: any, io: IOServer, state: StateManager) {
  if (!payload?.items) return;

  const clockTime = payload?.map?.clock_time || 0;
  // Don't trigger hype alerts before the game starts (e.g. strategy time items)
  if (clockTime < 0) return;
  
  const matchId = payload?.map?.matchid;
  if (matchId && matchId !== currentMatchId) {
    currentMatchId = matchId;
    seenItems.clear();
    globalSeenDroppables.clear();
  }

  const snap = await state.getState();

  const checkTeam = (teamKey: "team2" | "team3", startIdx: number, endIdx: number) => {
    for (let i = startIdx; i <= endIdx; i++) {
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
        // Only trigger for items in main inventory (slot0-slot5) and backpack (slot6-8)
        // This avoids triggering when item is in stash or on courier
        if (!slotKey.startsWith("slot")) continue;
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
            // Check droppable items
            if (item === "item_rapier" || item === "item_gem") {
              if (globalSeenDroppables.has(item)) continue;
              globalSeenDroppables.add(item);
            }
            
            const heroData = getPlayerHeroData(payload, teamKey, playerKey);
            const cleanHeroName = heroData.id > 0 ? heroDisplayName(heroData.id) : heroData.name;
            const hypeData = HYPE_ITEMS[item];
            
            const steam32 = getPlayerSteam32(payload, teamKey, playerKey);
            let isFirstTime = false;
            
            if (steam32 && heroData.id > 0) {
              const playerHeroStats = snap.lifetimePlayerHeroIndex?.[`${steam32}:${heroData.id}`];
              if (!playerHeroStats || playerHeroStats.games === 0) {
                isFirstTime = true;
              }
            }
            
            const leagueTimingObj = getLeagueItemTiming(heroData.id, item);
            const averageTime = leagueTimingObj !== null ? leagueTimingObj.time : getAverageItemTiming(heroData.id, item);
            const timesBought = leagueTimingObj !== null ? leagueTimingObj.count : null;
            const isLeagueData = leagueTimingObj !== null;
            
            let timingDiff = null;
            if (averageTime !== null && clockTime > 0) {
              timingDiff = clockTime - averageTime; // negative means faster, positive means slower
            }
            
            logger.info({ playerName, cleanHeroName, item, hypeData, clockTime, averageTime, timingDiff, isLeagueData, isFirstTime, timesBought }, "Power Spike Detected!");
            
            // Emit to overlays
            io.of("/overlay").emit("POWER_SPIKE", {
              playerName,
              heroName: cleanHeroName,
              item,
              cleanItemName: hypeData.name,
              categoryText: hypeData.category,
              clockTime,
              averageTime,
              timingDiff,
              isLeagueData,
              isFirstTime,
              timesBought
            });
          }
        }
      }
    }
  };

  checkTeam("team2", 0, 4);
  checkTeam("team3", 5, 9);
}

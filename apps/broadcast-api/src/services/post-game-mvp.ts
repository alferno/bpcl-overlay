/**
 * post-game-mvp.ts
 * ────────────────
 * Extracts all 10 players' end-of-game statistics from a GSI payload and
 * runs the MVP scorer without needing an OpenDota API call.
 *
 * GSI payload structure (observer / spectator mode):
 *
 *   payload.map.game_state   → "DOTA_GAMERULES_STATE_POST_GAME"
 *   payload.map.radiant_win  → boolean
 *   payload.map.clock_time   → match duration in seconds (end-of-game)
 *   payload.map.game_time    → same
 *
 *   payload.player.team2.player0 … player4  → radiant players
 *   payload.player.team3.player0 … player4  → dire players
 *     Each player object has: kills, deaths, assists, last_hits, denies,
 *     gold, gpm, xpm, net_worth, hero_damage, hero_healing, name, accountid
 *
 *   payload.hero.team2.player0 … player4    → radiant heroes
 *   payload.hero.team3.player0 … player4    → dire heroes
 *     Each hero object has: hero_id, name (class), level
 *
 *   payload.items.team2.player0 … player4   → radiant items
 *   payload.items.team3.player0 … player4   → dire items
 *     Each items object has: slot0…slot5, neutral0, backpack0…backpack2,
 *                            stash0…stash2 (not used here)
 *     Each slot: { id: number, … }
 */

import type { RawMatch, RawMatchPlayer } from "./mvp-scorer.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GsiPayload = Record<string, any>;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function itemId(slot: unknown): number {
  const r = asRecord(slot);
  if (!r) return 0;
  return asNum(r.id ?? r.item_id ?? r.itemid, 0);
}

// ─── Per-player extraction ────────────────────────────────────────────────────

function extractGsiPlayer(
  playerData: Record<string, unknown>,
  heroData: Record<string, unknown> | null,
  itemData: Record<string, unknown> | null,
  playerSlot: number,
  radiantWin: boolean,
  durationSecs: number,
): RawMatchPlayer {
  const isRadiant = playerSlot < 128;
  const won = radiantWin ? isRadiant : !isRadiant;

  const heroId = asNum(heroData?.hero_id ?? heroData?.heroid ?? heroData?.id, 0) || undefined;
  const heroClass = typeof heroData?.name === "string" ? heroData.name : undefined;

  // Item slots from the items payload
  const item_0 = itemId(itemData?.slot0 ?? itemData?.item0);
  const item_1 = itemId(itemData?.slot1 ?? itemData?.item1);
  const item_2 = itemId(itemData?.slot2 ?? itemData?.item2);
  const item_3 = itemId(itemData?.slot3 ?? itemData?.item3);
  const item_4 = itemId(itemData?.slot4 ?? itemData?.item4);
  const item_5 = itemId(itemData?.slot5 ?? itemData?.item5);
  const item_neutral = itemId(itemData?.neutral0 ?? itemData?.neutral);
  const backpack_0 = itemId(itemData?.backpack0);
  const backpack_1 = itemId(itemData?.backpack1);
  const backpack_2 = itemId(itemData?.backpack2);

  // Aghanims detection via item IDs (108 = scepter, 271 = blessing, 609 = shard)
  const allItemIds = [item_0, item_1, item_2, item_3, item_4, item_5];
  // Also check via GSI's aghanims_scepter / aghanims_shard fields on heroData
  const hasScepterField = asNum(heroData?.aghanims_scepter ?? heroData?.has_scepter, 0);
  const hasShardField  = asNum(heroData?.aghanims_shard  ?? heroData?.has_shard,   0);
  const hasScepterItem = allItemIds.includes(108) || allItemIds.includes(271) || allItemIds.includes(127) || allItemIds.includes(256); // Keep old IDs just in case they were weird legacy matches, but ensure 108 and 271 exist.
  const hasShardItem   = allItemIds.includes(609) || allItemIds.includes(125);

  return {
    account_id:     asNum(playerData.accountid, 0) || undefined,
    personaname:    typeof playerData.name === "string" ? playerData.name : undefined,
    hero_id:        heroId,
    hero_name:      heroClass,
    player_slot:    playerSlot,
    leaver_status:  asNum(playerData.leaver_status, 0),
    win:            won ? 1 : 0,
    kills:          asNum(playerData.kills, 0),
    deaths:         asNum(playerData.deaths, 0),
    assists:        asNum(playerData.assists, 0),
    hero_damage:    asNum(playerData.hero_damage, 0),
    hero_healing:   asNum(playerData.hero_healing ?? playerData.healer_damage, 0),
    gold_per_min:   asNum(playerData.gpm ?? playerData.gold_per_min, 0),
    xp_per_min:     asNum(playerData.xpm ?? playerData.xp_per_min, 0),
    net_worth:      asNum(playerData.net_worth ?? playerData.networth, 0),
    last_hits:      asNum(playerData.last_hits, 0),
    denies:         asNum(playerData.denies, 0),
    lane_efficiency:asNum(playerData.lane_efficiency, 0),
    duration:       durationSecs,
    item_0, item_1, item_2, item_3, item_4, item_5,
    item_neutral,
    backpack_0, backpack_1, backpack_2,
    aghanims_scepter: (hasScepterField || hasScepterItem) ? 1 : 0,
    aghanims_shard:   (hasShardField  || hasShardItem)   ? 1 : 0,
  };
}

// ─── Team extractor ───────────────────────────────────────────────────────────

function extractTeam(
  playerTeam: Record<string, unknown> | null,
  heroTeam:   Record<string, unknown> | null,
  itemTeam:   Record<string, unknown> | null,
  slotBase:   number,                 // 0 for radiant, 128 for dire
  radiantWin: boolean,
  durationSecs: number,
): RawMatchPlayer[] {
  const players: RawMatchPlayer[] = [];
  for (let i = 0; i < 5; i++) {
    const key = `player${i}`;
    const playerData = asRecord(playerTeam?.[key]);
    if (!playerData) continue;

    const heroData   = asRecord(heroTeam?.[key]) ?? null;
    const itemData   = asRecord(itemTeam?.[key]) ?? null;
    const playerSlot = slotBase + i;

    players.push(
      extractGsiPlayer(playerData, heroData, itemData, playerSlot, radiantWin, durationSecs),
    );
  }
  return players;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GsiPostGameData {
  /** Synthetic match object ready to feed into rankMvpCandidates() */
  match: RawMatch;
  /** GSI match ID (if available, may be 0) */
  matchId: number;
  /** Was the GSI payload actually a post-game payload? */
  isPostGame: boolean;
}

/**
 * Parse a GSI payload into a RawMatch suitable for MVP scoring.
 * Returns `{ isPostGame: false }` when the payload is not a post-game state.
 */
export function parsePostGamePayload(payload: GsiPayload): GsiPostGameData {
  const map = asRecord(payload.map);
  const gameState = typeof map?.game_state === "string" ? map.game_state : "";
  const isPostGame = gameState === "DOTA_GAMERULES_STATE_POST_GAME";

  if (!isPostGame) {
    return {
      match: { match_id: 0, players: [] },
      matchId: 0,
      isPostGame: false,
    };
  }

  const radiantWin = map?.radiant_win === true || map?.radiant_win === "true" || map?.radiant_win === 1;
  // clock_time at end of game is the match duration
  const durationSecs = Math.max(1, asNum(map?.clock_time ?? map?.game_time, 0));
  const matchId = asNum(map?.matchid ?? map?.match_id, 0);

  const playerRoot = asRecord(payload.player);
  const heroRoot   = asRecord(payload.hero);
  const itemRoot   = asRecord(payload.items);

  const radiantPlayers = extractTeam(
    asRecord(playerRoot?.team2 ?? playerRoot?.radiant),
    asRecord(heroRoot?.team2 ?? heroRoot?.radiant),
    asRecord(itemRoot?.team2 ?? itemRoot?.radiant),
    0,
    radiantWin,
    durationSecs,
  );

  const direPlayers = extractTeam(
    asRecord(playerRoot?.team3 ?? playerRoot?.dire),
    asRecord(heroRoot?.team3 ?? heroRoot?.dire),
    asRecord(itemRoot?.team3 ?? itemRoot?.dire),
    128,
    radiantWin,
    durationSecs,
  );

  const match: RawMatch = {
    match_id: matchId,
    duration: durationSecs,
    radiant_win: radiantWin,
    players: [...radiantPlayers, ...direPlayers],
  };

  return { match, matchId, isPostGame: true };
}

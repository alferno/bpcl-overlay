export type EventType =
  | "GAME_STARTED"
  | "GAME_PAUSED"
  | "GAME_RESUMED"
  | "GAME_ENDED"
  | "FIRST_BLOOD"
  | "HERO_KILL"
  | "MULTI_KILL"
  | "KILL_STREAK"
  | "TOWER_DESTROYED"
  | "BARRACKS_DESTROYED"
  | "ANCIENT_DAMAGED"
  | "ANCIENT_DESTROYED"
  | "ROSHAN_KILLED"
  | "ROSHAN_RESPAWNED"
  | "AEGIS_PICKED_UP"
  | "AEGIS_SNATCHED"
  | "WISDOM_SHRINE_TAKEN"
  | "WISDOM_SHRINE_RESPAWNED"
  | "BOUNTY_RUNE_PICKED"
  | "WATER_RUNE_PICKED"
  | "POWER_RUNE_PICKED"
  | "BUYBACK"
  | "ITEM_PURCHASED"
  | "ITEM_SOLD"
  | "HERO_LEVEL_UP"
  | "DRAFT_PICK"
  | "DRAFT_BAN"
  | "TORMENTOR_KILLED"
  | "TORMENTOR_RESPAWNED"
  | "MATCH_INITIALIZED"
  | "MATCH_STARTED"
  | "MATCH_PAUSED"
  | "MATCH_RESUMED"
  | "MATCH_ENDED"
  | "MATCH_STATE_CHANGED"
  | "DRAFT_STATE_CHANGED";

export interface BaseEvent {
  id: string; // unique deterministic id where possible
  type: EventType;
  gameTime: number; // in-game clock time
  receivedAt: number; // system timestamp
  confidence: number; // 0.0 to 1.0
  source: string; // e.g. "GSI_STATE_DIFF" or "GSI_EVENT_LOG"
}

export interface TeamEvent extends BaseEvent {
  team: "radiant" | "dire" | "none";
}

export interface MatchLifecycleEvent extends BaseEvent {
  matchId: string | number | null;
  metadata?: any;
}

export interface PlayerEvent extends TeamEvent {
  playerId?: number; // 0-9
  heroId?: number;
  heroName?: string;
  steam32?: number;
  playerName?: string;
}

export interface WisdomShrineEvent extends TeamEvent {
  type: "WISDOM_SHRINE_TAKEN" | "WISDOM_SHRINE_RESPAWNED";
}

export interface BountyRuneEvent extends TeamEvent {
  type: "BOUNTY_RUNE_PICKED";
  goldGained: number;
}

export interface RoshanKilledEvent extends TeamEvent {
  type: "ROSHAN_KILLED";
  killNumber: number;
  drops: string[];
  killerPlayerName?: string;
}

export interface AegisPickedUpEvent extends PlayerEvent {
  type: "AEGIS_PICKED_UP" | "AEGIS_SNATCHED";
  snatched: boolean;
  killNumber: number;
}

export interface TormentorKilledEvent extends TeamEvent {
  type: "TORMENTOR_KILLED";
}

export interface TormentorRespawnedEvent extends TeamEvent {
  type: "TORMENTOR_RESPAWNED";
}

export type CanonicalEvent =
  | BaseEvent
  | TeamEvent
  | PlayerEvent
  | WisdomShrineEvent
  | BountyRuneEvent
  | RoshanKilledEvent
  | AegisPickedUpEvent
  | TormentorKilledEvent
  | TormentorRespawnedEvent;

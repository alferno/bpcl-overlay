import { z } from "zod";

import {
  gameStartCountdownPatchSchema,
  gameStartCountdownSchema,
} from "./game-start-countdown.js";

export * from "./hero-assets.js";
export * from "./hero-slug.js";
export * from "./match-players.js";
export * from "./game-start-countdown.js";

export const OVERLAY_ROUTES = [
  "draft",
  "game",
  "lowerthird",
  "playerstats",
  "herostats",
  "matchup",
  "pause",
  "startingsoon",
  "postgame",
  "sponsors",
  "versus",
  "replay",
  "liveplayercard",
  "rankmedals",
  "standoutplayer",
  "highlights",
  "global_kill_switch",
] as const;

export type OverlayRouteKey = (typeof OVERLAY_ROUTES)[number];

export const visibilityTimedSchema = z.object({
  mode: z.literal("timed"),
  until: z.number(),
});

export const visibilityModeSchema = z.union([
  z.literal("hidden"),
  z.literal("visible"),
  visibilityTimedSchema,
]);

export type VisibilityMode = z.infer<typeof visibilityModeSchema>;

export type OverlayVisibility = Record<
  OverlayRouteKey,
  VisibilityMode | undefined
> & {
  __all__?: VisibilityMode;
};

const teamSeriesSchema = z.object({
  teamA: z.string(),
  teamB: z.string(),
  scoreA: z.number(),
  scoreB: z.number(),
  logoUrlA: z.string().optional(),
  logoUrlB: z.string().optional(),
  /** Series format set in admin (1, 3, or 5) */
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).optional(),
  /** Current game in the series (1-based), set in admin */
  gameNumber: z.number().int().min(1).max(5).optional(),
});

export type TeamSeriesState = z.infer<typeof teamSeriesSchema>;

export const rosterPlayerSchema = z.object({
  steam32: z.number(),
  displayName: z.string(),
  teamName: z.string().optional(),
  teamKey: z.string().optional(),
  /** Brand hex from roster CSV (e.g. `#1e4d8c`) */
  teamColor: z.string().optional(),
  /** Steam avatar; optional CSV column or filled from OpenDota on roster upload */
  avatarUrl: z.string().optional(),
  /** @deprecated use leagueConfig.matchSetup instead */
  side: z.enum(["radiant", "dire", "A", "B"]).optional(),
  /** Preferred roles synced from BPC League */
  roles: z.array(z.string()).optional(),
  /** Player MMR from BPCL API for dynamic rank medals */
  mmr: z.number().optional(),
  /** BPC ID from the BPCL network */
  bpcId: z.string().optional(),
});

export type RosterPlayer = z.infer<typeof rosterPlayerSchema>;

/** Shown on the left of the draft overlay title bar */
export const BROADCAST_LEAGUE_TITLE = "BPC League Season 2";

/** Derive a human-readable league title from a seasonSlug (e.g. "season-2" → "BPC League Season 2") */
export function leagueTitleFromSlug(slug?: string): string {
  if (!slug) return BROADCAST_LEAGUE_TITLE;
  const match = /season[- _](\d+)/i.exec(slug);
  if (match) return `BPC League Season ${match[1]}`;
  return BROADCAST_LEAGUE_TITLE;
}

export const pickPlayersSchema = z.object({
  radiant: z.array(z.number().nullable()).length(5).optional(),
  dire: z.array(z.number().nullable()).length(5).optional(),
});

export type PickPlayers = z.infer<typeof pickPlayersSchema>;

export const matchSetupSchema = z.object({
  radiantTeamKey: z.string(),
  direTeamKey: z.string(),
  seriesBestOf: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
  seriesGame: z.number().int().min(1).max(5).default(1),
  scoreA: z.number().int().min(0).default(0),
  scoreB: z.number().int().min(0).default(0),
  /** Right side of draft title bar (e.g. "Quarter finals 1") */
  stageLabel: z.string().optional(),
  /** Manual steam32 assignment per CM pick slot (0–4), set in admin */
  pickPlayers: pickPlayersSchema.optional(),
  /** Custom text per player (steam32) displayed during draft */
  playerMemes: z.record(z.string(), z.string()).optional(),
  previousDrafts: z.array(z.lazy(() => draftStateSchema)).optional(),
});

export type MatchSetup = z.infer<typeof matchSetupSchema>;

export const leagueConfigSchema = z.object({
  leagueId: z.number().nullable(),
  leagueIds: z.array(z.number()).optional(),
  seasonSlug: z.string().optional(),
  roster: z.array(rosterPlayerSchema).default([]),
  matchSetup: matchSetupSchema.nullable().optional(),
  /** Brand colors keyed by CSV `teamKey` (hex, e.g. `#1e4d8c`) */
  teamColors: z.record(z.string(), z.string()).optional(),
  aggregatedAt: z.string().optional(),
  aggregationStatus: z
    .enum(["idle", "running", "ready", "error"])
    .default("idle"),
  aggregationProgress: z.number().min(0).max(100).optional(),
  aggregationError: z.string().optional(),
  aggregationMatchTotal: z.number().optional(),
  aggregationMatchDone: z.number().optional(),
  /** Where stats were last loaded from */
  aggregationSource: z.enum(["csv", "api"]).optional(),
  statsCsvDir: z.string().optional(),
  overlayStatsMode: z.enum(["current_season", "lifetime"]).default("current_season"),
});

export type LeagueConfig = z.infer<typeof leagueConfigSchema>;

export const tournamentHeroAggregateSchema = z.object({
  heroId: z.number(),
  heroName: z.string().optional(),
  picks: z.number().default(0),
  bans: z.number().default(0),
  wins: z.number().default(0),
  losses: z.number().default(0),
  games: z.number().default(0),
  pickRate: z.number().optional(),
  banRate: z.number().optional(),
  winRate: z.number().optional(),
  contestRate: z.number().optional(),
});

export type TournamentHeroAggregate = z.infer<
  typeof tournamentHeroAggregateSchema
>;

/** League CSV player×hero aggregate (keyed `${steam32}:${heroId}` in overlay state). */
export const playerHeroLeagueStatsSchema = z.object({
  games: z.number(),
  wins: z.number(),
  winRate: z.number(),
  avgKills: z.number(),
  avgDeaths: z.number(),
  avgAssists: z.number(),
  avgKda: z.number(),
  maxKills: z.number(),
  avgHeroDamage: z.number(),
  avgGpm: z.number(),
  avgLastHits: z.number(),
  /** Lane phase W/D/L in league (EFF@10 vs lane opponent) */
  laneWins: z.number().optional(),
  laneDraws: z.number().optional(),
  laneLosses: z.number().optional(),
});

export type PlayerHeroLeagueStats = z.infer<typeof playerHeroLeagueStatsSchema>;

export const statSlideSchema = z.object({
  label: z.string(),
  value: z.string(),
  sublabel: z.string().optional(),
});

export type StatSlide = z.infer<typeof statSlideSchema>;

export const statCarouselSchema = z.object({
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  playerLabel: z.string().optional(),
  slides: z.array(statSlideSchema),
  activeIndex: z.number().nonnegative().default(0),
  slideDurationMs: z.number().positive().default(4000),
  startedAt: z.number(),
});

export type StatCarouselState = z.infer<typeof statCarouselSchema>;

export const overlayLayoutSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  inwardCut: z.boolean().optional(),
});

export type OverlayLayout = z.infer<typeof overlayLayoutSchema>;

export const productionSettingsSchema = z.object({
  gsiManualOverride: z.boolean().default(false),
  autoShowStatsOnPick: z.boolean().default(false),
  gsiLastSeen: z.string().optional(),
  gsiConnected: z.boolean().optional(),
  /** When true, matchSetup pickPlayers are shown on overlay draft UI */
  playerMappingPublished: z.boolean().default(false),
  /** Increment to clear overlay draft reveal queue (OBS cache reset) */
  overlayDraftEpoch: z.number().optional(),
  layoutConfig: z.object({
    minimapIcons: overlayLayoutSchema.optional(),
    livePlayerCard: overlayLayoutSchema.optional(),
    kdaCard: overlayLayoutSchema.optional(),
  }).optional(),
});

export type ProductionSettings = z.infer<typeof productionSettingsSchema>;

const draftPickSlotSchema = z.object({
  team: z.enum(["A", "B"]),
  heroId: z.number().nullable(),
  player: z.string().optional(),
  isBan: z.boolean().optional(),
  order: z.number().optional(),
  heroName: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
});

export const draftSlotSchema = z.object({
  order: z.number(),
  type: z.enum(["pick", "ban"]),
  heroId: z.number().nullable(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  /** Steam CDN render WebM for draft pick cards */
  heroPortraitAnimatedUrl: z.string().optional(),
  playerName: z.string().optional(),
  /** Steam account id (32-bit) for roster CSV lookup */
  steam32: z.number().optional(),
});

export type DraftSlot = z.infer<typeof draftSlotSchema>;

export const draftTeamSideSchema = z.object({
  name: z.string(),
  logoUrl: z.string().optional(),
  /** Team brand color (hex) for overlay highlights */
  color: z.string().optional(),
  slots: z.array(draftSlotSchema).optional(),
  bonusTime: z.number().optional(),
});

export const lastPickSchema = z.object({
  side: z.enum(["radiant", "dire", "A", "B"]),
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  playerName: z.string().optional(),
});

export type LastPick = z.infer<typeof lastPickSchema>;

export const draftStateSchema = z.object({
  series: teamSeriesSchema,
  side: z.enum(["radiant_first_pick", "dire_first_pick"]),
  phase: z.enum(["starting", "bans", "picks", "done", "paused"]),
  gameState: z.string().optional(),
  reserveSeconds: z.number().nonnegative(),
  picksBansOrder: z.array(draftPickSlotSchema).optional(),
  source: z.enum(["manual", "gsi"]).optional(),
  activeTeam: z.enum(["radiant", "dire"]).nullable().optional(),
  turnAction: z.enum(["pick", "ban"]).optional(),
  /** Strategy / pre-draft countdown before bans & picks (GSI clock_time). */
  startSecondsRemaining: z.number().optional(),
  turnSecondsRemaining: z.number().optional(),
  radiant: draftTeamSideSchema.optional(),
  dire: draftTeamSideSchema.optional(),
  lastPick: lastPickSchema.optional(),
});

export type DraftState = z.infer<typeof draftStateSchema>;

export const lowerThirdStateSchema = z.object({
  headline: z.string(),
  subtitle: z.string().optional(),
  accent: z.string().optional(),
});

export type LowerThirdState = z.infer<typeof lowerThirdStateSchema>;

export const replaySchema = z.object({
  match: z.number(),
  replayId: z.number(),
  file: z.string(),
  favorite: z.boolean(),
  duration: z.number(),
  filename: z.string(),
});

export type Replay = z.infer<typeof replaySchema>;

export const replayStateSchema = z.object({
  currentMatch: z.number(),
  lastCompletedMatch: z.number(),
  replays: z.array(replaySchema),
});

export type ReplayState = z.infer<typeof replayStateSchema>;

export const standoutPlayerCardSchema = z.object({
  /** Player display name */
  playerLabel: z.string(),
  heroId: z.number().optional(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  steam32: z.number().optional(),
  bpcId: z.string().optional(),
  // ── Left column ──────────────────────────────────────────────────────────
  xpm: z.number(),
  gpm: z.number(),
  networth: z.number(),
  /** OpenDota ability IDs for base skills (4–6, no innate).  Used to render
   *  skill icons from the Dota 2 CDN. */
  abilityIds: z.array(z.number()).optional(),
  // ── Center column ────────────────────────────────────────────────────────
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
  // ── Right column ─────────────────────────────────────────────────────────
  heroDamage: z.number(),
  lastHits: z.number(),
  /** Total team kills — used client-side to compute kill participation % */
  teamKills: z.number(),
  /** 10-slot item id array: indices 0-5 = main inventory, 6 = neutral,
   *  7-9 = backpack.  Use 0 for empty slots. */
  items: z.array(z.number()).length(10).optional(),
  hasScepter: z.boolean().optional(),
  hasShard: z.boolean().optional(),
});

export type StandoutPlayerCard = z.infer<typeof standoutPlayerCardSchema>;

export const playerStatsCardSchema = z.object({
  steam32: z.number().optional(),
  playerLabel: z.string(),
  heroId: z.number().optional(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  statLines: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

export type PlayerStatsCard = z.infer<typeof playerStatsCardSchema>;

export const heroStatsSliceSchema = z.object({
  pickRate: z.number().optional(),
  winRate: z.number().optional(),
  contestRate: z.number().optional(),
  banRate: z.number().optional(),
  picks: z.number().optional(),
  bans: z.number().optional(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  games: z.number().optional(),
});

export const heroStatsCardKindSchema = z.enum([
  "player-league",
  "player-hero",
  "tournament-hero",
]);

export type HeroStatsCardKind = z.infer<typeof heroStatsCardKindSchema>;

export const heroStatsCardSchema = z.object({
  /** Drives overlay layout; set when composing league stats cards */
  statsCardKind: heroStatsCardKindSchema.optional(),
  steam32: z.number().optional(),
  bpcId: z.string().optional(),
  playerLabel: z.string(),
  heroId: z.number(),
  heroName: z.string().optional(),
  heroPortraitSlug: z.string().optional(),
  heroPortraitUrl: z.string().optional(),
  /** Steam profile picture when showing player league stats */
  playerAvatarUrl: z.string().optional(),
  /** Team logo watermark for league-aggregate player cards (`/teams/{teamKey}.png`) */
  teamLogoUrl: z.string().optional(),
  /** Brand hex from roster for league-aggregate theming */
  teamColor: z.string().optional(),
  tournament: heroStatsSliceSchema.optional(),
  playerHero: z
    .object({
      games: z.number().optional(),
      wins: z.number().optional(),
      losses: z.number().optional(),
      winRate: z.number().optional(),
      avgKills: z.number().optional(),
      avgDeaths: z.number().optional(),
      avgAssists: z.number().optional(),
      avgKda: z.number().optional(),
      maxKills: z.number().optional(),
      avgHeroDamage: z.number().optional(),
      avgGpm: z.number().optional(),
      avgLastHits: z.number().optional(),
    })
    .optional(),
  statSlides: z.array(statSlideSchema).optional(),
  matchup: z.record(z.any()).optional(),
  fetchedAt: z.string(),
  source: z
    .enum(["opendota", "opendota_cached", "stale", "manual", "league"])
    .optional(),
  abilityCount: z.number().optional(),
  /** Live in-game KDA/CS stats populated from GSI while livePlayerCard is active */
  liveKills: z.number().optional(),
  liveDeaths: z.number().optional(),
  liveAssists: z.number().optional(),
  liveLastHits: z.number().optional(),
  liveDenies: z.number().optional(),
  /** Per-enemy-hero kill counts for the focused player */
  enemyHeroKills: z
    .array(
      z.object({
        heroId: z.number(),
        heroClass: z.string(),
        heroPortraitSlug: z.string().optional(),
        heroPortraitUrl: z.string().optional(),
        kills: z.number(),
      }),
    )
    .optional(),
});

export type HeroStatsCard = z.infer<typeof heroStatsCardSchema>;

export const matchupCardSchema = z.object({
  heroAId: z.number(),
  heroBId: z.number(),
  heroAName: z.string().optional(),
  heroBName: z.string().optional(),
  heroAPortraitSlug: z.string().optional(),
  heroBPortraitSlug: z.string().optional(),
  heroAPortraitUrl: z.string().optional(),
  heroBPortraitUrl: z.string().optional(),
  matchup: z.record(z.any()).optional(),
  statLines: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  fetchedAt: z.string(),
  source: z
    .enum(["opendota", "opendota_cached", "stale", "manual", "league"])
    .optional(),
});

export type MatchupCard = z.infer<typeof matchupCardSchema>;

export const sponsorRotationStateSchema = z.object({
  banners: z.array(
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      imageUrl: z.string().optional(),
      durationSeconds: z.number().positive(),
      isCoSponsor: z.boolean().optional(),
      color: z.string().optional(),
    }),
  ),
  activeIndex: z.number().nonnegative(),
  startedAt: z.number().optional(),
});

export type SponsorRotationState = z.infer<
  typeof sponsorRotationStateSchema
>;

export const broadcastTimersSchema = z.object({
  pauseMessage: z.string().optional(),
  startingSoonEta: z.string().optional(),
  postgameNotes: z.string().optional(),
  gameStartCountdown: gameStartCountdownSchema.optional(),
});

export type BroadcastTimers = z.infer<typeof broadcastTimersSchema>;

export const obsRemoteHintsSchema = z.object({
  desiredSceneName: z.string().optional(),
  overlaySceneCollection: z.string().optional(),
  lastCorrelationId: z.string().optional(),
});

export type OBSRemoteHints = z.infer<typeof obsRemoteHintsSchema>;

export const minimapStateSchema = z.object({
  roshanState: z.string().optional(),
  roshanRespawnTimer: z.coerce.number().optional(),
  tormentorRadiant: z.string().optional(),
  tormentorRadiantRespawnTimer: z.coerce.number().optional(),
  tormentorDire: z.string().optional(),
  tormentorDireRespawnTimer: z.coerce.number().optional(),
  radiantScanActive: z.boolean().optional(),
  radiantScanCooldown: z.coerce.number().optional(),
  radiantScanCharges: z.coerce.number().optional(),
  direScanActive: z.boolean().optional(),
  direScanCooldown: z.coerce.number().optional(),
  direScanCharges: z.coerce.number().optional(),
  radiantGlyphActive: z.boolean().optional(),
  radiantGlyphCooldown: z.coerce.number().optional(),
  direGlyphActive: z.boolean().optional(),
  direGlyphCooldown: z.coerce.number().optional(),
});

export type MinimapState = z.infer<typeof minimapStateSchema>;

export const overlayEnvelopeSchema = z.object({
  version: z.number(),
  seq: z.number(),
  updatedAt: z.string(),
  overlayVisibility: z.record(visibilityModeSchema).default({}),
  sceneHints: obsRemoteHintsSchema.optional(),
  leagueConfig: leagueConfigSchema.optional(),
  tournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  lifetimeTournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  /** `${steam32}:${heroId}` → league player×hero stats from CSV */
  playerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  lifetimePlayerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  production: productionSettingsSchema.optional(),
  statCarousel: statCarouselSchema.nullable().optional(),
  draft: draftStateSchema.nullable().optional(),
  lowerThirds: lowerThirdStateSchema.nullable().optional(),
  playerStatsCard: playerStatsCardSchema.nullable().optional(),
  heroStatsCard: heroStatsCardSchema.nullable().optional(),
  livePlayerCard: heroStatsCardSchema.nullable().optional(),
  matchupCard: matchupCardSchema.nullable().optional(),
  sponsor: sponsorRotationStateSchema.nullable().optional(),
  timers: broadcastTimersSchema.optional(),
  minimapState: minimapStateSchema.optional(),
  standoutPlayerCard: standoutPlayerCardSchema.nullable().optional(),
});

export type OverlayEnvelope = z.infer<typeof overlayEnvelopeSchema>;

export const overlayPatchSchema = z.object({
  overlayVisibility: z.record(visibilityModeSchema).optional(),
  leagueConfig: leagueConfigSchema.partial().optional(),
  tournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  lifetimeTournamentHeroIndex: z.record(tournamentHeroAggregateSchema).optional(),
  playerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  lifetimePlayerHeroIndex: z.record(playerHeroLeagueStatsSchema).optional(),
  production: productionSettingsSchema.partial().optional(),
  minimapState: minimapStateSchema.partial().optional(),
  statCarousel: z
    .union([statCarouselSchema, statCarouselSchema.partial(), z.null()])
    .optional(),
  draft: z
    .union([draftStateSchema, draftStateSchema.partial(), z.null()])
    .optional(),
  lowerThirds: z
    .union([lowerThirdStateSchema, lowerThirdStateSchema.partial(), z.null()])
    .optional(),
  playerStatsCard: z
    .union([playerStatsCardSchema, playerStatsCardSchema.partial(), z.null()])
    .optional(),
  heroStatsCard: z
    .union([heroStatsCardSchema, heroStatsCardSchema.partial(), z.null()])
    .optional(),
  livePlayerCard: z
    .union([heroStatsCardSchema, heroStatsCardSchema.partial(), z.null()])
    .optional(),
  matchupCard: z
    .union([matchupCardSchema, matchupCardSchema.partial(), z.null()])
    .optional(),
  sponsor: z
    .union([
      sponsorRotationStateSchema,
      sponsorRotationStateSchema.partial(),
      z.null(),
    ])
    .optional(),
  timers: z
    .object({
      pauseMessage: z.string().optional(),
      startingSoonEta: z.string().optional(),
      postgameNotes: z.string().optional(),
      gameStartCountdown: gameStartCountdownPatchSchema.optional(),
    })
    .partial()
    .optional(),
  sceneHints: obsRemoteHintsSchema.partial().optional(),
  standoutPlayerCard: z
    .union([
      standoutPlayerCardSchema,
      standoutPlayerCardSchema.partial(),
      z.null(),
    ])
    .optional(),
});

export type OverlayPatch = z.infer<typeof overlayPatchSchema>;

export function defaultOverlayVisibility(): OverlayVisibility {
  const v = {} as OverlayVisibility;
  for (const key of OVERLAY_ROUTES) {
    v[key] = key === "game" ? "visible" : "hidden";
  }
  v.global_kill_switch = "visible";
  return v;
}

export function defaultLeagueConfig(): LeagueConfig {
  return {
    leagueId: null,
    leagueIds: [],
    overlayStatsMode: "lifetime",
    roster: [],
    matchSetup: null,
    teamColors: {},
    aggregationStatus: "idle",
  };
}

export function createDefaultEnvelope(): OverlayEnvelope {
  const now = new Date().toISOString();
  return {
    version: 2,
    seq: 0,
    updatedAt: now,
    overlayVisibility: defaultOverlayVisibility() as unknown as Record<
      string,
      VisibilityMode
    >,
    sceneHints: {},
    leagueConfig: defaultLeagueConfig(),
    tournamentHeroIndex: {},
    playerHeroIndex: {},
    production: {
      gsiManualOverride: false,
      autoShowStatsOnPick: false,
      gsiConnected: false,
      playerMappingPublished: false,
      overlayDraftEpoch: 0,
    },
    statCarousel: null,
    draft: null,
    lowerThirds: null,
    playerStatsCard: null,
    heroStatsCard: null,
    livePlayerCard: null,
    matchupCard: null,
    sponsor: null,
    timers: {},
    minimapState: {},
    standoutPlayerCard: null,
  };
}

export * from "./league-player-stats.js";

export const SOCKET_EVENTS = {
  STATE_FULL: "state:full",
  STATE_PATCH: "state:patch",
  ACK: "ack",
  ERR: "err",
  CMD_OBS: "cmd:obs",
} as const;

export const NAMESPACES = {
  PRODUCER: "/producer",
  OVERLAY: "/overlay",
} as const;

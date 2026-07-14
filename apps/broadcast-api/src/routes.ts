import {
  buildPausedGameStartCountdown,
  buildRunningGameStartCountdown,
  DEFAULT_GAME_START_LABEL,
  gameStartCountdownRemaining,
  leaguePlayerHeroFromIndex,
  NAMESPACES,
  SOCKET_EVENTS,
  createDefaultEnvelope,
  type OverlayEnvelope,
  type OverlayPatch,
} from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import express from "express";
import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import type { Server as IOServer } from "socket.io";
import { z } from "zod";
import { requireBroadcastAuth } from "./auth-middleware.js";
import { logger } from "./logger.js";
import type { OBSController } from "./obs-controller.js";
import type { OpenDotaClient } from "./opendota-client.js";
import { parseOverlayPatch } from "./state-setup.js";
import { ReplayManager } from "./services/replay-manager.js";
import { env } from "./env.js";
import { autoSetupOBS } from "./services/obs-setup-service.js";
import { rankMvpCandidates, DEFAULT_MVP_WEIGHTS, type MvpWeights } from "./services/mvp-scorer.js";
import {
  ensureHeroRegistry,
  heroPortraitFieldsForHero,
  findRosterPlayer,
  heroDisplayName,
} from "./services/hero-registry.js";
import { getBountyStats } from "./gsi/routes.js";
import { leagueTitleFromSlug } from "@bpc/shared-types";


export type BroadcastFns = {
  broadcastFull(envelope?: OverlayEnvelope): Promise<void>;
};

export function attachRestRoutes(opts: {
  app: Express;
  state: StateManager;
  io: IOServer;
  broadcast: BroadcastFns;
  obs: OBSController;
  opendota: OpenDotaClient;
  replayManager: ReplayManager;
}): void {
  const { app, state, io, broadcast, obs, opendota, replayManager } = opts;

  // Serve original replays directly to avoid remuxing
  app.use(
    "/api/replays/media",
    requireBroadcastAuth,
    express.static(env.REPLAY_FOLDER)
  );

  app.get("/health/live", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "broadcast-api",
      /** Bump when deploying; used to confirm apply-player-mapping route is live */
      build: "2026-05-30",
      routes: {
        applyPlayerMapping: "POST /api/match/apply-player-mapping",
        matchSetup: "POST /api/match/setup",
        gameStartTimerStart: "POST /api/timers/game-start/start",
      },
    });
  });

  app.get("/health/ready", async (_req: Request, res: Response) => {
    try {
      await state.getState();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.get("/api/state", requireBroadcastAuth, async (_req, res) => {
    const s = await state.getState();
    res.json(s);
  });

  app.patch("/api/state", requireBroadcastAuth, async (req, res) => {
    try {
      const patch = parseOverlayPatch(req.body) as OverlayPatch;
      const next = await state.patchState(patch);
      await broadcast.broadcastFull(next);
      res.json(next);
    } catch (err) {
      logger.error(err, "state patch failed");
      res.status(400).json({
        error: err instanceof Error ? err.message : "invalid patch",
      });
    }
  });

  app.post("/api/state/reset", requireBroadcastAuth, async (_req, res) => {
    const fresh = createDefaultEnvelope();
    const saved = await state.replaceState(fresh);
    await broadcast.broadcastFull(saved);
    res.json(saved);
  });

  const gameStartTimerBodySchema = z.object({
    seconds: z.number().int().min(0).max(5999),
    label: z.string().optional(),
  });

  async function patchGameStartCountdown(
    countdown: ReturnType<typeof buildRunningGameStartCountdown>,
  ) {
    const next = await state.patchState({
      timers: { gameStartCountdown: countdown },
    });
    await broadcast.broadcastFull(next);
    return next;
  }

  app.post(
    "/api/timers/game-start/start",
    requireBroadcastAuth,
    async (req, res) => {
      const parsed = gameStartTimerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const label = parsed.data.label?.trim() || DEFAULT_GAME_START_LABEL;
      const countdown = buildRunningGameStartCountdown(
        parsed.data.seconds,
        label,
      );
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: next.timers?.gameStartCountdown });
    },
  );

  app.post(
    "/api/timers/game-start/pause",
    requireBroadcastAuth,
    async (req, res) => {
      const snap = await state.getState();
      const prev = snap.timers?.gameStartCountdown;
      const label =
        (typeof req.body?.label === "string" ? req.body.label.trim() : "") ||
        prev?.label ||
        DEFAULT_GAME_START_LABEL;
      const seconds =
        typeof req.body?.seconds === "number"
          ? req.body.seconds
          : gameStartCountdownRemaining(prev);
      const countdown = buildPausedGameStartCountdown(seconds, label);
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: next.timers?.gameStartCountdown });
    },
  );

  app.post(
    "/api/timers/game-start/set",
    requireBroadcastAuth,
    async (req, res) => {
      const parsed = gameStartTimerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const snap = await state.getState();
      const prev = snap.timers?.gameStartCountdown;
      const label = parsed.data.label?.trim() || prev?.label || DEFAULT_GAME_START_LABEL;
      const countdown = prev?.running
        ? buildRunningGameStartCountdown(parsed.data.seconds, label)
        : buildPausedGameStartCountdown(parsed.data.seconds, label);
      const next = await patchGameStartCountdown(countdown);
      res.json({ ok: true, gameStartCountdown: next.timers?.gameStartCountdown });
    },
  );

  const obsCfgSchema = z.object({
    host: z.string(),
    port: z.coerce.number(),
    password: z.string(),
  });

  app.post("/api/obs/config", requireBroadcastAuth, (req, res) => {
    const parsed = obsCfgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    obs.configure(parsed.data);
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:config",
      ok: true,
    });
    res.json({ ok: true });
  });

  app.post("/api/obs/connect", requireBroadcastAuth, async (req, res) => {
    const body = req.body as unknown;
    if (body && typeof body === "object" && Object.keys(body).length) {
      const parsed = obsCfgSchema.safeParse(body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      obs.configure(parsed.data);
    }
    const result = await obs.connect();
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:connect",
      ok: result.ok,
      error: result.error,
    });
    res.json(result);
  });

  app.post("/api/obs/disconnect", requireBroadcastAuth, async (_req, res) => {
    await obs.disconnect();
    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:disconnect",
      ok: true,
    });
    res.json({ ok: true });
  });

  app.post("/api/obs/setup", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      overlayBaseUrl: z.string().url().default("http://127.0.0.1:8080/overlay/"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await autoSetupOBS(obs, parsed.data);
    res.json(result);
  });

  app.get("/api/obs/scenes", requireBroadcastAuth, async (_req, res) => {
    try {
      const scenes = await obs.listScenes();
      res.json({ ok: true, scenes });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/obs/program-scene", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ sceneName: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const result = await obs.setProgramScene(parsed.data.sceneName);

    void io.of(NAMESPACES.PRODUCER).emit(SOCKET_EVENTS.ACK, {
      kind: "obs:setProgramScene",
      ok: result.ok,
      sceneName: parsed.data.sceneName,
      error: result.error,
    });

    await state.patchState({
      sceneHints: { desiredSceneName: parsed.data.sceneName },
    });
    const envelope = await state.getState();
    await broadcast.broadcastFull(envelope);

    res.json(result);
  });

  app.post(
    "/api/obs/scene-source",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        sceneName: z.string(),
        sourceName: z.string(),
        visible: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      const result = await obs.setSourceVisible(parsed.data);
      res.json(result);
    },
  );

  app.post(
    "/api/opendota/heroes/constants",
    requireBroadcastAuth,
    async (_req, res) => {
      const heroes = await opendota.heroesConstants();
      res.json(heroes);
    },
  );

  app.post(
    "/api/opendota/player/:accountId/heroes",
    requireBroadcastAuth,
    async (req, res) => {
      const heroes = await opendota.playerHeroStats(req.params.accountId);
      res.json(heroes);
    },
  );

  app.post(
    "/api/opendota/hero/:heroId/matchups",
    requireBroadcastAuth,
    async (req, res) => {
      const matchups = await opendota.heroMatchups(Number(req.params.heroId));
      res.json(matchups);
    },
  );

  app.post(
    "/api/opendota/matchups/between",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        heroA: z.number(),
        heroB: z.number(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
      const result = await opendota.matchupBetween(
        parsed.data.heroA,
        parsed.data.heroB,
      );
      res.json(result);
    },
  );

  /** Producer-triggered aggregation that writes overlay cards */
  app.post("/api/opendota/compose/hero-card", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      accountId: z.number().optional(),
      heroId: z.number(),
      playerLabel: z.string(),
      persist: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    const leaguePh =
      parsed.data.accountId !== undefined
        ? leaguePlayerHeroFromIndex(
            snap.playerHeroIndex,
            parsed.data.accountId,
            parsed.data.heroId,
          )
        : undefined;

    let source: "league" | "opendota_cached" | "stale" = "league";
    let playerHeroPayload:
      | { games: number; wins: number; losses: number }
      | undefined;

    if (leaguePh && leaguePh.games > 0) {
      playerHeroPayload = {
        games: leaguePh.games,
        wins: leaguePh.wins,
        losses: leaguePh.games - leaguePh.wins,
      };
    } else if (parsed.data.accountId !== undefined) {
      source = "opendota_cached";
      const ph = await opendota.playerHeroStats(parsed.data.accountId);
      if (ph.ok && Array.isArray(ph.data)) {
        const row = ph.data.find(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            (entry as { hero_id?: unknown }).hero_id === parsed.data.heroId,
        ) as { games?: number; win?: number } | undefined;
        if (row && typeof row.games === "number") {
          playerHeroPayload = {
            games: row.games,
            wins: typeof row.win === "number" ? row.win : 0,
            losses:
              row.games -
              (typeof row.win === "number" ? row.win : 0),
          };
        }
      }
      if (!ph.ok) source = "stale";
    }

    const card = {
      playerLabel: parsed.data.playerLabel,
      heroId: parsed.data.heroId,
      playerHero: playerHeroPayload,
      tournament: {},
      matchup: {},
      fetchedAt: new Date().toISOString(),
      source,
    };

    if (parsed.data.persist) {
      const next = await state.patchState({ heroStatsCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }

    return res.json({ ok: true, card });
  });

  /** Pairwise matchup persisted into matchupCard */
  app.post("/api/opendota/compose/matchup-card", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      heroAId: z.number(),
      heroBId: z.number(),
      persist: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const data = await opendota.matchupBetween(
      parsed.data.heroAId,
      parsed.data.heroBId,
    );

    const card = {
      heroAId: parsed.data.heroAId,
      heroBId: parsed.data.heroBId,
      matchup: data.ok ? (data.data as Record<string, unknown>) ?? {} : {},
      fetchedAt: new Date().toISOString(),
      source: data.ok ? ("opendota_cached" as const) : ("stale" as const),
    };

    if (parsed.data.persist) {
      const next = await state.patchState({ matchupCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, upstream: data, matchupCard: card, persisted: next });
    }

    return res.json({ ok: true, upstream: data, matchupCard: card });
  });

  app.post("/api/opendota/cache/clear-memory", requireBroadcastAuth, (_req, res) => {
    opendota.purgeMemory();
    res.json({ ok: true });
  });

  // --- REPLAY CHANNELS AND DATABASE INTERFACES ---
  app.get("/api/replays", requireBroadcastAuth, async (_req, res) => {
    try {
      const data = await replayManager.getReplayState();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/replays/save", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ duration: z.number().nullable().optional() });
    const parsed = schema.safeParse(req.body);
    const duration = parsed.success ? (parsed.data.duration || null) : null;

    const result = await replayManager.triggerSaveReplay(duration, obs);
    res.json(result);
  });

  app.post("/api/replays/next-match", requireBroadcastAuth, async (_req, res) => {
    const result = await replayManager.nextMatch();
    res.json(result);
  });

  app.post("/api/replays/generate-highlights", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ matchId: z.number(), slug: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await replayManager.generateHighlights(parsed.data.matchId, parsed.data.slug);
    res.json(result);
  });

  app.post("/api/obs/push-highlight", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ slug: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const highlightsDir = (env as any).HIGHLIGHTS_FOLDER || path.resolve(process.cwd(), "../../data/highlights");
    const highlightPath = path.join(highlightsDir, `${parsed.data.slug}.mp4`);

    if (!fs.existsSync(highlightPath)) {
      return res.status(404).json({ error: `Highlight file not found: ${highlightPath}` });
    }

    try {
      await obs.setInputSettings("HighlightPlayer", { local_file: highlightPath });
      await obs.restartMediaInput("HighlightPlayer");
      res.json({ ok: true, file: highlightPath });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/replays/hotkey", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ hotkeyName: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await obs.triggerHotkeyByName(parsed.data.hotkeyName);
    res.json(result);
  });

  app.post("/api/replays/hotkey-sequence", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      keyId: z.string(),
      keyModifiers: z.object({
        shift: z.boolean().optional(),
        control: z.boolean().optional(),
        alt: z.boolean().optional(),
        command: z.boolean().optional(),
      }).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await obs.triggerHotkeyBySequence(parsed.data.keyId, parsed.data.keyModifiers || {});
    res.json(result);
  });

  app.post("/api/replays/favorite", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string(), favorite: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const ok = await replayManager.toggleFavorite(parsed.data.file, parsed.data.favorite);
    res.json({ ok });
  });

  app.post("/api/replays/play", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await replayManager.playReplay(parsed.data.file, obs);
    res.json(result);
  });

  app.post("/api/replays/generate-preview", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ file: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await replayManager.generatePreview(parsed.data.file);
    res.json(result);
  });

  // ─── Standout Player / MVP ──────────────────────────────────────────────────

  /**
   * POST /api/standout/compute
   * Fetch a match from OpenDota, run the MVP scorer, and return ranked
   * candidates.  Optionally persists the winner to overlay state.
   *
   * Body: { matchId: number, weights?: MvpWeights, persist?: boolean }
   */
  app.post("/api/standout/compute", requireBroadcastAuth, async (req, res) => {
    const bodySchema = z.object({
      matchId: z.number().int().positive(),
      weights: z
        .object({
          kda:              z.number().optional(),
          killParticipation:z.number().optional(),
          gpm:              z.number().optional(),
          xpm:              z.number().optional(),
          networthShare:    z.number().optional(),
          damagePm:         z.number().optional(),
          healingPm:        z.number().optional(),
          lastHits:         z.number().optional(),
          denies:           z.number().optional(),
          laneEfficiency:   z.number().optional(),
          winBonus:         z.number().optional(),
        })
        .optional(),
      persist: z.boolean().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { matchId, persist } = parsed.data;
    const weights: MvpWeights = { ...DEFAULT_MVP_WEIGHTS, ...(parsed.data.weights ?? {}) };

    // Fetch match detail
    const matchRes = await opendota.matchDetails(matchId);
    if (!matchRes.ok || !matchRes.data) {
      return res.status(502).json({
        error: `OpenDota match fetch failed: ${matchRes.error ?? "no data"}`,
      });
    }

    const match = matchRes.data;

    // Inject match duration into each player for per-minute stats
    if (Array.isArray(match.players) && match.duration) {
      for (const p of match.players) {
        (p as Record<string, unknown>).duration = match.duration;
      }
    }

    // Ensure hero registry is loaded
    await ensureHeroRegistry(opendota);

    // Enrich hero names
    if (Array.isArray(match.players)) {
      for (const p of match.players) {
        if (p.hero_id && !(p as Record<string, unknown>).hero_name) {
          const fields = heroPortraitFieldsForHero(p.hero_id);
          (p as Record<string, unknown>).hero_name = fields.heroPortraitSlug ?? String(p.hero_id);
        }
      }
    }

    // Run scorer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ranked = rankMvpCandidates(match as any, weights);
    const winner = ranked[0];

    if (!winner) {
      return res.status(422).json({ error: "No players found in match" });
    }

    // Build the StandoutPlayerCard payload
    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    const rosterPlayer = winner.accountId
      ? findRosterPlayer(roster, winner.accountId)
      : undefined;

    const portraitFields = winner.heroId
      ? heroPortraitFieldsForHero(winner.heroId, winner.heroName)
      : {};

    const standoutCard = {
      playerLabel: rosterPlayer?.displayName ?? winner.personaname ?? `Player ${winner.accountId ?? "?"}`,
      heroId:      winner.heroId,
      heroName:    winner.heroId ? heroDisplayName(winner.heroId) : winner.heroName,
      steam32:     winner.accountId,
      bpcId:       rosterPlayer?.bpcId,
      ...portraitFields,
      xpm:         winner.raw.xpm,
      gpm:         winner.raw.gpm,
      networth:    winner.raw.networth,
      kills:       winner.raw.kills,
      deaths:      winner.raw.deaths,
      assists:     winner.raw.assists,
      heroDamage:  winner.raw.heroDamage,
      lastHits:    winner.raw.lastHits,
      teamKills:   winner.raw.teamKills,
      items:       winner.raw.items,
      hasScepter:  winner.raw.hasScepter,
      hasShard:    winner.raw.hasShard,
    };

    if (persist) {
      const next = await state.patchState({
        standoutPlayerCard: standoutCard,
        overlayVisibility: { standoutplayer: "visible" },
      });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, winner, ranked, standoutCard, persisted: true });
    }

    return res.json({ ok: true, winner, ranked, standoutCard, persisted: false });
  });

  /**
   * POST /api/standout/push
   * Directly push an already-resolved StandoutPlayerCard to overlay state
   * (e.g. after the producer reviews the auto-selected winner and confirms).
   *
   * Body: { card: StandoutPlayerCard, show?: boolean }
   */
  app.post("/api/standout/push", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      card: z.record(z.unknown()),
      show: z.boolean().optional().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const cardData = parsed.data.card as Record<string, unknown>;
    cardData.heroPortraitSlug = undefined;
    cardData.heroPortraitUrl = undefined;
    
    if (typeof cardData.heroId === "number") {
      const portraitFields = heroPortraitFieldsForHero(
        cardData.heroId,
        typeof cardData.heroName === "string" ? cardData.heroName : undefined
      );
      Object.assign(cardData, portraitFields);
    }

    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    const rosterPlayer = typeof cardData.steam32 === "number"
      ? findRosterPlayer(roster, cardData.steam32)
      : undefined;

    cardData.playerLabel =
      rosterPlayer?.displayName ??
      (typeof cardData.personaname === "string" ? cardData.personaname : undefined) ??
      `Player ${cardData.steam32 ?? "?"}`;
      
    if (rosterPlayer?.bpcId && !cardData.bpcId) {
      cardData.bpcId = rosterPlayer.bpcId;
    }

    const patch: OverlayPatch = {
      standoutPlayerCard: cardData as OverlayPatch["standoutPlayerCard"],
    };
    if (parsed.data.show) {
      patch.overlayVisibility = { standoutplayer: "visible" };
    }

    const next = await state.patchState(patch);
    await broadcast.broadcastFull(next);
    res.json({ ok: true, standoutPlayerCard: next.standoutPlayerCard });
  });

  /**
   * POST /api/standout/hide
   * Hide the standout player overlay without clearing the card data.
   */
  app.post("/api/standout/hide", requireBroadcastAuth, async (_req, res) => {
    const next = await state.patchState({
      overlayVisibility: { standoutplayer: "hidden" },
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true });
  });

  /**
   * POST /api/gsi/bounty-snapshot
   * Reads current accumulated bounty rune stats (tracked live from GSI events),
   * resolves team names from draft/matchSetup state, and emits BOUNTY_STATS
   * to the overlay namespace so the BountyRuneCard component can display it.
   */
  app.post("/api/gsi/bounty-snapshot", requireBroadcastAuth, async (_req, res) => {
    const payload = await emitBountyStats(io, state);
    res.json({ ok: true, ...payload });
  });

  /**
   * POST /api/gsi/wisdom-snapshot
   * Reads current accumulated wisdom rune stats (tracked live from GSI events),
   * resolves team names, and emits WISDOM_STATS to the overlay namespace.
   */
  app.post("/api/gsi/wisdom-snapshot", requireBroadcastAuth, async (_req, res) => {
    const payload = await emitWisdomStats(io, state);
    res.json({ ok: true, ...payload });
  });
}

export async function emitBountyStats(io: IOServer, state: StateManager) {
  const snap = await state.getState();
  const { getBountyStats } = await import("./gsi/routes.js");
  const bounty = getBountyStats();

  const draft = snap.draft;
  const matchSetup = snap.leagueConfig?.matchSetup;
  const seasonSlug = snap.leagueConfig?.seasonSlug;

  const radiantName = draft?.radiant?.name ?? matchSetup?.radiantTeamKey ?? "Radiant";
  const direName = draft?.dire?.name ?? matchSetup?.direTeamKey ?? "Dire";
  const leagueTitle = leagueTitleFromSlug(seasonSlug);

  const payload = {
    leagueTitle,
    radiant: { name: radiantName, count: bounty.radiant.count, gold: bounty.radiant.gold },
    dire: { name: direName, count: bounty.dire.count, gold: bounty.dire.gold },
  };

  io.of(NAMESPACES.OVERLAY).emit("BOUNTY_STATS", payload);
  logger.info(payload, "[bounty] BOUNTY_STATS emitted to overlay");
  return payload;
}

export async function emitWisdomStats(io: IOServer, state: StateManager) {
  const snap = await state.getState();
  const { getWisdomStats } = await import("./gsi/routes.js");
  const wisdom = getWisdomStats();

  const draft = snap.draft;
  const matchSetup = snap.leagueConfig?.matchSetup;
  const seasonSlug = snap.leagueConfig?.seasonSlug;

  const radiantName = draft?.radiant?.name ?? matchSetup?.radiantTeamKey ?? "Radiant";
  const direName = draft?.dire?.name ?? matchSetup?.direTeamKey ?? "Dire";
  const leagueTitle = leagueTitleFromSlug(seasonSlug);

  const payload = {
    leagueTitle,
    radiant: { name: radiantName, count: wisdom.radiant.count, xp: wisdom.radiant.xp },
    dire: { name: direName, count: wisdom.dire.count, xp: wisdom.dire.xp },
  };

  io.of(NAMESPACES.OVERLAY).emit("WISDOM_STATS", payload);
  logger.info(payload, "[wisdom] WISDOM_STATS emitted to overlay");
  return payload;
}

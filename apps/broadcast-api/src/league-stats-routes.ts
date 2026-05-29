import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import { z } from "zod";
import { matchSetupSchema, manualPickSteam32, pickSlotOrderForHero } from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import { requireBroadcastAuth } from "./auth-middleware.js";
import { env } from "./env.js";
import type { OpenDotaClient } from "./opendota-client.js";
import type { BroadcastFns } from "./routes.js";
import {
  bootstrapLeagueFromEnv,
  leagueInfoFromEnv,
  loadLeagueStatsFromCsvFile,
  runLeagueAggregation,
} from "./services/league-bootstrap.js";
import { leagueStatsFileInfo, leagueStatsDir } from "./services/league-stats-store.js";
import {
  assertLeagueStatsReady,
  LeagueStatsNotReadyError,
} from "./services/league-stats-guard.js";
import { parseRosterCsv, teamColorsFromRoster } from "./services/roster-parser.js";
import { listTeamsFromRoster } from "./services/roster-teams.js";
import { draftPatchFromMatchSetup } from "./services/match-setup.js";
import { tournamentAggregator } from "./services/tournament-aggregator.js";
import {
  buildCarouselFromHeroCard,
  buildMatchupCard,
  buildPlayerHeroCard,
  buildPlayerLeagueCard,
  buildTournamentHeroCard,
  findRosterPlayer,
  listHeroesForAdmin,
} from "./services/stats-builder.js";

function leagueStatsError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof LeagueStatsNotReadyError) {
    res.status(503).json({ error: err.message });
    return true;
  }
  return false;
}

export function attachLeagueAndStatsRoutes(opts: {
  app: Express;
  state: StateManager;
  io: IOServer;
  broadcast: BroadcastFns;
  opendota: OpenDotaClient;
}): void {
  const { app, state, broadcast, opendota } = opts;

  app.get("/api/league/info", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    const csvInfo = await leagueStatsFileInfo(env.LEAGUE_ID);
    res.json({
      ...leagueInfoFromEnv(),
      configuredInEnv: true,
      leagueConfig: snap.leagueConfig,
      playerStatsScope: "league_only",
      statsStorage: csvInfo,
      steamApiConfigured: Boolean(env.STEAM_WEB_API_KEY),
      envMatchIdsConfigured: Boolean(env.LEAGUE_MATCH_IDS?.trim()),
    });
  });

  app.post("/api/league/config", requireBroadcastAuth, async (_req, res) => {
    res.status(400).json({
      error: `League ID is set via LEAGUE_ID env (${env.LEAGUE_ID}). Update .env and restart the API.`,
    });
  });

  app.post("/api/league/aggregate", requireBroadcastAuth, async (_req, res) => {
    if (tournamentAggregator.isBusy()) {
      return res.json({ ok: true, started: false, alreadyRunning: true });
    }

    const snap = await state.getState();
    if (snap.leagueConfig?.aggregationStatus === "running") {
      await state.patchState({
        leagueConfig: {
          leagueId: env.LEAGUE_ID,
          aggregationStatus: "idle",
          aggregationError: undefined,
        },
      });
    }

    void runLeagueAggregation({
      leagueId: env.LEAGUE_ID,
      state,
      opendota,
      broadcast,
    });

    res.json({ ok: true, started: true, leagueId: env.LEAGUE_ID });
  });

  app.post(
    "/api/league/stats/reload-csv",
    requireBroadcastAuth,
    async (_req, res) => {
      const ok = await loadLeagueStatsFromCsvFile({
        leagueId: env.LEAGUE_ID,
        state,
        broadcast,
      });
      if (!ok) {
        return res.status(404).json({
          error: `No CSV found for league ${env.LEAGUE_ID}. Run "Fetch from OpenDota" once, or place league_${env.LEAGUE_ID}_heroes.csv in ${leagueStatsDir()}`,
        });
      }
      const snap = await state.getState();
      res.json({ ok: true, leagueConfig: snap.leagueConfig });
    },
  );

  app.get(
    "/api/league/stats/storage",
    requireBroadcastAuth,
    async (_req, res) => {
      const info = await leagueStatsFileInfo(env.LEAGUE_ID);
      const snap = await state.getState();
      res.json({
        ...info,
        statsDir: leagueInfoFromEnv().statsDir,
        aggregationSource: snap.leagueConfig?.aggregationSource,
        aggregatedAt: snap.leagueConfig?.aggregatedAt,
      });
    },
  );

  app.get(
    "/api/league/aggregate/status",
    requireBroadcastAuth,
    async (_req, res) => {
      const prog = tournamentAggregator.getProgress();
      const snap = await state.getState();
      res.json({
        ...prog,
        inMemoryRunning: tournamentAggregator.isBusy(),
        leagueId: env.LEAGUE_ID,
        leagueConfig: snap.leagueConfig,
      });
    },
  );

  app.post("/api/roster/upload", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ csv: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const roster = parseRosterCsv(parsed.data.csv);
    const teamColors = teamColorsFromRoster(roster);
    const next = await state.patchState({
      leagueConfig: { roster, teamColors, leagueId: env.LEAGUE_ID },
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, count: roster.length, teamColors, roster });
  });

  app.get("/api/roster", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    res.json(snap.leagueConfig?.roster ?? []);
  });

  app.get("/api/teams", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    res.json(listTeamsFromRoster(roster));
  });

  app.post("/api/match/setup", requireBroadcastAuth, async (req, res) => {
    const parsed = matchSetupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    if (roster.length === 0) {
      return res.status(400).json({ error: "upload roster first" });
    }

    const { seriesBestOf, seriesGame } = parsed.data;
    if (seriesGame > seriesBestOf) {
      return res.status(400).json({
        error: `Game ${seriesGame} is invalid for a BO${seriesBestOf} series`,
      });
    }

    try {
      const matchSetup = parsed.data;
      const draftSeed = draftPatchFromMatchSetup(
        matchSetup,
        roster,
        snap.draft,
      );
      const next = await state.patchState({
        leagueConfig: { matchSetup },
        draft: draftSeed,
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        matchSetup,
        teams: listTeamsFromRoster(roster),
        draft: next.draft,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/league/team-colors", requireBroadcastAuth, async (_req, res) => {
    res.status(410).json({
      error:
        "Team colors are set from the roster CSV teamColor column. Re-upload roster to change colors.",
    });
  });

  app.get("/api/heroes", requireBroadcastAuth, async (_req, res) => {
    const heroes = await listHeroesForAdmin(opendota);
    res.json(heroes);
  });

  app.post("/api/stats/player-hero", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      steam32: z.number(),
      heroId: z.number(),
      displayName: z.string().optional(),
      persist: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }

    const roster = snap.leagueConfig?.roster ?? [];
    const player =
      findRosterPlayer(roster, parsed.data.steam32) ??
      ({
        steam32: parsed.data.steam32,
        displayName: parsed.data.displayName ?? `Player ${parsed.data.steam32}`,
      } as const);

    const card = await buildPlayerHeroCard(
      opendota,
      parsed.data.steam32,
      parsed.data.heroId,
      player.displayName,
      snap.tournamentHeroIndex ?? {},
    );

    if (parsed.data.persist) {
      const next = await state.patchState({ heroStatsCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });

  app.post("/api/stats/player-league", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      steam32: z.number(),
      displayName: z.string().optional(),
      persist: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }

    const roster = snap.leagueConfig?.roster ?? [];
    const player =
      findRosterPlayer(roster, parsed.data.steam32) ??
      ({
        steam32: parsed.data.steam32,
        displayName: parsed.data.displayName ?? `Player ${parsed.data.steam32}`,
      } as const);

    const card = await buildPlayerLeagueCard(
      opendota,
      parsed.data.steam32,
      player.displayName,
    );

    if (parsed.data.persist) {
      const next = await state.patchState({ heroStatsCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });

  app.post(
    "/api/stats/tournament-hero",
    requireBroadcastAuth,
    async (req, res) => {
      const schema = z.object({
        heroId: z.number(),
        persist: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });

      const snap = await state.getState();
      try {
        assertLeagueStatsReady(snap);
      } catch (err) {
        if (leagueStatsError(res, err)) return;
        throw err;
      }

      const card = await buildTournamentHeroCard(
        opendota,
        parsed.data.heroId,
        snap.tournamentHeroIndex ?? {},
      );

      if (parsed.data.persist) {
        const next = await state.patchState({ heroStatsCard: card });
        await broadcast.broadcastFull(next);
        return res.json({ ok: true, card, persisted: next });
      }
      res.json({ ok: true, card });
    },
  );

  app.post("/api/stats/matchup", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      heroAId: z.number(),
      heroBId: z.number(),
      persist: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const card = await buildMatchupCard(
      opendota,
      parsed.data.heroAId,
      parsed.data.heroBId,
    );

    if (parsed.data.persist) {
      const next = await state.patchState({ matchupCard: card });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, persisted: next });
    }
    res.json({ ok: true, card });
  });

  app.post("/api/stats/carousel", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      type: z.enum(["player-hero", "tournament-hero", "last-pick"]),
      heroId: z.number().optional(),
      steam32: z.number().optional(),
      slideDurationMs: z.number().optional(),
      overlaySeconds: z.number().optional(),
      persist: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    try {
      assertLeagueStatsReady(snap);
    } catch (err) {
      if (leagueStatsError(res, err)) return;
      throw err;
    }

    const roster = snap.leagueConfig?.roster ?? [];
    let card;

    if (parsed.data.type === "last-pick") {
      const lp = snap.draft?.lastPick;
      if (!lp) return res.status(400).json({ error: "no last pick" });
      const side = lp.side === "dire" || lp.side === "B" ? "dire" : "radiant";
      const teamSlots =
        side === "radiant"
          ? snap.draft?.radiant?.slots
          : snap.draft?.dire?.slots;
      const slotOrder = pickSlotOrderForHero(side, lp.heroId, teamSlots);
      const manualSteam32 =
        slotOrder !== undefined
          ? manualPickSteam32(snap.leagueConfig?.matchSetup, side, slotOrder)
          : undefined;
      const player =
        manualSteam32 != null && manualSteam32 > 0
          ? findRosterPlayer(roster, manualSteam32)
          : undefined;

      card =
        player && manualSteam32
          ? await buildPlayerHeroCard(
              opendota,
              manualSteam32,
              lp.heroId,
              player.displayName,
              snap.tournamentHeroIndex ?? {},
            )
          : await buildTournamentHeroCard(
              opendota,
              lp.heroId,
              snap.tournamentHeroIndex ?? {},
            );
    } else if (parsed.data.type === "player-hero") {
      if (parsed.data.heroId === undefined || parsed.data.steam32 === undefined)
        return res.status(400).json({ error: "steam32 and heroId required" });
      const player = findRosterPlayer(roster, parsed.data.steam32);
      card = await buildPlayerHeroCard(
        opendota,
        parsed.data.steam32,
        parsed.data.heroId,
        player?.displayName ?? "Player",
        snap.tournamentHeroIndex ?? {},
      );
    } else {
      if (parsed.data.heroId === undefined)
        return res.status(400).json({ error: "heroId required" });
      card = await buildTournamentHeroCard(
        opendota,
        parsed.data.heroId,
        snap.tournamentHeroIndex ?? {},
      );
    }

    const carousel = buildCarouselFromHeroCard(
      card,
      parsed.data.slideDurationMs ?? 4000,
    );
    const until =
      Date.now() + (parsed.data.overlaySeconds ?? 12) * 1000;

    if (parsed.data.persist !== false) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: carousel,
        overlayVisibility: {
          herostats: { mode: "timed", until },
        },
      });
      await broadcast.broadcastFull(next);
      return res.json({ ok: true, card, carousel, persisted: next });
    }
    res.json({ ok: true, card, carousel });
  });

  app.post("/api/stats/stop", requireBroadcastAuth, async (_req, res) => {
    const next = await state.patchState({
      statCarousel: null,
      heroStatsCard: null,
      overlayVisibility: {
        herostats: "hidden",
      },
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, persisted: next });
  });

  app.post("/api/production/settings", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      autoShowStatsOnPick: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const next = await state.patchState({ production: parsed.data });
    await broadcast.broadcastFull(next);
    res.json(next.production);
  });
}

export { bootstrapLeagueFromEnv };

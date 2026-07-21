import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger.js";
import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import { z } from "zod";
import {
  matchSetupSchema,
  manualPickSteam32,
  pickPlayersSchema,
  pickSlotOrderForHero,
} from "@bpc/shared-types";
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
import {
  leagueStatsDir,
  leagueStatsFileInfo,
  aggregatePlayerLeagueFromIndex,
  summarizePlayerLeagueFromIndex,
  leagueStatsCsvLoadFailedPayload,
  leagueStatsCsvMissingPayload,
} from "./services/league-stats-store.js";
import {
  assertLeagueStatsReady,
  LeagueStatsNotReadyError,
} from "./services/league-stats-guard.js";
import { parseRosterCsv, parseRosterCsvAsync, teamColorsFromRoster, serializeRosterCsv } from "./services/roster-parser.js";
import { parseSteamIdentifierSync, isSteamProfileUrl, resolveSteamProfileToSteam32 } from "./services/steam32-resolver.js";
import type { RosterPlayer } from "@bpc/shared-types";
import { listTeamsFromRoster } from "./services/roster-teams.js";
import {
  applyPickPlayersToDraft,
  draftPatchFromMatchSetup,
} from "./services/match-setup.js";
import { enrichRosterAvatars } from "./services/steam-profile.js";
import { fetchRosterFromBpcLeague, fetchMatchesFromBpcLeague, fetchSeasonsFromBpcLeague, fetchSeasonConfigFromBpcLeague, fetchActiveSeasonSlug } from "./services/bpcleague-sync.js";
import { tournamentAggregator } from "./services/tournament-aggregator.js";
import { globalLatestGsiPayload } from "./gsi/routes.js";
import { autopilotManager } from "./services/autopilot.js";
import { appendMatchLog } from "./services/cast-log.js";
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
  const { app, state, broadcast, opendota, io } = opts;

  // Initialize and configure autopilot
  autopilotManager.configure({}, { state, opendota, broadcast });

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

  app.post("/api/league/config", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ 
      leagueId: z.number().optional(),
      leagueIds: z.array(z.number()).optional(),
      overlayStatsMode: z.enum(["current_season", "lifetime"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }
    const snap = await state.getState();
    const next = await state.patchState({
      leagueConfig: { 
        ...snap.leagueConfig, 
        ...(parsed.data.leagueId != null ? { leagueId: parsed.data.leagueId } : 
           (parsed.data.leagueIds != null && parsed.data.leagueIds.length > 0 
             ? { leagueId: parsed.data.leagueIds[parsed.data.leagueIds.length - 1] } 
             : {})),
        ...(parsed.data.leagueIds != null ? { leagueIds: parsed.data.leagueIds } : {}),
        ...(parsed.data.overlayStatsMode != null ? { overlayStatsMode: parsed.data.overlayStatsMode } : {}),
      },
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, leagueConfig: next.leagueConfig });
  });

  app.post("/api/league/aggregate", requireBroadcastAuth, async (_req, res) => {
    if (tournamentAggregator.isBusy()) {
      return res.json({ ok: true, started: false, alreadyRunning: true });
    }

    const snap = await state.getState();
    if (snap.leagueConfig?.aggregationStatus === "running") {
      await state.patchState({
        leagueConfig: {
          aggregationStatus: "idle",
          aggregationError: undefined,
        },
      });
    }

    void runLeagueAggregation({
      leagueId: snap.leagueConfig?.leagueId ?? env.LEAGUE_ID,
      leagueIds: snap.leagueConfig?.leagueIds,
      state,
      opendota,
      broadcast,
    });

    res.json({ ok: true, started: true, leagueId: snap.leagueConfig?.leagueId ?? env.LEAGUE_ID });
  });

  app.post(
    "/api/league/stats/reload-csv",
    requireBroadcastAuth,
    async (_req, res) => {
      const snapConfigId = (await state.getState()).leagueConfig?.leagueId;
      const ok = await loadLeagueStatsFromCsvFile({
        leagueId: snapConfigId ?? env.LEAGUE_ID,
        state,
        broadcast,
      });
      if (!ok) {
        const csvInfo = await leagueStatsFileInfo(snapConfigId ?? env.LEAGUE_ID);
        const payload = csvInfo.heroesExists
          ? leagueStatsCsvLoadFailedPayload(snapConfigId ?? env.LEAGUE_ID, csvInfo)
          : { ...leagueStatsCsvMissingPayload(snapConfigId ?? env.LEAGUE_ID), statsStorage: csvInfo };
        return res.status(422).json(payload);
      }
      const snap = await state.getState();
      res.json({ ok: true, leagueConfig: snap.leagueConfig });
    },
  );

  app.get(
    "/api/league/stats/storage",
    requireBroadcastAuth,
    async (_req, res) => {
      const snap = await state.getState();
      const configId = snap.leagueConfig?.leagueId ?? env.LEAGUE_ID;
      const info = await leagueStatsFileInfo(configId);

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
        leagueId: snap.leagueConfig?.leagueId ?? env.LEAGUE_ID,
        leagueConfig: snap.leagueConfig,
      });
    },
  );

  app.post("/api/roster/upload", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ csv: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const parsedRoster = await parseRosterCsvAsync(parsed.data.csv);
    const roster = await enrichRosterAvatars(parsedRoster, opendota);
    const teamColors = teamColorsFromRoster(roster);
    const configId = (await state.getState()).leagueConfig?.leagueId ?? env.LEAGUE_ID;
    const next = await state.patchState({
      leagueConfig: { roster, teamColors, leagueId: configId },
    });
    await broadcast.broadcastFull(next);
    res.json({ ok: true, count: roster.length, teamColors, roster });
  });

  app.post("/api/roster/sync-bpcleague", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({ seasonSlug: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    try {
      // Auto-detect active season if not provided
      const seasonSlug = parsed.data.seasonSlug
        ? parsed.data.seasonSlug.trim().toLowerCase()
        : await fetchActiveSeasonSlug();

      const rawRoster = await fetchRosterFromBpcLeague({
        seasonSlug,
        steamApiKey: env.STEAM_WEB_API_KEY,
      });

      // Preserve existing manual avatars from the CSV before enriching
      const rosterCsvPath = env.ROSTER_CSV_PATH;
      try {
        const existingCsv = await readFile(rosterCsvPath, "utf8");
        const existingRoster = parseRosterCsv(existingCsv);
        for (const player of rawRoster) {
          const existing = existingRoster.find(p => p.steam32 === player.steam32);
          if (existing && existing.avatarUrl) {
            player.avatarUrl = existing.avatarUrl;
          }
        }
      } catch (err) {
        // Ignore if file doesn't exist
      }

      const roster = await enrichRosterAvatars(rawRoster, opendota);
      const teamColors = teamColorsFromRoster(roster);

      // Save the generic "active" roster CSV (used by the API at startup)
      const csvPath = env.ROSTER_CSV_PATH;
      await mkdir(path.dirname(csvPath), { recursive: true });
      const csvContent = serializeRosterCsv(roster);
      await writeFile(csvPath, csvContent, "utf8");

      // Also save a season-named CSV to the Documents handoff folder
      // so any caster can pick it up later
      try {
        const { saveSeasonRosterCsv } = await import("./services/cast-log.js");
        await saveSeasonRosterCsv(seasonSlug, csvContent);
      } catch (logErr) {
        logger.warn({ logErr }, "[roster-sync] Failed to save season roster CSV to Documents (non-fatal)");
      }

      // Fetch Season Config for sponsors
      const seasonConfig = await fetchSeasonConfigFromBpcLeague(seasonSlug);
      let fetchedBanners: any[] = [];
      if (seasonConfig && seasonConfig.sponsorsConfig && Array.isArray(seasonConfig.sponsorsConfig.sponsors)) {
        fetchedBanners = seasonConfig.sponsorsConfig.sponsors.map((s: any) => ({
          title: s.title || s.name || "",
          subtitle: s.subtitle || "",
          imageUrl: s.imageUrl || s.logoUrl || s.logo || "",
          color: s.color || "#ffffff",
          isCoSponsor: s.isCoSponsor || false,
        }));
      }

      if (fetchedBanners.length === 0) {
        fetchedBanners = [
          { title: "BPC", subtitle: "Gaming", isCoSponsor: true, color: "#ffffff", imageUrl: "" },
          { title: "KRAFTon", subtitle: "Sponsor", isCoSponsor: false, color: "#ff0000", imageUrl: "" }
        ];
      }

      const snap = await state.getState();
      const configId = snap.leagueConfig?.leagueId ?? env.LEAGUE_ID;
      const next = await state.patchState({
        leagueConfig: { roster, teamColors, leagueId: configId, seasonSlug },
        sponsor: { banners: fetchedBanners, activeIndex: snap.sponsor?.activeIndex ?? 0 }
      });
      await broadcast.broadcastFull(next);

      res.json({
        ok: true,
        count: roster.length,
        seasonSlug,
        teamColors,
        teams: [...new Set(roster.map((p) => p.teamName).filter(Boolean))],
        roster,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal Server Error during sync",
      });
    }
  });

  app.get("/api/roster", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    res.json(snap.leagueConfig?.roster ?? []);
  });

  app.post("/api/roster/upsert-player", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      steam32: z.string().min(1), // accepts a bare steam32/steam64 id OR a steam profile URL
      displayName: z.string().min(1),
      teamKey: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const { steam32: rawSteamInput, displayName, teamKey } = parsed.data;

    // Reuse the same resolver the CSV upload path uses — handles bare ids,
    // /profiles/<id> URLs (sync), and /id/<vanity> URLs (Steam API lookup).
    let steam32 = parseSteamIdentifierSync(rawSteamInput);
    if (steam32 === null && isSteamProfileUrl(rawSteamInput)) {
      steam32 = await resolveSteamProfileToSteam32(rawSteamInput);
    }
    if (steam32 === null) {
      return res.status(400).json({
        error: "Could not resolve a Steam32 ID from the given value. Paste a valid Steam32 ID, Steam64 ID, or steamcommunity.com profile URL.",
      });
    }

    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];

    const existing = findRosterPlayer(roster, steam32);
    // teamColors is Record<string, string> (teamKey → hex) — teamName comes from
    // the existing roster entry or falls back to the raw teamKey.
    const teamName = existing?.teamName ?? teamKey;

    const upserted: RosterPlayer = {
      ...existing,
      steam32,
      displayName,
      teamKey,
      teamName,
    };

    const nextRoster = existing
      ? roster.map((p) => (p.steam32 === steam32 ? upserted : p))
      : [...roster, upserted];

    const next = await state.patchState({
      leagueConfig: { ...snap.leagueConfig, roster: nextRoster },
    });
    await broadcast.broadcastFull(next);

    res.json({ ok: true, player: upserted });
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
      const matchSetup = { ...parsed.data };
      const currentMatchSetup = snap.leagueConfig?.matchSetup;
      
      // Carry over previousDrafts if not explicitly provided
      if (!matchSetup.previousDrafts && currentMatchSetup?.previousDrafts) {
        matchSetup.previousDrafts = [...currentMatchSetup.previousDrafts];
      }

      // If seriesGame increased, snapshot the current draft
      if (
        currentMatchSetup &&
        matchSetup.seriesGame > currentMatchSetup.seriesGame &&
        snap.draft
      ) {
        matchSetup.previousDrafts = matchSetup.previousDrafts ?? [];
        matchSetup.previousDrafts.push(snap.draft);
      }
      
      // If series reset to 1, clear previous drafts
      if (matchSetup.seriesGame === 1) {
        matchSetup.previousDrafts = [];
      }

      const draftSeed = draftPatchFromMatchSetup(
        matchSetup,
        roster,
        snap.draft,
      );
      const next = await state.patchState({
        leagueConfig: { matchSetup },
        draft: draftSeed,
        production: {
          playerMappingPublished: false,
        },
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

  // ── Cast log endpoints ─────────────────────────────────────────────────
  // POST /api/match/log — log a completed match (auto-detects season from state)
  app.post("/api/match/log", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      matchId:    z.union([z.number(), z.string()]).default(0),
      team1:      z.string().min(1),
      team2:      z.string().min(1),
      winner:     z.string().nullable().default(null),
      seriesType: z.string().default("bo1"),
      stageKey:   z.string().optional(),
      castedBy:   z.string().optional(),
      replayFile: z.string().optional(),
      notes:      z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const snap = await state.getState();
    const seasonSlug = snap.leagueConfig?.seasonSlug ?? await fetchActiveSeasonSlug();
    const castedBy = parsed.data.castedBy || os.hostname();

    await appendMatchLog(seasonSlug, {
      ...parsed.data,
      castedBy,
      castedAt: new Date().toISOString(),
    });

    const { getMatchLogSummary } = await import("./services/cast-log.js");
    res.json({ ok: true, seasonSlug, summary: getMatchLogSummary(seasonSlug) });
  });

  // GET /api/match/log — retrieve all logged matches for the active season
  app.get("/api/match/log", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    const seasonSlug = snap.leagueConfig?.seasonSlug ?? await fetchActiveSeasonSlug();
    const { getMatchLog, getMatchLogSummary, broadcastDocumentsRoot } = await import("./services/cast-log.js");
    res.json({
      seasonSlug,
      dataRoot: broadcastDocumentsRoot(),
      summary: getMatchLogSummary(seasonSlug),
      entries: getMatchLog(seasonSlug),
    });
  });

  // GET /api/cast/info — returns the Documents data folder path for the UI
  app.get("/api/cast/info", requireBroadcastAuth, async (_req, res) => {
    const snap = await state.getState();
    const seasonSlug = snap.leagueConfig?.seasonSlug ?? await fetchActiveSeasonSlug();
    const { broadcastDocumentsRoot, seasonDir, getMatchLogSummary } = await import("./services/cast-log.js");
    res.json({
      seasonSlug,
      dataRoot: broadcastDocumentsRoot(),
      seasonDataDir: seasonDir(seasonSlug),
      summary: getMatchLogSummary(seasonSlug),
    });
  });
  // ──────────────────────────────────────────────────────────────────────

  app.post(
    "/api/league/stats/resolve",
    requireBroadcastAuth,
    async (_req, res) => {
      const snap = await state.getState();
      const roster = snap.leagueConfig?.roster ?? [];
      if (roster.length === 0) {
        return res.status(400).json({ error: "upload roster first" });
      }

      const configId = snap.leagueConfig?.leagueId ?? env.LEAGUE_ID;
      const csvInfo = await leagueStatsFileInfo(configId);
      const loaded = await loadLeagueStatsFromCsvFile({
        leagueId: configId,
        state,
        broadcast,
      });
      if (!loaded) {
        const payload = csvInfo.heroesExists
          ? leagueStatsCsvLoadFailedPayload(configId, csvInfo)
          : { ...leagueStatsCsvMissingPayload(configId), statsStorage: csvInfo };
        return res.status(422).json(payload);
      }

      const after = await state.getState();
      const index = after.playerHeroIndex ?? {};
      const indexKeyCount = Object.keys(index).length;
      const missingSteam32: number[] = [];
      for (const player of roster) {
        const prefix = `${player.steam32}:`;
        const hasRow = Object.keys(index).some((k) => k.startsWith(prefix));
        if (!hasRow) missingSteam32.push(player.steam32);
      }

      const csvSteam32 = new Set(
        Object.keys(index).map((k) => Number(k.split(":")[0])),
      );

      const sampleSteam32 = roster[0]?.steam32;
      const sampleGames =
        sampleSteam32 != null
          ? summarizePlayerLeagueFromIndex(index, sampleSteam32).games
          : 0;

      res.json({
        ok: true,
        loaded: true,
        rosterCount: roster.length,
        csvPlayerCount: csvSteam32.size,
        indexKeyCount,
        matchedRosterCount: roster.length - missingSteam32.length,
        missingSteam32,
        statsStorage: csvInfo,
        indexEmpty:
          indexKeyCount === 0
            ? "playerHeroIndex not in memory — rebuild @bpc/state-manager and restart API"
            : undefined,
        sampleRosterGamesInIndex: sampleGames,
        leagueConfig: after.leagueConfig,
      });
    },
  );

  app.get(
    "/api/league/player/:steam32/stats-audit",
    requireBroadcastAuth,
    async (req, res) => {
      const steam32 = Number(req.params.steam32);
      if (!Number.isFinite(steam32) || steam32 <= 0) {
        return res.status(400).json({ error: "invalid steam32" });
      }

      const snap = await state.getState();
      const index = snap.playerHeroIndex ?? {};
      const prefix = `${steam32}:`;
      const heroRows = Object.entries(index)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, row]) => ({
          heroId: Number(k.split(":")[1]),
          games: row.games,
          wins: row.wins,
        }));
      const total = summarizePlayerLeagueFromIndex(index, steam32);

      const configId = snap.leagueConfig?.leagueId ?? env.LEAGUE_ID;
      const paths = await leagueStatsFileInfo(configId);
      let csvLines: string[] = [];
      try {
        const csvText = await readFile(paths.playerHeroesPath, "utf8");
        csvLines = csvText
          .split(/\r?\n/)
          .filter((l) => l.startsWith(`${steam32},`));
      } catch {
        csvLines = [];
      }
      const csvGamesSum = csvLines.reduce(
        (n, line) => n + (Number(line.split(",")[2]) || 0),
        0,
      );

      res.json({
        steam32,
        leagueId: configId,
        gamesInIndex: total.games,
        winsInIndex: total.wins,
        heroRows,
        csvRowCount: csvLines.length,
        csvGamesSum,
        aggregationMatchTotal: snap.leagueConfig?.aggregationMatchTotal,
        hint:
          total.games === 0
            ? "No league rows in memory — Resolve stats or Fetch league stats"
            : total.games < csvGamesSum
              ? "Index out of sync — click Resolve stats"
              : "If below Dotabuff, re-fetch league stats (latest match may be missing from CSV)",
      });
    },
  );

  app.post(
    "/api/match/apply-player-mapping",
    requireBroadcastAuth,
    async (req, res) => {
      const bodyParsed = z
        .object({ pickPlayers: pickPlayersSchema.optional() })
        .safeParse(req.body ?? {});
      if (!bodyParsed.success) {
        return res.status(400).json({ error: bodyParsed.error.flatten() });
      }

      const snap = await state.getState();
      const baseMatchSetup = snap.leagueConfig?.matchSetup;
      const roster = snap.leagueConfig?.roster ?? [];
      const draft = snap.draft;

      if (!baseMatchSetup) {
        return res.status(400).json({ error: "save match setup first" });
      }
      if (!draft) {
        return res.status(400).json({ error: "no draft state" });
      }
      if (draft.phase !== "done") {
        return res.status(400).json({
          error: "draft must be complete before applying player mapping",
        });
      }

      const incomingPickPlayers = bodyParsed.data.pickPlayers;
      const matchSetup = incomingPickPlayers
        ? {
            ...baseMatchSetup,
            pickPlayers: {
              radiant:
                incomingPickPlayers.radiant ??
                baseMatchSetup.pickPlayers?.radiant,
              dire:
                incomingPickPlayers.dire ?? baseMatchSetup.pickPlayers?.dire,
            },
          }
        : baseMatchSetup;

      const leagueConfig = {
        ...snap.leagueConfig!,
        roster,
        matchSetup,
      };
      const mappedDraft = applyPickPlayersToDraft(draft, leagueConfig);

      const next = await state.patchState({
        leagueConfig: { matchSetup },
        draft: mappedDraft,
        production: {
          playerMappingPublished: true,
        },
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        matchSetup: next.leagueConfig?.matchSetup,
        draft: next.draft,
        production: next.production,
      });
    },
  );

  app.post(
    "/api/draft/reset-overlay",
    requireBroadcastAuth,
    async (_req, res) => {
      const snap = await state.getState();
      const roster = snap.leagueConfig?.roster ?? [];
      const matchSetup = snap.leagueConfig?.matchSetup;
      const epoch = (snap.production?.overlayDraftEpoch ?? 0) + 1;

      let draft = null;
      if (matchSetup && roster.length > 0) {
        draft = draftPatchFromMatchSetup(
          matchSetup,
          roster,
          null,
        ) as import("@bpc/shared-types").DraftState;
      }

      const next = await state.patchState({
        draft,
        heroStatsCard: null,
        statCarousel: null,
        production: {
          playerMappingPublished: false,
          overlayDraftEpoch: epoch,
        },
      });
      await broadcast.broadcastFull(next);
      res.json({
        ok: true,
        overlayDraftEpoch: epoch,
        draft: next.draft,
      });
    },
  );

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
      snap.lifetimeTournamentHeroIndex ?? {},
      roster,
      snap.lifetimePlayerHeroIndex,
    );

    if (parsed.data.persist) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: null,
      });
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
      snap.lifetimePlayerHeroIndex,
      roster,
    );

    if (parsed.data.persist) {
      const next = await state.patchState({
        heroStatsCard: card,
        statCarousel: null,
      });
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
        snap.lifetimeTournamentHeroIndex ?? {},
      );

      if (parsed.data.persist) {
        const next = await state.patchState({
          heroStatsCard: card,
          statCarousel: null,
        });
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
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }
    const snap = await state.getState();
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

  function extractLiveStats(steam32: number): any {
    const payload = globalLatestGsiPayload;
    if (!payload || !payload.player) return null;

    for (const teamKey of ["team2", "team3"]) {
      if (!payload.player[teamKey]) continue;
      for (let i = 0; i <= 9; i++) {
        const p = payload.player[teamKey][`player${i}`];
        if (p && String(p.accountid) === String(steam32)) {
          return {
            gpm: p.gpm || 0,
            xpm: p.xpm || 0,
            heroDamage: p.hero_damage || 0,
            lastHits: p.last_hits || 0,
            denies: p.denies || 0,
          };
        }
      }
    }
    return null;
  }

  app.post("/api/producer/h2h", requireBroadcastAuth, async (req, res) => {
    const schema = z.object({
      player1Steam32: z.number(),
      player2Steam32: z.number(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error });
    }
    
    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    
    const p1 = findRosterPlayer(roster, parsed.data.player1Steam32);
    const p2 = findRosterPlayer(roster, parsed.data.player2Steam32);
    
    if (!p1 || !p2) {
      return res.status(404).json({ error: "Players not found in roster" });
    }

    try {
      assertLeagueStatsReady(snap);
    } catch (err: any) {
      return res.status(503).json({ error: err.message });
    }

    const p1Stats = aggregatePlayerLeagueFromIndex(snap.lifetimePlayerHeroIndex!, parsed.data.player1Steam32);
    const p2Stats = aggregatePlayerLeagueFromIndex(snap.lifetimePlayerHeroIndex!, parsed.data.player2Steam32);

    const p1Live = extractLiveStats(parsed.data.player1Steam32);
    const p2Live = extractLiveStats(parsed.data.player2Steam32);

    const payload = {
      player1: { ...p1, stats: p1Stats, live: p1Live },
      player2: { ...p2, stats: p2Stats, live: p2Live },
    };

    io.of("/overlay").emit("SHOW_H2H", payload);
    
    res.json({ ok: true, payload });
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
              snap.lifetimeTournamentHeroIndex ?? {},
              roster,
              snap.lifetimePlayerHeroIndex,
            )
          : await buildTournamentHeroCard(
              opendota,
              lp.heroId,
              snap.lifetimeTournamentHeroIndex ?? {},
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
        snap.lifetimeTournamentHeroIndex ?? {},
        roster,
        snap.lifetimePlayerHeroIndex,
      );
    } else {
      if (parsed.data.heroId === undefined)
        return res.status(400).json({ error: "heroId required" });
      card = await buildTournamentHeroCard(
        opendota,
        parsed.data.heroId,
        snap.lifetimeTournamentHeroIndex ?? {},
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
      playerMappingPublished: z.boolean().optional(),
      overlayDraftEpoch: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const next = await state.patchState({ production: parsed.data });
    await broadcast.broadcastFull(next);
    res.json(next.production);
  });

  app.get("/api/league/bpc-matches", requireBroadcastAuth, async (req, res) => {
    const seasonSlug = req.query.seasonSlug as string | undefined;
    const matches = await fetchMatchesFromBpcLeague(seasonSlug);
    res.json(matches);
  });

  app.get("/api/league/bpc-seasons", requireBroadcastAuth, async (_req, res) => {
    const seasons = await fetchSeasonsFromBpcLeague();
    res.json(seasons);
  });

  app.get("/api/autopilot/config", requireBroadcastAuth, (_req, res) => {
    res.json({
      config: autopilotManager.getConfig(),
      isActive: autopilotManager.isActive()
    });
  });

  app.post("/api/autopilot/config", requireBroadcastAuth, (req, res) => {
    const schema = z.object({
      enabled: z.boolean().optional(),
      intervalMinutes: z.number().min(1).optional(),
      durationSeconds: z.number().min(5).optional(),
      cardTypes: z.array(z.enum(["player-league", "player-hero", "tournament-hero", "matchup"])).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    autopilotManager.configure(parsed.data);
    res.json({
      config: autopilotManager.getConfig(),
      isActive: autopilotManager.isActive()
    });
  });

  app.post("/api/autopilot/trigger", requireBroadcastAuth, async (_req, res) => {
    await autopilotManager.triggerNow();
    res.json({ ok: true, msg: "Autopilot triggered successfully" });
  });
}

export { bootstrapLeagueFromEnv };

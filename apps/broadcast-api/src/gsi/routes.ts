import type { Express } from "express";
import type { Server as IOServer } from "socket.io";
import type { StateManager } from "@bpc/state-manager";
import { parseGsiToDraft } from "./parser.js";
import { detectPowerSpikes } from "./power-spikes.js";
import { ensureHeroRegistry } from "../services/hero-registry.js";
import type { BroadcastFns } from "../routes.js";
import { logger } from "../logger.js";
import { env } from "../env.js";
import {
  buildCarouselFromHeroCard,
  buildPlayerHeroCard,
  buildTournamentHeroCard,
} from "../services/stats-builder.js";
import type { OpenDotaClient } from "../opendota-client.js";
import { findRosterPlayer } from "../services/hero-registry.js";
import {
  manualPickSteam32,
  pickSlotOrderForHero,
} from "@bpc/shared-types";
import { assertLeagueStatsReady } from "../services/league-stats-guard.js";

let lastGsiAt = 0;
let gsiDebounce: ReturnType<typeof setTimeout> | null = null;

export function attachGsiRoutes(opts: {
  app: Express;
  state: StateManager;
  broadcast: BroadcastFns;
  opendota: OpenDotaClient;
  io: IOServer;
}): void {
  const { app, state, broadcast, opendota, io } = opts;

  app.post("/gsi", async (req, res) => {
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;
    if (env.GSI_TOKEN && token !== env.GSI_TOKEN) {
      res.status(403).json({ error: "invalid gsi token" });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    lastGsiAt = Date.now();
    await ensureHeroRegistry(opendota);

    // Trigger power spike evaluation
    try {
      detectPowerSpikes(payload, io);
    } catch (err) {
      logger.error(err, "Power spike evaluation failed");
    }

    const snap = await state.getState();
    const roster = snap.leagueConfig?.roster ?? [];
    const matchSetup = snap.leagueConfig?.matchSetup ?? null;
    const parsed = parseGsiToDraft(
      payload,
      snap.draft ?? null,
      roster,
      matchSetup,
    );

    const apply = async () => {
      const current = await state.getState();

      let patch: Record<string, unknown> = {
        production: {
          gsiLastSeen: new Date().toISOString(),
          gsiConnected: true,
        },
      };

      if (parsed.draftPatch) {
        patch = {
          ...patch,
          draft: {
            ...(current.draft ?? {
              series: {
                teamA: "Radiant",
                teamB: "Dire",
                scoreA: 0,
                scoreB: 0,
              },
              side: "radiant_first_pick",
              phase: "picks",
              reserveSeconds: 0,
            }),
            ...parsed.draftPatch,
          },
        };
      }

      const next = await state.patchState(patch);
      await broadcast.broadcastFull(next);

      if (
        current.production?.autoShowStatsOnPick &&
        parsed.draftPatch?.lastPick
      ) {
        try {
          assertLeagueStatsReady(current);
        } catch {
          return;
        }
        const lp = parsed.draftPatch.lastPick;
        const side =
          lp.side === "dire" || lp.side === "B" ? "dire" : "radiant";
        const teamSlots =
          side === "radiant"
            ? parsed.draftPatch.radiant?.slots ?? current.draft?.radiant?.slots
            : parsed.draftPatch.dire?.slots ?? current.draft?.dire?.slots;
        const slotOrder = pickSlotOrderForHero(side, lp.heroId, teamSlots);
        const manualSteam32 =
          slotOrder !== undefined
            ? manualPickSteam32(current.leagueConfig?.matchSetup, side, slotOrder)
            : undefined;
        const roster = current.leagueConfig?.roster ?? [];
        const player =
          manualSteam32 != null && manualSteam32 > 0
            ? findRosterPlayer(roster, manualSteam32)
            : undefined;

        const card =
          player && manualSteam32
            ? await buildPlayerHeroCard(
                opendota,
                manualSteam32,
                lp.heroId,
                player.displayName,
                current.tournamentHeroIndex ?? {},
                roster,
                current.playerHeroIndex,
              )
            : await buildTournamentHeroCard(
                opendota,
                lp.heroId,
                current.tournamentHeroIndex ?? {},
              );
        const carousel = buildCarouselFromHeroCard(card);
        const until = Date.now() + 12000;
        const updated = await state.patchState({
          heroStatsCard: card,
          statCarousel: carousel,
          overlayVisibility: {
            herostats: { mode: "timed", until },
          },
        });
        await broadcast.broadcastFull(updated);
      }
    };

    if (gsiDebounce) clearTimeout(gsiDebounce);
    gsiDebounce = setTimeout(() => {
      void apply().catch((err) => logger.error(err, "gsi apply failed"));
    }, 150);

    res.json({ ok: true, inDraft: parsed.inDraft });
  });

  app.get("/gsi/status", (_req, res) => {
    res.json({
      lastSeen: lastGsiAt ? new Date(lastGsiAt).toISOString() : null,
      connected: Date.now() - lastGsiAt < 5000,
    });
  });
}

export function attachGsiHeartbeat(
  state: StateManager,
  broadcast: BroadcastFns,
  io: IOServer,
): void {
  void io;
  setInterval(() => {
    void (async () => {
      if (Date.now() - lastGsiAt > 8000 && lastGsiAt > 0) {
        const snap = await state.getState();
        if (snap.production?.gsiConnected) {
          const next = await state.patchState({
            production: { gsiConnected: false },
          });
          await broadcast.broadcastFull(next);
        }
      }
    })();
  }, 3000).unref?.();
}

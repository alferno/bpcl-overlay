import type { OverlayEnvelope } from "@bpc/shared-types";
import { NAMESPACES, SOCKET_EVENTS } from "@bpc/shared-types";
import type { StateManager } from "@bpc/state-manager";
import cors from "cors";
import type { Express } from "express";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { env, parseCorsOrigins } from "./env.js";
import { logger } from "./logger.js";
import type { OBSController } from "./obs-controller.js";
import type { OpenDotaClient } from "./opendota-client.js";
import { attachRestRoutes } from "./routes.js";
import { attachLeagueAndStatsRoutes } from "./league-stats-routes.js";
import { attachGsiRoutes, attachGsiHeartbeat } from "./gsi/routes.js";

export type BroadcastServerContext = {
  app: Express;
  httpServer: http.Server;
  io: Server;
  broadcast: {
    broadcastFull(envelope?: OverlayEnvelope): Promise<void>;
  };
};

function authorizeSocket(kind: "producer" | "overlay", socket: any): boolean {
  const h = socket.handshake;

  let token = "";
  if (typeof h.auth?.token === "string") token = h.auth.token;
  else if (typeof h.query?.token === "string") token = h.query.token;

  if (!token) {
    if (kind === "overlay") {
      // Allow all overlay connections without a token.
      // Overlays are read-only and contain no sensitive admin secrets.
      return true;
    }
    return false;
  }
  return token === env.BROADCAST_SECRET;
}

export async function createBroadcastServer(deps: {
  state: StateManager;
  obs: OBSController;
  opendota: OpenDotaClient;
}): Promise<BroadcastServerContext> {
  const { state, obs, opendota } = deps;

  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
  app.disable("x-powered-by");
  app.use(
    cors({
      origin:
        env.NODE_ENV === "production"
          ? parseCorsOrigins()
          : true,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  // Serve static frontends dynamically based on current script location
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const overlayPath = path.join(__dirname, "../../overlay-web/dist");
  const adminPath = path.join(__dirname, "../../admin-web/dist");
  
  app.use("/overlay", express.static(overlayPath));
  app.use("/admin", express.static(adminPath));
  
  // Fallback for React Router in admin
  app.get("/admin", (req, res) => {
    const file = path.join(adminPath, "index.html");
    res.sendFile(file, (err) => {
      if (err) res.status(500).send(`sendFile error for ${file}: ${err.message}`);
    });
  });
  app.get("/admin/*", (req, res) => {
    const file = path.join(adminPath, "index.html");
    res.sendFile(file, (err) => {
      if (err) res.status(500).send(`sendFile error for ${file}: ${err.message}`);
    });
  });
  app.get("/overlay", (req, res) => {
    const file = path.join(overlayPath, "index.html");
    res.sendFile(file, (err) => {
      if (err) res.status(500).send(`sendFile error for ${file}: ${err.message}`);
    });
  });
  app.get("/overlay/*", (req, res) => {
    const file = path.join(overlayPath, "index.html");
    res.sendFile(file, (err) => {
      if (err) res.status(500).send(`sendFile error for ${file}: ${err.message}`);
    });
  });

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors:
      env.NODE_ENV === "production"
        ? { origin: parseCorsOrigins() }
        : { origin: true },
    transports: ["websocket", "polling"],
  });

  const broadcastFns = {
    async broadcastFull(envelope?: OverlayEnvelope) {
      const envelopeToSend = envelope ?? await state.getState();
      io.of(NAMESPACES.OVERLAY).emit(SOCKET_EVENTS.STATE_FULL, envelopeToSend);
      io.of(NAMESPACES.PRODUCER).emit(
        SOCKET_EVENTS.STATE_FULL,
        envelopeToSend,
      );
      logger.debug({ seq: envelopeToSend.seq }, "Emitted state snapshot");
    },
  };

  attachRestRoutes({
    app,
    state,
    io,
    broadcast: broadcastFns,
    obs,
    opendota,
  });

  attachLeagueAndStatsRoutes({
    app,
    state,
    io,
    broadcast: broadcastFns,
    opendota,
  });

  attachGsiRoutes({
    app,
    state,
    broadcast: broadcastFns,
    opendota,
    io,
  });

  attachGsiHeartbeat(state, broadcastFns, io);

  const producerNs = io.of(NAMESPACES.PRODUCER);
  const overlayNs = io.of(NAMESPACES.OVERLAY);

  producerNs.use((socket, next) => {
    const ok = authorizeSocket("producer", socket);
    next(ok ? undefined : new Error("unauthorized producer"));
  });

  overlayNs.use((socket, next) => {
    const ok = authorizeSocket("overlay", socket);
    next(ok ? undefined : new Error("unauthorized overlay"));
  });

  producerNs.on("connection", (socket) => {
    logger.info({ id: socket.id }, "producer connected");
    void state.getState().then((snap) => {
      socket.emit(SOCKET_EVENTS.STATE_FULL, snap);
    });
  });

  overlayNs.on("connection", (socket) => {
    logger.info({ id: socket.id }, "overlay viewer connected");
    void state.getState().then((snap) => {
      socket.emit(SOCKET_EVENTS.STATE_FULL, snap);
    });
  });

  const heartbeatMs = Number(process.env.STATE_HEARTBEAT_MS ?? 8000);
  if (!Number.isNaN(heartbeatMs) && heartbeatMs > 500) {
    const t = setInterval(() => {
      void state.getState().then((snap) => {
        io.of(NAMESPACES.OVERLAY).emit(SOCKET_EVENTS.STATE_FULL, snap);
      });
    }, heartbeatMs);
    if (typeof t.unref === "function") t.unref();
  }

  return { app, httpServer, io, broadcast: broadcastFns };
}

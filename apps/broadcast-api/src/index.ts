import { env } from "./env.js";
import { logger } from "./logger.js";
import { OBSController } from "./obs-controller.js";
import { OpenDotaClient } from "./opendota-client.js";
import { createBroadcastServer } from "./server.js";
import { createAppState } from "./state-setup.js";
import { ensureHeroRegistry } from "./services/hero-registry.js";
import { bootstrapLeagueFromEnv } from "./services/league-bootstrap.js";

export async function bootstrapBroadcastServer() {
  const state = await createAppState();
  const obs = new OBSController();
  const opendota = new OpenDotaClient();
  if (env.REDIS_URL) opendota.attachRedis(env.REDIS_URL);

  void ensureHeroRegistry(opendota).catch((err) =>
    logger.warn(err, "hero registry preload deferred"),
  );

  const ctx = await createBroadcastServer({ state, obs, opendota });

  await bootstrapLeagueFromEnv({
    state,
    opendota,
    broadcast: ctx.broadcast,
  });

  ctx.httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, leagueId: env.LEAGUE_ID },
      "BPC Broadcast API listening — league stats are env-scoped only",
    );
  });

  const shutdown = async () => {
    logger.info("Shutting down");
    await ctx.io.close();
    await obs.disconnect();
    await opendota.shutdown();
    await state.shutdown?.();
    ctx.httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  return { obs, opendota, state, shutdown };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void bootstrapBroadcastServer().catch((err) => {
    logger.error(err, "fatal startup");
    process.exit(1);
  });
}

import { readFile } from "fs/promises";
import { resolve } from "path";
import { EventEngine } from "../events/EventEngine.js";
import { EventBus } from "../events/EventBus.js";
import { GameStateStore } from "../gsi/GameStateStore.js";
import { logger } from "../logger.js";
// Import detectors here later when they are built

export async function replayGsi(filePath: string) {
  const fullPath = resolve(filePath);
  const data = await readFile(fullPath, "utf-8");
  let payload = JSON.parse(data);

  if (payload.payload) {
    payload = payload.payload;
  }

  const eventBus = new EventBus();
  
  eventBus.on("*", (event) => {
    // Format the time as MM:SS
    const minutes = Math.floor(event.gameTime / 60);
    const seconds = Math.floor(event.gameTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    let extraInfo = "";
    if ("team" in event) extraInfo += ` ${event.team.toUpperCase()}`;
    if ("playerName" in event && event.playerName) extraInfo += ` ${event.playerName}`;

    console.log(`${timeStr} ${event.type}${extraInfo}`);
  });

  const eventEngine = new EventEngine(eventBus);
  
  // Register detectors here (to be added in Phase 3)
  
  const store = new GameStateStore(eventEngine, eventBus);

  if (Array.isArray(payload)) {
    for (const tick of payload) {
      store.processPayload(tick);
    }
  } else {
    // Single snapshot
    // To allow state transition detectors to work on a single snapshot dump, 
    // we could artificially seed a previous state, but for now we just process it.
    store.processPayload(payload);
  }

  logger.info("Replay finished.");
}

// If run directly
if (import.meta.url.startsWith("file:") && process.argv[1] === new URL(import.meta.url).pathname) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node GSIReplay.js <path-to-dump.json>");
    process.exit(1);
  }
  replayGsi(file).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

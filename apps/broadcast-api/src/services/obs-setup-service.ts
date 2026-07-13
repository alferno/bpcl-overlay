import { OBSController } from "../obs-controller.js";
import { logger } from "../logger.js";
import path from "node:path";

export interface OBSSetupOptions {
  overlayBaseUrl: string;
}

export async function autoSetupOBS(
  obs: OBSController,
  options: OBSSetupOptions
): Promise<{ ok: boolean; message: string; error?: string }> {
  if (!obs.isConnected()) {
    return { ok: false, message: "OBS is not connected" };
  }

  try {
    const existingScenes = await obs.listScenes();

    // 1. Fail safe check
    const requiredScenes = ["Scene", "Replay", "Replay Stinger"];
    for (const scene of requiredScenes) {
      if (existingScenes.includes(scene)) {
        return {
          ok: false,
          message: `Setup aborted: Scene '${scene}' already exists. Please rename or delete your existing scenes to prevent overwriting.`,
        };
      }
    }

    // 2. Create Scenes
    for (const scene of requiredScenes) {
      const res = await obs.createScene(scene);
      if (!res.ok) {
        throw new Error(`Failed to create scene '${scene}': ${res.error}`);
      }
    }

    // 3. Inject Browser Sources into 'Scene'
    const baseUrl = options.overlayBaseUrl.replace(/\/$/, ""); // trim trailing slash
    
    const browserSources = [
      { name: "Draft", url: `${baseUrl}/draft` },
      { name: "Game", url: `${baseUrl}/game` },
      { name: "Hero Spotlight", url: `${baseUrl}/herostats` },
      { name: "Lower Third", url: `${baseUrl}/lowerthird` },
      { name: "Matchup", url: `${baseUrl}/matchup` },
      { name: "MVP", url: `${baseUrl}/postgame` },
      { name: "Player Stat", url: `${baseUrl}/playerstats` },
      { name: "Sponsors", url: `${baseUrl}/sponsors` },
      { name: "Starting Soon", url: `${baseUrl}/startingsoon` },
      { name: "Versus", url: `${baseUrl}/versus` },
      { name: "ReplayBanner1", url: `${baseUrl}/sponsors` }, 
    ];

    for (const source of browserSources) {
      const res = await obs.createInput("Scene", source.name, "browser_source", {
        url: source.url,
        width: 1920,
        height: 1080,
        reroute_audio: false,
      });
      if (!res.ok) {
        logger.warn(`Failed to create browser source '${source.name}': ${res.error}`);
      }
    }

    // 4. Inject Placeholder Media Sources & Captures
    const bpclBase = process.env.APP_ROOT
      ? path.join(process.env.APP_ROOT, "BroadcastData")
      : path.resolve(".", "BroadcastData");
    
    const stingerPath = path.join(bpclBase, "System", "stinger.webm");
    
    // Stinger into Replay Stinger
    await obs.createInput("Replay Stinger", "Stinger", "ffmpeg_source", {
      local_file: stingerPath,
      is_local_file: true,
      looping: false,
    });

    // ReplayPlayer into Replay scene
    await obs.createInput("Replay", "ReplayPlayer", "ffmpeg_source", {
      is_local_file: true,
      looping: false,
    });

    // 5. Audio and Game Captures (into Scene)
    await obs.createInput("Scene", "Game Capture", "game_capture", {});
    await obs.createInput("Scene", "Audio Input Capture", "wasapi_input_capture", {});
    await obs.createInput("Scene", "Audio Output Capture", "wasapi_output_capture", {});
    
    // 6. Nesting scenes
    await obs.createInput("Replay", "Scene", "scene", {});
    await obs.createInput("Replay Stinger", "Scene", "scene", {});

    return { ok: true, message: "OBS Setup completed successfully" };
  } catch (error) {
    logger.error(error, "Error during OBS auto setup");
    return {
      ok: false,
      message: "An error occurred during setup",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

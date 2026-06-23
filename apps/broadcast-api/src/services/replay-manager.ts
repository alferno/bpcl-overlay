import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../env.js";
import type { Replay, ReplayState } from "@bpc/shared-types";
import { logger } from "../logger.js";
import type { OBSController } from "../obs-controller.js";

const execAsync = promisify(exec);

export class ReplayManager {
  private dbFile = env.REPLAY_DB_FILE;
  private matchFile = env.REPLAY_MATCH_FILE;
  private lastCompletedFile = env.REPLAY_LAST_COMPLETED_FILE;
  private playbackDir = env.REPLAY_PLAYBACK_DIR;
  private replayFolder = env.REPLAY_FOLDER;

  // Temp folder for browser mp4 previews (inside build output or root)
  private previewCacheDir = path.resolve(process.cwd(), "public-preview-cache");

  constructor() {
    // Ensure preview cache folder exists
    if (!fs.existsSync(this.previewCacheDir)) {
      try {
        fs.mkdirSync(this.previewCacheDir, { recursive: true });
      } catch (err) {
        logger.error(err, "Failed to create preview cache directory");
      }
    }
  }

  getPreviewCacheDir(): string {
    return this.previewCacheDir;
  }

  async getReplayState(): Promise<ReplayState> {
    let currentMatch = 1;
    let lastCompletedMatch = 0;
    const replays: Replay[] = [];

    try {
      if (fs.existsSync(this.matchFile)) {
        const content = fs.readFileSync(this.matchFile, "utf-8").trim();
        const num = parseInt(content, 10);
        if (!isNaN(num)) currentMatch = num;
      }
    } catch (err) {
      logger.error(err, "Failed to read active match file");
    }

    try {
      if (fs.existsSync(this.lastCompletedFile)) {
        const content = fs.readFileSync(this.lastCompletedFile, "utf-8").trim();
        const num = parseInt(content, 10);
        if (!isNaN(num)) lastCompletedMatch = num;
      }
    } catch (err) {
      logger.error(err, "Failed to read last completed match file");
    }

    try {
      if (fs.existsSync(this.dbFile)) {
        const content = fs.readFileSync(this.dbFile, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // CSV Format: match,replay_id,"file",favorite,duration
          // Regex matching: match_id,replay_id,"file_path",favorite_value,duration_value
          const match = line.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
          if (match) {
            const file = match[3];
            replays.push({
              match: parseInt(match[1], 10),
              replayId: parseInt(match[2], 10),
              file: file,
              favorite: parseInt(match[4], 10) === 1,
              duration: parseInt(match[5], 10),
              filename: path.basename(file),
            });
          }
        }
      }
    } catch (err) {
      logger.error(err, "Failed to read or parse replay database CSV");
    }

    // Sort by replayId descending (newest first)
    replays.sort((a, b) => b.replayId - a.replayId);

    return {
      currentMatch,
      lastCompletedMatch,
      replays,
    };
  }

  async toggleFavorite(file: string, favorite: boolean): Promise<boolean> {
    try {
      if (!fs.existsSync(this.dbFile)) {
        return false;
      }

      const content = fs.readFileSync(this.dbFile, "utf-8");
      const lines = content.split(/\r?\n/);
      const newLines: string[] = [];

      if (lines.length > 0) {
        newLines.push(lines[0]); // Header
      }

      let updated = false;
      const favVal = favorite ? "1" : "0";

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        if (match && match[3] === file) {
          newLines.push(`${match[1]},${match[2]},"${match[3]}",${favVal},${match[5]}`);
          updated = true;
        } else {
          newLines.push(line);
        }
      }

      fs.writeFileSync(this.dbFile, newLines.join("\n") + "\n", "utf-8");
      return updated;
    } catch (err) {
      logger.error(err, `Failed to toggle favorite for ${file}`);
      return false;
    }
  }

  async playReplay(file: string, obs: OBSController): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!fs.existsSync(file)) {
        return { ok: false, error: "File not found" };
      }

      const state = await this.getReplayState();
      const entry = state.replays.find((r) => r.file === file);
      const duration = entry ? entry.duration : 30;
      
      // Probe actual duration of the file
      const probeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`;
      const probeOut = await execAsync(probeCmd);
      const actualDuration = parseFloat(probeOut.stdout.trim()) || 40;
      
      // Calculate offset from the end of the file
      const offset = Math.max(0, actualDuration - duration);

      let playbackFile = file;

      // Only slice if we actually need to cut time off the beginning
      if (offset > 1) {
        if (!fs.existsSync(this.playbackDir)) {
          fs.mkdirSync(this.playbackDir, { recursive: true });
        }
        playbackFile = path.join(this.playbackDir, "current_replay.mp4");
        
        const ffmpegCmd = `ffmpeg -y -ss ${offset} -i "${file}" -t ${duration} -c copy "${playbackFile}"`;
        logger.info({ cmd: ffmpegCmd }, "Running ffmpeg slice command");
        await execAsync(ffmpegCmd);
      }

      if (obs.isConnected()) {
        const setSettingsRes = await obs.setInputSettings("ReplayPlayer", {
          local_file: playbackFile,
        });
        if (!setSettingsRes.ok) {
          return { ok: false, error: `Failed to set OBS input settings: ${setSettingsRes.error}` };
        }

        const restartRes = await obs.restartMediaInput("ReplayPlayer");
        if (!restartRes.ok) {
          return { ok: false, error: `Failed to restart OBS media input: ${restartRes.error}` };
        }

        // Switch to the replay scene
        const sceneRes = await obs.setCurrentScene("Replay");
        if (!sceneRes.ok) {
          logger.error({ error: sceneRes.error }, "Failed to switch OBS scene");
        }

        return { ok: true };
      } else {
        return { ok: true, error: "Replay sliced, but OBS was not connected to play it." };
      }
    } catch (err) {
      logger.error(err, "Failed to play replay");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async generatePreview(file: string): Promise<{ ok: boolean; previewUrl?: string; error?: string }> {
    try {
      if (!fs.existsSync(file)) {
        return { ok: false, error: `Replay file not found: ${file}` };
      }

      // Serve the MP4 directly!
      const filename = path.basename(file);
      return { ok: true, previewUrl: `/api/replays/media/${encodeURIComponent(filename)}` };
    } catch (err) {
      logger.error(err, "Failed to generate preview url");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

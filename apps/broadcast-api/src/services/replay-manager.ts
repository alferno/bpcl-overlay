import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

let ffmpegStatic = process.env.FFMPEG_PATH;
if (!ffmpegStatic) {
  const require = createRequire(import.meta.url);
  ffmpegStatic = require("ffmpeg-static");
}

let ffprobeStaticPath = process.env.FFPROBE_PATH;
if (!ffprobeStaticPath) {
  const require = createRequire(import.meta.url);
  ffprobeStaticPath = require("ffprobe-static").path;
}
import { env } from "../env.js";
import type { Replay, ReplayState } from "@bpc/shared-types";
import { logger } from "../logger.js";
import type { OBSController } from "../obs-controller.js";

type PlaybackState = 'IDLE' | 'STINGER_IN' | 'REPLAYING' | 'STINGER_OUT';

const execAsync = promisify(exec);

export class ReplayManager {
  private dbFile = env.REPLAY_DB_FILE;
  private matchFile = env.REPLAY_MATCH_FILE;
  private lastCompletedFile = env.REPLAY_LAST_COMPLETED_FILE;
  private playbackDir = env.REPLAY_PLAYBACK_DIR;
  private replayFolder = env.REPLAY_FOLDER;
  private highlightsDir = (env as any).HIGHLIGHTS_FOLDER || path.resolve(process.cwd(), "../../data/highlights");
  private pendingDuration: number | null = null;

  private playbackState: PlaybackState = 'IDLE';
  private originalScene: string | null = null;

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

  async getHighlights(): Promise<{ file: string; filename: string; url: string; sizeBytes: number; createdAt: number }[]> {
    try {
      if (!fs.existsSync(this.highlightsDir)) {
        return [];
      }
      const files = fs.readdirSync(this.highlightsDir).filter(f => f.endsWith('.mp4'));
      const highlights = files.map(f => {
        const p = path.join(this.highlightsDir, f);
        const stat = fs.statSync(p);
        return {
          file: p,
          filename: f,
          url: `/api/highlights/media/${encodeURIComponent(f)}`,
          sizeBytes: stat.size,
          createdAt: stat.birthtimeMs,
        };
      });
      highlights.sort((a, b) => b.createdAt - a.createdAt);
      return highlights;
    } catch (err) {
      logger.error(err, "Failed to list highlights");
      return [];
    }
  }

  init(obs: OBSController) {
    obs.on("ReplayBufferSaved", async (data) => {
      // obs-websocket-js typed data
      const path = (data as any).savedReplayPath;
      if (path) {
        await this.handleReplaySaved(path);
      }
    });

    obs.on("CurrentProgramSceneChanged", (data) => {
      const sceneName = (data as any).sceneName;
      if (this.playbackState !== 'IDLE' && sceneName !== 'Replay Stinger' && sceneName !== 'Replay') {
        logger.info(`Manual scene switch to ${sceneName} detected. Cancelling replay sequence.`);
        this.playbackState = 'IDLE';
        this.originalScene = null;
      }
    });

    obs.on("MediaInputPlaybackEnded", async (data) => {
      const inputName = (data as any).inputName;
      
      if (this.playbackState === 'STINGER_IN' && inputName === 'Stinger') {
        logger.info("Stinger In ended, switching to Replay");
        this.playbackState = 'REPLAYING';
        await obs.setCurrentScene("Replay");
        await obs.restartMediaInput("ReplayPlayer");
      } 
      else if (this.playbackState === 'REPLAYING' && inputName === 'ReplayPlayer') {
        logger.info("Replay ended, switching to Stinger Out");
        this.playbackState = 'STINGER_OUT';
        await obs.setCurrentScene("Replay Stinger");
        await obs.restartMediaInput("Stinger");
      }
      else if (this.playbackState === 'STINGER_OUT' && inputName === 'Stinger') {
        logger.info("Stinger Out ended, restoring original scene");
        this.playbackState = 'IDLE';
        if (this.originalScene) {
          await obs.setCurrentScene(this.originalScene);
          this.originalScene = null;
        }
      }
    });
  }

  async triggerSaveReplay(duration: number | null, obs: OBSController) {
    this.pendingDuration = duration;
    const result = await obs.saveReplayBuffer();
    if (!result.ok) {
      this.pendingDuration = null;
    }
    return result;
  }

  private async handleReplaySaved(originalPath: string) {
    try {
      if (!originalPath || !fs.existsSync(originalPath)) {
        logger.error({ originalPath }, "Replay saved but file not found");
        return;
      }

      if (!fs.existsSync(this.replayFolder)) {
        fs.mkdirSync(this.replayFolder, { recursive: true });
      }

      const filename = path.basename(originalPath);
      const newPath = path.join(this.replayFolder, filename);

      // Move the file and delete from original location
      if (originalPath !== newPath) {
        fs.copyFileSync(originalPath, newPath);
        fs.unlinkSync(originalPath);
      }

      // Probe duration
      let duration = 30; // default
      let overridden = false;
      if (this.pendingDuration !== null) {
        duration = this.pendingDuration;
        this.pendingDuration = null;
        overridden = true;
      }
      try {
        const probeCmd = `"${ffprobeStaticPath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${newPath}"`;
        const probeOut = await execAsync(probeCmd);
        const actualDuration = parseFloat(probeOut.stdout.trim());
        if (!isNaN(actualDuration) && !overridden) {
          duration = Math.round(actualDuration);
        }
      } catch (err) {
        logger.error(err, "Failed to probe duration of new replay");
      }

      // Append to CSV
      const state = await this.getReplayState();
      const currentMatch = state.currentMatch;
      
      let maxReplayId = 0;
      for (const r of state.replays) {
        if (r.replayId > maxReplayId) {
          maxReplayId = r.replayId;
        }
      }
      const newReplayId = maxReplayId + 1;

      const newLine = `${currentMatch},${newReplayId},"${newPath}",0,${duration}\n`;
      
      if (!fs.existsSync(this.dbFile)) {
        const dir = path.dirname(this.dbFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.dbFile, 'match,replay_id,"file",favorite,duration\n');
      }
      
      fs.appendFileSync(this.dbFile, newLine, "utf-8");
      logger.info({ newPath, currentMatch, newReplayId }, "Saved new replay");

    } catch (err) {
      logger.error(err, "Failed to handle saved replay");
    }
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

  async removeReplaysFromDb(filesToRemove: string[]): Promise<boolean> {
    try {
      if (!fs.existsSync(this.dbFile) || filesToRemove.length === 0) {
        return false;
      }

      const content = fs.readFileSync(this.dbFile, "utf-8");
      const lines = content.split(/\r?\n/);
      const newLines: string[] = [];

      if (lines.length > 0) {
        newLines.push(lines[0]); // Header
      }

      let updated = false;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/^(\d+),(\d+),"([^"]+)",(\d+),(\d+)$/);
        if (match && filesToRemove.includes(match[3])) {
          updated = true;
          // Skip adding this line to newLines
        } else {
          newLines.push(line);
        }
      }

      if (updated) {
        fs.writeFileSync(this.dbFile, newLines.join("\n") + "\n", "utf-8");
      }
      return updated;
    } catch (err) {
      logger.error(err, "Failed to remove replays from DB");
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
      const probeCmd = `"${ffprobeStaticPath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`;
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
        
        const ffmpegCmd = `"${ffmpegStatic}" -y -loglevel error -ss ${offset} -i "${file}" -t ${duration} -c copy "${playbackFile}"`;
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

        // Get current scene to restore later, unless we are already in the middle of a replay
        const sceneRes = await obs.getCurrentProgramScene();
        if (sceneRes.ok && sceneRes.sceneName && sceneRes.sceneName !== "Replay Stinger" && sceneRes.sceneName !== "Replay") {
          this.originalScene = sceneRes.sceneName;
        }

        this.playbackState = 'STINGER_IN';
        
        const stingerRes = await obs.setCurrentScene("Replay Stinger");
        if (!stingerRes.ok) {
          logger.error({ error: stingerRes.error }, "Failed to switch to Replay Stinger scene");
        }
        await obs.restartMediaInput("Stinger");

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

  async nextMatch() {
    try {
      const state = await this.getReplayState();
      const current = state.currentMatch;
      
      // Find non-favorites for the current match to delete
      const nonFavorites = state.replays.filter(r => r.match === current && !r.favorite);
      const filesToDelete: string[] = [];

      for (const rep of nonFavorites) {
        if (fs.existsSync(rep.file)) {
          try {
            fs.unlinkSync(rep.file);
            filesToDelete.push(rep.file);
            logger.info({ file: rep.file }, "Deleted non-favorite replay");
          } catch (err) {
            logger.error({ file: rep.file, err }, "Failed to delete non-favorite replay");
          }
        } else {
          filesToDelete.push(rep.file); // Still remove from DB
        }
      }

      if (filesToDelete.length > 0) {
        await this.removeReplaysFromDb(filesToDelete);
      }
      
      if (!fs.existsSync(path.dirname(this.lastCompletedFile))) {
        fs.mkdirSync(path.dirname(this.lastCompletedFile), { recursive: true });
      }
      fs.writeFileSync(this.lastCompletedFile, current.toString(), "utf-8");
      
      // Fire and forget highlight generation
      this.generateHighlights(current).catch(err => {
        logger.error(err, "Failed to generate highlights in background");
      });
      
      const next = current + 1;
      fs.writeFileSync(this.matchFile, next.toString(), "utf-8");
      logger.info(`Advanced to match ${next}`);
      return { ok: true, currentMatch: next };
    } catch (err) {
      logger.error(err, "Failed to advance match");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async generateHighlights(matchId: number, slug?: string) {
    try {
      const state = await this.getReplayState();
      const favorites = state.replays.filter(r => r.match === matchId && r.favorite);
      
      if (favorites.length === 0) {
        logger.info(`No favorite replays found for match ${matchId} to highlight`);
        return { ok: false, error: "No favorites" };
      }
      
      if (!fs.existsSync(this.highlightsDir)) {
        fs.mkdirSync(this.highlightsDir, { recursive: true });
      }
      
      // Sort by replayId ascending so oldest plays first
      favorites.sort((a, b) => a.replayId - b.replayId);
      
      // Create concat file
      const concatFile = path.join(this.highlightsDir, `concat_${matchId}.txt`);
      // Important: escape backslashes for ffmpeg concat demuxer
      const lines = favorites.map(r => `file '${r.file.replace(/\\/g, "/")}'`);
      fs.writeFileSync(concatFile, lines.join("\n") + "\n", "utf-8");
      
      const outputFile = path.join(this.highlightsDir, slug ? `${slug}.mp4` : `Match_${matchId}_Highlights.mp4`);
      
      const cmd = `"${ffmpegStatic}" -y -loglevel error -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}"`;
      logger.info({ cmd }, "Generating highlights");
      
      await execAsync(cmd);
      
      logger.info(`Generated highlights: ${outputFile}`);

      // Delete the favorite replays used for highlights
      const favFilesToDelete: string[] = [];
      for (const rep of favorites) {
        if (fs.existsSync(rep.file)) {
          try {
            fs.unlinkSync(rep.file);
            favFilesToDelete.push(rep.file);
            logger.info({ file: rep.file }, "Deleted favorite replay after highlight generation");
          } catch (err) {
            logger.error({ file: rep.file, err }, "Failed to delete favorite replay");
          }
        } else {
          favFilesToDelete.push(rep.file);
        }
      }

      if (favFilesToDelete.length > 0) {
        await this.removeReplaysFromDb(favFilesToDelete);
      }

      return { ok: true, file: outputFile };
    } catch (err) {
      logger.error(err, "Failed to generate highlights");
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

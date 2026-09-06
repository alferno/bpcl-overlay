/**
 * combatlog-watcher.ts — Tails the Dota 2 combat log file and feeds lines
 * into AbilityAccuracyTracker.
 *
 * Usage:
 *   1. In Dota 2 spectator console: dota_combatlog_file "combatlog.txt"
 *      (writes to the Dota 2 game directory, e.g. Steam/steamapps/common/dota 2 beta/game/dota/combatlog.txt)
 *   2. Set DOTA_COMBATLOG_PATH in apps/broadcast-api/.env to that absolute path.
 *   3. The watcher starts automatically on boot if the env var is set.
 *
 * If DOTA_COMBATLOG_PATH is not set, the watcher skips silently.
 */

import fs from "node:fs";
import path from "node:path";
import type { Server as IOServer } from "socket.io";
import { logger } from "../logger.js";
import { abilityAccuracyTracker } from "./ability-accuracy.js";
import { env } from "../env.js";

const SOCKET_EVENT = "ability_accuracy_update";
const POLL_INTERVAL_MS = 500; // how often we check for new lines

class CombatLogWatcher {
  private filePath: string | null = null;
  private lastByteOffset = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private io: IOServer | null = null;
  private started = false;

  start(io: IOServer): void {
    const configuredPath = env.DOTA_COMBATLOG_PATH?.trim();
    if (!configuredPath) {
      logger.info(
        "[CombatLogWatcher] DOTA_COMBATLOG_PATH not set — ability accuracy tracking disabled.",
      );
      return;
    }

    this.filePath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    this.io = io;
    this.started = true;
    this.lastByteOffset = 0;

    // Seek to end of file if it already exists (don't replay old matches)
    if (fs.existsSync(this.filePath)) {
      try {
        const stat = fs.statSync(this.filePath);
        this.lastByteOffset = stat.size;
        logger.info(
          { path: this.filePath, offset: this.lastByteOffset },
          "[CombatLogWatcher] Starting from end of existing combatlog",
        );
      } catch {
        this.lastByteOffset = 0;
      }
    }

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    logger.info(
      { path: this.filePath, pollMs: POLL_INTERVAL_MS },
      "[CombatLogWatcher] Started",
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    logger.info("[CombatLogWatcher] Stopped");
  }

  /** Reset byte offset (call on new match so we re-read from new game's log start) */
  resetForNewMatch(): void {
    this.lastByteOffset = 0;
    logger.info("[CombatLogWatcher] Byte offset reset for new match");
  }

  private poll(): void {
    if (!this.filePath || !this.io) return;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      // File doesn't exist yet — not started spectating
      return;
    }

    // File was truncated/rotated (new match starts fresh file)
    if (stat.size < this.lastByteOffset) {
      logger.info("[CombatLogWatcher] Combatlog file truncated — resetting offset");
      this.lastByteOffset = 0;
    }

    if (stat.size <= this.lastByteOffset) return; // no new data

    let newContent: string;
    try {
      const fd = fs.openSync(this.filePath, "r");
      const length = stat.size - this.lastByteOffset;
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, this.lastByteOffset);
      fs.closeSync(fd);
      newContent = buf.toString("utf8");
      this.lastByteOffset = stat.size;
    } catch (err) {
      logger.warn({ err }, "[CombatLogWatcher] Error reading combatlog");
      return;
    }

    const lines = newContent.split("\n");
    let changed = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (abilityAccuracyTracker.processLine(trimmed)) {
        changed = true;
      }
    }

    if (changed) {
      const snapshot = abilityAccuracyTracker.getSnapshot();
      this.io.of("/overlay").emit(SOCKET_EVENT, snapshot);
      logger.debug(
        { activeEntries: snapshot.entries.length },
        "[CombatLogWatcher] Emitted ability_accuracy_update",
      );
    }
  }
}

export const combatLogWatcher = new CombatLogWatcher();

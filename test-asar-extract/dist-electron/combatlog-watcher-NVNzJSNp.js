var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import fs from "node:fs";
import path from "node:path";
import { e as env, l as logger } from "./main-EvbLZM_g.js";
import { abilityAccuracyTracker } from "./ability-accuracy-CuF6J2mq.js";
const SOCKET_EVENT = "ability_accuracy_update";
const POLL_INTERVAL_MS = 500;
class CombatLogWatcher {
  constructor() {
    __publicField(this, "filePath", null);
    __publicField(this, "lastByteOffset", 0);
    __publicField(this, "timer", null);
    __publicField(this, "io", null);
    __publicField(this, "started", false);
  }
  start(io) {
    var _a;
    const configuredPath = (_a = env.DOTA_COMBATLOG_PATH) == null ? void 0 : _a.trim();
    if (!configuredPath) {
      logger.info(
        "[CombatLogWatcher] DOTA_COMBATLOG_PATH not set — ability accuracy tracking disabled."
      );
      return;
    }
    this.filePath = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath);
    this.io = io;
    this.started = true;
    this.lastByteOffset = 0;
    if (fs.existsSync(this.filePath)) {
      try {
        const stat = fs.statSync(this.filePath);
        this.lastByteOffset = stat.size;
        logger.info(
          { path: this.filePath, offset: this.lastByteOffset },
          "[CombatLogWatcher] Starting from end of existing combatlog"
        );
      } catch {
        this.lastByteOffset = 0;
      }
    }
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    logger.info(
      { path: this.filePath, pollMs: POLL_INTERVAL_MS },
      "[CombatLogWatcher] Started"
    );
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
    logger.info("[CombatLogWatcher] Stopped");
  }
  /** Reset byte offset (call on new match so we re-read from new game's log start) */
  resetForNewMatch() {
    this.lastByteOffset = 0;
    logger.info("[CombatLogWatcher] Byte offset reset for new match");
  }
  poll() {
    if (!this.filePath || !this.io) return;
    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      return;
    }
    if (stat.size < this.lastByteOffset) {
      logger.info("[CombatLogWatcher] Combatlog file truncated — resetting offset");
      this.lastByteOffset = 0;
    }
    if (stat.size <= this.lastByteOffset) return;
    let newContent;
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
        "[CombatLogWatcher] Emitted ability_accuracy_update"
      );
    }
  }
}
const combatLogWatcher = new CombatLogWatcher();
export {
  combatLogWatcher
};

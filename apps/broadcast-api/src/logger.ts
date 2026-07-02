import pino from "pino";
import { EventEmitter } from "node:events";

export const logEmitter = new EventEmitter();

const customStream = {
  write(msg: string) {
    process.stdout.write(msg);
    try {
      const parsed = JSON.parse(msg);
      const levelStr = parsed.level === 30 ? "INFO" : parsed.level === 40 ? "WARN" : parsed.level === 50 ? "ERROR" : "DEBUG";
      const text = `[${levelStr}] ${parsed.msg || ""}`;
      logEmitter.emit("log", text);
    } catch {
      logEmitter.emit("log", msg);
    }
  }
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
}, customStream);

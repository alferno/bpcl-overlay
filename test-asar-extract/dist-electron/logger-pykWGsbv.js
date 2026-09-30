import l from "pino";
import { EventEmitter as s } from "node:events";
const o = new s(), c = {
  write(t) {
    process.stdout.write(t);
    try {
      const e = JSON.parse(t), r = `[${e.level === 30 ? "INFO" : e.level === 40 ? "WARN" : e.level === 50 ? "ERROR" : "DEBUG"}] ${e.msg || ""}`;
      o.emit("log", r);
    } catch {
      o.emit("log", t);
    }
  }
}, p = l({
  level: process.env.LOG_LEVEL ?? "info"
}, c);
export {
  o as logEmitter,
  p as logger
};

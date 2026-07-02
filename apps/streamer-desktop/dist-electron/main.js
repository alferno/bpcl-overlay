import { dialog as R, app as c, ipcMain as p, BrowserWindow as v, clipboard as P } from "electron";
import o from "node:path";
import { fileURLToPath as m } from "node:url";
import { spawn as C } from "node:child_process";
import { createHash as S } from "node:crypto";
import A from "node:os";
const f = o.dirname(m(import.meta.url));
process.env.APP_ROOT = o.join(f, "..");
process.on("uncaughtException", (t) => {
  console.error("Uncaught Exception:", t), R.showErrorBox("Main Process Uncaught Exception", t.stack || t.message || String(t));
});
process.on("unhandledRejection", (t) => {
  console.error("Unhandled Rejection:", t);
  const s = t instanceof Error ? t.stack || t.message : String(t);
  R.showErrorBox("Main Process Unhandled Rejection", s);
});
process.env.BROADCAST_SECRET || (process.env.BROADCAST_SECRET = S("sha256").update(A.hostname() + A.userInfo().username).digest("hex").slice(0, 32));
process.env.LEAGUE_ID || (process.env.LEAGUE_ID = "19721");
process.env.NODE_ENV || (process.env.NODE_ENV = "production");
process.env.PORT || (process.env.PORT = "8080");
process.env.STATE_BACKEND || (process.env.STATE_BACKEND = "memory");
process.env.CORS_ORIGINS || (process.env.CORS_ORIGINS = "*");
process.env.STEAM_WEB_API_KEY || (process.env.STEAM_WEB_API_KEY = "E5DE5CF0D74F982E7FCB0AC3DE13393F");
process.env.LEAGUE_AUTO_AGGREGATE || (process.env.LEAGUE_AUTO_AGGREGATE = "false");
const g = o.dirname(c.getPath("exe")), l = c.isPackaged ? o.join(g, "BroadcastData") : o.join(process.env.APP_ROOT, "BroadcastData");
process.env.REPLAY_DB_FILE || (process.env.REPLAY_DB_FILE = o.join(l, "System", "replay_db.csv"));
process.env.REPLAY_MATCH_FILE || (process.env.REPLAY_MATCH_FILE = o.join(l, "System", "active_match.txt"));
process.env.REPLAY_LAST_COMPLETED_FILE || (process.env.REPLAY_LAST_COMPLETED_FILE = o.join(l, "System", "last_completed_match.txt"));
process.env.REPLAY_PLAYBACK_DIR || (process.env.REPLAY_PLAYBACK_DIR = o.join(l, "Playback"));
process.env.REPLAY_FOLDER || (process.env.REPLAY_FOLDER = o.join(l, "Replays"));
process.env.ROSTER_CSV_PATH || (process.env.ROSTER_CSV_PATH = o.join(l, "System", "Rosters", "players_roster_prepared.csv"));
process.env.LEAGUE_STATS_DIR || (process.env.LEAGUE_STATS_DIR = o.join(l, "System", "Stats"));
let u;
process.env.BPC_NO_EXIT = "1";
const E = process.env.VITE_DEV_SERVER_URL, y = o.join(process.env.APP_ROOT, "dist-electron"), T = o.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = E ? o.join(process.env.APP_ROOT, "public") : T;
let e, d = null, a = null;
c.on("before-quit", () => {
  a && (a.kill(), a = null);
});
async function h() {
  e = new v({
    width: 800,
    height: 600,
    webPreferences: {
      preload: o.join(f, "preload.mjs"),
      sandbox: !1
    }
  }), E ? e.loadURL(E) : e.loadFile(o.join(T, "index.html")), e.webContents.on("before-input-event", (t, s) => {
    s.key === "F12" && (e == null || e.webContents.toggleDevTools(), t.preventDefault());
  }), p.handle("copy-to-clipboard", (t, s) => {
    P.writeText(s);
  });
}
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (c.quit(), e = null);
});
let _ = null;
c.whenReady().then(async () => {
  var t;
  h();
  try {
    const s = await import("./index-D0beepi9.js"), n = await import("./logger-pykWGsbv.js");
    n.logEmitter && n.logEmitter.on("log", (i) => {
      e == null || e.webContents.send("log", i);
    }), u = s.bootstrapBroadcastServer;
  } catch (s) {
    e == null || e.webContents.send("log", "Failed to load API module: " + s);
  }
  try {
    _ = await u(), e == null || e.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (s) {
    e == null || e.webContents.send("log", "Error starting API: " + s);
  }
  try {
    const s = c.isPackaged ? o.join(process.resourcesPath, "cloudflared-windows-amd64.exe") : o.join(c.getAppPath(), "resources", "cloudflared-windows-amd64.exe");
    e == null || e.webContents.send("log", "Starting Cloudflare Tunnel..."), a = C(s, ["tunnel", "--url", "http://localhost:8080"]), (t = a.stderr) == null || t.on("data", (n) => {
      const r = n.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      r && !d && (d = r[0], e == null || e.webContents.send("tunnel-url", d), e == null || e.webContents.send("log", "Cloudflare tunnel established: " + d));
    }), a.on("error", (n) => {
      e == null || e.webContents.send("log", "Error starting Cloudflare Tunnel: " + n);
    }), a.on("exit", (n) => {
      e == null || e.webContents.send("log", "Cloudflare Tunnel exited with code: " + n);
    });
  } catch (s) {
    e == null || e.webContents.send("log", "Error spawning Cloudflare Tunnel: " + s);
  }
});
p.handle("get-tunnel-url", () => d);
p.handle("get-broadcast-secret", () => process.env.BROADCAST_SECRET);
p.handle("obs-connect", async (t, s, n, i) => {
  if (!_) return { ok: !1, error: "API not started" };
  try {
    e == null || e.webContents.send("log", `Connecting OBS to ${s}:${n}...`);
    const r = await _.obs.connect({ host: s, port: n, password: i });
    return r.ok ? e == null || e.webContents.send("log", "OBS Connected successfully.") : e == null || e.webContents.send("log", "OBS Connection failed: " + r.error), r;
  } catch (r) {
    return { ok: !1, error: String(r) };
  }
});
export {
  y as MAIN_DIST,
  T as RENDERER_DIST,
  E as VITE_DEV_SERVER_URL
};

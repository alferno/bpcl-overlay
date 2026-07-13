import { dialog as f, app as l, ipcMain as i, BrowserWindow as m, clipboard as C } from "electron";
import t from "node:path";
import { fileURLToPath as h } from "node:url";
import { spawn as v } from "node:child_process";
import { createHash as P } from "node:crypto";
import u from "node:os";
const R = t.dirname(h(import.meta.url));
process.env.APP_ROOT = t.join(R, "..");
process.on("uncaughtException", (o) => {
  console.error("Uncaught Exception:", o), f.showErrorBox("Main Process Uncaught Exception", o.stack || o.message || String(o));
});
process.on("unhandledRejection", (o) => {
  console.error("Unhandled Rejection:", o);
  const s = o instanceof Error ? o.stack || o.message : String(o);
  f.showErrorBox("Main Process Unhandled Rejection", s);
});
process.env.BROADCAST_SECRET || (process.env.BROADCAST_SECRET = P("sha256").update(u.hostname() + u.userInfo().username).digest("hex").slice(0, 32));
process.env.LEAGUE_ID || (process.env.LEAGUE_ID = "19721");
process.env.NODE_ENV || (process.env.NODE_ENV = "production");
process.env.PORT || (process.env.PORT = "8080");
process.env.STATE_BACKEND || (process.env.STATE_BACKEND = "memory");
process.env.CORS_ORIGINS || (process.env.CORS_ORIGINS = "*");
process.env.STEAM_WEB_API_KEY || (process.env.STEAM_WEB_API_KEY = "E5DE5CF0D74F982E7FCB0AC3DE13393F");
process.env.LEAGUE_AUTO_AGGREGATE || (process.env.LEAGUE_AUTO_AGGREGATE = "false");
const S = l.getPath("documents"), r = t.join(S, "BPCLBroadcast");
process.env.REPLAY_DB_FILE || (process.env.REPLAY_DB_FILE = t.join(r, "System", "replay_db.csv"));
process.env.REPLAY_MATCH_FILE || (process.env.REPLAY_MATCH_FILE = t.join(r, "System", "active_match.txt"));
process.env.REPLAY_LAST_COMPLETED_FILE || (process.env.REPLAY_LAST_COMPLETED_FILE = t.join(r, "System", "last_completed_match.txt"));
process.env.REPLAY_PLAYBACK_DIR || (process.env.REPLAY_PLAYBACK_DIR = t.join(r, "Playback"));
process.env.REPLAY_FOLDER || (process.env.REPLAY_FOLDER = t.join(r, "Replays"));
process.env.ROSTER_CSV_PATH || (process.env.ROSTER_CSV_PATH = t.join(r, "System", "Rosters", "players_roster_prepared.csv"));
process.env.LEAGUE_STATS_DIR || (process.env.LEAGUE_STATS_DIR = t.join(r, "System", "Stats"));
let A;
process.env.BPC_NO_EXIT = "1";
const E = process.env.VITE_DEV_SERVER_URL, y = t.join(process.env.APP_ROOT, "dist-electron"), T = t.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = E ? t.join(process.env.APP_ROOT, "public") : T;
let e, p = null, a = null;
l.on("before-quit", () => {
  a && (a.kill(), a = null);
});
async function g() {
  e = new m({
    width: 800,
    height: 600,
    webPreferences: {
      preload: t.join(R, "preload.mjs"),
      sandbox: !1
    }
  }), E ? e.loadURL(E) : e.loadFile(t.join(T, "index.html")), e.webContents.on("before-input-event", (o, s) => {
    s.key === "F12" && (e == null || e.webContents.toggleDevTools(), o.preventDefault());
  }), i.handle("copy-to-clipboard", (o, s) => {
    C.writeText(s);
  });
}
l.on("window-all-closed", () => {
  process.platform !== "darwin" && (l.quit(), e = null);
});
let _ = null;
l.whenReady().then(async () => {
  var o;
  g();
  try {
    const s = await import("./index-8spIQoqq.js"), n = await import("./logger-BnSEN-vi.js").then((d) => d.b);
    n.logEmitter && n.logEmitter.on("log", (d) => {
      e == null || e.webContents.send("log", d);
    }), A = s.bootstrapBroadcastServer;
  } catch (s) {
    e == null || e.webContents.send("log", "Failed to load API module: " + s);
  }
  try {
    _ = await A(), e == null || e.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (s) {
    e == null || e.webContents.send("log", "Error starting API: " + s);
  }
  try {
    const s = l.isPackaged ? t.join(process.resourcesPath, "cloudflared-windows-amd64.exe") : t.join(l.getAppPath(), "resources", "cloudflared-windows-amd64.exe");
    e == null || e.webContents.send("log", "Starting Cloudflare Tunnel..."), a = v(s, ["tunnel", "--url", "http://localhost:8080"]), (o = a.stderr) == null || o.on("data", (n) => {
      const c = n.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      c && !p && (p = c[0], e == null || e.webContents.send("tunnel-url", p), e == null || e.webContents.send("log", "Cloudflare tunnel established: " + p));
    }), a.on("error", (n) => {
      e == null || e.webContents.send("log", "Error starting Cloudflare Tunnel: " + n);
    }), a.on("exit", (n) => {
      e == null || e.webContents.send("log", "Cloudflare Tunnel exited with code: " + n);
    });
  } catch (s) {
    e == null || e.webContents.send("log", "Error spawning Cloudflare Tunnel: " + s);
  }
});
i.handle("get-tunnel-url", () => p);
i.handle("get-broadcast-secret", () => process.env.BROADCAST_SECRET);
i.handle("get-broadcast-data-dir", () => r);
i.handle("open-data-folder", async () => {
  try {
    const { shell: o } = await import("electron");
    return await o.openPath(r), { ok: !0 };
  } catch (o) {
    return { ok: !1, error: String(o) };
  }
});
i.handle("obs-connect", async (o, s, n, d) => {
  if (!_) return { ok: !1, error: "API not started" };
  try {
    e == null || e.webContents.send("log", `Connecting OBS to ${s}:${n}...`);
    const c = await _.obs.connect({ host: s, port: n, password: d });
    return c.ok ? e == null || e.webContents.send("log", "OBS Connected successfully.") : e == null || e.webContents.send("log", "OBS Connection failed: " + c.error), c;
  } catch (c) {
    return { ok: !1, error: String(c) };
  }
});
export {
  y as MAIN_DIST,
  T as RENDERER_DIST,
  E as VITE_DEV_SERVER_URL
};

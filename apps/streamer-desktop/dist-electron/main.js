import { dialog as A, app as c, ipcMain as E, BrowserWindow as T, clipboard as f } from "electron";
import o from "node:path";
import { fileURLToPath as S } from "node:url";
import m from "@ngrok/ngrok";
import { createHash as C } from "node:crypto";
import _ from "node:os";
const R = o.dirname(S(import.meta.url));
process.env.APP_ROOT = o.join(R, "..");
process.on("uncaughtException", (s) => {
  console.error("Uncaught Exception:", s), A.showErrorBox("Main Process Uncaught Exception", s.stack || s.message || String(s));
});
process.on("unhandledRejection", (s) => {
  console.error("Unhandled Rejection:", s);
  const n = s instanceof Error ? s.stack || s.message : String(s);
  A.showErrorBox("Main Process Unhandled Rejection", n);
});
process.env.BROADCAST_SECRET || (process.env.BROADCAST_SECRET = C("sha256").update(_.hostname() + _.userInfo().username).digest("hex").slice(0, 32));
process.env.LEAGUE_ID || (process.env.LEAGUE_ID = "19721");
process.env.NODE_ENV || (process.env.NODE_ENV = "production");
process.env.PORT || (process.env.PORT = "8080");
process.env.STATE_BACKEND || (process.env.STATE_BACKEND = "memory");
process.env.CORS_ORIGINS || (process.env.CORS_ORIGINS = "*");
process.env.STEAM_WEB_API_KEY || (process.env.STEAM_WEB_API_KEY = "E5DE5CF0D74F982E7FCB0AC3DE13393F");
process.env.LEAGUE_AUTO_AGGREGATE || (process.env.LEAGUE_AUTO_AGGREGATE = "false");
const L = o.dirname(c.getPath("exe")), t = c.isPackaged ? o.join(L, "BroadcastData") : o.join(process.env.APP_ROOT, "BroadcastData");
process.env.REPLAY_DB_FILE || (process.env.REPLAY_DB_FILE = o.join(t, "System", "replay_db.csv"));
process.env.REPLAY_MATCH_FILE || (process.env.REPLAY_MATCH_FILE = o.join(t, "System", "active_match.txt"));
process.env.REPLAY_LAST_COMPLETED_FILE || (process.env.REPLAY_LAST_COMPLETED_FILE = o.join(t, "System", "last_completed_match.txt"));
process.env.REPLAY_PLAYBACK_DIR || (process.env.REPLAY_PLAYBACK_DIR = o.join(t, "Playback"));
process.env.REPLAY_FOLDER || (process.env.REPLAY_FOLDER = o.join(t, "Replays"));
process.env.ROSTER_CSV_PATH || (process.env.ROSTER_CSV_PATH = o.join(t, "System", "Rosters", "players_roster_prepared.csv"));
process.env.LEAGUE_STATS_DIR || (process.env.LEAGUE_STATS_DIR = o.join(t, "System", "Stats"));
let d;
process.env.BPC_NO_EXIT = "1";
const l = process.env.VITE_DEV_SERVER_URL, B = o.join(process.env.APP_ROOT, "dist-electron"), v = o.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = l ? o.join(process.env.APP_ROOT, "public") : v;
let e, a = null;
async function u() {
  e = new T({
    width: 800,
    height: 600,
    webPreferences: {
      preload: o.join(R, "preload.mjs"),
      sandbox: !1
    }
  }), l ? e.loadURL(l) : e.loadFile(o.join(v, "index.html")), e.webContents.on("before-input-event", (s, n) => {
    n.key === "F12" && (e == null || e.webContents.toggleDevTools(), s.preventDefault());
  }), E.handle("copy-to-clipboard", (s, n) => {
    f.writeText(n);
  });
}
c.on("window-all-closed", () => {
  process.platform !== "darwin" && (c.quit(), e = null);
});
let i = null;
c.whenReady().then(async () => {
  u();
  try {
    d = (await import("./index-DR7HbGKW.js")).bootstrapBroadcastServer;
  } catch (s) {
    e == null || e.webContents.send("log", "Failed to load API module: " + s);
  }
  try {
    i = await d(), e == null || e.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (s) {
    e == null || e.webContents.send("log", "Error starting API: " + s);
  }
  try {
    a = (await m.forward({ addr: 8080, authtoken: "25ZebxW6Y4x5PWoRwLhfY_6Qcr75LEn1PPifYovuxU3" })).url() ?? null, e == null || e.webContents.send("ngrok-url", a), e == null || e.webContents.send("log", "Ngrok tunnel established: " + a);
  } catch (s) {
    e == null || e.webContents.send("log", "Error starting Ngrok: " + s);
  }
});
E.handle("get-tunnel-url", () => a);
E.handle("get-broadcast-secret", () => process.env.BROADCAST_SECRET);
E.handle("obs-connect", async (s, n, p, P) => {
  if (!i) return { ok: !1, error: "API not started" };
  try {
    e == null || e.webContents.send("log", `Connecting OBS to ${n}:${p}...`);
    const r = await i.obs.connect({ host: n, port: p, password: P });
    return r.ok ? e == null || e.webContents.send("log", "OBS Connected successfully.") : e == null || e.webContents.send("log", "OBS Connection failed: " + r.error), r;
  } catch (r) {
    return { ok: !1, error: String(r) };
  }
});
export {
  B as MAIN_DIST,
  v as RENDERER_DIST,
  l as VITE_DEV_SERVER_URL
};

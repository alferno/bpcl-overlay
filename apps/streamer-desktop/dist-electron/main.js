import { dialog as A, app as l, ipcMain as a, BrowserWindow as P, clipboard as m } from "electron";
import s from "node:path";
import { fileURLToPath as T } from "node:url";
import u from "@ngrok/ngrok";
import { createHash as C } from "node:crypto";
import E from "node:os";
const R = s.dirname(T(import.meta.url));
process.env.APP_ROOT = s.join(R, "..");
process.on("uncaughtException", (o) => {
  console.error("Uncaught Exception:", o), A.showErrorBox("Main Process Uncaught Exception", o.stack || o.message || String(o));
});
process.on("unhandledRejection", (o) => {
  console.error("Unhandled Rejection:", o);
  const n = o instanceof Error ? o.stack || o.message : String(o);
  A.showErrorBox("Main Process Unhandled Rejection", n);
});
process.env.BROADCAST_SECRET || (process.env.BROADCAST_SECRET = C("sha256").update(E.hostname() + E.userInfo().username).digest("hex").slice(0, 32));
process.env.LEAGUE_ID || (process.env.LEAGUE_ID = "19721");
process.env.NODE_ENV || (process.env.NODE_ENV = "production");
process.env.PORT || (process.env.PORT = "8080");
process.env.STATE_BACKEND || (process.env.STATE_BACKEND = "memory");
process.env.CORS_ORIGINS || (process.env.CORS_ORIGINS = "*");
process.env.STEAM_WEB_API_KEY || (process.env.STEAM_WEB_API_KEY = "E5DE5CF0D74F982E7FCB0AC3DE13393F");
process.env.LEAGUE_AUTO_AGGREGATE || (process.env.LEAGUE_AUTO_AGGREGATE = "false");
const L = E.homedir(), r = s.join(L, "Videos", "BPCL S2 Broadcast");
process.env.REPLAY_DB_FILE || (process.env.REPLAY_DB_FILE = s.join(r, "System", "replay_db.csv"));
process.env.REPLAY_MATCH_FILE || (process.env.REPLAY_MATCH_FILE = s.join(r, "System", "active_match.txt"));
process.env.REPLAY_LAST_COMPLETED_FILE || (process.env.REPLAY_LAST_COMPLETED_FILE = s.join(r, "System", "last_completed_match.txt"));
process.env.REPLAY_PLAYBACK_DIR || (process.env.REPLAY_PLAYBACK_DIR = s.join(r, "Playback"));
process.env.REPLAY_FOLDER || (process.env.REPLAY_FOLDER = s.join(r, "Replays"));
let d;
process.env.BPC_NO_EXIT = "1";
const i = process.env.VITE_DEV_SERVER_URL, B = s.join(process.env.APP_ROOT, "dist-electron"), f = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = i ? s.join(process.env.APP_ROOT, "public") : f;
let e, c = null;
async function h() {
  e = new P({
    width: 800,
    height: 600,
    webPreferences: {
      preload: s.join(R, "preload.mjs"),
      sandbox: !1
    }
  }), i ? e.loadURL(i) : e.loadFile(s.join(f, "index.html")), e.webContents.on("before-input-event", (o, n) => {
    n.key === "F12" && (e == null || e.webContents.toggleDevTools(), o.preventDefault());
  }), a.handle("copy-to-clipboard", (o, n) => {
    m.writeText(n);
  });
}
l.on("window-all-closed", () => {
  process.platform !== "darwin" && (l.quit(), e = null);
});
let p = null;
l.whenReady().then(async () => {
  h();
  try {
    d = (await import("./index-DdyZc2mA.js")).bootstrapBroadcastServer;
  } catch (o) {
    e == null || e.webContents.send("log", "Failed to load API module: " + o);
  }
  try {
    p = await d(), e == null || e.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (o) {
    e == null || e.webContents.send("log", "Error starting API: " + o);
  }
  try {
    c = (await u.forward({ addr: 8080, authtoken: "25ZebxW6Y4x5PWoRwLhfY_6Qcr75LEn1PPifYovuxU3" })).url() ?? null, e == null || e.webContents.send("ngrok-url", c), e == null || e.webContents.send("log", "Ngrok tunnel established: " + c);
  } catch (o) {
    e == null || e.webContents.send("log", "Error starting Ngrok: " + o);
  }
});
a.handle("get-tunnel-url", () => c);
a.handle("get-broadcast-secret", () => process.env.BROADCAST_SECRET);
a.handle("obs-connect", async (o, n, _, v) => {
  if (!p) return { ok: !1, error: "API not started" };
  try {
    e == null || e.webContents.send("log", `Connecting OBS to ${n}:${_}...`);
    const t = await p.obs.connect({ host: n, port: _, password: v });
    return t.ok ? e == null || e.webContents.send("log", "OBS Connected successfully.") : e == null || e.webContents.send("log", "OBS Connection failed: " + t.error), t;
  } catch (t) {
    return { ok: !1, error: String(t) };
  }
});
export {
  B as MAIN_DIST,
  f as RENDERER_DIST,
  i as VITE_DEV_SERVER_URL
};

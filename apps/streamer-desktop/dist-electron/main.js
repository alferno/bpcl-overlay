import { dialog as P, app as i, ipcMain as p, BrowserWindow as I, clipboard as L } from "electron";
import s from "node:path";
import { fileURLToPath as D } from "node:url";
import { spawn as O, execSync as B } from "node:child_process";
import { createHash as j } from "node:crypto";
import R from "node:os";
import d from "node:fs";
const T = s.dirname(D(import.meta.url));
process.env.APP_ROOT = s.join(T, "..");
process.on("uncaughtException", (t) => {
  console.error("Uncaught Exception:", t), P.showErrorBox("Main Process Uncaught Exception", t.stack || t.message || String(t));
});
process.on("unhandledRejection", (t) => {
  console.error("Unhandled Rejection:", t);
  const o = t instanceof Error ? t.stack || t.message : String(t);
  P.showErrorBox("Main Process Unhandled Rejection", o);
});
process.env.BROADCAST_SECRET || (process.env.BROADCAST_SECRET = j("sha256").update(R.hostname() + R.userInfo().username).digest("hex").slice(0, 32));
process.env.LEAGUE_ID || (process.env.LEAGUE_ID = "19721");
process.env.NODE_ENV || (process.env.NODE_ENV = "production");
process.env.PORT || (process.env.PORT = "8080");
process.env.STATE_BACKEND || (process.env.STATE_BACKEND = "memory");
process.env.CORS_ORIGINS || (process.env.CORS_ORIGINS = "*");
process.env.STEAM_WEB_API_KEY || (process.env.STEAM_WEB_API_KEY = "E5DE5CF0D74F982E7FCB0AC3DE13393F");
process.env.LEAGUE_AUTO_AGGREGATE || (process.env.LEAGUE_AUTO_AGGREGATE = "false");
const x = i.getPath("documents"), c = s.join(x, "BPCLBroadcast");
process.env.REPLAY_DB_FILE || (process.env.REPLAY_DB_FILE = s.join(c, "System", "replay_db.csv"));
process.env.REPLAY_MATCH_FILE || (process.env.REPLAY_MATCH_FILE = s.join(c, "System", "active_match.txt"));
process.env.REPLAY_LAST_COMPLETED_FILE || (process.env.REPLAY_LAST_COMPLETED_FILE = s.join(c, "System", "last_completed_match.txt"));
process.env.REPLAY_PLAYBACK_DIR || (process.env.REPLAY_PLAYBACK_DIR = s.join(c, "Playback"));
process.env.REPLAY_FOLDER || (process.env.REPLAY_FOLDER = s.join(c, "Replays"));
process.env.ROSTER_CSV_PATH || (process.env.ROSTER_CSV_PATH = s.join(c, "System", "Rosters", "players_roster_prepared.csv"));
process.env.LEAGUE_STATS_DIR || (process.env.LEAGUE_STATS_DIR = s.join(c, "System", "Stats"));
let v;
process.env.BPC_NO_EXIT = "1";
const m = process.env.VITE_DEV_SERVER_URL, K = s.join(process.env.APP_ROOT, "dist-electron"), b = s.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = m ? s.join(process.env.APP_ROOT, "public") : b;
let e, E = null, l = null;
i.on("before-quit", () => {
  l && (l.kill(), l = null);
});
async function F() {
  e = new I({
    width: 800,
    height: 600,
    webPreferences: {
      preload: s.join(T, "preload.mjs"),
      sandbox: !1
    }
  }), await e.webContents.session.clearCache(), m ? e.loadURL(m) : e.loadFile(s.join(b, "index.html")), e.webContents.on("before-input-event", (t, o) => {
    o.key === "F12" && (e == null || e.webContents.toggleDevTools(), t.preventDefault());
  }), p.handle("copy-to-clipboard", (t, o) => {
    L.writeText(o);
  });
}
i.on("window-all-closed", () => {
  process.platform !== "darwin" && (i.quit(), e = null);
});
let g = null;
i.whenReady().then(async () => {
  var t;
  F();
  try {
    const o = await import("./index-CBnU8AoC.js"), n = await import("./logger-CENL895K.js").then((a) => a.b);
    n.logEmitter && n.logEmitter.on("log", (a) => {
      e == null || e.webContents.send("log", a);
    }), v = o.bootstrapBroadcastServer;
  } catch (o) {
    e == null || e.webContents.send("log", "Failed to load API module: " + o);
  }
  try {
    g = await v(), e == null || e.webContents.send("log", "Broadcast API started successfully on port 8080");
  } catch (o) {
    e == null || e.webContents.send("log", "Error starting API: " + o);
  }
  try {
    G(), e == null || e.webContents.send("log", "Checked/Installed Dota 2 GSI config.");
  } catch (o) {
    e == null || e.webContents.send("log", "Failed to install Dota 2 GSI: " + o);
  }
  try {
    const o = i.isPackaged ? s.join(process.resourcesPath, "cloudflared-windows-amd64.exe") : s.join(i.getAppPath(), "resources", "cloudflared-windows-amd64.exe");
    e == null || e.webContents.send("log", "Starting Cloudflare Tunnel..."), l = O(o, ["tunnel", "--url", "http://localhost:8080"]), (t = l.stderr) == null || t.on("data", (n) => {
      const r = n.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      r && !E && (E = r[0], e == null || e.webContents.send("tunnel-url", E), e == null || e.webContents.send("log", "Cloudflare tunnel established: " + E));
    }), l.on("error", (n) => {
      e == null || e.webContents.send("log", "Error starting Cloudflare Tunnel: " + n);
    }), l.on("exit", (n) => {
      e == null || e.webContents.send("log", "Cloudflare Tunnel exited with code: " + n);
    });
  } catch (o) {
    e == null || e.webContents.send("log", "Error spawning Cloudflare Tunnel: " + o);
  }
});
p.handle("get-tunnel-url", () => E);
p.handle("get-broadcast-secret", () => process.env.BROADCAST_SECRET);
p.handle("get-broadcast-data-dir", () => c);
p.handle("open-data-folder", async () => {
  try {
    const { shell: t } = await import("electron");
    return await t.openPath(c), { ok: !0 };
  } catch (t) {
    return { ok: !1, error: String(t) };
  }
});
p.handle("obs-connect", async (t, o, n, a) => {
  if (!g) return { ok: !1, error: "API not started" };
  try {
    e == null || e.webContents.send("log", `Connecting OBS to ${o}:${n}...`);
    const r = await g.obs.connect({ host: o, port: n, password: a });
    return r.ok ? e == null || e.webContents.send("log", "OBS Connected successfully.") : e == null || e.webContents.send("log", "OBS Connection failed: " + r.error), r;
  } catch (r) {
    return { ok: !1, error: String(r) };
  }
});
function G() {
  const t = `"dota2-gsi Configuration"
{
    "uri"               "http://localhost:8080/gsi"
    "timeout"           "5.0"
    "buffer"            "0.1"
    "throttle"          "0.1"
    "heartbeat"         "30.0"
    "data"
    {
        "buildings"     "1"
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
        "draft"         "1"
        "wearables"     "1"
    }
}
`;
  try {
    const n = B("reg query HKCU\\Software\\Valve\\Steam /v SteamPath").toString().match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (!n) return;
    const a = n[1].trim(), r = [a], S = s.join(a, "steamapps", "libraryfolders.vdf");
    if (d.existsSync(S)) {
      const h = d.readFileSync(S, "utf8"), f = /"path"\s+"([^"]+)"/g;
      let A;
      for (; (A = f.exec(h)) !== null; ) {
        let C = A[1].replace(/\\\\/g, "\\");
        r.includes(C) || r.push(C);
      }
    }
    let u = null;
    for (const h of r) {
      const f = s.join(h, "steamapps", "common", "dota 2 beta");
      if (d.existsSync(f)) {
        u = f;
        break;
      }
    }
    if (!u) return;
    const _ = s.join(u, "game", "dota", "cfg", "gamestate_integration");
    d.existsSync(_) || d.mkdirSync(_, { recursive: !0 });
    const y = s.join(_, "gamestate_integration_bpcl.cfg");
    d.writeFileSync(y, t, "utf8");
  } catch (o) {
    console.error("Failed to auto-install Dota 2 GSI:", o);
  }
}
export {
  K as MAIN_DIST,
  b as RENDERER_DIST,
  m as VITE_DEV_SERVER_URL
};

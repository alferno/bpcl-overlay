import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ngrok from '@ngrok/ngrok';
import { createHash } from 'node:crypto';
import os from 'node:os';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('Main Process Uncaught Exception', error.stack || error.message || String(error));
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    dialog.showErrorBox('Main Process Unhandled Rejection', message);
});
// ── Inject API env defaults BEFORE broadcast-api/env.ts is imported ──────────
// These are safe defaults. The user can override them via the UI later.
// BROADCAST_SECRET is auto-generated per-install if not set.
if (!process.env.BROADCAST_SECRET) {
    // Generate a stable secret seeded from machine data so it survives restarts
    process.env.BROADCAST_SECRET = createHash('sha256')
        .update(os.hostname() + os.userInfo().username)
        .digest('hex')
        .slice(0, 32);
}
if (!process.env.LEAGUE_ID)
    process.env.LEAGUE_ID = '19721';
if (!process.env.NODE_ENV)
    process.env.NODE_ENV = 'production';
if (!process.env.PORT)
    process.env.PORT = '8080';
if (!process.env.STATE_BACKEND)
    process.env.STATE_BACKEND = 'memory';
if (!process.env.CORS_ORIGINS)
    process.env.CORS_ORIGINS = '*';
if (!process.env.STEAM_WEB_API_KEY)
    process.env.STEAM_WEB_API_KEY = 'E5DE5CF0D74F982E7FCB0AC3DE13393F';
if (!process.env.LEAGUE_AUTO_AGGREGATE)
    process.env.LEAGUE_AUTO_AGGREGATE = 'false';
// Replay paths — default to streamer's Videos folder
const homeDir = os.homedir();
const bpclBase = path.join(homeDir, 'Videos', 'BPCL S2 Broadcast');
if (!process.env.REPLAY_DB_FILE)
    process.env.REPLAY_DB_FILE = path.join(bpclBase, 'System', 'replay_db.csv');
if (!process.env.REPLAY_MATCH_FILE)
    process.env.REPLAY_MATCH_FILE = path.join(bpclBase, 'System', 'active_match.txt');
if (!process.env.REPLAY_LAST_COMPLETED_FILE)
    process.env.REPLAY_LAST_COMPLETED_FILE = path.join(bpclBase, 'System', 'last_completed_match.txt');
if (!process.env.REPLAY_PLAYBACK_DIR)
    process.env.REPLAY_PLAYBACK_DIR = path.join(bpclBase, 'Playback');
if (!process.env.REPLAY_FOLDER)
    process.env.REPLAY_FOLDER = path.join(bpclBase, 'Replays');
let bootstrapBroadcastServer;
// Prevent the API from exiting the process on error
process.env.BPC_NO_EXIT = "1";
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;
let win;
let tunnelUrl = null;
async function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            sandbox: false,
        },
    });
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
    }
    else {
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            win?.webContents.toggleDevTools();
            event.preventDefault();
        }
    });
    ipcMain.handle('copy-to-clipboard', (_, text) => {
        clipboard.writeText(text);
    });
}
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
        win = null;
    }
});
let apiInstances = null;
app.whenReady().then(async () => {
    createWindow();
    // Dynamically import the API — env vars above must be set first
    try {
        const mod = await import('broadcast-api/src/index.js');
        bootstrapBroadcastServer = mod.bootstrapBroadcastServer;
    }
    catch (err) {
        win?.webContents.send('log', 'Failed to load API module: ' + err);
    }
    // Start the Broadcast API locally
    try {
        apiInstances = await bootstrapBroadcastServer();
        win?.webContents.send('log', 'Broadcast API started successfully on port 8080');
    }
    catch (err) {
        win?.webContents.send('log', 'Error starting API: ' + err);
    }
    // Start Ngrok
    try {
        const listener = await ngrok.forward({ addr: 8080, authtoken: '25ZebxW6Y4x5PWoRwLhfY_6Qcr75LEn1PPifYovuxU3' });
        tunnelUrl = listener.url() ?? null;
        win?.webContents.send('ngrok-url', tunnelUrl);
        win?.webContents.send('log', 'Ngrok tunnel established: ' + tunnelUrl);
    }
    catch (err) {
        win?.webContents.send('log', 'Error starting Ngrok: ' + err);
    }
});
ipcMain.handle('get-tunnel-url', () => tunnelUrl);
ipcMain.handle('get-broadcast-secret', () => process.env.BROADCAST_SECRET);
ipcMain.handle('obs-connect', async (_, host, port, password) => {
    if (!apiInstances)
        return { ok: false, error: 'API not started' };
    try {
        win?.webContents.send('log', `Connecting OBS to ${host}:${port}...`);
        const result = await apiInstances.obs.connect({ host, port, password });
        if (result.ok) {
            win?.webContents.send('log', 'OBS Connected successfully.');
        }
        else {
            win?.webContents.send('log', 'OBS Connection failed: ' + result.error);
        }
        return result;
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});

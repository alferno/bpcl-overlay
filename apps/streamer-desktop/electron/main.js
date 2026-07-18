import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { bpclBase } from './env-setup.js';
import { bootstrapBroadcastServer } from 'broadcast-api/src/index.js';
import { logEmitter } from 'broadcast-api/src/logger.js';
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
// Prevent the API from exiting the process on error
process.env.BPC_NO_EXIT = "1";
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;
let win;
let tunnelUrl = null;
let cloudflaredProcess = null;
app.on('before-quit', () => {
    if (cloudflaredProcess) {
        cloudflaredProcess.kill();
        cloudflaredProcess = null;
    }
});
async function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            sandbox: false,
        },
    });
    // Clear cache to prevent streamers from being stuck on old versions
    await win.webContents.session.clearCache();
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
let apiStartupError = null;
app.whenReady().then(async () => {
    createWindow();
    if (logEmitter) {
        logEmitter.on('log', (msg) => {
            win?.webContents.send('log', msg);
        });
    }
    // Start the Broadcast API locally
    try {
        apiInstances = await bootstrapBroadcastServer();
        win?.webContents.send('log', 'Broadcast API started successfully on port 8080');
        win?.webContents.send('api-status', { ok: true });
    }
    catch (err) {
        apiStartupError = String(err);
        win?.webContents.send('log', 'Error starting API: ' + err);
        win?.webContents.send('api-status', { ok: false, error: apiStartupError });
    }
    // Auto-install Dota 2 GSI
    try {
        installDotaGSI();
        win?.webContents.send('log', 'Checked/Installed Dota 2 GSI config.');
    }
    catch (err) {
        win?.webContents.send('log', 'Failed to install Dota 2 GSI: ' + err);
    }
    // Start Cloudflare Tunnel
    try {
        const cloudflaredExe = app.isPackaged
            ? path.join(process.resourcesPath, 'cloudflared-windows-amd64.exe')
            : path.join(app.getAppPath(), 'resources', 'cloudflared-windows-amd64.exe');
        win?.webContents.send('log', 'Starting Cloudflare Tunnel...');
        cloudflaredProcess = spawn(cloudflaredExe, ['tunnel', '--url', 'http://localhost:8080']);
        cloudflaredProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            // Extract the trycloudflare URL
            const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match && !tunnelUrl) {
                tunnelUrl = match[0];
                win?.webContents.send('tunnel-url', tunnelUrl);
                win?.webContents.send('log', 'Cloudflare tunnel established: ' + tunnelUrl);
            }
        });
        cloudflaredProcess.on('error', (err) => {
            win?.webContents.send('log', 'Error starting Cloudflare Tunnel: ' + err);
        });
        cloudflaredProcess.on('exit', (code) => {
            win?.webContents.send('log', 'Cloudflare Tunnel exited with code: ' + code);
        });
    }
    catch (err) {
        win?.webContents.send('log', 'Error spawning Cloudflare Tunnel: ' + err);
    }
});
ipcMain.handle('get-tunnel-url', () => tunnelUrl);
ipcMain.handle('get-broadcast-secret', () => process.env.BROADCAST_SECRET);
ipcMain.handle('get-broadcast-data-dir', () => bpclBase);
ipcMain.handle('get-api-status', () => {
    if (apiInstances)
        return { ok: true };
    if (apiStartupError)
        return { ok: false, error: apiStartupError };
    return { ok: false, error: 'Starting...' };
});
/** Opens the BPCLBroadcast folder in Windows Explorer */
ipcMain.handle('open-data-folder', async () => {
    try {
        const { shell: electronShell } = await import('electron');
        await electronShell.openPath(bpclBase);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err) };
    }
});
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
// ── Auto-Installer for Dota 2 Gamestate Integration ─────────
// Bump this whenever the "data" block below changes. Lets us confirm from
// logs that a given install actually picked up the new cfg after an update.
const GSI_CFG_VERSION = 2;
function installDotaGSI() {
    const CFG_CONTENT = `"dota2-gsi Configuration"
{
    "uri"               "http://localhost:8080/gsi"
    "timeout"           "5.0"
    "buffer"            "0.1"
    "throttle"          "0.1"
    "heartbeat"         "30.0"
    "data"
    {
        "auth"          "1"
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
        "events"        "1"
        "buildings"     "1"
        "league"        "1"
        "draft"         "1"
        "wearables"     "1"
        "minimap"       "1"
        "roshan"        "1"
        "couriers"      "1"
        "neutralitems"  "1"
    }
}
`; // cfg v${GSI_CFG_VERSION}
    try {
        const regOutput = execSync('reg query HKCU\\Software\\Valve\\Steam /v SteamPath').toString();
        const match = regOutput.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (!match)
            return;
        const steamPath = match[1].trim();
        const libraries = [steamPath];
        const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdfPath)) {
            const vdfContent = fs.readFileSync(vdfPath, 'utf8');
            const pathRegex = /"path"\s+"([^"]+)"/g;
            let m;
            while ((m = pathRegex.exec(vdfContent)) !== null) {
                let libPath = m[1].replace(/\\\\/g, '\\');
                if (!libraries.includes(libPath)) {
                    libraries.push(libPath);
                }
            }
        }
        let dotaPath = null;
        for (const lib of libraries) {
            const p = path.join(lib, 'steamapps', 'common', 'dota 2 beta');
            if (fs.existsSync(p)) {
                dotaPath = p;
                break;
            }
        }
        if (!dotaPath)
            return;
        const cfgDir = path.join(dotaPath, 'game', 'dota', 'cfg', 'gamestate_integration');
        if (!fs.existsSync(cfgDir)) {
            fs.mkdirSync(cfgDir, { recursive: true });
        }
        const cfgPath = path.join(cfgDir, 'gamestate_integration_bpcl.cfg');
        const existing = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : null;
        const alreadyCurrent = existing === CFG_CONTENT;
        // Overwrite unconditionally to guarantee URI/data blocks are correct —
        // Dota only reads this file at launch, so it must always reflect the
        // build that's currently running.
        fs.writeFileSync(cfgPath, CFG_CONTENT, 'utf8');
        console.log(`[BPCL Streamer] GSI config v${GSI_CFG_VERSION} ${alreadyCurrent ? 'already current' : 'installed/updated'} at: ${cfgPath}`);
    }
    catch (err) {
        console.error('Failed to auto-install Dota 2 GSI:', err);
    }
}

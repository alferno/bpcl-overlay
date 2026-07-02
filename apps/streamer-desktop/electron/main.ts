import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  dialog.showErrorBox('Main Process Uncaught Exception', error.stack || error.message || String(error))
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason)
  dialog.showErrorBox('Main Process Unhandled Rejection', message)
})

// ── Inject API env defaults BEFORE broadcast-api/env.ts is imported ──────────
// These are safe defaults. The user can override them via the UI later.
// BROADCAST_SECRET is auto-generated per-install if not set.
if (!process.env.BROADCAST_SECRET) {
  // Generate a stable secret seeded from machine data so it survives restarts
  process.env.BROADCAST_SECRET = createHash('sha256')
    .update(os.hostname() + os.userInfo().username)
    .digest('hex')
    .slice(0, 32)
}
if (!process.env.LEAGUE_ID)           process.env.LEAGUE_ID           = '19721'
if (!process.env.NODE_ENV)            process.env.NODE_ENV            = 'production'
if (!process.env.PORT)                process.env.PORT                = '8080'
if (!process.env.STATE_BACKEND)       process.env.STATE_BACKEND       = 'memory'
if (!process.env.CORS_ORIGINS)        process.env.CORS_ORIGINS        = '*'
if (!process.env.STEAM_WEB_API_KEY)   process.env.STEAM_WEB_API_KEY   = 'E5DE5CF0D74F982E7FCB0AC3DE13393F'
if (!process.env.LEAGUE_AUTO_AGGREGATE) process.env.LEAGUE_AUTO_AGGREGATE = 'false'

// Replay & CSV paths — portable mode (inside the app folder)
const exeDir = path.dirname(app.getPath('exe'))
const bpclBase = app.isPackaged ? path.join(exeDir, 'BroadcastData') : path.join(process.env.APP_ROOT, 'BroadcastData')
if (!process.env.REPLAY_DB_FILE)              process.env.REPLAY_DB_FILE              = path.join(bpclBase, 'System', 'replay_db.csv')
if (!process.env.REPLAY_MATCH_FILE)           process.env.REPLAY_MATCH_FILE           = path.join(bpclBase, 'System', 'active_match.txt')
if (!process.env.REPLAY_LAST_COMPLETED_FILE)  process.env.REPLAY_LAST_COMPLETED_FILE  = path.join(bpclBase, 'System', 'last_completed_match.txt')
if (!process.env.REPLAY_PLAYBACK_DIR)         process.env.REPLAY_PLAYBACK_DIR         = path.join(bpclBase, 'Playback')
if (!process.env.REPLAY_FOLDER)               process.env.REPLAY_FOLDER               = path.join(bpclBase, 'Replays')
if (!process.env.ROSTER_CSV_PATH)             process.env.ROSTER_CSV_PATH             = path.join(bpclBase, 'System', 'Rosters', 'players_roster_prepared.csv')
if (!process.env.LEAGUE_STATS_DIR)            process.env.LEAGUE_STATS_DIR            = path.join(bpclBase, 'System', 'Stats')
// ─────────────────────────────────────────────────────────────────────────────

// bootstrapBroadcastServer is imported dynamically inside app.whenReady()
// to guarantee env vars above are set before broadcast-api/env.ts parses them.
type BootstrapFn = typeof import('broadcast-api/src/index.js')['bootstrapBroadcastServer']
let bootstrapBroadcastServer: BootstrapFn

// Prevent the API from exiting the process on error
process.env.BPC_NO_EXIT = "1"

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tunnelUrl: string | null = null
let cloudflaredProcess: ChildProcess | null = null

app.on('before-quit', () => {
  if (cloudflaredProcess) {
    cloudflaredProcess.kill()
    cloudflaredProcess = null
  }
})

async function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      sandbox: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  ipcMain.handle('copy-to-clipboard', (_, text) => {
    clipboard.writeText(text)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

let apiInstances: { obs: any; opendota: any; state: any; shutdown: any } | null = null

app.whenReady().then(async () => {
  createWindow()

  // Dynamically import the API — env vars above must be set first
  try {
    const mod = await import('broadcast-api/src/index.js')
    const loggerMod = await import('broadcast-api/src/logger.js')
    if (loggerMod.logEmitter) {
      loggerMod.logEmitter.on('log', (msg: string) => {
        win?.webContents.send('log', msg)
      })
    }
    bootstrapBroadcastServer = mod.bootstrapBroadcastServer
  } catch (err) {
    win?.webContents.send('log', 'Failed to load API module: ' + err)
  }

  // Start the Broadcast API locally
  try {
    apiInstances = await bootstrapBroadcastServer()
    win?.webContents.send('log', 'Broadcast API started successfully on port 8080')
  } catch (err) {
    win?.webContents.send('log', 'Error starting API: ' + err)
  }

  // Start Cloudflare Tunnel
  try {
    const cloudflaredExe = app.isPackaged
      ? path.join(process.resourcesPath, 'cloudflared-windows-amd64.exe')
      : path.join(app.getAppPath(), 'resources', 'cloudflared-windows-amd64.exe')
      
    win?.webContents.send('log', 'Starting Cloudflare Tunnel...')
    
    cloudflaredProcess = spawn(cloudflaredExe, ['tunnel', '--url', 'http://localhost:8080'])
    
    cloudflaredProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      // Extract the trycloudflare URL
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
      if (match && !tunnelUrl) {
        tunnelUrl = match[0]
        win?.webContents.send('tunnel-url', tunnelUrl)
        win?.webContents.send('log', 'Cloudflare tunnel established: ' + tunnelUrl)
      }
    })
    
    cloudflaredProcess.on('error', (err) => {
      win?.webContents.send('log', 'Error starting Cloudflare Tunnel: ' + err)
    })
    
    cloudflaredProcess.on('exit', (code) => {
      win?.webContents.send('log', 'Cloudflare Tunnel exited with code: ' + code)
    })
  } catch (err) {
    win?.webContents.send('log', 'Error spawning Cloudflare Tunnel: ' + err)
  }
})

ipcMain.handle('get-tunnel-url', () => tunnelUrl)
ipcMain.handle('get-broadcast-secret', () => process.env.BROADCAST_SECRET)

ipcMain.handle('obs-connect', async (_, host, port, password) => {
  if (!apiInstances) return { ok: false, error: 'API not started' }
  try {
    win?.webContents.send('log', `Connecting OBS to ${host}:${port}...`)
    const result = await apiInstances.obs.connect({ host, port, password })
    if (result.ok) {
      win?.webContents.send('log', 'OBS Connected successfully.')
    } else {
      win?.webContents.send('log', 'OBS Connection failed: ' + result.error)
    }
    return result
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

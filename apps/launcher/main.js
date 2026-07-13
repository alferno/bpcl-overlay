'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const https = require('node:https')
const http = require('node:http')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { exec } = require('node:child_process')
const util = require('node:util')
const execPromise = util.promisify(exec)

// ─── Constants ───────────────────────────────────────────────────────────────
// version.json lives in the main branch of the production repo.
// The file is at: releases/version.json
const GITHUB_REPO   = 'alferno/bpcl-overlay'
const VERSION_JSON_URL =
  `https://raw.githubusercontent.com/${GITHUB_REPO}/main/releases/version.json`

const INSTALL_DIR = path.join(app.getPath('appData'), 'BPCLStreamer')
const LOCAL_VERSION_FILE = path.join(INSTALL_DIR, 'version.txt')

// Ensure install directory exists on startup
fs.mkdirSync(INSTALL_DIR, { recursive: true })

// ─── Window ──────────────────────────────────────────────────────────────────
let win

function createWindow () {
  win = new BrowserWindow({
    width: 560,
    height: 380,
    resizable: false,
    frame: false,
    backgroundColor: '#0f0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('index.html')

  // Uncomment to open DevTools during development:
  // win.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

// ─── Helper: fetch JSON over HTTPS ───────────────────────────────────────────
function fetchJson (url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchJson(res.headers.location))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`))
      }
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body.trim().replace(/^\uFEFF/, ''))) }
        catch (e) { reject(new Error('Invalid JSON: ' + e.message)) }
      })
    }).on('error', reject)
  })
}

// ─── Helper: download file with progress ─────────────────────────────────────
function downloadFile (url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(downloadFile(res.headers.location, dest, onProgress))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0

      const out = fs.createWriteStream(dest)
      res.on('data', (chunk) => {
        received += chunk.length
        out.write(chunk)
        if (total > 0 && typeof onProgress === 'function') {
          onProgress(Math.round((received / total) * 100))
        }
      })
      res.on('end', () => {
        out.end()
        out.on('finish', resolve)
        out.on('error', reject)
      })
      res.on('error', (err) => {
        out.destroy()
        reject(err)
      })
    }).on('error', reject)
  })
}

// ─── Helper: recursively find an exe (max 2 levels deep) ─────────────────────
function findExe (dir, depth = 0) {
  if (depth > 2) return null
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch { return null }

  // Names we're looking for (case-insensitive)
  const candidates = ['BPCLStreamer.exe', 'BPCL Streamer Desktop.exe']

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      const lower = entry.name.toLowerCase()
      if (
        entry.name.endsWith('.exe') &&
        (lower.includes('bpcl') || lower.includes('streamer') || lower.includes('streamer-desktop'))
      ) {
        return path.join(dir, entry.name)
      }
    }
  }

  // Check subdirectories after files
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findExe(path.join(dir, entry.name), depth + 1)
      if (found) return found
    }
  }

  return null
}

// ─── IPC: check-update ────────────────────────────────────────────────────────
ipcMain.handle('check-update', async () => {
  let localVersion = '0.0.0'
  try {
    localVersion = fs.readFileSync(LOCAL_VERSION_FILE, 'utf8').trim()
  } catch {
    // File doesn't exist — first run
  }

  const remote = await fetchJson(VERSION_JSON_URL)
  const remoteVersion = remote.version
  const downloadUrl = remote.url
  const notes = remote.notes || ''

  return {
    localVersion,
    remoteVersion,
    downloadUrl,
    notes,
    needsUpdate: remoteVersion !== localVersion
  }
})

// ─── IPC: download-and-install ────────────────────────────────────────────────
ipcMain.handle('download-and-install', async (_event, { downloadUrl, version }) => {
  try {
    const zipName = `bpcl-streamer-${version}.zip`
    const zipPath = path.join(os.tmpdir(), zipName)

    // Download with progress updates to renderer
    await downloadFile(downloadUrl, zipPath, (percent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('download-progress', percent)
      }
    })

    // Extract over existing install dir
    await execPromise(`powershell -command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${INSTALL_DIR}'"`, { windowsHide: true })

    // Persist new version
    fs.writeFileSync(LOCAL_VERSION_FILE, version, 'utf8')

    // Clean up temp zip
    try { fs.unlinkSync(zipPath) } catch { /* not critical */ }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: launch-app ─────────────────────────────────────────────────────────
ipcMain.handle('launch-app', async () => {
  try {
    const exePath = findExe(INSTALL_DIR)
    if (!exePath) {
      return { ok: false, error: `No BPCL executable found in ${INSTALL_DIR}` }
    }

    const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })
    child.unref()

    // Give the child a moment to start before quitting launcher
    setTimeout(() => app.quit(), 500)

    return { ok: true, exePath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── IPC: get-install-dir ────────────────────────────────────────────────────
ipcMain.handle('get-install-dir', () => INSTALL_DIR)

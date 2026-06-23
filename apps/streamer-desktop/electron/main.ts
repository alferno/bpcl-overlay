import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ngrok from '@ngrok/ngrok'
import { bootstrapBroadcastServer } from 'broadcast-api/src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

// Prevent the API from exiting the process on error
process.env.BPC_NO_EXIT = "1"

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tunnelUrl: string | null = null

async function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
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

  // Start the Broadcast API locally
  try {
    apiInstances = await bootstrapBroadcastServer()
    win?.webContents.send('log', 'Broadcast API started successfully on port 8080')
  } catch (err) {
    win?.webContents.send('log', 'Error starting API: ' + err)
  }

  // Start Ngrok
  try {
    const listener = await ngrok.forward({ addr: 8080, authtoken: '25ZebxW6Y4x5PWoRwLhfY_6Qcr75LEn1PPifYovuxU3' })
    tunnelUrl = listener.url() ?? null
    win?.webContents.send('ngrok-url', tunnelUrl)
    win?.webContents.send('log', 'Ngrok tunnel established: ' + tunnelUrl)
  } catch (err) {
    win?.webContents.send('log', 'Error starting Ngrok: ' + err)
  }
})

ipcMain.handle('get-tunnel-url', () => tunnelUrl)

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

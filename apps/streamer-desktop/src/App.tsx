import React, { useEffect, useState } from 'react'

declare global {
  interface Window {
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

export default function App() {
  const [logs, setLogs] = useState<string[]>([])
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [broadcastSecret, setBroadcastSecret] = useState<string | null>(null)
  const [dataDir, setDataDir] = useState<string | null>(null)
  const [openFolderStatus, setOpenFolderStatus] = useState<string | null>(null)

  const [apiStatus, setApiStatus] = useState('Starting local API...')

  useEffect(() => {
    const unsubLog = window.ipcRenderer?.on('log', (_, msg) => {
      setLogs((prev) => [...prev, msg])
    })
    const unsubTunnel = window.ipcRenderer?.on('tunnel-url', (_, url) => {
      setTunnelUrl(url)
    })
    const unsubApi = window.ipcRenderer?.on('api-status', (_, status) => {
      setApiStatus(status.ok ? 'Local API ready' : `Local API failed: ${status.error || 'unknown error'}`)
    })

    // Fetch initial URL, secret, and data directory path
    if (window.ipcRenderer) {
      window.ipcRenderer.invoke('get-tunnel-url').then((url) => {
        if (url) setTunnelUrl(url)
      })
      window.ipcRenderer.invoke('get-broadcast-secret').then((secret) => {
        if (secret) setBroadcastSecret(secret)
      })
      window.ipcRenderer.invoke('get-broadcast-data-dir').then((dir) => {
        if (dir) setDataDir(dir)
      })
      window.ipcRenderer.invoke('get-api-status')
        .then((status) => {
          setApiStatus(status.ok ? 'Local API ready' : `Local API failed: ${status.error || 'unknown error'}`)
        })
        .catch(() => {
          // Handled via api-status event if it fails initially
        })
    }

    return () => {
      unsubLog?.()
      unsubTunnel?.()
      unsubApi?.()
    }
  }, [])

  const [obsPort, setObsPort] = useState('4455')
  const [obsPassword, setObsPassword] = useState('')

  const handleObsConnect = async () => {
    if (!window.ipcRenderer) {
      alert('IPC not available (Preload failed)')
      return
    }
    const res = await window.ipcRenderer.invoke('obs-connect', '127.0.0.1', Number(obsPort), obsPassword)
    if (res.ok) alert('Connected to OBS successfully!')
    else alert('Failed to connect: ' + res.error)
  }

  const handleCopyLink = async () => {
    if (!tunnelUrl) return
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke('copy-to-clipboard', tunnelUrl + '/admin')
      } else {
        await navigator.clipboard.writeText(tunnelUrl + '/admin')
      }
      alert('Link copied to clipboard!')
    } catch (err) {
      console.error(err)
      alert('Failed to copy link')
    }
  }

  const handleCopySecret = async () => {
    if (!broadcastSecret) return
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke('copy-to-clipboard', broadcastSecret)
      } else {
        await navigator.clipboard.writeText(broadcastSecret)
      }
      alert('Secret copied to clipboard!')
    } catch (err) {
      console.error(err)
      alert('Failed to copy secret')
    }
  }

  const handleOpenDataFolder = async () => {
    if (!window.ipcRenderer) return
    setOpenFolderStatus('Opening...')
    try {
      const res = await window.ipcRenderer.invoke('open-data-folder')
      if (res.ok) {
        setOpenFolderStatus('Opened!')
      } else {
        setOpenFolderStatus('Error: ' + res.error)
      }
    } catch (err) {
      setOpenFolderStatus('Error: ' + String(err))
    }
    setTimeout(() => setOpenFolderStatus(null), 3000)
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>BPCL Streamer Hub</h1>
      <p>Your local broadcast API and overlay host.</p>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>OBS WebSocket Setup</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            placeholder="Port (e.g. 4455)"
            value={obsPort}
            onChange={(e) => setObsPort(e.target.value)}
            style={{ padding: '0.5rem' }}
          />
          <input
            placeholder="Password"
            type="password"
            value={obsPassword}
            onChange={(e) => setObsPassword(e.target.value)}
            style={{ padding: '0.5rem' }}
          />
          <button onClick={handleObsConnect} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Connect</button>
        </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Remote Control URL &amp; Secret</h2>
        {tunnelUrl ? (
          <div>
            <p>Send this link to your admin:</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input
                readOnly
                value={tunnelUrl + '/admin'}
                style={{ flex: 1, padding: '0.5rem' }}
              />
              <button onClick={handleCopyLink} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Copy Link
              </button>
            </div>

            <p>Admin Login Secret:</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input
                readOnly
                value={broadcastSecret || 'Loading...'}
                style={{ flex: 1, padding: '0.5rem', fontFamily: 'monospace', color: '#ff4444' }}
              />
              <button onClick={handleCopySecret} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Copy Secret
              </button>
            </div>
          </div>
        ) : (
          <p>Starting tunnel...</p>
        )}
      </div>

      {/* ── Broadcast Data Folder ─────────────────────────────────────── */}
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #4a9d6e', borderRadius: '8px', background: '#f0fff4' }}>
        <h2 style={{ marginTop: 0, color: '#2d6a4f' }}>📁 Broadcast Data Folder</h2>
        <p style={{ fontSize: '13px', color: '#555', marginBottom: '0.5rem' }}>
          Rosters, match logs, and season data are stored here. Share this folder with other casters so everyone can see what's been cast.
        </p>
        {dataDir && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <input
              readOnly
              value={dataDir}
              style={{ flex: 1, padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '12px', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '4px' }}
            />
            <button
              onClick={handleOpenDataFolder}
              style={{ padding: '0.4rem 0.8rem', cursor: 'pointer', background: '#388e3c', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
            >
              Open Folder
            </button>
          </div>
        )}
        {openFolderStatus && (
          <p style={{ fontSize: '12px', color: '#2d6a4f', margin: 0 }}>{openFolderStatus}</p>
        )}
        <p style={{ fontSize: '12px', color: '#777', margin: '0.5rem 0 0' }}>
          Tip: To hand off to another caster, share the <strong>BPCLBroadcast</strong> folder via OneDrive or Google Drive. Replays stay on your local PC — only their filenames are recorded in the log.
        </p>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
        <h2>System Logs</h2>
        {logs.map((log, i) => <div key={i} style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{log}</div>)}
      </div>
    </div>
  )
}

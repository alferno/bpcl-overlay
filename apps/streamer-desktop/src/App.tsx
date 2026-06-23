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

  useEffect(() => {
    const unsubLog = window.ipcRenderer?.on('log', (_, msg) => {
      setLogs((prev) => [...prev, msg])
    })
    const unsubNgrok = window.ipcRenderer?.on('ngrok-url', (_, url) => {
      setTunnelUrl(url)
    })

    // Fetch initial URL and secret if it already started
    if (window.ipcRenderer) {
      window.ipcRenderer.invoke('get-tunnel-url').then((url) => {
        if (url) setTunnelUrl(url)
      })
      window.ipcRenderer.invoke('get-broadcast-secret').then((secret) => {
        if (secret) setBroadcastSecret(secret)
      })
    }

    return () => {
      unsubLog?.()
      unsubNgrok?.()
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
        <h2>Remote Control URL & Secret</h2>
        {tunnelUrl ? (
          <div>
            <p>Send this link to your admin:</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input 
                readOnly 
                value={tunnelUrl + "/admin"} 
                style={{ flex: 1, padding: '0.5rem' }} 
              />
              <button 
                onClick={handleCopyLink}
                style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
              >
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
              <button 
                onClick={handleCopySecret}
                style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
              >
                Copy Secret
              </button>
            </div>
          </div>
        ) : (
          <p>Starting tunnel...</p>
        )}
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
        <h2>System Logs</h2>
        {logs.map((log, i) => <div key={i} style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{log}</div>)}
      </div>
    </div>
  )
}

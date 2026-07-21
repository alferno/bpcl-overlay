import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export default function App() {
    const [logs, setLogs] = useState([]);
    const [tunnelUrl, setTunnelUrl] = useState(null);
    const [broadcastSecret, setBroadcastSecret] = useState(null);
    const [dataDir, setDataDir] = useState(null);
    const [openFolderStatus, setOpenFolderStatus] = useState(null);
    const [apiStatus, setApiStatus] = useState('Starting local API...');
    useEffect(() => {
        const unsubLog = window.ipcRenderer?.on('log', (_, msg) => {
            setLogs((prev) => [...prev, msg]);
        });
        const unsubTunnel = window.ipcRenderer?.on('tunnel-url', (_, url) => {
            setTunnelUrl(url);
        });
        const unsubApi = window.ipcRenderer?.on('api-status', (_, status) => {
            setApiStatus(status.ok ? 'Local API ready' : `Local API failed: ${status.error || 'unknown error'}`);
        });
        // Fetch initial URL, secret, and data directory path
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('get-tunnel-url').then((url) => {
                if (url)
                    setTunnelUrl(url);
            });
            window.ipcRenderer.invoke('get-broadcast-secret').then((secret) => {
                if (secret)
                    setBroadcastSecret(secret);
            });
            window.ipcRenderer.invoke('get-broadcast-data-dir').then((dir) => {
                if (dir)
                    setDataDir(dir);
            });
            window.ipcRenderer.invoke('get-api-status')
                .then((status) => {
                setApiStatus(status.ok ? 'Local API ready' : `Local API failed: ${status.error || 'unknown error'}`);
            })
                .catch(() => {
                // Handled via api-status event if it fails initially
            });
        }
        return () => {
            unsubLog?.();
            unsubTunnel?.();
            unsubApi?.();
        };
    }, []);
    const [obsPort, setObsPort] = useState('4455');
    const [obsPassword, setObsPassword] = useState('bpcls2');
    useEffect(() => {
        if (apiStatus !== 'Local API ready' || !window.ipcRenderer)
            return;
        let cancelled = false;
        const attemptConnect = async () => {
            if (cancelled)
                return;
            const res = await window.ipcRenderer.invoke('obs-connect', '127.0.0.1', 4455, 'bpcls2');
            if (res.ok) {
                setLogs(prev => [...prev, "Auto-connected to OBS successfully!"]);
            }
            else {
                setLogs(prev => [...prev, "Auto-connect to OBS failed (retrying in 5s)..."]);
                if (!cancelled) {
                    setTimeout(attemptConnect, 5000);
                }
            }
        };
        attemptConnect();
        return () => {
            cancelled = true;
        };
    }, [apiStatus]);
    const handleObsConnect = async () => {
        if (!window.ipcRenderer) {
            alert('IPC not available (Preload failed)');
            return;
        }
        const res = await window.ipcRenderer.invoke('obs-connect', '127.0.0.1', Number(obsPort), obsPassword);
        if (res.ok)
            alert('Connected to OBS successfully!');
        else
            alert('Failed to connect: ' + res.error);
    };
    const handleCopyLink = async () => {
        if (!tunnelUrl)
            return;
        try {
            if (window.ipcRenderer) {
                await window.ipcRenderer.invoke('copy-to-clipboard', tunnelUrl + '/admin');
            }
            else {
                await navigator.clipboard.writeText(tunnelUrl + '/admin');
            }
            alert('Link copied to clipboard!');
        }
        catch (err) {
            console.error(err);
            alert('Failed to copy link');
        }
    };
    const handleCopySecret = async () => {
        if (!broadcastSecret)
            return;
        try {
            if (window.ipcRenderer) {
                await window.ipcRenderer.invoke('copy-to-clipboard', broadcastSecret);
            }
            else {
                await navigator.clipboard.writeText(broadcastSecret);
            }
            alert('Secret copied to clipboard!');
        }
        catch (err) {
            console.error(err);
            alert('Failed to copy secret');
        }
    };
    const handleOpenDataFolder = async () => {
        if (!window.ipcRenderer)
            return;
        setOpenFolderStatus('Opening...');
        try {
            const res = await window.ipcRenderer.invoke('open-data-folder');
            if (res.ok) {
                setOpenFolderStatus('Opened!');
            }
            else {
                setOpenFolderStatus('Error: ' + res.error);
            }
        }
        catch (err) {
            setOpenFolderStatus('Error: ' + String(err));
        }
        setTimeout(() => setOpenFolderStatus(null), 3000);
    };
    return (_jsxs("div", { style: { padding: '2rem', fontFamily: 'sans-serif' }, children: [_jsx("h1", { children: "BPCL Streamer Hub" }), _jsx("p", { children: "Your local broadcast API and overlay host." }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "OBS WebSocket Setup" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { placeholder: "Port (e.g. 4455)", value: obsPort, onChange: (e) => setObsPort(e.target.value), style: { padding: '0.5rem' } }), _jsx("input", { placeholder: "Password", type: "password", value: obsPassword, onChange: (e) => setObsPassword(e.target.value), style: { padding: '0.5rem' } }), _jsx("button", { onClick: handleObsConnect, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Connect" })] })] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "Remote Control URL & Secret" }), tunnelUrl ? (_jsxs("div", { children: [_jsx("p", { children: "Send this link to your admin:" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { readOnly: true, value: tunnelUrl + '/admin', style: { flex: 1, padding: '0.5rem' } }), _jsx("button", { onClick: handleCopyLink, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Copy Link" })] }), _jsx("p", { children: "Admin Login Secret:" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { readOnly: true, value: broadcastSecret || 'Loading...', style: { flex: 1, padding: '0.5rem', fontFamily: 'monospace', color: '#ff4444' } }), _jsx("button", { onClick: handleCopySecret, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Copy Secret" })] })] })) : (_jsx("p", { children: "Starting tunnel..." }))] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #4a9d6e', borderRadius: '8px', background: '#f0fff4' }, children: [_jsx("h2", { style: { marginTop: 0, color: '#2d6a4f' }, children: "\uD83D\uDCC1 Broadcast Data Folder" }), _jsx("p", { style: { fontSize: '13px', color: '#555', marginBottom: '0.5rem' }, children: "Rosters, match logs, and season data are stored here. Share this folder with other casters so everyone can see what's been cast." }), dataDir && (_jsxs("div", { style: { display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }, children: [_jsx("input", { readOnly: true, value: dataDir, style: { flex: 1, padding: '0.4rem 0.6rem', fontFamily: 'monospace', fontSize: '12px', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '4px' } }), _jsx("button", { onClick: handleOpenDataFolder, style: { padding: '0.4rem 0.8rem', cursor: 'pointer', background: '#388e3c', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }, children: "Open Folder" })] })), openFolderStatus && (_jsx("p", { style: { fontSize: '12px', color: '#2d6a4f', margin: 0 }, children: openFolderStatus })), _jsxs("p", { style: { fontSize: '12px', color: '#777', margin: '0.5rem 0 0' }, children: ["Tip: To hand off to another caster, share the ", _jsx("strong", { children: "BPCLBroadcast" }), " folder via OneDrive or Google Drive. Replays stay on your local PC \u2014 only their filenames are recorded in the log."] })] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }, children: [_jsx("h2", { children: "System Logs" }), logs.map((log, i) => _jsx("div", { style: { fontSize: '12px', color: '#666', marginBottom: '4px' }, children: log }, i))] })] }));
}

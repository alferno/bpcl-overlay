import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export default function App() {
    const [logs, setLogs] = useState([]);
    const [tunnelUrl, setTunnelUrl] = useState(null);
    const [broadcastSecret, setBroadcastSecret] = useState(null);
    useEffect(() => {
        const unsubLog = window.ipcRenderer?.on('log', (_, msg) => {
            setLogs((prev) => [...prev, msg]);
        });
        const unsubTunnel = window.ipcRenderer?.on('tunnel-url', (_, url) => {
            setTunnelUrl(url);
        });
        // Fetch initial URL and secret if it already started
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('get-tunnel-url').then((url) => {
                if (url)
                    setTunnelUrl(url);
            });
            window.ipcRenderer.invoke('get-broadcast-secret').then((secret) => {
                if (secret)
                    setBroadcastSecret(secret);
            });
        }
        return () => {
            unsubLog?.();
            unsubTunnel?.();
        };
    }, []);
    const [obsPort, setObsPort] = useState('4455');
    const [obsPassword, setObsPassword] = useState('');
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
    return (_jsxs("div", { style: { padding: '2rem', fontFamily: 'sans-serif' }, children: [_jsx("h1", { children: "BPCL Streamer Hub" }), _jsx("p", { children: "Your local broadcast API and overlay host." }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "OBS WebSocket Setup" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { placeholder: "Port (e.g. 4455)", value: obsPort, onChange: (e) => setObsPort(e.target.value), style: { padding: '0.5rem' } }), _jsx("input", { placeholder: "Password", type: "password", value: obsPassword, onChange: (e) => setObsPassword(e.target.value), style: { padding: '0.5rem' } }), _jsx("button", { onClick: handleObsConnect, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Connect" })] })] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "Remote Control URL & Secret" }), tunnelUrl ? (_jsxs("div", { children: [_jsx("p", { children: "Send this link to your admin:" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { readOnly: true, value: tunnelUrl + "/admin", style: { flex: 1, padding: '0.5rem' } }), _jsx("button", { onClick: handleCopyLink, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Copy Link" })] }), _jsx("p", { children: "Admin Login Secret:" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { readOnly: true, value: broadcastSecret || 'Loading...', style: { flex: 1, padding: '0.5rem', fontFamily: 'monospace', color: '#ff4444' } }), _jsx("button", { onClick: handleCopySecret, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Copy Secret" })] })] })) : (_jsx("p", { children: "Starting tunnel..." }))] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }, children: [_jsx("h2", { children: "System Logs" }), logs.map((log, i) => _jsx("div", { style: { fontSize: '12px', color: '#666', marginBottom: '4px' }, children: log }, i))] })] }));
}

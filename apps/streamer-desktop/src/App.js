import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export default function App() {
    const [logs, setLogs] = useState([]);
    const [tunnelUrl, setTunnelUrl] = useState(null);
    useEffect(() => {
        const unsubLog = window.ipcRenderer.on('log', (_, msg) => {
            setLogs((prev) => [...prev, msg]);
        });
        const unsubNgrok = window.ipcRenderer.on('ngrok-url', (_, url) => {
            setTunnelUrl(url);
        });
        // Fetch initial URL if it already started
        window.ipcRenderer.invoke('get-tunnel-url').then((url) => {
            if (url)
                setTunnelUrl(url);
        });
        return () => {
            unsubLog();
            unsubNgrok();
        };
    }, []);
    const [obsPort, setObsPort] = useState('4455');
    const [obsPassword, setObsPassword] = useState('');
    const handleObsConnect = async () => {
        const res = await window.ipcRenderer.invoke('obs-connect', '127.0.0.1', Number(obsPort), obsPassword);
        if (res.ok)
            alert('Connected to OBS successfully!');
        else
            alert('Failed to connect: ' + res.error);
    };
    return (_jsxs("div", { style: { padding: '2rem', fontFamily: 'sans-serif' }, children: [_jsx("h1", { children: "BPCL Streamer Hub" }), _jsx("p", { children: "Your local broadcast API and overlay host." }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "OBS WebSocket Setup" }), _jsxs("div", { style: { display: 'flex', gap: '1rem', marginBottom: '1rem' }, children: [_jsx("input", { placeholder: "Port (e.g. 4455)", value: obsPort, onChange: (e) => setObsPort(e.target.value), style: { padding: '0.5rem' } }), _jsx("input", { placeholder: "Password", type: "password", value: obsPassword, onChange: (e) => setObsPassword(e.target.value), style: { padding: '0.5rem' } }), _jsx("button", { onClick: handleObsConnect, style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Connect" })] })] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }, children: [_jsx("h2", { children: "Remote Control URL" }), tunnelUrl ? (_jsxs("div", { children: [_jsx("p", { children: "Send this link to your admin:" }), _jsx("input", { readOnly: true, value: tunnelUrl, style: { width: '100%', padding: '0.5rem', marginBottom: '1rem' } }), _jsx("button", { onClick: () => navigator.clipboard.writeText(tunnelUrl), style: { padding: '0.5rem 1rem', cursor: 'pointer' }, children: "Copy Link" })] })) : (_jsx("p", { children: "Starting tunnel..." }))] }), _jsxs("div", { style: { marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }, children: [_jsx("h2", { children: "System Logs" }), logs.map((log, i) => _jsx("div", { style: { fontSize: '12px', color: '#666', marginBottom: '4px' }, children: log }, i))] })] }));
}

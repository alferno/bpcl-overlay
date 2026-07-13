import { useState } from "react";
import { Btn, apiFetch } from "./Common";

export function ObsBlock(props: { origin: string; token: string }) {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(4455);
  const [pass, setPass] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [overlayBaseUrl, setOverlayBaseUrl] = useState("http://127.0.0.1:8080/overlay/");

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch(props.origin, props.token, path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t);
      return t ? JSON.parse(t) : {};
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  async function reloadScenes() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch(props.origin, props.token, "/api/obs/scenes");
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as { scenes?: string[] };
      setScenes(j.scenes ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-sky-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-200">OBS Controller</h2>
        </div>
        <Btn variant="ghost" className="!py-1 !px-2.5 !text-[10px]" disabled={busy} onClick={() => void reloadScenes()}>
          {busy ? "reading…" : "list scenes"}
        </Btn>
      </div>
      
      <p className="mt-2 text-[10px] text-slate-500">
        Connect to caster's local OBS. Requires WebSocket v5. Use Tailscale if remote.
      </p>
      
      {err && (
        <div className="mt-3 text-[10px] text-red-400 bg-red-950/20 border border-red-500/20 p-2 rounded-lg">
          {err}
        </div>
      )}

      <div className="mt-4 grid gap-4 grid-cols-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Host</label>
          <input className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Port</label>
          <input className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white" value={String(port)} onChange={(e) => setPort(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">WS Secret</label>
          <input type="password" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Btn variant="ghost" className="!text-[10px]" disabled={busy} onClick={() => void post("/api/obs/connect", { host, port, password: pass })}>
          Connect
        </Btn>
        <Btn variant="ghost" className="!text-[10px]" disabled={busy} onClick={() => void post("/api/obs/disconnect", {})}>
          Disconnect
        </Btn>
        <Btn variant="ghost" className="!text-[10px]" disabled={busy} onClick={() => void post("/api/obs/config", { host, port, password: pass })}>
          Save Configuration
        </Btn>
      </div>

      <div className="mt-6 border-t border-white/5 pt-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">Auto-Setup</h3>
        <p className="text-[10px] text-slate-500 mb-3">
          Automatically create standard scenes and browser sources. Will safely abort if existing scenes are found.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Overlay Base URL</label>
            <input className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white" value={overlayBaseUrl} onChange={(e) => setOverlayBaseUrl(e.target.value)} />
          </div>
          <Btn
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              const res = await post("/api/obs/setup", { overlayBaseUrl });
              if (res && res.message) alert(res.message);
            }}
          >
            Run Setup
          </Btn>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-white/5 pt-5">
        <div className="flex-1 min-w-[160px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Scene</label>
          <select className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— select scene —</option>
            {scenes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <Btn disabled={!pick || busy} onClick={() => pick && void post("/api/obs/program-scene", { sceneName: pick })} className="px-5 py-2">
          Cut
        </Btn>
      </div>

      <ObsSourceMini origin={props.origin} token={props.token} />
    </section>
  );
}

function ObsSourceMini({ origin, token }: { origin: string; token: string }) {
  const [scene, setScene] = useState("MAIN");
  const [source, setSource] = useState("GRAPHICS_BROWSER");
  const [enabled, setEnabled] = useState(true);

  const push = () =>
    void apiFetch(origin, token, "/api/obs/scene-source", {
      method: "POST",
      body: JSON.stringify({ sceneName: scene, sourceName: source, visible: enabled }),
    });

  return (
    <details className="mt-5 rounded-xl border border-white/5 bg-black/30 p-3">
      <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
        OBS Source Switcher
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-[9px] uppercase tracking-wider text-slate-600">Scene</label>
          <input className="mt-1 w-full rounded border border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-white" value={scene} onChange={(e) => setScene(e.target.value)} />
        </div>
        <div>
          <label className="text-[9px] uppercase tracking-wider text-slate-600">Source</label>
          <input className="mt-1 w-full rounded border border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-white" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <label className="mt-7 flex items-center gap-2 text-xs text-slate-500 select-none">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded accent-cyan-500" /> Show Source
        </label>
      </div>
      <Btn variant="ghost" className="mt-3 !text-[10px]" onClick={push}>
        Apply toggle
      </Btn>
    </details>
  );
}

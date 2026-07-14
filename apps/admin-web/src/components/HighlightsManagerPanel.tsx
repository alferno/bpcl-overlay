import { useState, useEffect } from "react";
import { Btn, ErrBox, apiFetch } from "./Common";

export interface HighlightItem {
  file: string;
  filename: string;
  url: string;
  sizeBytes: number;
  createdAt: number;
}

export function HighlightsManagerPanel({
  origin,
  token,
}: {
  origin: string;
  token: string;
}) {
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  
  const [previewFile, setPreviewFile] = useState<HighlightItem | null>(null);

  const fetchHighlights = async () => {
    try {
      const res = await apiFetch(origin, token, "/api/highlights");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHighlights(data.highlights || []);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void fetchHighlights();
    const interval = setInterval(fetchHighlights, 10000);
    return () => clearInterval(interval);
  }, [origin, token]);

  const playLive = async (filename: string) => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/highlights/play", {
        method: "POST",
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) {
        setLocalErr(data.error);
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 mt-6">
      <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-6 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Generated Highlights</h3>
          <Btn variant="ghost" onClick={fetchHighlights} disabled={busy}>
            Refresh
          </Btn>
        </div>

        {localErr && <ErrBox text={localErr} />}

        <div className="overflow-x-auto">
          {highlights.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              No highlights found. Generate them from the Replay Studio!
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {highlights.map((h) => (
                  <tr key={h.filename} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-200 max-w-[250px] truncate" title={h.filename}>
                      {h.filename}
                    </td>
                    <td className="py-3 px-4 font-mono text-cyan-400">{formatSize(h.sizeBytes)}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => setPreviewFile(h)}
                        className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 transition-all"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => playLive(h.filename)}
                        className="rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 hover:text-emerald-200 px-2.5 py-1 border border-emerald-500/20 transition-all font-bold"
                      >
                        Go Live
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Highlight Preview</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[500px]">{previewFile.filename}</p>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-slate-400 hover:text-white font-bold text-lg focus:outline-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl bg-black border border-white/5 shadow-inner">
                <video src={`${origin}${previewFile.url}?token=${token}`} controls autoPlay className="w-full h-auto max-h-[400px] object-contain" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Btn
                  variant="ghost"
                  onClick={() => setPreviewFile(null)}
                >
                  Close
                </Btn>
                <Btn
                  variant="primary"
                  className="px-6"
                  onClick={() => {
                    void playLive(previewFile.filename);
                    setPreviewFile(null);
                  }}
                >
                  🚀 Push to Live Stream
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

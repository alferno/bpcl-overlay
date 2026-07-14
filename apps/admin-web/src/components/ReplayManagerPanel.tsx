import { useState, useEffect } from "react";
import type { Replay } from "@bpc/shared-types";
import { Btn, ErrBox, apiFetch } from "./Common";

export function ReplayManagerPanel({
  origin,
  token,
}: {
  origin: string;
  token: string;
}) {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [currentMatch, setCurrentMatch] = useState(1);
  const [lastCompletedMatch, setLastCompletedMatch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // Preview Modal States
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Filters
  const [filterMatch, setFilterMatch] = useState<string>("all");
  const [filterFav, setFilterFav] = useState(false);

  const fetchReplays = async () => {
    try {
      const res = await apiFetch(origin, token, "/api/replays");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReplays(data.replays || []);
      setCurrentMatch(data.currentMatch || 1);
      setLastCompletedMatch(data.lastCompletedMatch || 0);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Poll for new replays every 5 seconds
  useEffect(() => {
    void fetchReplays();
    const interval = setInterval(fetchReplays, 5000);
    return () => clearInterval(interval);
  }, [origin, token]);

  const saveReplay = async (duration: number) => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/replays/save", {
        method: "POST",
        body: JSON.stringify({ duration }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Brief delay to allow files to write, then refresh
      setTimeout(fetchReplays, 3200);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const nextMatchAction = async () => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/replays/next-match", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchReplays();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const generateHighlightsAction = async () => {
    setBusy(true);
    setLocalErr(null);
    try {
      const matchSetup = state?.leagueConfig?.matchSetup;
      const slug = matchSetup ? `bpcl_s2_${matchSetup.radiantTeamKey}_vs_${matchSetup.direTeamKey}_game_${matchSetup.seriesGame ?? 1}` : undefined;
      const res = await apiFetch(origin, token, "/api/replays/generate-highlights", { 
        method: "POST",
        body: JSON.stringify({ 
          matchId: lastCompletedMatch || currentMatch,
          slug
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const triggerHotkeySequence = async (keyId: string, keyModifiers: any) => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/replays/hotkey-sequence", {
        method: "POST",
        body: JSON.stringify({ keyId, keyModifiers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to trigger hotkey sequence");
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (file: string, favorite: boolean) => {
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/replays/favorite", {
        method: "POST",
        body: JSON.stringify({ file, favorite }),
      });
      if (!res.ok) throw new Error(await res.text());
      
      // Instantly toggle local state
      setReplays((prev) =>
        prev.map((r) => (r.file === file ? { ...r, favorite } : r))
      );
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  };

  const generatePreview = async (file: string) => {
    setLoadingPreview(true);
    setLocalErr(null);
    setPreviewUrl(null);
    setPreviewFile(file);
    try {
      const res = await apiFetch(origin, token, "/api/replays/generate-preview", {
        method: "POST",
        body: JSON.stringify({ file }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to generate preview");
      setPreviewUrl(`${origin}${data.previewUrl}?token=${token}`);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
      setPreviewFile(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const playLive = async (file: string) => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/replays/play", {
        method: "POST",
        body: JSON.stringify({ file }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.error) {
        setLocalErr(data.error);
      } else {
        // Find index of this file to enable next/prev
        const idx = replays.findIndex(r => r.file === file);
        if (idx >= 0) setPlaybackIndex(idx);
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);

  const playOffset = (offset: number) => {
    if (replays.length === 0) return;
    let nextIdx = playbackIndex + offset;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= replays.length) nextIdx = replays.length - 1;
    if (replays[nextIdx]) {
      void playLive(replays[nextIdx].file);
    }
  };

  const playLatest = () => {
    if (replays.length > 0) {
      const latestIdx = replays.reduce((iMax, x, i, arr) => x.replayId > arr[iMax].replayId ? i : iMax, 0);
      void playLive(replays[latestIdx].file);
    }
  };

  const forceMainScene = async () => {
    setBusy(true);
    setLocalErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/obs/program-scene", {
        method: "POST",
        body: JSON.stringify({ sceneName: "Scene" }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Filter logic
  const filteredReplays = replays.filter((r) => {
    if (filterFav && !r.favorite) return false;
    if (filterMatch !== "all" && r.match !== parseInt(filterMatch, 10)) return false;
    return true;
  });

  // Unique matches for dropdown
  const uniqueMatches = Array.from(new Set(replays.map((r) => r.match))).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {/* Top Banner and Quick Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-6 backdrop-blur-md">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wider text-cyan-400">Replay Studio</h2>
          <p className="text-xs text-slate-400 mt-1">
            Capture, preview, and sequence instant replays on stream.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Active Match</span>
            <span className="text-2xl font-black text-white">{currentMatch}</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Last Completed</span>
            <span className="text-2xl font-black text-slate-300">{lastCompletedMatch || "None"}</span>
          </div>
        </div>
      </div>

      {localErr && <ErrBox text={localErr} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Replay Triggers & Table */}
        <div className="lg:col-span-2 space-y-6">
          {/* Capture Controls */}
          <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-6 backdrop-blur-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">Capture Replay</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Btn variant="cyan" disabled={busy} onClick={() => saveReplay(15)}>
                Save 15s
              </Btn>
              <Btn variant="cyan" disabled={busy} onClick={() => saveReplay(20)}>
                Save 20s
              </Btn>
              <Btn variant="cyan" disabled={busy} onClick={() => saveReplay(30)}>
                Save 30s
              </Btn>
              <Btn variant="cyan" disabled={busy} onClick={() => saveReplay(40)}>
                Save 40s
              </Btn>
            </div>
            
            <div className="mt-6 border-t border-white/5 pt-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Playback Navigation</h4>
              <div className="flex flex-wrap gap-2.5">
                <Btn variant="ghost" disabled={busy} onClick={() => playOffset(-1)}>
                  ◀ Previous
                </Btn>
                <Btn variant="ghost" disabled={busy} onClick={() => playOffset(1)}>
                  Next ▶
                </Btn>
                <Btn variant="ghost" disabled={busy} onClick={() => playLatest()}>
                  ⚡ Play Latest
                </Btn>
              </div>
            </div>
          </div>

          {/* Replays List Table */}
          <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-6 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Captured Clips</h3>
              <div className="flex items-center gap-3">
                <select
                  value={filterMatch}
                  onChange={(e) => setFilterMatch(e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500/50"
                >
                  <option value="all">All Matches</option>
                  {uniqueMatches.map((m) => (
                    <option key={m} value={m}>
                      Match {m}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterFav}
                    onChange={(e) => setFilterFav(e.target.checked)}
                    className="rounded border-white/10 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>Favorites Only</span>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredReplays.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-mono text-xs">
                  No replays found matching filters.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-semibold uppercase tracking-widest text-[10px]">
                      <th className="py-3 px-4">Match</th>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">File Name</th>
                      <th className="py-3 px-4">Length</th>
                      <th className="py-3 px-4 text-center">Fav</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredReplays.map((r) => (
                      <tr key={r.file} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-400">M-{r.match}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">#{r.replayId}</td>
                        <td className="py-3 px-4 font-medium text-slate-200 max-w-[200px] truncate" title={r.file}>
                          {r.filename}
                        </td>
                        <td className="py-3 px-4 font-mono text-cyan-400">{r.duration}s</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggleFavorite(r.file, !r.favorite)}
                            className="text-base focus:outline-none transition-transform active:scale-125"
                          >
                            {r.favorite ? "⭐" : "☆"}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => generatePreview(r.file)}
                            className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 transition-all"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => playLive(r.file)}
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
        </div>

        {/* Right 1 Col: Match Management & Highlights */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-6 backdrop-blur-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">Match controls</h3>
            <p className="text-[10px] text-slate-500 mb-4">
              Advanced match state updates. Advancing the match will trigger highlight compiling.
            </p>
            <Btn variant="danger" className="w-full py-3" disabled={busy} onClick={nextMatchAction}>
              Next Match
            </Btn>
          </div>

          <div className="rounded-2xl border border-amber-500/10 bg-amber-950/5 p-6 backdrop-blur-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200 mb-2">Build Highlights</h3>
            <p className="text-[10px] text-amber-500/70 mb-5 font-medium">
              Concatenates all favorited clips from the last completed match into a single high-quality video using ffmpeg.
            </p>
            <Btn
              variant="primary"
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 shadow-amber-950/20"
              disabled={busy}
              onClick={generateHighlightsAction}
            >
              🎬 Generate Highlights
            </Btn>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-900/30 p-6 backdrop-blur-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4">OBS Reset</h3>
            <p className="text-[10px] text-slate-500 mb-4">
              Instantly cancel a replay sequence or switch back manually.
            </p>
            <div className="space-y-3">
              <Btn 
                variant="danger" 
                className="w-full py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30" 
                disabled={busy} 
                onClick={forceMainScene}
              >
                🚨 Force Main Scene
              </Btn>
              <Btn 
                variant="ghost" 
                className="w-full py-3 border border-white/10" 
                disabled={busy} 
                onClick={() => triggerHotkeySequence("OBS_KEY_DOWN", { control: true, shift: true })}
              >
                ↩ Reset Scene (Ctrl+Shift+Down)
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">Replay Preview</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[500px]">{previewFile}</p>
              </div>
              <button
                onClick={() => {
                  setPreviewFile(null);
                  setPreviewUrl(null);
                }}
                className="text-slate-400 hover:text-white font-bold text-lg focus:outline-none"
              >
                ✕
              </button>
            </div>

            {loadingPreview ? (
              <div className="flex h-[360px] items-center justify-center flex-col gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                <span className="text-xs font-mono text-slate-400">Remuxing clip for browser playback...</span>
              </div>
            ) : previewUrl ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl bg-black border border-white/5 shadow-inner">
                  <video src={previewUrl} controls autoPlay className="w-full h-auto max-h-[400px] object-contain" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      setPreviewFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    Close
                  </Btn>
                  <Btn
                    variant="primary"
                    className="px-6"
                    onClick={() => {
                      void playLive(previewFile);
                      setPreviewFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    🚀 Push to Live Stream
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-xs text-rose-400 font-mono">
                Failed to load preview media.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, apiFetch } from "./Common";

const PRESETS = [
  {
    label: "Caster Intro (Standard)",
    headline: "Your Casters",
    subtitle: "Caster A & Caster B",
    accent: "#f1c40f", // Yellow
  },
  {
    label: "Match Schedule Notice",
    headline: "Up Next",
    subtitle: "Ashborn vs Emberfall — Game 1",
    accent: "#3498db", // Blue
  },
  {
    label: "Break Timer Notice",
    headline: "Match Paused",
    subtitle: "Production will resume shortly",
    accent: "#e74c3c", // Red
  },
  {
    label: "Welcome Broadcast",
    headline: "Welcome to Bharat Pro Circuit League",
    subtitle: "Season 1 Grand Finals Live",
    accent: "#2ecc71", // Green
  },
];

export function LowerThirdPanel({
  origin,
  token,
  state,
  setErr,
}: {
  origin: string;
  token: string;
  state: OverlayEnvelope | null;
  setErr: (e: string | null) => void;
}) {
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [accent, setAccent] = useState("#f1c40f");
  const [busy, setBusy] = useState(false);

  const currentLt = state?.lowerThirds;
  const isLtVisible = state?.overlayVisibility?.lowerthird === "visible" || 
    (typeof state?.overlayVisibility?.lowerthird === "object" && state.overlayVisibility.lowerthird?.mode === "timed");

  const hasInitialized = useRef(false);

  // Load current overlay state on sync
  useEffect(() => {
    if (currentLt && !hasInitialized.current) {
      if (currentLt.headline) setHeadline(currentLt.headline);
      if (currentLt.subtitle) setSubtitle(currentLt.subtitle);
      if (currentLt.accent) setAccent(currentLt.accent);
      hasInitialized.current = true;
    }
  }, [currentLt]);

  const triggerLowerThird = async (mode: "visible" | "timed" | "hidden", seconds = 10) => {
    // 1. First save/patch the lowerThirds text
    setBusy(true);
    try {
      const patchRes = await apiFetch(origin, token, "/api/state", {
        method: "PATCH",
        body: JSON.stringify({
          lowerThirds: {
            headline: headline.trim(),
            subtitle: subtitle.trim() || undefined,
            accent: accent || undefined,
          },
        }),
      });
      if (!patchRes.ok) {
        setErr(await patchRes.text());
        setBusy(false);
        return;
      }

      // 2. Set visibility mode
      const visibility = mode === "timed"
        ? { mode: "timed", until: Date.now() + seconds * 1000 }
        : mode;

      const visRes = await apiFetch(origin, token, "/api/state", {
        method: "PATCH",
        body: JSON.stringify({
          overlayVisibility: {
            lowerthird: visibility,
          },
        }),
      });
      if (!visRes.ok) {
        setErr(await visRes.text());
      } else {
        setErr(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setHeadline(preset.headline);
    setSubtitle(preset.subtitle);
    setAccent(preset.accent);
  };

  return (
    <section className="space-y-6 rounded-2xl border border-sky-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-sky-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-200">Lower Thirds Manager</h2>
        </div>
        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
          isLtVisible ? "text-emerald-400 bg-emerald-950/30 border border-emerald-500/10" : "text-slate-500 bg-slate-950/30 border border-white/5"
        }`}>
          {isLtVisible ? "On Stream" : "Hidden"}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form and Controls */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Headline</label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white outline-none focus:border-sky-500/50"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. TobiWan & Synderen"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Subtitle (Optional)</label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-white outline-none focus:border-sky-500/50"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. English Casters"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Left Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-8 w-8 rounded border border-white/10 bg-transparent cursor-pointer"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
              <input
                type="text"
                className="flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-sky-500/50"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
            <Btn
              disabled={busy || !headline.trim()}
              onClick={() => void triggerLowerThird("timed", 10)}
            >
              Timed (10s)
            </Btn>
            <Btn
              variant="ghost"
              disabled={busy || !headline.trim()}
              onClick={() => void triggerLowerThird("visible")}
            >
              Show Persistent
            </Btn>
            <button
              onClick={() => void triggerLowerThird("hidden")}
              disabled={busy}
              className="rounded-lg border border-rose-500/20 bg-rose-950/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/20 disabled:opacity-40"
            >
              Hide
            </button>
          </div>
        </div>

        {/* Presets and Info */}
        <div className="space-y-4 bg-slate-950/30 rounded-xl p-4 border border-white/5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Broadcast Presets</h3>
          <p className="text-[10px] text-slate-500">
            Quickly load standard graphics packages with single clicks. Custom settings can be applied afterwards.
          </p>
          <div className="grid gap-2">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(p)}
                className="w-full flex items-center justify-between text-left p-2.5 rounded-lg border border-white/5 bg-slate-950/60 hover:bg-slate-900/60 transition-all"
              >
                <div>
                  <div className="text-[11px] font-bold text-slate-200">{p.label}</div>
                  <div className="text-[9px] text-slate-500 truncate max-w-[200px] mt-0.5">{p.headline} · {p.subtitle}</div>
                </div>
                <div className="h-3 w-3 rounded-full shadow-inner" style={{ backgroundColor: p.accent }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

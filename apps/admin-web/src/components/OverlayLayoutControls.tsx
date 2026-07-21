import { type OverlayEnvelope } from "@bpc/shared-types";
import { useState, useEffect } from "react";
import { VisToggle, stringifyMode } from "./Common";
import { routeVisible } from "../visibility";
import { SponsorWidgetControls } from "./SponsorWidgetControls";

function LayoutInput({ value, placeholder, onUpdate, step }: { value: any; placeholder: string; onUpdate: (val: string) => void; step?: string }) {
  const [local, setLocal] = useState(value ?? "");

  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  return (
    <input
      type="number"
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onUpdate(local)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder={placeholder}
      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 focus:border-cyan-500 outline-none w-full"
    />
  );
}

interface Props {
  state: OverlayEnvelope | null;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}

export function OverlayLayoutControls({ state, busy, onPatch }: Props) {
  const currentConfig = state?.production?.layoutConfig || {};

  const handleUpdate = (
    key: "minimapIcons" | "livePlayerCard" | "kdaCard",
    field: "x" | "y" | "scale",
    value: string
  ) => {
    const numValue = value === "" ? undefined : parseFloat(value);
    const existingLayout = currentConfig[key] || {};
    
    // Copy the whole production state and apply our nested changes
    const production = {
      ...(state?.production || {}),
      layoutConfig: {
        ...currentConfig,
        [key]: {
          ...existingLayout,
          [field]: numValue,
        },
      },
    };

    void onPatch({ production });
  };

  const DEFAULTS = {
    minimapIcons: { x: 1, y: 280, scale: 1.0 },
    livePlayerCard: { x: -15, y: 95, scale: 0.8 },
    kdaCard: { x: 1, y: 1, scale: 1.0 }
  };

  const renderControls = (
    label: string,
    key: "minimapIcons" | "livePlayerCard" | "kdaCard"
  ) => {
    const layout = currentConfig[key] || {};
    const defs = DEFAULTS[key];

    return (
      <div className="flex flex-col gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">{label}</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase">X (Left)</label>
            <LayoutInput
              value={layout.x}
              onUpdate={(v) => handleUpdate(key, "x", v)}
              placeholder={String(defs.x)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase">Y (Top/Bot)</label>
            <LayoutInput
              value={layout.y}
              onUpdate={(v) => handleUpdate(key, "y", v)}
              placeholder={String(defs.y)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase">Scale</label>
            <LayoutInput
              value={layout.scale}
              step="0.1"
              onUpdate={(v) => handleUpdate(key, "scale", v)}
              placeholder={String(defs.scale)}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-slate-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          In-Game Modular Overlays
        </h2>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Toggle individual components and customize their sizes and positions on the game overlay.
      </p>

      <div className="flex flex-col gap-4 mt-2">
        {/* KDA Card Group */}
        <div className="flex flex-col gap-2 p-3 bg-slate-950/40 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-bold text-slate-200">KDA Stats Card</p>
              <p className="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-wider">{stringifyMode(state?.overlayVisibility?.kdaCard)}</p>
            </div>
            <VisToggle active={routeVisible("kdaCard", state)} onToggle={() => onPatch({ overlayVisibility: { kdaCard: routeVisible("kdaCard", state) ? "hidden" : "visible" }})} />
          </div>
          {renderControls("Layout Overrides", "kdaCard")}
        </div>

        {/* Live Player Card Group */}
        <div className="flex flex-col gap-2 p-3 bg-slate-950/40 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-bold text-slate-200">Live Player Card Body</p>
              <p className="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-wider">{stringifyMode(state?.overlayVisibility?.liveplayercard)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPatch({
                  production: {
                    ...(state?.production || {}),
                    layoutConfig: {
                      ...(state?.production?.layoutConfig || {}),
                      livePlayerCard: {
                        ...(state?.production?.layoutConfig?.livePlayerCard || {}),
                        inwardCut: state?.production?.layoutConfig?.livePlayerCard?.inwardCut === false ? true : false,
                      }
                    }
                  }
                })}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  state?.production?.layoutConfig?.livePlayerCard?.inwardCut !== false 
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/40"
                    : "bg-slate-500/20 border-slate-500/50 text-slate-400 hover:bg-slate-500/40"
                }`}
              >
                Inward Cut: {state?.production?.layoutConfig?.livePlayerCard?.inwardCut !== false ? "ON" : "OFF"}
              </button>
              <VisToggle active={routeVisible("liveplayercard", state)} onToggle={() => onPatch({ overlayVisibility: { liveplayercard: routeVisible("liveplayercard", state) ? "hidden" : "visible" }})} />
            </div>
          </div>
          {renderControls("Layout Overrides", "livePlayerCard")}
        </div>

        {/* Minimap Icons Group */}
        <div className="flex flex-col gap-2 p-3 bg-slate-950/40 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-bold text-slate-200">Minimap Icons (Roshan/Tormentor)</p>
              <p className="text-[9px] font-mono text-slate-500 mt-1 uppercase tracking-wider">{stringifyMode(state?.overlayVisibility?.minimapIcons)}</p>
            </div>
            <VisToggle active={routeVisible("minimapIcons", state)} onToggle={() => onPatch({ overlayVisibility: { minimapIcons: routeVisible("minimapIcons", state) ? "hidden" : "visible" }})} />
          </div>
          {renderControls("Layout Overrides", "minimapIcons")}
        </div>

        {/* Sponsor Widget Group */}
        <SponsorWidgetControls state={state} onPatch={onPatch} />
      </div>
    </div>
  );
}

import { type OverlayEnvelope, type SponsorFlipWidgetConfig } from "@bpc/shared-types";
import { useState, useEffect } from "react";
import { VisToggle, stringifyMode } from "./Common";
import { routeVisible } from "../visibility";

function SettingInput({ 
  label, 
  value, 
  type = "text", 
  step, 
  onUpdate 
}: { 
  label: string; 
  value: any; 
  type?: string; 
  step?: string; 
  onUpdate: (v: any) => void;
}) {
  const [local, setLocal] = useState(value ?? "");

  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  const handleBlur = () => {
    if (local === "") {
      onUpdate(undefined);
    } else if (type === "number") {
      onUpdate(parseFloat(local));
    } else {
      onUpdate(local);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-slate-500 uppercase">{label}</label>
      <input
        type={type}
        step={step}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 focus:border-cyan-500 outline-none w-full text-xs"
      />
    </div>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onUpdate
}: {
  label: string;
  value: any;
  options: { label: string; value: string }[];
  onUpdate: (v: any) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-slate-500 uppercase">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onUpdate(e.target.value || undefined)}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 focus:border-cyan-500 outline-none w-full text-xs"
      >
        <option value="">Default</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function SponsorWidgetControls({
  state,
  onPatch,
}: {
  state: OverlayEnvelope | null;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const config = state?.production?.sponsorWidget || {};
  const sponsorsStr = (config.sponsors || []).join("\n");
  const [localSponsors, setLocalSponsors] = useState(sponsorsStr);

  useEffect(() => {
    setLocalSponsors((state?.production?.sponsorWidget?.sponsors || []).join("\n"));
  }, [state?.production?.sponsorWidget?.sponsors]);

  const handleUpdate = (field: keyof SponsorFlipWidgetConfig, value: any) => {
    void onPatch({
      production: {
        ...(state?.production || {}),
        sponsorWidget: {
          ...config,
          [field]: value,
        },
      },
    });
  };

  const handleSponsorsUpdate = () => {
    const list = localSponsors
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    handleUpdate("sponsors", list.length > 0 ? list : undefined);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-200">3D Sponsor Flip Widget</h3>
          <p className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-wider">
            {stringifyMode(state?.overlayVisibility?.sponsorWidget)}
          </p>
        </div>
        <VisToggle
          active={routeVisible("sponsorWidget", state)}
          onToggle={() =>
            onPatch({
              overlayVisibility: {
                sponsorWidget: routeVisible("sponsorWidget", state) ? "hidden" : "visible",
              },
            })
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        {/* Content */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-1">Content</h4>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 uppercase">Sponsors (One per line)</label>
            <textarea
              rows={4}
              value={localSponsors}
              onChange={(e) => setLocalSponsors(e.target.value)}
              onBlur={handleSponsorsUpdate}
              placeholder="Sponsor 1&#10;Sponsor 2"
              className="bg-slate-900 border border-slate-700 rounded p-2 focus:border-cyan-500 outline-none w-full text-xs font-mono"
            />
          </div>
        </div>

        {/* Layout & Positioning */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-1">Layout & Positioning</h4>
          <div className="grid grid-cols-2 gap-3">
            <SettingSelect
              label="Anchor"
              value={config.anchor}
              options={[
                { label: "Top Left", value: "top-left" },
                { label: "Top Right", value: "top-right" },
                { label: "Bottom Left", value: "bottom-left" },
                { label: "Bottom Right", value: "bottom-right" },
                { label: "Center", value: "center" },
              ]}
              onUpdate={(v) => handleUpdate("anchor", v)}
            />
            <SettingInput label="X Offset" value={config.x} onUpdate={(v) => handleUpdate("x", v)} />
            <SettingInput label="Y Offset" value={config.y} onUpdate={(v) => handleUpdate("y", v)} />
            <SettingInput label="Scale" type="number" step="0.1" value={config.scale} onUpdate={(v) => handleUpdate("scale", v)} />
            <SettingInput label="Width" value={config.width} onUpdate={(v) => handleUpdate("width", v)} />
            <SettingInput label="Height" value={config.height} onUpdate={(v) => handleUpdate("height", v)} />
          </div>
        </div>

        {/* Styling */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-1">Styling</h4>
          <div className="grid grid-cols-2 gap-3">
            <SettingInput label="Text Color" type="color" value={config.textColor || "#ffffff"} onUpdate={(v) => handleUpdate("textColor", v)} />
            <SettingInput label="Background Color" value={config.backgroundColor} onUpdate={(v) => handleUpdate("backgroundColor", v)} />
            <SettingInput label="Border Color" type="color" value={config.borderColor || "#ffffff"} onUpdate={(v) => handleUpdate("borderColor", v)} />
            <SettingInput label="Border Radius" value={config.borderRadius} onUpdate={(v) => handleUpdate("borderRadius", v)} />
            <SettingInput label="Border Width" type="number" value={config.borderWidth} onUpdate={(v) => handleUpdate("borderWidth", v)} />
            <SettingInput label="Font Size" value={config.fontSize} onUpdate={(v) => handleUpdate("fontSize", v)} />
          </div>
        </div>

        {/* Animation */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-1">Animation & Depth</h4>
          <div className="grid grid-cols-2 gap-3">
            <SettingInput label="Perspective" value={config.perspective} onUpdate={(v) => handleUpdate("perspective", v)} />
            <SettingInput label="Flip Duration (s)" type="number" step="0.1" value={config.flipDuration} onUpdate={(v) => handleUpdate("flipDuration", v)} />
            <SettingInput label="Hold Duration (s)" type="number" step="0.5" value={config.holdDuration} onUpdate={(v) => handleUpdate("holdDuration", v)} />
            <SettingInput label="Motion Blur (px)" type="number" step="1" value={config.motionBlurIntensity} onUpdate={(v) => handleUpdate("motionBlurIntensity", v)} />
          </div>
        </div>
      </div>
    </div>
  );
}

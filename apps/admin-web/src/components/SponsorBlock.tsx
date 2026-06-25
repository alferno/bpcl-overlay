import { useState } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, VisToggle } from "./Common";
import { routeVisible } from "../visibility";

interface SponsorEntry {
  id: number;
  title: string;
  isCoSponsor: boolean;
  color: string;
}

let nextId = 1;

export function SponsorBlock({
  state,
  on,
  onToggleSponsors,
}: {
  state: OverlayEnvelope | null;
  on(s: NonNullable<OverlayEnvelope["sponsor"]>): Promise<void>;
  onToggleSponsors(visible: boolean): void;
}) {
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([
    { id: nextId++, title: "Partner Alpha", isCoSponsor: true, color: "#ffffff" },
    { id: nextId++, title: "Partner Beta", isCoSponsor: false, color: "#10b981" },
  ]);
  const sponsorsVisible = routeVisible("sponsors", state);

  const push = () =>
    void on({
      banners: sponsors.map((s) => ({
        title: s.title,
        durationSeconds: 8, // legacy prop
        isCoSponsor: s.isCoSponsor,
        color: s.color,
      })),
      activeIndex: 0,
      startedAt: Date.now(),
    });

  const updateSponsor = (id: number, field: keyof SponsorEntry, value: any) => {
    setSponsors(sponsors.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeSponsor = (id: number) => {
    setSponsors(sponsors.filter(s => s.id !== id));
  };

  const addSponsor = () => {
    setSponsors([...sponsors, { id: nextId++, title: "New Sponsor", isCoSponsor: false, color: "#ffffff" }]);
  };

  return (
    <section className="rounded-2xl border border-pink-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-pink-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-pink-200">Sponsor Banner</h2>
        </div>
        <VisToggle
          active={sponsorsVisible}
          onToggle={() => onToggleSponsors(!sponsorsVisible)}
        />
      </div>
      
      <p className="mt-2 text-[10px] text-slate-500">
        Configure the sponsors for the scrolling marquee. Co-sponsors will stand out.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {sponsors.map((sponsor) => (
          <div key={sponsor.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-slate-950/50 p-3">
            <div className="flex-1 min-w-[150px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Name</label>
              <input 
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white" 
                value={sponsor.title} 
                onChange={(e) => updateSponsor(sponsor.id, "title", e.target.value)} 
              />
            </div>
            
            <div className="w-20">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Color</label>
              <div className="mt-1 flex h-[30px] rounded-lg border border-white/10 bg-slate-950 overflow-hidden">
                <input 
                  type="color"
                  className="h-full w-full cursor-pointer bg-transparent border-0 p-0" 
                  value={sponsor.color} 
                  onChange={(e) => updateSponsor(sponsor.id, "color", e.target.value)} 
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input 
                type="checkbox" 
                id={`co-${sponsor.id}`}
                className="rounded border-white/10 bg-slate-950 text-pink-500 focus:ring-pink-500 focus:ring-offset-slate-950 h-4 w-4"
                checked={sponsor.isCoSponsor}
                onChange={(e) => updateSponsor(sponsor.id, "isCoSponsor", e.target.checked)}
              />
              <label htmlFor={`co-${sponsor.id}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none cursor-pointer">Co-Sponsor</label>
            </div>

            <button 
              onClick={() => removeSponsor(sponsor.id)}
              className="mt-4 rounded-md p-1.5 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
              title="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        ))}
      </div>
      
      <div className="mt-4 flex flex-wrap gap-3">
        <Btn variant="ghost" onClick={addSponsor} className="flex-1 md:flex-none">
          + Add Sponsor
        </Btn>
        <Btn className="flex-1 md:flex-none bg-pink-600 hover:bg-pink-500 text-white" onClick={push}>
          Stage Banner
        </Btn>
      </div>
    </section>
  );
}

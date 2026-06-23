import { useState } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, VisToggle } from "./Common";
import { routeVisible } from "../visibility";

export function SponsorBlock({
  state,
  on,
  onToggleSponsors,
}: {
  state: OverlayEnvelope | null;
  on(s: NonNullable<OverlayEnvelope["sponsor"]>): Promise<void>;
  onToggleSponsors(visible: boolean): void;
}) {
  const [a, setA] = useState("Partner Alpha");
  const [b, setB] = useState("Partner Beta");
  const sponsorsVisible = routeVisible("sponsors", state);

  const push = () =>
    void on({
      banners: [
        { title: a, subtitle: "tier 1 sponsor", durationSeconds: 8 },
        { title: b, subtitle: "tier 2 sponsor", durationSeconds: 8 },
      ],
      activeIndex: 0,
      startedAt: Date.now(),
    });

  return (
    <section className="rounded-2xl border border-pink-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-pink-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-pink-200">Sponsor Rotation</h2>
        </div>
        <VisToggle
          active={sponsorsVisible}
          onToggle={() => onToggleSponsors(!sponsorsVisible)}
        />
      </div>
      
      <p className="mt-2 text-[10px] text-slate-500">
        Stage sponsor banner text to scroll on the overlay. Accompanying brand logos should be placed in public assets.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sponsor Banner A</label>
          <input 
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white" 
            value={a} 
            onChange={(e) => setA(e.target.value)} 
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sponsor Banner B</label>
          <input 
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white" 
            value={b} 
            onChange={(e) => setB(e.target.value)} 
          />
        </div>
      </div>
      
      <Btn className="mt-5 w-full md:w-auto" onClick={push}>
        Stage Rotation
      </Btn>
    </section>
  );
}

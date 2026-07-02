import { useEffect, useState } from "react";
import type { OverlayEnvelope, VisibilityMode } from "@bpc/shared-types";
import { VisToggle, stringifyMode } from "./Common";
import { routeVisible } from "../visibility";

const ADMIN_VIS_ROUTES = [
  "draft",
  "startingsoon",
  "herostats",
  "sponsors",
  "matchup",
  "playerstats",
  "lowerthird",
  "versus",
  "replay",
  "rankmedals",
  "liveplayercard",
] as const;

const ROUTE_LABELS: Record<(typeof ADMIN_VIS_ROUTES)[number], string> = {
  draft: "Draft Overlay",
  startingsoon: "Game Start Countdown",
  herostats: "Hero & Player Cards",
  sponsors: "Sponsors Banner",
  matchup: "Hero VS Hero Matchup",
  playerstats: "Player Stats Panel",
  lowerthird: "Lower Third Headline",
  versus: "Versus Matchup Screen",
  replay: "Replay Indicator",
  rankmedals: "Rank Medals HUD",
  liveplayercard: "Live Player Card",
};

export function VisMatrix(props: {
  state: OverlayEnvelope | null;
  on(r: string, m: VisibilityMode): void | Promise<void>;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-2">
        <div className="h-2 w-2 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">Overlay Visibilities</h2>
      </div>
      <p className="mb-6 text-[10px] text-slate-500">
        Instantly toggle each browser source visible or hidden in OBS. Timed views will self-expire.
      </p>
      
      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_VIS_ROUTES.map((route) => {
          const mv = props.state?.overlayVisibility as Record<string, VisibilityMode> | undefined;
          const active = routeVisible(route, props.state);
          return (
            <div
              key={route}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-slate-950/30 p-3 hover:bg-slate-950/50 transition-colors duration-200"
            >
              <div>
                <p className="text-xs font-bold text-slate-200">{ROUTE_LABELS[route]}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">/{route}</p>
                <p className="text-[9px] font-mono text-slate-600 mt-1 uppercase tracking-wider">{stringifyMode(mv?.[route])}</p>
              </div>
              <div className="flex items-center gap-2">
                {route === "rankmedals" && (
                  <button
                    onClick={() => props.on(route, { mode: "timed", until: Date.now() + 60000 })}
                    className="px-2 py-1 text-[10px] rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 hover:bg-purple-500/40 transition-colors"
                  >
                    Tease 60s
                  </button>
                )}
                <VisToggle
                  active={active}
                  onToggle={() => props.on(route, active ? "hidden" : "visible")}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

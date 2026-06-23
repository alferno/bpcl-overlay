import { useState, useEffect } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, apiFetch } from "./Common";
import { HeroSearchSelect, type HeroMeta } from "../HeroSearchSelect";

export function GsiDraftControls({
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
  const [manualHero, setManualHero] = useState("");
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const prod = state?.production;
  const lastPick = state?.draft?.lastPick;

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await apiFetch(origin, token, path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      const t = await r.text();
      if (!r.ok) {
        setErr(t.slice(0, 400));
        return;
      }
      setErr(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!token.trim()) return;
    void apiFetch(origin, token, "/api/heroes")
      .then((r) => r.json())
      .then((list: HeroMeta[]) => setHeroes(list))
      .catch(() => undefined);
  }, [origin, token]);

  return (
    <section className="rounded-2xl border border-orange-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="h-2 w-2 rounded-full bg-orange-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-200">GSI Live Draft Parser</h2>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        Syncs picks/bans directly from Dota 2. Ensure <code>gamestate_integration_bpc.cfg</code> is placed in your game client.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${prod?.gsiConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-700"}`} />
          <span className={prod?.gsiConnected ? "text-emerald-400 font-bold" : "text-slate-500"}>
            GSI {prod?.gsiConnected ? "Active" : "Offline"}
          </span>
        </div>
        {prod?.gsiLastSeen ? (
          <span className="text-[10px] text-slate-500">Last heartbeat: {prod.gsiLastSeen}</span>
        ) : null}
        
        <label className="flex items-center gap-2 select-none text-slate-300">
          <input
            type="checkbox"
            checked={prod?.autoShowStatsOnPick ?? false}
            className="rounded accent-orange-500"
            onChange={(e) =>
              void post("/api/production/settings", {
                autoShowStatsOnPick: e.target.checked,
              })
            }
          />
          Auto-show stats cards on pick
        </label>
        
        <Btn
          variant="ghost"
          disabled={busy}
          className="!text-[10px] border-orange-950/20 hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-300 ml-auto"
          onClick={() => {
            if (
              !window.confirm(
                "Reset draft and clean cached reveals on overlay? This cannot be undone.",
              )
            ) {
              return;
            }
            void post("/api/draft/reset-overlay");
          }}
        >
          Clear Draft Overlay Cache
        </Btn>
        {prod?.playerMappingPublished ? (
          <span className="text-[10px] text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded bg-emerald-950/15 font-semibold">
            Player Mapping Published
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 border-t border-white/5 pt-5">
        <div className="rounded-xl border border-white/5 bg-slate-950/20 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Last Pick Spotlight</h3>
          {lastPick ? (
            <p className="mt-2.5 text-xs text-slate-300 font-semibold">
              Player: <span className="text-white font-bold">{lastPick.playerName ?? "?"}</span> · Hero: <span className="text-orange-400 font-bold">{lastPick.heroName ?? `#${lastPick.heroId}`}</span>
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-slate-500 italic">Waiting for active hero picks…</p>
          )}
          <Btn
            disabled={!lastPick || busy}
            className="mt-4"
            onClick={() =>
              void post("/api/stats/carousel", { type: "last-pick", overlaySeconds: 12 })
            }
          >
            Show last pick stats
          </Btn>
        </div>
        
        <div className="rounded-xl border border-white/5 bg-slate-950/20 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Manual Hero spotlight</h3>
          <div className="mt-2.5">
            <HeroSearchSelect
              heroes={heroes}
              value={manualHero}
              onChange={setManualHero}
              placeholder="— select hero —"
            />
          </div>
          <Btn
            disabled={!manualHero || busy}
            className="mt-4"
            onClick={() =>
              void post("/api/stats/carousel", {
                type: "tournament-hero",
                heroId: Number(manualHero),
                overlaySeconds: 12,
              })
            }
          >
            show carousel
          </Btn>
        </div>
      </div>
    </section>
  );
}

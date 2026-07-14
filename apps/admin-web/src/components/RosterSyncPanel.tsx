import { useState, useCallback, useEffect } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, apiFetch, formatApiErrorBody } from "./Common";

export function RosterSyncPanel({
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
  const [csvText, setCsvText] = useState("");
  const [seasonSlug, setSeasonSlug] = useState("season-1");
  const [seasons, setSeasons] = useState<Array<{ slug: string; name: string; isActive: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const [resolveReport, setResolveReport] = useState<{
    missingSteam32?: number[];
    rosterCount?: number;
    csvPlayerCount?: number;
    indexKeyCount?: number;
    matchedRosterCount?: number;
    indexEmpty?: string;
  } | null>(null);

  useEffect(() => {
    if (!token.trim()) return;
    void apiFetch(origin, token, "/api/league/bpc-seasons")
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) {
          setSeasons(list);
          const active = list.find((s) => s.isActive);
          if (active) {
            setSeasonSlug(active.slug);
          } else if (list.length > 0) {
            setSeasonSlug(list[0].slug);
          }
        }
      })
      .catch(() => {});
  }, [origin, token]);

  const roster = state?.leagueConfig?.roster ?? [];

  const post = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      setBusy(true);
      try {
        const r = await apiFetch(origin, token, path, {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        });
        const t = await r.text();
        if (!r.ok) {
          setErr(formatApiErrorBody(t));
          return null;
        }
        setErr(null);
        return t ? (JSON.parse(t) as unknown) : null;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [origin, token, setErr],
  );

  return (
    <section className="space-y-6 rounded-2xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="h-2 w-2 rounded-full bg-cyan-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-200">Roster Sync & Manager</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sync Option */}
        <div className="space-y-4 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 shadow-inner shadow-cyan-950/10">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Option A: bpcleague.in Sync</h4>
            <p className="mt-1 text-[10px] text-slate-400">
              Pulls rosters, accent colors, and parses Steam URLs into Steam32 IDs. Automatically syncs Sponsors for the season and saves a local CSV to <code className="text-cyan-200">data/roster/players_roster_prepared.csv</code>.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500/50"
              value={seasonSlug}
              onChange={(e) => setSeasonSlug(e.target.value)}
            >
              <option value="">— select tournament —</option>
              <option value="active">Active Tournament (Live)</option>
              {seasons.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name} {s.isActive ? " (Active)" : ""}
                </option>
              ))}
            </select>
            <Btn
              disabled={busy}
              onClick={async () => {
                const data = await post("/api/roster/sync-bpcleague", { seasonSlug });
                if (data && typeof data === "object") {
                  void post("/api/league/stats/resolve").then((resData) => {
                    if (resData && typeof resData === "object") {
                      setResolveReport(resData as typeof resolveReport);
                    }
                  });
                }
              }}
            >
              {busy ? "syncing…" : "sync roster"}
            </Btn>
            <Btn
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await post("/api/cache/clear");
                const data = await post("/api/roster/sync-bpcleague", { seasonSlug });
                if (data && typeof data === "object") {
                  void post("/api/league/stats/resolve").then((resData) => {
                    if (resData && typeof resData === "object") {
                      setResolveReport(resData as typeof resolveReport);
                    }
                  });
                }
              }}
            >
              Force Refresh API
            </Btn>
          </div>
          <div className="border-t border-cyan-500/10 pt-3">
            <h5 className="text-[10px] uppercase font-bold text-slate-500">Auto-Enrichment</h5>
            <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
              Vanity URL custom profiles require a Steam API key to resolve. Numeric profiles resolve instantly. Sync processes enrich dynamic player avatars using OpenDota.
            </p>
          </div>
        </div>

        {/* Manual CSV Option */}
        <div className="space-y-4 rounded-xl border border-white/5 bg-slate-950/30 p-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Option B: Manual CSV Upload</h4>
            <p className="mt-1 text-[10px] text-slate-400">
              Format: <code>displayName,steam32,teamName,teamKey,teamColor[,avatarUrl]</code>
            </p>
          </div>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 font-mono text-[10px] text-slate-300 outline-none focus:border-white/20"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="e.g. alferno,384213851,Ashborn,ashborn,#db8339"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then(setCsvText);
              }}
            />
            <div className="flex gap-2">
              <Btn
                disabled={busy || !csvText.trim()}
                onClick={() => void post("/api/roster/upload", { csv: csvText })}
              >
                upload CSV
              </Btn>
              <Btn
                variant="ghost"
                disabled={busy || roster.length === 0}
                onClick={() =>
                  void post("/api/league/stats/resolve").then((data) => {
                    if (data && typeof data === "object") {
                      setResolveReport(data as typeof resolveReport);
                    }
                  })
                }
              >
                resolve stats
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {resolveReport && (
        <div className={`text-xs p-3 rounded-xl border ${
          (resolveReport.missingSteam32?.length ?? 0) === 0
            ? "border-emerald-500/20 bg-emerald-950/10 text-emerald-300"
            : "border-amber-500/20 bg-amber-950/10 text-amber-300"
        }`}>
          <div className="font-bold">Sync Resolution Report:</div>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px] text-slate-300">
            <li>{resolveReport.indexKeyCount ?? 0} index keys loaded in memory</li>
            <li>{resolveReport.csvPlayerCount ?? 0} players matches on Steam database</li>
            <li>{resolveReport.matchedRosterCount ?? 0}/{resolveReport.rosterCount ?? 0} active roster players matched</li>
          </ul>
          {resolveReport.indexEmpty && (
            <p className="mt-2 text-red-400 font-bold text-[10px]">{resolveReport.indexEmpty}</p>
          )}
          {(resolveReport.missingSteam32?.length ?? 0) > 0 && (
            <p className="mt-2 text-[10px] text-amber-400 leading-normal">
              Warning: {resolveReport.missingSteam32!.length} players do not have match statistics in OpenDota league database.
            </p>
          )}
        </div>
      )}

      {roster.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-slate-950/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Synced Roster ({roster.length} Players)
            </span>
            <button
              type="button"
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
              onClick={() => setRosterExpanded((v) => !v)}
            >
              {rosterExpanded ? "COLLAPSE TABLE" : "EXPAND TABLE"}
            </button>
          </div>
          {rosterExpanded && (
            <div className="mt-3 overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-white/5">
                    <th className="py-2">Player Display Name</th>
                    <th>Steam32 ID</th>
                    <th>Team Name</th>
                    <th>Team ID Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300 font-mono text-[11px]">
                  {roster.map((p) => (
                    <tr key={p.steam32} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 text-slate-200 font-sans font-semibold">{p.displayName}</td>
                      <td>{p.steam32}</td>
                      <td className="flex items-center gap-1.5 py-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.teamColor || "#fff" }} />
                        {p.teamName ?? "—"}
                      </td>
                      <td>{p.teamKey ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

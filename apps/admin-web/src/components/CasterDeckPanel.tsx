import { useState } from "react";
import type { RosterPlayer } from "@bpc/shared-types";
import { apiFetch } from "../api";
import { ErrBox } from "./Common";

export function CasterDeckPanel({
  roster,
  origin,
  token,
}: {
  roster: RosterPlayer[];
  origin: string;
  token: string;
}) {
  const [playerA, setPlayerA] = useState<number>(0);
  const [playerB, setPlayerB] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pushH2H = async () => {
    if (!playerA || !playerB) {
      setErr("Please select two players to compare.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(origin, token, "/api/producer/h2h", {
        method: "POST",
        body: JSON.stringify({
          player1Steam32: playerA,
          player2Steam32: playerB,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // Group players by team to make it easier to select
  const teams: Record<string, RosterPlayer[]> = {};
  roster.forEach((p) => {
    const team = p.teamName || "Unassigned";
    if (!teams[team]) teams[team] = [];
    teams[team].push(p);
  });

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-6 backdrop-blur-md">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span className="text-2xl">🎛️</span> Caster Deck (H2H)
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Push Head-to-Head tournament stats graphics directly to the stream overlay.
        </p>
      </div>

      {err && <ErrBox text={err} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Player 1
          </label>
          <select
            value={playerA}
            onChange={(e) => setPlayerA(Number(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-sm text-white"
          >
            <option value={0}>-- Select Player --</option>
            {Object.entries(teams).map(([team, players]) => (
              <optgroup key={team} label={team}>
                {players.map((p) => (
                  <option key={p.steam32} value={p.steam32}>
                    {p.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Player 2
          </label>
          <select
            value={playerB}
            onChange={(e) => setPlayerB(Number(e.target.value))}
            className="w-full rounded-lg border border-white/10 bg-slate-950 p-2 text-sm text-white"
          >
            <option value={0}>-- Select Player --</option>
            {Object.entries(teams).map(([team, players]) => (
              <optgroup key={team} label={team}>
                {players.map((p) => (
                  <option key={p.steam32} value={p.steam32}>
                    {p.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2">
        <button
          onClick={pushH2H}
          disabled={busy || !playerA || !playerB}
          className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
        >
          {busy ? "Pushing..." : "🔥 Push H2H Graphic to Live"}
        </button>
      </div>
    </div>
  );
}

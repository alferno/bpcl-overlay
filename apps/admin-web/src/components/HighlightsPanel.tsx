import React, { useState } from "react";
import type { LeagueConfig } from "@bpc/shared-types";

export function HighlightsPanel({
  state,
  busy,
  onPatch,
}: {
  state: any;
  busy: boolean;
  onPatch: (body: any) => Promise<void>;
}) {
  const config = state?.leagueConfig as LeagueConfig | undefined;
  const currentHighlights = config?.highlights || {};

  const [sponsorText, setSponsorText] = useState(currentHighlights.sponsorText ?? "Powered by: Nuvorn Technologies");
  const [mainHeading, setMainHeading] = useState(currentHighlights.mainHeading ?? "CURRENT SERIES");
  const [upNext, setUpNext] = useState<string[]>(currentHighlights.upNext ?? []);

  // New Score / Team overrides
  const [team1, setTeam1] = useState(currentHighlights.team1 ?? "");
  const [team2, setTeam2] = useState(currentHighlights.team2 ?? "");
  const [score1, setScore1] = useState(currentHighlights.score1 ?? 0);
  const [score2, setScore2] = useState(currentHighlights.score2 ?? 0);
  const [seriesFormat, setSeriesFormat] = useState(currentHighlights.seriesFormat ?? "");

  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const handlePushToOBS = async () => {
    const ms = config?.matchSetup;
    if (!ms) {
      setPushStatus("Error: No Match Setup");
      return;
    }
    const slug = `bpcl_s2_${ms.radiantTeamKey}_vs_${ms.direTeamKey}_game_${ms.seriesGame ?? 1}`;
    setPushStatus("Pushing...");
    try {
      const origin = window.location.origin;
      const token = localStorage.getItem("bpcl_token") || "";
      const res = await fetch(`${origin}/api/obs/push-highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPushStatus("Pushed to OBS!");
      setTimeout(() => setPushStatus(null), 3000);
    } catch (err) {
      setPushStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const [newItem, setNewItem] = useState("");

  const handleFetchFromMatchSetup = () => {
    const ms = config?.matchSetup;
    if (ms) {
      setTeam1(ms.radiantTeamKey || "");
      setTeam2(ms.direTeamKey || "");
      setScore1(ms.scoreA ?? 0);
      setScore2(ms.scoreB ?? 0);
      setSeriesFormat(ms.seriesBestOf === 1 ? "BO1" : ms.seriesBestOf ? `BO${ms.seriesBestOf}` : "BO3");
    }
  };

  const handleSave = () => {
    onPatch({
      leagueConfig: {
        ...(config ?? {}),
        highlights: {
          sponsorText,
          mainHeading,
          upNext,
          team1,
          team2,
          score1,
          score2,
          seriesFormat
        },
      },
    });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItem.trim()) {
      setUpNext([...upNext, newItem.trim()]);
      setNewItem("");
    }
  };

  const handleRemoveItem = (index: number) => {
    setUpNext(upNext.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-xl max-w-2xl">
      <div className="flex items-center justify-between mb-6 border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Highlights Configuration
          </h2>
          <p className="text-sm text-slate-400 mt-1">Configure text fields and 'Up Next' entries for the /highlights overlay.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-300">Sponsor Text (Top Right)</label>
            <input
              type="text"
              value={sponsorText}
              onChange={(e) => setSponsorText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="Powered by: Nuvorn Technologies"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-300">Main Heading (Cyan Text)</label>
            <input
              type="text"
              value={mainHeading}
              onChange={(e) => setMainHeading(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              placeholder="CURRENT SERIES"
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-700 pt-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
            <label className="text-sm font-semibold text-slate-300">Match Overrides</label>
            <button
              onClick={handleFetchFromMatchSetup}
              type="button"
              className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-white"
            >
              Fetch from Match Setup
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Team 1 Name</label>
              <input type="text" value={team1} onChange={e => setTeam1(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Team 2 Name</label>
              <input type="text" value={team2} onChange={e => setTeam2(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Team 1 Score</label>
              <input type="number" value={score1} onChange={e => setScore1(parseInt(e.target.value) || 0)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Team 2 Score</label>
              <input type="number" value={score2} onChange={e => setScore2(parseInt(e.target.value) || 0)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-slate-400">Series Format (e.g. BO3)</label>
              <input type="text" value={seriesFormat} onChange={e => setSeriesFormat(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white" />
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-700 pt-4">
          <label className="text-sm font-semibold text-slate-300 block border-b border-slate-700 pb-2">Up Next Schedule</label>
          
          <ul className="space-y-2">
            {upNext.length === 0 && (
              <li className="text-slate-500 text-sm italic py-2">No upcoming series configured.</li>
            )}
            {upNext.map((item, i) => (
              <li key={i} className="flex items-center gap-2 bg-slate-900/50 p-2 rounded border border-slate-700/50">
                <span className="flex-1 text-white text-sm font-medium">{item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(i)}
                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                  title="Remove Item"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddItem} className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
              placeholder="e.g. G2 VS NAVI @ 20:00 CET"
            />
            <button
              type="submit"
              disabled={!newItem.trim()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium disabled:opacity-50 text-sm transition-colors"
            >
              Add Row
            </button>
          </form>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePushToOBS}
              disabled={busy}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              Push to OBS HighlightPlayer
            </button>
            {pushStatus && (
              <span className={`text-sm font-semibold ${pushStatus.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                {pushStatus}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {busy && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

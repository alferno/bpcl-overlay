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

  const [newItem, setNewItem] = useState("");

  const handleSave = () => {
    onPatch({
      leagueConfig: {
        ...(config ?? {}),
        highlights: {
          sponsorText,
          mainHeading,
          upNext,
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

        <div className="space-y-4">
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

        <div className="pt-6 mt-6 border-t border-slate-700 flex justify-end">
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

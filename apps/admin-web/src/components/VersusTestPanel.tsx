import type { DraftSlot, DraftState, OverlayEnvelope } from "@bpc/shared-types";
import { useState } from "react";
import { SectionPanel } from "./Common";

// Using some common Dota hero IDs for the mock
const MOCK_HERO_IDS = [1, 2, 4, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20];

function getRandomHeroes(count: number): number[] {
  const shuffled = [...MOCK_HERO_IDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function VersusTestPanel({
  state,
  patch,
}: {
  state: OverlayEnvelope | null;
  patch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];

  const handleMockDraft = async (gameState: string) => {
    setBusy(true);
    try {
      if (!matchSetup) {
        alert("Please set up a match in the Match & OBS tab first.");
        return;
      }

      const radiantKey = matchSetup.radiantTeamKey;
      const direKey = matchSetup.direTeamKey;

      const radiantRaw = roster.filter((p) => p.teamKey === radiantKey);
      const direRaw = roster.filter((p) => p.teamKey === direKey);

      // Always pad to 5 players per team using negative IDs as dummy fallback just like VersusPage
      const radiantPlayers = Array.from({ length: 5 }).map((_, i) => radiantRaw[i] ?? {
        steam32: -(i + 1),
        displayName: "TBD",
      });

      const direPlayers = Array.from({ length: 5 }).map((_, i) => direRaw[i] ?? {
        steam32: -(i + 10),
        displayName: "TBD",
      });

      const radiantHeroes = getRandomHeroes(5);
      const direHeroes = getRandomHeroes(5);

      const radiantSlots: DraftSlot[] = radiantPlayers.map((p, i) => ({
        order: i,
        type: "pick",
        heroId: radiantHeroes[i]!,
        steam32: p.steam32,
      }));

      const direSlots: DraftSlot[] = direPlayers.map((p, i) => ({
        order: i,
        type: "pick",
        heroId: direHeroes[i]!,
        steam32: p.steam32,
      }));

      // Find team names safely
      const radiantTeam = roster.find(p => p.teamKey === radiantKey)?.teamName || radiantKey;
      const direTeam = roster.find(p => p.teamKey === direKey)?.teamName || direKey;

      const draftPatch: Partial<DraftState> = {
        gameState,
        radiant: {
          name: radiantTeam,
          slots: radiantSlots,
        },
        dire: {
          name: direTeam,
          slots: direSlots,
        },
        phase: gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME" ? "done" : "picks",
        series: {
          teamA: radiantTeam,
          teamB: direTeam,
          scoreA: matchSetup.scoreA ?? 0,
          scoreB: matchSetup.scoreB ?? 0,
        }
      };

      await patch({ draft: draftPatch });
    } finally {
      setBusy(false);
    }
  };

  const handleClearDraft = async () => {
    setBusy(true);
    try {
      await patch({ draft: null });
    } finally {
      setBusy(false);
    }
  };

  const toggleVersusScreen = async (visible: boolean) => {
    setBusy(true);
    try {
      await patch({
        overlayVisibility: {
          versus: visible ? "visible" : "hidden",
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const isVersusVisible = state?.overlayVisibility?.versus === "visible" || 
                          (typeof state?.overlayVisibility?.versus === "object" && state?.overlayVisibility?.versus?.mode !== "hidden");

  return (
    <SectionPanel title="Developer Testing Area" icon="🧪">
      <div className="space-y-6">
        <p className="text-sm text-slate-400">
          Inject mock draft data to test the Versus screen. Requires a Match Setup to be active.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => void handleMockDraft("DOTA_GAMERULES_STATE_STRATEGY_TIME")}
            disabled={busy || !matchSetup}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 border border-emerald-500/30 hover:bg-slate-800 hover:border-emerald-500 transition-colors disabled:opacity-50"
          >
            <span className="font-bold text-emerald-400">Mock Strategy Time</span>
            <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider text-center">Fills draft & flips cards</span>
          </button>

          <button
            onClick={() => void handleMockDraft("DOTA_GAMERULES_STATE_HERO_SELECTION")}
            disabled={busy || !matchSetup}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-800/50 border border-cyan-500/30 hover:bg-slate-800 hover:border-cyan-500 transition-colors disabled:opacity-50"
          >
            <span className="font-bold text-cyan-400">Mock Drafting Phase</span>
            <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider text-center">Cards face front (players)</span>
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => void handleClearDraft()}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-slate-800 border border-red-500/30 hover:border-red-500 text-red-400 font-bold text-sm transition-colors disabled:opacity-50"
          >
            Clear Draft Data
          </button>

          <button
            onClick={() => void toggleVersusScreen(!isVersusVisible)}
            disabled={busy}
            className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-colors disabled:opacity-50 ${
              isVersusVisible 
                ? "bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30" 
                : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500"
            }`}
          >
            {isVersusVisible ? "Hide Versus Screen" : "Show Versus Screen"}
          </button>
        </div>
      </div>
    </SectionPanel>
  );
}

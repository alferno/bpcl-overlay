import type { DraftSlot, DraftState, OverlayEnvelope, HeroStatsCard } from "@bpc/shared-types";
import { useState, useEffect } from "react";
import { SectionPanel } from "./Common";
import { apiFetch } from "../api";


// Using some common Dota hero IDs for the mock
const MOCK_HERO_IDS = [1, 2, 4, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20];

function getRandomHeroes(count: number): number[] {
  const shuffled = [...MOCK_HERO_IDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function OverlayTestPanel({
  state,
  patch,
  origin,
  token,
}: {
  state: OverlayEnvelope | null;
  patch: (body: Record<string, unknown>) => Promise<void>;
  origin: string;
  token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [bountyResult, setBountyResult] = useState<{ radiant: { name: string; count: number; gold: number }; dire: { name: string; count: number; gold: number }; history: any[] } | null>(null);
  const [wisdomResult, setWisdomResult] = useState<{ radiant: { name: string; count: number; xp: number }; dire: { name: string; count: number; xp: number }; history: any[] } | null>(null);
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
        bpcId: "BPC-001",
        displayName: "TBD",
      });

      const direPlayers = Array.from({ length: 5 }).map((_, i) => direRaw[i] ?? {
        steam32: -(i + 10),
        bpcId: "BPC-001",
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
  
  const handleMockLiveCard = async () => {
    setBusy(true);
    try {
      if (!matchSetup) {
        alert("Please set up a match in the Match & OBS tab first.");
        return;
      }

      const activePlayers = roster.filter(
        (p) => p.teamKey === matchSetup.radiantTeamKey || p.teamKey === matchSetup.direTeamKey
      );

      if (activePlayers.length === 0) {
        alert("No players found in the roster for the active match teams.");
        return;
      }

      const randomPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
      const heroId = getRandomHeroes(1)[0];
      const mockCard: HeroStatsCard = {
        steam32: randomPlayer!.steam32,
        bpcId: randomPlayer!.bpcId || "BPC-001",
        playerLabel: randomPlayer!.displayName,
        heroId: heroId!,
        heroName: "Mock Hero",
        fetchedAt: new Date().toISOString(),
        source: "manual",
        playerHero: {
          games: 152,
          wins: 89,
          losses: 63,
          winRate: 58.5,
          avgKills: 8.5,
          avgDeaths: 3.2,
          avgAssists: 12.1,
          avgKda: 6.4,
          avgGpm: 550,
          avgLastHits: 220,
        }
      };

      await patch({
        livePlayerCard: mockCard,
        overlayVisibility: {
          liveplayercard: "visible",
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClearLiveCard = async () => {
    setBusy(true);
    try {
      await patch({
        livePlayerCard: null,
        overlayVisibility: {
          liveplayercard: "hidden",
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const handleShowBountyCard = async () => {
    setBusy(true);
    setBountyResult(null);
    try {
      const r = await apiFetch(origin, token, "/api/gsi/bounty-snapshot", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as any;
      setBountyResult(data);
    } catch (e) {
      console.error("[bounty] Failed to show bounty card:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleShowWisdomCard = async () => {
    setBusy(true);
    setWisdomResult(null);
    try {
      const r = await apiFetch(origin, token, "/api/gsi/wisdom-snapshot", { method: "POST" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as any;
      setWisdomResult(data);
    } catch (e) {
      console.error("[wisdom] Failed to show wisdom card:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshStats = async () => {
    setBusy(true);
    try {
      const [rBounty, rWisdom] = await Promise.all([
        apiFetch(origin, token, "/api/gsi/bounty-snapshot", { method: "GET" }),
        apiFetch(origin, token, "/api/gsi/wisdom-snapshot", { method: "GET" })
      ]);
      if (rBounty.ok) setBountyResult(await rBounty.json());
      if (rWisdom.ok) setWisdomResult(await rWisdom.json());
    } catch (e) {
      console.error("Failed to refresh stats:", e);
    } finally {
      setBusy(false);
    }
  };

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  useEffect(() => {
    // Optionally auto-fetch when opening
    void handleRefreshStats();
  }, []);
  return (
    <SectionPanel title="Developer Testing Area" icon="🧪">
      <div className="space-y-6">
        {/* Versus Testing */}
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">Versus Screen</h3>
          <p className="text-xs text-slate-400 mb-4">
            Inject mock draft data to test the Versus screen. Requires a Match Setup to be active.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

        {/* Live Player Card Testing */}
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">Live Player Card</h3>
          <p className="text-xs text-slate-400 mb-4">
            Simulate a player being focused in-game by GSI, which triggers their stat card on the overlay.
          </p>
          
          <div className="flex gap-4">
            <button
              onClick={() => void handleMockLiveCard()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-slate-800/50 border border-purple-500/30 hover:bg-slate-800 hover:border-purple-500 text-purple-400 font-bold text-sm transition-colors disabled:opacity-50"
            >
              Show Mock Live Card
            </button>

            <button
              onClick={() => void handleClearLiveCard()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500 font-bold text-sm transition-colors disabled:opacity-50"
            >
              Clear / Hide Card
            </button>
          </div>
        </div>
        {/* Bounty Rune Stats */}
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">Bounty Rune Stats</h3>
          <p className="text-xs text-slate-400 mb-4">
            Reads live bounty rune pickups tracked from GSI and shows the BountyRuneCard on the overlay for 8 seconds.
          </p>

          <div className="flex gap-4">
            <button
              onClick={() => void handleRefreshStats()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors disabled:opacity-50"
            >
              🔄 Refresh Preview
            </button>
            <button
              onClick={() => void handleShowBountyCard()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-emerald-900/40 border border-emerald-500/50 hover:bg-emerald-900 hover:border-emerald-500 text-emerald-400 font-bold text-sm transition-colors disabled:opacity-50"
            >
              💰 Push to Overlay
            </button>
          </div>

          {bountyResult && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-3">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Radiant — {bountyResult.radiant.name}</div>
                <div className="text-white font-bold text-lg">{bountyResult.radiant.count} <span className="text-slate-400 text-xs font-normal">bounties</span></div>
                <div className="text-yellow-400 font-semibold text-sm">+{bountyResult.radiant.gold}g total</div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Dire — {bountyResult.dire.name}</div>
                <div className="text-white font-bold text-lg">{bountyResult.dire.count} <span className="text-slate-400 text-xs font-normal">bounties</span></div>
                <div className="text-yellow-400 font-semibold text-sm">+{bountyResult.dire.gold}g total</div>
              </div>
            </div>
          )}
          {bountyResult?.history && bountyResult.history.length > 0 && (
            <div className="mt-3 bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <h4 className="text-xs font-bold text-slate-400 mb-2">Match History</h4>
              <div className="space-y-1">
                {bountyResult.history.map((h, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className="text-slate-500 w-8">{formatTime(h.time)}</span>
                    <span className={h.team === "radiant" ? "text-emerald-400" : "text-red-400"}>{h.team === "radiant" ? bountyResult.radiant.name : bountyResult.dire.name}</span>
                    <span className="text-slate-300 ml-auto">+{h.count} bounties (+{h.gold}g)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Wisdom Rune Stats */}
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">Wisdom Rune Stats</h3>
          <p className="text-xs text-slate-400 mb-4">
            Reads live wisdom rune pickups tracked from GSI and shows the WisdomRuneCard on the overlay for 8 seconds.
          </p>

          <div className="flex gap-4">
            <button
              onClick={() => void handleRefreshStats()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors disabled:opacity-50"
            >
              🔄 Refresh Preview
            </button>
            <button
              onClick={() => void handleShowWisdomCard()}
              disabled={busy}
              className="flex-1 py-3 rounded-lg bg-purple-900/40 border border-purple-500/50 hover:bg-purple-900 hover:border-purple-500 text-purple-400 font-bold text-sm transition-colors disabled:opacity-50"
            >
              🔮 Push to Overlay
            </button>
          </div>

          {wisdomResult && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Radiant — {wisdomResult.radiant.name}</div>
                <div className="text-white font-bold text-lg">{wisdomResult.radiant.count} <span className="text-slate-400 text-xs font-normal">runes</span></div>
                <div className="text-purple-400 font-semibold text-sm">+{wisdomResult.radiant.xp} XP total</div>
              </div>
              <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3">
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Dire — {wisdomResult.dire.name}</div>
                <div className="text-white font-bold text-lg">{wisdomResult.dire.count} <span className="text-slate-400 text-xs font-normal">runes</span></div>
                <div className="text-purple-400 font-semibold text-sm">+{wisdomResult.dire.xp} XP total</div>
              </div>
            </div>
          )}
          {wisdomResult?.history && wisdomResult.history.length > 0 && (
            <div className="mt-3 bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <h4 className="text-xs font-bold text-slate-400 mb-2">Match History</h4>
              <div className="space-y-1">
                {wisdomResult.history.map((h, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className="text-slate-500 w-8">{formatTime(h.time)}</span>
                    <span className={h.team === "radiant" ? "text-emerald-400" : "text-red-400"}>{h.team === "radiant" ? wisdomResult.radiant.name : wisdomResult.dire.name}</span>
                    <span className="text-slate-300 ml-auto">+1 wisdom (+{h.xp} XP)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionPanel>
  );
}

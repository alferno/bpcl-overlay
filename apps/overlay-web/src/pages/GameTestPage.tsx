import { useMemo, useState } from "react";
import { createDefaultEnvelope, type OverlayEnvelope } from "@bpc/shared-types";
import { OverlayContext } from "../OverlaySocketLayer";
import GameCanvas from "./GameCanvas";
import { Socket } from "socket.io-client";

// ── Mock Socket ─────────────────────────────────────────────────────────────

class MockSocket {
  listeners: Record<string, Function[]> = {};

  on(event: string, fn: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(fn);
  }

  off(event: string, fn: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
  }

  emit(event: string, ...args: any[]) {
    // In a real socket, emit sends to server. In our mock, we use a custom simulate method.
  }

  simulateEvent(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((fn) => fn(data));
    }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GameTestPage() {
  const [bgUrl, setBgUrl] = useState("");
  
  // Create a stable mock socket
  const mockSocket = useMemo(() => new MockSocket(), []);
  
  // Default overlay state ensuring Game route is visible
  const state = useMemo(() => {
    const env = createDefaultEnvelope();
    env.overlayVisibility = {
      ...env.overlayVisibility,
      game: "visible",
      liveplayercard: "visible",
    } as any;

    env.minimapState = {
      roshanState: "dead",
      tormentorRadiant: "dead",
      tormentorDire: "dead",
      radiantScanActive: false,
      direScanActive: false,
      radiantGlyphActive: false,
      direGlyphActive: false,
      radiantScanCharges: 0,
      direScanCharges: 0,
      radiantScanCooldown: 210,
      direScanCooldown: 210,
      radiantGlyphCooldown: 300,
      direGlyphCooldown: 300,
      tormentorRadiantRespawnTimer: 0,
      tormentorDireRespawnTimer: 0,
      roshanRespawnTimer: 0,
    };

    env.livePlayerCard = {
      steam32: 999999999,
      playerLabel: "Test Player",
      heroId: 74, // Invoker
      heroName: "Invoker",
      abilityCount: 6,
      fetchedAt: new Date().toISOString(),
      source: "manual",
      playerHero: {
        games: 100, wins: 50, losses: 50, winRate: 50, avgKills: 5, avgDeaths: 5, avgAssists: 5, avgKda: 2, avgGpm: 500, avgLastHits: 200
      }
    };

    return env;
  }, []);

  // ── Roshan State ──
  const [roshKillNum, setRoshKillNum] = useState(1);
  const [roshClockTime, setRoshClockTime] = useState(1200);
  const [roshTeamName, setRoshTeamName] = useState("Team Liquid");
  const [roshLogoUrl, setRoshLogoUrl] = useState("/teams/liquid.png");
  const [roshIsStolen, setRoshIsStolen] = useState(false);

  const triggerRoshan = () => {
    mockSocket.simulateEvent("ROSHAN_KILLED", {
      killNumber: roshKillNum,
      clockTime: roshClockTime,
      teamName: roshTeamName || undefined,
      teamLogoUrl: roshLogoUrl || undefined,
      killerTeam: roshIsStolen ? "radiant" : "dire",
      pickerTeam: "dire",
      pickerPlayerName: "Nisha",
      drops:
        roshKillNum >= 3
          ? ["item_aegis", "item_cheese", "item_refresher_shard"]
          : roshKillNum === 2
          ? ["item_aegis", "item_cheese"]
          : ["item_aegis"],
    });
    setRoshKillNum(roshKillNum + 1);
  };

  // ── Power Spike State ──
  const [spikePlayer, setSpikePlayer] = useState("Nisha");
  const [spikeHero, setSpikeHero] = useState("Puck");
  const [spikeItemCode, setSpikeItemCode] = useState("item_blink");
  const [spikeItemName, setSpikeItemName] = useState("Blink Dagger");
  const [spikeCategory, setSpikeCategory] = useState("CRITICAL MOBILITY");
  const [spikeTimeDiff, setSpikeTimeDiff] = useState(-15);

  const triggerPowerSpike = () => {
    mockSocket.simulateEvent("POWER_SPIKE", {
      playerName: spikePlayer,
      heroName: spikeHero,
      item: spikeItemCode,
      cleanItemName: spikeItemName,
      categoryText: spikeCategory,
      clockTime: roshClockTime,
      averageTime: roshClockTime - spikeTimeDiff,
      timingDiff: spikeTimeDiff,
    });
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white font-body">
      
      {/* ── Background Image ── */}
      {bgUrl && (
        <img
          src={bgUrl}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}
      {!bgUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-bold text-2xl z-0">
          No Background Image Provided
        </div>
      )}

      {/* ── Overlay Canvas ── */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <OverlayContext.Provider value={{ state, socket: mockSocket as unknown as Socket }}>
          <GameCanvas />
        </OverlayContext.Provider>
      </div>

      {/* ── Control Panel ── */}
      <div 
        className="absolute top-4 left-4 z-50 bg-slate-900/90 border border-slate-700 p-4 rounded-xl shadow-2xl backdrop-blur max-w-sm w-full flex flex-col gap-6"
        style={{ pointerEvents: "auto" }}
      >
        <h2 className="font-heading font-bold text-xl text-yellow-500 border-b border-slate-700 pb-2">
          Overlay Test Controls
        </h2>

        {/* Background Image Setup */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Background URL</label>
          <input 
            type="text" 
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm"
            placeholder="Paste screenshot URL here..."
            value={bgUrl}
            onChange={(e) => setBgUrl(e.target.value)}
          />
        </div>

        {/* Roshan Kill Triggers */}
        <div className="flex flex-col gap-3 bg-slate-800/50 p-3 rounded-lg border border-red-500/20">
          <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Roshan Event</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input type="number" placeholder="Kill #" value={roshKillNum} onChange={e => setRoshKillNum(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="number" placeholder="Clock (s)" value={roshClockTime} onChange={e => setRoshClockTime(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="text" placeholder="Team Name" value={roshTeamName} onChange={e => setRoshTeamName(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="text" placeholder="Logo URL" value={roshLogoUrl} onChange={e => setRoshLogoUrl(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <label className="flex items-center gap-2 text-xs text-slate-300 col-span-2">
              <input type="checkbox" checked={roshIsStolen} onChange={e => setRoshIsStolen(e.target.checked)} />
              Simulate Stolen Aegis (Radiant Kill, Dire Picked - Nisha)
            </label>
          </div>
          <button 
            onClick={triggerRoshan}
            className="mt-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded shadow transition-colors"
          >
            Trigger Roshan Kill
          </button>
        </div>

        {/* Power Spike Triggers */}
        <div className="flex flex-col gap-3 bg-slate-800/50 p-3 rounded-lg border border-yellow-500/20">
          <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider">Power Spike Event</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input type="text" placeholder="Player" value={spikePlayer} onChange={e => setSpikePlayer(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="text" placeholder="Hero" value={spikeHero} onChange={e => setSpikeHero(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="text" placeholder="Item Code" value={spikeItemCode} onChange={e => setSpikeItemCode(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" title="e.g. item_blink, item_black_king_bar" />
            <input type="text" placeholder="Clean Name" value={spikeItemName} onChange={e => setSpikeItemName(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="text" placeholder="Category" value={spikeCategory} onChange={e => setSpikeCategory(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" />
            <input type="number" placeholder="Time Diff" value={spikeTimeDiff} onChange={e => setSpikeTimeDiff(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-2 py-1" title="Negative for faster than average" />
          </div>
          <button 
            onClick={triggerPowerSpike}
            className="mt-1 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded shadow transition-colors"
          >
            Trigger Power Spike
          </button>
        </div>

      </div>

    </div>
  );
}

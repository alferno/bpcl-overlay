/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  NAMESPACES,
  OVERLAY_ROUTES,
  SOCKET_EVENTS,
  type OverlayEnvelope,
  type VisibilityMode,
} from "@bpc/shared-types";
import { useCallback, useEffect, useState } from "react";
import io from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";

import { apiFetch, loadConnection, saveConnection } from "./api";
import { StatsWorkspace } from "./StatsWorkspace";
import { GameStartTimerPanel } from "./GameStartTimerPanel";
import { MatchSetupPanel } from "./MatchSetupPanel";

// Import new modularized panels
import { ConnectCard } from "./components/ConnectCard";
import { EmergencyRow } from "./components/EmergencyRow";
import { ObsBlock } from "./components/ObsBlock";
import { VisMatrix } from "./components/VisMatrix";
import { SponsorBlock } from "./components/SponsorBlock";
import { RosterSyncPanel } from "./components/RosterSyncPanel";
import { GsiDraftControls } from "./components/GsiDraftControls";
import { LowerThirdPanel } from "./components/LowerThirdPanel";
import { StandoutPlayerPanel } from "./components/StandoutPlayerPanel";
import { ReplayManagerPanel } from "./components/ReplayManagerPanel";
import { CasterDeckPanel } from "./components/CasterDeckPanel";
import { OverlayTestPanel } from "./components/OverlayTestPanel";
import { OverlayLayoutControls } from "./components/OverlayLayoutControls";
import { ErrBox } from "./components/Common";

type TabId = "dashboard" | "match_obs" | "stats" | "roster" | "lower_thirds" | "replays" | "in_game_controller" | "testing";

export function ProducerDashboard() {
  const persisted = loadConnection();
  const [origin, setOrigin] = useState(persisted.origin);
  const [token, setToken] = useState(persisted.token);
  const [state, setState] = useState<OverlayEnvelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sock, setSock] = useState("idle");
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const persist = () => saveConnection(origin, token);

  const refresh = useCallback(async () => {
    if (!token.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch(origin, token, "/api/state");
      if (!r.ok) throw new Error(await r.text());
      setState(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [origin, token]);

  useEffect(() => {
    persist();
  }, [origin, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token.trim()) return undefined;
    const s = io(`${origin}${NAMESPACES.PRODUCER}`, {
      transports: ["websocket"],
      auth: { token },
    });
    s.on(SOCKET_EVENTS.STATE_FULL, (snap: OverlayEnvelope) => setState(snap));
    s.on("connect", () => setSock("connected"));
    s.on("disconnect", () => setSock("disconnected"));
    s.on("connect_error", () => setSock("handshake_failed"));
    return () => void s.disconnect();
  }, [origin, token]);

  const patch = useCallback(
    async (body: Record<string, unknown>): Promise<void> => {
      if (!token.trim()) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await apiFetch(origin, token, "/api/state", {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(await r.text());
        setState(await r.json());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [origin, token],
  );

  async function resetEnv(): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch(origin, token, "/api/state/reset", {
        method: "POST",
      });
      if (!r.ok) throw new Error(await r.text());
      setState(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function hideAll(): Promise<void> {
    const overlayVisibility = Object.fromEntries(
      OVERLAY_ROUTES.map((k) => [k, "hidden" as VisibilityMode]),
    );
    await patch({ overlayVisibility });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans antialiased selection:bg-cyan-500/30 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} sock={sock} />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Header Bar */}
        <header className="border-b border-white/5 bg-slate-900/40 backdrop-blur-md px-8 py-5 flex items-center justify-between sticky top-0 z-50">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-400">broadcast center</p>
            <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">BPC Broadcasting Suite Dashboard</h1>
          </div>
          <div className="flex items-center gap-6 text-xs">
            {/* Status indicators */}
            <div className="flex items-center gap-4 border-r border-white/10 pr-6">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${sock === "connected" ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
                <span className="text-[11px] text-slate-400">Socket: <strong className="text-slate-200 capitalize">{sock}</strong></span>
              </div>
              {busy && (
                <div className="flex items-center gap-1.5 text-cyan-400 animate-pulse font-bold text-[11px]">
                  <span>SYNCING...</span>
                </div>
              )}
            </div>

            {/* Quick emergency blackout */}
            <button
              onClick={() => void hideAll()}
              className="bg-gradient-to-r from-red-700 to-orange-700 hover:from-red-600 hover:to-orange-600 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-lg transition-all shadow-md shadow-red-950/20"
            >
              Blackout Overlays
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <div className="flex-1 p-8 space-y-6 max-w-7xl w-full mx-auto">
          {err && <ErrBox text={err} />}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {activeTab === "dashboard" && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[300px_1fr]">
                  <div className="space-y-6">
                    <ConnectCard
                      origin={origin}
                      token={token}
                      setO={setOrigin}
                      setT={setToken}
                      onSave={() => {
                        persist();
                        void refresh();
                      }}
                    />
                    <EmergencyRow
                      onHide={() => void hideAll()}
                      onReset={() => void resetEnv()}
                      onSnap={() => void refresh()}
                    />
                  </div>
                  <div className="space-y-6">
                    <GameStartTimerPanel
                      state={state}
                      busy={busy}
                      onPatch={patch}
                      onVisibility={(visible) =>
                        patch({
                          overlayVisibility: { startingsoon: visible ? "visible" : "hidden" },
                        })
                      }
                    />
                    <VisMatrix
                      state={state}
                      on={(r, m) => patch({ overlayVisibility: { [r]: m } })}
                    />
                    <StandoutPlayerPanel origin={origin} token={token} />
                  </div>
                </div>
              )}

              {activeTab === "in_game_controller" && (
                <div className="grid gap-6 items-start max-w-3xl">
                  <OverlayLayoutControls
                    state={state}
                    busy={busy}
                    onPatch={patch}
                  />
                </div>
              )}

              {activeTab === "match_obs" && (
                <div className="grid gap-6 lg:grid-cols-2 items-start">
                  <MatchSetupPanel
                    origin={origin}
                    token={token}
                    state={state}
                    setErr={setErr}
                  />
                  <div className="space-y-6">
                    <ObsBlock origin={origin} token={token} />
                    <SponsorBlock
                      state={state}
                      on={(sponsor) => patch({ sponsor })}
                      onToggleSponsors={(visible) =>
                        patch({ overlayVisibility: { sponsors: visible ? "visible" : "hidden" } })
                      }
                    />
                  </div>
                </div>
              )}

              {activeTab === "stats" && (
                <div className="space-y-6">
                  <StatsWorkspace
                    origin={origin}
                    token={token}
                    state={state}
                    setErr={setErr}
                    onShowOverlay={(route, seconds) =>
                      patch({
                        overlayVisibility: {
                          [route]: {
                            mode: "timed",
                            until: Date.now() + (seconds ?? 8) * 1000,
                          },
                        },
                      })
                    }
                  />
                  <CasterDeckPanel
                    roster={state?.leagueConfig?.roster ?? []}
                    origin={origin}
                    token={token}
                  />
                </div>
              )}

              {activeTab === "roster" && (
                <div className="grid gap-6 items-start">
                  <RosterSyncPanel
                    origin={origin}
                    token={token}
                    state={state}
                    setErr={setErr}
                  />
                  <GsiDraftControls
                    origin={origin}
                    token={token}
                    state={state}
                    setErr={setErr}
                  />
                </div>
              )}

              {activeTab === "lower_thirds" && (
                <div className="space-y-6">
                  <LowerThirdPanel
                    origin={origin}
                    token={token}
                    state={state}
                    setErr={setErr}
                  />
                </div>
              )}

              {activeTab === "replays" && (
                <ReplayManagerPanel
                  origin={origin}
                  token={token}
                />
              )}

              {activeTab === "testing" && (
                <div className="grid gap-6 items-start">
                  <OverlayTestPanel state={state} patch={patch} origin={origin} token={token} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function Sidebar({
  activeTab,
  setActiveTab,
  sock,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  sock: string;
}) {
  const tabs = [
    {
      id: "dashboard" as TabId,
      label: "Control Center",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
    },
    {
      id: "match_obs" as TabId,
      label: "Match & OBS",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
    },
    {
      id: "stats" as TabId,
      label: "Broadcast Stats",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: "roster" as TabId,
      label: "Roster & GSI",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: "lower_thirds" as TabId,
      label: "Lower Thirds",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      ),
    },
    {
      id: "replays" as TabId,
      label: "Replay Manager",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "in_game_controller" as TabId,
      label: "In-Game Controller",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
      ),
    },
    {
      id: "testing" as TabId,
      label: "Testing Area",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="w-64 border-r border-white/5 bg-slate-900/80 flex flex-col justify-between shrink-0 select-none">
      <div className="flex flex-col">
        {/* Logo and branding */}
        <div className="px-6 py-8 flex items-center gap-3 border-b border-white/5">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center font-black text-slate-950 text-xs tracking-tighter">
            BPC
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white">BPC Broadcasting</h2>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] -mt-0.5">Suite</p>
          </div>
        </div>

        {/* Tab Navigation items */}
        <nav className="p-4 space-y-1.5 flex-1 mt-4">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/10 text-cyan-300 border-l-2 border-cyan-500 font-black shadow-inner shadow-cyan-950/15"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border-l-2 border-transparent"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer information */}
      <div className="p-6 border-t border-white/5">
        <div className="flex items-center gap-2 justify-center">
          <div className={`h-1.5 w-1.5 rounded-full ${sock === "connected" ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {sock === "connected" ? "Suite Synchronized" : "Disconnected"}
          </span>
        </div>
      </div>
    </aside>
  );
}

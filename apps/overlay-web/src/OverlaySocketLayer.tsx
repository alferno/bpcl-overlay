import {
  NAMESPACES,
  SOCKET_EVENTS,
  createDefaultEnvelope,
  type OverlayEnvelope,
} from "@bpc/shared-types";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import io, { Socket } from "socket.io-client";

type Ctx = {
  state: OverlayEnvelope;
  socket: Socket | null;
};

export const OverlayContext = createContext<Ctx>({
  state: createDefaultEnvelope(),
  socket: null,
});

export function useOverlayState(): Ctx {
  return useContext(OverlayContext);
}

import { resolveApiOrigin } from "./utils/resolve-origin";

import { PlayerCardPreloader } from "./components/PlayerCardPreloader";

export default function OverlaySocketLayer({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<OverlayEnvelope>(createDefaultEnvelope());

  useEffect(() => {
    const origin = resolveApiOrigin();
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token") || import.meta.env.VITE_SOCKET_TOKEN || "";

    // Fetch the latest state via REST — used on connect and reconnect
    // to catch up on any broadcasts missed while OBS had the source suspended.
    const fetchState = async () => {
      try {
        const r = await fetch(`${origin}/api/overlay-state`);
        if (r.ok) {
          const snap: OverlayEnvelope = await r.json();
          setState(snap);
        }
      } catch {
        // silently ignore — socket will eventually deliver state
      }
    };

    const s = io(`${origin}${NAMESPACES.OVERLAY}`, {
      transports: ["websocket"],
      auth: token ? { token } : undefined,
      query: token ? { token } : undefined,
    });

    s.on(SOCKET_EVENTS.STATE_FULL, (snap: OverlayEnvelope) => {
      setState(snap);
    });

    // On every connect / reconnect, also do an HTTP fetch so we never
    // miss a state change that fired while OBS had this source suspended.
    s.on("connect", () => {
      void fetchState();
    });

    s.on("connect_error", () => {
      console.warn("[overlay] websocket connect blocked — verify token/env");
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, []);


  const value = useMemo(() => {
    let effectiveState = state;
    if (state.leagueConfig?.overlayStatsMode === "lifetime") {
      effectiveState = {
        ...state,
        tournamentHeroIndex: state.lifetimeTournamentHeroIndex ?? state.tournamentHeroIndex,
        playerHeroIndex: state.lifetimePlayerHeroIndex ?? state.playerHeroIndex,
      };
    }
    return { socket, state: effectiveState };
  }, [socket, state]);

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <PlayerCardPreloader />
    </OverlayContext.Provider>
  );
}

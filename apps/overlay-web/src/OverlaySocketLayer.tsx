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

function resolveOrigin(): string {
  return (
    import.meta.env.VITE_BROADCAST_API_ORIGIN ?? window.location.origin
  );
}

import { PlayerCardPreloader } from "./components/PlayerCardPreloader";

export default function OverlaySocketLayer({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<OverlayEnvelope>(createDefaultEnvelope());

  useEffect(() => {
    const token = import.meta.env.VITE_SOCKET_TOKEN ?? "";

    const s = io(`${resolveOrigin()}${NAMESPACES.OVERLAY}`, {
      transports: ["websocket"],
      auth: token ? { token } : undefined,
      query: token ? { token } : undefined,
    });

    s.on(SOCKET_EVENTS.STATE_FULL, (snap: OverlayEnvelope) => {
      setState(snap);
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

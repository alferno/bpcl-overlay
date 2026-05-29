import { useEffect, useRef, useState } from "react";

/**
 * Smooth 1s countdown for the main pick/ban timer.
 * Snaps to server when drift exceeds 2s; does not reset on every GSI tick.
 */
export function useDraftCountdown(
  serverSeconds: number | undefined,
  resetKey: string,
): number {
  const [display, setDisplay] = useState(() =>
    Math.max(0, Math.floor(serverSeconds ?? 0)),
  );
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      setDisplay(Math.max(0, Math.floor(serverSeconds ?? 0)));
      return;
    }
    const server = Math.max(0, Math.floor(serverSeconds ?? 0));
    setDisplay((prev) => {
      if (server < prev) return server;
      if (server > prev + 2) return server;
      return prev;
    });
  }, [serverSeconds, resetKey]);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((d) => Math.max(0, d - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resetKey]);

  return display;
}

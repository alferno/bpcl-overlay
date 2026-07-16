import { useOverlayState } from "../OverlaySocketLayer";
import { useEffect, useMemo } from "react";
import { getActivePlayers } from "../utils/active-players";

export function PlayerCardPreloader() {
  const { state } = useOverlayState();
  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];

  const playersToPreload = useMemo(() => {
    return getActivePlayers(state).allActivePlayers.filter(p => !!p.bpcId);
  }, [state]);

  useEffect(() => {
    const preloaderContainer = document.getElementById("bpc-preloader-container");
    if (!preloaderContainer) return;

    playersToPreload.forEach(player => {
      const iframeId = `bpc-iframe-${player.bpcId}`;
      if (!document.getElementById(iframeId)) {
        const iframe = document.createElement("iframe");
        iframe.id = iframeId;
        iframe.src = `https://bpcleague.in/overlay/card/${player.bpcId}`;
        iframe.title = `preload-${player.bpcId}`;
        iframe.style.width = "240px";
        iframe.style.height = "360px";
        iframe.style.border = "none";
        iframe.style.visibility = "hidden";
        preloaderContainer.appendChild(iframe);
      }
    });
  }, [playersToPreload]);

  return (
    <div id="bpc-preloader-container" style={{ position: "absolute", left: 0, top: 0, zIndex: 9999, pointerEvents: "none" }} />
  );
}


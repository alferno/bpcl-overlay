import { useOverlayState } from "../OverlaySocketLayer";
import { useEffect, useMemo } from "react";

export function PlayerCardPreloader() {
  const { state } = useOverlayState();
  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];

  const playersToPreload = useMemo(() => {
    if (!matchSetup) return [];
    
    const radiantKey = matchSetup.radiantTeamKey || "";
    const direKey = matchSetup.direTeamKey || "";
    
    const radiantPlayers = roster.filter((p) => p.teamKey === radiantKey).slice(0, 5);
    const direPlayers = roster.filter((p) => p.teamKey === direKey).slice(0, 5);
    
    return [...radiantPlayers, ...direPlayers].filter(p => !!p.bpcId);
  }, [matchSetup, roster]);

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
    <div id="bpc-preloader-container" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none", opacity: 0 }} />
  );
}


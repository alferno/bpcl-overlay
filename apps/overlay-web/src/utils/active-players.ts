import type { OverlayEnvelope, RosterPlayer } from "@bpc/shared-types";

export function getActivePlayers(state: OverlayEnvelope): {
  radiantPlayers: RosterPlayer[];
  direPlayers: RosterPlayer[];
  allActivePlayers: RosterPlayer[];
} {
  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];
  const radiantKey = matchSetup?.radiantTeamKey || "";
  const direKey = matchSetup?.direTeamKey || "";

  // 1. Get default players from roster (top 5 for each team)
  let radiantPlayers = roster.filter((p) => p.teamKey === radiantKey).slice(0, 5);
  let direPlayers = roster.filter((p) => p.teamKey === direKey).slice(0, 5);

  // Pad arrays if less than 5
  while (radiantPlayers.length < 5) {
    radiantPlayers.push({ steam32: -(radiantPlayers.length + 1), displayName: "TBD", teamKey: radiantKey } as RosterPlayer);
  }
  while (direPlayers.length < 5) {
    direPlayers.push({ steam32: -(direPlayers.length + 10), displayName: "TBD", teamKey: direKey } as RosterPlayer);
  }

  // 2. Override with manual Admin pickPlayers if set in matchSetup
  if (matchSetup?.pickPlayers) {
    if (matchSetup.pickPlayers.radiant) {
      matchSetup.pickPlayers.radiant.forEach((steam32, idx) => {
        if (steam32) {
          const p = roster.find((r) => r.steam32 === steam32);
          if (p) radiantPlayers[idx] = p;
        }
      });
    }
    if (matchSetup.pickPlayers.dire) {
      matchSetup.pickPlayers.dire.forEach((steam32, idx) => {
        if (steam32) {
          const p = roster.find((r) => r.steam32 === steam32);
          if (p) direPlayers[idx] = p;
        }
      });
    }
  }

  // 3. GSI Auto-detection disabled to maintain static card order from matchSetup/roster
  // and prevent shuffling or card duplications. Hero mapping is handled dynamically by steam32 on flip.

  // Collect the active 10 players. We also append the currently focused livePlayerCard
  // just in case they are focused by the admin but aren't in the active 10 for some reason.
  const focusedCard = state?.livePlayerCard;
  let allActivePlayers = [...radiantPlayers, ...direPlayers];
  
  if (focusedCard?.bpcId) {
    const p = roster.find((r) => r.bpcId === focusedCard.bpcId);
    if (p && !allActivePlayers.some((a) => a.bpcId === p.bpcId)) {
      allActivePlayers.push(p);
    }
  }
  
  // Deduplicate by steam32
  allActivePlayers = allActivePlayers.filter((v, i, a) => a.findIndex((t) => t.steam32 === v.steam32) === i);

  return { radiantPlayers, direPlayers, allActivePlayers };
}

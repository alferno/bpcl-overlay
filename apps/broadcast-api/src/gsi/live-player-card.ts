export type FocusedPlayerMatch = {
  steam32: number;
  heroId: number;
};

export function detectFocusedPlayer(payload: any): FocusedPlayerMatch | null {
  if (!payload || typeof payload !== "object") return null;

  const checkTeam = (teamKey: "team2" | "team3"): FocusedPlayerMatch | null => {
    const teamHeroData = payload.hero?.[teamKey];
    const teamPlayerData = payload.player?.[teamKey];

    if (!teamHeroData || !teamPlayerData) return null;

    for (let i = 0; i <= 9; i++) {
      const playerKey = `player${i}`;
      const hero = teamHeroData[playerKey];
      const player = teamPlayerData[playerKey];

      if (hero && typeof hero === "object" && hero.selected_unit === true) {
        let heroId: number | null = null;
        const idRaw = hero.hero_id ?? hero.heroid ?? hero.id;
        if (typeof idRaw === "number" && idRaw > 0) {
          heroId = idRaw;
        } else if (typeof idRaw === "string") {
          const n = Number(idRaw);
          if (Number.isFinite(n) && n > 0) heroId = n;
        }

        let steam32: number | null = null;
        if (player && typeof player === "object" && player.accountid) {
          const num = parseInt(String(player.accountid), 10);
          if (Number.isFinite(num) && num > 0) steam32 = num;
        }

        if (heroId && steam32) {
          return { steam32, heroId };
        }
      }
    }
    return null;
  };

  return checkTeam("team2") || checkTeam("team3");
}

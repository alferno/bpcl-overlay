export type FocusedPlayerMatch = {
  steam32: number;
  heroId: number;
  playerName: string;
  abilityCount?: number;
};

const FIXED_HUD_WIDTH: Record<number, number> = {
  74: 6,  // Invoker
  114: 6, // Monkey King
  95: 6,  // Troll Warlord
  91: 6,  // IO
  92: 6,  // Visage
  11: 6,  // Shadow Fiend
};

// Heroes whose raw count is fully trusted because their extra slots are gained organically
const UNCAPPED_HEROES = new Set<number>([
  69,  // Doom
  86,  // Rubick
  131, // Ringmaster
]);

const SCEPTER_ADDS_SLOT = new Set<number>([
  51, 23, 84, 100, 56, 123, 82, 44, 46, 109, 58, 90, 79, 22, 128, 107
]);

const SHARD_ADDS_SLOT = new Set<number>([
  84, 100, 83, 56, 123, 82, 44, 46, 109, 87, 58, 31, 111, 79, 27, 22
]);

function applyCap(
  rawCount: number,
  heroId: number | null,
  hasShard: boolean,
  hasScepter: boolean
): number {
  if (heroId && FIXED_HUD_WIDTH[heroId] !== undefined) {
    return FIXED_HUD_WIDTH[heroId];
  }
  if (heroId && UNCAPPED_HEROES.has(heroId)) {
    return rawCount;
  }
  
  const shardGrantsSlot = hasShard && heroId !== null && SHARD_ADDS_SLOT.has(heroId);
  const scepterGrantsSlot = hasScepter && heroId !== null && SCEPTER_ADDS_SLOT.has(heroId);
  
  if (shardGrantsSlot || scepterGrantsSlot) {
    return Math.min(rawCount, 6);
  }
  return Math.min(rawCount, 5);
}

function countAbilities(
  abilitiesObj: unknown,
  heroId: number | null,
  hasShard: boolean,
  hasScepter: boolean
): number {
  // Fixed width heroes bypass raw counting entirely
  if (heroId && FIXED_HUD_WIDTH[heroId] !== undefined) {
    return FIXED_HUD_WIDTH[heroId];
  }

  if (!abilitiesObj || typeof abilitiesObj !== "object") return 0;

  let count = 0;
  for (const [key, ability] of Object.entries(abilitiesObj)) {
    if (
      key.startsWith("ability") &&
      typeof ability === "object" &&
      ability !== null
    ) {
      const a = ability as any;
      if (
        a.hidden !== true &&
        typeof a.name === "string" &&
        !a.name.startsWith("special_bonus") &&
        a.name !== "generic_hidden" &&
        a.name !== "empty"
      ) {
        count++;
      }
    }
  }

  return applyCap(count, heroId, hasShard, hasScepter);
}

export function detectFocusedPlayer(payload: any): FocusedPlayerMatch | null {
  if (!payload || typeof payload !== "object") return null;

  // 1. Spectator/Observer Mode Check
  const rootPlayer = payload.player;
  const rootHero = payload.hero;
  if (rootPlayer && typeof rootPlayer === "object" && rootHero && typeof rootHero === "object") {
    if (rootPlayer.accountid && (rootHero.hero_id || rootHero.heroid || rootHero.id)) {
      const accountid = parseInt(String(rootPlayer.accountid), 10);
      const idRaw = rootHero.hero_id ?? rootHero.heroid ?? rootHero.id;
      let heroId: number | null = null;
      if (typeof idRaw === "number" && idRaw > 0) {
        heroId = idRaw;
      } else if (typeof idRaw === "string") {
        const n = Number(idRaw);
        if (Number.isFinite(n) && n > 0) heroId = n;
      }

      if (Number.isFinite(accountid) && accountid > 0 && heroId) {
        let playerName = "Unknown";
        if (typeof rootPlayer.name === "string") {
          playerName = rootPlayer.name;
        }
        
        const hasShard = rootHero.aghanims_shard === true;
        const hasScepter = rootHero.aghanims_scepter === true;

        return { 
          steam32: accountid, 
          heroId, 
          playerName,
          abilityCount: countAbilities(payload.abilities, heroId, hasShard, hasScepter)
        };
      }
    }
  }

  // 2. Local Player / Replay Fallback (Iterating team nodes)
  const checkTeam = (teamKey: "team2" | "team3"): FocusedPlayerMatch | null => {
    const teamHeroData = payload.hero?.[teamKey];
    const teamPlayerData = payload.player?.[teamKey];
    const teamAbilitiesData = payload.abilities?.[teamKey];

    if (!teamHeroData || !teamPlayerData) return null;

    for (let i = 0; i <= 9; i++) {
      const playerKey = `player${i}`;
      const hero = teamHeroData[playerKey];
      const player = teamPlayerData[playerKey];
      const abilities = teamAbilitiesData?.[playerKey];

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
        
        let playerName = "Unknown";
        if (player && typeof player === "object" && typeof player.name === "string") {
          playerName = player.name;
        }

        if (heroId && steam32) {
          const hasShard = hero.aghanims_shard === true;
          const hasScepter = hero.aghanims_scepter === true;

          return { 
            steam32, 
            heroId, 
            playerName,
            abilityCount: countAbilities(abilities, heroId, hasShard, hasScepter)
          };
        }
      }
    }
    return null;
  };

  return checkTeam("team2") || checkTeam("team3");
}

export type EnemyHeroKill = {
  heroId: number;
  heroClass: string;
  kills: number;
};

export type FocusedPlayerMatch = {
  steam32: number;
  heroId: number;
  playerName: string;
  abilityCount?: number;
  /** Live in-game stats */
  kills?: number;
  deaths?: number;
  assists?: number;
  lastHits?: number;
  denies?: number;
  /** Kills against each individual enemy hero (from payload.player.killed map) */
  enemyHeroKills?: EnemyHeroKill[];
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

/**
 * Parse the GSI `player.killed` map (e.g. { npc_dota_hero_antimage: 2 })
 * into a list of EnemyHeroKill entries, including enemies with 0 kills.
 *
 * @param killedMap  The `player.killed` object from the focused player's slot
 * @param enemyTeamHeroes  hero data for all 5 enemy players
 */
function parseEnemyHeroKills(
  killedMap: unknown,
  enemyTeamHeroes: Array<{ heroClass: string; heroId: number | null; playerIndex: number }>
): EnemyHeroKill[] {
  // Build a map of heroClass -> kill count from the killed map
  const killsByClass = new Map<string, number>();
  const killsByVictimId = new Map<number, number>();
  
  if (killedMap && typeof killedMap === "object") {
    for (const [key, val] of Object.entries(killedMap as Record<string, unknown>)) {
      const count = typeof val === "number" ? val : Number(val) || 0;
      if (key.startsWith("npc_dota_hero_")) {
        killsByClass.set(key, count);
      } else if (key.startsWith("victimid_")) {
        const id = parseInt(key.replace("victimid_", ""), 10);
        if (!isNaN(id)) {
          killsByVictimId.set(id, count);
        }
      }
    }
  }

  return enemyTeamHeroes.map(({ heroClass, heroId, playerIndex }) => {
    let kills = killsByClass.get(heroClass) ?? 0;
    if (killsByVictimId.has(playerIndex)) {
      kills = Math.max(kills, killsByVictimId.get(playerIndex) || 0);
    }
    return {
      heroId: heroId ?? 0,
      heroClass,
      kills,
    };
  });
}

/**
 * Get enemy team hero entries from the GSI payload.
 * If focused player is on team2 (radiant), enemies are on team3 (dire), and vice versa.
 */
function getEnemyTeamHeroes(
  payload: any,
  enemyTeamKey: "team2" | "team3"
): Array<{ heroClass: string; heroId: number | null; playerIndex: number }> {
  const teamHeroData = payload?.hero?.[enemyTeamKey];
  if (!teamHeroData || typeof teamHeroData !== "object") return [];

  const result: Array<{ heroClass: string; heroId: number | null; playerIndex: number }> = [];
  for (let i = 0; i <= 9; i++) {
    const heroEntry = teamHeroData[`player${i}`];
    if (!heroEntry || typeof heroEntry !== "object") continue;

    const heroClassRaw = heroEntry.name ?? heroEntry.hero_name ?? heroEntry.class;
    const heroClass = typeof heroClassRaw === "string" && heroClassRaw.startsWith("npc_dota_hero_")
      ? heroClassRaw
      : "";

    const idRaw = heroEntry.hero_id ?? heroEntry.heroid ?? heroEntry.id;
    let heroId: number | null = null;
    if (typeof idRaw === "number" && idRaw > 0) {
      heroId = idRaw;
    } else if (typeof idRaw === "string") {
      const n = Number(idRaw);
      if (Number.isFinite(n) && n > 0) heroId = n;
    }

    if (heroId || heroClass) {
      result.push({ heroClass: heroClass || `npc_dota_hero_unknown_${i}`, heroId, playerIndex: i });
    }
  }
  return result;
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

        // Extract live stats from root player
        const kills = typeof rootPlayer.kills === "number" ? rootPlayer.kills : Number(rootPlayer.kills) || 0;
        const deaths = typeof rootPlayer.deaths === "number" ? rootPlayer.deaths : Number(rootPlayer.deaths) || 0;
        const assists = typeof rootPlayer.assists === "number" ? rootPlayer.assists : Number(rootPlayer.assists) || 0;
        const lastHits = typeof rootPlayer.last_hits === "number" ? rootPlayer.last_hits : Number(rootPlayer.last_hits) || 0;
        const denies = typeof rootPlayer.denies === "number" ? rootPlayer.denies : Number(rootPlayer.denies) || 0;

        // In spectator mode we don't know which team the focused player is on from root player alone;
        // best-effort: try to find them in team2 or team3 to determine enemy side
        let enemyHeroKills: EnemyHeroKill[] | undefined;
        const killedMap = rootPlayer.kill_list;

        // Try to determine which team the focused player is on
        for (const teamKey of ["team2", "team3"] as const) {
          const teamPlayerData = payload?.player?.[teamKey];
          if (!teamPlayerData) continue;
          for (let i = 0; i <= 9; i++) {
            const p = teamPlayerData[`player${i}`];
            if (p?.accountid && parseInt(String(p.accountid), 10) === accountid) {
              const enemyTeam = teamKey === "team2" ? "team3" : "team2";
              const enemyHeroes = getEnemyTeamHeroes(payload, enemyTeam);
              // Use p.kill_list as a fallback if rootPlayer.kill_list is empty
              enemyHeroKills = parseEnemyHeroKills(killedMap || p.kill_list, enemyHeroes);
              break;
            }
          }
          if (enemyHeroKills) break;
        }

        return { 
          steam32: accountid, 
          heroId, 
          playerName,
          abilityCount: countAbilities(payload.abilities, heroId, hasShard, hasScepter),
          kills,
          deaths,
          assists,
          lastHits,
          denies,
          enemyHeroKills,
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

          // Extract live stats
          const kills = typeof player?.kills === "number" ? player.kills : Number(player?.kills) || 0;
          const deaths = typeof player?.deaths === "number" ? player.deaths : Number(player?.deaths) || 0;
          const assists = typeof player?.assists === "number" ? player.assists : Number(player?.assists) || 0;
          const lastHits = typeof player?.last_hits === "number" ? player.last_hits : Number(player?.last_hits) || 0;
          const denies = typeof player?.denies === "number" ? player.denies : Number(player?.denies) || 0;

          // Enemy heroes on opposite team
          const enemyTeam = teamKey === "team2" ? "team3" : "team2";
          const enemyHeroes = getEnemyTeamHeroes(payload, enemyTeam);
          const enemyHeroKills = parseEnemyHeroKills(player?.kill_list, enemyHeroes);

          return { 
            steam32, 
            heroId, 
            playerName,
            abilityCount: countAbilities(abilities, heroId, hasShard, hasScepter),
            kills,
            deaths,
            assists,
            lastHits,
            denies,
            enemyHeroKills,
          };
        }
      }
    }
    return null;
  };

  return checkTeam("team2") || checkTeam("team3");
}

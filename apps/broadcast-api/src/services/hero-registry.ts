import {
  buildHeroSlugIndex,
  heroPortraitUrlFromInternalName,
  resolveHeroSlug,
  teamLogoPath,
  type HeroSlugIndex,
  type HeroSlugResolveInput,
  type HeroSlugResolveResult,
  type RosterPlayer,
  type TournamentHeroAggregate,
} from "@bpc/shared-types";
import type { OpenDotaClient } from "../opendota-client.js";

export type HeroMeta = {
  id: number;
  name: string;
  localized_name: string;
};

let heroCache: HeroMeta[] | null = null;
let heroById = new Map<number, HeroMeta>();
let slugIndex: HeroSlugIndex | null = null;

function rebuildSlugIndex(): void {
  if (!heroCache?.length) {
    slugIndex = null;
    return;
  }
  slugIndex = buildHeroSlugIndex(heroCache);
}

export async function ensureHeroRegistry(
  client: OpenDotaClient,
): Promise<Map<number, HeroMeta>> {
  if (heroById.size > 0) return heroById;
  const res = await client.heroesConstants();
  if (res.ok && Array.isArray(res.data)) {
    heroCache = res.data as HeroMeta[];
    heroById = new Map(heroCache.map((h) => [h.id, h]));
    rebuildSlugIndex();
  }
  return heroById;
}

export function getHeroSlugIndex(): HeroSlugIndex | null {
  return slugIndex;
}

export function resolveHeroSlugForDraft(
  input: HeroSlugResolveInput,
): HeroSlugResolveResult {
  if (slugIndex) return resolveHeroSlug(input, slugIndex);

  if (input.heroId != null && input.heroId > 0) {
    const meta = heroById.get(input.heroId);
    if (meta) {
      const slug = meta.name.replace(/^npc_dota_hero_/, "");
      return { slug, source: "id" };
    }
  }

  if (input.heroClass) {
    const norm = input.heroClass.replace(/^npc_dota_hero_/, "").trim();
    if (norm) return { slug: norm, source: "fallback" };
  }

  return { source: "none" };
}

export function canonicalHeroSlugForDraft(
  input: HeroSlugResolveInput,
): string | undefined {
  return resolveHeroSlugForDraft(input).slug;
}

export function getHeroMeta(heroId: number): HeroMeta | undefined {
  return heroById.get(heroId);
}

export function heroPortraitUrl(heroId: number): string | undefined {
  const meta = heroById.get(heroId);
  if (!meta) return undefined;
  return heroPortraitUrlFromInternalName(meta.name);
}

export function heroDisplayName(heroId: number): string {
  const meta = heroById.get(heroId);
  return meta?.localized_name ?? `Hero ${heroId}`;
}

export function teamLogoUrlForKey(teamKey?: string): string | undefined {
  if (!teamKey) return undefined;
  return teamLogoPath(teamKey);
}

export function findRosterPlayer(
  roster: RosterPlayer[],
  steam32: number,
): RosterPlayer | undefined {
  return roster.find((p) => p.steam32 === steam32);
}

export function tournamentAggregateForHero(
  index: Record<string, TournamentHeroAggregate> | undefined,
  heroId: number,
): TournamentHeroAggregate | undefined {
  return index?.[String(heroId)];
}

export function listHeroesSorted(): HeroMeta[] {
  if (!heroCache) return [];
  return [...heroCache].sort((a, b) =>
    a.localized_name.localeCompare(b.localized_name),
  );
}

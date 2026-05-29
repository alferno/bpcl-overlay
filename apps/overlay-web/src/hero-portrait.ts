import type { DraftSlot } from "@bpc/shared-types";
import {
  buildHeroSlugIndex,
  heroAnimatedRenderUrlFromSlug,
  heroesListFromConstants,
  resolveHeroSlug,
  type HeroSlugIndex,
} from "@bpc/shared-types";

import { resolveOverlayHeroAnimatedUrl } from "./hero-render-manifest";
import { resolveOverlayHeroPortraitUrl } from "./hero-portrait-manifest";

export type HeroMedia = {
  slug?: string;
  /** Flat icon PNG — instant poster while WebM loads (~60 KB) */
  static?: string;
  staticFallback?: string;
  animated?: string;
};

let heroSlugIndex: HeroSlugIndex | null = null;
let flatCacheWarmStarted = false;

/** Load OpenDota hero constants for id → slug mapping and display aliases. */
export async function ensureOverlayHeroIndex(): Promise<void> {
  if (heroSlugIndex) return;
  try {
    const res = await fetch("https://api.opendota.com/api/constants/heroes");
    if (!res.ok) return;
    const heroes = heroesListFromConstants(await res.json());
    heroSlugIndex = buildHeroSlugIndex(heroes);
  } catch {
    /* offline / CORS */
  }
}

export function getHeroSlugIndex(): HeroSlugIndex | null {
  return heroSlugIndex;
}

export function getHeroIdToSlugMap(): ReadonlyMap<number, string> {
  return heroSlugIndex?.byId ?? new Map();
}

/** Prefetch flat hero PNGs into browser cache (~60 KB each). */
export async function warmHeroFlatPortraitCache(): Promise<void> {
  if (flatCacheWarmStarted) return;
  flatCacheWarmStarted = true;
  await ensureOverlayHeroIndex();
  const slugs = [...new Set(heroSlugIndex?.byId.values() ?? [])];
  const batch = (start: number) => {
    const slice = slugs.slice(start, start + 12);
    for (const slug of slice) {
      const img = new Image();
      img.src = resolveOverlayHeroPortraitUrl(slug);
    }
    if (start + 12 < slugs.length) {
      window.setTimeout(() => batch(start + 12), 80);
    }
  };
  batch(0);
}

function slugFromPortraitUrl(url: string): string | undefined {
  const m = url.match(/\/heroes\/(?:renders\/)?([^/?#.]+)/i);
  if (!m?.[1]) return undefined;
  return m[1].replace(/^npc_dota_hero_/, "");
}

function classFromSlotUrls(slot: DraftSlot): string | undefined {
  return (
    slugFromPortraitUrl(slot.heroPortraitUrl ?? "") ??
    slugFromPortraitUrl(slot.heroPortraitAnimatedUrl ?? "")
  );
}

export function resolveSlotSlug(slot: DraftSlot): string | undefined {
  if (heroSlugIndex) {
    const { slug } = resolveHeroSlug(
      {
        heroId: slot.heroId,
        heroClass: classFromSlotUrls(slot),
        heroName: slot.heroName,
        urlSlug: classFromSlotUrls(slot),
      },
      heroSlugIndex,
    );
    if (slug) return slug;
  }

  if (slot.heroId !== null && slot.heroId !== undefined) {
    const fromId = heroSlugIndex?.byId.get(slot.heroId);
    if (fromId) return fromId;
  }

  const fromUrl = classFromSlotUrls(slot);
  if (fromUrl) return fromUrl;

  return undefined;
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".webm") || lower.endsWith(".mp4");
}

/** Pick cards: local or CDN WebM + flat PNG poster/fallback. */
export function resolveSlotMedia(slot: DraftSlot): HeroMedia {
  const slug = resolveSlotSlug(slot);

  const animated =
    slug
      ? resolveOverlayHeroAnimatedUrl(slug)
      : slot.heroPortraitAnimatedUrl && isVideoUrl(slot.heroPortraitAnimatedUrl)
        ? slot.heroPortraitAnimatedUrl
        : undefined;

  if (!slug && !animated) return {};

  const flat = slug ? resolveOverlayHeroPortraitUrl(slug) : undefined;
  return {
    slug,
    animated: animated ?? (slug ? heroAnimatedRenderUrlFromSlug(slug) : undefined),
    static: flat,
    staticFallback: flat,
  };
}

/** Flat Steam CDN hero icon PNG — bans, stats panels, thumbnails. */
export function resolveSlotFlatPortraitUrl(slot: DraftSlot): string | undefined {
  const slug = resolveSlotSlug(slot);
  if (slug) {
    const flat = resolveOverlayHeroPortraitUrl(slug);
    if (flat) return flat;
  }

  if (slot.heroPortraitUrl && !isVideoUrl(slot.heroPortraitUrl)) {
    const url = slot.heroPortraitUrl;
    const renderMatch = url.match(/\/heroes\/(?:renders\/)?([^/?#]+)/i);
    if (renderMatch?.[1]) {
      return resolveOverlayHeroPortraitUrl(renderMatch[1]);
    }
    if (url.includes("/dota_react/heroes/")) return url;
  }

  return undefined;
}

export function resolveSlotAnimatedUrl(slot: DraftSlot): string | undefined {
  return resolveSlotMedia(slot).animated;
}

export function draftHeroAnimationEnabled(): boolean {
  const v = import.meta.env.VITE_DRAFT_HERO_ANIMATED;
  if (v === "false" || v === "0") return false;
  return true;
}

export function isPickSlotFilled(slot: DraftSlot | null | undefined): boolean {
  if (!slot) return false;
  return Boolean(slot.heroId || slot.heroPortraitUrl || slot.heroName);
}

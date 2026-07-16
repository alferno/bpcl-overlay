import type { DraftSlot, LastPick, TournamentHeroAggregate } from "@bpc/shared-types";
import {
  buildHeroSlugIndex,
  displayNameToKey,
  extractSlugFromHeroMediaUrl,
  heroesListFromConstants,
  normalizeHeroSlug,
  resolveHeroSlug,
  type HeroSlugIndex,
} from "@bpc/shared-types";

import {
  loadHeroRenderManifest,
  resolveOverlayHeroRenderPosterUrl,
} from "./hero-render-manifest";
import {
  getLocalHeroPortraitSlugs,
  loadHeroPortraitManifest,
  resolveOverlayHeroPortraitUrl,
} from "./hero-portrait-manifest";

export type HeroMedia = {
  slug?: string;
  static?: string;
  staticFallback?: string;
};

let heroSlugIndex: HeroSlugIndex | null = null;
let flatCacheWarmStarted = false;
let indexLoadPromise: Promise<void> | null = null;

type BundledHeroIndexFile = {
  byId?: Record<string, string>;
  byDisplay?: Record<string, string>;
};

function applyBundledHeroIndex(data: BundledHeroIndexFile): void {
  const byId = new Map<number, string>();
  for (const [id, slug] of Object.entries(data.byId ?? {})) {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0 && slug) {
      byId.set(n, normalizeHeroSlug(slug));
    }
  }
  const byDisplayKey = new Map<string, string>();
  for (const [key, slug] of Object.entries(data.byDisplay ?? {})) {
    if (key && slug) byDisplayKey.set(key, normalizeHeroSlug(slug));
  }
  const byInternalSlug = new Set<string>([
    ...byId.values(),
    ...byDisplayKey.values(),
  ]);
  heroSlugIndex = { byId, byInternalSlug, byDisplayKey };
}

async function loadBundledHeroIndex(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}heroes/hero-index.json`);
    if (!res.ok) return;
    applyBundledHeroIndex((await res.json()) as BundledHeroIndexFile);
  } catch {
    /* offline */
  }
}

async function loadOpenDotaHeroIndex(): Promise<void> {
  if (heroSlugIndex) return;
  try {
    const res = await fetch("https://api.opendota.com/api/constants/heroes");
    if (!res.ok) return;
    const heroes = heroesListFromConstants(await res.json());
    heroSlugIndex = buildHeroSlugIndex(heroes);
  } catch {
    /* CORS / offline */
  }
}

/** Bundled hero-index.json + portrait manifest — no CDN, no OpenDota required for stats overlay. */
export async function ensureOverlayHeroIndex(): Promise<void> {
  if (indexLoadPromise) return indexLoadPromise;
  indexLoadPromise = (async () => {
    await Promise.all([loadHeroPortraitManifest(), loadHeroRenderManifest()]);
    if (!heroSlugIndex) await loadBundledHeroIndex();
    await loadOpenDotaHeroIndex();
  })();
  return indexLoadPromise;
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
      const url = resolveOverlayHeroPortraitUrl(slug);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
    if (start + 12 < slugs.length) {
      window.setTimeout(() => batch(start + 12), 80);
    }
  };
  batch(0);
}

function slugFromPortraitUrl(url: string): string | undefined {
  return extractSlugFromHeroMediaUrl(url);
}

function classFromSlotUrls(slot: DraftSlot): string | undefined {
  return (
    slugFromPortraitUrl(slot.heroPortraitUrl ?? "") ??
    slugFromPortraitUrl(slot.heroPortraitAnimatedUrl ?? "")
  );
}

export type HeroPortraitResolveHints = {
  heroPortraitSlug?: string | null;
  heroPortraitUrl?: string | null;
  heroPortraitAnimatedUrl?: string | null;
  heroClass?: string | null;
};

export function heroPortraitHintsFromFields(fields: {
  heroPortraitSlug?: string | null;
  heroPortraitUrl?: string | null;
  heroPortraitAnimatedUrl?: string | null;
}): HeroPortraitResolveHints {
  return {
    heroPortraitSlug: fields.heroPortraitSlug,
    heroPortraitUrl: fields.heroPortraitUrl,
    heroPortraitAnimatedUrl: fields.heroPortraitAnimatedUrl,
  };
}

/** Canonical portrait slug — local assets only. */
export function resolveHeroPortraitSlug(
  heroId: number | null | undefined,
  heroName?: string | null,
  hints?: HeroPortraitResolveHints,
): string | undefined {
  if (hints?.heroPortraitSlug) {
    const fromSlug = normalizeHeroSlug(hints.heroPortraitSlug);
    if (fromSlug) return fromSlug;
  }

  const index = heroSlugIndex;
  if (index && heroId != null && heroId > 0) {
    const { slug } = resolveHeroSlug(
      {
        heroId,
        heroClass: hints?.heroClass ?? heroName ?? undefined,
        heroName: heroName ?? undefined,
      },
      index,
    );
    if (slug) return slug;
  }

  if (heroId != null && heroId > 0) {
    const fromId = heroSlugIndex?.byId.get(heroId);
    if (fromId) return fromId;
  }

  if (heroName && index) {
    const key = displayNameToKey(heroName);
    const fromDisplay = index.byDisplayKey.get(key);
    if (fromDisplay) return fromDisplay;
  }

  if (heroName) {
    const norm = normalizeHeroSlug(heroName);
    if (norm) {
      const manifest = getLocalHeroPortraitSlugs();
      if (manifest.size === 0 || manifest.has(norm)) return norm;
    }
  }

  for (const raw of [
    hints?.heroPortraitUrl,
    hints?.heroPortraitAnimatedUrl,
  ]) {
    if (raw) {
      const fromUrl = extractSlugFromHeroMediaUrl(raw);
      if (fromUrl) return fromUrl;
    }
  }

  return undefined;
}

export function resolveSlotSlug(slot: DraftSlot): string | undefined {
  return resolveHeroPortraitSlug(slot.heroId, slot.heroName, {
    heroPortraitSlug: slot.heroPortraitSlug,
    heroPortraitUrl: slot.heroPortraitUrl,
    heroPortraitAnimatedUrl: slot.heroPortraitAnimatedUrl,
    heroClass: classFromSlotUrls(slot) ?? undefined,
  });
}

/** Resolve flat PNG path under /heroes/portraits (never a CDN URL). */
export function resolveOverlayPortraitForHero(
  heroId: number | null | undefined,
  heroName?: string | null,
  hints?: HeroPortraitResolveHints,
): string | undefined {
  const slug = resolveHeroPortraitSlug(heroId, heroName, hints);
  if (!slug) return undefined;
  return resolveOverlayHeroPortraitUrl(slug);
}

/** Stats panel beside Steam avatar — use draft slot media when LastPick has no URLs. */
export function resolvePickStatsPortrait(
  pick: LastPick,
  slot: DraftSlot | undefined,
  tournamentStats?: TournamentHeroAggregate,
): string | undefined {
  const heroName = pick.heroName ?? tournamentStats?.heroName;
  return resolveOverlayPortraitForHero(pick.heroId, heroName, {
    heroPortraitSlug:
      pick.heroPortraitSlug ?? slot?.heroPortraitSlug,
    heroPortraitUrl: slot?.heroPortraitUrl,
    heroPortraitAnimatedUrl: slot?.heroPortraitAnimatedUrl,
  });
}

/** Pick cards: static render poster */
export function resolveSlotMedia(slot: DraftSlot): HeroMedia {
  const slug = resolveSlotSlug(slot);

  if (!slug) return {};

  const flat = slug ? resolveOverlayHeroRenderPosterUrl(slug) : undefined;
  return {
    slug,
    static: flat,
    staticFallback: flat,
  };
}

/** Flat hero icon PNG from public/heroes/portraits (never Steam CDN). */
export function resolveSlotFlatPortraitUrl(slot: DraftSlot): string | undefined {
  const slug = resolveSlotSlug(slot);
  if (!slug) return undefined;
  return resolveOverlayHeroPortraitUrl(slug);
}



export function isPickSlotFilled(slot: DraftSlot | null | undefined): boolean {
  if (!slot) return false;
  return Boolean(slot.heroId || slot.heroPortraitUrl || slot.heroName);
}

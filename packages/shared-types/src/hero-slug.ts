import { normalizeHeroSlug } from "./hero-assets.js";

/** OpenDota `/api/constants/heroes` entry shape. */
export type OpenDotaHeroConstant = {
  id: number;
  name: string;
  localized_name: string;
};

export type HeroSlugIndex = {
  byId: Map<number, string>;
  byInternalSlug: Set<string>;
  /** Normalized display name → internal slug (e.g. magnus → magnataur). */
  byDisplayKey: Map<string, string>;
};

export type HeroSlugResolveSource =
  | "id"
  | "class"
  | "url"
  | "display"
  | "fallback"
  | "none";

export type HeroSlugResolveResult = {
  slug?: string;
  source: HeroSlugResolveSource;
};

/** `"Magnus"` → `magnus`, `"Nature's Prophet"` → `natures_prophet`. */
export function displayNameToKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/'/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

export function heroesListFromConstants(
  raw: unknown,
): OpenDotaHeroConstant[] {
  if (Array.isArray(raw)) return raw as OpenDotaHeroConstant[];
  if (raw && typeof raw === "object") {
    return Object.values(raw) as OpenDotaHeroConstant[];
  }
  return [];
}

export function buildHeroSlugIndex(
  heroes: OpenDotaHeroConstant[],
): HeroSlugIndex {
  const byId = new Map<number, string>();
  const byInternalSlug = new Set<string>();
  const byDisplayKey = new Map<string, string>();

  for (const h of heroes) {
    const slug = normalizeHeroSlug(h.name);
    if (!slug) continue;
    byId.set(h.id, slug);
    byInternalSlug.add(slug);
    byDisplayKey.set(displayNameToKey(h.localized_name), slug);
    const classStyle = slug
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    byDisplayKey.set(displayNameToKey(classStyle), slug);
  }

  return { byId, byInternalSlug, byDisplayKey };
}

export type HeroSlugResolveInput = {
  heroId?: number | null;
  heroClass?: string;
  heroName?: string;
  urlSlug?: string;
};

/**
 * Resolve canonical internal slug for CDN / local WebM paths.
 * Prefer heroId when present; map display names (Magnus) to internal slugs (magnataur).
 */
export function resolveHeroSlug(
  input: HeroSlugResolveInput,
  index: HeroSlugIndex,
): HeroSlugResolveResult {
  const { heroId, heroClass, heroName, urlSlug } = input;

  if (urlSlug) {
    const norm = normalizeHeroSlug(urlSlug);
    if (norm && index.byInternalSlug.has(norm)) {
      return { slug: norm, source: "url" };
    }
  }

  if (heroId != null && heroId > 0) {
    const fromId = index.byId.get(heroId);
    if (fromId) return { slug: fromId, source: "id" };
  }

  if (heroClass) {
    const norm = normalizeHeroSlug(heroClass);
    if (norm && index.byInternalSlug.has(norm)) {
      return { slug: norm, source: "class" };
    }
  }

  for (const display of [heroName, heroClass]) {
    if (!display) continue;
    const key = displayNameToKey(display);
    const fromDisplay = index.byDisplayKey.get(key);
    if (fromDisplay) return { slug: fromDisplay, source: "display" };
  }

  if (heroClass) {
    const norm = normalizeHeroSlug(heroClass);
    if (norm) return { slug: norm, source: "fallback" };
  }

  return { source: "none" };
}

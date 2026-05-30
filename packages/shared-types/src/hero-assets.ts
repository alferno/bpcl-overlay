/** Steam CDN hero portrait from internal hero name or slug */
export function heroSlugFromInternalName(internalName: string): string {
  return internalName.replace(/^npc_dota_hero_/, "");
}

/** GSI pickN_class / legacy names → bundled asset filename slug. */
export const GSI_HERO_SLUG_ALIASES: Readonly<Record<string, string>> = {
  windrunner: "windranger",
  skeleton_king: "wraith_king",
  shredder: "timbersaw",
  obsidian_destroyer: "outworld_destroyer",
  zuus: "zeus",
  rattletrap: "clockwerk",
  furion: "natures_prophet",
  life_stealer: "lifestealer",
  doom_bringer: "doom",
  abyssal_underlord: "underlord",
};

export function applyHeroSlugAlias(slug: string): string {
  const norm = slug.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  if (!norm) return norm;
  return GSI_HERO_SLUG_ALIASES[norm] ?? norm;
}

export function normalizeHeroSlug(slug: string): string {
  return applyHeroSlugAlias(slug.replace(/^npc_dota_hero_/, "").trim());
}

export function heroPortraitUrlFromInternalName(internalName: string): string {
  const slug = heroSlugFromInternalName(internalName);
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

export function heroPortraitUrlFromSlug(slug: string): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${clean}.png`;
}

/** Poster frame matching Steam render WebM (dota2.com hero pages). */
export function heroRenderPosterUrlFromSlug(slug: string): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${clean}.png`;
}

/** GSI draft slots often expose `ban0_class` / `pick0_class` slugs (e.g. `invoker`). */
export function heroPortraitUrlFromHeroClass(heroClass: string): string {
  return heroPortraitUrlFromSlug(heroClass);
}

/** Animated hero render (WebM) on Steam CDN — draft pick cards. */
export function heroAnimatedRenderUrlFromSlug(slug: string): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${clean}.webm`;
}

export function heroAnimatedRenderUrlFromInternalName(internalName: string): string {
  return heroAnimatedRenderUrlFromSlug(heroSlugFromInternalName(internalName));
}

export type HeroPortraitFields = {
  /** Canonical filename slug under public/heroes/portraits */
  heroPortraitSlug?: string;
  heroPortraitUrl?: string;
};

/** Build paired slug + local portrait path from one canonical slug. */
export function heroPortraitFieldsFromSlug(
  slug: string | undefined | null,
): HeroPortraitFields {
  if (!slug) return {};
  const clean = normalizeHeroSlug(slug);
  if (!clean) return {};
  return {
    heroPortraitSlug: clean,
    heroPortraitUrl: heroLocalPortraitUrlFromSlug(clean),
  };
}

/**
 * Maps canonical slug (e.g. `lifestealer`) → on-disk basename (e.g. `life_stealer`).
 * Built from portrait manifest filenames.
 */
/** Maps canonical hero slug → on-disk basename (portraits, renders, etc.). */
export function buildCanonicalHeroFileMap(
  fileSlugs: Iterable<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of fileSlugs) {
    const fileKey = raw
      .trim()
      .toLowerCase()
      .replace(/^npc_dota_hero_/, "")
      .replace(/\.(png|webm)$/i, "");
    if (!fileKey) continue;
    const canonical = normalizeHeroSlug(fileKey);
    if (!canonical) continue;

    const prev = map.get(canonical);
    if (!prev) {
      map.set(canonical, fileKey);
      continue;
    }
    if (fileKey === canonical) {
      map.set(canonical, fileKey);
    }
  }
  return map;
}

/** @deprecated Use buildCanonicalHeroFileMap */
export const buildCanonicalPortraitFileMap = buildCanonicalHeroFileMap;

/** Local path for flat hero portrait PNG (overlay-web/public). */
export function heroLocalPortraitUrlFromSlug(
  slug: string,
  fileSlug?: string,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  const onDisk = fileSlug ?? clean;
  return `/heroes/portraits/${onDisk}.png`;
}

/**
 * Extract canonical asset slug from a local `/heroes/...` path or legacy Steam CDN URL.
 * Never returns a remote URL — only the slug used under public/heroes/portraits.
 */
export function extractSlugFromHeroMediaUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  const local = trimmed.match(
    /\/heroes\/(?:portraits|renders)\/([^/?#.]+)\.(?:png|webm|mp4)/i,
  );
  if (local?.[1]) {
    const norm = normalizeHeroSlug(local[1]);
    return norm || undefined;
  }

  const reactFlat = trimmed.match(/dota_react\/heroes\/([^/?#.]+)\.png/i);
  if (reactFlat?.[1]) {
    const norm = normalizeHeroSlug(reactFlat[1]);
    return norm || undefined;
  }

  const reactRender = trimmed.match(
    /dota_react\/heroes\/renders\/([^/?#.]+)\.(?:png|webm)/i,
  );
  if (reactRender?.[1]) {
    const norm = normalizeHeroSlug(reactRender[1]);
    return norm || undefined;
  }

  return undefined;
}

/** Overlay / broadcast: always use bundled public/heroes/portraits (no CDN). */
export function resolveHeroPortraitUrl(
  slug: string,
  localSlugs?: ReadonlySet<string>,
  fileByCanonical?: ReadonlyMap<string, string>,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  if (localSlugs && localSlugs.size > 0 && !localSlugs.has(clean)) return "";
  const onDisk = fileByCanonical?.get(clean) ?? clean;
  return heroLocalPortraitUrlFromSlug(clean, onDisk);
}

/** Local path for copied Dota panorama WebM (overlay-web/public). */
export function heroLocalAnimatedUrlFromSlug(
  slug: string,
  fileSlug?: string,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  const onDisk = fileSlug ?? clean;
  return `/heroes/renders/${onDisk}.webm`;
}

/** Overlay / broadcast: always use bundled public/heroes/renders (no CDN). */
export function resolveHeroAnimatedUrl(
  slug: string,
  localSlugs?: ReadonlySet<string>,
  fileByCanonical?: ReadonlyMap<string, string>,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  if (localSlugs && localSlugs.size > 0 && !localSlugs.has(clean)) return "";
  const onDisk = fileByCanonical?.get(clean) ?? clean;
  return heroLocalAnimatedUrlFromSlug(clean, onDisk);
}

export type HeroPortraitMedia = {
  /** Flat dota_react icon PNG — bans, stats, API `heroPortraitUrl` */
  staticUrl?: string;
  staticFallbackUrl?: string;
  /** Steam CDN render WebM — draft picks */
  animatedUrl?: string;
};

/** Local PNG + WebM paths for GSI draft slots and API state. */
export function heroPortraitMediaFromSlug(
  slug: string,
  _opts?: { localSlugs?: ReadonlySet<string> },
): HeroPortraitMedia {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return {};

  const flat = heroLocalPortraitUrlFromSlug(clean);
  const animated = heroLocalAnimatedUrlFromSlug(clean);
  return {
    staticUrl: flat,
    staticFallbackUrl: flat,
    animatedUrl: animated,
  };
}

/** Relative path for Vite/public or overlay origin */
export function teamLogoPath(teamKey: string): string {
  return `/teams/${teamKey}.png`;
}

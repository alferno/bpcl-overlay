/** Steam CDN hero portrait from internal hero name or slug */
export function heroSlugFromInternalName(internalName: string): string {
  return internalName.replace(/^npc_dota_hero_/, "");
}

export function normalizeHeroSlug(slug: string): string {
  return slug.replace(/^npc_dota_hero_/, "").trim();
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

/** Local path for flat hero portrait PNG (overlay-web/public). */
export function heroLocalPortraitUrlFromSlug(slug: string): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  return `/heroes/portraits/${clean}.png`;
}

/** Prefer local flat PNG when manifest lists slug; else Steam CDN. */
export function resolveHeroPortraitUrl(
  slug: string,
  localSlugs?: ReadonlySet<string>,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  if (localSlugs?.has(clean)) {
    return heroLocalPortraitUrlFromSlug(clean);
  }
  return heroPortraitUrlFromSlug(clean);
}

/** Local path for copied Dota panorama WebM (overlay-web/public). */
export function heroLocalAnimatedUrlFromSlug(slug: string): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  return `/heroes/renders/${clean}.webm`;
}

/** Prefer local WebM when manifest lists slug; else Steam CDN. */
export function resolveHeroAnimatedUrl(
  slug: string,
  localSlugs?: ReadonlySet<string>,
): string {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return "";
  if (localSlugs?.has(clean)) {
    return heroLocalAnimatedUrlFromSlug(clean);
  }
  return heroAnimatedRenderUrlFromSlug(clean);
}

export type HeroPortraitMedia = {
  /** Flat dota_react icon PNG — bans, stats, API `heroPortraitUrl` */
  staticUrl?: string;
  staticFallbackUrl?: string;
  /** Steam CDN render WebM — draft picks */
  animatedUrl?: string;
};

/** Steam CDN or caller-supplied URL; overlay resolves local via manifest. */
export function heroPortraitMediaFromSlug(
  slug: string,
  opts?: { localSlugs?: ReadonlySet<string> },
): HeroPortraitMedia {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return {};

  const flat = heroPortraitUrlFromSlug(clean);
  return {
    staticUrl: flat,
    staticFallbackUrl: flat,
    animatedUrl: resolveHeroAnimatedUrl(clean, opts?.localSlugs),
  };
}

/** Relative path for Vite/public or overlay origin */
export function teamLogoPath(teamKey: string): string {
  return `/teams/${teamKey}.png`;
}

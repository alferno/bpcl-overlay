import { resolveHeroAnimatedUrl } from "@bpc/shared-types";

let localSlugs = new Set<string>();
let manifestLoaded = false;

export async function loadHeroRenderManifest(): Promise<ReadonlySet<string>> {
  if (manifestLoaded) return localSlugs;
  manifestLoaded = true;
  try {
    const res = await fetch("/heroes/renders/manifest.json");
    if (!res.ok) return localSlugs;
    const data = (await res.json()) as { slugs?: string[] };
    localSlugs = new Set(data.slugs ?? []);
  } catch {
    /* offline */
  }
  return localSlugs;
}

export function getLocalHeroRenderSlugs(): ReadonlySet<string> {
  return localSlugs;
}

export function resolveOverlayHeroAnimatedUrl(slug: string): string {
  return resolveHeroAnimatedUrl(slug, localSlugs);
}

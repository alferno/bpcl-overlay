import { resolveHeroPortraitUrl } from "@bpc/shared-types";

let localPortraitSlugs = new Set<string>();
let portraitManifestLoaded = false;

export async function loadHeroPortraitManifest(): Promise<ReadonlySet<string>> {
  if (portraitManifestLoaded) return localPortraitSlugs;
  portraitManifestLoaded = true;
  try {
    const res = await fetch("/heroes/portraits/manifest.json");
    if (!res.ok) return localPortraitSlugs;
    const data = (await res.json()) as { slugs?: string[] };
    localPortraitSlugs = new Set(data.slugs ?? []);
  } catch {
    /* offline */
  }
  return localPortraitSlugs;
}

export function getLocalHeroPortraitSlugs(): ReadonlySet<string> {
  return localPortraitSlugs;
}

export function resolveOverlayHeroPortraitUrl(slug: string): string {
  return resolveHeroPortraitUrl(slug, localPortraitSlugs);
}

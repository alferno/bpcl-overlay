import {
  buildCanonicalHeroFileMap,
  normalizeHeroSlug,
  resolveHeroPortraitUrl,
} from "@bpc/shared-types";

let localPortraitSlugs = new Set<string>();
let canonicalToFileSlug = new Map<string, string>();
let portraitManifestLoaded = false;
let manifestPromise: Promise<ReadonlySet<string>> | null = null;

function ingestManifestSlugs(rawSlugs: string[]): void {
  const fileMap = buildCanonicalHeroFileMap(rawSlugs);
  canonicalToFileSlug = fileMap;
  localPortraitSlugs = new Set(fileMap.keys());
}

export async function loadHeroPortraitManifest(): Promise<ReadonlySet<string>> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    if (portraitManifestLoaded) return localPortraitSlugs;
    portraitManifestLoaded = true;
    try {
      const res = await fetch("/heroes/portraits/manifest.json");
      if (!res.ok) return localPortraitSlugs;
      const data = (await res.json()) as {
        slugs?: string[];
        posters?: string[];
      };
      const raw = [...(data.slugs ?? []), ...(data.posters ?? [])];
      ingestManifestSlugs(raw);
    } catch {
      /* offline */
    }
    return localPortraitSlugs;
  })();
  return manifestPromise;
}

export function getLocalHeroPortraitSlugs(): ReadonlySet<string> {
  return localPortraitSlugs;
}

/** Local PNG only; maps canonical slug → actual filename (life_stealer.png, etc.). */
export function resolveOverlayHeroPortraitUrl(slug: string): string | undefined {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return undefined;
  const manifest = localPortraitSlugs;
  if (manifest.size > 0 && !manifest.has(clean)) return undefined;
  return resolveHeroPortraitUrl(clean, manifest, canonicalToFileSlug);
}

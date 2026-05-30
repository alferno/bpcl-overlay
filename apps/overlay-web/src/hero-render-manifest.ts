import {
  buildCanonicalHeroFileMap,
  normalizeHeroSlug,
  resolveHeroAnimatedUrl,
} from "@bpc/shared-types";

let localRenderSlugs = new Set<string>();
let canonicalToFileSlug = new Map<string, string>();
let renderManifestLoaded = false;
let manifestPromise: Promise<ReadonlySet<string>> | null = null;

function ingestRenderManifestSlugs(rawSlugs: string[]): void {
  const fileMap = buildCanonicalHeroFileMap(rawSlugs);
  canonicalToFileSlug = fileMap;
  localRenderSlugs = new Set(fileMap.keys());
}

export async function loadHeroRenderManifest(): Promise<ReadonlySet<string>> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    if (renderManifestLoaded) return localRenderSlugs;
    renderManifestLoaded = true;
    try {
      const res = await fetch("/heroes/renders/manifest.json");
      if (!res.ok) return localRenderSlugs;
      const data = (await res.json()) as { slugs?: string[] };
      ingestRenderManifestSlugs(data.slugs ?? []);
    } catch {
      /* offline */
    }
    return localRenderSlugs;
  })();
  return manifestPromise;
}

export function getLocalHeroRenderSlugs(): ReadonlySet<string> {
  return localRenderSlugs;
}

/** Local WebM only; maps canonical slug → actual filename (life_stealer.webm, etc.). */
export function resolveOverlayHeroAnimatedUrl(slug: string): string | undefined {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return undefined;
  const manifest = localRenderSlugs;
  if (manifest.size > 0 && !manifest.has(clean)) return undefined;
  return resolveHeroAnimatedUrl(clean, manifest, canonicalToFileSlug) || undefined;
}

import { normalizeHeroSlug } from "@bpc/shared-types";

import { resolveOverlayHeroAnimatedUrl } from "./hero-render-manifest";

type PoolEntry = {
  url: string;
  ready: Promise<void>;
};

const pool = new Map<string, PoolEntry>();
const warmVideos = new Set<HTMLVideoElement>();

function attachWarmVideo(url: string): Promise<void> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
    video.src = url;

    const finish = () => {
      resolve();
    };

    video.addEventListener("canplaythrough", finish, { once: true });
    video.addEventListener("error", finish, { once: true });
    document.body.appendChild(video);
    warmVideos.add(video);
    video.load();
  });
}

/** Pre-buffer hero WebM until canplaythrough (same-origin or CDN). */
export function warmHeroWebm(slug: string): Promise<void> {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return Promise.resolve();

  const existing = pool.get(clean);
  if (existing) return existing.ready;

  const url = resolveOverlayHeroAnimatedUrl(clean);
  if (!url) return Promise.resolve();

  const ready = attachWarmVideo(url);
  pool.set(clean, { url, ready });
  return ready;
}

export function getWarmedHeroWebmUrl(slug: string): string | undefined {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return undefined;
  return pool.get(clean)?.url;
}

export function whenHeroWebmReady(slug: string): Promise<string | undefined> {
  const clean = normalizeHeroSlug(slug);
  if (!clean) return Promise.resolve(undefined);
  return warmHeroWebm(clean).then(() => pool.get(clean)?.url);
}

/** Detach hidden warm-up videos (e.g. on unmount). */
export function clearHeroVideoPool(): void {
  for (const el of warmVideos) {
    el.pause();
    el.removeAttribute("src");
    el.load();
    el.remove();
  }
  warmVideos.clear();
  pool.clear();
}

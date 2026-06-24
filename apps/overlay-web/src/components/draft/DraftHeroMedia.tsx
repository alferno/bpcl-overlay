import { useEffect, useRef, useState, type CSSProperties } from "react";

import { whenHeroWebmReady } from "../../hero-video-pool";

const SLOT_MEDIA_CLASS =
  "h-full w-full max-w-none object-cover object-[center_22%]";

const INTRO_MEDIA_CLASS =
  "h-full w-full max-w-none object-cover object-[center_18%]";

export type DraftHeroMediaVariant = "slot" | "intro";

/**
 * Hero media inside pick card bounds. WebM for draft slots; PNG-only for intro.
 */
export function DraftHeroMedia({
  staticUrl,
  staticFallback,
  animatedUrl,
  heroSlug,
  alt,
  animate = true,
  variant = "slot",
  staticOnly = false,
  /** After cinematic — skip PNG poster; show WebM when ready */
  webmFirst = false,
  glowColor,
  className,
}: {
  staticUrl?: string;
  staticFallback?: string;
  animatedUrl?: string;
  heroSlug?: string;
  alt?: string;
  animate?: boolean;
  variant?: DraftHeroMediaVariant;
  /** Cinematic intro: flat PNG only, no WebM */
  staticOnly?: boolean;
  webmFirst?: boolean;
  glowColor?: string;
  className?: string;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [posterFallback, setPosterFallback] = useState(false);
  const [bufferedUrl, setBufferedUrl] = useState<string | undefined>();
  const [reloadNonce, setReloadNonce] = useState(0);
  const retriesRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setVideoFailed(false);
    setVideoReady(false);
    setBufferedUrl(undefined);
    retriesRef.current = 0;
    setReloadNonce(0);
    setPosterFallback(false);
  }, [animatedUrl, heroSlug, staticOnly, webmFirst]);

  useEffect(() => {
    if (!webmFirst || !animate || staticOnly || videoReady || videoFailed) {
      return;
    }
    const t = window.setTimeout(() => setPosterFallback(true), 2200);
    return () => window.clearTimeout(t);
  }, [webmFirst, animate, staticOnly, videoReady, videoFailed, heroSlug]);

  useEffect(() => {
    if (staticOnly || !animate || !heroSlug) return;
    let cancelled = false;
    void whenHeroWebmReady(heroSlug).then((url) => {
      if (!cancelled && url) setBufferedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [heroSlug, animate, staticOnly]);

  const poster = staticUrl ?? staticFallback;
  const playUrl = bufferedUrl ?? animatedUrl;
  const showVideo = !staticOnly && animate && playUrl && !videoFailed;
  const hidePoster =
    webmFirst && showVideo && !videoFailed && !posterFallback;
  const videoSrc = playUrl
    ? reloadNonce > 0
      ? `${playUrl}${playUrl.includes("?") ? "&" : "?"}r=${reloadNonce}`
      : playUrl
    : undefined;

  const handleVideoError = () => {
    if (retriesRef.current < 2) {
      retriesRef.current += 1;
      setReloadNonce((n) => n + 1);
      setVideoFailed(false);
      setVideoReady(false);
      return;
    }
    setVideoFailed(true);
  };

  const handleStalled = () => {
    const el = videoRef.current;
    if (!el || videoFailed) return;
    try {
      el.load();
      void el.play().catch(() => undefined);
    } catch {
      /* ignore */
    }
  };

  const mediaClass =
    className ??
    (variant === "intro" ? INTRO_MEDIA_CLASS : SLOT_MEDIA_CLASS);

  const still = staticFallback ?? staticUrl;

  const media =
    showVideo && videoSrc ? (
      <>
        {still && !hidePoster ? (
          <img
            src={still}
            alt=""
            aria-hidden
            loading="lazy"
            className={`draft-hero-portrait ${mediaClass} absolute inset-0 transition-opacity duration-300 ${
              videoReady ? "opacity-0" : "opacity-100"
            }`}
          />
        ) : null}
        <video
          ref={videoRef}
          key={`${videoSrc}-${reloadNonce}`}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster={poster}
          className={`draft-hero-portrait ${mediaClass} transition-opacity duration-300 ${
            videoReady ? "opacity-100" : "opacity-0"
          }`}
          aria-label={alt ?? "hero"}
          onCanPlayThrough={() => setVideoReady(true)}
          onError={handleVideoError}
          onStalled={handleStalled}
          onEmptied={handleStalled}
        >
          <source src={videoSrc} type="video/webm" />
        </video>
      </>
    ) : still && !(webmFirst && showVideo) ? (
      <img
        src={still}
        alt={alt ?? "hero"}
        loading="lazy"
        className={`draft-hero-portrait ${mediaClass}`}
      />
    ) : null;

  if (!media) return null;

  return (
    <div
      className="draft-hero-contained-stage pointer-events-none absolute inset-0 z-[2] overflow-hidden"
      style={
        glowColor
          ? ({ ["--hero-glow" as string]: glowColor } as CSSProperties)
          : undefined
      }
    >
      <div
        className={`draft-hero-contained-fig ${
          variant === "slot" ? "scale-[1.30] origin-[center_22%]" : ""
        }`}
      >
        {media}
      </div>
    </div>
  );
}

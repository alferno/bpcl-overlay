import { type CSSProperties } from "react";

const SLOT_MEDIA_CLASS =
  "h-full w-full max-w-none object-cover object-top";

const INTRO_MEDIA_CLASS =
  "h-full w-full max-w-none object-cover object-top";

export type DraftHeroMediaVariant = "slot" | "intro";

export function DraftHeroMedia({
  staticUrl,
  staticFallback,
  animatedUrl,
  heroSlug,
  alt,
  animate = true,
  variant = "slot",
  staticOnly = false,
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
  staticOnly?: boolean;
  webmFirst?: boolean;
  glowColor?: string;
  className?: string;
}) {
  const mediaClass =
    className ??
    (variant === "intro" ? INTRO_MEDIA_CLASS : SLOT_MEDIA_CLASS);

  const still = staticFallback ?? staticUrl;

  if (!still) return null;

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
          variant === "slot" ? "origin-[center_22%]" : ""
        }`}
      >
        <img
          src={still}
          alt={alt ?? "hero"}
          loading="lazy"
          className={`draft-hero-portrait ${mediaClass}`}
        />
      </div>
    </div>
  );
}

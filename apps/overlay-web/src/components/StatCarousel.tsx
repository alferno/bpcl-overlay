import type { StatCarouselState } from "@bpc/shared-types";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { HeroPortrait } from "./HeroPortrait";

export function StatCarouselPanel({
  carousel,
}: {
  carousel: StatCarouselState | null | undefined;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!carousel?.slides.length) return undefined;
    setIndex(carousel.activeIndex ?? 0);
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % carousel.slides.length);
    }, carousel.slideDurationMs ?? 4000);
    return () => clearInterval(id);
  }, [carousel?.startedAt, carousel?.slides.length, carousel?.slideDurationMs]);

  if (!carousel || carousel.slides.length === 0) return null;

  const slide = carousel.slides[index];
  if (!slide) return null;

  return (
    <div className="flex items-center gap-6">
      <HeroPortrait
        url={carousel.heroPortraitUrl}
        heroName={carousel.heroName}
        size={112}
      />
      <div className="min-w-[280px] max-w-[360px]">
        {carousel.playerLabel ? (
          <p className="text-xs uppercase tracking-[0.35em] text-purple-300">
            {carousel.playerLabel}
          </p>
        ) : null}
        <p className="text-2xl font-bold text-white">{carousel.heroName}</p>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${slide.label}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className="mt-4"
          >
            <p className="text-[10px] uppercase tracking-widest text-neutral-400">
              {slide.label}
            </p>
            <p className="text-4xl font-black tabular-nums text-emerald-300">
              {slide.value}
            </p>
            {slide.sublabel ? (
              <p className="mt-1 text-lg font-semibold tabular-nums text-purple-200">
                {slide.sublabel}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex gap-1.5">
          {carousel.slides.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i === index ? "bg-emerald-400" : "bg-white/20"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

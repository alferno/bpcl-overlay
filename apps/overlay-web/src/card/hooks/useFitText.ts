import { useLayoutEffect, useRef, useState } from 'react';

interface FitTextOptions {
  /** Starting font size in px (or derived from cqi externally). */
  maxPx: number;
  minPx?: number;
  text: string;
}

/**
 * Shrinks font-size until text fits the container width.
 * Uses binary search for stable broadcast-quality sizing.
 */
export function useFitText({ maxPx, minPx = 8, text }: FitTextOptions) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState(maxPx);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const container = el.parentElement;
    if (!container) return;

    const fit = () => {
      const available = container.clientWidth;
      if (available <= 0) return;

      let lo = minPx;
      let hi = maxPx;
      let best = minPx;

      el.style.fontSize = `${hi}px`;
      el.style.whiteSpace = 'nowrap';

      if (el.scrollWidth <= available) {
        setFontSize(hi);
        return;
      }

      while (hi - lo > 0.25) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= available) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      setFontSize(best);
    };

    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [maxPx, minPx, text]);

  return { ref, fontSize };
}

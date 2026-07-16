import { useEffect, useState } from 'react';

/** Art hole polygon in holo canvas space (1086×1448). */
const HOLO_ART_POINTS: Array<[number, number]> = [
  [67, 130],
  [119, 79],
  [334, 79],
  [379, 124],
  [707, 124],
  [752, 79],
  [967, 79],
  [1017, 129],
  [1017, 1025],
  [954, 1075],
  [883, 1075],
  [850, 1098],
  [236, 1098],
  [203, 1075],
  [132, 1075],
  [67, 1025],
];

const cache = new Map<string, string>();

/**
 * Loads a frame image and punches a transparent art window (evenodd clip).
 * Returns an object URL suitable for <img src>.
 */
export function usePunchedFrame(src: string | undefined, enabled: boolean): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    enabled && src ? cache.get(src) : src,
  );

  useEffect(() => {
    if (!enabled || !src) {
      setUrl(src);
      return;
    }

    const cached = cache.get(src);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = 1086;
      const h = 1448;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      HOLO_ART_POINTS.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        cache.set(src, objectUrl);
        setUrl(objectUrl);
      }, 'image/png');
    };
    img.onerror = () => {
      if (!cancelled) setUrl(src);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, enabled]);

  return url;
}

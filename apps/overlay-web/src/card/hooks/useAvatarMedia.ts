import { useMemo } from 'react';

export type MediaKind = 'image' | 'gif' | 'video' | 'empty';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const GIF_EXT = /\.gif(\?|#|$)/i;
const DATA_VIDEO = /^data:video\//i;
const DATA_IMAGE = /^data:image\//i;

export function detectMediaKind(src: string | null | undefined): MediaKind {
  if (!src || !String(src).trim()) return 'empty';
  const value = String(src).trim();
  if (DATA_VIDEO.test(value) || VIDEO_EXT.test(value)) return 'video';
  try {
    const { pathname } = new URL(value, window.location.origin);
    if (VIDEO_EXT.test(pathname)) return 'video';
    if (GIF_EXT.test(pathname)) return 'gif';
  } catch {
    if (VIDEO_EXT.test(value)) return 'video';
    if (GIF_EXT.test(value)) return 'gif';
  }
  if (DATA_IMAGE.test(value) || GIF_EXT.test(value)) {
    return GIF_EXT.test(value) ? 'gif' : 'image';
  }
  return 'image';
}

export function useAvatarMedia(src: string | null | undefined) {
  return useMemo(() => {
    const kind = detectMediaKind(src);
    return { kind, src: kind === 'empty' ? null : src!.trim() };
  }, [src]);
}

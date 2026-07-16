import type { CSSProperties } from 'react';
import { useAvatarMedia } from '../../hooks/useAvatarMedia';
import type { AvatarFit } from '../../types/card';
import './AvatarMedia.css';

interface AvatarMediaProps {
  src?: string | null;
  fit?: AvatarFit;
  position?: string;
  emptyBackground?: string;
  className?: string;
  scale?: number;
  alt?: string;
}

export function AvatarMedia({
  src,
  fit = 'cover',
  position = '50% 50%',
  emptyBackground,
  className = '',
  scale = 1,
  alt = '',
}: AvatarMediaProps) {
  const { kind, src: resolved } = useAvatarMedia(src);

  const mediaStyle: CSSProperties = {
    objectFit: fit,
    objectPosition: position,
    transform: scale !== 1 ? `scale(${scale})` : undefined,
  };

  if (kind === 'empty') {
    return (
      <div
        className={`avatar-media avatar-media--empty ${className}`.trim()}
        style={{ background: emptyBackground }}
        aria-hidden
      />
    );
  }

  if (kind === 'video') {
    return (
      <video
        className={`avatar-media avatar-media--video ${className}`.trim()}
        src={resolved!}
        style={mediaStyle}
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt || 'Player avatar video'}
      />
    );
  }

  return (
    <img
      className={`avatar-media avatar-media--image ${className}`.trim()}
      src={resolved!}
      alt={alt}
      style={mediaStyle}
      decoding="async"
      draggable={false}
    />
  );
}

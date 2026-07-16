import { useId } from 'react';
import './HoloAura.css';

/**
 * Soft outer bloom matching holo.mp4 — muted spectrum, no hard neon.
 * Closely follows the original two-stroke aura (wide soft + mid).
 */
export function HoloAura() {
  const uid = useId().replace(/:/g, '');
  const points = '16,0 384,0 400,24 400,576 384,600 16,600 0,576 0,24';

  return (
    <div className="holo-aura" aria-hidden>
      <svg className="holo-aura__svg" viewBox="0 0 400 600" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id={`${uid}-a`} gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="360" y2="600">
            <stop offset="0%" stopColor="#ff4fbf" />
            <stop offset="22%" stopColor="#a979ff" />
            <stop offset="44%" stopColor="#42cfff" />
            <stop offset="66%" stopColor="#49f0bb" />
            <stop offset="88%" stopColor="#ffe36e" />
            <stop offset="100%" stopColor="#ff739d" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="0 200 300"
              to="360 200 300"
              dur="14s"
              repeatCount="indefinite"
            />
          </linearGradient>
          <linearGradient id={`${uid}-b`} gradientUnits="userSpaceOnUse" x1="360" y1="0" x2="40" y2="600">
            <stop offset="0%" stopColor="#42cfff" />
            <stop offset="30%" stopColor="#49f0bb" />
            <stop offset="55%" stopColor="#ffe36e" />
            <stop offset="78%" stopColor="#ff4fbf" />
            <stop offset="100%" stopColor="#a979ff" />
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              from="360 200 300"
              to="0 200 300"
              dur="18s"
              repeatCount="indefinite"
            />
          </linearGradient>
          <filter id={`${uid}-depth`} x="-60%" y="-40%" width="220%" height="200%" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#08061a" floodOpacity="0.72" />
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id={`${uid}-soft`} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <filter id={`${uid}-mid`} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        <polygon
          className="holo-aura__shadow"
          points={points}
          fill="none"
          stroke="#120e28"
          filter={`url(#${uid}-depth)`}
        />
        <polygon
          className="holo-aura__stroke holo-aura__stroke--wide"
          points={points}
          fill="none"
          stroke={`url(#${uid}-a)`}
          filter={`url(#${uid}-soft)`}
        />
        <polygon
          className="holo-aura__stroke holo-aura__stroke--mid"
          points={points}
          fill="none"
          stroke={`url(#${uid}-b)`}
          filter={`url(#${uid}-mid)`}
        />
      </svg>
    </div>
  );
}

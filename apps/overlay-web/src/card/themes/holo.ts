import type { ThemeDefinition } from '../types/card';

/** Art window polygon matching original holo canvas hole (normalized %). */
export const HOLO_ART_CLIP =
  'polygon(6.17% 8.98%, 10.96% 5.46%, 30.76% 5.46%, 34.9% 8.56%, 65.1% 8.56%, 69.24% 5.46%, 89.04% 5.46%, 93.65% 8.91%, 93.65% 70.79%, 87.84% 74.24%, 81.31% 74.24%, 78.27% 75.83%, 21.73% 75.83%, 18.69% 74.24%, 12.15% 74.24%, 6.17% 70.79%)';

export const HOLO_CARD_CLIP =
  'polygon(4% 0, 96% 0, 100% 4%, 100% 96%, 96% 100%, 4% 100%, 0 96%, 0 4%)';

export const holoTheme: ThemeDefinition = {
  id: 'holo',
  label: 'Holo',
  aspectRatio: '400 / 600',
  width: '17rem',
  layout: 'holo',
  assets: {
    frame: `${import.meta.env.BASE_URL}card-frames/holo.png`,
  },
  cardClip: HOLO_CARD_CLIP,
  portrait: {
    shape: 'clip',
    clipPath: HOLO_ART_CLIP,
    box: { x: 50, y: 50, w: 100, h: 100 },
    emptyBackground:
      'radial-gradient(circle at 50% 38%, rgba(88,148,255,0.14), transparent 52%), radial-gradient(circle at 50% 35%, #2a1848, #0c0618)',
    vignette: true,
    rim: true,
    scale: 1,
  },
  name: {
    box: { x: 50, y: 80.0, w: 74, h: 6.8 },
    baseFontSizeCqi: 8.2,
    minFontSizePx: 13,
    letterSpacing: '0.05em',
    fontWeight: 800,
    textTransform: 'none',
  },
  badge: {
    box: { x: 50, y: 3.8, w: 22, h: 3.6 },
    defaultText: 'HOLO',
    fontSizeCqi: 2.2,
  },
  stats: {
    layout: 'holo',
    box: { x: 50, y: 89.0, w: 78, h: 11.5 },
    showLabels: true,
    columns: 4,
    labelSizeCqi: 2.15,
    valueSizeCqi: 4.9,
  },
  colors: {
    name: '#2ad4ff',
    nameShadow: 'none',
    label: '#f0f8ff',
    value: '#ffe14a',
    badge: '#1a2030',
    glow: 'rgba(80,230,255,0.55)',
  },
  fonts: {
    name: 'Oxanium, Orbitron, Bahnschrift, sans-serif',
    label: 'Oxanium, Orbitron, Bahnschrift, sans-serif',
    value: 'Oxanium, Orbitron, Bahnschrift, sans-serif',
    badge: 'Oxanium, Orbitron, sans-serif',
  },
  effects: {
    shimmer: true,
    foil: true,
    aura: true,
    tilt: true,
  },
};

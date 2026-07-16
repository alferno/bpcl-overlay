import type { ThemeDefinition } from '../types/card';

export const goldTheme: ThemeDefinition = {
  id: 'gold',
  label: 'Gold',
  aspectRatio: '400 / 600',
  width: '17rem',
  layout: 'framed',
  assets: {
    frame: `${import.meta.env.BASE_URL}card-frames/gold.png`,
  },
  glow: 'drop-shadow(0 0 1.35rem rgba(255, 174, 0, 0.34))',
  portrait: {
    shape: 'rect',
    box: { x: 51, y: 48.835, w: 62.5, h: 41.67 },
    borderRadius: '0.125rem',
    emptyBackground:
      'radial-gradient(circle at 50% 35%, #3a2208, #120700)',
    vignette: true,
    rim: true,
    scale: 1.04,
  },
  name: {
    box: { x: 50, y: 74.335, w: 75, h: 9.67 },
    baseFontSizeCqi: 12.5,
    minFontSizePx: 14,
    letterSpacing: '0.01em',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  badge: {
    box: { x: 50, y: 4.5, w: 28, h: 4 },
    defaultText: 'Gold',
    fontSizeCqi: 2.4,
  },
  stats: {
    layout: 'absolute',
    showLabels: false,
    items: {
      kda:     { x: 19, y: 89 },
      gpm:     { x: 39, y: 89 },
      xpm:     { x: 59, y: 89 },
      winrate: { x: 81, y: 89 },
    },
    valueSizeCqi: 6,
  },
  colors: {
    name: '#5b3100',
    nameShadow: '0 1px rgba(255,228,96,0.72), 0 4px 9px rgba(86,43,0,0.22)',
    label: '#4e2c00',
    value: '#4e2c00',
    badge: '#ffffff',
    glow: 'rgba(255,174,0,0.34)',
  },
  fonts: {
    name: '"Bebas Neue", Rajdhani, Impact, sans-serif',
    label: '"Bebas Neue", Rajdhani, Impact, sans-serif',
    value: '"Bebas Neue", Rajdhani, Impact, sans-serif',
    badge: 'Arial, Helvetica, sans-serif',
  },
  effects: {
    shimmer: true,
    tilt: true,
  },
};

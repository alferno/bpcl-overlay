import type { ThemeDefinition } from '../types/card';

export const basicTheme: ThemeDefinition = {
  id: 'basic',
  label: 'Basic',
  aspectRatio: '400 / 600',
  width: '17rem',
  layout: 'framed',
  assets: {
    frame: `${import.meta.env.BASE_URL}card-frames/basic.png`,
  },
  glow: 'drop-shadow(0 0 1.1rem rgba(255, 255, 255, 0.14))',
  portrait: {
    shape: 'circle',
    box: { x: 50, y: 41.83, w: 45.33, h: 45.33 },
    borderRadius: '50%',
    emptyBackground:
      'radial-gradient(circle at 50% 38%, #1a1c20 0%, #08090b 72%, #030405 100%)',
    shine: true,
    scale: 1,
  },
  name: {
    box: { x: 51, y: 73.17, w: 72, h: 7 },
    baseFontSizeCqi: 8.5,
    minFontSizePx: 10,
    letterSpacing: '0.02em',
    fontWeight: 500,
  },
  badge: {
    box: { x: 50, y: 17.5, w: 33.6, h: 4.2 },
    defaultText: 'Basic',
    fontSizeCqi: 2.25,
  },
  plaque: {
    box: { x: 50, y: 6, w: 75, h: 7 },
    title: 'BPCL',
    subtitle: 'Bharat Pro Circuit League',
  },
  stats: {
    layout: 'grid',
    box: { x: 50, y: 86, w: 80, h: 17 },
    showLabels: true,
    columns: 4,
    labelSizeCqi: 2,
    valueSizeCqi: 5,
  },
  colors: {
    name: '#eceef1',
    nameShadow: '0 1px rgba(255,255,255,0.55), 0 3px 8px rgba(0,0,0,0.82)',
    label: '#e8eaed',
    value: '#f1f2f4',
    badge: '#d2d6db',
    plaque: '#eceef1',
    plaqueSub: '#c8ccd2',
    glow: 'rgba(255,255,255,0.14)',
  },
  fonts: {
    name: 'Arial, Helvetica, sans-serif',
    label: 'Arial, Helvetica, sans-serif',
    value: 'Arial, Helvetica, sans-serif',
    badge: 'Arial, Helvetica, sans-serif',
    plaque: 'Arial, Helvetica, sans-serif',
  },
  effects: {
    shimmer: true,
    tilt: true,
  },
};

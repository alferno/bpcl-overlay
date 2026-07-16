import type { ThemeDefinition } from '../types/card';

export const defaultTheme: ThemeDefinition = {
  id: 'default',
  label: 'Default',
  aspectRatio: '340 / 520',
  width: '17rem',
  layout: 'panel',
  assets: {
    logo: `${import.meta.env.BASE_URL}card-frames/defaultlogo.png`,
  },
  portrait: {
    shape: 'rect',
    box: { x: 50, y: 28, w: 63.25, h: 41.4 },
    borderRadius: '6.47%',
    emptyBackground: '#dddcd8',
  },
  name: {
    box: { x: 50, y: 58, w: 78, h: 8 },
    baseFontSizeCqi: 9.71,
    minFontSizePx: 12,
    letterSpacing: '0.02em',
    fontWeight: 600,
  },
  stats: {
    layout: 'none',
    showLabels: false,
  },
  footer: {
    title: 'BPCL',
    subtitle: 'Bharat Pro Circuit League',
    tagline: 'Default Player Card',
  },
  colors: {
    name: '#252525',
    nameShadow: 'none',
    label: '#6f6f6f',
    value: '#252525',
    badge: '#6f6f6f',
    background: '#e9e8e5',
  },
  fonts: {
    name: 'Georgia, "Times New Roman", serif',
    label: 'Georgia, "Times New Roman", serif',
    value: 'Georgia, "Times New Roman", serif',
    plaque: '"Playfair Display", "Bodoni MT", Didot, Georgia, serif',
  },
  effects: {
    corners: true,
  },
};

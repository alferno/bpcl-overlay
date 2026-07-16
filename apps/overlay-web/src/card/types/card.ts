/** Percentage-based position within the card (0–100). */
export interface PctPos {
  x: number;
  y: number;
}

export interface PctBox extends PctPos {
  w: number;
  h: number;
}

export interface CardStat {
  id: string;
  label: string;
  value: string;
}

export type AvatarFit = 'cover' | 'contain';

export interface CardColors {
  name?: string;
  nameShadow?: string;
  label?: string;
  value?: string;
  badge?: string;
  glow?: string;
  plaque?: string;
  plaqueSub?: string;
  accent?: string;
  background?: string;
}

export interface CardPositionOverrides {
  portrait?: Partial<PctBox>;
  name?: Partial<PctBox>;
  badge?: Partial<PctBox>;
  plaque?: Partial<PctBox>;
  stats?: Partial<PctBox>;
  /** Per-stat absolute positions (used by gold/absolute layout). */
  statItems?: Record<string, PctPos>;
}

export interface CardData {
  id?: string;
  name: string;
  theme: string;
  avatar?: string | null;
  badge?: string;
  stats?: CardStat[];
  subtitle?: string;
  visible?: boolean;
  avatarFit?: AvatarFit;
  avatarPosition?: string;
  colors?: CardColors;
  positions?: CardPositionOverrides;
}

export type PortraitShape = 'circle' | 'rect' | 'clip';

export type StatsLayout = 'grid' | 'absolute' | 'holo' | 'none';

export interface ThemeFonts {
  name: string;
  label: string;
  value: string;
  badge?: string;
  plaque?: string;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  /** CSS aspect-ratio value, e.g. "400 / 600" */
  aspectRatio: string;
  /** Default card width */
  width: string;
  layout: 'framed' | 'panel' | 'holo';
  assets: {
    frame?: string;
    logo?: string;
  };
  glow?: string;
  portrait: {
    shape: PortraitShape;
    /** Clip-path for shape === 'clip' */
    clipPath?: string;
    box: PctBox;
    borderRadius?: string;
    emptyBackground?: string;
    shine?: boolean;
    vignette?: boolean;
    rim?: boolean;
    scale?: number;
  };
  name: {
    box: PctBox;
    baseFontSizeCqi: number;
    minFontSizePx: number;
    transform?: string;
    letterSpacing?: string;
    fontWeight?: number | string;
    textTransform?: string;
  };
  badge?: {
    box: PctBox;
    defaultText: string;
    fontSizeCqi: number;
  };
  plaque?: {
    box: PctBox;
    title: string;
    subtitle: string;
  };
  stats: {
    layout: StatsLayout;
    box?: PctBox;
    /** Absolute positions keyed by common ids; falls back to even distribution. */
    items?: Record<string, PctPos>;
    showLabels: boolean;
    columns?: number;
    labelSizeCqi?: number;
    valueSizeCqi?: number;
  };
  footer?: {
    title: string;
    subtitle: string;
    tagline: string;
  };
  colors: Required<
    Pick<CardColors, 'name' | 'label' | 'value' | 'badge'>
  > &
    CardColors;
  fonts: ThemeFonts;
  effects: {
    shimmer?: boolean;
    foil?: boolean;
    aura?: boolean;
    tilt?: boolean;
    corners?: boolean;
  };
  /** Outer card clip (holo chamfer etc.) */
  cardClip?: string;
}

export interface StageState {
  cards: CardData[];
  visible: boolean;
  selectedIndex: number;
}

import type { ThemeDefinition } from '../types/card';
import { basicTheme } from './basic';
import { defaultTheme } from './default';
import { goldTheme } from './gold';
import { holoTheme } from './holo';

const themes = new Map<string, ThemeDefinition>();

export function registerTheme(theme: ThemeDefinition): void {
  themes.set(theme.id, theme);
}

export function getTheme(id: string): ThemeDefinition {
  const theme = themes.get(id);
  if (!theme) {
    console.warn(`[BPCL Card] Unknown theme "${id}", falling back to basic`);
    return basicTheme;
  }
  return theme;
}

export function listThemes(): ThemeDefinition[] {
  return Array.from(themes.values());
}

export function getThemeIds(): string[] {
  return Array.from(themes.keys());
}

/** Register built-in rarities. Call once at boot. */
export function bootstrapThemes(): void {
  registerTheme(defaultTheme);
  registerTheme(basicTheme);
  registerTheme(goldTheme);
  registerTheme(holoTheme);
}

bootstrapThemes();

export { basicTheme, defaultTheme, goldTheme, holoTheme };

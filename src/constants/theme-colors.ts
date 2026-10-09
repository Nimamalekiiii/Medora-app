/**
 * The app's colour theme in one place. Screens name a colour by the role it
 * plays (a background, some text, a border) and this module turns it into
 * the Medora look: a soft light blue in light mode and a deep navy blue in
 * dark mode, with one blue as the accent everywhere.
 *
 * Changing a value here changes every screen. This module is pure, so it
 * can be tested without the app running.
 */

export type ColorRole = 'background' | 'text' | 'border';

export const theme = {
  light: {
    page: '#E9F2FC',
    card: '#FFFFFF',
    inset: '#F1F6FD',
    tint: '#E0ECFB',
    accent: '#2A78D6',
    ink: '#12294A',
    border: '#D9E6F6',
    borderStrong: '#C7D9EF',
  },
  dark: {
    page: '#081220',
    card: '#11213A',
    inset: '#172B48',
    tint: '#1D3556',
    accent: '#5BA4F2',
    ink: '#EAF2FC',
    border: '#243C60',
    borderStrong: '#2F4B73',
  },
} as const;

/** Backgrounds that are a whole screen rather than something on it. */
const PAGE_BACKGROUNDS = new Set(['#F7FBFE', '#F5FAFC', '#F7FAFC']);

type Parsed = { r: number; g: number; b: number; luminance: number; saturation: number; hue: number };

function parse(color: string): Parsed | null {
  const raw = color.replace('#', '');
  if (raw.length !== 6) return null;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16));
  if (![r, g, b].every(Number.isFinite)) return null;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (delta !== 0) {
    if (max === r / 255) hue = 60 * ((((g - b) / 255) / delta) % 6);
    else if (max === g / 255) hue = 60 * (((b - r) / 255) / delta + 2);
    else hue = 60 * (((r - g) / 255) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { r, g, b, luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, saturation, hue };
}

type Family = 'cool' | 'red' | 'amber' | 'green';

/** Greys, teals and blues all belong to the app's own blue family. Reds, ambers and greens keep their meaning. */
function family(color: Parsed): Family {
  if (color.saturation < 0.22 || (color.hue >= 165 && color.hue <= 260)) return 'cool';
  if (color.hue < 20 || color.hue > 330) return 'red';
  if (color.hue < 70) return 'amber';
  if (color.hue < 165) return 'green';
  return 'cool';
}

const isAccent = (color: Parsed) => color.saturation >= 0.3 && color.luminance > 0.32 && color.luminance < 0.72;

export function resolveAppColor(color: string, role: ColorRole = 'text'): { light: string; dark: string } {
  const upper = color.toUpperCase();
  const parsed = parse(upper);
  // Colours with their own transparency, and anything unreadable, are left alone.
  if (!parsed) return { light: color, dark: color };
  const kind = family(parsed);
  const { luminance } = parsed;
  const { light, dark } = theme;

  if (role === 'background') {
    if (kind === 'red') {
      if (luminance > 0.85) return { light: color, dark: '#3A1F27' };
      return { light: color, dark: upper === '#D93E4E' ? '#A92D3A' : upper === '#B92537' ? '#8F1D2B' : color };
    }
    if (kind === 'green') return { light: color, dark: luminance > 0.85 ? '#16362F' : color };
    if (kind === 'amber') return { light: color, dark: luminance > 0.85 ? '#3A2E18' : color };
    if (upper === '#FFFFFF') return { light: light.card, dark: dark.card };
    if (PAGE_BACKGROUNDS.has(upper)) return { light: light.page, dark: dark.page };
    if (luminance > 0.93) return { light: light.inset, dark: dark.inset };
    if (luminance > 0.78) return { light: light.tint, dark: dark.tint };
    if (isAccent(parsed)) return { light: light.accent, dark: '#2467BD' };
    if (luminance < 0.25) return { light: light.ink, dark: '#1B3352' };
    return { light: color, dark: '#27456B' };
  }

  if (role === 'border') {
    if (kind === 'red') return { light: color, dark: luminance > 0.7 ? '#5A2F37' : color };
    if (kind === 'green') return { light: color, dark: luminance > 0.7 ? '#22503F' : color };
    if (kind === 'amber') return { light: color, dark: luminance > 0.7 ? '#5A4520' : color };
    if (isAccent(parsed)) return { light: luminance > 0.45 ? '#8DBDF0' : light.accent, dark: '#3D6FB0' };
    if (luminance > 0.86) return { light: light.border, dark: dark.border };
    return { light: light.borderStrong, dark: dark.borderStrong };
  }

  // Text and icons.
  if (upper === '#FFFFFF') return { light: '#FFFFFF', dark: '#FFFFFF' };
  if (kind === 'red') return { light: color, dark: '#F2938A' };
  if (kind === 'amber') return { light: color, dark: '#E3AE6C' };
  if (kind === 'green') return { light: color, dark: '#5FCB9E' };
  if (isAccent(parsed) && parsed.saturation >= 0.36) return { light: light.accent, dark: dark.accent };
  if (luminance < 0.2) return { light: light.ink, dark: dark.ink };
  if (luminance < 0.33) return { light: color, dark: '#CBD9EB' };
  if (luminance < 0.46) return { light: color, dark: '#AEC0D6' };
  if (luminance < 0.6) return { light: color, dark: '#91A6C0' };
  return { light: color, dark: '#8298B4' };
}

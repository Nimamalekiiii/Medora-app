import { Appearance, DynamicColorIOS, Platform, type ColorValue } from 'react-native';

import { resolveAppColor, type ColorRole } from './theme-colors';

export { theme } from './theme-colors';

const cache = new Map<string, { light: string; dark: string }>();

/** A colour that follows light and dark mode. The theme itself lives in theme-colors.ts. */
export function appColor(color: string, role: ColorRole = 'text'): ColorValue {
  const key = `${role}:${color}`;
  let resolved = cache.get(key);
  if (!resolved) {
    resolved = resolveAppColor(color, role);
    cache.set(key, resolved);
  }
  if (Platform.OS === 'ios') return DynamicColorIOS(resolved);
  return Appearance.getColorScheme() === 'dark' ? resolved.dark : resolved.light;
}

import { StyleSheet, useColorScheme } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A soft highlight across the top half of whatever it is placed in, which
 * gives icons and tiles a slightly glossy, glass-like surface. Put it as the
 * first child of a view that has `overflow: 'hidden'` and rounded corners.
 */
export function Gloss({ strength = 1 }: { strength?: number }) {
  const dark = useColorScheme() === 'dark';
  const top = (dark ? 0.16 : 0.5) * strength;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={top} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={top * 0.18} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#gloss)" />
    </Svg>
  );
}

/** A soft blue shadow that lifts cards off the page in light mode. */
export const cardShadow = {
  shadowColor: '#1D4F91',
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
} as const;

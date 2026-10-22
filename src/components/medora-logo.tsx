import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

type Props = { size?: number; animate?: boolean };

/** The Medora app tile: the staff and the open book, the same picture as the app icon. */
export function MedoraLogoMark({ size = 96, animate = false }: Props) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!animate || reduceMotion) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.055, { duration: 950, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => { scale.value = 1; };
  }, [animate, reduceMotion, scale]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Medora logo"
      entering={animate && !reduceMotion ? FadeInDown.duration(620).springify() : undefined}
      style={[styles.mark, { width: size, height: size, borderRadius: size * 0.23 }, pulseStyle]}>
      <Image source={require('@/assets/images/splash-icon.png')} style={{ width: size, height: size }} contentFit="cover" />
    </Animated.View>
  );
}

// The logo is the brand mark, so it looks the same in light and dark mode.
const styles = StyleSheet.create({
  mark: {
    shadowColor: '#1D4F91',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8,
  },
});

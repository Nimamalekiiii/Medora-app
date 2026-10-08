import { appColor } from '@/constants/adaptive-color';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

type Props = { size?: number; animate?: boolean };

export function MedExamLogoMark({ size = 96, animate = false }: Props) {
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
  const rounded = size * 0.3;

  return (
    <Animated.View
      accessible
      accessibilityLabel="MedExam logo"
      entering={animate && !reduceMotion ? FadeInDown.duration(620).springify() : undefined}
      style={[styles.mark, { width: size, height: size, borderRadius: rounded }, pulseStyle]}>
      <View style={[styles.halo, { width: size * 0.76, height: size * 0.76, borderRadius: size * 0.24 }]} />
      <View style={[styles.crossVertical, { width: size * 0.13, height: size * 0.4, borderRadius: size * 0.06 }]} />
      <View style={[styles.crossHorizontal, { width: size * 0.4, height: size * 0.13, borderRadius: size * 0.06 }]} />
      <View style={[styles.book, { width: size * 0.57, height: size * 0.19, bottom: size * 0.17 }]}>
        <View style={[styles.page, styles.leftPage, { borderTopLeftRadius: size * 0.08 }]} />
        <View style={[styles.page, styles.rightPage, { borderTopRightRadius: size * 0.08 }]} />
        <View style={[styles.spine, { width: Math.max(2, size * 0.025) }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appColor('#0F7181', 'background'),
    overflow: 'hidden',
    shadowColor: '#0E5968',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  halo: { position: 'absolute', borderWidth: 1, borderColor: appColor('#FFFFFF24', 'border') },
  crossVertical: { position: 'absolute', top: '21%', backgroundColor: appColor('#F7FFFF', 'background') },
  crossHorizontal: { position: 'absolute', top: '34.5%', backgroundColor: appColor('#F7FFFF', 'background') },
  book: { position: 'absolute', flexDirection: 'row', alignItems: 'flex-end' },
  page: { flex: 1, height: '82%', borderTopWidth: 2.5, borderColor: appColor('#F7FFFF', 'border') },
  leftPage: { borderLeftWidth: 2.5, transform: [{ skewY: '-8deg' }], marginRight: 1 },
  rightPage: { borderRightWidth: 2.5, transform: [{ skewY: '8deg' }], marginLeft: 1 },
  spine: { position: 'absolute', height: '100%', alignSelf: 'center', backgroundColor: appColor('#F7FFFF', 'background') },
});

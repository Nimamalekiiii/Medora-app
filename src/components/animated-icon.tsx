import { appColor } from '@/constants/adaptive-color';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MedExamLogoMark } from './medexam-logo';

const DURATION = 520;

const splashKeyframe = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  25: { opacity: 1 },
  100: { opacity: 0, transform: [{ scale: 0.92 }], easing: Easing.out(Easing.quad) },
});

export function AnimatedSplashOverlay() {
  const [animateOut, setAnimateOut] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const logo = <MedExamLogoMark size={96} />;
  return animateOut ? (
    <Animated.View
      pointerEvents="none"
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.splashOverlay}>
      {logo}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        void SplashScreen.hideAsync().finally(() => setAnimateOut(true));
      }}
      style={styles.splashOverlay}>
      {logo}
    </View>
  );
}

export function AnimatedIcon() {
  return <MedExamLogoMark size={128} animate />;
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appColor('#F5FAFC', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});

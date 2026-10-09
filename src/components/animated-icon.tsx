import { appColor } from '@/constants/adaptive-color';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { tr } from '@/services/localization';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, Keyframe, useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MedoraLogoMark } from './medora-logo';

/** How long the launch screen stays up for someone who is signed in. */
const SIGNED_IN_HOLD_MS = 1500;
/** Signed-out users go to the welcome screen, which shows the same logo. */
const SIGNED_OUT_HOLD_MS = 300;
const FADE_OUT_MS = 480;

const leaveKeyframe = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 1.04 }], easing: Easing.out(Easing.quad) },
});

/**
 * The launch screen: shown once each time the app is opened from closed. It
 * covers the app while the saved sign-in is restored, greets a signed-in
 * student by name for a moment, then fades out to reveal the app underneath.
 */
export function AnimatedSplashOverlay() {
  const { session, loading } = useAuth();
  const { preferences } = useAppSettings();
  const reduceMotion = useReducedMotion();
  const shownAt = useRef(Date.now());
  const [laidOut, setLaidOut] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (loading || !laidOut || leaving) return;
    const hold = session ? SIGNED_IN_HOLD_MS : SIGNED_OUT_HOLD_MS;
    const timer = setTimeout(() => setLeaving(true), Math.max(0, hold - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [loading, laidOut, leaving, session]);

  if (!visible) return null;

  const firstName = String(session?.user?.user_metadata?.full_name ?? '').trim().split(/\s+/)[0];
  const welcome = tr('Welcome back', preferences.language);
  const greeting = loading ? '' : session ? (firstName ? `${welcome}, ${firstName}` : welcome) : '';

  const content = (
    <>
      <MedoraLogoMark size={104} />
      <Text style={styles.brand}>Medora</Text>
      <View style={styles.greetingSlot}>
        {greeting ? (
          <Animated.Text entering={reduceMotion ? undefined : FadeIn.duration(360)} style={styles.greeting} numberOfLines={1}>
            {greeting}
          </Animated.Text>
        ) : null}
      </View>
    </>
  );

  return leaving ? (
    <Animated.View
      pointerEvents="none"
      entering={leaveKeyframe.duration(reduceMotion ? 1 : FADE_OUT_MS).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.splashOverlay}>
      {content}
    </Animated.View>
  ) : (
    <View
      accessibilityViewIsModal
      onLayout={() => {
        void SplashScreen.hideAsync().finally(() => setLaidOut(true));
      }}
      style={styles.splashOverlay}>
      {content}
    </View>
  );
}

export function AnimatedIcon() {
  return <MedoraLogoMark size={128} animate />;
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appColor('#F5FAFC', 'background'),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  brand: { marginTop: 18, color: appColor('#0F7181', 'text'), fontSize: 15, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase' },
  // Fixed height so the logo does not jump when the greeting appears.
  greetingSlot: { height: 34, marginTop: 10, justifyContent: 'center', paddingHorizontal: 24 },
  greeting: { color: appColor('#17324D', 'text'), fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
});

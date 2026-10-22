import { appColor } from '@/constants/adaptive-color';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { MedoraLogoMark } from '@/components/medora-logo';
import { AuthProvider, useAuth } from '@/services/auth-context';
import { initializeCloudSync } from '@/services/cloud-sync';
import { AppSettingsProvider, useAppSettings } from '@/services/app-settings-context';

void SplashScreen.preventAutoHideAsync();

function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return <View style={styles.loading}><MedoraLogoMark size={74} /><ActivityIndicator color={appColor('#0F7181', 'text')} style={styles.spinner} /></View>;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Privacy, health disclaimer and terms can be read before signing in. */}
      <Stack.Screen name="legal" options={{ headerShown: false }} />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="explore" options={{ headerShown: false }} />
        <Stack.Screen name="focus" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="subject/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="subject/exam" options={{ headerShown: false }} />
        <Stack.Screen name="subject/study-plan" options={{ headerShown: false }} />
        <Stack.Screen name="subject/study" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topics" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/flashcards" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/progress" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/study" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/study/active-recall" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/study/quiz" options={{ headerShown: false }} />
        <Stack.Screen name="subject/topic/study/review" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => initializeCloudSync(), []);

  return (
    <AppSettingsProvider>
      <AppThemeShell />
    </AppSettingsProvider>
  );
}

function AppThemeShell() {
  const colorScheme = useColorScheme();
  const { ready } = useAppSettings();
  return <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
    {ready ? <AuthProvider>
      <AnimatedSplashOverlay />
      <AppNavigator />
    </AuthProvider> : <View style={styles.loading}><MedoraLogoMark size={74} /><ActivityIndicator color={appColor('#0F7181', 'text')} style={styles.spinner} /></View>}
  </ThemeProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F5FAFC', 'background') },
  spinner: { marginTop: 22 },
});

import { cardShadow } from '@/components/gloss';
import { LocalizedText as Text } from '@/components/localized-text';
import PullToRefreshScrollView from '@/components/pull-to-refresh-scroll-view';
import { SettingsCard, SettingsRow } from '@/components/settings-shared';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { getSupabaseAuthClient } from '@/services/cloud-sync';
import { tr } from '@/services/localization';
import { getProfileAvatar } from '@/services/profile-avatar';
import { confirmSignOut } from '@/services/sign-out';
import { Image } from 'expo-image';
import { Stack, router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const open = (path: string) => () => router.push(path as Href);

export default function ProfileTab() {
  const { session } = useAuth();
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const tx = (text: string) => tr(text, language);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const user = session?.user;
  const userId = user?.id;
  const avatarPath = user?.user_metadata?.medexam_avatar_path;
  const detail = (key: string) => String(user?.user_metadata?.[key] ?? '').trim();
  const fullName = detail('full_name');
  const studyYear = detail('study_year');
  const studyLine = [
    detail('study_program'),
    detail('institution'),
    studyYear ? (/^\d+$/.test(studyYear) ? `${tx('Year')} ${studyYear}` : studyYear) : '',
  ].filter(Boolean).join(' · ');

  const loadAvatar = useCallback(async () => {
    if (!userId) { setAvatarUri(null); return; }
    try {
      setAvatarUri(await getProfileAvatar(userId, avatarPath));
    } catch (error) {
      console.warn('Could not load the profile photo:', error);
      setAvatarUri(null);
    }
  }, [userId, avatarPath]);

  // Runs again when returning from Personal information, so a new photo shows at once.
  useFocusEffect(useCallback(() => { void loadAvatar(); }, [loadAvatar]));

  async function refresh() {
    // Picks up profile changes made on another device, then reloads the photo.
    await getSupabaseAuthClient()?.refreshSession().catch((error: unknown) => console.warn('Could not refresh the account:', error));
    await loadAvatar();
  }

  return (
    <SafeAreaView style={ui.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <PullToRefreshScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} onRefresh={refresh}>
        <Text style={ui.eyebrow}>MEDEXAM</Text>
        <Text style={ui.title} accessibilityRole="header">Profile</Text>
        <Text style={styles.subtitle}>Manage your account and preferences</Text>

        <Pressable accessibilityRole="button" accessibilityLabel={tx('Personal information')} onPress={open('/account')} style={({ pressed }) => [styles.profileCard, pressed && ui.pressed]}>
          <View style={styles.avatar}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} contentFit="cover" style={styles.avatarImage} />
              : <Text style={styles.avatarInitial}>{(fullName || user?.email || 'M').slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={ui.grow}>
            <Text style={styles.name} numberOfLines={1}>{fullName || tx('Medora account')}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email ?? ''}</Text>
            {studyLine ? <Text style={styles.studyLine} numberOfLines={1}>{studyLine}</Text> : null}
          </View>
          <StudyIcon name="chevron" size={14} color={appColor('#8DA2AF', 'text')} />
        </Pressable>

        <SettingsCard title="Study setup">
          <SettingsRow icon="calendar" title="Study preferences" description="Schedule, goals and study time" onPress={open('/settings/study')} />
          <SettingsRow icon="bell" title="Notifications" description="Study, exam and review reminders" onPress={open('/settings/notifications')} />
          <SettingsRow icon="sliders" title="AI preferences" description="Quiz and flashcard settings" onPress={open('/settings/ai')} />
        </SettingsCard>

        <SettingsCard>
          <SettingsRow icon="settings" title="App settings" description="Appearance, language and more" onPress={open('/settings')} />
          <SettingsRow icon="shield" title="Data and privacy" description="Backup, sync and security" onPress={open('/settings/data')} />
          <SettingsRow icon="help" title="Help and support" description="FAQ and contact" onPress={open('/settings/help')} />
        </SettingsCard>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut || !session, busy: signingOut }}
          disabled={signingOut || !session}
          onPress={() => confirmSignOut(language, setSigningOut)}
          style={({ pressed }) => [styles.signOut, (pressed || signingOut) && styles.signOutPressed]}
        >
          {signingOut ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signOutText}>Sign out</Text>}
        </Pressable>
      </PullToRefreshScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36 },
  subtitle: { color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 21, marginTop: 4 },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20, marginBottom: 16, padding: 16, borderRadius: 20, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: appColor('#E1F3F7', 'background') },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: appColor('#0F7181', 'text'), fontSize: 27, fontWeight: '800' },
  name: { color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
  email: { color: appColor('#718493', 'text'), fontSize: 13, marginTop: 3 },
  studyLine: { color: appColor('#718493', 'text'), fontSize: 13, marginTop: 3 },

  signOut: { minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 18, backgroundColor: '#D9485A', shadowColor: '#B02C3E', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  signOutPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  signOutText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});

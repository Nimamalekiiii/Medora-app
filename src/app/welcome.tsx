import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MedExamLogoMark } from '@/components/medexam-logo';
import { getSupabaseAuthClient } from '@/services/cloud-sync';
import { useAuth } from '@/services/auth-context';

type AuthMode = 'welcome' | 'sign-in' | 'sign-up';

function describeAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Please check your details and try again.';
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Please try again.';
  if (/already registered|user already exists/i.test(message)) return 'An account already uses this email. Choose Log in instead.';
  if (/password should be at least|password.*6 characters/i.test(message)) return 'Choose a longer password (at least 8 characters).';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email from the message Supabase sent, then log in.';
  return message;
}

export default function WelcomeScreen() {
  const { configured } = useAuth();
  const [mode, setMode] = useState<AuthMode>('welcome');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function chooseMode(next: AuthMode) {
    setError('');
    setNotice('');
    setMode(next);
  }

  async function submit() {
    setError('');
    setNotice('');
    if (!configured) {
      setError('Cloud sign-in is not configured yet. Add the Supabase URL and publishable key, then restart MedExam.');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    const auth = getSupabaseAuthClient();
    if (!auth) {
      setError('Cloud sign-in is not configured. Restart the app and try again.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const { data, error: authError } = await auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (authError) throw authError;
        setPassword('');
        setConfirmPassword('');
        if (!data.session) {
          setMode('sign-in');
          setNotice('Check your email for the confirmation link. After confirming it, come back here and log in.');
        }
      } else {
        const { error: authError } = await auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) throw authError;
        setPassword('');
      }
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'sign-up' ? 'Create your account' : 'Welcome back';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          <View style={styles.page}>
            {mode !== 'welcome' && (
              <Pressable accessibilityRole="button" onPress={() => chooseMode('welcome')} style={styles.backButton} hitSlop={12}>
                <Text style={styles.backText}>‹  Back</Text>
              </Pressable>
            )}

            <View style={[styles.hero, mode !== 'welcome' && styles.compactHero]}>
              <MedExamLogoMark size={mode === 'welcome' ? 102 : 72} animate />
              <Text style={styles.brand}>MedExam</Text>
              {mode === 'welcome' ? (
                <>
                  <Text style={styles.headline}>Study with confidence.</Text>
                  <Text style={styles.subtitle}>A calmer way to organize your subjects, prepare for exams, and keep track of what you know.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.headline}>{title}</Text>
                  <Text style={styles.subtitle}>{mode === 'sign-up' ? 'Your study plans and progress stay with your MedExam account.' : 'Sign in to continue to your study space.'}</Text>
                </>
              )}
            </View>

            {mode === 'welcome' ? (
              <View style={styles.welcomeActions}>
                <View style={styles.featureCard}>
                  <View style={styles.featureIcon}><Text style={styles.featureIconText}>✦</Text></View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>Your study space, in one place</Text>
                    <Text style={styles.featureDescription}>Subjects, exam plans, practice questions, flashcards, and progress.</Text>
                  </View>
                </View>
                <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => chooseMode('sign-up')}>
                  <Text style={styles.primaryButtonText}>Create account</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => chooseMode('sign-in')}>
                  <Text style={styles.secondaryButtonText}>Log in</Text>
                </Pressable>
                <Text style={styles.privacyCopy}>Your account keeps your study data private and synced across your devices.</Text>
                {!configured && <Text style={styles.setupNotice}>Cloud setup is not complete on this build yet.</Text>}
              </View>
            ) : (
              <View style={styles.formCard}>
                {notice ? <View accessibilityRole="alert" style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View> : null}
                {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

                {mode === 'sign-up' && (
                  <>
                    <Text style={styles.inputLabel}>Name <Text style={styles.optional}>(optional)</Text></Text>
                    <TextInput
                      style={styles.input}
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Your name"
                      placeholderTextColor={appColor('#81919B', 'text')}
                      autoComplete="name"
                      textContentType="name"
                      autoCapitalize="words"
                      returnKeyType="next"
                      accessibilityLabel="Your name"
                    />
                  </>
                )}

                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={appColor('#81919B', 'text')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  accessibilityLabel="Email address"
                />

                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={appColor('#81919B', 'text')}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
                    returnKeyType={mode === 'sign-up' ? 'next' : 'go'}
                    onSubmitEditing={() => { if (mode === 'sign-in') void submit(); }}
                    accessibilityLabel="Password"
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((visible) => !visible)} style={styles.showPassword} hitSlop={8}>
                    <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>

                {mode === 'sign-up' && (
                  <>
                    <Text style={styles.inputLabel}>Confirm password</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Enter the password again"
                      placeholderTextColor={appColor('#81919B', 'text')}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      returnKeyType="go"
                      onSubmitEditing={() => { void submit(); }}
                      accessibilityLabel="Confirm password"
                    />
                  </>
                )}

                <Pressable accessibilityRole="button" disabled={busy || !configured} onPress={() => { void submit(); }} style={[styles.primaryButton, (busy || !configured) && styles.disabledButton]}>
                  <Text style={styles.primaryButtonText}>{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Log in'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => chooseMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')} style={styles.switchMode}>
                  <Text style={styles.switchModeText}>{mode === 'sign-up' ? 'Already have an account? Log in' : 'New to MedExam? Create an account'}</Text>
                </Pressable>
                <Text style={styles.privacyCopy}>By continuing, your study data is saved to the MedExam account you use here.</Text>
              </View>
            )}
            <Text style={styles.footer}>Made for focused, steady progress.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') },
  scrollContent: { flexGrow: 1, paddingBottom: 28 },
  page: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 26, paddingTop: 22, paddingBottom: 12 },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  backText: { color: appColor('#507181', 'text'), fontSize: 15, fontWeight: '700' },
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 26 },
  compactHero: { paddingTop: 2, paddingBottom: 18 },
  brand: { marginTop: 15, color: appColor('#17324D', 'text'), fontSize: 19, fontWeight: '800', letterSpacing: 0.4 },
  headline: { marginTop: 12, color: appColor('#17324D', 'text'), fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { marginTop: 9, maxWidth: 390, color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 23, textAlign: 'center' },
  welcomeActions: { gap: 12 },
  featureCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: appColor('#FFFFFF', 'background'), padding: 16, borderRadius: 18, borderWidth: 1, borderColor: appColor('#E5EEF2', 'border'), marginBottom: 8 },
  featureIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E8F5F5', 'background'), marginRight: 13 },
  featureIconText: { color: appColor('#0F7181', 'text'), fontSize: 21, fontWeight: '800' },
  featureCopy: { flex: 1 },
  featureTitle: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '800' },
  featureDescription: { color: appColor('#718493', 'text'), fontSize: 13, lineHeight: 19, marginTop: 3 },
  primaryButton: { minHeight: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#0F7181', 'background'), paddingHorizontal: 18, marginTop: 3 },
  primaryButtonText: { color: appColor('#FFFFFF', 'text'), fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E8F2F4', 'background'), paddingHorizontal: 18 },
  secondaryButtonText: { color: appColor('#0F7181', 'text'), fontSize: 16, fontWeight: '800' },
  privacyCopy: { marginTop: 3, color: appColor('#83939C', 'text'), fontSize: 12, lineHeight: 18, textAlign: 'center' },
  setupNotice: { color: appColor('#9A6530', 'text'), fontSize: 12, lineHeight: 18, textAlign: 'center' },
  formCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 20, padding: 19, borderWidth: 1, borderColor: appColor('#E5EEF2', 'border'), shadowColor: '#103C4A', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  inputLabel: { color: appColor('#29475B', 'text'), fontSize: 13, fontWeight: '700', marginTop: 13, marginBottom: 7 },
  optional: { color: appColor('#8899A2', 'text'), fontWeight: '500' },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, backgroundColor: appColor('#F7FAFB', 'background'), borderWidth: 1, borderColor: appColor('#E2EBEF', 'border'), color: appColor('#17324D', 'text'), fontSize: 15 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 64 },
  showPassword: { position: 'absolute', right: 12, minHeight: 42, justifyContent: 'center', paddingHorizontal: 5 },
  showPasswordText: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700' },
  errorBox: { backgroundColor: appColor('#FFF2F0', 'background'), borderColor: appColor('#F1D0CB', 'border'), borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 7 },
  errorText: { color: appColor('#A34338', 'text'), fontSize: 13, lineHeight: 19 },
  noticeBox: { backgroundColor: appColor('#EEF7F5', 'background'), borderColor: appColor('#CFE8DF', 'border'), borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 7 },
  noticeText: { color: appColor('#276B57', 'text'), fontSize: 13, lineHeight: 19 },
  disabledButton: { opacity: 0.55 },
  switchMode: { minHeight: 46, justifyContent: 'center', alignItems: 'center' },
  switchModeText: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: { marginTop: 'auto', paddingTop: 30, color: appColor('#A0ADB4', 'text'), fontSize: 12, textAlign: 'center' },
});

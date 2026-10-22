import { LocalizedText as Text } from '@/components/localized-text';
import { MedoraLogoMark } from '@/components/medora-logo';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { getSupabaseAuthClient } from '@/services/cloud-sync';
import { forgetLastAccount, getLastAccount, type LastAccount } from '@/services/last-account';
import { tr } from '@/services/localization';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AuthMode = 'welcome' | 'sign-in' | 'sign-up' | 'reset';
type ResetStep = 'request' | 'confirm';
type FieldName = 'name' | 'email' | 'password' | 'confirm' | 'code';
type FieldErrors = Partial<Record<FieldName, string>>;

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_CODE_PATTERN = /^\d{6,10}$/;

const FEATURES: { icon: StudyIconName; title: string }[] = [
  { icon: 'calendar', title: 'Plan your exams' },
  { icon: 'sparkles', title: 'Practise with AI' },
  { icon: 'chart', title: 'Track progress' },
];

/** Brand teal that stays vivid in dark mode. */
const BRAND_TEAL = '#1F64BF';

function describeAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'That email and password do not match. Please try again.';
  if (/already registered|user already exists/i.test(message)) return 'An account already uses this email. Choose Log in instead.';
  if (/password should be at least|password.*characters|weak password/i.test(message)) return 'Choose a longer password (at least 8 characters).';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email from the message we sent, then log in.';
  if (/token has expired|otp.*expired|invalid.*(token|otp)|expired or is invalid/i.test(message)) return 'That code is not valid or has expired. Send a new code and try again.';
  if (/different from the old password|same password/i.test(message)) return 'Choose a password you have not used before.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  if (/network request failed|failed to fetch|network error|timed? ?out/i.test(message)) return 'Could not reach Medora. Check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}

export default function WelcomeScreen() {
  const { configured } = useAuth();
  const { preferences } = useAppSettings();
  const tx = (text: string) => tr(text, preferences.language);
  const reduceMotion = useReducedMotion();
  /** Landing content rises in one piece after another. */
  const rise = (order: number) => (reduceMotion ? undefined : FadeInDown.delay(120 + order * 90).duration(520));

  const [ready, setReady] = useState(false);
  const [lastAccount, setLastAccount] = useState<LastAccount | null>(null);
  const [mode, setMode] = useState<AuthMode>('welcome');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<ResetStep>('request');
  const [resetCode, setResetCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldName | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);
  const codeInput = useRef<TextInput>(null);

  // Someone who has signed in here before goes straight to the password step.
  useEffect(() => {
    let active = true;
    void getLastAccount().then((account) => {
      if (!active) return;
      if (account) {
        setLastAccount(account);
        setEmail(account.email);
        setMode('sign-in');
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  const returning = mode === 'sign-in' && lastAccount !== null && email.trim().toLowerCase() === lastAccount.email;
  const firstName = lastAccount?.name.trim().split(/\s+/)[0] ?? '';
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  function resetMessages() {
    setError('');
    setNotice('');
    setFieldErrors({});
  }

  function chooseMode(next: AuthMode) {
    if (busy) return;
    resetMessages();
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setResetStep('request');
    setResetCode('');
    setMode(next);
  }

  function switchAccount() {
    if (busy) return;
    void forgetLastAccount();
    setLastAccount(null);
    setEmail('');
    chooseMode('welcome');
  }

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  /** Emails a one-time code that lets the student choose a new password. */
  async function sendResetCode() {
    if (busy) return;
    setError('');
    setNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFieldErrors({ email: 'Enter a valid email address.' });
      emailInput.current?.focus();
      return;
    }
    const auth = getSupabaseAuthClient();
    if (!auth) {
      setError('Sign-in is not set up in this version of Medora yet.');
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const { error: authError } = await auth.resetPasswordForEmail(normalizedEmail);
      if (authError) throw authError;
      setResetStep('confirm');
      setResetCode('');
      setPassword('');
      // Deliberately the same message whether or not the account exists.
      setNotice('If an account uses this email, we have sent it a code. Enter the code and choose a new password.');
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    if (busy) return;
    setError('');
    const errors: FieldErrors = {};
    if (!RESET_CODE_PATTERN.test(resetCode)) errors.code = 'Enter the code from the email.';
    if (!passwordLongEnough) errors.password = 'Choose a password with at least 8 characters.';
    setFieldErrors(errors);
    if (errors.code) { codeInput.current?.focus(); return; }
    if (errors.password) { passwordInput.current?.focus(); return; }

    const auth = getSupabaseAuthClient();
    if (!auth) {
      setError('Sign-in is not set up in this version of Medora yet.');
      return;
    }
    setBusy(true);
    try {
      // The code signs the student in; the password is changed straight after.
      const { error: codeError } = await auth.verifyOtp({ email: email.trim().toLowerCase(), token: resetCode, type: 'recovery' });
      if (codeError) throw codeError;
      const { error: passwordError } = await auth.updateUser({ password });
      if (passwordError) throw passwordError;
      setPassword('');
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setError('');
    setNotice('');

    if (!configured) {
      setError('Sign-in is not set up in this version of Medora yet.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const errors: FieldErrors = {};
    if (!EMAIL_PATTERN.test(normalizedEmail)) errors.email = 'Enter a valid email address.';
    if (mode === 'sign-up' && !passwordLongEnough) errors.password = 'Choose a password with at least 8 characters.';
    if (mode === 'sign-in' && !password) errors.password = 'Enter your password.';
    if (mode === 'sign-up' && !errors.password && password !== confirmPassword) errors.confirm = 'The passwords do not match.';
    setFieldErrors(errors);
    if (errors.email) { emailInput.current?.focus(); return; }
    if (errors.password) { passwordInput.current?.focus(); return; }
    if (errors.confirm) { confirmInput.current?.focus(); return; }

    const auth = getSupabaseAuthClient();
    if (!auth) {
      setError('Sign-in is not set up in this version of Medora yet.');
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
          // Only happens when the project requires email confirmation.
          setMode('sign-in');
          setNotice('Check your email for the confirmation link. After confirming it, come back here and log in.');
        }
      } else {
        const { error: authError } = await auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) throw authError;
        setPassword('');
      }
      // On success the auth provider receives the session and opens the app.
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.loading}><MedoraLogoMark size={74} /></View></SafeAreaView>;
  }

  const headline = mode === 'welcome'
    ? tx('Study with confidence.')
    : mode === 'sign-up'
      ? tx('Create your account')
      : mode === 'reset'
        ? tx('Reset your password')
        : returning && firstName ? `${tx('Welcome back')}, ${firstName}` : tx('Welcome back');
  const subtitle = mode === 'welcome'
    ? 'A calmer way to organize your subjects, prepare for exams, and keep track of what you know.'
    : mode === 'sign-up'
      ? 'Your study plans and progress stay with your Medora account.'
      : mode === 'reset'
        ? (resetStep === 'request' ? 'Enter your email and we will send you a code.' : 'Enter the code we emailed you and choose a new password.')
        : returning ? 'Enter your password to continue where you left off.' : 'Sign in to continue to your study space.';

  const inputStyle = (field: FieldName) => [
    styles.input,
    focusedField === field && styles.inputFocused,
    fieldErrors[field] ? styles.inputInvalid : null,
  ];

  const choosingPassword = mode === 'sign-up' || mode === 'reset';

  const emailField = (
    <TextInput
      ref={emailInput}
      style={inputStyle('email')}
      value={email}
      onChangeText={(value) => { setEmail(value); clearFieldError('email'); }}
      onFocus={() => setFocusedField('email')}
      onBlur={() => setFocusedField(null)}
      placeholder="you@example.com"
      placeholderTextColor={appColor('#81919B', 'text')}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      keyboardType="email-address"
      inputMode="email"
      autoComplete="email"
      textContentType="username"
      returnKeyType={mode === 'reset' ? 'send' : 'next'}
      submitBehavior="submit"
      onSubmitEditing={() => { if (mode === 'reset') void sendResetCode(); else passwordInput.current?.focus(); }}
      editable={!busy}
      maxLength={254}
      accessibilityLabel={tx('Email address')}
    />
  );

  const passwordField = (
    <View style={styles.passwordWrap}>
      <TextInput
        ref={passwordInput}
        style={[...inputStyle('password'), styles.passwordInput]}
        value={password}
        onChangeText={(value) => { setPassword(value); clearFieldError('password'); clearFieldError('confirm'); }}
        onFocus={() => setFocusedField('password')}
        onBlur={() => setFocusedField(null)}
        placeholder={choosingPassword ? tx('At least 8 characters') : tx('Your password')}
        placeholderTextColor={appColor('#81919B', 'text')}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete={choosingPassword ? 'new-password' : 'current-password'}
        textContentType={choosingPassword ? 'newPassword' : 'password'}
        passwordRules={choosingPassword ? `minlength: ${MIN_PASSWORD_LENGTH};` : undefined}
        returnKeyType={mode === 'sign-up' ? 'next' : 'go'}
        submitBehavior="submit"
        onSubmitEditing={() => { if (mode === 'sign-up') confirmInput.current?.focus(); else if (mode === 'reset') void confirmReset(); else void submit(); }}
        editable={!busy}
        maxLength={128}
        autoFocus={returning}
        accessibilityLabel={tx('Password')}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? tx('Hide password') : tx('Show password')} onPress={() => setShowPassword((visible) => !visible)} style={styles.showPassword} hitSlop={8}>
        <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {mode === 'welcome' ? (
        // Soft light behind the logo. Outside the scroll view so it reaches the top of the screen.
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.glowLarge} />
          <View style={styles.glowSmall} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            {mode === 'welcome' ? (
              <View style={styles.landing}>
                <View style={styles.landingHero}>
                  <View style={styles.logoRing}>
                    <View style={styles.logoRingInner}>
                      <MedoraLogoMark size={104} animate />
                    </View>
                  </View>
                  <Animated.View entering={rise(0)} style={styles.landingCopy}>
                    <Text style={styles.brand}>Medora</Text>
                    <Text style={styles.landingHeadline} accessibilityRole="header">Study with confidence.</Text>
                    <Text style={styles.landingSubtitle}>Everything for your medical exams, in one calm place.</Text>
                  </Animated.View>

                  <Animated.View entering={rise(1)} style={styles.featureRow}>
                    {FEATURES.map((feature) => (
                      <View key={feature.title} style={styles.featureTile}>
                        <View style={styles.featureIcon}><StudyIcon name={feature.icon} size={20} color="#FFFFFF" /></View>
                        <Text style={styles.featureTitle} numberOfLines={2}>{feature.title}</Text>
                      </View>
                    ))}
                  </Animated.View>
                </View>

                <Animated.View entering={rise(2)} style={styles.landingActions}>
                  <Pressable accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => chooseMode('sign-up')}>
                    <Text style={styles.primaryButtonText}>Create account</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => chooseMode('sign-in')}>
                    <Text style={styles.secondaryButtonText}>I already have an account</Text>
                  </Pressable>
                  {!configured ? <Text style={styles.setupNotice}>Sign-in is not set up in this version of Medora yet.</Text> : null}
                  <Text style={styles.landingFooter}>Private to you. Synced across your devices.</Text>
                </Animated.View>
              </View>
            ) : (
              <>
            <View style={styles.topBar}>
              {!returning ? (
                <Pressable accessibilityRole="button" accessibilityLabel={tx('Back')} onPress={() => chooseMode(mode === 'reset' ? 'sign-in' : 'welcome')} style={styles.backButton} hitSlop={12} disabled={busy}>
                  <StudyIcon name="back" size={18} color={appColor('#507181', 'text')} />
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.hero}>
              <MedoraLogoMark size={68} />
              <Text style={styles.brand}>Medora</Text>
              <Text style={styles.headline} accessibilityRole="header">{headline}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {mode === 'reset' ? (
              <View style={styles.formCard}>
                {notice ? <View accessibilityRole="alert" style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View> : null}
                {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

                {resetStep === 'request' ? (
                  <>
                    <Text style={[styles.inputLabel, styles.firstLabel]}>Email</Text>
                    {emailField}
                    {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
                  </>
                ) : (
                  <>
                    <Text style={[styles.inputLabel, styles.firstLabel]}>Code from the email</Text>
                    <TextInput
                      ref={codeInput}
                      style={[...inputStyle('code'), styles.codeInput]}
                      value={resetCode}
                      onChangeText={(value) => { setResetCode(value.replace(/\D/g, '').slice(0, 10)); clearFieldError('code'); }}
                      onFocus={() => setFocusedField('code')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="000000"
                      placeholderTextColor={appColor('#81919B', 'text')}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      editable={!busy}
                      maxLength={10}
                      autoFocus
                      accessibilityLabel={tx('Code from the email')}
                    />
                    {fieldErrors.code ? <Text style={styles.fieldError}>{fieldErrors.code}</Text> : null}
                    <Text style={styles.inputLabel}>New password</Text>
                    {passwordField}
                    {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
                  </>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || !configured, busy }}
                  disabled={busy || !configured}
                  onPress={() => { if (resetStep === 'request') void sendResetCode(); else void confirmReset(); }}
                  style={({ pressed }) => [styles.primaryButton, styles.submitButton, (busy || !configured) && styles.disabledButton, pressed && styles.pressed]}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{resetStep === 'request' ? 'Send code' : 'Save new password'}</Text>}
                </Pressable>

                {resetStep === 'confirm' ? (
                  <Pressable accessibilityRole="button" onPress={() => { void sendResetCode(); }} style={styles.switchMode} disabled={busy}>
                    <Text style={styles.switchModeText}>Send a new code</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.formCard}>
                {notice ? <View accessibilityRole="alert" style={styles.noticeBox}><Text style={styles.noticeText}>{notice}</Text></View> : null}
                {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

                {mode === 'sign-up' ? (
                  <>
                    <Text style={[styles.inputLabel, styles.firstLabel]}>Name <Text style={styles.optional}>(optional)</Text></Text>
                    <TextInput
                      style={inputStyle('name')}
                      value={fullName}
                      onChangeText={setFullName}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                      placeholder={tx('Your name')}
                      placeholderTextColor={appColor('#81919B', 'text')}
                      autoComplete="name"
                      textContentType="name"
                      autoCapitalize="words"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => emailInput.current?.focus()}
                      editable={!busy}
                      maxLength={80}
                      accessibilityLabel={tx('Your name')}
                    />
                  </>
                ) : null}

                {returning ? (
                  <View style={styles.accountRow}>
                    <View style={styles.accountIcon}><StudyIcon name="check" size={17} color={appColor('#0F7181', 'text')} /></View>
                    <View style={styles.featureCopy}>
                      <Text style={styles.accountLabel}>Signing in as</Text>
                      <Text style={styles.accountEmail} numberOfLines={1}>{lastAccount?.email}</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.inputLabel, mode === 'sign-in' && styles.firstLabel]}>Email</Text>
                    {emailField}
                    {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}
                  </>
                )}

                <Text style={styles.inputLabel}>Password</Text>
                {passwordField}
                {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}
                {mode === 'sign-in' ? (
                  <Pressable accessibilityRole="button" onPress={() => chooseMode('reset')} style={styles.forgotPassword} hitSlop={8} disabled={busy}>
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>
                ) : null}

                {mode === 'sign-up' ? (
                  <>
                    <Text style={styles.inputLabel}>Confirm password</Text>
                    <TextInput
                      ref={confirmInput}
                      style={inputStyle('confirm')}
                      value={confirmPassword}
                      onChangeText={(value) => { setConfirmPassword(value); clearFieldError('confirm'); }}
                      onFocus={() => setFocusedField('confirm')}
                      onBlur={() => setFocusedField(null)}
                      placeholder={tx('Enter the password again')}
                      placeholderTextColor={appColor('#81919B', 'text')}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      returnKeyType="go"
                      onSubmitEditing={() => { void submit(); }}
                      editable={!busy}
                      maxLength={128}
                      accessibilityLabel={tx('Confirm password')}
                    />
                    {fieldErrors.confirm ? <Text style={styles.fieldError}>{fieldErrors.confirm}</Text> : null}
                    <View style={styles.checklist}>
                      <View style={styles.checkRow}>
                        <View style={[styles.checkDot, passwordLongEnough && styles.checkDotDone]}>{passwordLongEnough ? <StudyIcon name="check" size={10} color="#FFFFFF" /> : null}</View>
                        <Text style={[styles.checkText, passwordLongEnough && styles.checkTextDone]}>At least 8 characters</Text>
                      </View>
                      <View style={styles.checkRow}>
                        <View style={[styles.checkDot, passwordsMatch && styles.checkDotDone]}>{passwordsMatch ? <StudyIcon name="check" size={10} color="#FFFFFF" /> : null}</View>
                        <Text style={[styles.checkText, passwordsMatch && styles.checkTextDone]}>Passwords match</Text>
                      </View>
                    </View>
                  </>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || !configured, busy }}
                  disabled={busy || !configured}
                  onPress={() => { void submit(); }}
                  style={({ pressed }) => [styles.primaryButton, styles.submitButton, (busy || !configured) && styles.disabledButton, pressed && styles.pressed]}
                >
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{mode === 'sign-up' ? 'Create account' : 'Log in'}</Text>}
                </Pressable>

                {mode === 'sign-up' ? (
                  <View style={styles.legalRow}>
                    <Text style={styles.staySignedIn}>By creating an account you accept the</Text>
                    <View style={styles.legalLinks}>
                      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal', params: { page: 'terms' } })} hitSlop={8}><Text style={styles.legalLink}>Terms of use</Text></Pressable>
                      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal', params: { page: 'privacy' } })} hitSlop={8}><Text style={styles.legalLink}>Privacy</Text></Pressable>
                      <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal', params: { page: 'health' } })} hitSlop={8}><Text style={styles.legalLink}>Health disclaimer</Text></Pressable>
                    </View>
                  </View>
                ) : null}

                <Text style={styles.staySignedIn}>You stay signed in on this device until you choose to sign out.</Text>

                {returning ? (
                  <Pressable accessibilityRole="button" onPress={switchAccount} style={styles.switchMode} disabled={busy}>
                    <Text style={styles.switchModeText}>Use another account</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => chooseMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')} style={styles.switchMode} disabled={busy}>
                    <Text style={styles.switchModeText}>{mode === 'sign-up' ? 'Already have an account? Log in' : 'New to Medora? Create an account'}</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Text style={styles.footer}>Your account keeps your study data private and synced across your devices.</Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  page: { flexGrow: 1, width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },

  topBar: { minHeight: 44, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: appColor('#507181', 'text'), fontSize: 15, fontWeight: '700' },

  hero: { alignItems: 'center', paddingBottom: 20 },
  brand: { marginTop: 14, color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  headline: { marginTop: 10, color: appColor('#17324D', 'text'), fontSize: 30, lineHeight: 36, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6 },
  subtitle: { marginTop: 9, maxWidth: 390, color: appColor('#718493', 'text'), fontSize: 15, lineHeight: 22, textAlign: 'center' },

  landing: { flex: 1, minHeight: 620 },
  glowLarge: { position: 'absolute', top: -110, alignSelf: 'center', width: 460, height: 460, borderRadius: 230, backgroundColor: 'rgba(15, 113, 129, 0.10)' },
  glowSmall: { position: 'absolute', top: 20, alignSelf: 'center', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(15, 113, 129, 0.10)' },
  landingHero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  logoRing: { padding: 14, borderRadius: 52, backgroundColor: 'rgba(15, 113, 129, 0.10)' },
  logoRingInner: { padding: 12, borderRadius: 44, backgroundColor: 'rgba(15, 113, 129, 0.14)' },
  landingCopy: { alignItems: 'center', marginTop: 26 },
  landingHeadline: { marginTop: 12, color: appColor('#17324D', 'text'), fontSize: 34, lineHeight: 39, fontWeight: '800', textAlign: 'center', letterSpacing: -0.9 },
  landingSubtitle: { marginTop: 10, maxWidth: 300, color: appColor('#718493', 'text'), fontSize: 16, lineHeight: 23, textAlign: 'center' },
  featureRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 10, marginTop: 34 },
  featureTile: { flex: 1, alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 6, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E5EEF2', 'border') },
  featureIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_TEAL },
  featureCopy: { flex: 1 },
  featureTitle: { color: appColor('#17324D', 'text'), fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  landingActions: { gap: 10, paddingBottom: 4 },
  landingFooter: { marginTop: 8, color: appColor('#A0ADB4', 'text'), fontSize: 12, lineHeight: 17, textAlign: 'center' },

  primaryButton: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_TEAL, paddingHorizontal: 18, shadowColor: '#0E5968', shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: appColor('#0F7181', 'text'), fontSize: 15, fontWeight: '700' },
  submitButton: { marginTop: 20 },
  disabledButton: { opacity: 0.55 },
  setupNotice: { color: appColor('#9A6530', 'text'), fontSize: 12, lineHeight: 18, textAlign: 'center' },

  formCard: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 22, padding: 20, borderWidth: 1, borderColor: appColor('#E5EEF2', 'border'), shadowColor: '#103C4A', shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  inputLabel: { color: appColor('#29475B', 'text'), fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 7 },
  firstLabel: { marginTop: 0 },
  optional: { color: appColor('#8899A2', 'text'), fontWeight: '500' },
  input: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, backgroundColor: appColor('#F7FAFB', 'background'), borderWidth: 1.5, borderColor: appColor('#E2EBEF', 'border'), color: appColor('#17324D', 'text'), fontSize: 16 },
  inputFocused: { borderColor: '#0F7181', backgroundColor: appColor('#FFFFFF', 'background') },
  inputInvalid: { borderColor: '#D9796D' },
  fieldError: { color: appColor('#A34338', 'text'), fontSize: 12, lineHeight: 17, marginTop: 6 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 68 },
  showPassword: { position: 'absolute', right: 10, minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  forgotPassword: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', marginTop: 4 },
  forgotPasswordText: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700' },
  codeInput: { fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center' },
  showPasswordText: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700' },

  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: appColor('#F2F8FA', 'background') },
  accountIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E1F3F7', 'background') },
  accountLabel: { color: appColor('#718493', 'text'), fontSize: 11, fontWeight: '700' },
  accountEmail: { color: appColor('#17324D', 'text'), fontSize: 14, fontWeight: '700', marginTop: 2 },

  checklist: { gap: 7, marginTop: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: appColor('#C6D5DC', 'border'), alignItems: 'center', justifyContent: 'center' },
  checkDotDone: { borderColor: '#2F8F74', backgroundColor: '#2F8F74' },
  checkText: { color: appColor('#718493', 'text'), fontSize: 12 },
  checkTextDone: { color: appColor('#276B57', 'text'), fontWeight: '600' },

  errorBox: { backgroundColor: appColor('#FFF2F0', 'background'), borderColor: appColor('#F1D0CB', 'border'), borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { color: appColor('#A34338', 'text'), fontSize: 13, lineHeight: 19 },
  noticeBox: { backgroundColor: appColor('#EEF7F5', 'background'), borderColor: appColor('#CFE8DF', 'border'), borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  noticeText: { color: appColor('#276B57', 'text'), fontSize: 13, lineHeight: 19 },

  staySignedIn: { marginTop: 12, color: appColor('#83939C', 'text'), fontSize: 12, lineHeight: 17, textAlign: 'center' },
  legalRow: { alignItems: 'center', gap: 4, marginTop: 4 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 4 },
  legalLink: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  switchMode: { minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  switchModeText: { color: appColor('#0F7181', 'text'), fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footer: { marginTop: 'auto', paddingTop: 26, color: appColor('#A0ADB4', 'text'), fontSize: 12, lineHeight: 17, textAlign: 'center' },
});

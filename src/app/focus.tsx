import { LocalizedText as Text } from '@/components/localized-text';
import { appColor } from '@/constants/adaptive-color';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addStudyActivity, getStudyPreferences, updateStudyActivity } from '../services/storage';
import { useAuth } from '../services/auth-context';
import { clearFocusSession, readFocusSession, writeFocusSession, type FocusSessionState } from '../services/focus-session';
import type { StudyConfidence } from '../types/study';

function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
function remainingFor(session: FocusSessionState) {
  return session.pausedRemainingSeconds !== null ? session.pausedRemainingSeconds : Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
}

export default function FocusScreen() {
  const { session: authSession } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[]; subjectName?: string | string[]; minutes?: string | string[] }>();
  const [session, setSession] = useState<FocusSessionState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedActivityId, setSavedActivityId] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<StudyConfidence | null>(null);
  const [preferredRoutine, setPreferredRoutine] = useState<[number, number]>([25, 5]);
  const transitionLock = useRef(false);
  const transitionFailedAt = useRef<number | null>(null);

  useEffect(() => {
    void getStudyPreferences().then((preferences) => setPreferredRoutine([preferences.sessionLengthMinutes, preferences.breakDurationMinutes]));
  }, []);

  useEffect(() => {
    let active = true;
    void readFocusSession().then(async (stored) => {
      if (!active) return;
      if (stored) {
        if (stored.userId !== authSession?.user.id) {
          await clearFocusSession();
          setReady(true);
          return;
        }
        setSession(stored);
        setRemaining(remainingFor(stored));
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [authSession?.user.id]);

  useEffect(() => {
    if (!session) return;
    void writeFocusSession(session).catch((error) => console.warn('Could not save active focus session:', error));
    setRemaining(remainingFor(session));
  }, [session]);

  useEffect(() => {
    if (!session || session.pausedRemainingSeconds !== null || savedActivityId !== null) return;
    const tick = () => {
      const secondsLeft = remainingFor(session);
      setRemaining(secondsLeft);
      if (secondsLeft > 0 || transitionLock.current || transitionFailedAt.current === session.endsAt) return;
      transitionLock.current = true;
      const now = Date.now();
      const next: FocusSessionState = session.phase === 'focus'
        ? { ...session, phase: session.breakMinutes ? 'break' : 'focus', completedWorkSeconds: session.completedWorkSeconds + session.workMinutes * 60,
            cyclesCompleted: session.cyclesCompleted + 1, endsAt: now + (session.breakMinutes ? session.breakMinutes * 60_000 : session.workMinutes * 60_000) }
        : { ...session, phase: 'focus', endsAt: now + session.workMinutes * 60_000 };
      void writeFocusSession(next).then(() => {
        setSession(next);
        transitionFailedAt.current = null;
        if (session.phase === 'focus') Alert.alert('Focus interval complete', session.breakMinutes ? 'Your work time is saved. Take a short break.' : 'Your next focus interval is ready.');
        else Alert.alert('Break finished', 'Ready for the next focus interval?');
      }).catch(() => {
        transitionFailedAt.current = session.endsAt;
        Alert.alert('Timer could not be saved', 'The current interval is still on screen. Finish and save it when ready.');
      }).finally(() => { transitionLock.current = false; });
    };
    tick();
    const timer = setInterval(tick, 1000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); appState.remove(); };
  }, [session, savedActivityId]);

  async function start(workMinutes: number, breakMinutes: number) {
    const topicId = param(params.id);
    const topicName = param(params.name) || 'Study session';
    const next: FocusSessionState = {
      version: 1, userId: authSession?.user.id ?? '', phase: 'focus', topicId, topicName,
      subjectId: param(params.subjectId), subjectName: param(params.subjectName),
      workMinutes, breakMinutes, endsAt: Date.now() + workMinutes * 60_000,
      pausedRemainingSeconds: null, completedWorkSeconds: 0, cyclesCompleted: 0,
    };
    try {
      await writeFocusSession(next);
      setSession(next);
    } catch {
      Alert.alert('Could not save timer', 'Please try again so the session can resume if you leave the app.');
    }
  }

  async function togglePause() {
    if (!session) return;
    const next = session.pausedRemainingSeconds === null
      ? { ...session, pausedRemainingSeconds: remainingFor(session) }
      : { ...session, endsAt: Date.now() + session.pausedRemainingSeconds * 1000, pausedRemainingSeconds: null };
    try { await writeFocusSession(next); setSession(next); }
    catch { Alert.alert('Could not save timer', 'The timer state was not changed. Try again.'); }
  }

  async function finishSession() {
    if (!session || saving) return;
    const seconds = Math.max(0, session.completedWorkSeconds + (session.phase === 'focus' ? session.workMinutes * 60 - remainingFor(session) : 0));
    if (seconds < 20) {
      Alert.alert('No study time to save yet', 'Complete a little more of the focus interval before saving it.');
      return;
    }
    const activityId = Date.now();
    setSaving(true);
    try {
      await addStudyActivity({ id: activityId, topicId: session.topicId, topicName: session.topicName, activity: 'focus', completedAt: new Date().toISOString(), durationSeconds: seconds, questionCount: 0 });
      await clearFocusSession().catch((error) => console.warn('The finished timer could not be cleared:', error));
      setSavedActivityId(activityId);
      setSession(null);
    } catch {
      Alert.alert('Session not saved', 'Your timer is still here. Try saving again when the connection or storage is ready.');
    } finally { setSaving(false); }
  }

  async function rateConfidence(value: StudyConfidence) {
    if (!savedActivityId) return;
    setSaving(true);
    try { await updateStudyActivity(savedActivityId, { confidence: value }); setConfidence(value); }
    catch { Alert.alert('Could not save rating', 'The focused study time is already saved. Try rating it again later.'); }
    finally { setSaving(false); }
  }

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');

  return <SafeAreaView style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>‹  Back</Text></Pressable>
      <Text style={styles.eyebrow}>FOCUS MODE</Text>
      <Text style={styles.title}>One thing at a time</Text>
      {!ready ? <ActivityIndicator color={appColor('#327E9D', 'text')} style={{ marginTop: 40 }} /> : savedActivityId ? <View style={styles.card}>
        <Text style={styles.phase}>SESSION SAVED</Text><Text style={styles.sessionTitle}>Nice work.</Text>
        <Text style={styles.copy}>Focused study time was saved and will sync with her account.</Text>
        <Text style={styles.confidenceTitle}>{confidence ? 'How it felt' : 'How confident do you feel about this topic now?'}</Text>
        <View style={styles.ratingRow}>{([['low', 'Still unsure'], ['medium', 'Getting there'], ['high', 'Confident']] as const).map(([value, label]) => <Pressable key={value} disabled={saving} onPress={() => { void rateConfidence(value); }} style={[styles.rating, confidence === value && styles.ratingSelected]}><Text style={[styles.ratingText, confidence === value && styles.ratingTextSelected]}>{label}</Text></Pressable>)}</View>
        <Pressable style={styles.primary} onPress={() => router.replace('/(tabs)')}><Text style={styles.primaryText}>Done</Text></Pressable>
      </View> : session ? <View style={styles.card}>
        <Text style={styles.phase}>{session.phase === 'focus' ? 'FOCUS INTERVAL' : 'SHORT BREAK'}</Text>
        <Text style={styles.sessionTitle}>{session.topicName}</Text>
        {!!session.subjectName && <Text style={styles.subject}>{session.subjectName}</Text>}
        <Text style={styles.timer}>{minutes}:{seconds}</Text>
        <Text style={styles.copy}>{session.phase === 'focus' ? 'Keep your attention on this topic. You can pause any time.' : 'Step away for a moment. Your focus time has been kept.'}</Text>
        <Text style={styles.savedTime}>{Math.floor(session.completedWorkSeconds / 60)} focused min · {session.cyclesCompleted} interval{session.cyclesCompleted === 1 ? '' : 's'} completed</Text>
        <View style={styles.actionRow}><Pressable style={styles.secondary} onPress={() => { void togglePause(); }}><Text style={styles.secondaryText}>{session.pausedRemainingSeconds === null ? 'Pause' : 'Resume'}</Text></Pressable><Pressable disabled={saving} style={styles.primary} onPress={() => { void finishSession(); }}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Finish and save'}</Text></Pressable></View>
        <Pressable style={styles.toolsLink} onPress={() => router.push({ pathname: '/subject/topic/study', params: { id: session.topicId, name: session.topicName, subjectId: session.subjectId } })}><Text style={styles.toolsText}>Open study tools</Text></Pressable>
      </View> : <View style={styles.card}>
        <Text style={styles.phase}>PICK A ROUTINE</Text>
        <Text style={styles.sessionTitle}>{param(params.name) || 'Ready when you are'}</Text>
        {!!param(params.subjectName) && <Text style={styles.subject}>{param(params.subjectName)}</Text>}
        <Text style={styles.copy}>Study for a set interval, then pause for a short break. Your completed focus time is saved to the selected topic.</Text>
        <View style={styles.routineList}>{[preferredRoutine, [25, 5], [45, 10], [50, 10]].filter((routine, index, all) => all.findIndex((item) => item[0] === routine[0] && item[1] === routine[1]) === index).map(([work, rest]) => <Pressable key={`${work}-${rest}`} style={styles.routine} onPress={() => { void start(work, rest); }}><View><Text style={styles.routineTitle}>{work} min focus{work === preferredRoutine[0] && rest === preferredRoutine[1] ? ' · Preferred' : ''}</Text><Text style={styles.routineCopy}>then {rest} min break</Text></View><Text style={styles.arrow}>Start  ›</Text></Pressable>)}</View>
        <Text style={styles.privacyNote}>This timer helps structure study time. iOS does not let MedExam block other apps without Apple Screen Time approval.</Text>
      </View>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: appColor('#F5FAFC', 'background') }, content: { flex: 1, padding: 22, paddingBottom: 32 }, back: { marginTop: 3, marginBottom: 28 }, backText: { color: appColor('#327E9D', 'text'), fontSize: 15, fontWeight: '700' }, eyebrow: { color: appColor('#448EA8', 'text'), fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { color: appColor('#17324D', 'text'), fontSize: 30, fontWeight: '800', marginTop: 6, marginBottom: 20 }, card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 23, padding: 22, borderWidth: 1, borderColor: appColor('#E3EEF3', 'border') }, phase: { color: appColor('#4E9BB1', 'text'), fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, sessionTitle: { color: appColor('#17324D', 'text'), fontSize: 21, lineHeight: 28, fontWeight: '800', marginTop: 8 }, subject: { color: appColor('#758A98', 'text'), fontSize: 14, marginTop: 4 }, timer: { color: appColor('#0F7181', 'text'), fontSize: 68, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center', marginTop: 28, marginBottom: 8 }, copy: { color: appColor('#748592', 'text'), fontSize: 14, lineHeight: 21, marginTop: 10 }, savedTime: { color: appColor('#327E9D', 'text'), textAlign: 'center', fontSize: 13, fontWeight: '700', marginTop: 20 }, actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 }, primary: { flex: 1, minHeight: 50, borderRadius: 13, backgroundColor: appColor('#327E9D', 'background'), alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 14 }, primaryText: { color: appColor('#FFFFFF', 'text'), fontSize: 14, fontWeight: '800' }, secondary: { flex: 1, minHeight: 50, borderRadius: 13, backgroundColor: appColor('#E8F1F5', 'background'), alignItems: 'center', justifyContent: 'center', marginTop: 18 }, secondaryText: { color: appColor('#327E9D', 'text'), fontSize: 14, fontWeight: '800' }, toolsLink: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 9 }, toolsText: { color: appColor('#327E9D', 'text'), fontSize: 14, fontWeight: '700' }, routineList: { gap: 10, marginTop: 20 }, routine: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: appColor('#F7FBFD', 'background'), borderWidth: 1, borderColor: appColor('#E3EEF3', 'border'), borderRadius: 15, paddingHorizontal: 15, paddingVertical: 12 }, routineTitle: { color: appColor('#17324D', 'text'), fontWeight: '800', fontSize: 15 }, routineCopy: { color: appColor('#7A8E9A', 'text'), fontSize: 12, marginTop: 3 }, arrow: { color: appColor('#327E9D', 'text'), fontWeight: '800' }, privacyNote: { color: appColor('#8799A4', 'text'), fontSize: 11, lineHeight: 16, marginTop: 16 }, confidenceTitle: { color: appColor('#315267', 'text'), fontSize: 14, fontWeight: '800', marginTop: 24 }, ratingRow: { gap: 8, marginTop: 10 }, rating: { minHeight: 43, borderWidth: 1, borderColor: appColor('#DDECF3', 'border'), borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F9FCFE', 'background') }, ratingSelected: { borderColor: appColor('#327E9D', 'border'), backgroundColor: appColor('#E4F4F8', 'background') }, ratingText: { color: appColor('#66808F', 'text'), fontWeight: '700' }, ratingTextSelected: { color: appColor('#1E647A', 'text') },
});

import { DonutChart } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { IconChip } from '@/components/study/icon-chip';
import { Chips, ScreenBar } from '@/components/study/study-ui';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { useAuth } from '@/services/auth-context';
import { clearFocusSession, readFocusSession, writeFocusSession, type FocusSessionState } from '@/services/focus-session';
import { addStudyActivity, getStudyPreferences, updateStudyActivity } from '@/services/storage';
import type { StudyConfidence } from '@/types/study';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');

function remainingFor(session: FocusSessionState) {
  return session.pausedRemainingSeconds !== null ? session.pausedRemainingSeconds : Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
}

/**
 * The focus timer: study in set intervals with short breaks. The timer
 * keeps running if the app is closed, and the focused time is saved to
 * the topic when the session is finished.
 */
export default function FocusScreen() {
  const { session: authSession } = useAuth();
  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[]; subjectId?: string | string[]; subjectName?: string | string[] }>();

  const [session, setSession] = useState<FocusSessionState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedActivityId, setSavedActivityId] = useState<number | null>(null);
  const [savedMinutes, setSavedMinutes] = useState(0);
  const [confidence, setConfidence] = useState<StudyConfidence | null>(null);
  const [preferredRoutine, setPreferredRoutine] = useState<[number, number]>([25, 5]);
  const [routine, setRoutine] = useState('');
  const transitionLock = useRef(false);
  const transitionFailedAt = useRef<number | null>(null);

  useEffect(() => {
    void getStudyPreferences().then((study) => setPreferredRoutine([study.sessionLengthMinutes, study.breakDurationMinutes])).catch(() => undefined);
  }, []);

  // A timer that was running when the app closed is picked up again.
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
    }).catch(() => { if (active) setReady(true); });
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
        ? {
          ...session, phase: session.breakMinutes ? 'break' : 'focus', completedWorkSeconds: session.completedWorkSeconds + session.workMinutes * 60,
          cyclesCompleted: session.cyclesCompleted + 1, endsAt: now + (session.breakMinutes ? session.breakMinutes * 60_000 : session.workMinutes * 60_000),
        }
        : { ...session, phase: 'focus', endsAt: now + session.workMinutes * 60_000 };
      void writeFocusSession(next).then(() => {
        setSession(next);
        transitionFailedAt.current = null;
        if (session.phase === 'focus') {
          Alert.alert(L('Focus interval complete', 'Fokusintervallet er ferdig'), session.breakMinutes
            ? L('Your study time is saved. Take a short break.', 'Studietiden er lagret. Ta en kort pause.')
            : L('Your next focus interval is ready.', 'Neste fokusintervall er klart.'));
        } else {
          Alert.alert(L('Break finished', 'Pausen er over'), L('Ready for the next focus interval?', 'Klar for neste fokusintervall?'));
        }
      }).catch(() => {
        transitionFailedAt.current = session.endsAt;
        Alert.alert(L('The timer could not be saved', 'Timeren kunne ikke lagres'), L('The current interval is still on screen. Finish and save it when you are ready.', 'Intervallet står fortsatt på skjermen. Avslutt og lagre når du er klar.'));
      }).finally(() => { transitionLock.current = false; });
    };
    tick();
    const timer = setInterval(tick, 1000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); appState.remove(); };
    // The alert texts follow the language at the moment the interval ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, savedActivityId]);

  async function start(workMinutes: number, breakMinutes: number) {
    const next: FocusSessionState = {
      version: 1, userId: authSession?.user.id ?? '', phase: 'focus', topicId: param(params.id), topicName: param(params.name) || L('Study session', 'Studieøkt'),
      subjectId: param(params.subjectId), subjectName: param(params.subjectName),
      workMinutes, breakMinutes, endsAt: Date.now() + workMinutes * 60_000,
      pausedRemainingSeconds: null, completedWorkSeconds: 0, cyclesCompleted: 0,
    };
    try {
      await writeFocusSession(next);
      setSession(next);
    } catch {
      Alert.alert(L('Could not start the timer', 'Kunne ikke starte timeren'), L('Try again, so the session can continue if you leave the app.', 'Prøv igjen, slik at økten kan fortsette om du forlater appen.'));
    }
  }

  async function togglePause() {
    if (!session) return;
    const next = session.pausedRemainingSeconds === null
      ? { ...session, pausedRemainingSeconds: remainingFor(session) }
      : { ...session, endsAt: Date.now() + session.pausedRemainingSeconds * 1000, pausedRemainingSeconds: null };
    try {
      await writeFocusSession(next);
      setSession(next);
    } catch {
      Alert.alert(L('The timer could not be saved', 'Timeren kunne ikke lagres'), L('Nothing was changed. Try again.', 'Ingenting ble endret. Prøv igjen.'));
    }
  }

  async function finishSession() {
    if (!session || saving) return;
    const seconds = Math.max(0, session.completedWorkSeconds + (session.phase === 'focus' ? session.workMinutes * 60 - remainingFor(session) : 0));
    if (seconds < 20) {
      Alert.alert(L('Nothing to save yet', 'Ingenting å lagre ennå'), L('Study a little longer before you save the session, or discard it.', 'Studer litt lenger før du lagrer økten, eller forkast den.'), [
        { text: L('Keep going', 'Fortsett'), style: 'cancel' },
        { text: L('Discard', 'Forkast'), style: 'destructive', onPress: () => { void clearFocusSession().finally(() => setSession(null)); } },
      ]);
      return;
    }
    const activityId = Date.now();
    setSaving(true);
    try {
      await addStudyActivity({ id: activityId, topicId: session.topicId, topicName: session.topicName, activity: 'focus', completedAt: new Date().toISOString(), durationSeconds: seconds, questionCount: 0 });
      await clearFocusSession().catch((error) => console.warn('The finished timer could not be cleared:', error));
      setSavedMinutes(Math.max(1, Math.round(seconds / 60)));
      setSavedActivityId(activityId);
      setSession(null);
    } catch {
      Alert.alert(L('The session was not saved', 'Økten ble ikke lagret'), L('Your timer is still here. Try saving again.', 'Timeren står fortsatt her. Prøv å lagre igjen.'));
    } finally {
      setSaving(false);
    }
  }

  async function rateConfidence(value: StudyConfidence) {
    if (!savedActivityId || saving) return;
    setSaving(true);
    try {
      await updateStudyActivity(savedActivityId, { confidence: value });
      setConfidence(value);
    } catch {
      Alert.alert(L('Could not save the rating', 'Kunne ikke lagre vurderingen'), L('Your study time is already saved. You can try rating again.', 'Studietiden er allerede lagret. Du kan prøve å vurdere på nytt.'));
    } finally {
      setSaving(false);
    }
  }

  const clock = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const topicName = session?.topicName ?? param(params.name);
  const subjectName = session?.subjectName ?? param(params.subjectName);

  const routines = [preferredRoutine, [25, 5], [45, 10], [50, 10]]
    .filter((item, index, all) => all.findIndex((other) => other[0] === item[0] && other[1] === item[1]) === index);
  const chosen = routines.find((item) => `${item[0]}-${item[1]}` === routine) ?? routines[0];

  let body;
  if (!ready) {
    body = <View style={styles.state}><ActivityIndicator color={palette.accent} /></View>;
  } else if (savedActivityId) {
    const levels: { value: StudyConfidence; label: string }[] = [
      { value: 'low', label: L('Still unsure', 'Fortsatt usikker') },
      { value: 'medium', label: L('Getting there', 'På vei') },
      { value: 'high', label: L('Confident', 'Trygg') },
    ];
    body = (
      <>
        <View style={[p.card, styles.centerCard]}>
          <View style={[styles.doneIcon, { backgroundColor: palette.accent }]}><StudyIcon name="check" size={26} color="#FFFFFF" /></View>
          <Text style={styles.cardTitle}>{L('Session saved', 'Økten er lagret')}</Text>
          <Text style={[p.body, styles.centered]}>{L(`${savedMinutes} min of focused study was added to your progress.`, `${savedMinutes} min fokusert studietid er lagt til i fremgangen din.`)}</Text>
        </View>
        <View style={p.card}>
          <Text style={styles.label}>{confidence ? L('Saved. This helps the AI plan your next step.', 'Lagret. Dette hjelper AI med å planlegge neste steg.') : L('How confident do you feel about this topic now?', 'Hvor trygg føler du deg på dette temaet nå?')}</Text>
          <View style={styles.levels}>
            {levels.map((level) => {
              const selected = confidence === level.value;
              return (
                <Pressable key={level.value} accessibilityRole="button" accessibilityState={{ selected }} disabled={saving} onPress={() => { void rateConfidence(level.value); }} style={({ pressed }) => [styles.level, selected && { backgroundColor: palette.accent, borderColor: palette.accent }, pressed && p.pressed]}>
                  <Text style={[styles.levelText, selected && styles.levelTextOn]}>{level.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [p.button, styles.big, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={styles.bigText}>{L('Done', 'Ferdig')}</Text>
        </Pressable>
      </>
    );
  } else if (session) {
    const paused = session.pausedRemainingSeconds !== null;
    const total = (session.phase === 'focus' ? session.workMinutes : session.breakMinutes || session.workMinutes) * 60;
    const done = Math.max(0, Math.min(100, ((total - remaining) / Math.max(1, total)) * 100));
    const ringColor = session.phase === 'focus' ? palette.accent : palette.series[2];
    body = (
      <>
        <View style={[p.card, styles.centerCard]}>
          <Text style={[styles.phase, { color: ringColor }]}>{paused ? L('PAUSED', 'PÅ PAUSE') : session.phase === 'focus' ? L('FOCUS', 'FOKUS') : L('BREAK', 'PAUSE')}</Text>
          <View accessible accessibilityRole="timer" accessibilityLabel={L(`${Math.floor(remaining / 60)} minutes and ${remaining % 60} seconds left`, `${Math.floor(remaining / 60)} minutter og ${remaining % 60} sekunder igjen`)}>
            <DonutChart size={236} strokeWidth={14} trackColor={palette.track} segments={[{ key: 'done', value: done, color: ringColor }, { key: 'left', value: 100 - done, color: palette.track }]}>
              <Text style={styles.clock}>{clock}</Text>
              <Text style={p.small}>{session.phase === 'focus' ? L('left of this interval', 'igjen av intervallet') : L('left of the break', 'igjen av pausen')}</Text>
            </DonutChart>
          </View>
          <Text style={[p.body, styles.centered]}>{session.phase === 'focus'
            ? L('Keep your attention on this topic. You can pause at any time.', 'Hold oppmerksomheten på dette temaet. Du kan sette på pause når som helst.')
            : L('Step away for a moment. Your study time is kept.', 'Ta en liten pause. Studietiden din er tatt vare på.')}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{Math.floor(session.completedWorkSeconds / 60)}</Text><Text style={styles.statLabel}>{L('Minutes done', 'Minutter gjort')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{session.cyclesCompleted}</Text><Text style={styles.statLabel}>{L('Intervals done', 'Intervaller gjort')}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{session.workMinutes}/{session.breakMinutes}</Text><Text style={styles.statLabel}>{L('Focus / break', 'Fokus / pause')}</Text></View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => { void togglePause(); }} style={({ pressed }) => [p.outlineButton, styles.action, styles.buttonRow, pressed && p.pressed]}>
            <StudyIcon name={paused ? 'play' : 'clock'} size={15} color={palette.accent} />
            <Text style={p.outlineButtonText}>{paused ? L('Continue', 'Fortsett') : L('Pause', 'Pause')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void finishSession(); }} style={({ pressed }) => [p.button, styles.action, { backgroundColor: palette.accent }, (pressed || saving) && p.pressed]}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={p.buttonText}>{L('Finish and save', 'Avslutt og lagre')}</Text>}
          </Pressable>
        </View>

        {session.topicId ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/subject/topic/[id]', params: { id: session.topicId, name: session.topicName, subjectId: session.subjectId } })} style={({ pressed }) => [p.card, p.row, pressed && p.pressed]}>
            <IconChip name="book" />
            <View style={p.grow}>
              <Text style={styles.rowTitle}>{L('Open the topic', 'Åpne temaet')}</Text>
              <Text style={p.small}>{L('Flashcards, quiz and Active Recall while the timer runs.', 'Flashcards, quiz og Active Recall mens timeren går.')}</Text>
            </View>
            <StudyIcon name="chevron" size={12} color={ink.muted} />
          </Pressable>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <View style={p.card}>
          <View style={p.row}>
            <IconChip name="timer" />
            <View style={p.grow}>
              <Text style={styles.rowTitle}>{L('Choose your rhythm', 'Velg rytmen din')}</Text>
              <Text style={p.small}>{L('Study for an interval, then take a short break.', 'Studer i et intervall, og ta så en kort pause.')}</Text>
            </View>
          </View>
          <Chips
            value={`${chosen[0]}-${chosen[1]}`}
            onChange={setRoutine}
            items={routines.map(([work, rest]) => ({ key: `${work}-${rest}`, label: `${work} + ${rest} min` }))}
          />
          <Text style={p.small}>{chosen[0] === preferredRoutine[0] && chosen[1] === preferredRoutine[1]
            ? L(`${chosen[0]} min focus and ${chosen[1]} min break, from your study preferences.`, `${chosen[0]} min fokus og ${chosen[1]} min pause, fra studiepreferansene dine.`)
            : L(`${chosen[0]} min focus, then ${chosen[1]} min break.`, `${chosen[0]} min fokus, så ${chosen[1]} min pause.`)}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void start(chosen[0], chosen[1]); }} style={({ pressed }) => [p.button, styles.big, styles.buttonRow, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <StudyIcon name="play" size={15} color="#FFFFFF" /><Text style={styles.bigText}>{L('Start focus', 'Start fokus')}</Text>
          </Pressable>
        </View>
        <Text style={[p.small, styles.centered]}>{L('The timer keeps going if you leave the app. Your focused time is saved to the topic when you finish.', 'Timeren fortsetter om du forlater appen. Den fokuserte tiden lagres på temaet når du avslutter.')}</Text>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenBar backLabel={L('Back', 'Tilbake')} />
        <View>
          <Text style={styles.title} accessibilityRole="header">{L('Focus', 'Fokus')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{[topicName, subjectName].filter(Boolean).join(' · ') || L('One thing at a time', 'Én ting om gangen')}</Text>
        </View>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 36, gap: 14 },
  title: { color: ink.primary, fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: ink.secondary, fontSize: 14, marginTop: 2 },
  state: { alignItems: 'center', paddingVertical: 60 },
  centered: { textAlign: 'center' },
  centerCard: { alignItems: 'center', paddingVertical: 24 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  phase: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  clock: { color: ink.primary, fontSize: 54, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border') },
  statValue: { color: ink.primary, fontSize: 19, fontWeight: '800' },
  statLabel: { color: ink.muted, fontSize: 11, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 52 },
  rowTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  big: { minHeight: 56, borderRadius: 18 },
  bigText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  doneIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: ink.primary, fontSize: 22, fontWeight: '800' },
  label: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  levels: { flexDirection: 'row', gap: 8 },
  level: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 6, borderWidth: 1, borderColor: appColor('#D8E6EC', 'border'), backgroundColor: appColor('#FFFFFF', 'background') },
  levelText: { color: ink.secondary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  levelTextOn: { color: '#FFFFFF' },
});

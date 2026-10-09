import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { ui } from '@/constants/ui';
import { useAppSettings } from '@/services/app-settings-context';
import { buildCardQueue, type CardOrder } from '@/services/flashcard-session';
import { formatReviewInterval } from '@/services/localization';
import { previewReviewIntervals, scheduleReview, type ReviewRating } from '@/services/spaced-repetition';
import { addFlashcardReview, addStudyActivity, getFlashcards, getTopicsForSubject, updateFlashcard } from '@/services/storage';
import type { Flashcard, StudyActivity } from '@/types/study';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '');
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const RATING_COLOR: Record<ReviewRating, string> = { again: '#D03B3B', hard: '#C98500', good: '#2A78D6', easy: '#0CA30C' };

type Counts = Record<ReviewRating, number>;
type TopicTotals = { topicName: string; counts: Counts };
const noCounts = (): Counts => ({ again: 0, hard: 0, good: 0, easy: 0 });

/**
 * The flashcard session. Each card is shown, turned over and rated; the
 * rating decides when the card comes back. Opened either for the cards that
 * are due (one topic or all topics) or as extra practice on one topic.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[]; name?: string | string[]; subjectId?: string | string[]; all?: string | string[];
    mode?: string | string[]; count?: string | string[]; order?: string | string[]; answerFirst?: string | string[];
    /** A subject id: review the due cards from every topic in that subject. */
    subject?: string | string[];
  }>();
  const topicId = param(params.id);
  const subjectFilter = param(params.subject);
  const allTopics = param(params.all) === '1' || subjectFilter !== '';
  const practice = param(params.mode) === 'practice' && !allTopics;
  const order = (['smart', 'ordered', 'shuffled'].includes(param(params.order)) ? param(params.order) : 'smart') as CardOrder;
  const count = Number(param(params.count)) || 0;
  const answerFirst = param(params.answerFirst) === '1';

  const { preferences } = useAppSettings();
  const language = preferences.language;
  const L = (en: string, no: string) => (language === 'no' ? no : en);
  const palette = useProgressPalette();
  const title = subjectFilter ? param(params.name) || L('Due flashcards', 'Flashcards som har forfalt') : allTopics ? L('Due flashcards', 'Flashcards som har forfalt') : param(params.name) || 'Flashcards';

  const [queue, setQueue] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [totals, setTotals] = useState<Counts>(noCounts);
  const [remainingDue, setRemainingDue] = useState(0);
  const [failed, setFailed] = useState(false);

  const startedAt = useRef(Date.now());
  const byTopic = useRef(new Map<string, TopicTotals>());
  const summarySaved = useRef(false);

  /** All flashcards, or only those in the chosen subject's topics. */
  const loadCards = useCallback(async () => {
    const cards = await getFlashcards();
    if (!subjectFilter) return cards;
    const topicIds = new Set((await getTopicsForSubject(subjectFilter)).map((topic) => String(topic.id)));
    return cards.filter((card) => topicIds.has(String(card.topicId)));
  }, [subjectFilter]);

  const load = useCallback(async () => {
    try {
      const cards = await loadCards();
      setQueue(buildCardQueue(cards, { topicId: allTopics ? undefined : topicId, mode: practice ? 'practice' : 'due', order, count }));
      setIndex(0);
      setRevealed(false);
      setFinished(false);
      setTotals(noCounts());
      setFailed(false);
      byTopic.current = new Map();
      summarySaved.current = false;
      startedAt.current = Date.now();
    } catch (error) {
      console.warn('Could not load flashcards for the session:', error);
      setFailed(true);
      setQueue([]);
    }
  }, [allTopics, topicId, practice, order, count, loadCards]);

  useEffect(() => { void load(); }, [load]);

  /** Records the session once, as one study activity per topic that had cards rated. */
  const saveSummary = useCallback(async () => {
    if (summarySaved.current || byTopic.current.size === 0) return;
    summarySaved.current = true;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const completedAt = new Date().toISOString();
    let position = 0;
    for (const [id, entry] of byTopic.current.entries()) {
      const { again, hard, good, easy } = entry.counts;
      const activity: StudyActivity = {
        id: Date.now() + position,
        topicId: id,
        topicName: entry.topicName,
        activity: 'review',
        completedAt,
        // The time belongs to the whole session, so it is counted on one topic only.
        durationSeconds: position === 0 ? durationSeconds : 0,
        questionCount: again + hard + good + easy,
        againCount: again,
        hardCount: hard,
        goodCount: good,
        easyCount: easy,
      };
      position += 1;
      try {
        await addStudyActivity(activity);
      } catch (error) {
        console.warn('Could not save the flashcard session summary:', error);
      }
    }
  }, []);

  // Leaving part-way still records the cards that were rated.
  useEffect(() => () => { void saveSummary(); }, [saveSummary]);

  const card = queue?.[index];

  async function rate(rating: ReviewRating) {
    if (!card || saving) return;
    setSaving(true);
    try {
      const reviewedAt = new Date();
      const schedule = scheduleReview(card, rating, reviewedAt);
      await addFlashcardReview({ id: `${card.id}-${reviewedAt.getTime()}`, flashcardId: card.id, topicId: String(card.topicId), reviewedAt: reviewedAt.toISOString(), rating });
      await updateFlashcard(card.id, {
        ...schedule,
        lastReviewedAt: reviewedAt.toISOString(),
        difficulty: rating === 'easy' ? 'easy' : rating === 'good' ? 'medium' : 'hard',
      });

      const key = String(card.topicId);
      const entry = byTopic.current.get(key) ?? { topicName: card.topicName || title, counts: noCounts() };
      entry.counts[rating] += 1;
      byTopic.current.set(key, entry);
      setTotals((current) => ({ ...current, [rating]: current[rating] + 1 }));

      if (queue && index >= queue.length - 1) {
        await saveSummary();
        const cards = await loadCards();
        setRemainingDue(buildCardQueue(cards, { topicId: allTopics ? undefined : topicId, mode: 'due' }).length);
        setFinished(true);
      } else {
        setIndex((current) => current + 1);
        setRevealed(false);
      }
    } catch (error) {
      console.warn('Could not save the flashcard rating:', error);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const ratingLabel: Record<ReviewRating, string> = { again: L('Again', 'Igjen'), hard: L('Hard', 'Vanskelig'), good: L('Good', 'Bra'), easy: L('Easy', 'Lett') };
  const reviewed = totals.again + totals.hard + totals.good + totals.easy;

  const bar = (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel={L('Close', 'Lukk')} onPress={() => router.back()} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
        <StudyIcon name="x" size={18} color={ink.secondary} />
      </Pressable>
      <Text style={styles.barTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.barButton} />
    </View>
  );

  let body;
  if (queue === null) {
    body = <View style={styles.state}><ActivityIndicator color={palette.accent} /></View>;
  } else if (finished) {
    body = (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[p.card, styles.doneCard]}>
          <View style={[styles.doneIcon, { backgroundColor: palette.accent }]}><StudyIcon name="check" size={26} color="#FFFFFF" /></View>
          <Text style={styles.doneTitle}>{L('Session complete', 'Økten er fullført')}</Text>
          <Text style={[p.body, styles.centered]}>{reviewed} {reviewed === 1 ? L('card reviewed', 'kort repetert') : L('cards reviewed', 'kort repetert')}</Text>
          <View style={styles.summary}>
            {RATINGS.map((rating) => (
              <View key={rating} style={styles.summaryItem}>
                <View style={styles.summaryTop}><View style={[p.legendDot, { backgroundColor: RATING_COLOR[rating] }]} /><Text style={styles.summaryValue}>{totals[rating]}</Text></View>
                <Text style={p.small}>{ratingLabel[rating]}</Text>
              </View>
            ))}
          </View>
          <Text style={[p.small, styles.centered]}>{L('Each card comes back when it is due, based on how you rated it.', 'Hvert kort kommer tilbake når det forfaller, ut fra hvordan du vurderte det.')}</Text>
        </View>
        {remainingDue > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <Text style={p.buttonText}>{practice ? L('Practise again', 'Øv en gang til') : L(`Review ${remainingDue} more`, `Repeter ${remainingDue} til`)}</Text>
          </Pressable>
        ) : practice ? (
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={({ pressed }) => [p.button, styles.wide, { backgroundColor: palette.accent }, pressed && p.pressed]}>
            <Text style={p.buttonText}>{L('Practise again', 'Øv en gang til')}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [p.outlineButton, styles.wide, pressed && p.pressed]}>
          <Text style={p.outlineButtonText}>{L('Done', 'Ferdig')}</Text>
        </Pressable>
      </ScrollView>
    );
  } else if (!card) {
    body = (
      <View style={styles.state}>
        <IconChip name={failed ? 'review' : 'check'} />
        <Text style={p.emptyTitle}>{failed ? L('The cards could not be loaded', 'Kortene kunne ikke lastes inn') : practice ? L('No flashcards in this topic yet', 'Ingen flashcards i dette temaet ennå') : L('Nothing is due right now', 'Ingenting har forfalt akkurat nå')}</Text>
        <Text style={[p.body, styles.centered]}>{failed ? L('Go back and try again.', 'Gå tilbake og prøv igjen.') : practice ? L('Create or generate cards first.', 'Lag eller generer kort først.') : L('Cards come back here when it is time to review them.', 'Kortene kommer tilbake hit når det er tid for å repetere dem.')}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [p.button, { backgroundColor: palette.accent }, pressed && p.pressed]}>
          <Text style={p.buttonText}>{L('Go back', 'Gå tilbake')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const total = queue.length;
    const intervals = previewReviewIntervals(card);
    const question = answerFirst ? card.back : card.front;
    const answer = answerFirst ? card.front : card.back;
    body = (
      <>
        <View style={styles.progress}>
          <View style={styles.progressTop}>
            <Text style={p.small}>{L('Card', 'Kort')} {index + 1} {L('of', 'av')} {total}</Text>
            {allTopics && card.topicName ? <Text style={p.chip} numberOfLines={1}>{card.topicName}</Text> : null}
          </View>
          <ProgressBar value={(index / total) * 100} color={palette.accent} trackColor={palette.track} height={6} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? L('Card with the answer shown', 'Kort med svaret vist') : L('Show answer', 'Vis svar')}
            onPress={() => setRevealed(true)}
            disabled={revealed}
            style={[p.card, styles.card]}
          >
            <Text style={styles.side}>{answerFirst ? L('Answer', 'Svar') : L('Question', 'Spørsmål')}</Text>
            <Text style={styles.question}>{question}</Text>
            {revealed ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.side}>{answerFirst ? L('Question', 'Spørsmål') : L('Answer', 'Svar')}</Text>
                <Text style={styles.answer}>{answer}</Text>
              </>
            ) : (
              <Text style={[p.small, styles.hint]}>{L('Think of the answer, then tap to check.', 'Tenk ut svaret, og trykk for å sjekke.')}</Text>
            )}
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          {failed ? <Text style={styles.error}>{L('The rating could not be saved. Try again.', 'Vurderingen kunne ikke lagres. Prøv igjen.')}</Text> : null}
          {revealed ? (
            <>
              <Text style={[p.small, styles.centered]}>{L('How well did you remember it?', 'Hvor godt husket du det?')}</Text>
              <View style={styles.ratings}>
                {RATINGS.map((rating) => (
                  <Pressable
                    key={rating}
                    accessibilityRole="button"
                    accessibilityLabel={`${ratingLabel[rating]}, ${formatReviewInterval(intervals[rating], language)}`}
                    disabled={saving}
                    onPress={() => { void rate(rating); }}
                    style={({ pressed }) => [styles.rating, (pressed || saving) && p.pressed]}
                  >
                    <View style={[styles.ratingMark, { backgroundColor: RATING_COLOR[rating] }]} />
                    <Text style={styles.ratingLabel}>{ratingLabel[rating]}</Text>
                    <Text style={styles.ratingWhen} numberOfLines={1}>{formatReviewInterval(intervals[rating], language)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={({ pressed }) => [p.button, styles.show, { backgroundColor: palette.accent }, pressed && p.pressed]}>
              <Text style={styles.showText}>{L('Show answer', 'Vis svar')}</Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={ui.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        {bar}
        {body}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  centered: { textAlign: 'center' },
  bar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barButton: { width: 44, height: 44, justifyContent: 'center' },
  barTitle: { flex: 1, color: ink.primary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 60 },
  scroll: { flexGrow: 1, paddingVertical: 16, gap: 12 },

  progress: { gap: 8, marginTop: 4 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 26 },

  card: { flexGrow: 1, minHeight: 260, justifyContent: 'center', padding: 22, gap: 10 },
  side: { color: ink.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  question: { color: ink.primary, fontSize: 21, lineHeight: 29, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: appColor('#D8E6EC', 'border'), marginVertical: 8 },
  answer: { color: ink.primary, fontSize: 17, lineHeight: 26 },
  hint: { marginTop: 12 },

  footer: { gap: 10, paddingTop: 8, paddingBottom: 10 },
  error: { color: appColor('#A34338', 'text'), fontSize: 13, textAlign: 'center' },
  show: { minHeight: 56, borderRadius: 18 },
  showText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  ratings: { flexDirection: 'row', gap: 8 },
  rating: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 0, paddingBottom: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  ratingMark: { alignSelf: 'stretch', height: 4, marginBottom: 6 },
  ratingLabel: { color: ink.primary, fontSize: 14, fontWeight: '800' },
  ratingWhen: { color: ink.muted, fontSize: 10 },

  doneCard: { alignItems: 'center', paddingVertical: 26 },
  doneIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { color: ink.primary, fontSize: 22, fontWeight: '800' },
  summary: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 6 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryValue: { color: ink.primary, fontSize: 20, fontWeight: '800' },
  wide: { alignSelf: 'stretch' },
});

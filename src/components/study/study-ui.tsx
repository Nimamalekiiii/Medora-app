import { cardShadow } from '@/components/gloss';
import { IconChip } from '@/components/study/icon-chip';
import { ProgressBar } from '@/components/charts';
import { ink, p, useProgressPalette } from '@/components/progress/theme';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Pieces shared by the Study tab, the subject page and the topic page, so
 * the three screens look and behave the same.
 */

/** Top bar of a pushed screen: back arrow on the left, optional menu on the right. */
export function ScreenBar({ backLabel, onMenu, menuLabel }: { backLabel: string; onMenu?: () => void; menuLabel?: string }) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={() => router.back()} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
        <StudyIcon name="back" size={20} color={ink.secondary} />
      </Pressable>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel={menuLabel} onPress={onMenu} style={({ pressed }) => [styles.barButton, pressed && p.pressed]} hitSlop={8}>
          <StudyIcon name="more" size={20} color={ink.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Large icon, title and one line of detail at the top of a subject or topic. */
export function Hero({ icon, title, detail, children }: { icon: StudyIconName; title: string; detail: string; children?: ReactNode }) {
  const palette = useProgressPalette();
  return (
    <View style={[p.card, styles.hero]}>
      <View style={styles.heroIcon}><StudyIcon name={icon} size={30} color={palette.accent} /></View>
      <View style={p.grow}>
        <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header">{title}</Text>
        <Text style={styles.heroDetail} numberOfLines={2}>{detail}</Text>
        {children}
      </View>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={p.linkRow} hitSlop={8}>
          <Text style={p.link}>{action}</Text>
          <StudyIcon name="chevron" size={11} color={ink.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable row with an icon chip, a title, a detail line and an optional progress bar. */
export function StudyRow({ icon, leading, title, detail, progress, trailing, onPress, accessibilityLabel }: {
  icon: StudyIconName; /** Shown instead of the icon chip, e.g. a subject's own glyph. */ leading?: ReactNode; title: string; detail?: string; progress?: number; trailing?: ReactNode; onPress: () => void; accessibilityLabel?: string;
}) {
  const palette = useProgressPalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && p.pressed]}>
      {leading ?? <IconChip name={icon} />}
      <View style={p.grow}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {detail ? <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text> : null}
        {progress !== undefined ? <View style={styles.rowBar}><ProgressBar value={progress} color={palette.accent} trackColor={palette.track} height={5} /></View> : null}
      </View>
      {trailing ?? <StudyIcon name="chevron" size={12} color={ink.muted} />}
    </Pressable>
  );
}

/** Small filled button used at the end of a row, e.g. "Review". */
export function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  const palette = useProgressPalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pill, { backgroundColor: palette.accent }, pressed && p.pressed]} hitSlop={6}>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** Rounded segmented control. */
export function Segments<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  const palette = useProgressPalette();
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(item.key)} style={[styles.segment, selected && { backgroundColor: palette.accent }]}>
            <Text style={[styles.segmentText, selected && styles.selectedText]} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row of filter chips. */
export function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void }) {
  const palette = useProgressPalette();
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(item.key)} style={({ pressed }) => [styles.chip, selected && { backgroundColor: palette.accent, borderColor: palette.accent }, pressed && p.pressed]}>
            <Text style={[styles.chipText, selected && styles.selectedText]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Square tile for one study method. */
export function MethodTile({ icon, title, detail, onPress }: { icon: StudyIconName; title: string; detail: string; onPress: () => void }) {
  const palette = useProgressPalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && p.pressed]}>
      <IconChip name={icon} />
      <View style={p.grow}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowDetail} numberOfLines={2}>{detail}</Text>
      </View>
    </Pressable>
  );
}

export const studyStyles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 36, gap: 14 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  list: { gap: 10 },
  centered: { textAlign: 'center' },
});

const styles = StyleSheet.create({
  bar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barButton: { width: 44, height: 44, justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroIcon: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E7F4F8', 'background') },
  heroTitle: { color: ink.primary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroDetail: { color: ink.secondary, fontSize: 13, marginTop: 3 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { color: ink.primary, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  rowTitle: { color: ink.primary, fontSize: 15, fontWeight: '700' },
  rowDetail: { color: ink.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowBar: { marginTop: 8 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18 },
  pillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  segments: { flexDirection: 'row', padding: 4, borderRadius: 22, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 4 },
  segmentText: { color: ink.secondary, fontSize: 13, fontWeight: '700' },
  selectedText: { color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 18, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
  chipText: { color: ink.secondary, fontSize: 12, fontWeight: '700' },
  tile: { flexGrow: 1, flexBasis: '47%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: appColor('#FFFFFF', 'background'), borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), ...cardShadow },
});

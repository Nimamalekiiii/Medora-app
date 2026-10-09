import { appColor } from '@/constants/adaptive-color';
import { cardShadow } from '@/components/gloss';
import { StyleSheet, useColorScheme } from 'react-native';

/**
 * Colours and shared styles for the Progress tab. Chart colours are a
 * validated colour-blind-safe set, with separate steps for light and dark.
 */

const LIGHT = {
  accent: '#2A78D6',
  surface: '#FFFFFF',
  track: '#E0EAF6',
  grid: '#DCE7F4',
  /** Fixed order: quiz, active recall, flashcards, review, focus. */
  series: ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4'],
  status: { completed: '#2A78D6', inProgress: '#8DBDF0', notStarted: '#C6D5DC' },
  level: { strong: '#0CA30C', moderate: '#FAB219', weak: '#D03B3B' },
};

const DARK: typeof LIGHT = {
  accent: '#5BA4F2',
  surface: '#11213A',
  track: '#243C60',
  grid: '#243C60',
  series: ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181'],
  status: { completed: '#5BA4F2', inProgress: '#2F6098', notStarted: '#34496B' },
  level: { strong: '#0CA30C', moderate: '#FAB219', weak: '#D03B3B' },
};

export type ProgressPalette = typeof LIGHT;

export function useProgressPalette(): ProgressPalette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export const ink = {
  primary: appColor('#17324D', 'text'),
  secondary: appColor('#577082', 'text'),
  muted: appColor('#8799A4', 'text'),
};

export const p = StyleSheet.create({
  card: { backgroundColor: appColor('#FFFFFF', 'background'), borderRadius: 22, padding: 16, borderWidth: 1, borderColor: appColor('#E7F0F4', 'border'), gap: 14, ...cardShadow },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { color: ink.primary, fontSize: 17, fontWeight: '800', flexShrink: 1 },
  chip: { color: ink.secondary, fontSize: 11, fontWeight: '600', backgroundColor: appColor('#F4F8FA', 'background'), borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
  link: { color: ink.secondary, fontSize: 13, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  body: { color: ink.secondary, fontSize: 13, lineHeight: 19 },
  small: { color: ink.muted, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  inset: { backgroundColor: appColor('#F4F8FA', 'background'), borderRadius: 16, padding: 14 },
  iconChip: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#E7F4F8', 'background') },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  emptyTitle: { color: ink.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  outlineButton: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: appColor('#D8E6EC', 'border') },
  outlineButtonText: { color: ink.primary, fontSize: 14, fontWeight: '700' },
});

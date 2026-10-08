import { appColor } from '@/constants/adaptive-color';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

export type StudyIconName = 'book' | 'brain' | 'calendar' | 'chart' | 'cards' | 'check' | 'clock' | 'focus' | 'layers' | 'plus' | 'quiz' | 'review' | 'sparkles' | 'target' | 'timer' | 'x';

const SYMBOLS: Record<StudyIconName, NonNullable<SymbolViewProps['name']>> = {
  book: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  brain: { ios: 'brain.head.profile', android: 'psychology', web: 'psychology' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  chart: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  cards: { ios: 'rectangle.on.rectangle', android: 'style', web: 'style' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  focus: { ios: 'timer', android: 'timer', web: 'timer' },
  layers: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  quiz: { ios: 'checkmark.circle', android: 'quiz', web: 'quiz' },
  review: { ios: 'arrow.clockwise', android: 'autorenew', web: 'autorenew' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  target: { ios: 'scope', android: 'track_changes', web: 'track_changes' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
  x: { ios: 'xmark', android: 'close', web: 'close' },
};

export function StudyIcon({ name, size = 22, color = appColor('#327E9D', 'text') }: { name: StudyIconName; size?: number; color?: ColorValue }) {
  return <SymbolView name={SYMBOLS[name]} size={size} tintColor={color} weight="medium" />;
}

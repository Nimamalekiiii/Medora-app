import { Gloss } from '@/components/gloss';
import { useProgressPalette, type ProgressPalette } from '@/components/progress/theme';
import { StudyIcon, type StudyIconName } from '@/components/study-icon';
import { softTint } from '@/services/subject-look';
import { StyleSheet, View } from 'react-native';

/**
 * Each study method keeps one colour everywhere in the app, the same one it
 * has in the Progress charts. Icons without a colour of their own use the
 * app's blue.
 */
const SERIES_INDEX: Partial<Record<StudyIconName, number>> = {
  quiz: 0,
  brain: 1,
  calendar: 1,
  cards: 2,
  review: 3,
  timer: 4,
  focus: 4,
  clock: 4,
};

export function iconTint(name: StudyIconName, palette: ProgressPalette): string {
  const index = SERIES_INDEX[name];
  return index === undefined ? palette.accent : palette.series[index] ?? palette.accent;
}

/** An icon on a soft rounded chip in the icon's own colour. */
export function IconChip({ name, size = 20 }: { name: StudyIconName; size?: number }) {
  const palette = useProgressPalette();
  const tint = iconTint(name, palette);
  return (
    <View style={[styles.chip, { backgroundColor: softTint(tint) }]}>
      <Gloss />
      <StudyIcon name={name} size={size} color={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

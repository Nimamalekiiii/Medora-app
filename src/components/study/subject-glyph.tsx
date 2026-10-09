import { DonutChart } from '@/components/charts';
import { Gloss } from '@/components/gloss';
import { useProgressPalette } from '@/components/progress/theme';
import { StudyIcon } from '@/components/study-icon';
import { softTint, subjectIcon, subjectTint } from '@/services/subject-look';
import { StyleSheet, View } from 'react-native';

/** A subject's icon on a soft chip in the subject's colour. */
export function SubjectGlyph({ name, index, size = 48 }: { name: string; index: number; size?: number }) {
  const palette = useProgressPalette();
  const tint = subjectTint(index, palette.series);
  return (
    <View style={[styles.chip, { width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: softTint(tint) }]}>
      <Gloss />
      <StudyIcon name={subjectIcon(name)} size={Math.round(size * 0.5)} color={tint} />
    </View>
  );
}

/** A small ring showing how far a topic has come, with a check mark once it is completed. */
export function TopicRing({ progress, completed, size = 40 }: { progress: number; completed: boolean; size?: number }) {
  const palette = useProgressPalette();
  const value = Math.max(0, Math.min(100, progress));
  return (
    <DonutChart
      size={size}
      strokeWidth={4}
      trackColor={palette.track}
      segments={[{ key: 'done', value, color: palette.accent }, { key: 'left', value: 100 - value, color: palette.track }]}
    >
      {completed ? <StudyIcon name="check" size={Math.round(size * 0.38)} color={palette.accent} /> : null}
    </DonutChart>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

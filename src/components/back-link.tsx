import { LocalizedText as Text } from '@/components/localized-text';
import { StudyIcon } from '@/components/study-icon';
import { appColor } from '@/constants/adaptive-color';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

/** "Back" link at the top of a pushed screen: an arrow and where it leads. */
export function BackLink({ label = 'Back' }: { label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.back()} style={({ pressed }) => [styles.link, pressed && styles.pressed]} hitSlop={8}>
      <StudyIcon name="back" size={17} color={appColor('#327E9D', 'text')} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', minHeight: 44, maxWidth: '80%', flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 12 },
  text: { flexShrink: 1, color: appColor('#327E9D', 'text'), fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});

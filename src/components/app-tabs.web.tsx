import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

const destinations = [
  { name: 'index', href: '/', label: 'Home' },
  { name: 'subjects', href: '/subjects', label: 'Subjects' },
  { name: 'study', href: '/study', label: 'Study' },
  { name: 'progress', href: '/progress', label: 'Progress' },
  { name: 'profile', href: '/profile', label: 'Profile' },
] as const;

export default function AppTabs() {
  return <Tabs>
    <TabSlot style={{ height: '100%', paddingBottom: 82 }} />
    <TabList asChild>
      <CustomTabList>
        {destinations.map((tab) => <TabTrigger key={tab.name} name={tab.name} href={tab.href as never} asChild>
          <TabButton>{tab.label}</TabButton>
        </TabTrigger>)}
      </CustomTabList>
    </TabList>
  </Tabs>;
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return <Pressable {...props} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
    <ThemedView type={isFocused ? 'backgroundSelected' : 'backgroundElement'} style={styles.tabButton}>
      <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'} style={styles.tabLabel}>{children}</ThemedText>
    </ThemedView>
  </Pressable>;
}

function CustomTabList(props: TabListProps) {
  return <View {...props} style={styles.tabListContainer}>
    <ThemedView type="backgroundElement" style={styles.innerContainer}>
      <View style={styles.links}>{props.children}</View>
    </ThemedView>
  </View>;
}

const styles = StyleSheet.create({
  tabListContainer: { position: 'absolute', bottom: 10, width: '100%', paddingHorizontal: Spacing.three, alignItems: 'center' },
  innerContainer: { width: '100%', maxWidth: MaxContentWidth, paddingVertical: 8, paddingHorizontal: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#17324D', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  links: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pressable: { flex: 1, borderRadius: 12 }, tabButton: { flex: 1, paddingVertical: 9, paddingHorizontal: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, tabLabel: { textAlign: 'center' }, pressed: { opacity: 0.7 },
});

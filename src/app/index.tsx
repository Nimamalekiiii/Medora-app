import { appColor } from '@/constants/adaptive-color';
import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { MedExamLogoMark } from '@/components/medexam-logo';
import { useAuth } from '@/services/auth-context';

export default function IndexRoute() {
  const { session, loading } = useAuth();
  if (loading) return <View style={styles.loading}><MedExamLogoMark size={72} /><ActivityIndicator color={appColor('#0F7181', 'text')} style={styles.spinner} /></View>;
  return <Redirect href={(session ? '/(tabs)' : '/welcome') as Href} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appColor('#F5FAFC', 'background') },
  spinner: { marginTop: 22 },
});

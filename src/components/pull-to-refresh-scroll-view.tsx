import { appColor } from '@/constants/adaptive-color';
import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Platform,
  type ScrollViewProps,
} from 'react-native';

type Props = Omit<ScrollViewProps, 'refreshControl' | 'onRefresh'> & {
  onRefresh?: () => void | Promise<void>;
};

export default function PullToRefreshScrollView({ onRefresh, ...props }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const keyboardShouldPersistTaps = props.keyboardShouldPersistTaps ?? 'handled';
  const keyboardDismissMode = props.keyboardDismissMode ?? (Platform.OS === 'ios' ? 'interactive' : 'on-drag');
  const automaticallyAdjustKeyboardInsets = props.automaticallyAdjustKeyboardInsets ?? Platform.OS === 'ios';

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh?.();
    } catch (error) {
      console.warn('Pull to refresh did not complete:', error);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      {...props}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      alwaysBounceVertical
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={appColor('#327E9D', 'text')}
          colors={["#327E9D"]}
          progressBackgroundColor="#FFFFFF"
        />
      )}
    />
  );
}

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dateToKey } from '../services/dates';

export function useDayRefresh() {
  const [todayKey, setTodayKey] = useState(() => dateToKey(new Date()));

  useEffect(() => {
    const refresh = () => setTodayKey(dateToKey(new Date()));
    const interval = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return todayKey;
}

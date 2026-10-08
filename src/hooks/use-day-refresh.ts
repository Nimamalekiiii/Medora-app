import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDayRefresh() {
  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));

  useEffect(() => {
    const refresh = () => setTodayKey(localDayKey(new Date()));
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

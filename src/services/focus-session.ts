import AsyncStorage from '@react-native-async-storage/async-storage';

export type FocusSessionState = {
  version: 1;
  userId: string;
  phase: 'focus' | 'break';
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  workMinutes: number;
  breakMinutes: number;
  endsAt: number;
  pausedRemainingSeconds: number | null;
  completedWorkSeconds: number;
  cyclesCompleted: number;
};

const ACTIVE_FOCUS_KEY = 'medexam_active_focus_session';

export async function readFocusSession(): Promise<FocusSessionState | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_FOCUS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FocusSessionState>;
    if (value.version !== 1 || typeof value.userId !== 'string' || !value.userId || !['focus', 'break'].includes(String(value.phase)) ||
      typeof value.topicId !== 'string' || typeof value.topicName !== 'string' ||
      typeof value.endsAt !== 'number' || !Number.isFinite(value.endsAt) ||
      !Number.isInteger(value.workMinutes) || value.workMinutes! < 1 ||
      !Number.isInteger(value.breakMinutes) || value.breakMinutes! < 0 ||
      !(value.pausedRemainingSeconds === null || (typeof value.pausedRemainingSeconds === 'number' && Number.isFinite(value.pausedRemainingSeconds) && value.pausedRemainingSeconds >= 0)) ||
      typeof value.completedWorkSeconds !== 'number' || typeof value.cyclesCompleted !== 'number') {
      await AsyncStorage.removeItem(ACTIVE_FOCUS_KEY);
      return null;
    }
    return value as FocusSessionState;
  } catch {
    return null;
  }
}

export async function writeFocusSession(value: FocusSessionState) {
  await AsyncStorage.setItem(ACTIVE_FOCUS_KEY, JSON.stringify(value));
}

export async function clearFocusSession() {
  await AsyncStorage.removeItem(ACTIVE_FOCUS_KEY);
}

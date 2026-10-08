type LocalDataChangeListener = () => void;

const listeners = new Set<LocalDataChangeListener>();

export function subscribeToLocalDataChanges(listener: LocalDataChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyLocalDataChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('Could not notify cloud sync about a local save:', error);
    }
  }
}

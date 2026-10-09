import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { rememberLastAccount } from './last-account';
import { getSupabaseClient, readSavedSession } from './supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setSession(null);
      setLoading(false);
      return;
    }

    let active = true;
    let latestUpdate = 0;

    // Keeps the user signed in when supabase-js has no live session but the
    // saved one is still on the device (see readSavedSession).
    async function applySession(nextSession: Session | null, source: string) {
      const update = ++latestUpdate;
      const resolved = nextSession ?? await readSavedSession();
      if (!active || update !== latestUpdate) return;
      if (__DEV__) {
        const state = nextSession ? 'signed in' : resolved ? 'signed in from the saved session (could not refresh yet)' : 'signed out, no saved session on this device';
        console.log(`[Medora auth] ${source}: ${state}`);
      }
      setSession(resolved);
      setLoading(false);
      const email = resolved?.user?.email;
      if (email) void rememberLastAccount({ email, name: String(resolved.user.user_metadata?.full_name ?? '') });
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      void applySession(nextSession, event);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (error) console.warn('Could not refresh Medora sign-in:', error.message);
      // An auth event that arrived first already holds the newer state.
      if (latestUpdate === 0) void applySession(data.session, 'RESTORE');
    }).catch((error: unknown) => {
      console.warn('Could not restore Medora sign-in:', error);
      if (latestUpdate === 0) void applySession(null, 'RESTORE_FAILED');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  return (
    <AuthContext.Provider value={{ session, loading, configured: Boolean(client) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

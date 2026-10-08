import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getSupabaseClient } from './supabase';

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
    let receivedAuthEvent = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn('Could not restore MedExam sign-in:', error.message);
      if (!receivedAuthEvent) setSession(data.session);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      console.warn('Could not restore MedExam sign-in:', error);
      setLoading(false);
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

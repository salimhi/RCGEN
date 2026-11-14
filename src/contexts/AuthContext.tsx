import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string;
  guestId: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  displayName: 'Guest Aspirant',
  guestId: 'guest',
  signOut: async () => {}
});

function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem('practicerc_guest_id');
    if (existing) return existing;
    const created = `guest_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('practicerc_guest_id', created);
    return created;
  } catch {
    return 'guest_session';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestId] = useState<string>(() => getOrCreateGuestId());

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const displayName = user
    ? (user.user_metadata?.full_name as string) ||
      (user.email ? user.email.split('@')[0] : 'Aspirant')
    : 'Guest Aspirant';

  return (
    <AuthContext.Provider value={{ user, session, loading, displayName, guestId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

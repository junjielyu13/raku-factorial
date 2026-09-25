// src/auth/AuthProvider.tsx
import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Employee } from '../lib/types';

interface Ctx {
  session: Session | null;
  profile: Employee | null;
  loading: boolean;
}

export const AuthContext = createContext<Ctx>({ session: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  // Stay in `loading` until the stored session has been read. Otherwise the
  // first render sees session=null, RequireAuth redirects to /login, and a
  // deep link or refresh on e.g. /admin/approvals ends up on `/`.
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setSessionReady(true); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!session) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    supabase.from('employees').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data as Employee | null); setLoading(false); });
  }, [session, sessionReady]);

  return <AuthContext.Provider value={{ session, profile, loading }}>{children}</AuthContext.Provider>;
}

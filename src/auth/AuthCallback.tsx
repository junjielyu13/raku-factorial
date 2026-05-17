// src/auth/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(() => nav('/', { replace: true }));
  }, [nav]);
  return <div className="p-8">登录中…</div>;
}

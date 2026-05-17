// src/auth/LoginPage.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useTranslation } from '../i18n/LanguageContext';
import { LanguagePicker } from '../components/LanguagePicker';
import { BRAND } from '../components/BrandWatermark';

export function LoginPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) nav('/', { replace: true });
  }, [session, nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? t('login.invalidCredentials')
        : error.message);
      setBusy(false);
    } else {
      nav('/', { replace: true });
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-10">
      <div className="fixed top-4 right-4 z-10"><LanguagePicker /></div>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-3xl font-bold shadow-md ring-1 ring-emerald-700/10">
            R
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{BRAND}</h1>
          <p className="text-sm text-slate-500">{t('login.title')}</p>
        </div>
        <form onSubmit={submit} className="app-card p-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('login.email')}</span>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" autoComplete="email"
              className="app-input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('login.password')}</span>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="app-input"
            />
          </label>
          <button type="submit" disabled={busy} className="app-btn-primary">
            {busy ? t('login.submitting') : t('login.submit')}
          </button>
          {error && (
            <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// src/auth/LoginPage.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function LoginPage() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // If already logged in (e.g., navigated to /login by accident), bounce to home.
  useEffect(() => {
    if (session) nav('/', { replace: true });
  }, [session, nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? '邮箱或密码不正确。'
        : error.message);
      setBusy(false);
    } else {
      nav('/', { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">登录</h1>
        <label className="block">
          <span className="text-sm text-gray-700">邮箱</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com" autoComplete="email"
            className="w-full px-3 py-2 border rounded mt-1"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-700">密码</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 border rounded mt-1"
          />
        </label>
        <button
          type="submit" disabled={busy}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        {error && <p className="text-red-700 text-sm">{error}</p>}
      </form>
    </div>
  );
}

// src/auth/LoginPage.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setStatus('error'); setError(error.message); }
    else setStatus('sent');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded shadow w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">登录</h1>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-3 py-2 border rounded"
        />
        <button
          type="submit" disabled={status === 'sending'}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {status === 'sending' ? '发送中…' : '发送魔法链接'}
        </button>
        {status === 'sent' && <p className="text-green-700">查收邮箱并点击链接登录。</p>}
        {status === 'error' && <p className="text-red-700">{error}</p>}
      </form>
    </div>
  );
}

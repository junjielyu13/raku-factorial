// src/auth/RequireAuth.tsx
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';

interface Props { children: ReactNode; adminOnly?: boolean }

export function RequireAuth({ children, adminOnly }: Props) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="p-8">加载中…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="p-8">账号未在系统注册，请联系管理员。</div>;
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

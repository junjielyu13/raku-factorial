// src/auth/RequireAuth.tsx
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { useTranslation } from '../i18n/LanguageContext';

interface Props { children: ReactNode; adminOnly?: boolean }

export function RequireAuth({ children, adminOnly }: Props) {
  const { session, profile, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return <div className="p-8">{t('common.loading')}</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="p-8">{t('auth.notRegistered')}</div>;
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

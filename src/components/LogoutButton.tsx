import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../i18n/LanguageContext';

export function LogoutButton() {
  const { t } = useTranslation();
  const nav = useNavigate();
  async function logout() {
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  }
  return (
    <button onClick={logout} className="app-btn-ghost">
      {t('auth.logout')}
    </button>
  );
}

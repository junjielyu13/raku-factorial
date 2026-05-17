// src/App.tsx
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { LanguageProvider } from './i18n/LanguageContext';
import { VersionBadge } from './components/VersionBadge';
import { router } from './router';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <VersionBadge />
    </LanguageProvider>
  );
}

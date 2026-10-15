import { Navigate, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/use-account';

export function RequireAuth() {
  const { t } = useTranslation();
  const location = useLocation();
  const account = useCurrentUser();

  if (account.isPending) {
    return <p className="p-8 text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (!account.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

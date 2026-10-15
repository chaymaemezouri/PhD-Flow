import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage(t('auth.verifyMissing'));
      return;
    }
    let cancelled = false;
    void apiFetch('/api/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (cancelled) {
        return;
      }
      if (response.ok) {
        setState('done');
        return;
      }
      setState('error');
      setMessage(await apiErrorMessage(response));
    });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <AuthLayout>
      <h1 className="text-2xl text-navy">{t('auth.verifyTitle')}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {state === 'working'
          ? t('common.loading')
          : state === 'done'
            ? t('auth.verifyDone')
            : message}
      </p>
      <Link to="/login" className="mt-4 inline-block text-sm text-teal">
        {t('auth.login')}
      </Link>
    </AuthLayout>
  );
}

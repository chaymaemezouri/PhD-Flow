import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeedback } from '@/features/feedback/feedback';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');

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

  async function resend() {
    if (!email.trim()) {
      return;
    }
    const response = await apiFetch('/api/v1/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('auth.resendVerificationSent'));
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-extrabold text-[#1c2744]">{t('auth.verifyTitle')}</h1>
      <p className="mt-3 text-sm text-[#5c6578]" role={state === 'error' ? 'alert' : undefined}>
        {state === 'working'
          ? t('common.loading')
          : state === 'done'
            ? t('auth.verifyDone')
            : message}
      </p>
      {state === 'error' ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] p-4">
          <p className="text-sm font-semibold text-[#5c6578]">{t('auth.verifyResendHint')}</p>
          <p className="text-xs font-medium text-[#8b909a]">{t('auth.forgotMailpit')}</p>
          <label className="block text-sm font-bold text-[#1c2744]">
            {t('auth.email')}
            <Input
              type="email"
              className="mt-1.5 rounded-2xl"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <Button type="button" onClick={() => void resend()}>
            {t('auth.resendVerification')}
          </Button>
        </div>
      ) : null}
      <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-[#1f9a7a]">
        {t('auth.login')}
      </Link>
    </AuthLayout>
  );
}

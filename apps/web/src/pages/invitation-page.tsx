import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function InvitationPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function respond(path: string) {
    setPending(true);
    setResult(null);
    const response = await apiFetch(path, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    setPending(false);
    setResult(
      response.ok ? t('conferences.invitationDone') : await apiErrorMessage(response),
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl text-navy">{t('conferences.invitationTitle')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('conferences.invitationBody')}
      </p>
      {token.length < 20 ? (
        <p className="mt-4 text-sm">{t('conferences.invitationMissing')}</p>
      ) : (
        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => void respond('/api/v1/invitations/accept')}
          >
            {t('conferences.accept')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void respond('/api/v1/invitations/decline')}
          >
            {t('conferences.decline')}
          </Button>
        </div>
      )}
      {result ? <p className="mt-4 text-sm">{result}</p> : null}
      <p className="mt-6 text-sm">
        <Link to="/workspace/conferences">{t('conferences.back')}</Link>
      </p>
    </AuthLayout>
  );
}

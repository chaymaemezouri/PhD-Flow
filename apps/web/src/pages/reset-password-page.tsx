import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@scholarflow/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

type Values = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: params.get('token') ?? '', newPassword: '' },
  });

  return (
    <AuthLayout>
      <h1 className="text-2xl text-navy">{t('auth.resetTitle')}</h1>
      {done ? (
        <Link to="/login" className="mt-4 inline-block text-sm text-teal">
          {t('auth.login')}
        </Link>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            const response = await apiFetch('/api/v1/auth/reset-password', {
              method: 'POST',
              body: JSON.stringify(values),
            });
            if (!response.ok) {
              setError(await apiErrorMessage(response));
              return;
            }
            setDone(true);
          })}
        >
          <label className="block text-sm">
            {t('auth.password')}
            <Input
              type="password"
              className="mt-1"
              autoComplete="new-password"
              {...form.register('newPassword')}
            />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('auth.reset')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

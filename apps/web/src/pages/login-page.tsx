import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@scholarflow/validation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', mfaCode: '' },
  });
  const destination =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/workspace';

  return (
    <AuthLayout>
      <h1 className="text-2xl text-navy">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('auth.loginIntro')}</p>
      <form
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const response = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          if (!response.ok) {
            setError(await apiErrorMessage(response));
            return;
          }
          await queryClient.invalidateQueries({ queryKey: ['account'] });
          void navigate(destination);
        })}
      >
        <label className="block text-sm">
          {t('auth.email')}
          <Input
            type="email"
            autoComplete="email"
            className="mt-1"
            {...form.register('email')}
          />
        </label>
        <label className="block text-sm">
          {t('auth.mfaCode')}
          <Input className="mt-1" autoComplete="one-time-code" {...form.register('mfaCode')} />
        </label>
        <label className="block text-sm">
          {t('auth.password')}
          <Input
            type="password"
            autoComplete="current-password"
            className="mt-1"
            {...form.register('password')}
          />
        </label>
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.login')}
        </Button>
      </form>
      <div className="mt-6 rounded-md border border-border bg-secondary/40 p-3 text-sm">
        <p className="font-semibold text-navy">{t('auth.demoTitle')}</p>
        <p className="mt-1">{t('auth.demoPassword')}</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>{t('auth.demoAdmin')}</li>
          <li>{t('auth.demoReviewer')}</li>
          <li>{t('auth.demoChercheur')}</li>
        </ul>
      </div>
      <p className="mt-4 text-sm">
        <Link to="/forgot-password" className="text-teal">
          {t('auth.forgot')}
        </Link>
      </p>
      <p className="mt-2 text-sm">
        <Link to="/register" className="text-teal">
          {t('auth.createAccount')}
        </Link>
      </p>
    </AuthLayout>
  );
}

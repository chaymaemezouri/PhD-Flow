import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@scholarflow/validation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
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
  const [demosOpen, setDemosOpen] = useState(false);
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
    <AuthLayout brand={false}>
      <h1 className="text-2xl text-navy">{t('auth.loginTitle')}</h1>
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
          queryClient.clear();
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
          {t('auth.password')}
          <Input
            type="password"
            autoComplete="current-password"
            className="mt-1"
            {...form.register('password')}
          />
        </label>
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        ) : null}
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.login')}
        </Button>
      </form>
      <div className="mt-6 rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] text-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left font-extrabold text-[#1c2744]"
          aria-expanded={demosOpen}
          onClick={() => setDemosOpen((open) => !open)}
        >
          {t('auth.demoTitle')}
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${demosOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {demosOpen ? (
          <div className="px-3 pb-3">
            <p>{t('auth.demoPassword')}</p>
            <ul className="mt-2 space-y-1 text-[#5c6578]">
              <li>{t('auth.demoAdmin')}</li>
              <li>{t('auth.demoReviewer')}</li>
              <li>{t('auth.demoChercheur')}</li>
            </ul>
          </div>
        ) : null}
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

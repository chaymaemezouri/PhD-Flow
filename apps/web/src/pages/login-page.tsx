import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@scholarflow/validation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, KeyRound, ShieldCheck } from 'lucide-react';
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

const demos = [
  'demoAdmin',
  'demoSousAdmin',
  'demoCommittee',
  'demoReviewer',
  'demoSessionChair',
  'demoChercheur',
  'demoAuteur2',
  'demoSuperadmin',
] as const;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [needMfa, setNeedMfa] = useState(false);
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
  const justRegistered =
    typeof location.state === 'object' &&
    location.state !== null &&
    'registered' in location.state &&
    location.state.registered === true;

  return (
    <AuthLayout brand={false}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1c2744]">
            {t('auth.loginTitle')}
          </h1>
          {justRegistered ? (
            <p className="mt-2 text-sm font-semibold text-[#1c9a57]">
              {t('auth.registerReady')}
            </p>
          ) : null}
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eef2ff] text-[#3d4fd4]">
          <KeyRound className="size-5" aria-hidden />
        </span>
      </div>
      <form
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const response = await apiFetch('/api/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          if (!response.ok) {
            const message = await apiErrorMessage(response);
            if (/mfa|totp|authenticator/i.test(message)) {
              setNeedMfa(true);
            }
            setError(message);
            return;
          }
          queryClient.clear();
          void navigate(destination);
        })}
      >
        <label className="block text-sm font-bold text-[#1c2744]">
          {t('auth.email')}
          <Input
            type="email"
            autoComplete="email"
            className="mt-1.5 rounded-2xl border-[#e4e7ee] bg-[#f7f9fc]"
            {...form.register('email')}
          />
        </label>
        <label className="block text-sm font-bold text-[#1c2744]">
          {t('auth.password')}
          <Input
            type="password"
            autoComplete="current-password"
            className="mt-1.5 rounded-2xl border-[#e4e7ee] bg-[#f7f9fc]"
            {...form.register('password')}
          />
        </label>
        {needMfa || form.watch('mfaCode') ? (
          <label className="block text-sm font-bold text-[#1c2744]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-[#3d4fd4]" aria-hidden />
              {t('auth.mfaCode')}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1.5 rounded-2xl border-[#e4e7ee] bg-[#f7f9fc]"
              {...form.register('mfaCode')}
            />
            <span className="mt-1 block text-xs font-semibold text-[#8b909a]">
              {t('auth.mfaHint')}
            </span>
          </label>
        ) : (
          <button
            type="button"
            className="text-xs font-extrabold text-[#3d4fd4]"
            onClick={() => setNeedMfa(true)}
          >
            {t('auth.mfaShow')}
          </button>
        )}
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.email.message}
          </p>
        ) : null}
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.password.message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          className="min-h-11 w-full rounded-2xl text-sm font-extrabold"
          disabled={form.formState.isSubmitting}
        >
          {t('auth.login')}
        </Button>
      </form>
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#e4e7ee] bg-[#f4f7fb] text-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left font-extrabold text-[#1c2744]"
          aria-expanded={demosOpen}
          onClick={() => setDemosOpen((open) => !open)}
        >
          {t('auth.demoTitle')}
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${demosOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {demosOpen ? (
          <div className="border-t border-[#e4e7ee] px-3.5 py-3">
            <p className="font-semibold text-[#5c6578]">{t('auth.demoPassword')}</p>
            <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-[#5c6578]">
              {demos.map((key) => (
                <li key={key} className="text-xs leading-relaxed sm:text-sm">
                  {t(`auth.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
        <Link to="/forgot-password" className="text-[#1f9a7a] no-underline hover:underline">
          {t('auth.forgot')}
        </Link>
        <Link to="/register" className="text-[#1f9a7a] no-underline hover:underline">
          {t('auth.createAccount')}
        </Link>
        <Link to="/directory" className="text-[#3d4fd4] no-underline hover:underline">
          {t('conferences.directory')}
        </Link>
      </div>
    </AuthLayout>
  );
}

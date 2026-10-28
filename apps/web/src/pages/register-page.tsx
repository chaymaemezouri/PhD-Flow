import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@scholarflow/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', firstName: '', lastName: '' },
  });

  return (
    <AuthLayout>
      <h1 className="text-2xl text-navy">{t('auth.registerTitle')}</h1>
      <form
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const response = await apiFetch('/api/v1/auth/register', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          if (!response.ok) {
            setError(await apiErrorMessage(response));
            return;
          }
          void navigate('/login', { replace: true, state: { registered: true } });
        })}
      >
        <label className="block text-sm">
          {t('auth.firstName')}
          <Input
            className="mt-1"
            autoComplete="given-name"
            {...form.register('firstName')}
          />
        </label>
        <label className="block text-sm">
          {t('auth.lastName')}
          <Input
            className="mt-1"
            autoComplete="family-name"
            {...form.register('lastName')}
          />
        </label>
        <label className="block text-sm">
          {t('auth.email')}
          <Input
            type="email"
            className="mt-1"
            autoComplete="email"
            {...form.register('email')}
          />
        </label>
        <label className="block text-sm">
          {t('auth.password')}
          <Input
            type="password"
            className="mt-1"
            autoComplete="new-password"
            {...form.register('password')}
          />
          <span
            className={`mt-1 block text-xs ${form.formState.errors.password ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {t('auth.passwordHint')}
          </span>
        </label>
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        ) : null}
        {form.formState.errors.firstName ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.firstName.message}
          </p>
        ) : null}
        {form.formState.errors.lastName ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.lastName.message}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-teal">
          {t('auth.haveAccount')}
        </Link>
      </p>
    </AuthLayout>
  );
}

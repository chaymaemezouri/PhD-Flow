import { zodResolver } from '@hookform/resolvers/zod';
import { emailOnlySchema } from '@scholarflow/validation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeedback } from '@/features/feedback/feedback';
import { AuthLayout } from '@/layouts/auth-layout';
import { apiFetch } from '@/services/api';

type Values = z.infer<typeof emailOnlySchema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const [sent, setSent] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });

  return (
    <AuthLayout>
      <h1 className="text-2xl font-extrabold text-[#1c2744]">{t('auth.forgotTitle')}</h1>
      <p className="mt-2 text-sm text-[#5c6578]">{t('auth.forgotBody')}</p>
      {sent ? (
        <div className="mt-4 rounded-2xl bg-[#e8f8ef] px-4 py-3 text-sm font-semibold text-[#1f7a4d]">
          <p>{t('auth.forgotSent')}</p>
        </div>
      ) : null}
      <form
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await apiFetch('/api/v1/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify(values),
          });
          setSent(true);
          feedback.success(t('auth.forgotSent'));
        })}
      >
        <label className="block text-sm font-bold text-[#1c2744]">
          {t('auth.email')}
          <Input
            type="email"
            className="mt-1.5 rounded-2xl"
            autoComplete="email"
            {...form.register('email')}
          />
        </label>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.sendReset')}
        </Button>
      </form>
      <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-[#1f9a7a]">
        {t('auth.login')}
      </Link>
    </AuthLayout>
  );
}

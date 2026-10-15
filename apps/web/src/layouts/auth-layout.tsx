import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Wordmark } from '@/components/wordmark';

export function AuthLayout({
  children,
  brand = true,
}: {
  children: ReactNode;
  brand?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        {brand ? (
          <div className="mb-8">
            <Wordmark />
          </div>
        ) : null}
        <div className="rounded-2xl border border-[#e6e8ec] bg-white p-6">{children}</div>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="text-teal">
            {t('brand.name')}
          </Link>
        </p>
      </div>
    </div>
  );
}

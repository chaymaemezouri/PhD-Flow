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
    <div className="relative min-h-screen overflow-hidden bg-[#eef2f8] px-3 py-8 sm:px-4 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#dfe7ff_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#d9f0ea_0%,_transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-[#3d4fd4]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-0 size-80 rounded-full bg-[#1f9a7a]/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-md">
        {brand ? (
          <div className="mb-7 sm:mb-8">
            <Wordmark />
          </div>
        ) : (
          <div className="mb-7 text-center sm:mb-8">
            <p className="font-serif text-3xl font-semibold tracking-tight text-[#1c2744]">
              {t('brand.name')}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#5c6578]">{t('brand.tagline')}</p>
          </div>
        )}
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_60px_rgba(28,39,68,0.12)] backdrop-blur-sm sm:p-7">
          {children}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="font-semibold text-[#1f9a7a] no-underline hover:underline">
            {t('brand.name')}
          </Link>
        </p>
      </div>
    </div>
  );
}

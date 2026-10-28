import { ExternalLink, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

const MAILPIT_URL = 'http://localhost:8025';

const accounts = [
  {
    key: 'admin',
    email: 'admin@demo.scholarflow.test',
    path: '/workspace/administrator',
  },
  {
    key: 'sousAdmin',
    email: 'sousadmin@demo.scholarflow.test',
    path: '/workspace/administrator',
  },
  {
    key: 'committee',
    email: 'committee@demo.scholarflow.test',
    path: '/workspace/committee',
  },
  {
    key: 'reviewer',
    email: 'reviewer@demo.scholarflow.test',
    path: '/workspace/reviewer',
  },
  {
    key: 'sessionChair',
    email: 'sessionchair@demo.scholarflow.test',
    path: '/workspace/session-chair',
  },
  {
    key: 'author',
    email: 'chercheur@demo.scholarflow.test',
    path: '/workspace/author',
  },
  {
    key: 'author2',
    email: 'auteur2@demo.scholarflow.test',
    path: '/workspace/author',
  },
  {
    key: 'superadmin',
    email: 'superadmin@demo.scholarflow.test',
    path: '/workspace/system',
  },
] as const;

const scripts = [
  'author',
  'reviewer',
  'chair',
  'sessionChair',
  'committee',
] as const;

export function DemoGuidePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-[#1c2744] sm:text-2xl">
          {t('demoGuide.title')}
        </h1>
        <p className="mt-2 text-sm font-semibold text-[#5c6578]">{t('demoGuide.intro')}</p>
        <p className="mt-2 rounded-xl bg-[#f4f6fb] px-3 py-2 text-sm font-extrabold text-[#1c2744]">
          {t('demoGuide.password')}
        </p>
      </header>

      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#1c2744]">
              {t('demoGuide.mailpitTitle')}
            </h2>
            <p className="mt-1 text-sm font-semibold text-[#5c6578]">
              {t('demoGuide.mailpitBody')}
            </p>
          </div>
          <a
            href={MAILPIT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#3d4fd4] px-3.5 text-sm font-extrabold text-white no-underline"
          >
            <Mail className="size-4" aria-hidden />
            {t('demoGuide.openMailpit')}
            <ExternalLink className="size-3.5 opacity-80" aria-hidden />
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-[#1c2744]">{t('demoGuide.accountsTitle')}</h2>
        <ul className="grid gap-2">
          {accounts.map((account) => (
            <li
              key={account.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e4e7ee] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-[#1c2744]">
                  {t(`demoGuide.roles.${account.key}`)}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs font-semibold text-[#5c6578]">
                  {account.email}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                  {t(`demoGuide.actions.${account.key}`)}
                </p>
              </div>
              <Link
                to={account.path}
                className="inline-flex min-h-9 shrink-0 items-center rounded-xl border border-[#d8dce6] bg-[#f7f9fc] px-3 text-xs font-extrabold text-[#3d4fd4] no-underline"
              >
                {t('demoGuide.openHome')}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-extrabold text-[#1c2744]">{t('demoGuide.scriptsTitle')}</h2>
        <ol className="grid gap-3">
          {scripts.map((script, index) => (
            <li
              key={script}
              className="rounded-2xl border border-[#e4e7ee] bg-gradient-to-b from-white to-[#fafbfe] p-4"
            >
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8b93a7]">
                {t('demoGuide.step', { n: index + 1 })}
              </p>
              <p className="mt-1 text-sm font-extrabold text-[#1c2744]">
                {t(`demoGuide.scripts.${script}.title`)}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-[#5c6578]">
                {t(`demoGuide.scripts.${script}.body`)}
              </p>
              <p className="mt-2 text-xs font-extrabold text-[#1c9a57]">
                {t(`demoGuide.scripts.${script}.result`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs font-semibold text-[#8b909a]">{t('demoGuide.shortcutsHint')}</p>
    </div>
  );
}

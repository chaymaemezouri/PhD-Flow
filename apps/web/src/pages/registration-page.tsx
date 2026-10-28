import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';

/** Registration lives in the paper dossier — keep route for old links. */
export function RegistrationPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const paperId = params.get('paper');
  if (paperId) {
    return <Navigate to={`/workspace/submissions/${paperId}`} replace />;
  }
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-[28px] border border-[#e4e7ee] bg-gradient-to-b from-white to-[#f7f9ff] p-6">
      <h1 className="text-xl font-extrabold text-[#1c2744]">{t('registrationPage.title')}</h1>
      <p className="text-sm font-semibold text-[#5c6578]">{t('registrationPage.intro')}</p>
      <p className="text-sm text-[#8b909a]">{t('registrationPage.empty')}</p>
      <Link
        to="/workspace/submissions"
        className="inline-flex min-h-10 items-center rounded-2xl bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
      >
        {t('registrationPage.openSubmissions')}
      </Link>
    </div>
  );
}

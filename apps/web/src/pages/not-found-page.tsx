import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="w-full px-6 py-20">
      <h1 className="text-3xl text-navy">{t('notFound.title')}</h1>
      <p className="mt-3 text-muted-foreground">{t('notFound.body')}</p>
      <Button asChild className="mt-6">
        <Link to="/">{t('common.home')}</Link>
      </Button>
    </main>
  );
}

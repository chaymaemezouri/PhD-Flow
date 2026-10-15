import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Wordmark } from '@/components/wordmark';
import { useHealthQuery } from '@/features/health/use-health';

export function LandingPage() {
  const { t } = useTranslation();
  const health = useHealthQuery();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <Wordmark />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/directory">{t('conferences.directory')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/login">{t('auth.login')}</Link>
            </Button>
            <Button asChild>
              <Link to="/register">{t('auth.createAccount')}</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="grid w-full gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.4fr_0.8fr] lg:px-10">
        <section>
          <p className="text-xs font-semibold tracking-[0.22em] text-teal uppercase">
            {t('landing.kicker')}
          </p>
          <h1 className="mt-4 max-w-xl text-3xl text-navy sm:text-5xl">
            {t('landing.title')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t('landing.lede')}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(['authors', 'reviewers', 'committees'] as const).map((audience) => (
              <article key={audience} className="border-t-2 border-teal pt-3">
                <h2 className="text-base text-navy">
                  {t(`landing.audiences.${audience}.title`)}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`landing.audiences.${audience}.body`)}
                </p>
              </article>
            ))}
          </div>
        </section>
        <Card>
          <CardHeader>
            <CardTitle>{t('health.title')}</CardTitle>
            <CardDescription>{t('footer.note')}</CardDescription>
          </CardHeader>
          <CardContent>
            {health.isPending ? <p>{t('common.loading')}</p> : null}
            {health.isError ? (
              <div className="space-y-3">
                <Badge tone="danger">{t('health.error')}</Badge>
                <p className="text-sm text-muted-foreground">{t('health.hint')}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void health.refetch()}
                >
                  {t('common.retry')}
                </Button>
              </div>
            ) : null}
            {health.data ? (
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('health.api')}</dt>
                  <dd>
                    <Badge tone="success">{health.data.checks.api}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('health.database')}</dt>
                  <dd>
                    <Badge
                      tone={health.data.checks.database === 'up' ? 'success' : 'warning'}
                    >
                      {health.data.checks.database}
                    </Badge>
                  </dd>
                </div>
                <p className="text-muted-foreground">
                  {health.data.status === 'ok' ? t('health.ok') : t('health.degraded')}
                </p>
              </dl>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

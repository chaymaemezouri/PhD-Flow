import { Link, Navigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { findPlannedModule } from '@/features/navigation/modules';

const REDIRECTS: Record<string, string> = {
  program: '/workspace/program',
  decisions: '/workspace/administrator?board=decisions',
  administration: '/workspace/conferences',
};

export function PlannedModulePage() {
  const { t } = useTranslation();
  const { moduleId } = useParams();
  if (moduleId && REDIRECTS[moduleId]) {
    return <Navigate to={REDIRECTS[moduleId]} replace />;
  }
  const module = moduleId ? findPlannedModule(moduleId) : undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{module ? t(module.labelKey) : t('planned.unknown')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <h1 className="text-2xl text-navy">{t('planned.title')}</h1>
        <p className="text-muted-foreground">{t('planned.body')}</p>
        {module ? (
          <p className="text-sm font-semibold">
            {t('planned.phase', { phase: module.phase })}
          </p>
        ) : null}
        <Button asChild variant="outline">
          <Link to="/workspace/administrator">{t('nav.overview')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

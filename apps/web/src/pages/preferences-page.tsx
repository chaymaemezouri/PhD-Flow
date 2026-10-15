import { zodResolver } from '@hookform/resolvers/zod';
import { interfacePreferencesSchema } from '@scholarflow/validation';
import type { InterfaceLanguage, InterfaceTheme } from '@scholarflow/types';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePreferences } from '@/features/preferences/preferences-context';

const themes: InterfaceTheme[] = ['light', 'dark', 'system'];
const languages: InterfaceLanguage[] = ['en', 'fr'];

export function PreferencesPage() {
  const { t } = useTranslation();
  const { preferences, savePreferences } = usePreferences();
  const form = useForm({
    resolver: zodResolver(interfacePreferencesSchema),
    values: preferences,
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('preferences.title')}</CardTitle>
        <CardDescription>{t('preferences.intro')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit((values) => {
            savePreferences(values);
            toast.success(t('preferences.saved'));
          })}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('theme.label')}</legend>
            {themes.map((theme) => (
              <label key={theme} className="flex items-center gap-2 text-sm">
                <input type="radio" value={theme} {...form.register('theme')} />
                {t(`theme.${theme}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('language.label')}</legend>
            {languages.map((language) => (
              <label key={language} className="flex items-center gap-2 text-sm">
                <input type="radio" value={language} {...form.register('language')} />
                {t(`language.${language}`)}
              </label>
            ))}
          </fieldset>
          <Button type="submit">{t('preferences.save')}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

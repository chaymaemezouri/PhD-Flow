import { zodResolver } from '@hookform/resolvers/zod';
import { interfacePreferencesSchema } from '@scholarflow/validation';
import type { InterfaceLanguage, InterfaceTheme } from '@scholarflow/types';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';
import { usePreferences } from '@/features/preferences/preferences-context';

const themes: InterfaceTheme[] = ['light', 'dark', 'system'];
const languages: InterfaceLanguage[] = ['en', 'fr'];

export function PreferencesPage() {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const { preferences, savePreferences } = usePreferences();
  const form = useForm({
    resolver: zodResolver(interfacePreferencesSchema),
    values: preferences,
  });

  return (
    <div className="space-y-5">
      <header className="border-b border-[#e6e8ec] pb-4">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {t('preferences.title')}
        </h1>
        <p className="mt-1 text-sm text-[#5c6578]">{t('preferences.intro')}</p>
      </header>

      <form
        className="grid gap-6 rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={form.handleSubmit((values) => {
          savePreferences(values);
          feedback.success(t('preferences.saved'));
        })}
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-extrabold text-[#1c2744]">
            {t('language.label')}
          </legend>
          <p className="text-xs text-[#8b909a]">{t('preferences.languageHint')}</p>
          {languages.map((language) => (
            <label
              key={language}
              className="flex items-center gap-2 rounded-xl bg-[#f6f7fb] px-3 py-2.5 text-sm font-semibold text-[#1c2744]"
            >
              <input type="radio" value={language} {...form.register('language')} />
              {t(`language.${language}`)}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-extrabold text-[#1c2744]">
            {t('theme.label')}
          </legend>
          {themes.map((theme) => (
            <label
              key={theme}
              className="flex items-center gap-2 rounded-xl bg-[#f6f7fb] px-3 py-2.5 text-sm font-semibold text-[#1c2744]"
            >
              <input type="radio" value={theme} {...form.register('theme')} />
              {t(`theme.${theme}`)}
            </label>
          ))}
        </fieldset>

        <div className="sm:col-span-2">
          <Button type="submit">{t('preferences.save')}</Button>
        </div>
      </form>
    </div>
  );
}

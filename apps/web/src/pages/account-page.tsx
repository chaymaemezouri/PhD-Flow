import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, profileSchema } from '@scholarflow/validation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { EducationStep } from '@scholarflow/types';
import { useCurrentUser } from '@/features/auth/use-account';
import { apiErrorMessage, apiFetch } from '@/services/api';

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof changePasswordSchema>;

export function AccountPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [mfaUri, setMfaUri] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const profile = account.data?.profile;
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          academicTitle: profile.academicTitle ?? '',
          institution: profile.institution ?? '',
          laboratory: profile.laboratory ?? '',
          department: profile.department ?? '',
          country: profile.country ?? '',
          city: profile.city ?? '',
          disciplines: profile.disciplines,
          interests: profile.interests ?? '',
          biography: profile.biography ?? '',
          education: profile.education,
          orcid: profile.orcid ?? '',
          googleScholarUrl: profile.googleScholarUrl ?? '',
          website: profile.website ?? '',
          language: profile.language,
        }
      : undefined,
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const [disciplines, setDisciplines] = useState('');
  const [steps, setSteps] = useState<EducationStep[]>([]);
  useEffect(() => {
    if (profile) {
      setDisciplines(profile.disciplines.join(', '));
      setSteps(profile.education);
    }
  }, [profile]);

  function updateStep(index: number, key: keyof EducationStep, value: string) {
    setSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, [key]: value } : step,
      ),
    );
  }

  if (!account.data || !profile) {
    return <p>{t('common.loading')}</p>;
  }

  const place = [profile.laboratory, profile.institution, profile.city]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="grid gap-6">
      <section className="grid items-stretch gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#e6e8ec] bg-white">
          {profile.photoPath ? (
            <img
              src={profile.photoPath}
              alt={`${profile.firstName} ${profile.lastName}`}
              className="h-52 w-full object-cover sm:h-72"
            />
          ) : (
            <div className="grid h-52 place-items-center bg-[#eef2ff] text-3xl font-extrabold text-[#5d74ff] sm:h-72">
              {profile.firstName.slice(0, 1)}
              {profile.lastName.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex flex-col justify-between rounded-[28px] bg-white p-5 sm:p-8">
          <div>
            <p className="text-sm font-semibold text-[#8b909a]">
              {profile.academicTitle ?? t('auth.profileTitle')}
            </p>
            <h1 className="mt-1 text-3xl break-words sm:text-4xl">
              {profile.firstName} {profile.lastName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold text-[#5c6370]">{place}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {profile.disciplines.map((item) => (
              <span
                key={item}
                className="rounded-full bg-[#f4f5f8] px-3 py-1 text-sm font-bold"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="flex flex-wrap items-center gap-3">
        <label className="rounded-full bg-white px-4 py-2 text-sm font-bold">
          {t('auth.uploadPhoto')}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const body = new FormData();
              body.set('photo', file);
              void apiFetch('/api/v1/auth/photo', { method: 'POST', body }).then(
                async (response) => {
                  if (response.ok) {
                    await queryClient.invalidateQueries({ queryKey: ['account'] });
                  }
                },
              );
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void apiFetch('/api/v1/auth/mfa/start', { method: 'POST', body: '{}' }).then(
              async (response) => {
                if (!response.ok) {
                  return;
                }
                const payload = (await response.json()) as { uri: string };
                setMfaUri(payload.uri);
              },
            );
          }}
        >
          {t('auth.startMfa')}
        </Button>
        {mfaUri ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-3xl bg-white px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void apiFetch('/api/v1/auth/mfa/confirm', {
                method: 'POST',
                body: JSON.stringify({ code: mfaCode }),
              }).then(async (response) => {
                if (response.ok) {
                  setMfaUri(null);
                  setMfaCode('');
                  await queryClient.invalidateQueries({ queryKey: ['account'] });
                }
              });
            }}
          >
            <p className="w-full text-xs break-all text-[#6d7690]">{mfaUri}</p>
            <label className="text-sm font-bold">
              {t('auth.mfaCode')}
              <Input
                className="mt-1"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
              />
            </label>
            <Button type="submit">{t('auth.confirmMfa')}</Button>
          </form>
        ) : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e6e8ec] bg-white p-6">
          <h2 className="text-xl">{t('auth.biography')}</h2>
          <p className="mt-3 leading-relaxed text-[#4c5670]">
            {profile.biography ?? t('auth.biographyEmpty')}
          </p>
          {profile.orcid ? (
            <p className="mt-4 text-sm font-bold text-[#5d74ff]">ORCID {profile.orcid}</p>
          ) : null}
        </article>
        <article className="rounded-2xl border border-[#e6e8ec] bg-white p-6">
          <h2 className="text-xl">{t('auth.parcours')}</h2>
          {profile.education.length === 0 ? (
            <p className="mt-3 text-sm text-[#6d7690]">{t('auth.parcoursEmpty')}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {profile.education.map((step) => (
                <li key={`${step.year}-${step.title}`} className="flex gap-4">
                  <span className="w-16 shrink-0 text-sm font-extrabold text-[#5d74ff]">
                    {step.year}
                  </span>
                  <span>
                    <span className="block font-extrabold">{step.title}</span>
                    <span className="text-sm text-[#6d7690]">{step.place}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.profileTitle')}</CardTitle>
          <CardDescription>{account.data.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={profileForm.handleSubmit(async (values) => {
              setProfileError(null);
              const response = await apiFetch('/api/v1/auth/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                  ...values,
                  disciplines: disciplines
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0),
                  education: steps.filter(
                    (step) => step.year.trim() && step.title.trim() && step.place.trim(),
                  ),
                }),
              });
              if (!response.ok) {
                setProfileError(await apiErrorMessage(response));
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ['account'] });
              toast.success(t('auth.profileSaved'));
            })}
          >
            <Field label={t('auth.firstName')} name="firstName" form={profileForm} />
            <Field label={t('auth.lastName')} name="lastName" form={profileForm} />
            <Field
              label={t('auth.academicTitle')}
              name="academicTitle"
              form={profileForm}
            />
            <Field label={t('auth.institution')} name="institution" form={profileForm} />
            <Field label={t('auth.laboratory')} name="laboratory" form={profileForm} />
            <Field label={t('auth.department')} name="department" form={profileForm} />
            <Field label={t('auth.country')} name="country" form={profileForm} />
            <Field label={t('auth.city')} name="city" form={profileForm} />
            <label className="block text-sm sm:col-span-2">
              {t('auth.disciplines')}
              <Input
                className="mt-1"
                value={disciplines}
                onChange={(event) => setDisciplines(event.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              {t('auth.biography')}
              <textarea
                className="mt-1 min-h-28 w-full rounded-2xl border border-[#e4e9f5] px-3 py-2"
                {...profileForm.register('biography')}
              />
            </label>
            <div className="sm:col-span-2">
              <p className="text-sm font-bold">{t('auth.parcours')}</p>
              <div className="mt-2 space-y-2">
                {steps.map((step, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                    <Input
                      aria-label={t('auth.year')}
                      value={step.year}
                      onChange={(event) => updateStep(index, 'year', event.target.value)}
                    />
                    <Input
                      aria-label={t('auth.stepTitle')}
                      value={step.title}
                      onChange={(event) => updateStep(index, 'title', event.target.value)}
                    />
                    <Input
                      aria-label={t('auth.place')}
                      value={step.place}
                      onChange={(event) => updateStep(index, 'place', event.target.value)}
                    />
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() =>
                  setSteps((current) => [...current, { year: '', title: '', place: '' }])
                }
              >
                {t('auth.addStep')}
              </Button>
            </div>
            <label className="block text-sm sm:col-span-2">
              {t('auth.interests')}
              <Input className="mt-1" {...profileForm.register('interests')} />
            </label>
            <Field label={t('auth.orcid')} name="orcid" form={profileForm} />
            <Field label={t('auth.website')} name="website" form={profileForm} />
            <label className="block text-sm sm:col-span-2">
              {t('auth.scholar')}
              <Input className="mt-1" {...profileForm.register('googleScholarUrl')} />
            </label>
            <fieldset className="text-sm">
              <legend>{t('language.label')}</legend>
              <label className="mr-4">
                <input type="radio" value="en" {...profileForm.register('language')} />{' '}
                {t('language.en')}
              </label>
              <label>
                <input type="radio" value="fr" {...profileForm.register('language')} />{' '}
                {t('language.fr')}
              </label>
            </fieldset>
            {profileError ? (
              <p className="text-sm text-destructive sm:col-span-2">{profileError}</p>
            ) : null}
            <Button type="submit" disabled={profileForm.formState.isSubmitting}>
              {t('auth.saveProfile')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid w-full gap-4"
            onSubmit={passwordForm.handleSubmit(async (values) => {
              setPasswordError(null);
              const response = await apiFetch('/api/v1/auth/change-password', {
                method: 'POST',
                body: JSON.stringify(values),
              });
              if (!response.ok) {
                setPasswordError(await apiErrorMessage(response));
                return;
              }
              passwordForm.reset();
              toast.success(t('auth.passwordChanged'));
            })}
          >
            <label className="block text-sm">
              {t('auth.currentPassword')}
              <Input
                type="password"
                className="mt-1"
                autoComplete="current-password"
                {...passwordForm.register('currentPassword')}
              />
            </label>
            <label className="block text-sm">
              {t('auth.password')}
              <Input
                type="password"
                className="mt-1"
                autoComplete="new-password"
                {...passwordForm.register('newPassword')}
              />
            </label>
            {passwordError ? (
              <p className="text-sm text-destructive">{passwordError}</p>
            ) : null}
            <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
              {t('auth.changePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  name,
  form,
}: {
  label: string;
  name: Exclude<keyof ProfileValues, 'disciplines' | 'language'>;
  form: ReturnType<typeof useForm<ProfileValues>>;
}) {
  return (
    <label className="block text-sm">
      {label}
      <Input className="mt-1" {...form.register(name)} />
    </label>
  );
}

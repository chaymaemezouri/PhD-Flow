import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFeedback } from '@/features/feedback/feedback';
import { apiErrorMessage, apiFetch } from '@/services/api';

export type TeamCreateRole = 'ADMINISTRATOR' | 'COMMITTEE' | 'REVIEWER';

export const SUBADMIN_STAGE_IDS = [
  'scope',
  'assignments',
  'decisions',
  'registration',
  'program',
  'camera',
  'publication',
  'team',
] as const;

export type SubadminStageId = (typeof SUBADMIN_STAGE_IDS)[number];

export function CreateTeamMemberDialog({
  open,
  onOpenChange,
  conferenceId,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conferenceId: string;
  role: TeamCreateRole;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const roleLabel = t(`conferences.roles.${role}`);
  const [stages, setStages] = useState<SubadminStageId[]>([...SUBADMIN_STAGE_IDS]);

  function toggleStage(stage: SubadminStageId) {
    setStages((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage],
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setStages([...SUBADMIN_STAGE_IDS]);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[80] sm:w-[min(100%-1.5rem,36rem)]"
      >
        <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
          {t('conferences.createTeamTitle', { role: roleLabel })}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c6578]">
          {role === 'ADMINISTRATOR'
            ? t('conferences.createSubAdminHint')
            : t('conferences.createTeamHint')}
        </DialogDescription>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (role === 'ADMINISTRATOR' && stages.length === 0) {
              feedback.error(t('conferences.stagesRequired'));
              return;
            }
            const form = event.currentTarget;
            const data = new FormData(form);
            const email = String(data.get('email') ?? '');
            const password = String(data.get('password') ?? '');
            const path =
              role === 'ADMINISTRATOR'
                ? `/api/v1/conferences/${conferenceId}/sub-admins`
                : `/api/v1/conferences/${conferenceId}/team`;
            void apiFetch(path, {
              method: 'POST',
              body: JSON.stringify({
                firstName: String(data.get('firstName') ?? ''),
                lastName: String(data.get('lastName') ?? ''),
                email,
                password,
                ...(role === 'ADMINISTRATOR' ? { stages } : { role }),
              }),
            }).then(async (response) => {
              if (!response.ok) {
                feedback.error(await apiErrorMessage(response));
                return;
              }
              form.reset();
              onOpenChange(false);
              feedback.success(t('conferences.createTeamDone', { email }));
              await queryClient.invalidateQueries({ queryKey: ['conference'] });
              await queryClient.invalidateQueries({ queryKey: ['reviewers'] });
            });
          }}
        >
          <label className="text-sm font-bold">
            {t('auth.firstName')}
            <Input name="firstName" required className="mt-1" />
          </label>
          <label className="text-sm font-bold">
            {t('auth.lastName')}
            <Input name="lastName" required className="mt-1" />
          </label>
          <label className="text-sm font-bold">
            {t('auth.email')}
            <Input name="email" type="email" required autoComplete="off" className="mt-1" />
          </label>
          <label className="text-sm font-bold">
            {t('auth.password')}
            <Input
              name="password"
              type="text"
              required
              minLength={12}
              autoComplete="off"
              className="mt-1"
            />
          </label>
          {role === 'ADMINISTRATOR' ? (
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-bold text-[#1c2744]">
                {t('conferences.stagesTitle')}
              </legend>
              <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                {t('conferences.stagesHint')}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SUBADMIN_STAGE_IDS.map((stage) => (
                  <label
                    key={stage}
                    className="flex items-center gap-2 rounded-xl bg-[#f6f7fb] px-3 py-2 text-sm font-semibold text-[#1c2744]"
                  >
                    <input
                      type="checkbox"
                      checked={stages.includes(stage)}
                      onChange={() => toggleStage(stage)}
                      className="size-4 accent-[#3d4fd4]"
                    />
                    {t(`conferences.stages.${stage}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit">{t('conferences.createTeam')}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

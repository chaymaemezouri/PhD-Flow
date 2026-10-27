import { useQueryClient } from '@tanstack/react-query';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[80] sm:w-[min(100%-1.5rem,36rem)]"
      >
        <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
          {t('conferences.createTeamTitle', { role: roleLabel })}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c6578]">
          {t('conferences.createTeamHint')}
        </DialogDescription>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
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
                ...(role === 'ADMINISTRATOR' ? {} : { role }),
              }),
            }).then(async (response) => {
              if (!response.ok) {
                feedback.error(await apiErrorMessage(response));
                return;
              }
              form.reset();
              onOpenChange(false);
              feedback.success(t('conferences.createTeamDone', { email, password }));
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

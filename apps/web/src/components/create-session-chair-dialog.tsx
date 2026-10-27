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

export function CreateSessionChairDialog({
  open,
  onOpenChange,
  conferenceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conferenceId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[80] sm:w-[min(100%-1.5rem,36rem)]"
      >
        <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
          {t('sessionChair.createTitle')}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c6578]">
          {t('sessionChair.createHint')}
        </DialogDescription>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const email = String(data.get('email') ?? '');
            const password = String(data.get('password') ?? '');
            void apiFetch(`/api/v1/conferences/${conferenceId}/session-chairs`, {
              method: 'POST',
              body: JSON.stringify({
                firstName: String(data.get('firstName') ?? ''),
                lastName: String(data.get('lastName') ?? ''),
                email,
                password,
              }),
            }).then(async (response) => {
              if (!response.ok) {
                feedback.error(await apiErrorMessage(response));
                return;
              }
              form.reset();
              onOpenChange(false);
              feedback.success(t('sessionChair.created', { email, password }));
              await queryClient.invalidateQueries({ queryKey: ['session-chairs'] });
              await queryClient.invalidateQueries({ queryKey: ['conference'] });
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
            <Button type="submit">{t('sessionChair.createTitle')}</Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

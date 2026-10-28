import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SUBADMIN_STAGE_IDS,
  type SubadminStageId,
} from '@/components/create-team-member-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFeedback } from '@/features/feedback/feedback';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function EditSubadminStagesDialog({
  open,
  onOpenChange,
  conferenceId,
  userId,
  email,
  initialStages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conferenceId: string;
  userId: string;
  email: string;
  initialStages: SubadminStageId[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [stages, setStages] = useState<SubadminStageId[]>(initialStages);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStages(initialStages);
    }
  }, [open, initialStages]);

  function toggleStage(stage: SubadminStageId) {
    setStages((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[80] sm:w-[min(100%-1.5rem,36rem)]"
      >
        <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
          {t('conferences.editStagesTitle')}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c6578]">
          {t('conferences.editStagesHint', { email })}
        </DialogDescription>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void apiFetch(
                `/api/v1/conferences/${conferenceId}/sub-admins/${userId}/stages`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({ stages }),
                },
              )
                .then(async (response) => {
                  if (!response.ok) {
                    feedback.error(await apiErrorMessage(response));
                    return;
                  }
                  feedback.success(t('workflow.saved'));
                  onOpenChange(false);
                  await queryClient.invalidateQueries({ queryKey: ['conference'] });
                })
                .finally(() => setSaving(false));
            }}
          >
            {t('common.save')}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

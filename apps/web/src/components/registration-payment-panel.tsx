import { useTranslation } from 'react-i18next';
import { PaperFileSlot, PaperFilesStrip } from '@/components/paper-file-preview';
import type { PaperDossier } from '@/components/paper-workflow';
import { StagePanel } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

function paymentLabel(
  t: (key: string) => string,
  paymentStatus: string | undefined,
  hasProof: boolean,
) {
  if (paymentStatus === 'VERIFIED') {
    return t('dossier.paymentValidated');
  }
  if (paymentStatus === 'PENDING' || hasProof) {
    return t('dossier.underCheckReceipt');
  }
  if (paymentStatus === 'NOT_REQUIRED') {
    return t('dossier.paymentNotRequired');
  }
  return t('dossier.paymentAwaitingUpload');
}

export function RegistrationPaymentPanel({
  paperId,
  conferenceId,
  createdById,
  dossier,
  onChanged,
  onError,
}: {
  paperId: string;
  conferenceId: string;
  createdById?: string | null;
  dossier: PaperDossier;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const manager = dossier.canManage;
  const paymentStatus = dossier.registration?.paymentStatus;
  const underCheck = paymentStatus === 'PENDING' || (dossier.paymentProof && paymentStatus !== 'VERIFIED');
  const paymentValidated = paymentStatus === 'VERIFIED';
  const registeredNow =
    dossier.registration?.status === 'VERIFIED' || paymentValidated;

  async function send(path: string, body?: BodyInit, json = false) {
    const response = await apiFetch(path, {
      method: 'POST',
      body: json ? JSON.stringify(body ?? {}) : body,
    });
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    await onChanged();
  }

  function upload(path: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    void send(path, form);
  }

  async function download(path: string, name: string) {
    const response = await apiFetch(path);
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <StagePanel
        title={t('dossier.registration')}
        hint={t('dossier.registrationHint')}
        status={
          registeredNow
            ? t('dossier.registered')
            : dossier.registration?.status === 'REQUESTED'
              ? t('dossier.registrationSent')
              : t('dossier.openForRegistration')
        }
        statusTone={registeredNow ? 'ok' : 'wait'}
      >
        <div className="flex flex-wrap gap-2">
          {!manager && !dossier.registration ? (
            <Button
              type="button"
              onClick={() =>
                void send(
                  `/api/v1/conferences/${conferenceId}/register`,
                  {} as BodyInit,
                  true,
                )
              }
            >
              {t('dossier.register')}
            </Button>
          ) : null}
          {manager &&
          createdById &&
          dossier.registration?.status === 'REQUESTED' &&
          !underCheck &&
          !paymentValidated ? (
            <Button
              type="button"
              onClick={() =>
                void send(
                  `/api/v1/conferences/${conferenceId}/registrations/${createdById}/verify`,
                  {} as BodyInit,
                  true,
                )
              }
            >
              {t('dossier.confirmRegistration')}
            </Button>
          ) : null}
          {registeredNow ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void download(`/api/v1/papers/${paperId}/certificate`, 'certificate.pdf')
                }
              >
                {t('dossier.downloadCertificate')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void download(`/api/v1/papers/${paperId}/receipt`, 'receipt.pdf')
                }
              >
                {t('dossier.downloadReceipt')}
              </Button>
            </>
          ) : null}
        </div>
      </StagePanel>

      {dossier.paymentsEnabled ? (
        <div className="space-y-3">
          <PaperFileSlot
            paperId={paperId}
            title={t('dossier.uploadReceipt')}
            hint={t('dossier.paymentUploadHint')}
            kind="PAYMENT_PROOF"
            file={dossier.files.find((item) => item.kind === 'PAYMENT_PROOF') ?? null}
            accept="application/pdf,image/png,image/jpeg"
            uploadLabel={t('dossier.uploadReceipt')}
            onUpload={
              manager || paymentValidated
                ? undefined
                : (file) => upload(`/api/v1/papers/${paperId}/payment-proof`, file)
            }
            done={dossier.paymentProof}
          />
          {dossier.paymentProof ? (
            <PaperFilesStrip
              paperId={paperId}
              files={dossier.files}
              kinds={['PAYMENT_PROOF']}
            />
          ) : null}
          <StagePanel
            title={t('dossier.paymentStatus')}
            hint={
              underCheck
                ? t('dossier.underCheckReceiptHint')
                : paymentValidated
                  ? t('dossier.paymentValidatedHint')
                  : t('dossier.paymentUploadHint')
            }
            status={paymentLabel(t, paymentStatus, dossier.paymentProof)}
            statusTone={paymentValidated ? 'ok' : underCheck ? 'wait' : 'missing'}
          >
            <div className="flex flex-wrap gap-2">
              {manager && underCheck ? (
                <Button
                  type="button"
                  onClick={() =>
                    void send(
                      `/api/v1/papers/${paperId}/payment/verify`,
                      {} as BodyInit,
                      true,
                    )
                  }
                >
                  {t('dossier.validatePayment')}
                </Button>
              ) : null}
              {!manager && underCheck ? (
                <p className="text-sm font-semibold text-[#5c6578]">
                  {t('dossier.underCheckReceiptWaiting')}
                </p>
              ) : null}
              {paymentValidated ? (
                <p className="text-sm font-extrabold text-[#1f7a4d]">
                  {t('dossier.paymentValidated')}
                </p>
              ) : null}
            </div>
          </StagePanel>
        </div>
      ) : null}
    </div>
  );
}

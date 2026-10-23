import { useTranslation } from 'react-i18next';
import { PaperFileThumb } from '@/components/paper-file-preview';
import type { PaperDossier } from '@/components/paper-workflow';
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
  const underCheck =
    paymentStatus === 'PENDING' ||
    (dossier.paymentProof && paymentStatus !== 'VERIFIED');
  const paymentValidated = paymentStatus === 'VERIFIED';
  const registeredNow =
    dossier.registration?.status === 'VERIFIED' &&
    (!dossier.paymentsEnabled || paymentValidated);
  const registeredRequest = dossier.registration?.status === 'REQUESTED';
  const authorCanUpload =
    !manager && Boolean(dossier.registration) && !paymentValidated;

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
    <div className="mt-4 space-y-4">
      <ol className="grid gap-3 text-sm">
        <li className="rounded-xl border border-[#e4e7ee] bg-white p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8b909a]">
            1 · {t('dossier.registration')}
          </p>
          <p className="mt-1 text-sm font-extrabold text-[#1c2744]">
            {registeredNow
              ? t('dossier.registered')
              : registeredRequest
                ? t('dossier.registrationSent')
                : t('dossier.openForRegistration')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
            registeredRequest &&
            !dossier.paymentsEnabled &&
            !registeredNow ? (
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
                    void download(
                      `/api/v1/papers/${paperId}/certificate`,
                      'certificate.pdf',
                    )
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
        </li>

        {dossier.paymentsEnabled ? (
          <li className="rounded-xl border border-[#3d4fd4]/25 bg-[#f5f7ff] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#3d4fd4]">
                  2 · {t('dossier.uploadReceipt')}
                </p>
                <p className="mt-1 text-sm font-semibold text-[#5c6578]">
                  {t('dossier.paymentUploadHint')}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                  paymentValidated
                    ? 'bg-[#2fbf71]/14 text-[#1c9a57]'
                    : underCheck
                      ? 'bg-[#fff4e8] text-[#c47a1a]'
                      : 'bg-white text-[#8b909a]'
                }`}
              >
                {paymentLabel(t, paymentStatus, dossier.paymentProof)}
              </span>
            </div>
            <div className="mt-3">
              {dossier.paymentProof ? (
                <PaperFileThumb
                  paperId={paperId}
                  file={
                    dossier.files.find((item) => item.kind === 'PAYMENT_PROOF')!
                  }
                  compact
                />
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#c5cad6] bg-white px-3 py-3 text-[#8b909a]">
                  <span className="text-sm font-semibold">{t('dossier.missing')}</span>
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {authorCanUpload ? (
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4]">
                  {dossier.paymentProof
                    ? t('dossier.replaceFile')
                    : t('dossier.uploadReceipt')}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    aria-label={t('dossier.uploadReceipt')}
                    className="sr-only"
                    onChange={(event) => {
                      const next = event.target.files?.[0];
                      if (next) {
                        upload(`/api/v1/papers/${paperId}/payment-proof`, next);
                      }
                      event.target.value = '';
                    }}
                  />
                </label>
              ) : null}
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
                <p className="self-center text-sm font-semibold text-[#5c6578]">
                  {t('dossier.underCheckReceiptWaiting')}
                </p>
              ) : null}
            </div>
          </li>
        ) : (
          <li className="rounded-xl border border-dashed border-[#d0d5e0] bg-[#fafbfc] p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#8b909a]">
              2 · {t('dossier.paymentStatus')}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#5c6578]">
              {t('dossier.paymentNotRequiredHint')}
            </p>
          </li>
        )}
      </ol>
    </div>
  );
}

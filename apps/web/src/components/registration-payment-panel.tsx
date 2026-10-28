import { useTranslation } from 'react-i18next';
import { PaperFilePeek, PaperFileThumb } from '@/components/paper-file-preview';
import type { PaperDossier } from '@/components/paper-workflow';
import { InfoCards, PageSection, PageSplit } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';
import { isRegistrationComplete } from '@/features/papers/registration';
import { formatMoney } from '@/lib/money';
import {
  downloadPaperDocument,
  printPaperDocument,
} from '@/lib/paper-document';
import { apiErrorMessage, apiFetch } from '@/services/api';

function PaymentAmountCard({
  amount,
  currency,
}: {
  amount: number | null | undefined;
  currency?: string | null;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="rounded-xl border border-[#e4e7ee] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(28,39,68,0.06)]">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#3d4fd4]">
        {t('dossier.paymentAmount')}
      </p>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-[#1c2744]">
        {formatMoney(amount, currency ?? 'EUR', i18n.language)}
      </p>
    </div>
  );
}

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
  manager = false,
  variant = 'panel',
}: {
  paperId: string;
  conferenceId: string;
  createdById?: string | null;
  dossier: PaperDossier;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  manager?: boolean;
  variant?: 'page' | 'panel';
}) {
  const { t, i18n } = useTranslation();
  const feedback = useFeedback();
  const paymentStatus = dossier.registration?.paymentStatus;
  const underCheck =
    paymentStatus === 'PENDING' ||
    (dossier.paymentProof && paymentStatus !== 'VERIFIED');
  const paymentValidated = paymentStatus === 'VERIFIED';
  const registeredNow = isRegistrationComplete(dossier);
  const registeredRequest = dossier.registration?.status === 'REQUESTED';
  const authorCanUpload =
    !manager &&
    dossier.paymentsEnabled &&
    (!paymentValidated || !dossier.paymentProof);

  async function send(path: string, body?: BodyInit, json = false) {
    const response = await apiFetch(path, {
      method: 'POST',
      body: json ? JSON.stringify(body ?? {}) : body,
    });
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('workflow.saved'));
    await onChanged();
  }

  function upload(path: string, file: File) {
    const form = new FormData();
    form.set('file', file);
    void send(path, form);
  }

  async function download(path: string, name: string) {
    try {
      await downloadPaperDocument(path, name);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('common.error'));
    }
  }

  async function printDoc(path: string) {
    try {
      await printPaperDocument(path);
    } catch (error) {
      onError(error instanceof Error ? error.message : t('common.error'));
    }
  }

  const registrationStatus = registeredNow
    ? t('dossier.registered')
    : registeredRequest
      ? t('dossier.registrationSent')
      : t('dossier.openForRegistration');
  const paymentStatusLabel = dossier.paymentsEnabled
    ? paymentLabel(t, paymentStatus, dossier.paymentProof)
    : t('dossier.paymentNotRequired');
  const receiptFile = dossier.files.find((item) => item.kind === 'PAYMENT_PROOF');
  const registerActions = (
    <div className="mt-5 flex flex-wrap gap-2">
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
              void download(`/api/v1/papers/${paperId}/certificate`, 'certificate.pdf')
            }
          >
            {t('dossier.downloadCertificate')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void printDoc(`/api/v1/papers/${paperId}/certificate`)
            }
          >
            {t('dossier.printCertificate')}
          </Button>
        </>
      ) : null}
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
            void send(`/api/v1/papers/${paperId}/payment/verify`, {} as BodyInit, true)
          }
        >
          {t('dossier.validatePayment')}
        </Button>
      ) : null}
    </div>
  );

  if (variant === 'page') {
    const left = (
      <PageSection
        hint={
          paymentValidated
            ? undefined
            : dossier.paymentsEnabled
              ? t('dossier.paymentUploadHint')
              : t('dossier.paymentNotRequiredHint')
        }
      >
        <InfoCards
          items={[
            { label: t('dossier.registration'), value: registrationStatus },
            { label: t('dossier.paymentStatus'), value: paymentStatusLabel },
          ]}
        />
        {!manager && underCheck ? (
          <p className="mt-4 text-sm font-medium text-[#9a6410]">
            {t('dossier.underCheckReceiptWaiting')}
          </p>
        ) : null}
        {registerActions}
      </PageSection>
    );
    const receipt = receiptFile ? (
      <PaperFilePeek paperId={paperId} file={receiptFile} />
    ) : (
      <PageSection title={t('dossier.downloadReceipt')}>
        <p className="text-sm font-medium text-[#8b909a]">{t('dossier.missing')}</p>
      </PageSection>
    );
    if (!dossier.paymentsEnabled) {
      return <PageSplit left={left} right={receipt} />;
    }
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.8fr)_auto] lg:items-start">
        <div className="lg:pr-2">{left}</div>
        <div className="lg:border-l lg:border-[#eef0f4] lg:pl-8">{receipt}</div>
        <div className="lg:border-l lg:border-[#eef0f4] lg:pl-8">
          <PaymentAmountCard
            amount={dossier.paymentAmount}
            currency={dossier.paymentCurrency}
          />
        </div>
      </div>
    );
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
                    void printDoc(`/api/v1/papers/${paperId}/certificate`)
                  }
                >
                  {t('dossier.printCertificate')}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void printDoc(`/api/v1/papers/${paperId}/receipt`)
                  }
                >
                  {t('dossier.printReceipt')}
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
                <p className="mt-2 text-lg font-extrabold tabular-nums text-[#1c2744]">
                  {formatMoney(
                    dossier.paymentAmount,
                    dossier.paymentCurrency ?? 'EUR',
                    i18n.language,
                  )}
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

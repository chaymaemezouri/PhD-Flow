import { FileText, Image as ImageIcon, Presentation, Maximize2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

export interface PaperFileInfo {
  kind: string;
  originalName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}

function filePath(paperId: string, kind: string) {
  return kind === 'MANUSCRIPT'
    ? `/api/v1/papers/${paperId}/manuscript`
    : `/api/v1/papers/${paperId}/files/${encodeURIComponent(kind)}`;
}

function isPdf(file: PaperFileInfo) {
  const type = (file.contentType ?? '').toLowerCase();
  const name = file.originalName.toLowerCase();
  return (
    type.includes('pdf') ||
    name.endsWith('.pdf') ||
    file.kind === 'CAMERA_READY' ||
    file.kind === 'SIMILARITY' ||
    file.kind === 'MANUSCRIPT' ||
    file.kind === 'COPYRIGHT'
  );
}

function isImage(file: PaperFileInfo) {
  const type = (file.contentType ?? '').toLowerCase();
  return type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.originalName);
}

function isSlides(file: PaperFileInfo) {
  const type = (file.contentType ?? '').toLowerCase();
  return (
    type.includes('presentation') ||
    type.includes('powerpoint') ||
    /\.(ppt|pptx)$/i.test(file.originalName) ||
    file.kind === 'SLIDES'
  );
}

function usePaperFileUrl(paperId: string, kind: string, asPdf: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setUrl(null);
    void apiFetch(filePath(paperId, kind))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) {
          throw new Error('empty file');
        }
        const headerType = response.headers.get('content-type') ?? '';
        const type =
          asPdf || headerType.includes('pdf')
            ? 'application/pdf'
            : headerType || 'application/octet-stream';
        objectUrl = URL.createObjectURL(new Blob([buffer], { type }));
        if (active) {
          setUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setUrl(null);
        }
      });
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [asPdf, kind, paperId, tick]);

  return {
    url,
    failed,
    retry: () => setTick((value) => value + 1),
  };
}

export function PaperFileThumb({
  paperId,
  file,
  className,
  compact = false,
}: {
  paperId: string;
  file: PaperFileInfo;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pdf = isPdf(file);
  const image = isImage(file);
  const slides = isSlides(file);
  const { url, failed, retry } = usePaperFileUrl(paperId, file.kind, pdf && !image);
  const label = t(`dossier.fileKinds.${file.kind}`, { defaultValue: file.kind });
  const size =
    typeof file.sizeBytes === 'number' && file.sizeBytes > 0
      ? `${Math.max(1, Math.ceil(file.sizeBytes / 1024))} Ko`
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[#c5cad6] bg-white text-left shadow-[0_4px_14px_rgba(28,39,68,0.06)] transition hover:border-[#3d4fd4]',
          compact ? 'w-full flex-row' : 'w-[8.5rem]',
          className,
        )}
      >
        <div
          className={cn(
            'relative overflow-hidden bg-[#eef1f8]',
            compact ? 'h-24 w-20 shrink-0' : 'h-32 w-full',
          )}
        >
          {url && pdf ? (
            <object
              data={`${url}#page=1&view=FitH&toolbar=0&navpanes=0`}
              type="application/pdf"
              className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
              aria-label={file.originalName}
            >
              <div className="grid h-full place-items-center text-[#3d4fd4]">
                <FileText className="size-8" />
              </div>
            </object>
          ) : url && image ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-[#3d4fd4]">
              {slides ? (
                <Presentation className="size-8" />
              ) : image ? (
                <ImageIcon className="size-8" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <FileText className="size-8" />
                  <span className="rounded bg-[#5d74ff] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                    {pdf ? 'PDF' : slides ? 'PPT' : 'FILE'}
                  </span>
                </div>
              )}
            </div>
          )}
          <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-white/90 text-[#3d4fd4] opacity-0 shadow group-hover:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </div>
        <div className={cn('min-w-0 space-y-0.5 px-2.5 py-2', compact && 'flex-1')}>
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-[#3d4fd4]">
            {label}
          </p>
          <p className="truncate text-xs font-bold text-[#1c2744]">{file.originalName}</p>
          {size ? <p className="text-[10px] font-bold text-[#8b909a]">{size}</p> : null}
          {!url && !failed ? (
            <p className="text-[10px] font-bold text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:w-[min(100%-1.5rem,52rem)]">
          <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
            {label}
          </DialogTitle>
          <DialogDescription className="mt-1 break-all text-sm text-[#5c6578]">
            {file.originalName}
          </DialogDescription>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#d8dce6] bg-[#f6f7fb]">
            {url && pdf ? (
              <object
                data={`${url}#toolbar=1`}
                type="application/pdf"
                className="h-[min(70vh,36rem)] w-full bg-white"
                aria-label={file.originalName}
              >
                <iframe
                  title={file.originalName}
                  src={`${url}#toolbar=1`}
                  className="h-[min(70vh,36rem)] w-full bg-white"
                />
              </object>
            ) : url && image ? (
              <img
                src={url}
                alt={file.originalName}
                className="mx-auto max-h-[70vh] object-contain"
              />
            ) : url ? (
              <div className="grid place-items-center gap-3 px-4 py-10 text-center">
                <FileText className="size-10 text-[#3d4fd4]" />
                <p className="text-sm font-bold text-[#5c6578]">
                  {t('dossier.fileOpenHint')}
                </p>
              </div>
            ) : (
              <div className="grid place-items-center gap-3 px-4 py-10 text-center">
                <p className="text-sm text-[#8b909a]">
                  {failed ? t('dossier.fileUnavailable') : t('common.loading')}
                </p>
                {failed ? (
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex min-h-10 items-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4]"
                  >
                    {t('dossier.fileRetry')}
                  </button>
                ) : null}
              </div>
            )}
          </div>
          {url ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center rounded-full bg-[#5d74ff] px-4 text-sm font-extrabold text-white no-underline"
              >
                {t('dossier.fileOpenTab')}
              </a>
              <a
                href={url}
                download={file.originalName}
                className="inline-flex min-h-10 items-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4] no-underline"
              >
                {t('dossier.downloadFile')}
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PaperFilesStrip({
  paperId,
  files,
  kinds,
}: {
  paperId: string;
  files: PaperFileInfo[];
  kinds?: string[];
}) {
  const { t } = useTranslation();
  const visible = useMemo(() => {
    const rows = kinds ? files.filter((file) => kinds.includes(file.kind)) : files;
    return rows;
  }, [files, kinds]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
        {t('dossier.filesOnRecord')}
      </p>
      <div className="touch-scroll mt-2 flex gap-3 overflow-x-auto pb-1">
        {visible.map((file) => (
          <PaperFileThumb
            key={`${file.kind}-${file.originalName}`}
            paperId={paperId}
            file={file}
          />
        ))}
      </div>
    </div>
  );
}

export function PaperFileSlot({
  paperId,
  title,
  hint,
  file,
  accept = 'application/pdf',
  uploadLabel,
  onUpload,
  done,
}: {
  paperId: string;
  title: string;
  hint?: string;
  kind: string;
  file?: PaperFileInfo | null;
  accept?: string;
  uploadLabel: string;
  onUpload?: (file: File) => void;
  done?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#1c2744]">{title}</p>
          {hint ? (
            <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">{hint}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            done || file ? 'bg-[#2fbf71]/14 text-[#1c9a57]' : 'bg-white text-[#8b909a]'
          }`}
        >
          {done || file ? t('dossier.ready') : t('dossier.missing')}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        {file ? (
          <PaperFileThumb paperId={paperId} file={file} compact className="sm:max-w-xs" />
        ) : (
          <div className="grid h-24 w-20 place-items-center rounded-2xl border border-dashed border-[#c5cad6] bg-white text-[#8b909a]">
            <FileText className="size-7" />
          </div>
        )}
        {onUpload ? (
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4]">
            {file ? t('dossier.replaceFile') : uploadLabel}
            <input
              type="file"
              accept={accept}
              aria-label={uploadLabel}
              className="sr-only"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) {
                  onUpload(next);
                }
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

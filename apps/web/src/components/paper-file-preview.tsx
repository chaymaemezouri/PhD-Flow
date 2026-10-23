import { Download, ExternalLink, FileText, Image as ImageIcon, Presentation } from 'lucide-react';
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

function usePaperFileUrl(paperId: string, kind: string, asPdf: boolean, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
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
  }, [asPdf, enabled, kind, paperId, tick]);

  return {
    url,
    failed,
    retry: () => setTick((value) => value + 1),
  };
}

function FileGlyph({ image, slides }: { image: boolean; slides: boolean }) {
  if (slides) {
    return <Presentation className="size-5" strokeWidth={2.25} />;
  }
  if (image) {
    return <ImageIcon className="size-5" strokeWidth={2.25} />;
  }
  return <FileText className="size-5" strokeWidth={2.25} />;
}

function typeBadge(pdf: boolean, image: boolean, slides: boolean) {
  if (slides) return 'PPT';
  if (image) return 'IMG';
  if (pdf) return 'PDF';
  return 'FILE';
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
  const { url, failed, retry } = usePaperFileUrl(
    paperId,
    file.kind,
    pdf && !image,
    open,
  );
  const label = t(`dossier.fileKinds.${file.kind}`, { defaultValue: file.kind });
  const size =
    typeof file.sizeBytes === 'number' && file.sizeBytes > 0
      ? `${Math.max(1, Math.ceil(file.sizeBytes / 1024))} Ko`
      : null;
  const badge = typeBadge(pdf, image, slides);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl border border-[#e4e7ee] bg-white px-3 py-3 text-left transition hover:border-[#3d4fd4]/55 hover:bg-[#f8f9fd]',
          compact ? '' : '',
          className,
        )}
      >
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-lg',
            pdf
              ? 'bg-[#eef2ff] text-[#3d4fd4]'
              : slides
                ? 'bg-[#fff4e8] text-[#c47a1a]'
                : image
                  ? 'bg-[#e8f8ef] text-[#1c9a57]'
                  : 'bg-[#f0f2f7] text-[#5c6578]',
          )}
        >
          <FileGlyph image={image} slides={slides} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-xs font-extrabold uppercase tracking-wide text-[#3d4fd4]">
              {label}
            </span>
            <span className="shrink-0 rounded bg-[#f0f2f7] px-1.5 py-0.5 text-[10px] font-extrabold text-[#5c6578]">
              {badge}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-[#1c2744]">
            {file.originalName}
          </span>
          {size ? (
            <span className="mt-0.5 block text-[11px] font-semibold text-[#8b909a]">
              {size}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs font-extrabold text-[#3d4fd4] opacity-0 transition group-hover:opacity-100">
          {t('dossier.fileOpenTab')}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:w-[min(100%-1.5rem,52rem)]">
          <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
            {label}
          </DialogTitle>
          <DialogDescription className="mt-1 break-all text-sm text-[#5c6578]">
            {file.originalName}
            {size ? ` · ${size}` : ''}
          </DialogDescription>
          <div className="mt-4 overflow-hidden rounded-xl border border-[#e4e7ee] bg-[#f6f7fb]">
            {url && pdf ? (
              <iframe
                title={file.originalName}
                src={`${url}#toolbar=1&navpanes=0`}
                className="h-[min(70vh,36rem)] w-full border-0 bg-white"
              />
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
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
              >
                <ExternalLink className="size-3.5" />
                {t('dossier.fileOpenTab')}
              </a>
              <a
                href={url}
                download={file.originalName}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4] no-underline"
              >
                <Download className="size-3.5" />
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
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {visible.map((file) => (
          <li key={`${file.kind}-${file.originalName}`}>
            <PaperFileThumb paperId={paperId} file={file} />
          </li>
        ))}
      </ul>
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
    <div className="rounded-xl border border-[#e4e7ee] bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#1c2744]">{title}</p>
          {hint ? (
            <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">{hint}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            done || file ? 'bg-[#2fbf71]/14 text-[#1c9a57]' : 'bg-[#f0f2f7] text-[#8b909a]'
          }`}
        >
          {done || file ? t('dossier.ready') : t('dossier.missing')}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {file ? (
          <PaperFileThumb paperId={paperId} file={file} compact />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-[#d0d5e0] bg-[#fafbfc] px-3 py-3 text-[#8b909a]">
            <span className="grid size-11 place-items-center rounded-lg bg-white">
              <FileText className="size-5" />
            </span>
            <span className="text-sm font-semibold">{t('dossier.missing')}</span>
          </div>
        )}
        {onUpload ? (
          <label className="inline-flex min-h-10 w-fit cursor-pointer items-center justify-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4]">
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

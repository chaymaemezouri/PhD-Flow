import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type Tone = 'ok' | 'error';

interface FeedbackApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('ok');

  const show = useCallback((next: string, nextTone: Tone) => {
    setMessage(next);
    setTone(nextTone);
    setOpen(true);
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (text) => show(text, 'ok'),
      error: (text) => show(text, 'error'),
    }),
    [show],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[90] inset-auto top-1/2 left-1/2 max-h-[min(90vh,24rem)] w-[min(100%-1.5rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-6 pb-6"
        >
          <DialogTitle
            className={
              tone === 'ok'
                ? 'pr-10 text-lg font-extrabold text-[#1c9a57]'
                : 'pr-10 text-lg font-extrabold text-[#c54545]'
            }
          >
            {tone === 'ok' ? t('common.done') : t('common.error')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-semibold leading-relaxed text-[#1c2744]">
            {message}
          </DialogDescription>
          <div className="mt-5">
            <Button type="button" onClick={() => setOpen(false)}>
              {t('common.ok')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }
  return ctx;
}

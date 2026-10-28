import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';

interface FeedbackApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (text) =>
        toast.success(t('common.done'), {
          description: text,
          duration: 4200,
        }),
      error: (text) =>
        toast.error(t('common.error'), {
          description: text,
          duration: 6500,
        }),
    }),
    [t],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Toaster
        position="top-center"
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'rounded-2xl border border-[#e4e7ee] bg-white font-semibold text-[#1c2744] shadow-[0_12px_32px_rgba(28,39,68,0.12)]',
            title: 'font-extrabold text-[#1c2744]',
            description: 'font-semibold text-[#5c6578]',
            success: 'border-[#b8e6cb]',
            error: 'border-[#f3b4b4]',
            closeButton: 'border-[#e4e7ee] bg-white text-[#5c6578]',
          },
        }}
      />
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { FeedbackProvider } from '@/features/feedback/feedback';
import { PreferencesProvider } from '@/features/preferences/preferences-context';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <FeedbackProvider>
          {children}
        </FeedbackProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

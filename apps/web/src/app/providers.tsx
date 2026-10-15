import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
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
        {children}
        <Toaster position="bottom-right" />
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

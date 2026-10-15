import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-serif-4/500.css';
import '@fontsource/source-serif-4/600.css';
import { router } from '@/app/router';
import { AppProviders } from '@/app/providers';
import '@/lib/i18n';
import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

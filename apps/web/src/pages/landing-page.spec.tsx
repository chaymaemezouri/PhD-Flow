import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '@/app/router';
import { PreferencesProvider } from '@/features/preferences/preferences-context';
import '@/lib/i18n';

describe('Home entry', () => {
  it('opens the sign-in page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PreferencesProvider>
          <RouterProvider router={router} />
        </PreferencesProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Sign in' },
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create account' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

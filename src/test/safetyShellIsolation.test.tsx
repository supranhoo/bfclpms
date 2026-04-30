import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Shell-isolation smoke test.
 *
 * Ensures the Safety shell never imports or renders PMS layout primitives
 * (and vice versa). We do this by inspecting the Safety component module
 * graph for forbidden symbols rather than spinning up a full render that
 * would require mocking auth + Supabase.
 */
describe('Safety shell isolation', () => {
  it('SafetyLayout / Sidebar do NOT import PMS chrome', async () => {
    const layoutSrc = await import('@/components/safety/SafetyLayout?raw');
    const sidebarSrc = await import('@/components/safety/SafetySidebar?raw');

    const forbidden = ['AppSidebar', 'DashboardLayout', 'MinimalHeader'];
    const sources = [layoutSrc.default, sidebarSrc.default];

    for (const src of sources) {
      for (const sym of forbidden) {
        expect(src).not.toMatch(new RegExp(`from\\s+['"][^'"]*${sym}['"]`));
      }
    }
  });

  it('PMS DashboardLayout does NOT import Safety chrome', async () => {
    const dashSrc = await import('@/components/layout/DashboardLayout?raw');
    expect(dashSrc.default).not.toMatch(/from\s+['"][^'"]*safety\//i);
  });

  it('SafetyHome page renders without throwing', async () => {
    const { default: SafetyHome } = await import('@/pages/safety/SafetyHome');
    // SafetyHome uses TanStack Query (Phase 1.F dashboard tiles) — wrap in
    // a QueryClientProvider so the hook can mount. Network calls fail
    // safely in jsdom; we only assert the component does not throw.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<SafetyHome />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(container.textContent).toMatch(/Safety/i);
  });
});
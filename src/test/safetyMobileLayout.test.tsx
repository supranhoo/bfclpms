import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafetyMobileListCard } from '@/components/safety/SafetyMobileListCard';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';

/**
 * Mobile UX regression guard for the Safety module.
 *
 * - Verifies the mobile primitives expose the required tap targets and
 *   semantics (so the Worker / Supervisor experience can never silently
 *   regress to desktop-only layouts).
 * - Mocks `useIsMobile` to flip between mobile/desktop and asserts the
 *   sticky action bar conditional rendering.
 */

const isMobileMock = vi.fn();
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobileMock(),
}));

describe('Safety mobile primitives', () => {
  beforeEach(() => {
    isMobileMock.mockReset();
  });

  it('SafetyMobileListCard renders title, subtitle, badges and is tappable', () => {
    const onClick = vi.fn();
    render(
      <SafetyMobileListCard
        title="INC-101 · Slip in shop"
        subtitle="Near miss · High"
        meta="Bay 3"
        badges={<span data-testid="badge">badge</span>}
        onClick={onClick}
      />,
    );
    expect(screen.getByText(/INC-101/)).toBeTruthy();
    expect(screen.getByText(/Near miss/)).toBeTruthy();
    expect(screen.getByText('Bay 3')).toBeTruthy();
    expect(screen.getByTestId('badge')).toBeTruthy();

    const btn = screen.getByRole('button');
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('SafetyStickyActionBar renders ONLY on mobile', () => {
    isMobileMock.mockReturnValue(false);
    const { rerender, queryByTestId } = render(
      <SafetyStickyActionBar>
        <button>Submit</button>
      </SafetyStickyActionBar>,
    );
    expect(queryByTestId('safety-sticky-action-bar')).toBeNull();

    isMobileMock.mockReturnValue(true);
    rerender(
      <SafetyStickyActionBar>
        <button>Submit</button>
      </SafetyStickyActionBar>,
    );
    expect(queryByTestId('safety-sticky-action-bar')).not.toBeNull();
  });

  it('SafetyStickyActionBar honours forceVisible regardless of breakpoint', () => {
    isMobileMock.mockReturnValue(false);
    render(
      <SafetyStickyActionBar forceVisible>
        <button>Always</button>
      </SafetyStickyActionBar>,
    );
    expect(screen.getByTestId('safety-sticky-action-bar')).toBeTruthy();
  });
});
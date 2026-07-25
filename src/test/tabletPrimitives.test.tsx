import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabletKpiRowCard } from '@/components/review/tablet/TabletKpiRowCard';
import { TabletScoreEntry } from '@/components/review/tablet/TabletScoreEntry';
import { TabletFilterSheet } from '@/components/review/tablet/TabletFilterSheet';
import { TabletStickyActionBar } from '@/components/review/tablet/TabletStickyActionBar';

/**
 * ADR-170 §5 — Regression guard for tablet primitives.
 * Ensures tap-target contract (min-h-11 / min-w-11 = 44pt) and semantic
 * structure survive future refactors.
 */

const isMobileMock = vi.fn();
const isTabletMock = vi.fn();
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => isMobileMock() }));
vi.mock('@/hooks/use-tablet', () => ({ useIsTablet: () => isTabletMock() }));

describe('TabletKpiRowCard', () => {
  it('renders header, metrics and calls onClick', () => {
    const onClick = vi.fn();
    render(
      <TabletKpiRowCard
        categoryName="Ops"
        categoryColor="#123"
        kraName="Plant safety"
        kpiName="Zero LTI hours"
        target="1000"
        current="980"
        score="4"
        weightagePct={20}
        onClick={onClick}
      />,
    );
    expect(screen.getByText('Ops')).toBeTruthy();
    expect(screen.getByText('Plant safety')).toBeTruthy();
    expect(screen.getByText('Zero LTI hours')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TabletScoreEntry', () => {
  it('renders R1–R5 as 44pt radios and reports selection', () => {
    const onRatingChange = vi.fn();
    render(
      <TabletScoreEntry
        value="42"
        onChange={() => {}}
        rating={3}
        onRatingChange={onRatingChange}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    radios.forEach((r) => {
      expect(r.className).toMatch(/min-h-11/);
      expect(r.className).toMatch(/min-w-11/);
    });
    fireEvent.click(radios[4]);
    expect(onRatingChange).toHaveBeenCalledWith(5);
  });
});

describe('TabletFilterSheet', () => {
  it('shows an active-count badge on the trigger and is at least 44pt tall', () => {
    render(
      <TabletFilterSheet activeCount={3}>
        <div>form</div>
      </TabletFilterSheet>,
    );
    const trigger = screen.getByRole('button', { name: /Filters \(3 active\)/i });
    expect(trigger).toBeTruthy();
    expect(trigger.className).toMatch(/min-h-11/);
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('TabletStickyActionBar', () => {
  beforeEach(() => {
    isMobileMock.mockReset();
    isTabletMock.mockReset();
  });

  it('renders when tablet band is active', () => {
    isMobileMock.mockReturnValue(false);
    isTabletMock.mockReturnValue(true);
    render(
      <TabletStickyActionBar includeMobile={false}>
        <button>Save</button>
      </TabletStickyActionBar>,
    );
    expect(screen.getByTestId('tablet-sticky-action-bar')).toBeTruthy();
  });

  it('is hidden on desktop unless forceVisible', () => {
    isMobileMock.mockReturnValue(false);
    isTabletMock.mockReturnValue(false);
    const { queryByTestId, rerender } = render(
      <TabletStickyActionBar includeMobile={false}>
        <button>Save</button>
      </TabletStickyActionBar>,
    );
    expect(queryByTestId('tablet-sticky-action-bar')).toBeNull();
    rerender(
      <TabletStickyActionBar includeMobile={false} forceVisible>
        <button>Save</button>
      </TabletStickyActionBar>,
    );
    expect(queryByTestId('tablet-sticky-action-bar')).not.toBeNull();
  });
});
import { describe, it, expect } from 'vitest';
import { trailingWindow, recentMonthOptions } from '@/hooks/usePIPCandidates';

const TODAY = new Date(2026, 6, 30); // 30 Jul 2026

describe('trailingWindow', () => {
  it('defaults to the previous complete month when no anchor is given', () => {
    expect(trailingWindow(3, TODAY)).toEqual({
      fromMonth: 'April', fromYear: 2026, toMonth: 'June', toYear: 2026,
    });
  });

  it('ends at the anchor month when one is supplied', () => {
    expect(trailingWindow(3, TODAY, { month: 'April', year: 2026 })).toEqual({
      fromMonth: 'February', fromYear: 2026, toMonth: 'April', toYear: 2026,
    });
  });

  it('rolls the year back across January', () => {
    expect(trailingWindow(6, TODAY, { month: 'February', year: 2026 })).toEqual({
      fromMonth: 'September', fromYear: 2025, toMonth: 'February', toYear: 2026,
    });
  });

  it('supports a single-month window', () => {
    expect(trailingWindow(1, TODAY, { month: 'May', year: 2026 })).toEqual({
      fromMonth: 'May', fromYear: 2026, toMonth: 'May', toYear: 2026,
    });
  });

  it('falls back to the default window for an unknown anchor month', () => {
    expect(trailingWindow(3, TODAY, { month: 'Smarch', year: 2026 })).toEqual(
      trailingWindow(3, TODAY),
    );
  });
});

describe('recentMonthOptions', () => {
  it('lists complete months newest first, starting at last month', () => {
    const opts = recentMonthOptions(3, TODAY);
    expect(opts).toEqual([
      { month: 'June', year: 2026 },
      { month: 'May', year: 2026 },
      { month: 'April', year: 2026 },
    ]);
  });

  it('rolls back over the year boundary', () => {
    const opts = recentMonthOptions(14, TODAY);
    expect(opts[13]).toEqual({ month: 'May', year: 2025 });
  });
});

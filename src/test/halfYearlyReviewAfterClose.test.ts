import { describe, it, expect } from 'vitest';
import { resolveEffectiveCycleOption, HALF_YEARLY_OPTIONS } from '@/lib/frequencyCycleOptions';
import { getActiveMonthForCycle, getCycleMonths } from '@/lib/frequencyUtils';

describe('Half-Yearly "Review in Apr & Oct" cycle (May-Oct)', () => {
  it('exposes the new option in HALF_YEARLY_OPTIONS', () => {
    const opt = HALF_YEARLY_OPTIONS.find(o => o.value === 'May-Oct');
    expect(opt).toBeDefined();
    expect(opt!.activeMonth).toBe(10);
    expect(opt!.lockedMonths).toEqual({ H1: [5,6,7,8,9], H2: [11,12,1,2,3] });
  });

  it('resolves the per-KPI override', () => {
    const opt = resolveEffectiveCycleOption('Half-Yearly', 'May-Oct');
    expect(opt?.value).toBe('May-Oct');
  });

  it('terminal month is October for H1 (May–Oct)', () => {
    expect(getActiveMonthForCycle('Half-Yearly', 'May', 2026, 'May-Oct')).toBe('October');
    expect(getActiveMonthForCycle('Half-Yearly', 'September', 2026, 'May-Oct')).toBe('October');
    expect(getActiveMonthForCycle('Half-Yearly', 'October', 2026, 'May-Oct')).toBe('October');
  });

  it('terminal month is April for H2 (Nov–Apr) — handles year wrap', () => {
    expect(getActiveMonthForCycle('Half-Yearly', 'November', 2025, 'May-Oct')).toBe('April');
    expect(getActiveMonthForCycle('Half-Yearly', 'January', 2026, 'May-Oct')).toBe('April');
    expect(getActiveMonthForCycle('Half-Yearly', 'April', 2026, 'May-Oct')).toBe('April');
  });

  it('cycle membership covers the full 6 months', () => {
    expect(getCycleMonths('Half-Yearly', 'July', 2026, 'May-Oct').sort()).toEqual(
      ['August','July','June','May','October','September'].sort()
    );
  });
});
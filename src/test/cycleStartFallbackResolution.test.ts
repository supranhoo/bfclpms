import { describe, it, expect } from 'vitest';
import {
  deriveCycleOptionFromCycleStart,
  resolveEffectiveCycleOption,
} from '@/lib/frequencyCycleOptions';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';

// ADR-087 — client/DB parity for non-standard frequency_cycle_start anchors.

describe('deriveCycleOptionFromCycleStart', () => {
  it('Bi-Monthly May-Jun → terminal June, May locked', () => {
    const opt = deriveCycleOptionFromCycleStart('Bi-Monthly', 'May-Jun')!;
    expect(opt.activeMonth).toBe(6);
    expect(opt.lockedMonths['May-Jun']).toEqual([5]);
  });

  it('Bi-Monthly Mar-Apr → terminal April', () => {
    const opt = deriveCycleOptionFromCycleStart('Bi-Monthly', 'Mar-Apr')!;
    expect(opt.activeMonth).toBe(4);
    expect(opt.lockedMonths['Mar-Apr']).toEqual([3]);
  });

  it('Quarterly Mar-May → terminal May', () => {
    const opt = deriveCycleOptionFromCycleStart('Quarterly', 'Mar-May')!;
    expect(opt.activeMonth).toBe(5);
    expect(opt.lockedMonths['Mar-May']).toEqual([3, 4]);
  });

  it('Quarterly Aug-Oct → terminal October', () => {
    const opt = deriveCycleOptionFromCycleStart('Quarterly', 'Aug-Oct')!;
    expect(opt.activeMonth).toBe(10);
    expect(opt.lockedMonths['Aug-Oct']).toEqual([8, 9]);
  });

  it('Half-Yearly Nov-Apr (wrapping) → terminal April', () => {
    const opt = deriveCycleOptionFromCycleStart('Half-Yearly', 'Nov-Apr')!;
    expect(opt.activeMonth).toBe(4);
    expect(opt.lockedMonths['Nov-Apr']).toEqual([11, 12, 1, 2, 3]);
  });

  it('Monthly / Daily / Weekly return undefined', () => {
    expect(deriveCycleOptionFromCycleStart('Monthly', 'Jan')).toBeUndefined();
    expect(deriveCycleOptionFromCycleStart('Daily', null)).toBeUndefined();
  });
});

describe('resolveEffectiveCycleOption — per-KPI anchor outside hardcoded options', () => {
  it('Bi-Monthly May-Jun is honored even though only Jan-Feb/Feb-Mar are hardcoded', () => {
    const opt = resolveEffectiveCycleOption(
      'Bi-Monthly',
      'May-Jun',
      'Feb-Mar,Apr-May,Jun-Jul,Aug-Sep,Oct-Nov,Dec-Jan',
    )!;
    expect(opt.activeMonth).toBe(6);
    expect(opt.value).toBe('May-Jun');
  });

  it('Hardcoded match still wins (Jan-Feb regression guard)', () => {
    const opt = resolveEffectiveCycleOption('Bi-Monthly', 'Jan-Feb', null)!;
    expect(opt.activeMonth).toBe(2);
    expect(opt.value).toBe('Jan-Feb');
  });
});

describe('isKpiLockedForPeriod — Org KPI Data Entry visibility', () => {
  it('Bi-Monthly May-Jun KPI is LOCKED on May (terminal=June)', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'May', 2026, 'May-Jun')).toBe(true);
  });

  it('Bi-Monthly May-Jun KPI is UNLOCKED on June', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'June', 2026, 'May-Jun')).toBe(false);
  });

  it('Bi-Monthly Feb-Mar KPI stays UNLOCKED on May (Apr-May cycle terminal=May)', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'May', 2026, 'Feb-Mar')).toBe(false);
  });

  it('Quarterly Mar-May KPI is UNLOCKED on May, LOCKED on April', () => {
    expect(isKpiLockedForPeriod('Quarterly', 'May', 2026, 'Mar-May')).toBe(false);
    expect(isKpiLockedForPeriod('Quarterly', 'April', 2026, 'Mar-May')).toBe(true);
  });

  it('Half-Yearly Nov-Apr wrapping → April unlocked, March locked', () => {
    expect(isKpiLockedForPeriod('Half-Yearly', 'April', 2026, 'Nov-Apr')).toBe(false);
    expect(isKpiLockedForPeriod('Half-Yearly', 'March', 2026, 'Nov-Apr')).toBe(true);
  });
});
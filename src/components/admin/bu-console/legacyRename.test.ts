import { describe, it, expect } from 'vitest';
import {
  buildRenameArgs, defaultRenameRange, fiscalEnd, initialRenameState,
  isRenameNoop, renameMonthOptions, validateRename, type LegacyRenameState, type RenameAnchor,
} from './legacyRename';

const anchor: RenameAnchor = {
  categoryId: 'cat-1',
  oldKra: 'Production',
  oldKpi: 'Prod Output (MT)',
  period: 'September',
  year: 2026,
};

const enabled = (over: Partial<LegacyRenameState> = {}): LegacyRenameState => ({
  ...initialRenameState(anchor, 'Production Output'),
  enabled: true,
  ...over,
});

describe('fiscal helpers', () => {
  it('ends the fiscal year in the following June for Jul–Dec', () => {
    expect(fiscalEnd('September', 2026)).toEqual({ period: 'June', year: 2027 });
  });
  it('ends in the same June for Jan–Jun', () => {
    expect(fiscalEnd('March', 2027)).toEqual({ period: 'June', year: 2027 });
  });
  it('lifts a pre-floor anchor to May 2026', () => {
    expect(defaultRenameRange('January', 2026).fromPeriod).toBe('May');
    expect(defaultRenameRange('January', 2026).fromYear).toBe(2026);
  });
});

describe('initial state', () => {
  it('is off by default and seeds names from the title', () => {
    const s = initialRenameState(anchor, 'Production Output');
    expect(s.enabled).toBe(false);
    expect(s.newKpi).toBe('Production Output');
    expect(s.newKra).toBe('Production');
  });
  it('falls back to the legacy name when there is no title', () => {
    expect(initialRenameState(anchor, '  ').newKpi).toBe('Prod Output (MT)');
  });
});

describe('validateRename', () => {
  it('passes when disabled', () => {
    expect(validateRename({ ...enabled(), enabled: false })).toBeNull();
  });
  it('requires both names', () => {
    expect(validateRename(enabled({ newKpi: '   ' }))).toMatch(/new KRA name/i);
  });
  it('rejects a pre-May-2026 start', () => {
    expect(validateRename(enabled({ fromPeriod: 'April', fromYear: 2026 })))
      .toMatch(/frozen/i);
  });
  it('rejects an inverted range', () => {
    expect(validateRename(enabled({ fromPeriod: 'December', fromYear: 2026, toPeriod: 'July', toYear: 2026 })))
      .toMatch(/end month/i);
  });
  it('accepts a valid forward range', () => {
    expect(validateRename(enabled())).toBeNull();
  });
});

describe('buildRenameArgs', () => {
  it('returns null when the checkbox is off', () => {
    expect(buildRenameArgs({ ...enabled(), enabled: false }, anchor, null)).toBeNull();
  });
  it('returns null for a no-op rename', () => {
    const s = enabled({ newKra: 'Production', newKpi: 'Prod Output (MT)' });
    expect(isRenameNoop(s, anchor)).toBe(true);
    expect(buildRenameArgs(s, anchor, null)).toBeNull();
  });
  it('returns null when the range is invalid', () => {
    expect(buildRenameArgs(enabled({ fromPeriod: 'April', fromYear: 2026 }), anchor, null)).toBeNull();
  });
  it('builds a trimmed, definition-bound payload', () => {
    const args = buildRenameArgs(enabled({ newKpi: '  Production Output  ' }), anchor, 'def-9');
    expect(args).toEqual({
      categoryId: 'cat-1',
      oldKra: 'Production',
      oldKpi: 'Prod Output (MT)',
      newKra: 'Production',
      newKpi: 'Production Output',
      definitionId: 'def-9',
      fromPeriod: 'September',
      fromYear: 2026,
      toPeriod: 'June',
      toYear: 2027,
    });
  });
});

describe('renameMonthOptions', () => {
  it('hides frozen months', () => {
    const opts = renameMonthOptions([2026]);
    expect(opts.some((o) => o.period === 'April')).toBe(false);
    expect(opts[0].label).toBe('May 2026');
  });
});

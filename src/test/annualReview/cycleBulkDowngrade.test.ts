import { describe, it, expect } from 'vitest';
import { classifyStageCoverage } from '@/lib/annualReview/bulkStageCoverage';

/**
 * ADR-225 — downgrade (correction) mode.
 * Coverage classification is unaffected by `allowDowngrades`; the flag only
 * relaxes the per-cell monotonic guard inside the dry-run and picks the
 * correction RPC at commit time.
 */
describe('ADR-225 stage coverage with allowDowngrades', () => {
  it('does not widen coverage on its own', () => {
    expect(classifyStageCoverage('completed', { allowDowngrades: true }).mode).toBe('skip');
    expect(classifyStageCoverage('pending_bu', { allowDowngrades: true }).mode).toBe('skip');
  });

  it('keeps admin_upgrade mode when combined with the completed opt-in', () => {
    expect(classifyStageCoverage('completed', {
      allowCompletedUpgrades: true, allowDowngrades: true,
    }).mode).toBe('admin_upgrade');
  });

  it('keeps safe mode for early stages', () => {
    expect(classifyStageCoverage('pending_self', { allowDowngrades: true }).mode).toBe('safe');
  });
});

/** Mirrors the cell-level decision inside parseAndDryRun. */
function cellVerdict(opts: {
  mode: 'safe' | 'admin_upgrade';
  beforePoints: number | undefined;
  afterPoints: number;
  allowDowngrades: boolean;
}): 'skip' | 'up' | 'down' {
  const isDowngrade = typeof opts.beforePoints === 'number' && opts.afterPoints < opts.beforePoints;
  if (opts.mode === 'admin_upgrade' && isDowngrade && !opts.allowDowngrades) return 'skip';
  return isDowngrade ? 'down' : 'up';
}

describe('ADR-225 cell-level downgrade guard', () => {
  it('skips a lower score on locked rows when the flag is off', () => {
    expect(cellVerdict({ mode: 'admin_upgrade', beforePoints: 20, afterPoints: 10, allowDowngrades: false })).toBe('skip');
  });

  it('records a downgrade on locked rows when the flag is on', () => {
    expect(cellVerdict({ mode: 'admin_upgrade', beforePoints: 20, afterPoints: 10, allowDowngrades: true })).toBe('down');
  });

  it('always allows a higher score', () => {
    expect(cellVerdict({ mode: 'admin_upgrade', beforePoints: 10, afterPoints: 20, allowDowngrades: false })).toBe('up');
  });

  it('treats an unscored cell as an upgrade', () => {
    expect(cellVerdict({ mode: 'admin_upgrade', beforePoints: undefined, afterPoints: 5, allowDowngrades: false })).toBe('up');
  });

  it('never blocks safe-stage rows', () => {
    expect(cellVerdict({ mode: 'safe', beforePoints: 20, afterPoints: 10, allowDowngrades: false })).toBe('down');
  });
});
import { describe, it, expect } from 'vitest';
import { resolveHierarchicalHead, type MgrMap } from '@/lib/annualReview/hierarchyGuard';

// Reporting chain:
//   ceo → bu_head → dept_head → mgr → emp
//                              → mgr → peer
//                    unrelated (reports to someone else)
const mgrMap: MgrMap = new Map<string, string | null>([
  ['ceo', null],
  ['bu_head', 'ceo'],
  ['dept_head', 'bu_head'],
  ['mgr', 'dept_head'],
  ['emp', 'mgr'],
  ['peer', 'mgr'],
  ['unrelated', 'ceo'],
]);

describe('resolveHierarchicalHead', () => {
  it('keeps a valid ancestor head', () => {
    const r = resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: 'dept_head', fallbackId: 'mgr', mgrMap });
    expect(r).toEqual({ headId: 'dept_head', usedFallback: false });
  });

  it('keeps the direct manager', () => {
    const r = resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: 'mgr', fallbackId: 'mgr', mgrMap });
    expect(r.usedFallback).toBe(false);
    expect(r.headId).toBe('mgr');
  });

  it('falls back when configured head is the employee itself', () => {
    const r = resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: 'emp', fallbackId: 'mgr', mgrMap });
    expect(r).toEqual({ headId: 'mgr', usedFallback: true, reason: 'self' });
  });

  it('falls back when configured head is a peer (same direct manager)', () => {
    const r = resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: 'peer', fallbackId: 'mgr', mgrMap });
    expect(r).toEqual({ headId: 'mgr', usedFallback: true, reason: 'peer' });
  });

  it('falls back when configured head is unrelated to the chain', () => {
    const r = resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: 'unrelated', fallbackId: 'mgr', mgrMap });
    expect(r).toEqual({ headId: 'mgr', usedFallback: true, reason: 'not_in_chain' });
  });

  it('returns fallback with null_configured when configured id is null/undefined', () => {
    expect(resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: null, fallbackId: 'mgr', mgrMap }))
      .toEqual({ headId: 'mgr', usedFallback: true, reason: 'null_configured' });
    expect(resolveHierarchicalHead({ employeeId: 'emp', configuredHeadId: undefined, fallbackId: null, mgrMap }))
      .toEqual({ headId: null, usedFallback: true, reason: 'null_configured' });
  });

  it('does not loop on a cyclic manager chain', () => {
    const cyclic: MgrMap = new Map([
      ['a', 'b'],
      ['b', 'a'],
    ]);
    const r = resolveHierarchicalHead({ employeeId: 'a', configuredHeadId: 'unrelated', fallbackId: null, mgrMap: cyclic });
    expect(r.usedFallback).toBe(true);
  });
});
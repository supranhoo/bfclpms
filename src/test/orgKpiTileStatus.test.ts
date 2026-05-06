import { describe, it, expect } from 'vitest';

/**
 * Locks the fact-based tile status contract (ADR-055).
 * Pure function mirror of getKpiStatus() in OrgKpiDataEntry.tsx so we can
 * assert without rendering the whole page.
 */
type Status = 'pending' | 'entered' | 'propagated' | 'stuck';
const isPropOrApproved = (s?: string | null) => s === 'propagated' || s === 'approved';

function deriveStatus(args: {
  hasOkv: boolean;
  okvStatus?: string | null;
  mappedEmpCount: number;
  kraSetEmpCount: number;
}): Status {
  const { hasOkv, okvStatus, mappedEmpCount, kraSetEmpCount } = args;
  if (!hasOkv) return 'pending';
  const everyChildAdvanced = mappedEmpCount > 0 && kraSetEmpCount === 0;
  if (!isPropOrApproved(okvStatus)) {
    if (everyChildAdvanced) return 'propagated';
    return 'entered';
  }
  return kraSetEmpCount > 0 ? 'stuck' : 'propagated';
}

describe('Org KPI tile status (ADR-055 fact-based)', () => {
  it('OKV draft + all children advanced → propagated (Budget saving regression)', () => {
    expect(deriveStatus({ hasOkv: true, okvStatus: 'draft', mappedEmpCount: 1, kraSetEmpCount: 0 })).toBe('propagated');
  });
  it('OKV sent_back + all children advanced → propagated', () => {
    expect(deriveStatus({ hasOkv: true, okvStatus: 'sent_back', mappedEmpCount: 5, kraSetEmpCount: 0 })).toBe('propagated');
  });
  it('OKV draft + some children still kra_set → entered', () => {
    expect(deriveStatus({ hasOkv: true, okvStatus: 'draft', mappedEmpCount: 5, kraSetEmpCount: 2 })).toBe('entered');
  });
  it('OKV propagated + kra_set child → stuck', () => {
    expect(deriveStatus({ hasOkv: true, okvStatus: 'propagated', mappedEmpCount: 5, kraSetEmpCount: 1 })).toBe('stuck');
  });
  it('OKV propagated + no kra_set child → propagated', () => {
    expect(deriveStatus({ hasOkv: true, okvStatus: 'propagated', mappedEmpCount: 5, kraSetEmpCount: 0 })).toBe('propagated');
  });
  it('No OKV → pending', () => {
    expect(deriveStatus({ hasOkv: false, mappedEmpCount: 5, kraSetEmpCount: 5 })).toBe('pending');
  });
});

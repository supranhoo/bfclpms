/**
 * ADR-258 — every read-only / disabled state on the self-review surface must
 * carry a plain-language reason.
 */
import { describe, it, expect } from 'vitest';
import { resolveEditLockReason, resolveSubmitBlockReason } from '@/lib/review/editLockReason';

describe('resolveEditLockReason', () => {
  const open = { governanceLocked: false, pastSelfStage: false, orgLocked: false };

  it('returns null when the KPI is editable', () => {
    expect(resolveEditLockReason(open)).toBeNull();
  });

  it('reports governance locks first', () => {
    const r = resolveEditLockReason({ ...open, governanceLocked: true, pastSelfStage: true, orgLocked: true });
    expect(r?.code).toBe('governance');
    expect(r?.message).toMatch(/locked by the administrator/i);
  });

  it('names the current stage when the KPI has moved on', () => {
    const r = resolveEditLockReason({ ...open, pastSelfStage: true, stageLabel: 'Manager Check' });
    expect(r?.code).toBe('past_stage');
    expect(r?.message).toContain('Manager Check');
  });

  it('names the org data owners', () => {
    const r = resolveEditLockReason({ ...open, orgLocked: true, orgOwnerNames: ['Asha Rao'] });
    expect(r?.code).toBe('org_owned');
    expect(r?.message).toContain('Asha Rao');
  });

  it('falls back to a generic org message with no owner names', () => {
    const r = resolveEditLockReason({ ...open, orgLocked: true, orgOwnerNames: [] });
    expect(r?.message).toMatch(/assigned data owner/i);
  });
});

describe('resolveSubmitBlockReason', () => {
  const ready = {
    multiMonthBlocked: false,
    needsSubPeriod: false,
    subPeriodSelected: false,
    hasAchievedValue: true,
    isNa: false,
    remarksLength: 10,
    remarksMandatory: false,
    saving: false,
  };

  it('returns null when the form is complete', () => {
    expect(resolveSubmitBlockReason(ready)).toBeNull();
  });

  it('explains a missing achieved value', () => {
    expect(resolveSubmitBlockReason({ ...ready, hasAchievedValue: false }))
      .toMatch(/achieved value/i);
  });

  it('explains an unfinished multi-month cycle', () => {
    expect(resolveSubmitBlockReason({ ...ready, multiMonthBlocked: true }))
      .toMatch(/multi-month cycle/i);
  });

  it('explains a missing sub-period selection', () => {
    expect(resolveSubmitBlockReason({ ...ready, needsSubPeriod: true, subPeriodSelected: false }))
      .toMatch(/day or week/i);
  });

  it('explains the 50-character N/A justification rule', () => {
    expect(resolveSubmitBlockReason({ ...ready, isNa: true, remarksLength: 12 }))
      .toMatch(/50 characters/);
  });

  it('explains mandatory remarks', () => {
    expect(resolveSubmitBlockReason({ ...ready, remarksMandatory: true, remarksLength: 0 }))
      .toMatch(/Remarks are required/i);
  });

  it('reports the saving state', () => {
    expect(resolveSubmitBlockReason({ ...ready, saving: true })).toMatch(/Saving/i);
  });
});

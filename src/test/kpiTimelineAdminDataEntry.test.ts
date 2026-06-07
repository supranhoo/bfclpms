import { describe, it, expect } from 'vitest';
import { formatAdminDataEntryDetails } from '@/components/dashboard/KpiTimeline';

describe('formatAdminDataEntryDetails', () => {
  it('HR PMS: only Admin Reason + Added Value when only hr_pms_achieved_value changed', () => {
    const out = formatAdminDataEntryDetails({
      action: 'ADMIN_DATA_ENTRY_HR_PMS',
      new_value: {
        self_score: 5, manager_score: 5,
        self_rating: 'blue', manager_rating: 'blue',
        self_remarks: 'All courier dispatched',
        manager_remarks: 'Done',
        hr_pms_achieved_value: 0,
      },
      metadata: { reason: 'Update', fields_updated: ['hr_pms_achieved_value'] },
    });
    expect(out).toEqual(['Admin Reason: Update', 'Added Value: 0']);
    expect(out.some(l => l.startsWith('Self Score'))).toBe(false);
    expect(out.some(l => l.startsWith('Manager Score'))).toBe(false);
    expect(out.some(l => l.startsWith('Rating'))).toBe(false);
    expect(out.some(l => l.includes('Remarks'))).toBe(false);
  });

  it('SELF: Added Value + Remarks, no Score line when score not in fields_updated', () => {
    const out = formatAdminDataEntryDetails({
      action: 'ADMIN_DATA_ENTRY_SELF',
      new_value: { achieved_value: 7, self_remarks: 'ok', self_score: 4 },
      metadata: { reason: 'r', fields_updated: ['achieved_value', 'self_remarks'] },
    });
    expect(out).toContain('Added Value: 7');
    expect(out).toContain('Remarks: ok');
    expect(out.some(l => l.startsWith('Score'))).toBe(false);
  });

  it('MANAGER N/A: short-circuits to "Marked as N/A"', () => {
    const out = formatAdminDataEntryDetails({
      action: 'ADMIN_DATA_ENTRY_MANAGER',
      new_value: { is_na: true, manager_score: null },
      metadata: { reason: 'na', fields_updated: ['is_na', 'manager_score', 'manager_remarks'] },
    });
    expect(out).toEqual(['Admin Reason: na', 'Marked as N/A']);
  });

  it('legacy row without fields_updated: returns only reason (caller falls back)', () => {
    const out = formatAdminDataEntryDetails({
      action: 'ADMIN_DATA_ENTRY_HR_PMS',
      new_value: { self_score: 5 },
      metadata: { reason: 'x' },
    });
    expect(out).toEqual(['Admin Reason: x']);
  });
});
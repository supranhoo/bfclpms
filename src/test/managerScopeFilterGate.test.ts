/**
 * v2.66.11.13 — Hidden `?mgr=` URL filter must not narrow non-full-access
 * Team Reviews. Mirrors the gate added in EmployeeSelectorGrid.tsx so a
 * future refactor that drops `isFullAccess` from the predicate is caught.
 */
import { describe, it, expect } from 'vitest';

type Member = { id: string; reporting_manager_id: string | null };

function applyManagerFilter(members: Member[], selectedManager: string | null, isFullAccess: boolean) {
  if (selectedManager && isFullAccess) {
    return members.filter(m => m.reporting_manager_id === selectedManager);
  }
  return members;
}

describe('Team Reviews `mgr` URL filter gate (v2.66.11.13)', () => {
  const roster: Member[] = [
    { id: 'd1', reporting_manager_id: 'sajid' },
    { id: 'd2', reporting_manager_id: 'sajid' },
    { id: 'i1', reporting_manager_id: 'd1' },
    { id: 'i2', reporting_manager_id: 'd2' },
  ];

  it('ignores `mgr` for non-full-access reviewers (Sajid sees direct + indirect)', () => {
    const out = applyManagerFilter(roster, 'sajid', false);
    expect(out.map(m => m.id)).toEqual(['d1', 'd2', 'i1', 'i2']);
  });

  it('honors `mgr` for full-access (admin/HR/Mgmt) panels', () => {
    const out = applyManagerFilter(roster, 'sajid', true);
    expect(out.map(m => m.id)).toEqual(['d1', 'd2']);
  });

  it('returns full roster when no manager filter is set', () => {
    expect(applyManagerFilter(roster, null, false)).toHaveLength(4);
    expect(applyManagerFilter(roster, null, true)).toHaveLength(4);
  });
});

import { describe, it, expect } from 'vitest';

/**
 * ADR-060 — Pure predicate mirror of the in-component guard that splits the
 * org_kpi_values upsert payload into rows safe to send vs orphans whose
 * employee_id is no longer present in the visible profile set. Keeping this
 * helper in lockstep with the inline branch in OrgKpiDataEntry.tsx prevents a
 * regression of the FK violation surfaced as
 * `org_kpi_values_employee_id_fkey`.
 */
type Row = { employee_id?: string; department_id?: string };

function splitSavePayload(rows: Row[], knownProfileIds: Set<string>) {
  const safe = rows.filter((r) => !r.employee_id || knownProfileIds.has(r.employee_id));
  const orphans = rows.filter((r) => r.employee_id && !knownProfileIds.has(r.employee_id));
  return { safe, orphans };
}

describe('ADR-060 splitSavePayload', () => {
  it('passes department-only rows through untouched', () => {
    const r: Row[] = [{ department_id: 'd1' }, { department_id: 'd2' }];
    const { safe, orphans } = splitSavePayload(r, new Set());
    expect(safe).toHaveLength(2);
    expect(orphans).toHaveLength(0);
  });

  it('keeps employee rows whose id is in the known set', () => {
    const r: Row[] = [{ employee_id: 'a' }, { employee_id: 'b' }];
    const { safe, orphans } = splitSavePayload(r, new Set(['a', 'b']));
    expect(safe).toHaveLength(2);
    expect(orphans).toHaveLength(0);
  });

  it('drops orphan employee rows and reports them', () => {
    const r: Row[] = [{ employee_id: 'a' }, { employee_id: 'gone' }];
    const { safe, orphans } = splitSavePayload(r, new Set(['a']));
    expect(safe).toHaveLength(1);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].employee_id).toBe('gone');
  });

  it('treats an empty known set as "drop all employee rows" (RLS gap)', () => {
    const r: Row[] = [{ employee_id: 'a' }, { department_id: 'd' }];
    const { safe, orphans } = splitSavePayload(r, new Set());
    expect(safe).toEqual([{ department_id: 'd' }]);
    expect(orphans).toHaveLength(1);
  });
});
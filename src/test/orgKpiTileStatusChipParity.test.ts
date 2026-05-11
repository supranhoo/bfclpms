import { describe, it, expect } from 'vitest';
import { deriveOrgKpiTileStatus } from '@/lib/orgKpiStatus';

/**
 * RCA 2026-05-11 — Cost Management & Optimization showed "1 Pending" while
 * the only KPI card said "Propagated · 34 propagated / 0 not propagated".
 *
 * Root cause: `deriveOrgKpiTileStatus` applied the ADR-055 fact-based
 * override only for `'organization'` scope. For `employee` / `department`
 * scope it returned `'pending'` whenever OKV rows lacked a value, even when
 * every mapped child had advanced past `kra_set` — directly contradicting
 * the per-row pill (`deriveScopedRowStatus`) which already promoted
 * `isPastKraSet` to a first-class signal.
 *
 * These tests pin the parity across all three scopes.
 */
describe('Org KPI tile status — chip parity with per-row pill (ADR-055 cross-scope)', () => {
  const mapped = (...ids: string[]) => new Set(ids);

  it('employee scope: no OKV row + every mapped child past kra_set → propagated (the bug case)', () => {
    const empIds = Array.from({ length: 34 }, (_, i) => `emp_${i}`);
    expect(
      deriveOrgKpiTileStatus({
        scope: 'employee',
        okvRows: [],
        mappedEmpIds: mapped(...empIds),
        kraSetEmpIds: new Set<string>(),
      }),
    ).toBe('propagated');
  });

  it('employee scope: no OKV row + some children still kra_set → pending (unchanged)', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'employee',
        okvRows: [],
        mappedEmpIds: mapped('a', 'b', 'c'),
        kraSetEmpIds: mapped('a'),
      }),
    ).toBe('pending');
  });

  it('employee scope: OKV row exists but is value-less + every child advanced → propagated', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'employee',
        okvRows: [{ key: 'k||null||emp_1', achieved_value: null, is_na: false, status: 'draft' }],
        mappedEmpIds: mapped('emp_1'),
        kraSetEmpIds: new Set<string>(),
      }),
    ).toBe('propagated');
  });

  it('department scope: no OKV row + every child advanced → propagated', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'department',
        okvRows: [],
        mappedEmpIds: mapped('e1', 'e2'),
        kraSetEmpIds: new Set<string>(),
        empToDept: new Map([['e1', 'd1'], ['e2', 'd1']]),
      }),
    ).toBe('propagated');
  });

  it('department scope: no OKV + no children advanced → pending (unchanged)', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'department',
        okvRows: [],
        mappedEmpIds: mapped('e1', 'e2'),
        kraSetEmpIds: mapped('e1', 'e2'),
        empToDept: new Map([['e1', 'd1'], ['e2', 'd1']]),
      }),
    ).toBe('pending');
  });

  it('organization scope: no OKV row → still pending (org branch unchanged)', () => {
    expect(
      deriveOrgKpiTileStatus({
        scope: 'organization',
        okvRows: [],
        mappedEmpIds: mapped('e1'),
        kraSetEmpIds: new Set<string>(),
      }),
    ).toBe('pending');
  });
});

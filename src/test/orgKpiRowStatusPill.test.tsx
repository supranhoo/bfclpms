import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgKpiScopedEntryTable, type ScopedRow } from '@/components/admin/OrgKpiScopedEntryTable';

/**
 * Per-row Propagated / Not propagated visibility.
 *
 * Locks in the contract that `ScopedRow.status` drives both the inline pill
 * in each row and the breakdown badges in the collapsible header. Without
 * these, an admin cannot tell which employees in an Org KPI still need the
 * Propagate action — see investigation of Atul Kumar Khaitan / April 2026.
 */

function makeRow(overrides: Partial<ScopedRow>): ScopedRow {
  return {
    scopeId: overrides.scopeId ?? 'emp-1',
    scopeName: overrides.scopeName ?? 'Test Employee',
    achievedValue: 100,
    remarks: '',
    evidenceUrl: null,
    departmentName: 'Dept A',
    ...overrides,
  } as ScopedRow;
}

function renderTable(rows: ScopedRow[]) {
  return render(
    <OrgKpiScopedEntryTable
      rows={rows}
      onValueChange={() => {}}
      scopeLabel="Employee"
      onSelectionChange={() => {}}
      onPropagateRow={() => {}}
    />
  );
}

describe('Per-row propagation pill', () => {
  it('shows the breakdown badges in the header when rows are mixed', () => {
    renderTable([
      makeRow({ scopeId: 'a', scopeName: 'Alice', status: 'propagated' }),
      makeRow({ scopeId: 'b', scopeName: 'Bob', status: 'entered' }),
    ]);
    expect(screen.getByText(/1 propagated/)).toBeInTheDocument();
    expect(screen.getByText(/1 not propagated/)).toBeInTheDocument();
  });

  it('still shows the breakdown when ALL rows are propagated (regression 2026-05-08)', () => {
    renderTable([
      makeRow({ scopeId: 'a', scopeName: 'Alice', status: 'propagated' }),
      makeRow({ scopeId: 'b', scopeName: 'Bob', status: 'propagated' }),
    ]);
    expect(screen.getByText(/2 propagated/)).toBeInTheDocument();
    expect(screen.getByText(/0 not propagated/)).toBeInTheDocument();
  });

  it('still shows the breakdown when ALL rows are entered (regression 2026-05-08)', () => {
    renderTable([
      makeRow({ scopeId: 'a', scopeName: 'Alice', status: 'entered' }),
      makeRow({ scopeId: 'b', scopeName: 'Bob', status: 'entered' }),
    ]);
    expect(screen.getByText(/0 propagated/)).toBeInTheDocument();
    expect(screen.getByText(/2 not propagated/)).toBeInTheDocument();
  });

  it('hides the breakdown when no row carries a value yet (pending only)', () => {
    renderTable([
      makeRow({ scopeId: 'a', scopeName: 'Alice', status: 'pending', achievedValue: null }),
      makeRow({ scopeId: 'b', scopeName: 'Bob', status: 'pending', achievedValue: null }),
    ]);
    expect(screen.queryByText(/not propagated/)).not.toBeInTheDocument();
  });
});
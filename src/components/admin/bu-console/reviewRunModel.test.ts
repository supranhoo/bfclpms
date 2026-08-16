/** ADR-286 — the worksheet must never offer an action the server will refuse. */
import { describe, it, expect } from 'vitest';
import {
  buildCellMap, cellId, isCellPending, isCellSelectable, countPending,
  selectableIdsForKpi, selectableIdsForEmployee, toggleAll, runCounters, targetSpread,
} from './reviewRunModel';
import type { RunCell } from '@/hooks/useBuConsoleRun';

const cell = (over: Partial<RunCell>): RunCell => ({
  kpi_key: 'k1', kpi_id: 'id-1', employee_id: 'e1', status: 'self_review',
  weightage: 10, target_value: '5', is_na: false, final_score: null,
  achieved_value: null, stage_score: null, actionable: true, ...over,
});

describe('cell state', () => {
  it('is pending when unscored, not N/A and not final', () => {
    expect(isCellPending(cell({}))).toBe(true);
    expect(isCellPending(cell({ stage_score: 4 }))).toBe(false);
    expect(isCellPending(cell({ is_na: true }))).toBe(false);
    expect(isCellPending(cell({ final_score: 3.2 }))).toBe(false);
    expect(isCellPending(undefined)).toBe(false);
  });

  it('never selects an approved row or one the tier cannot act on', () => {
    expect(isCellSelectable(cell({}))).toBe(true);
    expect(isCellSelectable(cell({ final_score: 3 }))).toBe(false);
    expect(isCellSelectable(cell({ actionable: false }))).toBe(false);
  });
});

describe('selection', () => {
  const cells = [
    cell({ kpi_id: 'a', employee_id: 'e1' }),
    cell({ kpi_id: 'b', employee_id: 'e2', final_score: 4 }),
    cell({ kpi_id: 'c', employee_id: 'e3', actionable: false }),
    cell({ kpi_key: 'k2', kpi_id: 'd', employee_id: 'e1' }),
  ];
  const map = buildCellMap(cells);
  const employees = ['e1', 'e2', 'e3'].map((id) => ({
    employee_id: id, employee_name: id, employee_code: null,
    department_name: null, business_unit_name: null,
  }));
  const kpis = ['k1', 'k2'].map((k) => ({
    kpi_key: k, category_id: null, category_name: 'c', kra_name: 'kra',
    kpi_name: k, uom: null, employee_count: 3, target_variants: 1, sample_target: '5',
  }));

  it('maps cells by kpi and employee', () => {
    expect(map.get(cellId('k1', 'e1'))?.kpi_id).toBe('a');
  });

  it('collects only actionable ids per row and per column', () => {
    expect(selectableIdsForKpi('k1', employees, map)).toEqual(['a']);
    expect(selectableIdsForEmployee('e1', kpis, map)).toEqual(['a', 'd']);
  });

  it('toggles a whole row on, then off', () => {
    const on = toggleAll(new Set<string>(), ['a', 'd']);
    expect([...on].sort()).toEqual(['a', 'd']);
    expect([...toggleAll(on, ['a', 'd'])]).toEqual([]);
  });

  it('turns a partially selected row fully on', () => {
    const partial = new Set(['a']);
    expect([...toggleAll(partial, ['a', 'd'])].sort()).toEqual(['a', 'd']);
  });
});

describe('counters', () => {
  const cells = [
    cell({}), cell({ stage_score: 4 }), cell({ is_na: true }), cell({ final_score: 3 }),
  ];
  it('splits the run into pending, done, N/A and locked', () => {
    expect(runCounters(cells)).toEqual({ cells: 4, pending: 1, done: 1, na: 1, locked: 1 });
    expect(countPending(cells)).toBe(1);
  });

  it('reports how many distinct targets a shared KPI carries', () => {
    expect(targetSpread('k1', [cell({ target_value: '5' }), cell({ target_value: '10' })]))
      .toEqual(['5', '10']);
  });
});

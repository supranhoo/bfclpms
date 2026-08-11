/**
 * ADR-252 / POLICY §PMS-CONTINUITY-AT-OR-BELOW
 * Regression coverage for the shared TNI/PIP continuity engine and the
 * TNI qualification + aggregation helpers.
 */
import { describe, it, expect } from 'vitest';
import { evaluateContinuity, allMonthsAtOrBelow } from '@/lib/continuity/allMonthsAtOrBelow';
import { isPipCandidate } from '@/lib/pip/pipCandidateRule';
import {
  tniKpiKey,
  buildQualifiedIndex,
  filterQualifiedNeeds,
  dedupeNeedsByKpi,
  qualifiedEvidence,
  type QualifiedKpiRow,
} from '@/lib/tni/tniQualification';
import { summariseNeeds, aggregateByCategory, aggregateByDepartment } from '@/lib/tni/tniAggregation';

const MONTHS = ['2026-04', '2026-05', '2026-06'];

describe('continuity engine', () => {
  it('qualifies when every scored month is at or below the threshold', () => {
    const r = evaluateContinuity({ '2026-04': 2.5, '2026-05': 3, '2026-06': 1 }, MONTHS, 3);
    expect(r.qualifies).toBe(true);
    expect(r.scoredMonths).toBe(3);
    expect(r.worstScore).toBe(1);
    expect(r.latestScore).toBe(1);
  });

  it('uses <= semantics (a score exactly on the threshold qualifies)', () => {
    expect(allMonthsAtOrBelow({ '2026-06': 3 }, ['2026-06'], 3)).toBe(true);
    expect(allMonthsAtOrBelow({ '2026-06': 3.01 }, ['2026-06'], 3)).toBe(false);
  });

  it('skips unscored months rather than treating them as failure', () => {
    const r = evaluateContinuity({ '2026-04': 2, '2026-06': 1.5 }, MONTHS, 3, { minScoredMonths: 2 });
    expect(r.qualifies).toBe(true);
    expect(r.skippedMonths).toBe(1);
  });

  it('will not act on fewer scored months than the configured minimum', () => {
    const r = evaluateContinuity({ '2026-06': 1.5 }, MONTHS, 3, { minScoredMonths: 3 });
    expect(r.qualifies).toBe(false);
    expect(r.shortWindow).toBe(true);
  });

  it('is inert with no months, no scores or no threshold', () => {
    expect(evaluateContinuity({}, [], 3).qualifies).toBe(false);
    expect(evaluateContinuity({}, MONTHS, 3).qualifies).toBe(false);
    expect(evaluateContinuity({ '2026-06': 1 }, MONTHS, null).qualifies).toBe(false);
  });

  it('tolerates float representation on the boundary', () => {
    expect(allMonthsAtOrBelow({ m: 0.1 + 0.2 }, ['m'], 0.3)).toBe(true);
  });

  it('PIP rule delegates to the same engine', () => {
    expect(isPipCandidate({ monthlyScores: { '2026-04': 2, '2026-05': 2 } }, MONTHS, 2, 2)).toBe(true);
    expect(isPipCandidate({ monthlyScores: { '2026-04': 2, '2026-05': 2 } }, MONTHS, 2, 3)).toBe(false);
  });
});

// ---- TNI qualification -----------------------------------------------------

const qualifiedRows: QualifiedKpiRow[] = [
  {
    employee_id: 'emp-1',
    kpi_key: tniKpiKey('Safety', 'Near Miss Reporting'),
    kra_name: 'Safety',
    kpi_name: 'Near Miss Reporting',
    months: [
      { month: 'April', year: 2026, score: 2 },
      { month: 'May', year: 2026, score: 3 },
    ],
    scored_months: 2,
    worst_score: 2,
    latest_score: 3,
  },
];

const need = (over: Partial<any> = {}) => ({
  id: over.id ?? 'n1',
  employee_id: 'emp-1',
  review_period: 'May',
  review_year: 2026,
  priority: 'high' as const,
  gap_type: 'skill',
  status: 'identified',
  category_id: 'cat-1',
  category: { id: 'cat-1', name: 'Safety' },
  employee: { department_id: 'dep-1', department: { id: 'dep-1', name: 'Operations' } },
  kpi: { kra_name: 'Safety', kpi_name: 'Near Miss Reporting' },
  ...over,
});

describe('TNI qualification (ADR-252)', () => {
  const index = buildQualifiedIndex(qualifiedRows);
  const order = ['2026|April', '2026|May', '2026|June'];

  it('keeps rows whose KPI met the continuity rule', () => {
    expect(filterQualifiedNeeds([need()], index, order, { multiMonth: true })).toHaveLength(1);
  });

  it('drops rows whose KPI recovered in at least one month (no ANY-month union)', () => {
    const other = need({ id: 'n2', kpi: { kra_name: 'Quality', kpi_name: 'Rework %' } });
    expect(filterQualifiedNeeds([other], index, order, { multiMonth: true })).toHaveLength(0);
  });

  it('matches KPI identity irrespective of case and padding', () => {
    const messy = need({ kpi: { kra_name: '  safety ', kpi_name: 'NEAR MISS REPORTING' } });
    expect(qualifiedEvidence(messy, index)?.worst_score).toBe(2);
  });

  it('deduplicates per-month records into a single multi-month finding (latest wins)', () => {
    const rows = [need({ id: 'apr', review_period: 'April' }), need({ id: 'may', review_period: 'May' })];
    const deduped = dedupeNeedsByKpi(rows, order);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('may');
  });

  it('derives every aggregate from the same qualified row-set', () => {
    const rows = [need(), need({ id: 'n3', gap_type: 'compliance', priority: 'low' })] as any[];
    const s = summariseNeeds(rows);
    expect(s.total).toBe(1);
    expect(s.complianceGaps).toBe(1);
    expect(s.highPriority).toBe(1);
    expect(s.employeesAffected).toBe(1);
    expect(aggregateByCategory(rows)[0].total_count).toBe(2);
    expect(aggregateByDepartment(rows)[0].department_name).toBe('Operations');
    expect(aggregateByDepartment(rows)[0].high_priority).toBe(1);
  });
});
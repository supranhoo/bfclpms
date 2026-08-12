/**
 * ADR-254 — the qualification result-set is the report's source of truth.
 * A qualifying (employee, KPI) must appear even with no persisted
 * `training_needs` record; persisted rows only enrich it.
 */
import { describe, it, expect } from 'vitest';
import { mergeQualifiedWithNeeds, type QualifiedKpiRow } from '@/lib/tni/tniQualification';

const order = ['2026|April', '2026|May', '2026|June'];

const q = (employee_id: string, kra: string, kpi: string): QualifiedKpiRow => ({
  employee_id,
  kpi_key: `${kra.toLowerCase()}||${kpi.toLowerCase()}`,
  kra_name: kra,
  kpi_name: kpi,
  months: [{ month: 'June', year: 2026, score: 1.5 }],
  scored_months: 3,
  worst_score: 1.5,
  latest_score: 1.5,
});

describe('mergeQualifiedWithNeeds', () => {
  it('keeps a qualifying KPI that has no persisted detection record', () => {
    const rows = mergeQualifiedWithNeeds([q('e1', 'Safety', 'Incidents')], [], order, null);
    expect(rows).toHaveLength(1);
    expect(rows[0].actioned).toBe(false);
    expect(rows[0].priority).toBe('high');
    expect(rows[0].score).toBe(1.5);
  });

  it('enriches from the latest persisted record', () => {
    const rows = mergeQualifiedWithNeeds(
      [q('e1', 'Safety', 'Incidents')],
      [
        { id: 'n1', employee_id: 'e1', kpi: { kra_name: 'Safety', kpi_name: 'Incidents' }, review_year: 2026, review_period: 'April', priority: 'low', status: 'identified', score: 2 },
        { id: 'n2', employee_id: 'e1', kpi: { kra_name: 'safety', kpi_name: 'incidents' }, review_year: 2026, review_period: 'June', priority: 'medium', status: 'in_progress', score: 1 },
      ] as any,
      order,
      null,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actioned).toBe(true);
    expect(rows[0].id).toBe('n2');
    expect(rows[0].status).toBe('in_progress');
  });

  it('drops persisted rows that do not qualify', () => {
    const rows = mergeQualifiedWithNeeds(
      [q('e1', 'Safety', 'Incidents')],
      [{ id: 'x', employee_id: 'e2', kpi: { kra_name: 'Cost', kpi_name: 'Overrun' }, review_year: 2026, review_period: 'May' }] as any,
      order,
      null,
    );
    expect(rows.map(r => r.employee_id)).toEqual(['e1']);
  });
});

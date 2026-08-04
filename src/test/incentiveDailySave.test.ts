import { describe, it, expect } from 'vitest';
import { buildMergePayload, detectShrink, sumDays } from '@/lib/incentiveDailySave';

const CTX = { programId: 'prog-1', month: 'June', year: 2026 };
const DAYS_1_10 = [1,2,3,4,5,6,7,8,9,10];

describe('ADR-245 buildMergePayload', () => {
  it('writes only the visible days, never the whole month', () => {
    const rows = buildMergePayload({
      ...CTX,
      employeeIds: ['e1'],
      localData: { e1: { '1': 5, '2': 7, '15': 99 } },
      visibleDays: DAYS_1_10,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].values).toEqual({ '1': 5, '2': 7 });
    expect(rows[0].values['15']).toBeUndefined();
  });

  it('skips employees whose rows never hydrated (the June 1-10 loss mode)', () => {
    const rows = buildMergePayload({
      ...CTX,
      employeeIds: ['seeded', 'unhydrated', 'missing'],
      localData: { seeded: { '1': 12.5 }, unhydrated: {} },
      visibleDays: DAYS_1_10,
    });
    expect(rows.map(r => r.employee_id)).toEqual(['seeded']);
  });

  it('keeps explicit zeros typed by the operator', () => {
    const rows = buildMergePayload({
      ...CTX, employeeIds: ['e1'], localData: { e1: { '3': 0 } }, visibleDays: DAYS_1_10,
    });
    expect(rows[0].values).toEqual({ '3': 0 });
  });
});

describe('ADR-245 detectShrink', () => {
  it('flags a save that zeroes stored production', () => {
    const rows = buildMergePayload({
      ...CTX, employeeIds: ['e1'], localData: { e1: { '1': 0, '2': 0 } }, visibleDays: DAYS_1_10,
    });
    const warnings = detectShrink({ rows, dbValues: { e1: { '1': 10, '2': 8 } }, visibleDays: DAYS_1_10 });
    expect(warnings).toEqual([{ employee_id: 'e1', before: 18, after: 0, droppedDays: [1, 2] }]);
  });

  it('does not flag an unchanged or increased save', () => {
    const rows = buildMergePayload({
      ...CTX, employeeIds: ['e1'], localData: { e1: { '1': 12 } }, visibleDays: DAYS_1_10,
    });
    expect(detectShrink({ rows, dbValues: { e1: { '1': 10 } }, visibleDays: DAYS_1_10 })).toEqual([]);
  });

  it('does not flag days simply omitted from the payload (merge preserves them)', () => {
    const rows = buildMergePayload({
      ...CTX, employeeIds: ['e1'], localData: { e1: { '1': 10 } }, visibleDays: DAYS_1_10,
    });
    expect(detectShrink({ rows, dbValues: { e1: { '1': 10, '5': 4 } }, visibleDays: DAYS_1_10 })).toEqual([]);
  });

  it('sumDays ignores non-numeric and out-of-window keys', () => {
    expect(sumDays({ '1': 3, '2': 4, '20': 100, bad: NaN as any }, DAYS_1_10)).toBe(7);
  });
});
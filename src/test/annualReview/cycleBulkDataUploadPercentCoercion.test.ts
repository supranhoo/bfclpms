import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseAndDryRun, type CycleBulkPlan } from '@/services/annualReview/cycleBulkDataUpload';
import type { ScoringRules } from '@/lib/annualReview/systemKpiScoring';

/**
 * v2.66.98 — Percent-formatted Excel cells (raw 0..1) must be coerced to
 * whole-percent before scoring. RCA: employee 100870, "Annual Production
 * Target vs Actual: 90%" landed as raw 0.9 → below all bands (min 80) → 0.
 */

const prodRules: ScoringRules = {
  direction: 'higher_better',
  bands: [
    { score: 5, threshold: 100 }, { score: 4, threshold: 95 },
    { score: 3, threshold: 90 },  { score: 2, threshold: 85 },
    { score: 1, threshold: 80 },  { score: 0, threshold: 0 },
  ],
};

function makeFile(rows: Array<Record<string, unknown>>, headers: string[]): File {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { arrayBuffer: async () => buf, name: 'test.xlsx' } as unknown as File;
}

function makePlan(uom: 'percent' | 'number' = 'percent'): CycleBulkPlan {
  const slotByCanonical = new Map<string, { kind: 'system_scores' | 'eligibility_inputs'; id: string; slot?: any }>();
  slotByCanonical.set('system_scores::annual production target vs actual', {
    kind: 'system_scores', id: 'ap',
    slot: { id: 'ap', name: 'Annual Production Target vs Actual', weight: 10, scoring_rules: prodRules, source: 'system', uom_type: uom } as any,
  });
  return {
    cycleId: 'c1',
    columns: [{ name: 'Annual Production Target vs Actual', kind: 'system_scores' }],
    unresolvedSlots: [],
    instances: [{
      instanceId: 'i1', employeeCode: '100870', fullName: 'Test', doj: null,
      departmentName: '', businessUnitName: '', companyName: '', hasKra: false,
      templateName: 'T', overallStatus: 'pending_self',
      slotByCanonical,
      systemScores: {}, systemScoresRaw: {}, eligibilityInputs: {},
    }],
  };
}

describe('parseAndDryRun — percent coercion (v2.66.98)', () => {
  it('Excel percent cell 0.9 → rating 3 (was 0 pre-fix)', async () => {
    const file = makeFile([{ 'Employee Code': '100870', 'Annual Production Target vs Actual': 0.9 }], ['Employee Code', 'Annual Production Target vs Actual']);
    const rep = await parseAndDryRun(file, makePlan('percent'));
    expect(rep.applyCount).toBe(1);
    const ch = rep.rows[0].changes[0];
    expect(ch.rating).toBe(3);
    expect(ch.after).toBe(90);
    expect(ch.afterPoints).toBeCloseTo(6, 5); // 3/5 * 10
    expect(rep.rows[0].warnings?.some(w => w.includes('Excel percent'))).toBe(true);
  });

  it('whole-number 90 → rating 3 (parity, no double scaling)', async () => {
    const file = makeFile([{ 'Employee Code': '100870', 'Annual Production Target vs Actual': 90 }], ['Employee Code', 'Annual Production Target vs Actual']);
    const rep = await parseAndDryRun(file, makePlan('percent'));
    expect(rep.applyCount).toBe(1);
    const ch = rep.rows[0].changes[0];
    expect(ch.rating).toBe(3);
    expect(ch.after).toBe(90);
  });

  it('string "90%" → rating 3 with coercion warning', async () => {
    const file = makeFile([{ 'Employee Code': '100870', 'Annual Production Target vs Actual': '90%' }], ['Employee Code', 'Annual Production Target vs Actual']);
    const rep = await parseAndDryRun(file, makePlan('percent'));
    expect(rep.applyCount).toBe(1);
    const ch = rep.rows[0].changes[0];
    expect(ch.rating).toBe(3);
    expect(rep.rows[0].warnings?.some(w => w.includes('90%'))).toBe(true);
  });

  it('non-percent slot with raw 0.9 → not coerced (falls through band lookup)', async () => {
    const file = makeFile([{ 'Employee Code': '100870', 'Annual Production Target vs Actual': 0.9 }], ['Employee Code', 'Annual Production Target vs Actual']);
    const rep = await parseAndDryRun(file, makePlan('number'));
    // 0.9 < 80 → worst band, rating 0
    const ch = rep.rows[0].changes[0];
    expect(ch.after).toBe(0.9);
    expect(ch.rating).toBe(0);
  });
});

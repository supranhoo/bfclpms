import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseAndDryRun, type CycleBulkPlan } from '@/services/annualReview/cycleBulkDataUpload';
import type { ScoringRules } from '@/lib/annualReview/systemKpiScoring';

/**
 * v2.66.95 — Bulk upload must apply valid cells even when a sibling cell
 * in the same row can't be scored (unlinked KPI, non-numeric). Row-fatal
 * behavior is reserved for unknown employees / locked stages.
 */

const s5Rules: ScoringRules = {
  direction: 'higher_better',
  bands: [
    { score: 5, threshold: 90 }, { score: 4, threshold: 80 },
    { score: 3, threshold: 70 }, { score: 2, threshold: 60 },
    { score: 1, threshold: 50 }, { score: 0, threshold: 0 },
  ],
};

function makeFile(rows: Array<Record<string, unknown>>, headers: string[]): File {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  // jsdom's File may not implement arrayBuffer(); provide a minimal shim.
  return { arrayBuffer: async () => buf, name: 'test.xlsx' } as unknown as File;
}

function makePlan(overrides: Partial<CycleBulkPlan['instances'][number]> = {}): CycleBulkPlan {
  const slotByCanonical = new Map<string, { kind: 'system_scores' | 'eligibility_inputs'; id: string; slot?: any }>();
  slotByCanonical.set('system_scores::5s score', { kind: 'system_scores', id: 's5', slot: { id: 's5', name: '5S Score', weight: 5, scoring_rules: s5Rules, source: 'system' } as any });
  // LTI slot has NO bands and source != manual — should be a per-cell skip.
  slotByCanonical.set('system_scores::lti', { kind: 'system_scores', id: 'lti', slot: { id: 'lti', name: 'LTI', weight: 3, scoring_rules: null, source: 'system' } as any });
  slotByCanonical.set('eligibility_inputs::absent days', { kind: 'eligibility_inputs', id: 'absent' });
  return {
    cycleId: 'c1',
    columns: [
      { name: '5S Score', kind: 'system_scores' },
      { name: 'LTI', kind: 'system_scores' },
      { name: 'Absent Days', kind: 'eligibility_inputs' },
    ],
    unresolvedSlots: [],
    instances: [{
      instanceId: 'i1', employeeCode: 'E1', fullName: 'Alice', doj: null,
      departmentName: '', businessUnitName: '', companyName: '', hasKra: false,
      templateName: 'T', overallStatus: 'pending_self',
      slotByCanonical,
      systemScores: {}, systemScoresRaw: {}, eligibilityInputs: {},
      ...overrides,
    }],
  };
}

describe('parseAndDryRun — partial apply (v2.66.95)', () => {
  it('applies 5S even when LTI column is unlinked (per-cell skip + warning)', async () => {
    const file = makeFile(
      [{ 'Employee Code': 'E1', '5S Score': 92, 'LTI': 0 }],
      ['Employee Code', '5S Score', 'LTI'],
    );
    const report = await parseAndDryRun(file, makePlan());
    expect(report.applyCount).toBe(1);
    expect(report.errorCount).toBe(0);
    const r = report.rows[0];
    expect(r.verdict).toBe('apply');
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].column).toBe('5S Score');
    expect(r.warnings?.[0]).toMatch(/LTI.*not linked/);
  });

  it('applies eligibility even when a system-score cell is non-numeric', async () => {
    const file = makeFile(
      [{ 'Employee Code': 'E1', '5S Score': 'abc', 'Absent Days': 2 }],
      ['Employee Code', '5S Score', 'Absent Days'],
    );
    const report = await parseAndDryRun(file, makePlan());
    expect(report.applyCount).toBe(1);
    expect(report.errorCount).toBe(0);
    const r = report.rows[0];
    expect(r.changes.some((c) => c.column === 'Absent Days')).toBe(true);
    expect(r.warnings?.some((w) => /5S Score.*non-numeric/.test(w))).toBe(true);
  });

  it('skips (not errors) a row whose only value is an unlinked KPI', async () => {
    const file = makeFile(
      [{ 'Employee Code': 'E1', 'LTI': 0 }],
      ['Employee Code', 'LTI'],
    );
    const report = await parseAndDryRun(file, makePlan());
    expect(report.applyCount).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.skipCount).toBe(1);
    expect(report.rows[0].warnings?.[0]).toMatch(/LTI.*not linked/);
  });

  it('still row-errors for unknown employee code', async () => {
    const file = makeFile(
      [{ 'Employee Code': 'GHOST', '5S Score': 80 }],
      ['Employee Code', '5S Score'],
    );
    const report = await parseAndDryRun(file, makePlan());
    expect(report.errorCount).toBe(1);
    expect(report.rows[0].verdict).toBe('error');
  });

  it('still row-skips for a locked stage', async () => {
    const file = makeFile(
      [{ 'Employee Code': 'E1', '5S Score': 80 }],
      ['Employee Code', '5S Score'],
    );
    const report = await parseAndDryRun(file, makePlan({ overallStatus: 'finalized' }));
    expect(report.skipCount).toBe(1);
    expect(report.rows[0].reason).toMatch(/Locked stage/);
  });
});
/**
 * v2.66.11.17 — Bulk Zero-Score stuck-at-stage extension.
 *
 * The edge function now accepts an opt-in `stuck_at_stages` list so an Admin
 * can drain KPIs frozen on a non-responsive reviewer (manager_check /
 * skip_level_check / hr_pms_review / audit / management_review). This test
 * mirrors the sanitizer + reason classifier inline so the contract is locked
 * without booting the Deno edge runtime.
 *
 * See POLICY §115 extension + DOCUMENTATION v2.66.11.17.
 */
import { describe, it, expect } from 'vitest';

const ALLOWED = new Set([
  'kra_set', 'self_review', 'manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review',
]);
const DEFAULT = ['kra_set', 'self_review'];

function sanitizeStuckStages(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT;
  const cleaned = input
    .filter((s): s is string => typeof s === 'string')
    .filter((s) => ALLOWED.has(s));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : DEFAULT;
}

function reasonForStatus(status: string): string {
  return `stuck_at_${status}`;
}

describe('Bulk Zero — stuck_at_stages sanitizer (v2.66.11.17)', () => {
  it('falls back to default when input is missing or empty', () => {
    expect(sanitizeStuckStages(undefined)).toEqual(DEFAULT);
    expect(sanitizeStuckStages(null)).toEqual(DEFAULT);
    expect(sanitizeStuckStages([])).toEqual(DEFAULT);
  });

  it('rejects unknown / terminal statuses (no draining approved or junk)', () => {
    expect(sanitizeStuckStages(['approved', 'kra_set', 'GARBAGE', 'rejected']))
      .toEqual(['kra_set']);
    // All invalid → default fallback.
    expect(sanitizeStuckStages(['approved', 'rejected'])).toEqual(DEFAULT);
  });

  it('passes through all 7 allowed pre-terminal stages, deduped', () => {
    const all = [
      'kra_set', 'self_review', 'manager_check', 'skip_level_check',
      'hr_pms_review', 'audit', 'management_review',
      'kra_set', // duplicate
    ];
    const out = sanitizeStuckStages(all);
    expect(out.length).toBe(7);
    expect(new Set(out)).toEqual(ALLOWED);
  });

  it('handles non-string entries safely', () => {
    expect(sanitizeStuckStages(['kra_set', 42, null, { x: 1 }, 'manager_check']))
      .toEqual(['kra_set', 'manager_check']);
  });
});

describe('Bulk Zero — per-stage reason classifier (v2.66.11.17)', () => {
  // Once the drain runs, each KPI carries an auditable "stuck_at_<stage>"
  // reason so HR / Auditor can trace the originating stuck stage.
  it('emits stuck_at_<status> for every drainable stage', () => {
    expect(reasonForStatus('kra_set')).toBe('stuck_at_kra_set');
    expect(reasonForStatus('self_review')).toBe('stuck_at_self_review');
    expect(reasonForStatus('manager_check')).toBe('stuck_at_manager_check');
    expect(reasonForStatus('skip_level_check')).toBe('stuck_at_skip_level_check');
    expect(reasonForStatus('hr_pms_review')).toBe('stuck_at_hr_pms_review');
    expect(reasonForStatus('audit')).toBe('stuck_at_audit');
    expect(reasonForStatus('management_review')).toBe('stuck_at_management_review');
  });
});

describe('Bulk Zero — reviewer-bypass partition (v2.66.11.17)', () => {
  // UI uses this partition to surface the "bypasses N reviewer stages" warning.
  const REVIEWER_BYPASS = new Set([
    'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review',
  ]);
  it('default (kra_set + self_review) requires NO reviewer bypass', () => {
    const bypass = DEFAULT.filter((s) => REVIEWER_BYPASS.has(s));
    expect(bypass.length).toBe(0);
  });
  it('opting in to manager_check triggers bypass warning', () => {
    const stages = sanitizeStuckStages(['kra_set', 'self_review', 'manager_check']);
    const bypass = stages.filter((s) => REVIEWER_BYPASS.has(s));
    expect(bypass).toEqual(['manager_check']);
  });
  it('full late-stage drain enumerates all 5 reviewer-bypass stages', () => {
    const stages = sanitizeStuckStages([
      'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review',
    ]);
    const bypass = stages.filter((s) => REVIEWER_BYPASS.has(s));
    expect(new Set(bypass)).toEqual(REVIEWER_BYPASS);
  });
});
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Phase 1 — "Reported on behalf of" / Actual Reporter.
 * Locks the contract:
 *   - `actual_reporter_id` is sent through the SECURITY DEFINER RPC payload
 *     (never a direct insert) from SafetyIncidentNew.
 *   - The Incidents list hydrates AND renders the "On behalf of" block.
 *   - The detail page renders both "Reported by" and "On behalf of" lines.
 *   - The CSV export dataset includes `actual_reporter_id`.
 */
describe('Safety — Actual Reporter (file-on-behalf-of)', () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

  it('SafetyIncidentNew sends actual_reporter_id in the RPC payload', () => {
    const src = read('pages/safety/SafetyIncidentNew.tsx');
    expect(src).toMatch(/actual_reporter_id:\s*actualReporterId\s*\|\|\s*null/);
    // Picker UI is present
    expect(src).toMatch(/Reported on behalf of \(optional\)/);
  });

  it('Incidents list hydrates and renders the actual reporter block', () => {
    const src = read('pages/safety/SafetyIncidents.tsx');
    expect(src).toMatch(/actual_reporter_id/);
    expect(src).toMatch(/On behalf of/);
    expect(src).toMatch(/actual_reporter_full_name/);
  });

  it('Detail page shows Reported by + optional On behalf of', () => {
    const src = read('pages/safety/SafetyIncidentDetail.tsx');
    expect(src).toMatch(/Reported by/);
    expect(src).toMatch(/On behalf of/);
  });

  it('CSV export dataset includes actual_reporter_id', () => {
    const src = read('lib/safetyDataExport.ts');
    expect(src).toMatch(/'actual_reporter_id'/);
  });

  it('Hook type exposes actual_reporter_id on input and row', () => {
    const src = read('hooks/useSafetyIncidents.ts');
    expect(src).toMatch(/actual_reporter_id\?:\s*string \| null/);
  });
});
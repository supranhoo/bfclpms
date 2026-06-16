import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression — RCA 2026-06-16 ("Bulk workbook (25 rows)" cap).
 *
 * The Annual Review Admin > Progress tab paginates the grid at 25 rows.
 * Previously the Bulk workbook dialog was wired to that paginated `instances`
 * array, so the downloaded workbook (and upload preview) only ever saw the
 * current page. The fix routes the Bulk workbook trigger through
 * `svc.fetchAllInstancesForExport(...)` — the same paged full-fetch used by
 * Progress snapshot export — so every employee matching the active filters is
 * included.
 */

describe('Annual Review — Bulk workbook full fetch (regression)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/pages/annual-review/AnnualReviewAdmin.tsx'),
    'utf-8',
  );

  it('Bulk workbook trigger calls fetchAllInstancesForExport with active filters', () => {
    expect(src).toMatch(/svc\.fetchAllInstancesForExport\(\s*\{[\s\S]*?cycleId:\s*activeCycle\.id/);
    // The same filter inputs the paginated grid uses must be forwarded.
    for (const key of [
      'search,',
      'status: statusFilter',
      'hasOverride: customWeightsOnly',
      'departmentId:',
      'businessUnitId:',
      'managerId:',
    ]) {
      expect(src).toContain(key);
    }
  });

  it('UnifiedBulkDialog receives the fully-fetched instances, not the paginated page', () => {
    expect(src).toMatch(/instances=\{bulkInstances\s*\?\?\s*\[\]\}/);
    // Guard against reverting to the paged array.
    expect(src).not.toMatch(/<UnifiedBulkDialog[\s\S]{0,400}instances=\{instances\}/);
  });

  it('Closing the dialog clears the cached bulk dataset so re-open re-fetches', () => {
    expect(src).toMatch(/if \(!o\) setBulkInstances\(null\)/);
  });
});

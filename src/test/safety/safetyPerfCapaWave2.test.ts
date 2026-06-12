/**
 * Safety Perf CAPA Wave 2 — static-source guard tests.
 *
 * Locks the Wave 2 invariants:
 *  - Incident mutations (report/transition/revive) must invalidate scoped
 *    keys only — never the bare `['safety']` root which would nuke every
 *    Safety sub-module cache and re-run their queries.
 *  - useReorderSafetyIncidentSeverities must use Promise.all (parallel
 *    round-trips), not a sequential `for` loop.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Safety Perf CAPA Wave 2 — scoped invalidation + parallel reorder', () => {
  it('useSafetyIncidents.ts mutations never invalidate the bare [safety] root', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    // The deprecated list key constant is `SAFETY_INCIDENTS_KEY = ['safety','incidents']`.
    // Mutations should target sub-keys (sla-queue, drill, incident, dashboard-stats, etc.).
    expect(src).not.toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*['"]safety['"]\s*\]\s*\}\s*\)/);
  });

  it('useReportSafetyIncident invalidates the SLA queue and dashboard stats', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    expect(src).toMatch(/SAFETY_SLA_QUEUE_KEY/);
    expect(src).toMatch(/dashboard-stats/);
  });

  it('useTransitionSafetyIncident invalidates the touched incident detail', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    expect(src).toMatch(/\['safety',\s*'incident',\s*vars\.incidentId\]/);
  });

  it('useReorderSafetyIncidentSeverities uses Promise.all (parallel), not a for-loop', () => {
    const src = read('src/hooks/useSafetyIncidentTypes.ts');
    // Locate the reorder hook block.
    const start = src.indexOf('useReorderSafetyIncidentSeverities');
    const end = src.indexOf('useDeleteSafetyIncidentSeverity');
    const block = src.slice(start, end);
    expect(block).toMatch(/Promise\.all/);
    expect(block).not.toMatch(/for\s*\(\s*const\s+r\s+of\s+rows\s*\)/);
  });
});

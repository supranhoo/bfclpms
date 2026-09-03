/**
 * ADR-355 — a reviewer must be able to reopen a KRA after submitting it,
 * including on touch devices (iPad takes the >=768px table path).
 *
 * Guards the two regressions behind the auditor bug report:
 *   1. post-submit rows exposed only an icon-only ghost eye button;
 *   2. the mobile card exposed no reopen control at all once forwarded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('KpiDetailsTable reopen affordance', () => {
  const src = read('src/components/review/KpiDetailsTable.tsx');

  it('routes every completed state through the labelled View control', () => {
    expect(src).toContain('const renderViewButton');
    // no icon-only ghost eye buttons left in the action cell
    expect(src).not.toMatch(/variant="ghost"[^>]*onClick=\{\(\) => onView\(kpi\)\}/);
  });

  it('gives the View control a >=44px touch target', () => {
    expect(src).toMatch(/renderViewButton[\s\S]{0,400}min-h-\[44px\]/);
  });

  it('still labels the control for Forwarded, Draft (Mgmt), Reviewed and N/A rows', () => {
    const occurrences = src.match(/renderViewButton\(kpi/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
  });
});

describe('MobileKpiCard reopen affordance', () => {
  const src = read('src/components/review/MobileKpiCard.tsx');

  it('offers a View button on forwarded audit rows', () => {
    expect(src).toMatch(/if \(isForwarded\) \{[\s\S]{0,600}onView\(kpi\)/);
  });

  it('offers a View button on past-stage team review rows', () => {
    expect(src).toMatch(/if \(isTeamReviewPastStage\) \{[\s\S]{0,600}onView\(kpi\)/);
  });

  it('uses touch-sized targets for the View control', () => {
    expect(src).not.toMatch(/className="h-8 px-2" onClick=\{\(\) => onView\(kpi\)\}/);
  });
});

describe('AuditScorecard keeps the submitted KPI visible', () => {
  const src = read('src/components/review/AuditScorecard.tsx');

  it('clears the status chip filter on every successful submit path', () => {
    const clears = src.match(/setStatusFilter\(null\)/g) ?? [];
    // one per submit path: regular forward, N/A override, N/A confirm, mark N/A
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });
});

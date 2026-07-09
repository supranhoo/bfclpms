import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression: Phased Rollout preview must page every large read so
// PostgREST's 1000-row cap can never silently truncate the audience:
//   • profiles (POLICY §94, ~2,533 active rows)
//   • kpis presence probe
//   • annual_review_instances (per-cycle assigned-form + template filter)
describe('PilotAccessCard pagination', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/components/annual-review/PilotAccessCard.tsx'),
    'utf-8',
  );

  it('uses fetchAllPaged for the profiles preview read', () => {
    expect(src).toMatch(/fetchAllPaged<ProfileRow>/);
  });

  it('does not cap the profiles read with .limit(500)', () => {
    expect(src).not.toMatch(/\.limit\(500\)/);
  });

  it('pages the kpis presence probe', () => {
    expect(src).toMatch(/from\('kpis'\)[\s\S]{0,300}\.range\(from, to\)/);
  });

  it('pages the annual_review_instances reads', () => {
    const matches = src.match(
      /from\('annual_review_instances'\)[\s\S]{0,400}\.range\(from, to\)/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('uses the resolver-aware audience helper for the template filter', () => {
    expect(src).toMatch(/resolveEligibleEmployeeIdsForTemplates/);
  });
});
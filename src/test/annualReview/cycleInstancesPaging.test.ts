import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchAllPaged } from '@/lib/fetchAll';

/**
 * Regression — ADR-135 / POLICY §125.
 *
 * Analytics and Calibration tabs on Annual Review Admin both read the entire
 * cycle roster via `listInstancesForCycle`. That call previously ran a bare
 * `.from('annual_review_instances').select(...).eq('cycle_id', ...)` with no
 * `.range()`, so PostgREST silently truncated the result at 1,000 rows.
 * With ~2,533 active employees in a cycle, the charts and calibration table
 * lost >60% of the population.
 */
describe('Annual Review listInstancesForCycle — paging (POLICY §125)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/annualReview/annualReviewService.ts'),
    'utf-8',
  );

  it('listInstancesForCycle uses fetchAllPaged', () => {
    const fn = src.match(/export async function listInstancesForCycle[\s\S]{0,1200}/);
    expect(fn, 'listInstancesForCycle not found').toBeTruthy();
    expect(fn![0]).toMatch(/fetchAllPaged<InstanceWithEmployee>/);
    expect(fn![0]).toMatch(/\.range\(from, to\)/);
  });

  it('must NOT keep the bare unpaged select that hit the 1,000-row cap', () => {
    const fn = src.match(/export async function listInstancesForCycle[\s\S]{0,1200}/);
    expect(fn).toBeTruthy();
    // The old shape: `.from('annual_review_instances').select(...).eq('cycle_id', ...)` with no `.range`.
    const body = fn![0];
    const hasBareSelect =
      /\.from\('annual_review_instances'\)\s*\.select\([^)]*\)\s*\.eq\('cycle_id'/.test(body) &&
      !/\.range\(from, to\)/.test(body);
    expect(hasBareSelect).toBe(false);
  });

  it('paged fetch returns every instance past the 1,000-row cap', async () => {
    const ROSTER = Array.from({ length: 2533 }, (_, i) => ({
      id: `inst-${i.toString().padStart(5, '0')}`,
    }));
    const rows = await fetchAllPaged<{ id: string }>(async (from, to) => ({
      data: ROSTER.slice(from, to + 1),
      error: null,
    }));
    expect(rows).toHaveLength(2533);
    expect(rows.find((r) => r.id === 'inst-01500')).toBeDefined();
    expect(rows.find((r) => r.id === 'inst-02532')).toBeDefined();
  });

  it('a single unpaged fetch would have hidden 1,533 instances', () => {
    const capped = Array.from({ length: 2533 }, (_, i) => i).slice(0, 1000);
    expect(capped).toHaveLength(1000);
    expect(capped.find((n) => n === 1500)).toBeUndefined();
  });
});
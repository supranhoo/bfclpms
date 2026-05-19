import { describe, it, expect } from 'vitest';
import {
  summarizeBuckets,
  defaultCanonicalForBucket,
  nextAvailableBucket,
  suggestBucketAssignments,
  validateBuckets,
  SKIP_BUCKET,
} from './scanGroupBuckets';

const variants = [
  { kra_name: 'Ensure Zero Harm workplace', kpi_name: 'Total Recordable Injury (LTI): Number of LTI' },
  { kra_name: 'Ensure Zero Harm workplace', kpi_name: 'Total Recordable Injury (LTI): No LTI' },
  { kra_name: 'Ensure Zero Harm workplace', kpi_name: 'Total Recordable Injury (STI): Number of STI' },
  { kra_name: 'Ensure Zero Harm workplace', kpi_name: 'Total Recordable Injury (STI): formula' },
];

describe('scanGroupBuckets', () => {
  it('defaults every variant into a single bucket A', () => {
    const buckets = summarizeBuckets(variants, {});
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucketId).toBe('A');
    expect(buckets[0].variants).toHaveLength(4);
  });

  it('partitions variants across multiple buckets and excludes SKIP', () => {
    const buckets = summarizeBuckets(variants, {
      0: 'A', 1: 'A', 2: 'B', 3: SKIP_BUCKET,
    });
    expect(buckets.map(b => b.bucketId)).toEqual(['A', 'B']);
    expect(buckets[0].variants).toHaveLength(2);
    expect(buckets[1].variants).toHaveLength(1);
  });

  it('picks the longest variant kpi_name as the bucket canonical default', () => {
    const buckets = summarizeBuckets(variants, { 0: 'A', 1: 'A' });
    const canonical = defaultCanonicalForBucket(buckets[0]);
    expect(canonical?.kpi_name).toContain('Number of LTI');
  });

  it('returns the next free bucket letter', () => {
    expect(nextAvailableBucket({})).toBe('A');
    expect(nextAvailableBucket({ 0: 'A' })).toBe('B');
    expect(nextAvailableBucket({ 0: 'A', 1: 'B' })).toBe('C');
  });

  it('auto-suggests LTI vs STI buckets', () => {
    const sugg = suggestBucketAssignments(variants);
    expect(sugg[0]).toBe('A');
    expect(sugg[1]).toBe('A');
    expect(sugg[2]).toBe('B');
    expect(sugg[3]).toBe('B');
  });

  it('flags missing canonical text on validation', () => {
    const buckets = summarizeBuckets(variants, { 0: 'A', 2: 'B' });
    const errors = validateBuckets(buckets, {
      A: { kra: 'KRA', kpi: 'KPI' },
      B: { kra: '', kpi: '' },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Bucket B');
  });

  it('flags an empty group when nothing is bucketed', () => {
    const buckets = summarizeBuckets(variants, {
      0: SKIP_BUCKET, 1: SKIP_BUCKET, 2: SKIP_BUCKET, 3: SKIP_BUCKET,
    });
    const errors = validateBuckets(buckets, {});
    expect(errors[0]).toMatch(/at least one variant/);
  });

  it('supports buckets beyond H up to Z (raised cap)', () => {
    const taken: Record<number, string> = {};
    'ABCDEFGH'.split('').forEach((l, i) => { taken[i] = l; });
    expect(nextAvailableBucket(taken)).toBe('I');

    const takenAY: Record<number, string> = {};
    'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').forEach((l, i) => { takenAY[i] = l; });
    expect(nextAvailableBucket(takenAY)).toBe('Z');

    const takenAZ: Record<number, string> = {};
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((l, i) => { takenAZ[i] = l; });
    expect(nextAvailableBucket(takenAZ)).toBe('Z');
  });

  it('summarizeBuckets sorts arbitrary letters alphabetically (A < M < Z)', () => {
    const buckets = summarizeBuckets(variants, { 0: 'Z', 1: 'A', 2: 'M', 3: 'M' });
    expect(buckets.map(b => b.bucketId)).toEqual(['A', 'M', 'Z']);
    expect(buckets.find(b => b.bucketId === 'M')!.variants).toHaveLength(2);
  });
});

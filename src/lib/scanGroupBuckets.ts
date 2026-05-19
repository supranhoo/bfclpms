/**
 * Helpers for partitioning a fuzzy duplicate-scan group into multiple
 * sub-clusters ("buckets") so admins can produce more than one canonical
 * entry from a single group in one workflow.
 *
 * A bucket id is a single uppercase letter ('A', 'B', 'C', ...) or the
 * special string 'SKIP' (variants excluded from the approval).
 *
 * The default behaviour is that every variant lives in bucket 'A', which
 * makes the new flow a strict superset of the original single-canonical UX.
 */

export type BucketId = string; // 'A' | 'B' | ... | 'SKIP'

export const SKIP_BUCKET: BucketId = 'SKIP';

// A–Z: up to 26 buckets per group (raised from 8 to support large fuzzy clusters).
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export interface VariantLite {
  kra_name: string;
  kpi_name: string;
}

export interface BucketSummary<V extends VariantLite = VariantLite> {
  bucketId: BucketId;
  variants: V[];
  /** Index into the original group.variants array for each entry. */
  indices: number[];
}

/**
 * Build the active-bucket list (everything except SKIP and empty buckets),
 * preserving alphabetical order of bucket ids.
 */
export function summarizeBuckets<V extends VariantLite>(
  variants: V[],
  assignments: Record<number, BucketId>,
): BucketSummary<V>[] {
  const map = new Map<BucketId, BucketSummary<V>>();
  variants.forEach((v, idx) => {
    const id = assignments[idx] ?? 'A';
    if (id === SKIP_BUCKET) return;
    if (!map.has(id)) map.set(id, { bucketId: id, variants: [], indices: [] });
    const b = map.get(id)!;
    b.variants.push(v);
    b.indices.push(idx);
  });
  return [...map.values()].sort((a, b) => a.bucketId.localeCompare(b.bucketId));
}

/**
 * Pick the longest variant kpi_name as the canonical default for the bucket.
 * Falls back to the first variant when lengths tie.
 */
export function defaultCanonicalForBucket<V extends VariantLite>(
  bucket: BucketSummary<V>,
): V | undefined {
  if (bucket.variants.length === 0) return undefined;
  return bucket.variants.reduce(
    (best, v) => (v.kpi_name.length > best.kpi_name.length ? v : best),
    bucket.variants[0],
  );
}

/**
 * Return the next available bucket letter given current assignments.
 * Returns 'A' when the group is empty.
 */
export function nextAvailableBucket(
  assignments: Record<number, BucketId>,
): BucketId {
  const used = new Set<BucketId>(Object.values(assignments));
  for (const l of LETTERS) {
    if (!used.has(l)) return l;
  }
  return LETTERS[LETTERS.length - 1];
}

/**
 * Heuristic auto-split. Looks for well-known disambiguating tokens in the
 * KPI name (LTI vs STI, PM10 vs PM10/AQI, etc.) and assigns each variant to
 * a bucket per token. Variants with no matched token go to bucket 'A'.
 *
 * The split is deterministic: tokens are scanned in priority order and the
 * first matching token wins.
 */
const SPLIT_TOKENS: Array<{ token: string; bucket: BucketId }> = [
  { token: 'lti', bucket: 'A' },
  { token: 'sti', bucket: 'B' },
  { token: 'pm10/aqi', bucket: 'B' },
  { token: 'pm10', bucket: 'A' },
  { token: 'pm 10/aqi', bucket: 'B' },
  { token: 'pm 2.5', bucket: 'B' },
  { token: 'pm2.5', bucket: 'B' },
];

export function suggestBucketAssignments<V extends VariantLite>(
  variants: V[],
): Record<number, BucketId> {
  const result: Record<number, BucketId> = {};
  variants.forEach((v, idx) => {
    const hay = `${v.kra_name} ${v.kpi_name}`.toLowerCase();
    let assigned: BucketId | null = null;
    for (const { token, bucket } of SPLIT_TOKENS) {
      if (hay.includes(token)) {
        assigned = bucket;
        break;
      }
    }
    result[idx] = assigned ?? 'A';
  });
  // If everything ended up in one bucket, the suggestion adds no value;
  // signal the UI to keep the current state by returning a single-bucket map.
  return result;
}

/**
 * Validate that every active bucket has at least one variant and a
 * non-empty canonical KRA + KPI string. Returns an array of human-readable
 * error messages (empty when valid).
 */
export interface CanonicalDraft {
  kra: string;
  kpi: string;
}

export function validateBuckets<V extends VariantLite>(
  buckets: BucketSummary<V>[],
  canonicalByBucket: Record<BucketId, CanonicalDraft>,
): string[] {
  const errors: string[] = [];
  if (buckets.length === 0) {
    errors.push('Assign at least one variant to a bucket before approving.');
    return errors;
  }
  buckets.forEach(b => {
    const c = canonicalByBucket[b.bucketId];
    if (!c || !c.kra.trim() || !c.kpi.trim()) {
      errors.push(`Bucket ${b.bucketId}: canonical KRA and KPI are required.`);
    }
  });
  return errors;
}

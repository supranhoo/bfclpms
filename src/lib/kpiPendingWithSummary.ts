/**
 * Analytics aggregator for the "Pending With" column on the KPI Scorecard
 * Detail report (ADR-135 / POLICY §KSD-PENDING-WITH-ANALYTICS).
 *
 * Pure functions — no I/O. All display strings ("Completed", "N/A", em-dash)
 * are produced here so the on-screen table, column filter, XLSX export and
 * summary card all agree on the same label for a given row.
 */

import { PENDING_WITH_NONE } from '@/lib/kpiPendingWith';

export const PENDING_WITH_COMPLETED = 'Completed';
export const PENDING_WITH_NA = 'N/A';

/** Default overdue threshold, in days. Admin-tunable via the UI select. */
export const DEFAULT_OVERDUE_DAYS = 14;

/** Aging bucket edges (inclusive lower bound, exclusive upper except last). */
export const AGING_BUCKETS = [
  { key: '0-7', label: '0–7 days', min: 0, max: 8 },
  { key: '8-14', label: '8–14 days', min: 8, max: 15 },
  { key: '15-30', label: '15–30 days', min: 15, max: 31 },
  { key: '30+', label: '30+ days', min: 31, max: Number.POSITIVE_INFINITY },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

export interface PendingWithDisplayInput {
  status: string | null | undefined;
  isNa: boolean;
  pendingWith: string | null | undefined;
}

/**
 * Canonical display label for a row's "Pending With" cell.
 *   - N/A KPI                → "N/A"
 *   - Terminal / approved    → "Completed"
 *   - Resolved name / queue  → as-is
 *   - Missing                → em-dash
 */
export function displayPendingWith(row: PendingWithDisplayInput): string {
  if (row.isNa) return PENDING_WITH_NA;
  if (row.status === 'approved') return PENDING_WITH_COMPLETED;
  const v = (row.pendingWith ?? '').trim();
  return v || PENDING_WITH_NONE;
}

/** True when a row still represents work waiting on someone. */
export function isPending(row: { status: string | null | undefined; isNa: boolean }): boolean {
  if (row.isNa) return false;
  if (!row.status) return false;
  return row.status !== 'approved';
}

export interface PendingSummaryRow {
  status: string | null | undefined;
  isNa: boolean;
  pendingWith: string | null | undefined;
  pendingSinceDays: number | null;
}

export interface PendingOwnerAggregate {
  owner: string;
  count: number;
  overdue: number;
  avgDays: number;
  maxDays: number;
}

export interface PendingSummaryOptions {
  overdueDays?: number;
}

/**
 * Group pending rows by `displayPendingWith`, returning per-owner counts,
 * overdue counts, average and max aging. Sorted by count desc, then owner.
 * N/A and Completed rows are excluded (they aren't "pending with" anyone).
 */
export function summarizePendingWith(
  rows: PendingSummaryRow[],
  options: PendingSummaryOptions = {},
): PendingOwnerAggregate[] {
  const overdueDays = options.overdueDays ?? DEFAULT_OVERDUE_DAYS;
  const acc = new Map<string, { count: number; overdue: number; sumDays: number; withDays: number; maxDays: number }>();
  for (const r of rows) {
    if (!isPending(r)) continue;
    const label = displayPendingWith(r);
    if (label === PENDING_WITH_NONE) continue;
    const bucket = acc.get(label) ?? { count: 0, overdue: 0, sumDays: 0, withDays: 0, maxDays: 0 };
    bucket.count += 1;
    const days = r.pendingSinceDays;
    if (typeof days === 'number' && Number.isFinite(days) && days >= 0) {
      bucket.sumDays += days;
      bucket.withDays += 1;
      if (days > bucket.maxDays) bucket.maxDays = days;
      if (days >= overdueDays) bucket.overdue += 1;
    }
    acc.set(label, bucket);
  }
  return [...acc.entries()]
    .map(([owner, b]) => ({
      owner,
      count: b.count,
      overdue: b.overdue,
      avgDays: b.withDays > 0 ? Math.round((b.sumDays / b.withDays) * 10) / 10 : 0,
      maxDays: b.maxDays,
    }))
    .sort((a, b) => (b.count - a.count) || a.owner.localeCompare(b.owner));
}

/** Bucket a single "days pending" value. Returns null for non-pending rows. */
export function bucketAging(days: number | null | undefined): AgingBucketKey | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return null;
  for (const b of AGING_BUCKETS) {
    if (days >= b.min && days < b.max) return b.key;
  }
  return '30+';
}

/** Bucketed aging counts across all pending rows. */
export function agingHistogram(rows: PendingSummaryRow[]): Record<AgingBucketKey, number> {
  const out: Record<AgingBucketKey, number> = { '0-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
  for (const r of rows) {
    if (!isPending(r)) continue;
    const key = bucketAging(r.pendingSinceDays);
    if (key) out[key] += 1;
  }
  return out;
}

/** Total overdue count across all pending rows. */
export function overdueCount(rows: PendingSummaryRow[], overdueDays: number = DEFAULT_OVERDUE_DAYS): number {
  let n = 0;
  for (const r of rows) {
    if (!isPending(r)) continue;
    const d = r.pendingSinceDays;
    if (typeof d === 'number' && Number.isFinite(d) && d >= overdueDays) n += 1;
  }
  return n;
}

/** Compute days between `updatedAt` and now. Null-safe. */
export function daysSince(updatedAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  if (!updatedAt) return null;
  const t = typeof updatedAt === 'string' ? Date.parse(updatedAt) : updatedAt.getTime();
  if (!Number.isFinite(t)) return null;
  const diffMs = now.getTime() - t;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

/**
 * Compute the "pending since" days for a KPI row. Returns null for terminal
 * rows (approved / N/A) so the aging analytics don't count already-closed work.
 */
export function pendingSinceDaysFor(
  row: { status: string | null | undefined; isNa: boolean },
  updatedAt: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!isPending(row)) return null;
  return daysSince(updatedAt, now);
}
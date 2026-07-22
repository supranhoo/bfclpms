import { describe, it, expect } from 'vitest';
import {
  displayPendingWith,
  isPending,
  summarizePendingWith,
  bucketAging,
  agingHistogram,
  overdueCount,
  daysSince,
  pendingSinceDaysFor,
  PENDING_WITH_COMPLETED,
  PENDING_WITH_NA,
  DEFAULT_OVERDUE_DAYS,
} from '@/lib/kpiPendingWithSummary';
import { PENDING_WITH_NONE } from '@/lib/kpiPendingWith';

describe('displayPendingWith', () => {
  it('returns N/A when row is N/A regardless of status/pendingWith', () => {
    expect(displayPendingWith({ status: 'self_review', isNa: true, pendingWith: 'Alice' })).toBe(PENDING_WITH_NA);
  });
  it('returns Completed for approved rows', () => {
    expect(displayPendingWith({ status: 'approved', isNa: false, pendingWith: '' })).toBe(PENDING_WITH_COMPLETED);
  });
  it('returns the resolved name otherwise', () => {
    expect(displayPendingWith({ status: 'self_review', isNa: false, pendingWith: 'Alice' })).toBe('Alice');
  });
  it('falls back to em-dash when no owner resolves', () => {
    expect(displayPendingWith({ status: 'self_review', isNa: false, pendingWith: '' })).toBe(PENDING_WITH_NONE);
  });
});

describe('isPending', () => {
  it('excludes approved and N/A', () => {
    expect(isPending({ status: 'approved', isNa: false })).toBe(false);
    expect(isPending({ status: 'self_review', isNa: true })).toBe(false);
  });
  it('includes any non-terminal stage', () => {
    expect(isPending({ status: 'self_review', isNa: false })).toBe(true);
    expect(isPending({ status: 'manager_check', isNa: false })).toBe(true);
  });
});

describe('bucketAging', () => {
  it('bucket boundaries', () => {
    expect(bucketAging(0)).toBe('0-7');
    expect(bucketAging(7)).toBe('0-7');
    expect(bucketAging(8)).toBe('8-14');
    expect(bucketAging(14)).toBe('8-14');
    expect(bucketAging(15)).toBe('15-30');
    expect(bucketAging(30)).toBe('15-30');
    expect(bucketAging(31)).toBe('30+');
    expect(bucketAging(365)).toBe('30+');
  });
  it('null for non-numeric/negative', () => {
    expect(bucketAging(null)).toBeNull();
    expect(bucketAging(undefined)).toBeNull();
    expect(bucketAging(-1)).toBeNull();
  });
});

describe('summarizePendingWith', () => {
  const rows = [
    { status: 'self_review', isNa: false, pendingWith: 'Alice', pendingSinceDays: 3 },
    { status: 'self_review', isNa: false, pendingWith: 'Alice', pendingSinceDays: 20 },
    { status: 'manager_check', isNa: false, pendingWith: 'Bob', pendingSinceDays: 10 },
    { status: 'approved', isNa: false, pendingWith: '', pendingSinceDays: null },
    { status: 'self_review', isNa: true, pendingWith: 'Alice', pendingSinceDays: 40 },
  ];

  it('aggregates count/overdue/avg/max per owner', () => {
    const out = summarizePendingWith(rows, { overdueDays: 14 });
    const alice = out.find(o => o.owner === 'Alice')!;
    const bob = out.find(o => o.owner === 'Bob')!;
    expect(alice.count).toBe(2);
    expect(alice.overdue).toBe(1);
    expect(alice.avgDays).toBe(11.5);
    expect(alice.maxDays).toBe(20);
    expect(bob.count).toBe(1);
    expect(bob.overdue).toBe(0);
  });

  it('excludes N/A and Completed rows', () => {
    const out = summarizePendingWith(rows);
    expect(out.every(o => o.owner !== PENDING_WITH_COMPLETED && o.owner !== PENDING_WITH_NA)).toBe(true);
  });

  it('sorts by count desc then owner asc', () => {
    const out = summarizePendingWith(rows);
    expect(out[0].owner).toBe('Alice');
  });

  it('overdue total matches sum across owners', () => {
    const total = overdueCount(rows, 14);
    const perOwner = summarizePendingWith(rows, { overdueDays: 14 }).reduce((n, o) => n + o.overdue, 0);
    expect(total).toBe(perOwner);
  });

  it('defaults overdue threshold to DEFAULT_OVERDUE_DAYS', () => {
    expect(DEFAULT_OVERDUE_DAYS).toBe(14);
  });
});

describe('agingHistogram', () => {
  it('places each pending row in exactly one bucket', () => {
    const rows = [
      { status: 'self_review', isNa: false, pendingWith: 'A', pendingSinceDays: 0 },
      { status: 'self_review', isNa: false, pendingWith: 'A', pendingSinceDays: 9 },
      { status: 'self_review', isNa: false, pendingWith: 'A', pendingSinceDays: 20 },
      { status: 'self_review', isNa: false, pendingWith: 'A', pendingSinceDays: 100 },
      { status: 'approved', isNa: false, pendingWith: '', pendingSinceDays: null },
    ];
    const h = agingHistogram(rows);
    expect(h).toEqual({ '0-7': 1, '8-14': 1, '15-30': 1, '30+': 1 });
  });
});

describe('daysSince / pendingSinceDaysFor', () => {
  const now = new Date('2026-07-22T12:00:00Z');
  it('daysSince computes floor of diff in days', () => {
    expect(daysSince('2026-07-15T12:00:00Z', now)).toBe(7);
    expect(daysSince(null, now)).toBeNull();
  });
  it('pendingSinceDaysFor returns null for terminal rows', () => {
    expect(pendingSinceDaysFor({ status: 'approved', isNa: false }, '2026-07-15T12:00:00Z', now)).toBeNull();
    expect(pendingSinceDaysFor({ status: 'self_review', isNa: true }, '2026-07-15T12:00:00Z', now)).toBeNull();
  });
  it('pendingSinceDaysFor returns days for pending rows', () => {
    expect(pendingSinceDaysFor({ status: 'self_review', isNa: false }, '2026-07-15T12:00:00Z', now)).toBe(7);
  });
});
import { describe, it, expect } from 'vitest';
import {
  SAFETY_PERMIT_STATUSES,
  SAFETY_PERMIT_STATUS_LABEL,
  SAFETY_PERMIT_STATUS_TONE,
  SAFETY_PERMIT_TYPES,
  SAFETY_PERMIT_TYPE_LABEL,
  PERMIT_TYPES_REQUIRING_HIRA,
  PERMIT_TYPES_REQUIRING_LOTO,
  permitNeedsHira,
  permitNeedsLoto,
  isPermitEditable,
  isPermitTerminal,
  isPermitLive,
  validatePermitWindow,
  type SafetyPermitStatus,
} from '@/lib/safetyPermits';

/**
 * Phase 2-C — pure-logic test gate for the PTW SSOT.
 *
 * These tests lock:
 *  - the canonical status/type sets (must mirror DB enums exactly),
 *  - editability / terminality / liveness predicates,
 *  - HIRA + LOTO requirement helpers,
 *  - validatePermitWindow boundary cases.
 *
 * They do NOT replace server-side validation — every status mutation goes
 * through an RPC and is re-validated by Postgres. These tests guard the
 * UI from drifting away from the contract.
 */

describe('PTW SSOT — enums and labels', () => {
  it('exposes the 9 canonical statuses in lifecycle order', () => {
    expect(SAFETY_PERMIT_STATUSES).toEqual([
      'draft',
      'submitted',
      'in_approval',
      'approved',
      'active',
      'suspended',
      'closed',
      'rejected',
      'expired',
    ]);
  });

  it('has a label and a badge tone for every status', () => {
    for (const s of SAFETY_PERMIT_STATUSES) {
      expect(SAFETY_PERMIT_STATUS_LABEL[s]).toBeTruthy();
      expect(SAFETY_PERMIT_STATUS_TONE[s]).toBeTruthy();
    }
  });

  it('exposes the 7 canonical permit types and labels them all', () => {
    expect(SAFETY_PERMIT_TYPES).toHaveLength(7);
    for (const t of SAFETY_PERMIT_TYPES) {
      expect(SAFETY_PERMIT_TYPE_LABEL[t]).toBeTruthy();
    }
  });
});

describe('PTW SSOT — status predicates', () => {
  it('only draft permits are editable', () => {
    for (const s of SAFETY_PERMIT_STATUSES) {
      expect(isPermitEditable(s)).toBe(s === 'draft');
    }
  });

  it('terminal statuses are exactly closed/rejected/expired', () => {
    const terminal = SAFETY_PERMIT_STATUSES.filter(isPermitTerminal);
    expect(new Set(terminal)).toEqual(new Set(['closed', 'rejected', 'expired']));
  });

  it('live statuses are exactly active / in_approval / submitted', () => {
    const live = SAFETY_PERMIT_STATUSES.filter(isPermitLive);
    expect(new Set(live)).toEqual(new Set(['active', 'in_approval', 'submitted']));
  });

  it('terminal and live sets are disjoint', () => {
    const live = new Set(SAFETY_PERMIT_STATUSES.filter(isPermitLive));
    const terminal = new Set(SAFETY_PERMIT_STATUSES.filter(isPermitTerminal));
    for (const s of terminal) expect(live.has(s as SafetyPermitStatus)).toBe(false);
  });
});

describe('PTW SSOT — HIRA / LOTO requirement helpers', () => {
  it('flags hot_work, confined_space, work_at_height, electrical, excavation as HIRA-required', () => {
    expect(PERMIT_TYPES_REQUIRING_HIRA).toEqual(
      expect.arrayContaining([
        'hot_work', 'confined_space', 'work_at_height', 'electrical', 'excavation',
      ]),
    );
    expect(permitNeedsHira('hot_work')).toBe(true);
    expect(permitNeedsHira('lifting')).toBe(false);
    expect(permitNeedsHira('general')).toBe(false);
  });

  it('flags electrical, confined_space, lifting as LOTO-required', () => {
    expect(PERMIT_TYPES_REQUIRING_LOTO).toEqual(
      expect.arrayContaining(['electrical', 'confined_space', 'lifting']),
    );
    expect(permitNeedsLoto('electrical')).toBe(true);
    expect(permitNeedsLoto('hot_work')).toBe(false);
    expect(permitNeedsLoto('general')).toBe(false);
  });
});

describe('PTW SSOT — validatePermitWindow', () => {
  const now = new Date('2026-05-01T10:00:00Z');
  const future = (mins: number) => new Date(now.getTime() + mins * 60_000);

  it('accepts a clean future window', () => {
    expect(
      validatePermitWindow({
        startAt: future(30),
        endAt: future(60 * 8),
        now,
      }),
    ).toBeNull();
  });

  it('rejects a start in the past', () => {
    expect(
      validatePermitWindow({
        startAt: future(-120),
        endAt: future(60),
        now,
      }),
    ).toMatch(/future/i);
  });

  it('rejects end ≤ start', () => {
    expect(
      validatePermitWindow({
        startAt: future(60),
        endAt: future(60),
        now,
      }),
    ).toMatch(/after start/i);
  });

  it('rejects a window shorter than 15 minutes', () => {
    expect(
      validatePermitWindow({
        startAt: future(30),
        endAt: future(35),
        now,
      }),
    ).toMatch(/at least 15/i);
  });

  it('rejects a window longer than 30 days', () => {
    expect(
      validatePermitWindow({
        startAt: future(60),
        endAt: future(60 + 31 * 24 * 60),
        now,
      }),
    ).toMatch(/30 days/i);
  });

  it('returns a generic message for invalid dates', () => {
    expect(
      validatePermitWindow({
        startAt: 'not-a-date' as unknown as string,
        endAt: future(60),
        now,
      }),
    ).toBe('Invalid date');
  });

  it('tolerates a 60-second clock-skew window for "in the future"', () => {
    // Start exactly at "now" should still be accepted (60s grace).
    expect(
      validatePermitWindow({
        startAt: now,
        endAt: future(30),
        now,
      }),
    ).toBeNull();
  });
});
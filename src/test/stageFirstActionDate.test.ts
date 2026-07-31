import { describe, it, expect } from 'vitest';
import {
  resolveStageFirstActionDates,
  STAGE_FIRST_ACTION_ACTIONS,
} from '@/lib/review/stageFirstActionDate';

const log = (action: string, created_at: string) => ({ action, created_at });

describe('resolveStageFirstActionDates (ADR-209)', () => {
  it('returns all-null for empty input', () => {
    const r = resolveStageFirstActionDates([]);
    expect(Object.values(r).every(v => v === null)).toBe(true);
    expect(resolveStageFirstActionDates(null).self).toBeNull();
  });

  it('keeps the EARLIEST submission across a send-back / resubmit cycle', () => {
    const r = resolveStageFirstActionDates([
      log('SELF_REVIEW_SUBMITTED', '2026-06-12T09:00:00Z'),
      log('MANAGER_SENT_BACK_TO_EMPLOYEE', '2026-06-10T09:00:00Z'),
      log('SELF_REVIEW_SUBMITTED', '2026-06-05T08:30:00Z'),
    ]);
    expect(r.self).toBe('2026-06-05T08:30:00Z');
  });

  it('ignores generic / non-stage actions', () => {
    const r = resolveStageFirstActionDates([
      log('STATUS_TRANSITION', '2026-06-01T00:00:00Z'),
      log('SUBMISSION_SCORE_CHANGED', '2026-06-01T00:00:00Z'),
      log('RECONCILE_STATUS', '2026-06-01T00:00:00Z'),
      log('MANAGER_SENT_BACK_TO_EMPLOYEE', '2026-06-01T00:00:00Z'),
    ]);
    expect(Object.values(r).every(v => v === null)).toBe(true);
  });

  it('counts backfill and admin-data-entry actions', () => {
    const r = resolveStageFirstActionDates([
      log('BACKFILL_SELF_REVIEW_SUBMITTED', '2026-05-02T00:00:00Z'),
      log('ADMIN_DATA_ENTRY_HR_PMS', '2026-05-09T00:00:00Z'),
      log('BULK_STAGE_SIGNOFF_AUDITOR', '2026-05-11T00:00:00Z'),
    ]);
    expect(r.self).toBe('2026-05-02T00:00:00Z');
    expect(r.hr_pms).toBe('2026-05-09T00:00:00Z');
    expect(r.auditor).toBe('2026-05-11T00:00:00Z');
  });

  it('resolves every workflow stage independently', () => {
    const r = resolveStageFirstActionDates([
      log('SELF_REVIEW_SUBMITTED', '2026-06-01T00:00:00Z'),
      log('MANAGER_FORWARDED', '2026-06-02T00:00:00Z'),
      log('FUNCTIONAL_MANAGER_FORWARDED', '2026-06-03T00:00:00Z'),
      log('SKIP_LEVEL_FORWARDED', '2026-06-04T00:00:00Z'),
      log('HR_PMS_FORWARDED', '2026-06-05T00:00:00Z'),
      log('AUDITOR_REVIEWED', '2026-06-06T00:00:00Z'),
      log('MANAGEMENT_APPROVED', '2026-06-07T00:00:00Z'),
    ]);
    expect(r).toEqual({
      self: '2026-06-01T00:00:00Z',
      manager: '2026-06-02T00:00:00Z',
      functional_manager: '2026-06-03T00:00:00Z',
      skip_level: '2026-06-04T00:00:00Z',
      hr_pms: '2026-06-05T00:00:00Z',
      auditor: '2026-06-06T00:00:00Z',
      management: '2026-06-07T00:00:00Z',
    });
  });

  it('skips rows with a missing action or timestamp', () => {
    const r = resolveStageFirstActionDates([
      { action: null, created_at: '2026-06-01T00:00:00Z' },
      { action: 'SELF_REVIEW_SUBMITTED', created_at: null },
    ]);
    expect(r.self).toBeNull();
  });

  it('never maps the same action to two stages', () => {
    const seen = new Set<string>();
    Object.values(STAGE_FIRST_ACTION_ACTIONS).forEach(actions =>
      actions.forEach(a => {
        expect(seen.has(a)).toBe(false);
        seen.add(a);
      }),
    );
  });
});
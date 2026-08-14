import { describe, it, expect } from 'vitest';
import {
  canRequestRollback,
  isFirstWorkflowStage,
  FIRST_STAGE_ROLLBACK_MESSAGE,
} from '@/lib/rollbackEligibility';

/**
 * ADR-257 — a rollback request is only valid from a stage that has a
 * predecessor. Regression guard for Binay Singh (102013), July 2026:
 * an ADMIN_FULL_RESET left the KPI at `kra_set` and "Request Rollback"
 * failed with "Cannot determine rollback target status".
 */
const STAGES = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];

describe('rollback eligibility', () => {
  it('treats the first stage of the resolved workflow as non-rollbackable', () => {
    expect(isFirstWorkflowStage('kra_set', STAGES)).toBe(true);
    expect(canRequestRollback('kra_set', STAGES)).toBe(false);
  });

  it('allows rollback from every mid-workflow stage', () => {
    for (const s of ['self_review', 'manager_check', 'audit']) {
      expect(isFirstWorkflowStage(s, STAGES)).toBe(false);
      expect(canRequestRollback(s, STAGES)).toBe(true);
    }
  });

  it('never offers rollback on approved KPIs', () => {
    expect(canRequestRollback('approved', STAGES)).toBe(false);
  });

  it('falls back to the canonical list when stages are missing or stale', () => {
    expect(canRequestRollback('kra_set', [])).toBe(false);
    expect(canRequestRollback('kra_set', undefined)).toBe(false);
    expect(canRequestRollback('manager_check', [])).toBe(true);
  });

  it('honours workflows that do not start at kra_set', () => {
    const custom = ['self_review', 'manager_check'];
    expect(canRequestRollback('self_review', custom)).toBe(false);
    expect(canRequestRollback('manager_check', custom)).toBe(true);
  });

  it('exposes a plain-language message', () => {
    expect(FIRST_STAGE_ROLLBACK_MESSAGE).toMatch(/first stage/i);
    expect(FIRST_STAGE_ROLLBACK_MESSAGE).not.toMatch(/target status/i);
  });
});

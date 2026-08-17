import { describe, it, expect } from 'vitest';
import {
  buildStageEntryMap,
  isStageMovingAction,
  resolveDaysInStage,
  type StageAuditLog,
} from '@/lib/review/daysInStage';

const NOW = new Date('2026-08-17T00:00:00Z');
const log = (kpi_id: string, action: string, created_at: string): StageAuditLog => ({ kpi_id, action, created_at });

describe('ADR-292 days in stage', () => {
  it('classifies stage-moving vs noise actions', () => {
    expect(isStageMovingAction('MANAGER_FORWARDED')).toBe(true);
    expect(isStageMovingAction('STATUS_TRANSITION')).toBe(true);
    expect(isStageMovingAction('MANAGER_SENT_BACK_TO_EMPLOYEE')).toBe(true);
    expect(isStageMovingAction('SUBMISSION_SCORE_CHANGED')).toBe(false);
    expect(isStageMovingAction('ORG_KPI_PROPAGATED')).toBe(false);
    expect(isStageMovingAction('QUERY_RAISED')).toBe(false);
    expect(isStageMovingAction(null)).toBe(false);
  });

  it('anchors to the latest stage-moving event, ignoring later score noise', () => {
    const map = buildStageEntryMap([
      log('k1', 'SELF_REVIEW_SUBMITTED', '2026-08-01T00:00:00Z'),
      log('k1', 'MANAGER_FORWARDED', '2026-08-05T00:00:00Z'),
      log('k1', 'SUBMISSION_SCORE_CHANGED', '2026-08-16T00:00:00Z'),
    ]);
    expect(resolveDaysInStage({ kpiId: 'k1', status: 'hr_pms_review', stageEntryMap: map, now: NOW })).toBe(12);
  });

  it('restarts the clock on a send-back', () => {
    const map = buildStageEntryMap([
      log('k2', 'MANAGER_FORWARDED', '2026-07-01T00:00:00Z'),
      log('k2', 'AUDITOR_SENT_BACK_TO_EMPLOYEE', '2026-08-14T00:00:00Z'),
    ]);
    expect(resolveDaysInStage({ kpiId: 'k2', status: 'self_review', stageEntryMap: map, now: NOW })).toBe(3);
  });

  it('falls back to the first audit event when no stage move exists', () => {
    const map = buildStageEntryMap([log('k3', 'ORG_KPI_PROPAGATED', '2026-07-18T00:00:00Z')]);
    expect(resolveDaysInStage({ kpiId: 'k3', status: 'kra_set', stageEntryMap: map, now: NOW })).toBe(30);
  });

  it('falls back to KPI creation date when there is no audit trail at all', () => {
    const map = buildStageEntryMap([]);
    expect(
      resolveDaysInStage({ kpiId: 'k4', status: 'kra_set', createdAt: '2026-07-01T00:00:00Z', stageEntryMap: map, now: NOW }),
    ).toBe(47);
  });

  it('never reports 0 for an old record with only bulk-write history', () => {
    const map = buildStageEntryMap([log('k5', 'STATUS_TRANSITION', '2026-07-04T00:00:00Z')]);
    const days = resolveDaysInStage({ kpiId: 'k5', status: 'manager_check', stageEntryMap: map, now: NOW });
    expect(days).toBeGreaterThan(40);
  });

  it('returns null for terminal (approved) records so they stop ageing', () => {
    const map = buildStageEntryMap([log('k6', 'MANAGEMENT_APPROVED', '2026-08-01T00:00:00Z')]);
    expect(resolveDaysInStage({ kpiId: 'k6', status: 'approved', stageEntryMap: map, now: NOW })).toBeNull();
  });

  it('returns null when nothing can anchor the clock (blank in export)', () => {
    expect(resolveDaysInStage({ kpiId: 'nope', status: 'self_review', stageEntryMap: new Map(), now: NOW })).toBeNull();
  });
});

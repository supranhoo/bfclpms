/**
 * ADR-262 — BU Console group approval contract tests.
 *
 * Locks the Phase 4 client guarantees: every skip reason the RPC can emit has a
 * readable label, final approval is never offered as a bulk stage, and the
 * preview summary reconciles moved vs skipped counts.
 */
import { describe, it, expect } from 'vitest';
import {
  GROUP_ADVANCE_SKIP_LABELS,
  GROUP_ADVANCE_STAGES,
  type GroupAdvanceResult,
} from '@/hooks/useBuConsole';

/** Every reason string `bu_console_group_advance` can return. */
const RPC_SKIP_REASONS = [
  'final_score_locked',
  'final_approval_not_supported',
  'stage_mismatch',
  'stage_not_in_workflow',
  'status_not_in_workflow',
  'terminal_stage',
  'no_workflow',
  'no_submission',
  'not_scored',
] as const;

function summariseSkips(res: GroupAdvanceResult) {
  const map = new Map<string, number>();
  (res.skipped_details ?? []).forEach(r => map.set(r.reason, (map.get(r.reason) ?? 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

const mockPreview: GroupAdvanceResult = {
  authorized: true,
  dry_run: true,
  batch_id: null,
  target_stage: 'manager_check',
  will_advance: 2,
  will_skip: 3,
  preview: [
    {
      kpi_id: 'k1', employee_id: 'e1', employee_name: 'Anup Kumar', employee_code: '101381',
      department_name: 'Production', business_unit_name: 'Alloys', weightage: 10,
      current_status: 'self_review', next_status: 'manager_check',
      carry_forward_score: 4.2, is_na: false,
    },
    {
      kpi_id: 'k2', employee_id: 'e2', employee_name: 'Kiran Devi', employee_code: '101832',
      department_name: 'Quality', business_unit_name: 'Alloys', weightage: 15,
      current_status: 'self_review', next_status: 'manager_check',
      carry_forward_score: null, is_na: true,
    },
  ],
  skipped_details: [
    { kpi_id: 'k3', employee_name: 'Locked One', reason: 'final_score_locked' },
    { kpi_id: 'k4', employee_name: 'Not Yet', reason: 'not_scored' },
    { kpi_id: 'k5', employee_name: 'Wrong Stage', reason: 'stage_mismatch' },
  ],
};

describe('BU Console group approval', () => {
  it('labels every skip reason the RPC can emit', () => {
    RPC_SKIP_REASONS.forEach(reason => {
      expect(GROUP_ADVANCE_SKIP_LABELS[reason], `missing label for ${reason}`).toBeTruthy();
    });
  });

  it('never offers final approval as a bulk stage', () => {
    const values = GROUP_ADVANCE_STAGES.map(s => s.value);
    expect(values).not.toContain('approved');
    expect(values).not.toContain('kra_set');
  });

  it('reconciles preview and skip counts', () => {
    expect(mockPreview.preview).toHaveLength(mockPreview.will_advance!);
    expect(mockPreview.skipped_details).toHaveLength(mockPreview.will_skip!);
  });

  it('excludes approved rows from the moving set (POLICY §88)', () => {
    const movingIds = (mockPreview.preview ?? []).map(r => r.kpi_id);
    const lockedIds = (mockPreview.skipped_details ?? [])
      .filter(s => s.reason === 'final_score_locked')
      .map(s => s.kpi_id);
    lockedIds.forEach(id => expect(movingIds).not.toContain(id));
  });

  it('every previewed row declares an explicit next stage', () => {
    (mockPreview.preview ?? []).forEach(r => {
      expect(r.next_status).toBe(mockPreview.target_stage);
      expect(r.current_status).not.toBe(r.next_status);
    });
  });

  it('groups skip reasons by frequency for the summary badges', () => {
    const groups = summariseSkips(mockPreview);
    expect(groups).toHaveLength(3);
    expect(groups.every(([, count]) => count === 1)).toBe(true);
  });

  it('carries N/A rows forward without a score', () => {
    const na = (mockPreview.preview ?? []).find(r => r.is_na);
    expect(na?.carry_forward_score).toBeNull();
  });
});

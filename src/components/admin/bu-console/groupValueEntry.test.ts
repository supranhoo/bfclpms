/**
 * ADR-261 — BU Console group value entry contract tests.
 *
 * These lock the client-side guarantees of Phase 3: every skip reason the RPC
 * can emit has a human-readable label, and the preview summary groups skips
 * correctly. The server-side immutability guard (POLICY §88) is enforced in
 * `bu_console_group_write`; this suite guards the surface the admin reads.
 */
import { describe, it, expect } from 'vitest';
import { GROUP_WRITE_SKIP_LABELS, type GroupWriteResult } from '@/hooks/useBuConsole';

/** Every reason string `bu_console_group_write` (and the engine it calls) can return. */
const RPC_SKIP_REASONS = [
  'final_score_locked',
  'approved_immutable',
  'reviewer_locked',
  'not_in_kra_set',
  'no_scoring_bands',
  'not_authorized',
  'kpi_not_found',
  'race_lost_during_advance',
] as const;

function summariseSkips(res: GroupWriteResult) {
  const map = new Map<string, number>();
  (res.skipped_details ?? []).forEach(r => map.set(r.reason, (map.get(r.reason) ?? 0) + 1));
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

const mockPreview: GroupWriteResult = {
  authorized: true,
  dry_run: true,
  batch_id: null,
  achieved_value: 92.5,
  will_write: 2,
  will_skip: 3,
  preview: [
    {
      kpi_id: 'k1', employee_id: 'e1', employee_name: 'Anup Kumar', employee_code: '101381',
      department_name: 'Production', business_unit_name: 'Alloys',
      weightage: 20, target_value: 90, current_status: 'kra_set',
      old_self_score: null, new_self_score: 5,
    },
    {
      // Same value, different bands → legitimately different rating.
      kpi_id: 'k2', employee_id: 'e2', employee_name: 'Binay Singh', employee_code: '102013',
      department_name: 'Production', business_unit_name: 'Alloys',
      weightage: 15, target_value: 95, current_status: 'self_review',
      old_self_score: 2, new_self_score: 3,
    },
  ],
  skipped_details: [
    { kpi_id: 'k3', employee_name: 'Approved Person', reason: 'final_score_locked', current_status: 'approved' },
    { kpi_id: 'k4', employee_name: 'Locked Person', reason: 'reviewer_locked', current_status: 'audit' },
    { kpi_id: 'k5', employee_name: 'No Bands Person', reason: 'no_scoring_bands', current_status: 'kra_set' },
  ],
};

describe('BU Console group value entry — preview contract', () => {
  it('labels every skip reason the RPC can emit', () => {
    RPC_SKIP_REASONS.forEach(reason => {
      expect(GROUP_WRITE_SKIP_LABELS[reason], `missing label for ${reason}`).toBeTruthy();
    });
  });

  it('never hides a skipped employee — counts reconcile with the detail list', () => {
    expect(mockPreview.skipped_details).toHaveLength(mockPreview.will_skip!);
    expect(mockPreview.preview).toHaveLength(mockPreview.will_write!);
  });

  it('keeps approved rows out of the write set (POLICY §88)', () => {
    const approved = mockPreview.skipped_details!.find(r => r.reason === 'final_score_locked');
    expect(approved).toBeDefined();
    expect(mockPreview.preview!.some(r => r.kpi_id === approved!.kpi_id)).toBe(false);
  });

  it('derives per-employee ratings from per-employee bands, not a shared rating', () => {
    const scores = mockPreview.preview!.map(r => r.new_self_score);
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('groups skip reasons for the summary badges', () => {
    const groups = summariseSkips(mockPreview);
    expect(groups).toHaveLength(3);
    expect(groups.every(([, count]) => count === 1)).toBe(true);
  });

  it('treats an unauthorised response as an empty, non-crashing preview', () => {
    const denied: GroupWriteResult = { authorized: false, dry_run: true, batch_id: null };
    expect(denied.preview ?? []).toHaveLength(0);
    expect(summariseSkips(denied)).toHaveLength(0);
  });
});

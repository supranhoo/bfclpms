import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSelfAchievedValue } from '@/lib/review/resolveSelfAchievedValue';

/**
 * POLICY §88.5 / ADR-097 — auto-advanced stub refresh on Org KPI re-propagation.
 *
 * These are source-reading regression guards: they pin the SQL contract of
 * `propagate_org_kpi_value` (the only write path that may refresh the Self
 * snapshot) and a resolver round-trip showing the UI surfaces the refreshed
 * value as `pristine`.
 */

function latestPropagateMigration(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(dir, files[i]), 'utf8');
    if (sql.includes('CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value')) {
      return sql;
    }
  }
  throw new Error('No migration defining propagate_org_kpi_value was found');
}

describe('propagate_org_kpi_value — §88.5 auto-advanced stub refresh', () => {
  const sql = latestPropagateMigration();

  it('reads auto_advance_reason / final_score / self_evidence_url(s) before deciding overwrite', () => {
    expect(sql).toMatch(/v_auto_advance_reason/);
    expect(sql).toMatch(/v_final_score/);
    expect(sql).toMatch(/v_existing_self_ev\b/);
    expect(sql).toMatch(/v_existing_self_evs/);
  });

  it('gating predicate matches all four required conditions', () => {
    expect(sql).toMatch(/v_auto_advance_reason IS NOT NULL/);
    expect(sql).toMatch(/v_final_score IS NULL/);
    expect(sql).toMatch(/v_existing_self_ev IS NULL/);
    expect(sql).toMatch(/jsonb_array_length\(v_existing_self_evs\)\s*=\s*0/);
  });

  it('pre_review_only allows overwrite for stubs even when status is past self_review', () => {
    // The stub branch is ORed into the existing pre_review_only check so
    // manager_check / audit / etc. rows refresh too.
    expect(sql).toMatch(/pre_review_only.*v_is_auto_advanced_stub/s);
  });

  it('preserves downstream status on refresh (no step-back, no reviewer-column writes)', () => {
    // The refresh path resolves v_target_status to v_current_status, not 'self_review'.
    expect(sql).toMatch(/WHEN v_was_resync THEN v_current_status/);
    // The reviewer-column clear block is gated behind v_step_back only.
    expect(sql).toMatch(/IF v_step_back THEN[\s\S]*manager_score = NULL/);
    // And v_was_resync is mutually exclusive with v_step_back.
    expect(sql).toMatch(/v_was_resync\s*:=\s*v_is_auto_advanced_stub[^;]*NOT v_step_back/);
  });

  it('writes OKV_AUTO_ADVANCED_RESYNC audit row with system performer and admin_initiated_by', () => {
    expect(sql).toMatch(/'OKV_AUTO_ADVANCED_RESYNC'/);
    // performed_by = NULL (system attribution).
    expect(sql).toMatch(/'OKV_AUTO_ADVANCED_RESYNC',\s*NULL/);
    expect(sql).toMatch(/'admin_initiated_by',\s*v_user/);
    expect(sql).toMatch(/'reason',\s*'auto_advanced_stub_refreshed'/);
  });
});

describe('resolveSelfAchievedValue — consumes refreshed snapshot as pristine', () => {
  it('returns the refreshed self_achieved_value with source=pristine after §88.5 resync', () => {
    // Before resync: stub stamped 98.04 by ADR-048.
    // After resync: self_achieved_value updated to 99.61 by propagate_org_kpi_value.
    const kpi = {
      r5: '100', r4: '99.5', r3: '99', r2: '98.5', r1: '98', r0: '0',
      target_value: 100,
      criteria: 'Higher is Better',
      uom: '%',
      uom_type: 'numeric',
    };
    const submission = {
      self_achieved_value: 99.61,
      achieved_value: 99.61,
      self_score: 4,
    };
    const resolved = resolveSelfAchievedValue(submission, kpi);
    expect(resolved.value).toBe(99.61);
    expect(resolved.source).toBe('pristine');
  });
});
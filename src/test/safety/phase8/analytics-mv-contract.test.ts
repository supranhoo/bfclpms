/**
 * Phase 8 SSOT — Analytics MV contract.
 *
 * Asserts that `useSafetyAnalytics` reads the canonical materialized views
 * (no rename, no removal) and that the refresh path uses the
 * `refresh_safety_analytics` RPC. Static read of the hook source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/hooks/useSafetyAnalytics.ts', 'utf8');

const REQUIRED_MVS = [
  'mv_safety_severity_rate',
  'mv_safety_incidents_open_vs_closed',
  'mv_safety_audit_scoreboard',
  'mv_safety_permit_throughput',
  'mv_safety_incident_monthly_trend',
  // Parity closeout (gap #6): three new MVs backing dashboard widgets
  'mv_safety_recurrence',
  'mv_safety_top_root_causes',
  'mv_safety_dept_risk_trend',
];

describe('Phase 8 — Safety analytics MV contract', () => {
  for (const mv of REQUIRED_MVS) {
    it(`useSafetyAnalytics still reads ${mv}`, () => {
      expect(SRC).toContain(mv);
    });
  }

  it('refresh path uses the refresh_safety_analytics RPC (no ad-hoc REFRESH MATERIALIZED VIEW from client)', () => {
    expect(SRC).toMatch(/refresh_safety_analytics/);
    expect(SRC).not.toMatch(/REFRESH\s+MATERIALIZED\s+VIEW/i);
  });
});

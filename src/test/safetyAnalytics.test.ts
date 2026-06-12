import { describe, it, expect } from 'vitest';
import {
  complianceBand,
  toCsv,
  aggregateTotals,
  type SafetyAnalyticsPayload,
} from '@/lib/safetyAnalytics';

describe('safetyAnalytics SSOT', () => {
  describe('complianceBand', () => {
    it('classifies audit scores', () => {
      expect(complianceBand(95).label).toBe('Excellent');
      expect(complianceBand(80).label).toBe('Good');
      expect(complianceBand(65).label).toBe('Fair');
      expect(complianceBand(50).label).toBe('Poor');
      expect(complianceBand(null).label).toBe('No data');
    });
  });

  describe('toCsv', () => {
    it('produces header and quoted values for special chars', () => {
      const csv = toCsv(
        [{ a: 1, b: 'hello, world' }, { a: 2, b: 'plain' }],
        ['a', 'b'],
      );
      const lines = csv.split('\n');
      expect(lines[0]).toBe('a,b');
      expect(lines[1]).toBe('1,"hello, world"');
      expect(lines[2]).toBe('2,plain');
    });
    it('handles null values as empty', () => {
      const csv = toCsv([{ a: null, b: 'x' }], ['a', 'b']);
      expect(csv).toContain(',x');
    });
  });

  describe('aggregateTotals', () => {
    const payload: SafetyAnalyticsPayload = {
      severity: [
        { business_unit_id: 'a', critical_count: 1, high_count: 2, medium_count: 0, low_count: 0, total_count: 3 },
        { business_unit_id: 'b', critical_count: 0, high_count: 1, medium_count: 1, low_count: 1, total_count: 3 },
      ],
      open_vs_closed: [
        { business_unit_id: 'a', open_count: 2, closed_count: 1, orphaned_count: 0 },
        { business_unit_id: 'b', open_count: 3, closed_count: 5, orphaned_count: 0 },
      ],
      audit_scoreboard: [
        { business_unit_id: 'a', run_count: 2, avg_score: 90, excellent_count: 2, good_count: 0, poor_count: 0 },
        { business_unit_id: 'b', run_count: 1, avg_score: 60, excellent_count: 0, good_count: 0, poor_count: 1 },
      ],
      permit_throughput: [
        { business_unit_id: 'a', total_permits: 5, approved_count: 3, active_count: 2, expired_count: 0, rejected_count: 0 },
        { business_unit_id: 'b', total_permits: 4, approved_count: 2, active_count: 1, expired_count: 1, rejected_count: 0 },
      ],
      monthly_trend: [],
      refreshed_at: new Date().toISOString(),
    };

    it('sums open / closed counts', () => {
      const t = aggregateTotals(payload);
      expect(t.openIncidents).toBe(5);
      expect(t.closedIncidents).toBe(6);
    });
    it('sums critical severity', () => {
      expect(aggregateTotals(payload).criticalSev).toBe(1);
    });
    it('sums active permits', () => {
      expect(aggregateTotals(payload).activePermits).toBe(3);
    });
    it('weights audit avg by run_count', () => {
      // (90*2 + 60*1) / 3 = 80
      expect(aggregateTotals(payload).avgAuditScore).toBe(80);
    });
    it('returns null audit avg when no runs', () => {
      const empty = { ...payload, audit_scoreboard: [] };
      expect(aggregateTotals(empty).avgAuditScore).toBeNull();
    });
  });
});
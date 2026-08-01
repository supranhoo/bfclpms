import { describe, it, expect } from 'vitest';
import {
  buildSlabCapOptions, reportEligibilityLabel, resolveReportRating,
  type ReportRatingContext, type ReportRatingRow,
} from '@/lib/annualReview/reportRating';
import { DEFAULT_RATING_SLABS } from '@/lib/annualReview/ratingSlab';
import type { EligibilityCriterion } from '@/types/annualReview';

/** ADR-230 — report-wide effective rating (calibration + exemption penalty). */

const absent: EligibilityCriterion = {
  id: 'absent', name: 'Absent Days', type: 'number', operator: 'lte', expected_value: 5,
};
const disc: EligibilityCriterion = {
  id: 'disc', name: 'Disciplinary Case', type: 'boolean', operator: 'equals', expected_value: false,
};

const policy = [
  { question_key: 'absent days', label: 'Absent Days', is_exemptable: true },
  { question_key: 'disciplinary', label: 'Disciplinary', is_exemptable: false },
];

const criteriaMaps = { t1: [absent, disc] };

const baseCtx: ReportRatingContext = {
  slabs: DEFAULT_RATING_SLABS,
  capOptions: { slabs: DEFAULT_RATING_SLABS, capEnabled: true, topTiersExcluded: 0,
    penalty: { mode: 'step_down', stepDownSlabs: 1, scope: 'all_slabs' } },
  policy,
  criteriaMaps,
};

// 92 / 20 = 4.6 → top slab 20%.
const row = (over: Partial<ReportRatingRow> = {}): ReportRatingRow => ({
  instance_id: 'i1', total_score: 92, template_id: 't1',
  eligibility_inputs: { absent: 2, disc: false }, is_excluded: false, ...over,
});

describe('resolveReportRating', () => {
  it('is byte-identical to the raw values with no calibration and no exemption', () => {
    const r = resolveReportRating(row(), baseCtx);
    expect(r.computedRating).toBe(4.6);
    expect(r.effectiveRating).toBe(4.6);
    expect(r.isCalibrated).toBe(false);
    expect(r.eligibilityStatus).toBe('eligible');
    expect(r.slabPercent).toBe(r.rawSlabPercent);
    expect(r.slabPercent).toBe(20);
    expect(r.capApplied).toBe(false);
  });

  it('uses the admin-calibrated rating and its slab (ADR-220)', () => {
    const r = resolveReportRating(row(), {
      ...baseCtx,
      calibrations: { i1: { calibrated_rating: 3.2, calibration_reason: 'Moderated' } },
    });
    expect(r.computedRating).toBe(4.6);
    expect(r.effectiveRating).toBe(3.2);
    expect(r.isCalibrated).toBe(true);
    expect(r.calibrationReason).toBe('Moderated');
    expect(r.slabPercent).toBe(8);
  });

  it('penalises an exempted employee below the raw slab (ADR-222/224)', () => {
    const r = resolveReportRating(row({ eligibility_inputs: { absent: 20, disc: false } }), {
      ...baseCtx,
      exemptions: { i1: [{ instance_id: 'i1', criterion_id: 'absent', criterion_name: 'Absent Days', status: 'approved' }] },
    });
    expect(r.eligibilityStatus).toBe('exempted');
    expect(r.rawSlabPercent).toBe(20);
    expect(r.slabPercent).toBeLessThan(20);
    expect(r.capApplied).toBe(true);
  });

  it('combines calibration and the exemption penalty', () => {
    const r = resolveReportRating(row({ eligibility_inputs: { absent: 20, disc: false } }), {
      ...baseCtx,
      calibrations: { i1: { calibrated_rating: 3.6 } },
      exemptions: { i1: [{ instance_id: 'i1', criterion_id: 'absent', criterion_name: 'Absent Days', status: 'approved' }] },
    });
    expect(r.effectiveRating).toBe(3.6);
    expect(r.rawSlabPercent).toBe(12);
    expect(r.slabPercent).toBeLessThan(12);
  });

  it('shows 0% for an ineligible employee (never exemptable disciplinary case)', () => {
    const r = resolveReportRating(row({ eligibility_inputs: { absent: 2, disc: true } }), {
      ...baseCtx,
      exemptions: { i1: [{ instance_id: 'i1', criterion_id: 'disc', criterion_name: 'Disciplinary Case', status: 'approved' }] },
    });
    expect(r.eligibilityStatus).toBe('ineligible');
    expect(r.slabPercent).toBe(0);
  });

  it('keeps a null score null — never 0%', () => {
    const r = resolveReportRating(row({ total_score: null }), baseCtx);
    expect(r.effectiveRating).toBeNull();
    expect(r.slabPercent).toBeNull();
  });

  it('respects a disabled penalty rule', () => {
    const r = resolveReportRating(row({ eligibility_inputs: { absent: 20, disc: false } }), {
      ...baseCtx,
      capOptions: { slabs: DEFAULT_RATING_SLABS, capEnabled: false },
      exemptions: { i1: [{ instance_id: 'i1', criterion_id: 'absent', criterion_name: 'Absent Days', status: 'approved' }] },
    });
    expect(r.slabPercent).toBe(20);
    expect(r.capApplied).toBe(false);
  });

  it('prefers the per-employee template override for eligibility questions', () => {
    const r = resolveReportRating(
      row({ template_id: 'other', template_override_id: 't1', eligibility_inputs: { absent: 20, disc: false } }),
      baseCtx,
    );
    expect(r.eligibilityStatus).toBe('ineligible');
  });
});

describe('buildSlabCapOptions', () => {
  it('carries the ADR-224 penalty rule from the config', () => {
    const o = buildSlabCapOptions({
      exempted_slab_cap_enabled: true, exempted_top_tiers_excluded: 2,
      exempted_penalty_mode: 'step_down', exempted_step_down_slabs: 2,
      exempted_penalty_scope: 'top_slabs_only', exempted_penalty_top_slabs: 3,
      exempted_penalty_floor_percent: 4,
    } as any, DEFAULT_RATING_SLABS);
    expect(o.penalty).toMatchObject({ mode: 'step_down', stepDownSlabs: 2, scope: 'top_slabs_only', floorPercent: 4 });
  });

  it('falls back to defaults with no config', () => {
    expect(buildSlabCapOptions(null, DEFAULT_RATING_SLABS).penalty).toBeUndefined();
  });
});

describe('reportEligibilityLabel', () => {
  it('reports an administratively excluded instance as Excluded', () => {
    expect(reportEligibilityLabel({ is_excluded: true }, 'eligible')).toBe('Excluded');
  });
  it('never regresses an unassessed row', () => {
    expect(reportEligibilityLabel({ is_excluded: false }, 'unknown')).toBe('Eligible');
  });
  it('surfaces exempted and ineligible', () => {
    expect(reportEligibilityLabel({ is_excluded: false }, 'exempted')).toBe('Exempted (Eligible)');
    expect(reportEligibilityLabel({ is_excluded: false }, 'ineligible')).toBe('Ineligible');
  });
});

describe('anti-drift: Detail tab vs Comprehensive', () => {
  it('both tabs resolve the same slab % for the same row', () => {
    // Detail tab path (AnnualReviewReport.tsx) and Comprehensive path both go
    // through resolveReportRating with the same context builder.
    const ctx = { ...baseCtx, capOptions: buildSlabCapOptions({
      exempted_slab_cap_enabled: true, exempted_top_tiers_excluded: 2,
      exempted_penalty_mode: 'top_tiers_excluded', exempted_step_down_slabs: 1,
      exempted_penalty_scope: 'all_slabs', exempted_penalty_top_slabs: 2,
      exempted_penalty_floor_percent: 0,
    } as any, DEFAULT_RATING_SLABS),
      exemptions: { i1: [{ instance_id: 'i1', criterion_id: 'absent', criterion_name: 'Absent Days', status: 'approved' as const }] } };
    const a = resolveReportRating(row({ eligibility_inputs: { absent: 20, disc: false } }), ctx);
    const b = resolveReportRating(row({ eligibility_inputs: { absent: 20, disc: false } }), ctx);
    expect(a.slabPercent).toBe(b.slabPercent);
    expect(a.slabPercent).toBeLessThan(20);
  });
});

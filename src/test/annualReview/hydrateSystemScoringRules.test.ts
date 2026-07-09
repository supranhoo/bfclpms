import { describe, it, expect } from 'vitest';
import { __resolveScoringRulesForTests } from '@/services/annualReview/cycleBulkDataUpload';
import { scoreFromRaw, type ScoringRules } from '@/lib/annualReview/systemKpiScoring';
import type { AnnualReviewTemplate, TemplateSystemScore } from '@/types/annualReview';

/**
 * End-to-end lock for the scoring linkage: for every historical drift name
 * observed in the v2.66.90 audit, the hydrator must attach the correct bands
 * so bulk upload scores match the KPI Library semantics.
 *
 * If any of these tests fail, either:
 *   (a) the alias map (systemKpiAliases.ts) is missing / wrong, OR
 *   (b) the KPI Library key has changed — update SYSTEM_KPI_ALIASES.
 */

const library = [
  {
    key: 'lti_rate',
    name_en: 'Lost Time Injury (LTI) Rate',
    scoring_rules: {
      direction: 'lower_better',
      bands: [
        { score: 5, threshold: 0 }, { score: 4, threshold: 1 },
        { score: 3, threshold: 2 }, { score: 2, threshold: 3 },
        { score: 1, threshold: 4 }, { score: 0, threshold: 999 },
      ],
    } as ScoringRules,
    uom_type: 'count',
  },
  {
    key: 'sti_rate',
    name_en: 'Short Time Injury (STI) Rate',
    scoring_rules: {
      direction: 'lower_better',
      bands: [
        { score: 5, threshold: 0 }, { score: 4, threshold: 1 },
        { score: 3, threshold: 2 }, { score: 2, threshold: 3 },
        { score: 1, threshold: 4 }, { score: 0, threshold: 999 },
      ],
    } as ScoringRules,
    uom_type: 'count',
  },
  {
    key: 'ua_uc_nm',
    name_en: 'Unsafe Act / Unsafe Condition / Near Miss — Reported by self',
    scoring_rules: {
      direction: 'higher_better',
      bands: [
        { score: 5, threshold: 5 }, { score: 4, threshold: 4 },
        { score: 3, threshold: 3 }, { score: 2, threshold: 2 },
        { score: 1, threshold: 1 }, { score: 0, threshold: 0 },
      ],
    } as ScoringRules,
    uom_type: 'count',
  },
  {
    key: 's5',
    name_en: 'Departmental Status of 5S',
    scoring_rules: {
      direction: 'higher_better',
      bands: [
        { score: 5, threshold: 5 }, { score: 4, threshold: 4 },
        { score: 3, threshold: 3 }, { score: 2, threshold: 2 },
        { score: 1, threshold: 1 }, { score: 0, threshold: 0 },
      ],
    } as ScoringRules,
    uom_type: 'rating',
  },
  {
    key: 'training_attended',
    name_en: 'Trainings Attended',
    scoring_rules: {
      direction: 'higher_better',
      bands: [
        { score: 5, threshold: 5 }, { score: 4, threshold: 4 },
        { score: 3, threshold: 3 }, { score: 2, threshold: 2 },
        { score: 1, threshold: 1 }, { score: 0, threshold: 0 },
      ],
    } as ScoringRules,
    uom_type: 'count',
  },
  {
    key: 'fugitive_pm10',
    name_en: 'Fugitive PM10 / AQI Non-Compliance Days',
    scoring_rules: {
      direction: 'lower_better',
      bands: [
        { score: 5, threshold: 0 }, { score: 4, threshold: 12 },
        { score: 3, threshold: 24 }, { score: 2, threshold: 36 },
        { score: 1, threshold: 48 }, { score: 0, threshold: 999 },
      ],
    } as ScoringRules,
    uom_type: 'days',
  },
  {
    key: 'annual_production',
    name_en: 'Annual Production Target vs Actual',
    scoring_rules: {
      direction: 'higher_better',
      bands: [
        { score: 5, threshold: 100 }, { score: 4, threshold: 95 },
        { score: 3, threshold: 90 }, { score: 2, threshold: 85 },
        { score: 1, threshold: 80 }, { score: 0, threshold: -1 },
      ],
    } as ScoringRules,
    uom_type: 'percent',
  },
  {
    key: 'annual_pm',
    name_en: 'Annual Preventive Maintenance Target vs Actual',
    scoring_rules: {
      direction: 'higher_better',
      bands: [
        { score: 5, threshold: 100 }, { score: 4, threshold: 95 },
        { score: 3, threshold: 90 }, { score: 2, threshold: 85 },
        { score: 1, threshold: 80 }, { score: 0, threshold: -1 },
      ],
    } as ScoringRules,
    uom_type: 'percent',
  },
];

function mkSlot(partial: Partial<TemplateSystemScore>): TemplateSystemScore {
  return { id: crypto.randomUUID(), name: 'x', weight: 3, source: 'safety', ...partial };
}

function mkTemplate(name: string, slots: TemplateSystemScore[]): AnnualReviewTemplate {
  return {
    id: crypto.randomUUID(),
    name,
    sections: { system_scores: slots, criteria: [], eligibility_criteria: [] },
  } as unknown as AnnualReviewTemplate;
}

describe('hydrateSystemScoringRules — drift-name coverage', () => {
  it('resolves all 6 historical drift slot names + 2 already-matching', () => {
    const slots: TemplateSystemScore[] = [
      mkSlot({ name: 'Lost Time Injury (LTI) Rate', weight: 3 }),
      mkSlot({ name: 'Short Time Injury(STI) Rate', weight: 2 }),
      mkSlot({ name: 'Departmental Status of 5S in AY 25-26   ', weight: 6 }),
      mkSlot({ name: 'Traiining Attended in AY 25-26  ', weight: 4 }),
      mkSlot({ name: 'Unsafe Act Unsafe Condition Near Miss - Reported by self', weight: 3 }),
      mkSlot({ name: 'Fugitive PM10/AQI Non Compliance days', weight: 3 }),
      mkSlot({ name: 'Annual Production Target Vs Actual', weight: 10 }),
      mkSlot({ name: 'Annual Maintenance Preventive Maintenance Target vs. Actual', weight: 5 }),
    ];
    const t = mkTemplate('Generic W with env (Functional)', slots);

    const unresolved = __resolveScoringRulesForTests([t], library);
    expect(unresolved).toEqual([]);

    // Every slot must now have bands attached.
    for (const s of slots) {
      expect(s.scoring_rules?.bands?.length).toBeGreaterThan(0);
    }

    // Spot-check representative scoring outcomes ---------------------------
    // LTI = 0 → rating 5 (best), points = 3
    const lti = slots[0];
    expect(scoreFromRaw(0, lti.scoring_rules!, lti.weight).rating).toBe(5);
    expect(scoreFromRaw(3, lti.scoring_rules!, lti.weight).rating).toBe(2);

    // STI = 0 → rating 5 (best); STI = 2 → rating 3
    const sti = slots[1];
    expect(scoreFromRaw(0, sti.scoring_rules!, sti.weight).rating).toBe(5);
    expect(scoreFromRaw(2, sti.scoring_rules!, sti.weight).rating).toBe(3);

    // 5S = 5 → rating 5; 5S = 2 → rating 2
    const fiveS = slots[2];
    expect(scoreFromRaw(5, fiveS.scoring_rules!, fiveS.weight).rating).toBe(5);
    expect(scoreFromRaw(2, fiveS.scoring_rules!, fiveS.weight).rating).toBe(2);

    // Trainings = 5 → 5; = 0 → 0
    const tr = slots[3];
    expect(scoreFromRaw(5, tr.scoring_rules!, tr.weight).rating).toBe(5);
    expect(scoreFromRaw(0, tr.scoring_rules!, tr.weight).rating).toBe(0);

    // Unsafe-act reporting higher_better: 4 reports → 4, 0 → 0
    const ua = slots[4];
    expect(scoreFromRaw(4, ua.scoring_rules!, ua.weight).rating).toBe(4);
    expect(scoreFromRaw(0, ua.scoring_rules!, ua.weight).rating).toBe(0);

    // Fugitive PM10 lower_better: 0 → 5, 39 → 1 (39 ≤ 48)
    const pm = slots[5];
    expect(scoreFromRaw(0, pm.scoring_rules!, pm.weight).rating).toBe(5);
    expect(scoreFromRaw(39, pm.scoring_rules!, pm.weight).rating).toBe(1);

    // Production % higher_better: 100 → 5, 82 → 1
    const prod = slots[6];
    expect(scoreFromRaw(100, prod.scoring_rules!, prod.weight).rating).toBe(5);
    expect(scoreFromRaw(82, prod.scoring_rules!, prod.weight).rating).toBe(1);

    // PM % higher_better: 91 → 3
    const pmMaint = slots[7];
    expect(scoreFromRaw(91, pmMaint.scoring_rules!, pmMaint.weight).rating).toBe(3);
  });

  it('prefers explicit library_key over name matching', () => {
    const slot = mkSlot({ name: 'Completely wrong name', library_key: 'lti_rate' });
    const t = mkTemplate('X', [slot]);
    const unresolved = __resolveScoringRulesForTests([t], library);
    expect(unresolved).toEqual([]);
    expect(slot.scoring_rules?.direction).toBe('lower_better');
  });

  it('surfaces truly unknown slots as unresolved (no silent legacy fallback)', () => {
    const slot = mkSlot({ name: 'Made-up KPI Never Seen Before' });
    const t = mkTemplate('Weird Template', [slot]);
    const unresolved = __resolveScoringRulesForTests([t], library);
    expect(unresolved).toEqual([
      { name: 'Made-up KPI Never Seen Before', templateNames: ['Weird Template'] },
    ]);
    expect(slot.scoring_rules).toBeUndefined();
  });

  it('skips carry_kra slots — they are computed, never uploaded', () => {
    const slot = mkSlot({ name: 'Carry from KRA', source: 'carry_kra' });
    const t = mkTemplate('KRA template', [slot]);
    const unresolved = __resolveScoringRulesForTests([t], library);
    expect(unresolved).toEqual([]);
  });
});
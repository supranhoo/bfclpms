import { describe, it, expect } from 'vitest';
import {
  buildNormalisePlan, changeSetFor, definitionOf, matchesDefinition,
  pickCanonicalVariant, planIsNoOp, aggregateNormalise, normText, classifyVariance,
  type VariantLike,
} from './variantNormalise';

const v = (over: Partial<VariantLike> & { variant_key: string }): VariantLike => ({
  description: null, formula: null, scoring_logic: null, target_value: null,
  employee_count: 0, kpi_rows: 0, ...over,
});

// Mirrors the real July 2026 "Power generation from 45 MWh" case: the two
// variants have description and formula swapped.
const swapped: VariantLike[] = [
  v({ variant_key: 'a', description: 'Power generated in MWh', formula: 'Actual / Target * 100', scoring_logic: '5 = >=100%', target_value: 45, employee_count: 6 }),
  v({ variant_key: 'b', description: 'Actual / Target * 100', formula: 'Power generated in MWh', scoring_logic: '5 = >=100%', target_value: 45, employee_count: 2 }),
  v({ variant_key: 'c', description: 'Power generated in MWh', formula: 'Actual / Target * 100', scoring_logic: '5  =   >=100%', target_value: 45, employee_count: 3 }),
  v({ variant_key: 'd', description: null, formula: null, scoring_logic: null, target_value: 45, employee_count: 1 }),
];

describe('normText', () => {
  it('collapses whitespace and case, treats null as empty', () => {
    expect(normText('  A   b ')).toBe('a b');
    expect(normText(null)).toBe('');
    expect(normText(undefined)).toBe('');
  });
});

describe('pickCanonicalVariant', () => {
  it('prefers the variant covering most employees', () => {
    expect(pickCanonicalVariant(swapped)?.variant_key).toBe('a');
  });

  it('falls back to the most complete definition on a tie', () => {
    const tie = [
      v({ variant_key: 'x', employee_count: 4, kpi_rows: 4 }),
      v({ variant_key: 'y', employee_count: 4, kpi_rows: 4, description: 'd', formula: 'f' }),
    ];
    expect(pickCanonicalVariant(tie)?.variant_key).toBe('y');
  });

  it('is deterministic when everything ties', () => {
    const tie = [v({ variant_key: 'b2' }), v({ variant_key: 'a2' })];
    expect(pickCanonicalVariant(tie)?.variant_key).toBe('a2');
  });

  it('returns null for an empty list', () => {
    expect(pickCanonicalVariant([])).toBeNull();
  });
});

describe('matchesDefinition', () => {
  it('ignores whitespace drift in the scoring text', () => {
    const def = definitionOf(swapped[0]);
    expect(matchesDefinition(swapped[2], def)).toBe(true);
  });

  it('flags a swapped description/formula pair as different', () => {
    const def = definitionOf(swapped[0]);
    expect(matchesDefinition(swapped[1], def)).toBe(false);
  });
});

describe('changeSetFor', () => {
  it('emits only the fields that actually differ', () => {
    const def = definitionOf(swapped[0]);
    expect(Object.keys(changeSetFor(swapped[1], def)).sort())
      .toEqual(['kpi_description', 'kpi_formula']);
  });

  it('never emits a weightage field', () => {
    const def = definitionOf(swapped[0]);
    for (const variant of swapped) {
      expect(Object.keys(changeSetFor(variant, def))).not.toContain('weightage');
    }
  });

  it('writes NULL when the canonical value is empty', () => {
    const def = { description: '', formula: 'f', scoring_logic: '', target_value: '45' };
    const changes = changeSetFor(swapped[0], def);
    expect(changes.kpi_description).toBeNull();
  });

  it('includes the target when it differs', () => {
    const def = { ...definitionOf(swapped[0]), target_value: '50' };
    expect(changeSetFor(swapped[0], def).target_value).toBe('50');
  });
});

describe('buildNormalisePlan', () => {
  it('rewrites only the non-matching variants', () => {
    const plan = buildNormalisePlan(swapped, 'a');
    expect(plan.steps.map(s => s.variantKey).sort()).toEqual(['b', 'd']);
    expect(plan.alreadyAligned.sort()).toEqual(['a', 'c']);
    expect(plan.employeesAffected).toBe(3); // b(2) + d(1)
    expect(plan.predictedVariantCount).toBe(1);
  });

  it('rewrites the canonical rows too when the definition is edited', () => {
    const plan = buildNormalisePlan(swapped, 'a', {
      ...definitionOf(swapped[0]), description: 'Power generation (MWh) — AFBC',
    });
    expect(plan.steps.map(s => s.variantKey)).toContain('a');
    expect(plan.steps.map(s => s.variantKey)).toContain('c');
  });

  it('is a no-op when every variant already matches', () => {
    const same = [
      v({ variant_key: 'p', description: 'd', formula: 'f', scoring_logic: 's', target_value: 45 }),
      v({ variant_key: 'q', description: ' D ', formula: 'F', scoring_logic: 's', target_value: 45 }),
    ];
    const plan = buildNormalisePlan(same, 'p');
    expect(plan.steps).toHaveLength(0);
    expect(planIsNoOp(plan)).toBe(true);
  });

  it('defaults the canonical variant when the key is unknown', () => {
    const plan = buildNormalisePlan(swapped, 'does-not-exist');
    expect(plan.canonicalKey).toBe('a');
  });
});

describe('aggregateNormalise', () => {
  it('sums dry-run counters across variants and months', () => {
    const totals = aggregateNormalise([
      { variantKey: 'b', target: { month: 'Jul', year: 2026 }, result: { will_write: 2, will_skip: 1 } },
      { variantKey: 'd', target: { month: 'Jul', year: 2026 }, result: { will_write: 1, will_skip: 0 } },
      { variantKey: 'b', target: { month: 'Aug', year: 2026 }, result: { will_write: 2, will_skip: 0 } },
    ]);
    expect(totals.willWrite).toBe(5);
    expect(totals.willSkip).toBe(1);
    expect(totals.failed).toBe(0);
  });

  it('counts failures without inflating the write totals', () => {
    const totals = aggregateNormalise([
      { variantKey: 'b', target: { month: 'Jul', year: 2026 }, result: null, error: 'boom' },
      { variantKey: 'd', target: { month: 'Jul', year: 2026 }, result: { updated: 3 } },
    ]);
    expect(totals.failed).toBe(1);
    expect(totals.updated).toBe(3);
    expect(totals.willWrite).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* ADR-325 — wording vs target variance                                */
/* ------------------------------------------------------------------ */

// Mirrors the SOP/SMP case: same metric, wording drift plus three real bars.
const sop: VariantLike[] = [
  v({ variant_key: 's1', description: 'SOP creation', formula: '(Number of SOPs created)', scoring_logic: '5 for 5', target_value: 5, employee_count: 3 }),
  v({ variant_key: 's2', description: 'SOP creation', formula: 'Number of SOPs created', scoring_logic: '5 for 7', target_value: 7, employee_count: 2 }),
  v({ variant_key: 's3', description: 'SOP creation', formula: '% of SOPs created', scoring_logic: '5 for 10', target_value: 10, employee_count: 1 }),
];

describe('classifyVariance', () => {
  it('splits the SOP case into wording groups and target groups', () => {
    const c = classifyVariance(sop);
    expect(c.wordingGroups).toBe(3);
    expect(c.targetGroups).toBe(3);
    expect(c.targets).toEqual(['5', '7', '10']);
    expect(c.hasWordingDrift).toBe(true);
    expect(c.targetsOnly).toBe(false);
  });

  it('flags target-only variance as deliberate, not drift', () => {
    const c = classifyVariance([
      v({ variant_key: 'a', description: 'd', formula: 'f', scoring_logic: 's', target_value: 5 }),
      v({ variant_key: 'b', description: 'd', formula: 'f', scoring_logic: 's', target_value: 9 }),
    ]);
    expect(c.wordingGroups).toBe(1);
    expect(c.targetGroups).toBe(2);
    expect(c.targetsOnly).toBe(true);
    expect(c.hasWordingDrift).toBe(false);
  });
});

describe('wording mode', () => {
  const def = definitionOf(sop[0]);

  it('never emits a target, even when the canonical target differs', () => {
    const cs = changeSetFor(sop[2], def, 'wording');
    expect(Object.keys(cs)).not.toContain('target_value');
    expect(cs.kpi_formula).toBe('(Number of SOPs created)');
  });

  it('predicts one variant per remaining target after a wording run', () => {
    const plan = buildNormalisePlan(sop, 's1', def, 'wording');
    expect(plan.predictedVariantCount).toBe(3);
    expect(plan.steps.every(s => !('target_value' in s.changes))).toBe(true);
  });

  it('never writes weightage', () => {
    const plan = buildNormalisePlan(sop, 's1', def, 'wording');
    expect(plan.steps.every(s => !('weightage' in s.changes))).toBe(true);
  });
});

describe('targets mode', () => {
  it('equalises the target only when explicitly requested', () => {
    const def = { ...definitionOf(sop[0]), target_value: '10' };
    const plan = buildNormalisePlan(sop, 's1', def, 'targets');
    expect(plan.predictedVariantCount).toBe(1);
    expect(plan.steps.some(s => s.changes.target_value === '10')).toBe(true);
  });
});

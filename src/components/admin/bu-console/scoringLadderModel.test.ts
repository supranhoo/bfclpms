/** ADR-324 — ladder resolution must mirror `bu_console_ladder_apply`. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER_CONFIG,
  describeTier,
  emptyTier,
  headcountForTier,
  isDescriptiveOnly,
  resolveTier,
  seedTiersFromVariants,
  sortTiers,
  tierMatches,
  tierTarget,
  type LadderCandidate,
  type LadderTier,
} from './scoringLadderModel';

const tier = (over: Partial<LadderTier>): LadderTier => ({ ...emptyTier(100), ...over });

const person = (over: Partial<LadderCandidate>): LadderCandidate => ({
  employee_id: 'e1',
  level: 'L4',
  designation: 'Engineer',
  department_id: 'd1',
  is_manager: false,
  ...over,
});

describe('tierMatches', () => {
  it('matches level and designation case-insensitively', () => {
    expect(tierMatches(tier({ match_dimension: 'level', match_value: 'l4' }), person({}))).toBe(true);
    expect(tierMatches(tier({ match_dimension: 'designation', match_value: ' engineer ' }), person({}))).toBe(true);
    expect(tierMatches(tier({ match_dimension: 'level', match_value: 'L3' }), person({}))).toBe(false);
  });

  it('matches department and named employee exactly', () => {
    expect(tierMatches(tier({ match_dimension: 'department', match_value: 'd1' }), person({}))).toBe(true);
    expect(tierMatches(tier({ match_dimension: 'department', match_value: 'd2' }), person({}))).toBe(false);
    expect(tierMatches(tier({ match_dimension: 'employee', match_value: 'e1' }), person({}))).toBe(true);
  });

  it('splits on whether someone manages people', () => {
    const managers = tier({ match_dimension: 'is_manager', match_value: 'true' });
    expect(tierMatches(managers, person({ is_manager: true }))).toBe(true);
    expect(tierMatches(managers, person({ is_manager: false }))).toBe(false);
  });

  it('treats a null department as unmatched rather than a wildcard', () => {
    expect(tierMatches(tier({ match_dimension: 'department', match_value: 'd1' }), person({ department_id: null })))
      .toBe(false);
  });
});

describe('resolveTier', () => {
  const bu = tier({ tier_label: 'BU Head', match_dimension: 'designation', match_value: 'BU Head', priority: 10 });
  const mgr = tier({ tier_label: 'Managers', match_dimension: 'is_manager', match_value: 'true', priority: 20 });
  const rest = tier({ tier_label: 'Everyone', match_dimension: 'default', match_value: null, priority: 5 });

  it('resolves the fallback last even when its priority is lowest', () => {
    expect(sortTiers([rest, mgr, bu]).map((t) => t.tier_label)).toEqual(['BU Head', 'Managers', 'Everyone']);
    expect(resolveTier([rest, mgr, bu], person({ is_manager: true }))?.tier_label).toBe('Managers');
  });

  it('gives the most specific tier to a matching person', () => {
    expect(resolveTier([rest, mgr, bu], person({ designation: 'BU Head', is_manager: true }))?.tier_label)
      .toBe('BU Head');
  });

  it('returns null when no tier matches and there is no fallback', () => {
    expect(resolveTier([bu], person({}))).toBeNull();
  });
});

describe('cascade targets', () => {
  const t = tier({ match_dimension: 'department', match_value: 'd1', target_value: 25 });

  it('keeps the typed target in explicit mode', () => {
    expect(tierTarget(t, DEFAULT_LADDER_CONFIG, 4)).toBe(25);
  });

  it('splits the parent target across the tier headcount', () => {
    expect(tierTarget(t, { ...DEFAULT_LADDER_CONFIG, cascade_mode: 'auto_split', parent_target: 100 }, 4)).toBe(25);
    expect(tierTarget(t, { ...DEFAULT_LADDER_CONFIG, cascade_mode: 'auto_split', parent_target: 100 }, 3)).toBe(33.33);
  });

  it('falls back to the typed target when the tier reaches nobody', () => {
    expect(tierTarget(t, { ...DEFAULT_LADDER_CONFIG, cascade_mode: 'auto_split', parent_target: 100 }, 0)).toBe(25);
  });

  it('counts only the people a tier reaches', () => {
    const people = [person({ employee_id: 'a', is_manager: true }), person({ employee_id: 'b' })];
    expect(headcountForTier(tier({ match_dimension: 'is_manager', match_value: 'true' }), people)).toBe(1);
    expect(headcountForTier(tier({ match_dimension: 'default' }), people)).toBe(2);
  });
});

describe('descriptive classification', () => {
  it('protects scoring logic as employee scoring data (ADR-327)', () => {
    expect(isDescriptiveOnly(['kpi_formula'])).toBe(true);
    expect(isDescriptiveOnly(['kpi_formula', 'kpi_scoring_logic'])).toBe(false);
    expect(isDescriptiveOnly(['kpi_formula', 'target_value'])).toBe(false);
    expect(isDescriptiveOnly([])).toBe(false);
  });
});

describe('describeTier', () => {
  it('reads as plain English', () => {
    expect(describeTier(tier({ match_dimension: 'default' }))).toBe('Everyone else');
    expect(describeTier(tier({ match_dimension: 'is_manager', match_value: 'false' }))).toBe('No direct reports');
    expect(describeTier(tier({ match_dimension: 'level', match_value: 'L4' }))).toBe('Level: L4');
  });
});

describe('seedTiersFromVariants (ADR-327)', () => {
  const variants = [
    { variant_key: 'a', target_value: 5, employee_count: 3, formula: 'f5', scoring_logic: 's5' },
    { variant_key: 'b', target_value: 10, employee_count: 1, employee_ids: ['e9'], formula: 'f10', scoring_logic: 's10' },
    { variant_key: 'c', target_value: null, employee_count: 2 },
  ];

  it('builds one tier per full scoring profile, highest target first', () => {
    const tiers = seedTiersFromVariants(variants);
    expect(tiers.map((t) => t.target_value)).toEqual([10, 5]);
    expect(tiers.map((t) => t.tier_label)).toEqual(['Scoring profile 1', 'Scoring profile 2']);
    expect(tiers[0].priority).toBeGreaterThan(tiers[1].priority);
  });

  it('pins a single-person variant to that employee and keeps its wording', () => {
    const [top] = seedTiersFromVariants(variants);
    expect(top.match_dimension).toBe('employee');
    expect(top.match_value).toBe('e9');
    expect(top.kpi_formula).toBe('f10');
    expect(top.kpi_scoring_logic).toBe('s10');
  });

  it('skips variants with no target', () => {
    expect(seedTiersFromVariants(variants)).toHaveLength(2);
  });
});

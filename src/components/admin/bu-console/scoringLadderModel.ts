/**
 * ADR-324 — Scoring ladders: one KPI, different scoring per employee tier.
 *
 * A KPI such as "Plant 100 trees" is a single measure with a single title, but
 * the bar and the wording differ by who carries it: a BU Head owns the whole
 * 100, four department heads own 25 each, their teams own an individual slice.
 * A ladder is an ordered list of tiers; the first tier that matches a person
 * supplies their target, rating bands (R0–R5), formula text, scoring-logic text
 * and weightage.
 *
 * This module is the *client mirror* of `public.bu_console_ladder_apply`. The
 * server stays the authority — nothing here writes — but the same ordering and
 * matching rules must hold so the preview an admin reads matches what the
 * database will do (POLICY §KPI-SCORING-LADDER).
 */

export type LadderMatchDimension =
  | 'default'
  | 'level'
  | 'designation'
  | 'department'
  | 'is_manager'
  | 'employee';

export type LadderCascadeMode = 'explicit' | 'auto_split';
export type LadderSplitMode = 'equal' | 'weighted';
export type LadderRollupMode = 'independent' | 'central';

export interface LadderTier {
  id?: string;
  tier_label: string;
  match_dimension: LadderMatchDimension;
  match_value: string | null;
  priority: number;
  target_value: number | null;
  weightage: number | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  kpi_formula: string | null;
  kpi_scoring_logic: string | null;
  notes?: string | null;
}

export interface LadderConfig {
  cascade_mode: LadderCascadeMode;
  split_mode: LadderSplitMode;
  parent_target: number | null;
  rollup_mode: LadderRollupMode;
  notes?: string | null;
}

/** The person facts a tier can match on. */
export interface LadderCandidate {
  employee_id: string;
  level: string | null;
  designation: string | null;
  department_id: string | null;
  is_manager: boolean;
}

export const LADDER_DIMENSIONS: { value: LadderMatchDimension; label: string; hint: string }[] = [
  { value: 'is_manager', label: 'Manages people', hint: 'Splits the ladder between people with and without direct reports.' },
  { value: 'level', label: 'Level', hint: 'Matches the employee level exactly, ignoring case.' },
  { value: 'designation', label: 'Designation', hint: 'Matches the designation exactly, ignoring case.' },
  { value: 'department', label: 'Department', hint: 'Matches one department — paste its identifier.' },
  { value: 'employee', label: 'One employee', hint: 'A named exception for a single person.' },
  { value: 'default', label: 'Everyone else', hint: 'The fallback tier, always resolved last.' },
];

const eq = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

export function tierMatches(tier: LadderTier, person: LadderCandidate): boolean {
  switch (tier.match_dimension) {
    case 'default':
      return true;
    case 'level':
      return eq(person.level, tier.match_value);
    case 'designation':
      return eq(person.designation, tier.match_value);
    case 'department':
      return !!person.department_id && person.department_id === tier.match_value;
    case 'is_manager':
      return person.is_manager === ((tier.match_value ?? 'true').toLowerCase() === 'true');
    case 'employee':
      return person.employee_id === tier.match_value;
    default:
      return false;
  }
}

/** Server order: named tiers by priority first, "Everyone else" always last. */
export function sortTiers(tiers: LadderTier[]): LadderTier[] {
  return [...tiers].sort(
    (a, b) =>
      (a.match_dimension === 'default' ? 1 : 0) - (b.match_dimension === 'default' ? 1 : 0) ||
      a.priority - b.priority,
  );
}

export function resolveTier(tiers: LadderTier[], person: LadderCandidate): LadderTier | null {
  return sortTiers(tiers).find((t) => tierMatches(t, person)) ?? null;
}

/**
 * Auto-split spreads one parent number across the people a tier reaches, so an
 * admin types "100 trees" once instead of computing 25 / 12.5 / 6.25 by hand.
 */
export function tierTarget(
  tier: LadderTier,
  config: LadderConfig,
  headcount: number,
): number | null {
  if (config.cascade_mode !== 'auto_split' || config.parent_target == null) return tier.target_value;
  if (!headcount || headcount <= 0) return tier.target_value;
  return Math.round((config.parent_target / headcount) * 100) / 100;
}

export function headcountForTier(tier: LadderTier, people: LadderCandidate[]): number {
  return people.filter((p) => tierMatches(tier, p)).length;
}

export function describeTier(tier: LadderTier): string {
  const d = LADDER_DIMENSIONS.find((x) => x.value === tier.match_dimension)?.label ?? tier.match_dimension;
  if (tier.match_dimension === 'default') return 'Everyone else';
  if (tier.match_dimension === 'is_manager') {
    return (tier.match_value ?? 'true').toLowerCase() === 'true' ? 'Has direct reports' : 'No direct reports';
  }
  return `${d}: ${tier.match_value ?? '—'}`;
}

export const LADDER_SKIP_LABELS: Record<string, string> = {
  no_matching_tier: 'No tier matches this employee',
  final_score_locked: 'Final score approved — immutable (POLICY §88)',
  manual_override: 'Tuned by hand — left alone',
  already_matches: 'Already matches the tier',
};

/** Fields a ladder may write, in the order the dialog shows them. */
export const LADDER_FIELDS = [
  'target_value',
  'weightage',
  'r5',
  'r4',
  'r3',
  'r2',
  'r1',
  'r0',
  'kpi_formula',
  'kpi_scoring_logic',
] as const;

export type LadderField = (typeof LADDER_FIELDS)[number];

/** Wording-only ladders are safe on locked rows (ADR-323 parity). */
const DESCRIPTIVE: LadderField[] = ['kpi_formula', 'kpi_scoring_logic'];

export function isDescriptiveOnly(fields: readonly string[]): boolean {
  return fields.length > 0 && fields.every((f) => (DESCRIPTIVE as string[]).includes(f));
}

export function emptyTier(priority: number): LadderTier {
  return {
    tier_label: 'New tier',
    match_dimension: 'is_manager',
    match_value: 'true',
    priority,
    target_value: null,
    weightage: null,
    r5: null,
    r4: null,
    r3: null,
    r2: null,
    r1: null,
    r0: null,
    kpi_formula: null,
    kpi_scoring_logic: null,
  };
}

export const DEFAULT_LADDER_CONFIG: LadderConfig = {
  cascade_mode: 'explicit',
  split_mode: 'equal',
  parent_target: null,
  rollup_mode: 'independent',
};

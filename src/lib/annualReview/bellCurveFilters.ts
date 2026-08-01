/**
 * ADR-218i / POLICY §AR-BELL-CURVE — interdependent (cascading) Bell Curve filters.
 *
 * Each filter axis lists only the values that still exist once every OTHER
 * active filter is applied, so no combination can silently produce an empty
 * result set. Pure functions only — no React, no data access.
 */
import {
  matchesEligibility,
  matchesScoringSource,
  scoringSourceOf,
  SCORING_SOURCE_LABELS,
  SCORING_SOURCE_ORDER,
  type BellCurveInput,
  type ScoringSource,
} from './bellCurve';
import {
  ELIGIBILITY_STATUS_LABELS,
  ELIGIBILITY_STATUS_ORDER,
  type EligibilityStatus,
} from './effectiveEligibility';

export const ALL_FILTER = '__all__';

export type FilterAxis =
  | 'bu' | 'dept' | 'manager' | 'division' | 'grade' | 'scoringSource' | 'eligibility';

export const FILTER_AXES: FilterAxis[] = [
  'bu', 'dept', 'manager', 'division', 'grade', 'scoringSource', 'eligibility',
];

export type BellCurveFilters = Record<FilterAxis, string>;

export type FilterOption = [id: string, label: string];

const AXIS_MATCH: Record<FilterAxis, (row: BellCurveInput, value: string) => boolean> = {
  bu: (r, v) => r.business_unit_id === v,
  dept: (r, v) => r.department_id === v,
  manager: (r, v) => r.manager_id === v,
  division: (r, v) => r.division_id === v,
  grade: (r, v) => (r.grade ?? null) === v,
  scoringSource: (r, v) => matchesScoringSource(r, v as ScoringSource),
  eligibility: (r, v) => matchesEligibility(r, v as EligibilityStatus),
};

/** True when the row satisfies every active filter, optionally ignoring one axis. */
export function matchesFilters(
  row: BellCurveInput,
  filters: BellCurveFilters,
  except?: FilterAxis,
): boolean {
  for (const axis of FILTER_AXES) {
    if (axis === except) continue;
    const value = filters[axis];
    if (!value || value === ALL_FILTER) continue;
    if (!AXIS_MATCH[axis](row, value)) return false;
  }
  return true;
}

function pick(
  rows: BellCurveInput[],
  get: (r: BellCurveInput) => [string | null | undefined, string | null | undefined],
): FilterOption[] {
  const map = new Map<string, string>();
  for (const r of rows) {
    const [id, name] = get(r);
    if (id) map.set(id, name ?? 'Unnamed');
  }
  return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

/** Options for one axis, narrowed by every other active filter. */
export function axisOptions(
  rows: BellCurveInput[],
  filters: BellCurveFilters,
  axis: FilterAxis,
): FilterOption[] {
  const scoped = rows.filter((r) => matchesFilters(r, filters, axis));
  switch (axis) {
    case 'bu': return pick(scoped, (r) => [r.business_unit_id, r.business_unit_name]);
    case 'dept': return pick(scoped, (r) => [r.department_id, r.department_name]);
    case 'manager': return pick(scoped, (r) => [r.manager_id, r.manager_name]);
    case 'division': return pick(scoped, (r) => [r.division_id, r.division_name]);
    case 'grade': return pick(scoped, (r) => [r.grade, r.grade]);
    case 'scoringSource':
      return SCORING_SOURCE_ORDER
        .filter((s) => scoped.some((r) => scoringSourceOf(r) === s))
        .map((s) => [s, SCORING_SOURCE_LABELS[s]] as FilterOption);
    case 'eligibility':
      return ELIGIBILITY_STATUS_ORDER
        .filter((s) => scoped.some((r) => (r.eligibility_status ?? 'unknown') === s))
        .map((s) => [s, ELIGIBILITY_STATUS_LABELS[s]] as FilterOption);
    default: return [];
  }
}

/** All axis option lists in one pass, keyed by axis. */
export function allAxisOptions(
  rows: BellCurveInput[],
  filters: BellCurveFilters,
): Record<FilterAxis, FilterOption[]> {
  const out = {} as Record<FilterAxis, FilterOption[]>;
  for (const axis of FILTER_AXES) out[axis] = axisOptions(rows, filters, axis);
  return out;
}

/** Axes whose current selection no longer exists in their option list. */
export function staleAxes(
  filters: BellCurveFilters,
  options: Record<FilterAxis, FilterOption[]>,
): FilterAxis[] {
  return FILTER_AXES.filter((axis) => {
    const value = filters[axis];
    if (!value || value === ALL_FILTER) return false;
    return !options[axis].some(([id]) => id === value);
  });
}

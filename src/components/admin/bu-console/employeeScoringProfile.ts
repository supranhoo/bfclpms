/** ADR-327 — pure employee scoring profile model. */
import { normText } from './variantNormalise';

export const EMPLOYEE_SCORING_FIELDS = [
  'target_value', 'weightage', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0', 'kpi_scoring_logic',
] as const;

export type EmployeeScoringField = (typeof EMPLOYEE_SCORING_FIELDS)[number];

export interface EmployeeScoringValues {
  target_value: number | null;
  weightage: number | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  kpi_scoring_logic: string | null;
}

export const EMPTY_SCORING_VALUES: EmployeeScoringValues = {
  target_value: null, weightage: null,
  r5: null, r4: null, r3: null, r2: null, r1: null, r0: null,
  kpi_scoring_logic: null,
};

export function scoringSignature(v: EmployeeScoringValues): string {
  return EMPLOYEE_SCORING_FIELDS.map((field) => normText(v[field])).join('|');
}

export function scoringChangeSet(
  current: EmployeeScoringValues,
  next: Partial<EmployeeScoringValues>,
): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  for (const field of EMPLOYEE_SCORING_FIELDS) {
    if (!(field in next)) continue;
    const value = next[field];
    if (normText(value) === normText(current[field])) continue;
    changes[field] = value === null || value === undefined || value === '' ? null : String(value);
  }
  return changes;
}
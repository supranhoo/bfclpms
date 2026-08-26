/**
 * ADR-321 — which console-editable fields are purely descriptive.
 *
 * Descriptive fields carry no scoring or structural meaning: rewriting them
 * cannot move a score, a target, a weightage, a rating band or a workflow
 * status. Only a change set made up entirely of these fields may be applied to
 * rows that are locked by an approved final score or already in review
 * (POLICY §CONSOLE-TEXT-ONLY-STANDARDISATION).
 *
 * This mirrors `public.bu_console_descriptive_fields()`; the server re-derives
 * the classification, so this module is UI guidance only.
 */

export const DESCRIPTIVE_FIELDS = [
  'kpi_title',
  'kpi_description',
  'criteria',
  'source_of_data',
  'kpi_formula',
  'kpi_scoring_logic',
  'uom',
] as const;

export type DescriptiveField = (typeof DESCRIPTIVE_FIELDS)[number];

export function isDescriptiveField(field: string): boolean {
  return (DESCRIPTIVE_FIELDS as readonly string[]).includes(field);
}

/** True when at least one field changed and every changed field is descriptive. */
export function isDescriptiveOnly(changes: Record<string, unknown> | null | undefined): boolean {
  const keys = Object.keys(changes ?? {});
  if (keys.length === 0) return false;
  return keys.every(isDescriptiveField);
}

/** Fields in the change set that block text-only standardisation. */
export function scoringFields(changes: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(changes ?? {}).filter((f) => !isDescriptiveField(f));
}

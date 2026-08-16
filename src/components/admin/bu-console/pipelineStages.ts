/**
 * ADR-289 — stage vocabulary for the single console surface.
 *
 * Extracted from the old Pipeline tab so the stage rail, the review worksheet
 * and the employee drawer all speak the same language. Unknown stages are
 * humanised and kept last — never dropped (POLICY §105: no hardcoded ladder as
 * a source of truth, this is display order only).
 */
const STAGE_LABEL: Record<string, string> = {
  self_review: 'Self review',
  manager_check: 'Manager',
  functional_manager_check: 'Functional manager',
  skip_level_check: 'Skip level',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
  approved: 'Approved',
};

/** Display order of the rail — unknown stages are appended, never dropped. */
const STAGE_ORDER = [
  'self_review', 'manager_check', 'functional_manager_check',
  'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved',
];

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
}

export function sortStages<T extends { stage: string }>(stages: T[]): T[] {
  const idx = (s: string) => {
    const i = STAGE_ORDER.indexOf(s);
    return i === -1 ? STAGE_ORDER.length : i;
  };
  return [...stages].sort((a, b) => idx(a.stage) - idx(b.stage) || a.stage.localeCompare(b.stage));
}
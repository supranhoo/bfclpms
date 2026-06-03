/**
 * Audit label classification helpers.
 *
 * The Admin Edit Dialog logs every KPI definition change as an
 * `ADMIN_OVERRIDE` audit row (see `src/hooks/useKpis.ts`). The row carries
 * enough metadata to differentiate a true status override from a description
 * tweak or a scoring-logic change. This helper centralises that
 * classification so the Review Timeline, the Review Journey PDF export and
 * the Audit Trail report all show the same label.
 */

export const LOGIC_FIELDS = [
  'r0', 'r1', 'r2', 'r3', 'r4', 'r5',
  'threshold_mode', 'criteria', 'uom_type', 'qualitative_options',
] as const;

export type AdminOverrideKind = 'kpi_updated' | 'logic_updated' | 'admin_override';

export interface AdminOverrideLogShape {
  action?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Classify an `ADMIN_OVERRIDE` audit row into one of three buckets:
 * - `logic_updated` — only scoring/logic fields changed via the admin edit dialog
 * - `kpi_updated`   — descriptive fields (name, weightage, frequency, …) changed via the dialog
 * - `admin_override` — anything else (status actually changed, or a non-edit-dialog source)
 */
export function classifyAdminOverride(log: AdminOverrideLogShape): AdminOverrideKind {
  if (log.action !== 'ADMIN_OVERRIDE') return 'admin_override';
  const md = log.metadata || {};
  if (md.source !== 'admin_edit_dialog') return 'admin_override';
  if (md.status_changed === true) return 'admin_override';
  const fields = Array.isArray(md.changed_fields) ? (md.changed_fields as string[]) : [];
  if (fields.length === 0) return 'kpi_updated';
  const allLogic = fields.every(f => (LOGIC_FIELDS as readonly string[]).includes(f));
  return allLogic ? 'logic_updated' : 'kpi_updated';
}

export const ADMIN_OVERRIDE_LABELS: Record<AdminOverrideKind, string> = {
  kpi_updated: 'KPI Updated',
  logic_updated: 'Logic Updated',
  admin_override: 'Admin Override',
};

/** Human-friendly column → display name for the "Updated fields" detail line. */
const FIELD_LABELS: Record<string, string> = {
  kpi_name: 'KPI Name',
  kra_name: 'KRA Name',
  weightage: 'Weightage',
  frequency: 'Frequency',
  frequency_cycle_start: 'Frequency Cycle Start',
  target_value: 'Target',
  uom: 'UOM',
  source_of_data: 'Source of Data',
  category_id: 'Category',
  employee_id: 'Employee',
  review_period: 'Review Period',
  review_year: 'Review Year',
  status: 'Status',
  is_org_level: 'Org-Level Flag',
  org_level_scope: 'Org-Level Scope',
  require_resubmit_reason: 'Resubmit Reason Required',
  day_count_type: 'Day Count Type',
};

function humanizeField(field: string): string {
  if ((LOGIC_FIELDS as readonly string[]).includes(field)) return 'Scoring Logic';
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Build the "Updated fields: …" summary, de-duplicated, in stable order. */
export function describeChangedFields(fields: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fields) {
    const label = humanizeField(f);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.join(', ');
}
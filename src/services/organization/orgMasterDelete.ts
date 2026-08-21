import { supabase } from '@/integrations/supabase/client';

/**
 * ADR-308 — dependency-aware deletion of organisation master records.
 *
 * The client never deletes org master rows directly any more. It asks the
 * server for a dependency impact report, then calls the guarded delete RPC.
 * Classification comes from the database (single source of truth):
 *  - `blocking`  : real operational data (employees, KPIs, targets, children)
 *  - `cleanable` : pure configuration rows that may be removed on confirmation
 *  - `auto`      : the foreign key already cascades / nulls out
 */
export type OrgDependencyClass = 'blocking' | 'cleanable' | 'auto';

export interface OrgDeleteImpactRow {
  child_table: string;
  child_column: string;
  delete_action: string;
  row_count: number;
  classification: OrgDependencyClass;
  labels: string[] | null;
  /**
   * ADR-308a — cascade path this dependency was found through.
   * Empty for direct references, e.g. `departments "Executive"` when the
   * dependency belongs to a child record that would be deleted with this one.
   */
  via_path?: string | null;
  target_table?: string | null;
  target_id?: string | null;
}

/** Human sentence for a cascade path, e.g. `departments "Executive"`. */
export function describeViaPath(via: string | null | undefined): string | null {
  const raw = (via ?? '').trim();
  if (!raw) return null;
  return raw
    .split('>')
    .map((seg) => {
      const s = seg.trim();
      const m = s.match(/^([a-z_ ]+?)\s*"(.*)"$/i);
      if (m) return `${describeTable(m[1].trim().replace(/ /g, '_'))}: ${m[2]}`;
      return describeTable(s.replace(/ /g, '_'));
    })
    .join(' → ');
}


/** Human labels for referencing tables, so users never see raw table names. */
const TABLE_LABELS: Record<string, string> = {
  access_profile_org_scope: 'Access profile visibility scope',
  profiles: 'Employees',
  kpis: 'KPIs / KRAs',
  org_kpi_values: 'Organisational KPI values',
  org_kpi_data_owners: 'Org KPI data owners',
  production_targets: 'Production targets',
  incentive_slabs: 'Incentive slabs',
  incentive_allocation_rules: 'Incentive allocation rules',
  business_units: 'Business units',
  departments: 'Departments',
  sub_branches: 'Sub-branches',
  kpi_definitions_master: 'KPI master definitions',
  bu_goals: 'BU goals',
  safety_incidents: 'Safety incidents',
  safety_incident_routing_rules: 'Safety routing rules',
  template_bundles: 'Template bundles',
  annual_review_criteria_assignments: 'Annual review criteria assignments',
  annual_review_system_kpi_weights: 'Annual review system KPI weights',
  annual_review_recommendations: 'Annual review recommendations',
  org_head_config: 'Org head configuration',
  business_unit_sub_units: 'BU sub-units',
};

export function describeTable(table: string): string {
  return TABLE_LABELS[table] ?? table.replace(/_/g, ' ');
}

/** Maps known database failures to plain language for the user. */
export function describeOrgDeleteError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('violates foreign key constraint')) {
    return 'This record is still linked to other data, so it cannot be removed yet. Reassign or remove the linked records first.';
  }
  if (m.includes('only administrators')) {
    return 'Only administrators can delete organisation master records.';
  }
  if (m.includes('confirm the cleanup option')) {
    return 'Tick the cleanup option in the dialog to confirm removal of the linked configuration references.';
  }
  if (m.includes('not found or already deleted')) {
    return 'This record no longer exists — the list has been refreshed.';
  }
  return message;
}

export async function fetchOrgDeleteImpact(
  entityType: string,
  entityId: string,
): Promise<OrgDeleteImpactRow[]> {
  const { data, error } = await supabase.rpc('org_master_delete_impact' as any, {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
  return ((data ?? []) as OrgDeleteImpactRow[]).map((r) => ({
    ...r,
    row_count: Number(r.row_count ?? 0),
    labels: r.labels ?? [],
    via_path: r.via_path ?? '',
  }));

}

export async function deleteOrgMaster(
  entityType: string,
  entityId: string,
  cleanupDependencies: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('org_master_delete' as any, {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_cleanup_dependencies: cleanupDependencies,
  });
  if (error) throw new Error(describeOrgDeleteError(error.message));
}

/** Distinct child records that would be removed along with the target (ADR-308a). */
export function cascadeSummaries(rows: OrgDeleteImpactRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const label = describeViaPath(r.via_path);
    if (label) seen.add(label);
  }
  return Array.from(seen);
}

export function splitImpact(rows: OrgDeleteImpactRow[]) {

  return {
    blocking: rows.filter((r) => r.classification === 'blocking'),
    cleanable: rows.filter((r) => r.classification === 'cleanable'),
    auto: rows.filter((r) => r.classification === 'auto'),
  };
}

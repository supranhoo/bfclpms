/**
 * Shared "Pending With (Name)" resolution for reporting surfaces.
 *
 * SSOT: the decision logic itself lives in `src/lib/kpiPendingWith.ts`
 * (`resolvePendingWith`, tested in `src/test/kpiPendingWith.test.ts`).
 * This service only assembles the *inputs* that resolver needs:
 *   - Org KPI data owners (category_id || kra_name || kpi_name)
 *   - Global HR PMS / Auditor / Management role name pools
 *   - Per-KPI auditor assignment overrides
 *   - Reporting manager + skip-level manager names
 *   - Per-employee workflow stage chains (get_bulk_employee_workflows,
 *     POLICY §105 — never hardcode the stage ladder)
 *
 * POLICY §RPT-PENDING-WITH-SSOT / ADR-178.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import { resolvePendingWith, PENDING_WITH_NONE } from '@/lib/kpiPendingWith';

const IN_CHUNK = 500;

export interface PendingWithProfile {
  id: string;
  full_name?: string | null;
  reporting_manager_id?: string | null;
  /** ADR-193 §FM-REVIEWER-SCOPE — needed to attribute functional_manager_check. */
  functional_manager_id?: string | null;
  is_active?: boolean | null;
}

export interface PendingWithKpi {
  id: string;
  employee_id: string | null;
  status: string | null;
  is_org_level?: boolean | null;
  category_id?: string | null;
  kra_name?: string | null;
  kpi_name?: string | null;
}

export interface PendingWithContext {
  profileMap: Map<string, PendingWithProfile>;
  managerToSkip: Map<string, string | null>;
  ownerMap: Map<string, string[]>;
  stageChainMap: Map<string, string[]>;
  kpiIdToAuditorNames: Map<string, string>;
  hrPmsNames: string;
  auditorNames: string;
  managementNames: string;
}

function chunk<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function buildPendingWithContext(params: {
  kpiIds: string[];
  employeeIds: string[];
  month: string;
  year: number;
  profiles: PendingWithProfile[];
}): Promise<PendingWithContext> {
  const { kpiIds, employeeIds, month, year, profiles } = params;
  const profileMap = new Map<string, PendingWithProfile>(profiles.map((p) => [p.id, p]));

  // --- Org KPI data owners (non-critical: table may be restricted) ---
  const ownerMap = new Map<string, string[]>();
  try {
    const dataOwners = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('org_kpi_data_owners')
        .select('category_id, kra_name, kpi_name, owner:profiles!org_kpi_data_owners_owner_id_fkey(full_name)')
        .range(from, to),
    );
    (dataOwners ?? []).forEach((o: any) => {
      const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
      const name = o.owner?.full_name ?? '';
      if (!ownerMap.has(key)) ownerMap.set(key, []);
      if (name) ownerMap.get(key)!.push(name);
    });
  } catch {
    /* non-critical — resolver falls back to the queue label */
  }

  // --- Global role name pools (HR PMS / Management / Auditor) ---
  let hrPmsNames = '';
  let managementNames = '';
  let auditorNames = '';
  try {
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['hr_pms', 'management', 'auditor'] as any);
    const namesForRole = (r: string) =>
      (roleRows ?? [])
        .filter((x: any) => x.role === r)
        .map((x: any) => profileMap.get(x.user_id))
        .filter((p): p is PendingWithProfile => !!p && (p.is_active ?? true) === true && !!p.full_name)
        .map((p) => p.full_name as string)
        .sort();
    hrPmsNames = Array.from(new Set(namesForRole('hr_pms'))).join(', ');
    managementNames = Array.from(new Set(namesForRole('management'))).join(', ');
    auditorNames = Array.from(new Set(namesForRole('auditor'))).join(', ');
  } catch {
    /* non-critical */
  }

  // --- Per-KPI auditor assignment overrides ---
  const kpiIdToAuditorNames = new Map<string, string>();
  for (const batch of chunk(kpiIds)) {
    const { data: aud } = await supabase
      .from('audit_kpi_level_assignments')
      .select('kpi_id, auditor_id')
      .in('kpi_id', batch);
    const byKpi = new Map<string, string[]>();
    (aud ?? []).forEach((row: any) => {
      const name = profileMap.get(row.auditor_id)?.full_name;
      if (!name) return;
      if (!byKpi.has(row.kpi_id)) byKpi.set(row.kpi_id, []);
      byKpi.get(row.kpi_id)!.push(name);
    });
    byKpi.forEach((names, kpiId) => {
      kpiIdToAuditorNames.set(kpiId, Array.from(new Set(names)).sort().join(', '));
    });
  }

  // --- Per-employee workflow chains (POLICY §105) ---
  const stageChainMap = new Map<string, string[]>();
  for (const batch of chunk(employeeIds.filter(Boolean))) {
    const { data: wfData, error: wfErr } = await (supabase as any).rpc('get_bulk_employee_workflows', {
      employee_ids: batch,
      p_review_period: month,
      p_review_year: year,
    });
    if (wfErr) throw wfErr;
    for (const row of ((wfData || []) as { employee_id: string; stages: string[] }[])) {
      stageChainMap.set(row.employee_id, row.stages || []);
    }
  }

  // --- Skip-level manager = employee's manager's reporting_manager_id ---
  const managerIds = [
    ...new Set(profiles.map((p) => p.reporting_manager_id).filter(Boolean) as string[]),
  ];
  const managerToSkip = new Map<string, string | null>();
  for (const batch of chunk(managerIds)) {
    const { data: mgrs, error: mgrErr } = await supabase
      .from('profiles')
      .select('id, reporting_manager_id')
      .in('id', batch);
    if (mgrErr) throw mgrErr;
    (mgrs ?? []).forEach((m: any) => managerToSkip.set(m.id, m.reporting_manager_id ?? null));
  }

  return {
    profileMap,
    managerToSkip,
    ownerMap,
    stageChainMap,
    kpiIdToAuditorNames,
    hrPmsNames,
    auditorNames,
    managementNames,
  };
}

/** Resolve the display name(s) the given KPI is currently waiting on. */
export function resolvePendingWithForKpi(ctx: PendingWithContext, kpi: PendingWithKpi): string {
  const employeeId = kpi.employee_id ?? '';
  const profile = ctx.profileMap.get(employeeId);
  const isOrgKpi = kpi.is_org_level === true;
  const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
  const owners = isOrgKpi ? (ctx.ownerMap.get(ownerKey) ?? []) : [];
  const managerId = profile?.reporting_manager_id ?? null;
  const skipId = managerId ? (ctx.managerToSkip.get(managerId) ?? null) : null;
  const fmId = profile?.functional_manager_id ?? null;

  return resolvePendingWith({
    status: kpi.status,
    isOrgKpi,
    dataOwnerNames: owners.join(', '),
    employeeName: profile?.full_name ?? '',
    managerName: managerId ? (ctx.profileMap.get(managerId)?.full_name ?? null) : null,
    functionalManagerName: fmId ? (ctx.profileMap.get(fmId)?.full_name ?? null) : null,
    skipManagerName: skipId ? (ctx.profileMap.get(skipId)?.full_name ?? null) : null,
    stageChain: ctx.stageChainMap.get(employeeId) ?? [],
    hrPmsNames: ctx.hrPmsNames,
    auditorNames: ctx.kpiIdToAuditorNames.get(kpi.id) || ctx.auditorNames,
    managementNames: ctx.managementNames,
  });
}

export { PENDING_WITH_NONE };
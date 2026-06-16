import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import type {
  AnnualReviewAssignmentRule,
  AnnualReviewCycle,
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewStatus,
  AnnualReviewTemplate,
  AnnualReviewerRole,
  EvidenceItem,
} from '@/types/annualReview';
import { enabledChain } from '@/lib/annualReview/stageChain';

/**
 * Service layer for the Annual Review module — wraps every DB / RPC / storage call
 * so hooks and components never touch the supabase client directly. Casts to
 * `any` are used because the auto-generated `types.ts` regenerates on the next
 * migration approval; until then these tables are not yet in the typed schema.
 */

const BUCKET = 'review-evidence';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

/**
 * SSOT for "which template applies to this instance".
 * `template_override_id` (per-employee override) wins over `template_id`
 * (rule-seeded value). Every UI / service path MUST resolve through this
 * helper — never read `instance.template_id` directly for rendering.
 */
export function resolveTemplateId(
  instance: Pick<AnnualReviewInstance, 'template_id' | 'template_override_id'> | null | undefined,
): string | null {
  if (!instance) return null;
  return instance.template_override_id ?? instance.template_id ?? null;
}

/**
 * Set or clear a per-instance template override (admin / hr_pms only).
 * Pass `templateId = null` to clear. Reason is mandatory (>=3 chars) and is
 * captured in `system_audit_logs` under `annual_review.template_override_set`.
 */
export async function setTemplateOverride(args: {
  instanceId: string;
  templateId: string | null;
  reason: string;
}) {
  const { error } = await db.rpc('set_annual_review_template_override', {
    p_instance_id: args.instanceId,
    p_template_id: args.templateId,
    p_reason: args.reason,
  });
  if (error) throw error;
}

/**
 * Set or clear the per-instance final-score weight override (Phase 2).
 * Pass `weights = null` to clear. Reason is mandatory; admin/hr_pms only —
 * enforced inside the RPC. Audit-logged under
 * `annual_review.stage_weights_override_set`.
 */
export async function setInstanceStageWeightsOverride(args: {
  instanceId: string;
  weights: Record<string, number> | null;
  reason: string;
}) {
  const { error } = await db.rpc('set_annual_review_stage_weights_override', {
    p_instance_id: args.instanceId,
    p_weights: args.weights,
    p_reason: args.reason,
  });
  if (error) throw error;
}

/**
 * Bulk wrapper for per-instance final-score weight overrides (Phase 3).
 * One RPC per row, sequential to keep load predictable. Matches the shape
 * of `bulkSetTemplateOverrides` / `bulkSetEnabledStages`.
 */
export interface BulkStageWeightsInput {
  instanceId: string;
  weights: Record<string, number> | null;
  reason: string;
  rowKey?: string;
}
export interface BulkStageWeightsResult {
  rowKey?: string;
  instanceId: string;
  ok: boolean;
  error?: string;
}
export async function bulkSetStageWeightsOverrides(
  rows: BulkStageWeightsInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkStageWeightsResult[]> {
  const out: BulkStageWeightsResult[] = [];
  let done = 0;
  for (const r of rows) {
    try {
      await setInstanceStageWeightsOverride({
        instanceId: r.instanceId, weights: r.weights, reason: r.reason,
      });
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: true });
    } catch (e) {
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: false, error: (e as Error).message });
    }
    done++;
    onProgress?.(done, rows.length);
  }
  return out;
}

/**
 * Bulk apply per-employee template overrides — Part C.
 *
 * Thin loop over `setTemplateOverride` (one RPC call per row). Sequential to
 * keep DB load predictable; rows are typically ≤ a few hundred per upload and
 * the RPC is cheap (one UPDATE + one audit insert).
 *
 * Returns per-row outcomes so the caller can display a precise report.
 */
export interface BulkOverrideInput {
  instanceId: string;
  templateId: string | null;
  reason: string;
  /** Free-form key for the caller's UI (e.g. employee code) — echoed back in the result. */
  rowKey?: string;
}
export interface BulkOverrideResult {
  rowKey?: string;
  instanceId: string;
  ok: boolean;
  error?: string;
}
export async function bulkSetTemplateOverrides(
  rows: BulkOverrideInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOverrideResult[]> {
  const out: BulkOverrideResult[] = [];
  let done = 0;
  for (const r of rows) {
    try {
      await setTemplateOverride({ instanceId: r.instanceId, templateId: r.templateId, reason: r.reason });
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: true });
    } catch (e) {
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: false, error: (e as Error).message });
    }
    done++;
    onProgress?.(done, rows.length);
  }
  return out;
}

/**
 * Set / change the per-instance enabled-stages workflow. Admin / hr_pms only.
 * Allowed only while the instance is in `not_started` or `pending_self`.
 * Server-side RPC validates the array (must contain 'self', subset of the
 * canonical 5 stages), enforces stage gate, and writes an audit log row
 * (`annual_review.enabled_stages_set`).
 */
export async function setEnabledStages(args: {
  instanceId: string;
  enabledStages: AnnualReviewerRole[];
  reason: string;
}) {
  const normalised = enabledChain(args.enabledStages);
  const { error } = await db.rpc('set_annual_review_enabled_stages', {
    p_instance_id: args.instanceId,
    p_enabled_stages: normalised,
    p_reason: args.reason,
  });
  if (error) throw error;
}

export interface BulkEnabledStagesInput {
  instanceId: string;
  enabledStages: AnnualReviewerRole[];
  reason: string;
  /** Echoed back in the result so the caller can match its source row. */
  rowKey?: string;
}
export interface BulkEnabledStagesResult {
  rowKey?: string;
  instanceId: string;
  ok: boolean;
  error?: string;
}
/** Sequential bulk wrapper — mirrors `bulkSetTemplateOverrides`. */
export async function bulkSetEnabledStages(
  rows: BulkEnabledStagesInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkEnabledStagesResult[]> {
  const out: BulkEnabledStagesResult[] = [];
  let done = 0;
  for (const r of rows) {
    try {
      await setEnabledStages({ instanceId: r.instanceId, enabledStages: r.enabledStages, reason: r.reason });
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: true });
    } catch (e) {
      out.push({ rowKey: r.rowKey, instanceId: r.instanceId, ok: false, error: (e as Error).message });
    }
    done++;
    onProgress?.(done, rows.length);
  }
  return out;
}

// ---------- Cycles ----------
export async function listCycles(): Promise<AnnualReviewCycle[]> {
  const { data, error } = await db.from('annual_review_cycles').select('*').order('review_year', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getActiveCycle(): Promise<AnnualReviewCycle | null> {
  const { data, error } = await db.from('annual_review_cycles').select('*').eq('status', 'active').maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function upsertCycle(c: Partial<AnnualReviewCycle>): Promise<AnnualReviewCycle> {
  const { data, error } = await db.from('annual_review_cycles').upsert(c).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- Templates ----------
export async function listTemplates(): Promise<AnnualReviewTemplate[]> {
  const { data, error } = await db.from('annual_review_templates').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTemplate(id: string): Promise<AnnualReviewTemplate> {
  const { data, error } = await db.from('annual_review_templates').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function upsertTemplate(t: Partial<AnnualReviewTemplate>): Promise<AnnualReviewTemplate> {
  const { data, error } = await db.from('annual_review_templates').upsert(t).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- Rules ----------
export async function listRules(cycleId?: string): Promise<AnnualReviewAssignmentRule[]> {
  let q = db.from('annual_review_assignment_rules').select('*').order('priority', { ascending: true });
  if (cycleId) q = q.eq('cycle_id', cycleId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function upsertRule(r: Partial<AnnualReviewAssignmentRule>): Promise<AnnualReviewAssignmentRule> {
  const { data, error } = await db.from('annual_review_assignment_rules').upsert(r).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await db.from('annual_review_assignment_rules').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Instances ----------
export interface InstanceWithEmployee extends AnnualReviewInstance {
  employee?: { id: string; full_name: string | null; employee_code: string | null; designation: string | null };
}

export async function listInstancesForCycle(cycleId: string): Promise<InstanceWithEmployee[]> {
  const { data, error } = await db
    .from('annual_review_instances')
    .select('*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation)')
    .eq('cycle_id', cycleId);
  if (error) throw error;
  return data ?? [];
}

// ---------- Server-side pagination ----------
// See modules/annual-review/DOCUMENTATION.md → "Pagination" for the contract.
export interface PaginatedInstances {
  rows: InstanceWithEmployee[];
  total: number;
}

export interface ListInstancesPaginatedArgs {
  cycleId: string;
  page: number;          // 1-indexed
  pageSize: number;      // max 100 enforced server-side via caller
  search?: string;
  status?: AnnualReviewStatus | 'all';
  /** Phase 4: restrict to instances with a custom stage_weights_override. */
  hasOverride?: boolean;
  /** Restrict to employees whose profile.department_id matches. */
  departmentId?: string;
  /** Restrict to employees whose department belongs to this business_unit. */
  businessUnitId?: string;
  /** Restrict to instances whose instance.manager_id matches. */
  managerId?: string;
  sort?: { col: 'created_at' | 'overall_status' | 'total_score'; dir: 'asc' | 'desc' };
}

/**
 * Paginated, status- and name-filtered listing of instances for a cycle.
 * Search resolves to a profile-name ilike pre-fetch (capped at 500 matches)
 * because PostgREST cannot ilike across an embedded resource directly.
 */
export async function listInstancesPaginated(
  args: ListInstancesPaginatedArgs,
): Promise<PaginatedInstances> {
  const pageSize = Math.min(Math.max(args.pageSize, 1), 100);
  const from = (Math.max(args.page, 1) - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = db
    .from('annual_review_instances')
    .select(
      '*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation)',
      { count: 'exact' },
    )
    .eq('cycle_id', args.cycleId);

  if (args.status && args.status !== 'all') q = q.eq('overall_status', args.status);
  if (args.hasOverride) q = q.not('stage_weights_override', 'is', null);
  if (args.managerId) q = q.eq('manager_id', args.managerId);

  // Resolve org-tree filters (department / BU) to a profile-id allowlist,
  // intersected with any name/code search ids. Mirrors the search pattern:
  // PostgREST cannot filter across an embedded resource directly.
  const orgIds = await resolveEmployeeIdsForOrgFilters(args);
  if (orgIds && orgIds.length === 0) return { rows: [], total: 0 };

  const term = args.search?.trim();
  let restrictIds: string[] | null = orgIds;
  if (term) {
    // Match either full_name OR employee_code (the latter is what users
    // typically paste from HR records). PostgREST `.or()` accepts comma-
    // separated filters; escape commas in the term defensively.
    const safe = term.replace(/[(),]/g, ' ');
    const { data: profs, error: pErr } = await db
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`)
      .limit(500);
    if (pErr) throw pErr;
    let ids = (profs ?? []).map((p: { id: string }) => p.id);
    if (orgIds) {
      const set = new Set(orgIds);
      ids = ids.filter((id) => set.has(id));
    }
    if (ids.length === 0) return { rows: [], total: 0 };
    restrictIds = ids;
  }
  if (restrictIds) q = q.in('employee_id', restrictIds);

  const sort = args.sort ?? { col: 'created_at', dir: 'desc' };
  q = q.order(sort.col, { ascending: sort.dir === 'asc' }).range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as InstanceWithEmployee[], total: count ?? 0 };
}

/**
 * Returns the set of profile.ids that match the (optional) department_id /
 * business_unit_id filters. Returns `null` when no org filter is active.
 * Paged at 1000 to bypass the Data API default cap.
 */
async function resolveEmployeeIdsForOrgFilters(
  args: { departmentId?: string; businessUnitId?: string },
): Promise<string[] | null> {
  if (!args.departmentId && !args.businessUnitId) return null;

  // If BU is set, expand to department_ids first.
  let deptIds: string[] | null = null;
  if (args.businessUnitId) {
    const { data, error } = await db
      .from('departments')
      .select('id')
      .eq('business_unit_id', args.businessUnitId);
    if (error) throw error;
    deptIds = (data ?? []).map((d: { id: string }) => d.id);
    if (args.departmentId) deptIds = deptIds.includes(args.departmentId) ? [args.departmentId] : [];
    if (deptIds.length === 0) return [];
  } else if (args.departmentId) {
    deptIds = [args.departmentId];
  }

  // Page through profiles in case >1000 employees in the chosen dept/BU.
  const PAGE = 1000;
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    let pq = db.from('profiles').select('id').order('id').range(from, from + PAGE - 1);
    if (deptIds && deptIds.length > 0) pq = pq.in('department_id', deptIds);
    const { data, error } = await pq;
    if (error) throw error;
    const batch = data ?? [];
    for (const p of batch) out.push((p as { id: string }).id);
    if (batch.length < PAGE) break;
    if (out.length > 50_000) break; // hard safety cap
  }
  return out;
}

/**
 * Lightweight status-count aggregate for a cycle. Single column projection
 * keeps payload small (~bytes per row) even for 5k+ employees.
 */
export async function getCycleStatusCounts(cycleId: string): Promise<Record<AnnualReviewStatus, number> & { total: number }> {
  // Count-only queries (head: true) so the Data API's default 1000-row payload
  // cap cannot truncate the result. Previously this loaded `overall_status`
  // rows unpaged and was silently capped at 1000 on cycles >1k employees.
  const statuses: AnnualReviewStatus[] = [
    'not_started', 'pending_self', 'pending_manager',
    'pending_skip', 'pending_bu', 'pending_hr', 'completed',
  ];
  const out = {
    total: 0, not_started: 0, pending_self: 0, pending_manager: 0,
    pending_skip: 0, pending_bu: 0, pending_hr: 0, completed: 0,
  } as Record<AnnualReviewStatus, number> & { total: number };

  const totalRes = await db
    .from('annual_review_instances')
    .select('id', { count: 'exact', head: true })
    .eq('cycle_id', cycleId);
  if (totalRes.error) throw totalRes.error;
  out.total = totalRes.count ?? 0;

  const perStatus = await Promise.all(
    statuses.map((s) =>
      db.from('annual_review_instances')
        .select('id', { count: 'exact', head: true })
        .eq('cycle_id', cycleId)
        .eq('overall_status', s),
    ),
  );
  statuses.forEach((s, i) => {
    if (perStatus[i].error) throw perStatus[i].error;
    out[s] = perStatus[i].count ?? 0;
  });
  return out;
}

export async function getInstanceForEmployee(employeeId: string, cycleId: string): Promise<AnnualReviewInstance | null> {
  const { data, error } = await db
    .from('annual_review_instances')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('cycle_id', cycleId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listInstancesForReviewer(reviewerId: string, cycleId: string): Promise<InstanceWithEmployee[]> {
  const { data, error } = await db
    .from('annual_review_instances')
    .select('*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation)')
    .eq('cycle_id', cycleId)
    .or(`manager_id.eq.${reviewerId},skip_id.eq.${reviewerId},bu_head_id.eq.${reviewerId},hr_id.eq.${reviewerId}`);
  if (error) throw error;
  return data ?? [];
}

// ---------- Export-wide fetcher ----------
/**
 * Streams ALL instances in a cycle (paged via fetchAllPaged) honoring the same
 * filters as the on-screen grid. Used by Export to Excel so the workbook is
 * never limited to the current visible page.
 *
 * Per POLICY §94 + large-export-pagination-policy: ordered .range() walk,
 * profiles resolved separately via .in().
 */
export async function fetchAllInstancesForExport(args: {
  cycleId: string;
  search?: string;
  status?: AnnualReviewStatus | 'all';
  hasOverride?: boolean;
  onProgress?: (loaded: number) => void;
}): Promise<InstanceWithEmployee[]> {
  // 1) Optional name search → restrict to matching employee_ids (max 5000).
  let restrictIds: string[] | null = null;
  const term = args.search?.trim();
  if (term) {
    const safe = term.replace(/[(),]/g, ' ');
    const profs = await fetchAllPaged<{ id: string }>((from, to) =>
      db.from('profiles')
        .select('id')
        .or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`)
        .order('id')
        .range(from, to),
    );
    restrictIds = profs.map((p) => p.id);
    if (restrictIds.length === 0) return [];
  }

  // 2) Stream instances (slim select, no embedded join — RLS-heavy join would
  //    blow the per-page timeout). Embed employee profile on a second pass.
  const rows = await fetchAllPaged<AnnualReviewInstance>((from, to) => {
    let q = db
      .from('annual_review_instances')
      .select('*')
      .eq('cycle_id', args.cycleId);
    if (args.status && args.status !== 'all') q = q.eq('overall_status', args.status);
    if (args.hasOverride) q = q.not('stage_weights_override', 'is', null);
    if (restrictIds) q = q.in('employee_id', restrictIds);
    return q.order('created_at', { ascending: false }).range(from, to);
  });
  args.onProgress?.(rows.length);

  // 3) Hydrate employee profiles via .in() batches of 200.
  const empIds = Array.from(new Set(rows.map((r) => r.employee_id).filter(Boolean)));
  const profileMap = new Map<string, { id: string; full_name: string | null; employee_code: string | null; designation: string | null }>();
  const BATCH = 200;
  for (let i = 0; i < empIds.length; i += BATCH) {
    const slice = empIds.slice(i, i + BATCH);
    const { data, error } = await db
      .from('profiles')
      .select('id, full_name, employee_code, designation')
      .in('id', slice);
    if (error) throw error;
    (data ?? []).forEach((p: any) => profileMap.set(p.id, p));
  }
  return rows.map((r) => ({ ...r, employee: profileMap.get(r.employee_id) }));
}

// ---------- Per-stage response rollup ----------
/**
 * Fetches submitted reviewer responses for a set of instances and returns a
 * map of `instance_id → reviewer_role → weighted_score`. Single .in() query —
 * used by the Progress grid to show per-stage scores without N+1 loads.
 */
export async function fetchInstanceStageScores(
  instanceIds: string[],
): Promise<Record<string, Partial<Record<AnnualReviewerRole, number | null>>>> {
  const out: Record<string, Partial<Record<AnnualReviewerRole, number | null>>> = {};
  if (instanceIds.length === 0) return out;
  const BATCH = 200;
  for (let i = 0; i < instanceIds.length; i += BATCH) {
    const slice = instanceIds.slice(i, i + BATCH);
    const { data, error } = await db
      .from('annual_review_responses')
      .select('instance_id, reviewer_role, weighted_score, submitted_at')
      .in('instance_id', slice)
      .not('submitted_at', 'is', null);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ instance_id: string; reviewer_role: AnnualReviewerRole; weighted_score: number | null }>) {
      const slot = (out[r.instance_id] ??= {});
      slot[r.reviewer_role] = r.weighted_score;
    }
  }
  return out;
}

export async function updateInstance(id: string, patch: Partial<AnnualReviewInstance>): Promise<AnnualReviewInstance> {
  const { data, error } = await db.from('annual_review_instances').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- Phase 4: recent stage-weight override audit feed ----------
/**
 * Reads the immutable `system_audit_logs` rows emitted by
 * `set_annual_review_stage_weights_override`, joined with the employee/profile
 * for the affected instance. RLS already restricts visibility to admins.
 * Returns rows newest-first, capped at `limit`.
 */
export interface StageWeightsOverrideAudit {
  id: string;
  created_at: string;
  performed_by: string | null;
  performer_name: string | null;
  instance_id: string;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string | null;
  previous: Record<string, number> | null;
  next: Record<string, number> | null;
  reason: string | null;
}
export async function listRecentStageWeightsOverrideAudits(
  cycleId: string | undefined,
  limit = 25,
): Promise<StageWeightsOverrideAudit[]> {
  const { data: rows, error } = await db
    .from('system_audit_logs')
    .select('id, created_at, performed_by, metadata')
    .eq('action', 'annual_review.stage_weights_override_set')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit * 4)));
  if (error) throw error;

  const raw = (rows ?? []) as Array<{
    id: string; created_at: string; performed_by: string | null;
    metadata: { instance_id?: string; previous?: any; next?: any; reason?: string } | null;
  }>;

  // Hydrate instance → employee. If a cycleId filter is set, drop rows whose
  // instance is not part of that cycle.
  const instIds = Array.from(new Set(raw.map((r) => r.metadata?.instance_id).filter(Boolean) as string[]));
  const instMap = new Map<string, { employee_id: string | null; cycle_id: string | null }>();
  if (instIds.length) {
    const { data: insts, error: iErr } = await db
      .from('annual_review_instances')
      .select('id, employee_id, cycle_id')
      .in('id', instIds);
    if (iErr) throw iErr;
    (insts ?? []).forEach((i: any) => instMap.set(i.id, { employee_id: i.employee_id, cycle_id: i.cycle_id }));
  }

  const empIds = Array.from(new Set([
    ...Array.from(instMap.values()).map((v) => v.employee_id),
    ...raw.map((r) => r.performed_by),
  ].filter(Boolean) as string[]));
  const profMap = new Map<string, { full_name: string | null; employee_code: string | null }>();
  if (empIds.length) {
    const { data: profs, error: pErr } = await db
      .from('profiles')
      .select('id, full_name, employee_code')
      .in('id', empIds);
    if (pErr) throw pErr;
    (profs ?? []).forEach((p: any) => profMap.set(p.id, { full_name: p.full_name, employee_code: p.employee_code }));
  }

  const out: StageWeightsOverrideAudit[] = [];
  for (const r of raw) {
    const instanceId = r.metadata?.instance_id ?? null;
    if (!instanceId) continue;
    const inst = instMap.get(instanceId);
    if (cycleId && inst?.cycle_id !== cycleId) continue;
    const employeeId = inst?.employee_id ?? null;
    const emp = employeeId ? profMap.get(employeeId) : null;
    const performer = r.performed_by ? profMap.get(r.performed_by) : null;
    out.push({
      id: r.id,
      created_at: r.created_at,
      performed_by: r.performed_by,
      performer_name: performer?.full_name ?? null,
      instance_id: instanceId,
      employee_id: employeeId,
      employee_name: emp?.full_name ?? null,
      employee_code: emp?.employee_code ?? null,
      previous: (r.metadata?.previous ?? null) as Record<string, number> | null,
      next: (r.metadata?.next ?? null) as Record<string, number> | null,
      reason: r.metadata?.reason ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Lightweight active-employee search used by admin-only preview surfaces
 * (e.g. the Template Editor's Carry KRA mapping preview). Read-only, capped.
 */
export type EmployeeLite = {
  id: string; full_name: string | null; employee_code: string | null; designation: string | null;
};
export async function searchActiveEmployees(query: string, limit = 20): Promise<EmployeeLite[]> {
  const q = (query ?? '').trim();
  let req = db.from('profiles')
    .select('id, full_name, employee_code, designation')
    .eq('is_active', true)
    .eq('is_dummy_employee', false)
    .order('full_name', { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));
  if (q.length > 0) {
    const safe = q.replace(/[%,]/g, ' ');
    req = req.or(`full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`);
  }
  const { data, error } = await req;
  if (error) throw error;
  return (data ?? []) as EmployeeLite[];
}

/** Bulk-seed instances for an entire cycle. Resolves the snapshotted chain.
 *
 *   manager_id  ← profiles.reporting_manager_id
 *   skip_id     ← manager's reporting_manager_id
 *   bu_head_id  ← business_units.head_user_id of the employee's BU (admin-managed,
 *                 auto-derived from top of BU hierarchy or manually overridden).
 *                 Falls back to the 2-hops-above-skip ancestor only if the BU
 *                 has no head configured (legacy behaviour).
 *   hr_id       ← org_head_config.hr_head_user_id for the company. Falls back
 *                 to args.hrUserId if not configured.
 */
export async function seedInstancesForCycle(args: { cycleId: string; templateId: string; hrUserId: string | null; companyId?: string | null }) {
  // POLICY §94 — must page; PostgREST silently caps unranged reads at 1000
  const people = await fetchAllPaged<any>((from, to) =>
    db.from('profiles')
      .select('id, reporting_manager_id, functional_manager_id, department_id, company_id')
      .eq('is_active', true)
      .eq('is_dummy_employee', false)
      .order('id')
      .range(from, to)
  );
  const mgrMap = new Map<string, string | null>();
  for (const p of people ?? []) mgrMap.set(p.id, p.reporting_manager_id);

  // Department → BU + BU → head lookups (single pass each).
  const deptIds = [...new Set((people ?? []).map((p: any) => p.department_id).filter(Boolean))];
  const deptToBu: Record<string, string> = {};
  for (let i = 0; i < deptIds.length; i += 500) {
    const slice = deptIds.slice(i, i + 500);
    const { data: depts, error } = await db.from('departments').select('id, business_unit_id').in('id', slice);
    if (error) throw error;
    for (const d of depts ?? []) deptToBu[d.id] = d.business_unit_id;
  }
  const { data: bus, error: buErr } = await db.from('business_units').select('id, head_user_id');
  if (buErr) throw buErr;
  const buHead: Record<string, string | null> = {};
  for (const b of bus ?? []) buHead[b.id] = (b as any).head_user_id ?? null;

  // HR head from org_head_config (per company if provided).
  let hrHead: string | null = args.hrUserId ?? null;
  {
    let q = db.from('org_head_config').select('hr_head_user_id, company_id');
    if (args.companyId) q = q.eq('company_id', args.companyId);
    const { data: cfg } = await q.limit(1);
    if (cfg && cfg[0] && (cfg[0] as any).hr_head_user_id) hrHead = (cfg[0] as any).hr_head_user_id;
  }

  const rows = (people ?? []).map((p: any) => {
    const mgr = mgrMap.get(p.id) ?? null;
    const skip = mgr ? mgrMap.get(mgr) ?? null : null;
    const bu = deptToBu[p.department_id] ? buHead[deptToBu[p.department_id]] ?? null : null;
    // Legacy fallback when no BU head configured: 2 hops above skip.
    const buFallback = skip ? mgrMap.get(skip) ?? null : null;
    return {
      employee_id: p.id,
      template_id: args.templateId,
      cycle_id: args.cycleId,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: bu ?? buFallback,
      hr_id: hrHead,
    };
  });

  await writeSeedRowsPreservingOverrides(args.cycleId, rows);
  return rows.length;
}

/**
 * Seed writer that NEVER clobbers `template_override_id`.
 *
 * Standard upsert would set EXCLUDED.template_override_id (= NULL) on every
 * conflict, silently wiping per-employee overrides on re-seed.
 *
 * Strategy: partition rows into "new" (insert) and "existing" (update only
 * the seed-controlled columns — never `template_override_id`).
 */
async function writeSeedRowsPreservingOverrides(
  cycleId: string,
  rows: Array<{
    employee_id: string;
    template_id: string;
    cycle_id: string;
    manager_id: string | null;
    skip_id: string | null;
    bu_head_id: string | null;
    hr_id: string | null;
    assigned_rule_id?: string | null;
  }>,
) {
  if (rows.length === 0) return;

  // Existing instance keys for this cycle (paged — same PostgREST cap concern).
  const existing = await fetchAllPaged<{ id: string; employee_id: string }>((from, to) =>
    db.from('annual_review_instances')
      .select('id, employee_id')
      .eq('cycle_id', cycleId)
      .order('employee_id')
      .range(from, to)
  );
  const existingByEmp = new Map(existing.map((r) => [r.employee_id, r.id]));

  const toInsert = rows.filter((r) => !existingByEmp.has(r.employee_id));
  const toUpdate = rows.filter((r) => existingByEmp.has(r.employee_id));

  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await db
      .from('annual_review_instances')
      .insert(toInsert.slice(i, i + CHUNK));
    if (error) throw error;
  }

  // Per-row updates — required to preserve template_override_id.
  // Throughput: ~few hundred ms per 100 rows; acceptable for re-seed ops
  // which are rare and admin-initiated.
  for (const r of toUpdate) {
    const id = existingByEmp.get(r.employee_id)!;
    const patch: Record<string, unknown> = {
      template_id: r.template_id,
      manager_id: r.manager_id,
      skip_id: r.skip_id,
      bu_head_id: r.bu_head_id,
      hr_id: r.hr_id,
    };
    if ('assigned_rule_id' in r) patch.assigned_rule_id = r.assigned_rule_id ?? null;
    const { error } = await db
      .from('annual_review_instances')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
  }
}

/**
 * Filter-aware seeding. Walks active rules for the cycle in priority order
 * (lower number wins) and assigns each employee to the first matching rule's
 * template. Employees that don't match any rule are skipped.
 *
 * Filter semantics (all comparisons string-equal):
 *   - roles            → profiles.designation
 *   - grades           → profiles.pms_grade
 *   - levels           → profiles.level
 *   - department_ids   → profiles.department_id
 *   - bu_ids           → departments.business_unit_id (joined via department)
 *   - empty filter set → matches all employees
 */
export async function seedInstancesByRules(args: { cycleId: string; hrUserId: string | null; companyId?: string | null }) {
  const { data: rules, error: rulesErr } = await db
    .from('annual_review_assignment_rules')
    .select('id, template_id, priority, filters, is_active')
    .eq('cycle_id', args.cycleId)
    .eq('is_active', true)
    .order('priority', { ascending: true });
  if (rulesErr) throw rulesErr;
  if (!rules || rules.length === 0) throw new Error('No active rules — add a rule first.');

  // POLICY §94 — paged read; >2,500 active employees silently truncate at 1000 otherwise.
  const people = await fetchAllPaged<any>((from, to) =>
    db.from('profiles')
      .select('id, reporting_manager_id, functional_manager_id, designation, pms_grade, level, department_id')
      .eq('is_active', true)
      .eq('is_dummy_employee', false)
      .order('id')
      .range(from, to)
  );

  // Department → BU lookup (one query, no per-row N+1).
  const deptIds = [...new Set((people ?? []).map((p: any) => p.department_id).filter(Boolean))];
  const deptToBu: Record<string, string> = {};
  // Defensive chunking — .in() over >1000 ids hits the same PostgREST cap.
  const DEPT_CHUNK = 500;
  for (let i = 0; i < deptIds.length; i += DEPT_CHUNK) {
    const slice = deptIds.slice(i, i + DEPT_CHUNK);
    const { data: depts, error: dErr } = await db
      .from('departments').select('id, business_unit_id').in('id', slice);
    if (dErr) throw dErr;
    for (const d of depts ?? []) deptToBu[d.id] = d.business_unit_id;
  }

  // BU head + HR head — same admin-managed source as seedInstancesForCycle.
  const { data: bus, error: buErr } = await db.from('business_units').select('id, head_user_id');
  if (buErr) throw buErr;
  const buHead: Record<string, string | null> = {};
  for (const b of bus ?? []) buHead[b.id] = (b as any).head_user_id ?? null;

  let hrHead: string | null = args.hrUserId ?? null;
  {
    let q = db.from('org_head_config').select('hr_head_user_id, company_id');
    if (args.companyId) q = q.eq('company_id', args.companyId);
    const { data: cfg } = await q.limit(1);
    if (cfg && cfg[0] && (cfg[0] as any).hr_head_user_id) hrHead = (cfg[0] as any).hr_head_user_id;
  }

  const mgrMap = new Map<string, string | null>();
  for (const p of people ?? []) mgrMap.set(p.id, p.reporting_manager_id);

  const matches = (filters: any, p: any): boolean => {
    const f = filters ?? {};
    const list = (k: string): string[] => Array.isArray(f[k]) ? f[k] : [];
    if (list('roles').length && !list('roles').includes(p.designation)) return false;
    if (list('grades').length && !list('grades').includes(p.pms_grade)) return false;
    if (list('levels').length && !list('levels').includes(p.level)) return false;
    if (list('department_ids').length && !list('department_ids').includes(p.department_id)) return false;
    if (list('bu_ids').length && !list('bu_ids').includes(deptToBu[p.department_id])) return false;
    return true;
  };

  const rows: any[] = [];
  let skipped = 0;
  for (const p of people ?? []) {
    const rule = (rules as any[]).find((r) => matches(r.filters, p));
    if (!rule) { skipped++; continue; }
    const mgr = mgrMap.get(p.id) ?? null;
    const skip = mgr ? mgrMap.get(mgr) ?? null : null;
    const buId = deptToBu[p.department_id];
    const buFromCfg = buId ? buHead[buId] ?? null : null;
    const buFallback = skip ? mgrMap.get(skip) ?? null : null;
    rows.push({
      employee_id: p.id,
      template_id: rule.template_id,
      cycle_id: args.cycleId,
      assigned_rule_id: rule.id,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: buFromCfg ?? buFallback,
      hr_id: hrHead,
    });
  }

  await writeSeedRowsPreservingOverrides(args.cycleId, rows);
  return { seeded: rows.length, skipped };
}

// ---------- Responses ----------
export async function listResponses(instanceId: string): Promise<AnnualReviewResponse[]> {
  const { data, error } = await db
    .from('annual_review_responses')
    .select('*')
    .eq('instance_id', instanceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertResponseDraft(args: {
  instance_id: string;
  reviewer_id: string;
  reviewer_role: AnnualReviewerRole;
  criteria_scores?: Record<string, number>;
  qualitative_responses?: Record<string, string>;
  evidence?: EvidenceItem[];
  weighted_score?: number | null;
  notes?: string | null;
}): Promise<AnnualReviewResponse> {
  const { data, error } = await db
    .from('annual_review_responses')
    .upsert(args, { onConflict: 'instance_id,reviewer_role' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function advanceStatus(instanceId: string, reviewerRole: AnnualReviewerRole) {
  const { data, error } = await db.rpc('advance_annual_review_status', {
    p_instance_id: instanceId,
    p_reviewer_role: reviewerRole,
  });
  if (error) throw error;
  return data as string;
}

/** Send the review one stage back so the prior reviewer can revise & resubmit. */
export async function sendBackStatus(
  instanceId: string,
  reviewerRole: AnnualReviewerRole,
  reason: string | null,
) {
  const { data, error } = await db.rpc('send_back_annual_review_status', {
    p_instance_id: instanceId,
    p_reviewer_role: reviewerRole,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

/** Patch eligibility-input values on the instance (used by HR pre-finalization). */
export async function updateEligibilityInputs(
  instanceId: string,
  inputs: Record<string, string | number | boolean>,
) {
  const { data, error } = await db
    .from('annual_review_instances')
    .update({ eligibility_inputs: inputs })
    .eq('id', instanceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------- Storage ----------
export async function uploadEvidence(args: { instanceId: string; reviewerId: string; role: AnnualReviewerRole; file: File }): Promise<EvidenceItem> {
  const safeName = args.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `annual-review/${args.instanceId}/${args.role}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, args.file, { contentType: args.file.type });
  if (error) throw error;
  return { path, name: args.file.name, size: args.file.size, mime: args.file.type, uploaded_at: new Date().toISOString() };
}

export async function getEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function finalizeInstance(args: { id: string; finalRating: string; hrRemarks: string; systemScores?: Record<string, number>; totalScore?: number | null; criteriaWeightedScore?: number | null }) {
  const { error } = await db
    .from('annual_review_instances')
    .update({
      final_rating: args.finalRating,
      hr_remarks: args.hrRemarks,
      system_scores: args.systemScores ?? undefined,
      total_score: args.totalScore ?? undefined,
      criteria_weighted_score: args.criteriaWeightedScore ?? undefined,
    })
    .eq('id', args.id);
  if (error) throw error;
  return advanceStatus(args.id, 'hr');
}

/** Bulk-apply the same final rating + remark to many `pending_hr` instances. */
export async function bulkFinalize(args: { instanceIds: string[]; finalRating: string; hrRemarks?: string | null }) {
  const { data, error } = await db.rpc('bulk_finalize_annual_reviews', {
    p_instance_ids: args.instanceIds,
    p_final_rating: args.finalRating,
    p_hr_remarks: args.hrRemarks ?? null,
  });
  if (error) throw error;
  return data as number;
}

/** Close a cycle (admin/hr_pms). Locks all responses, marks cycle 'closed'. */
export async function closeCycle(cycleId: string): Promise<number> {
  const { data, error } = await db.rpc('close_annual_review_cycle', { p_cycle_id: cycleId });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Reopen a closed cycle (admin/hr_pms). Reason mandatory; audit-logged. */
export async function reopenCycle(cycleId: string, reason: string): Promise<AnnualReviewCycle> {
  const { data, error } = await db.rpc('reopen_annual_review_cycle', {
    p_cycle_id: cycleId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as AnnualReviewCycle;
}

/** Reassign a reviewer on a single instance mid-cycle (admin/hr_pms). */
export async function reassignReviewer(args: {
  instanceId: string;
  role: 'manager' | 'skip_manager' | 'bu_head' | 'hr';
  newReviewerId: string;
  reason: string;
}) {
  const { error } = await db.rpc('reassign_annual_review_reviewer', {
    p_instance_id: args.instanceId,
    p_role: args.role,
    p_new_reviewer_id: args.newReviewerId,
    p_reason: args.reason,
  });
  if (error) throw error;
}

/** HR/Admin rating override on a finalized instance. Reason is mandatory (>=3 chars). */
export async function overrideRating(instanceId: string, newRating: string, reason: string) {
  const { error } = await db.rpc('override_annual_review_rating', {
    p_instance_id: instanceId, p_new_rating: newRating, p_reason: reason,
  });
  if (error) throw error;
}

/** Manually invoke the reminder cron (admins). */
export async function runReminderCron(): Promise<{ queued: number; skipped: number }> {
  const { data, error } = await supabase.functions.invoke('annual-review-reminders');
  if (error) throw error;
  return data as { queued: number; skipped: number };
}

/** Employee acknowledges their finalized review, optionally with a rebuttal note. */
export async function acknowledgeInstance(instanceId: string, rebuttal?: string | null) {
  const { error } = await db.rpc('acknowledge_annual_review_instance', {
    p_instance_id: instanceId,
    p_rebuttal: rebuttal ?? null,
  });
  if (error) throw error;
}

/** HR/Admin: clone a template into a new (inactive) version under the same lineage. */
export async function cloneTemplate(sourceId: string, newName?: string | null): Promise<string> {
  const { data, error } = await db.rpc('clone_annual_review_template', {
    p_source_id: sourceId,
    p_new_name: newName ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** HR/Admin: clone a cycle as draft. Optionally re-clones templates and copies rules. */
export async function cloneCycle(args: {
  sourceId: string;
  newName: string;
  reviewYear: number;
  copyTemplates?: boolean;
  copyRules?: boolean;
}): Promise<string> {
  const { data, error } = await db.rpc('clone_annual_review_cycle', {
    p_source_id: args.sourceId,
    p_new_name: args.newName,
    p_review_year: args.reviewYear,
    p_copy_templates: args.copyTemplates ?? false,
    p_copy_rules: args.copyRules ?? true,
  });
  if (error) throw error;
  return data as string;
}

export interface AnnualReviewTimelineEntry {
  id: string;
  action: string;
  created_at: string;
  performed_by: string | null;
  metadata: Record<string, unknown> | null;
  performer_name?: string | null;
}

/** Audit timeline for a single instance — pulls all `annual_review.*` log entries. */
export async function listInstanceTimeline(instanceId: string): Promise<AnnualReviewTimelineEntry[]> {
  const { data, error } = await db
    .from('system_audit_logs')
    .select('id, action, created_at, performed_by, metadata')
    .like('action', 'annual_review.%')
    .contains('metadata', { instance_id: instanceId })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as AnnualReviewTimelineEntry[];

  // Resolve performer names in one round-trip.
  const ids = Array.from(new Set(rows.map((r) => r.performed_by).filter(Boolean))) as string[];
  if (ids.length === 0) return rows;
  const { data: profs } = await db.from('profiles').select('id, full_name').in('id', ids);
  const map = new Map<string, string>((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  return rows.map((r) => ({ ...r, performer_name: r.performed_by ? map.get(r.performed_by) ?? null : null }));
}
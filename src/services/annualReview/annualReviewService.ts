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
import { getHrHeadUserId } from '@/services/orgHeads/hrHeadResolver';
import { bucketFromGradeCode } from './archetypeResolver';
import {
  fetchEmployeesWithKrasSince,
  windowMonthsFromFilters,
} from './formMapping';
import { resolveHierarchicalHead } from '@/lib/annualReview/hierarchyGuard';

/**
 * Best-effort audit log for dept/BU-head hierarchy fallbacks during seed.
 * Batched to avoid per-row round trips; errors are swallowed since a broken
 * audit trail must never block a re-seed.
 */
async function logHeadFallbacks(
  cycleId: string,
  events: Array<{ employee_id: string; role: 'dept_head' | 'bu_head'; configured_id: string | null; resolved_id: string | null; reason: string | undefined }>,
) {
  if (events.length === 0) return;
  try {
    const rows = events.map((e) => ({
      action: 'annual_review.head_fallback',
      performed_by: null,
      metadata: {
        cycle_id: cycleId,
        employee_id: e.employee_id,
        role: e.role,
        configured_id: e.configured_id,
        resolved_id: e.resolved_id,
        reason: e.reason ?? null,
      },
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.from('system_audit_logs').insert(rows.slice(i, i + CHUNK));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[annualReview] head-fallback audit log skipped:', err);
  }
}

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
 * Bulk-reassign already-seeded instances to a different template using
 * `setTemplateOverride`. Per-row error isolation — a failed row doesn't
 * abort the batch. Used by the Form Mapping "Sync assignments" flow when
 * a new rule overlaps employees already seeded on an older template.
 */
export interface BulkReassignInput {
  instanceId: string;
  templateId: string;
}
export interface BulkReassignResult {
  ok: number;
  failed: { instanceId: string; error: string }[];
}
export async function bulkReassignViaOverride(
  items: BulkReassignInput[],
  reason: string,
): Promise<BulkReassignResult> {
  const out: BulkReassignResult = { ok: 0, failed: [] };
  for (const item of items) {
    try {
      await setTemplateOverride({
        instanceId: item.instanceId,
        templateId: item.templateId,
        reason,
      });
      out.ok++;
    } catch (e) {
      out.failed.push({
        instanceId: item.instanceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

/**
 * Destructive force-reset: snapshots the instance's responses/proxy rows into
 * `annual_review_reset_archive`, wipes them, swaps template, restarts the
 * instance at `pending_self`. Admin / hr_pms only; reason must be ≥ 10 chars.
 * Used when the caller intentionally wants to move an employee that is already
 * past pending_self onto a different template (the non-destructive
 * `set_annual_review_template_override` refuses these).
 */
export interface ForceResetItem {
  instanceId: string;
  templateId: string;
}
export interface ForceResetBulkResult {
  ok: number;
  failed: { instanceId: string; error: string }[];
}
export async function bulkForceResetInstances(
  items: ForceResetItem[],
  reason: string,
): Promise<ForceResetBulkResult> {
  if (items.length === 0) return { ok: 0, failed: [] };
  const payload = items.map((i) => ({
    instance_id: i.instanceId,
    new_template_id: i.templateId,
  }));
  const { data, error } = await db.rpc(
    // Cast: generated types may lag until the migration types are regenerated.
    'bulk_force_reset_annual_review_instances' as never,
    { p_items: payload as never, p_reason: reason } as never,
  );
  if (error) throw new Error(error.message);
  const res = (data ?? {}) as { ok?: number; failed?: { instance_id: string; error: string }[] };
  return {
    ok: Number(res.ok ?? 0),
    failed: (res.failed ?? []).map((f) => ({ instanceId: f.instance_id, error: f.error })),
  };
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
  // Partial updates (e.g. activation toggle sending only { id, is_active })
  // must use UPDATE — a blind upsert triggers NOT NULL on `name` because
  // Postgres validates constraints before the ON CONFLICT resolver runs.
  if (t.id) {
    const { id, ...patch } = t;
    const { data, error } = await db
      .from('annual_review_templates')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db.from('annual_review_templates').insert(t).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Delete a template — blocked when any assignment rule, per-employee
 * override, or live instance still references it. Callers should surface
 * the returned Error message to the user; toast severity is `error`.
 */
export async function deleteTemplate(id: string): Promise<{ ok: true }> {
  const [rules, instTpl, instOverride] = await Promise.all([
    db.from('annual_review_assignment_rules')
      .select('id', { count: 'exact', head: true }).eq('template_id', id),
    db.from('annual_review_instances')
      .select('id', { count: 'exact', head: true }).eq('template_id', id),
    db.from('annual_review_instances')
      .select('id', { count: 'exact', head: true }).eq('template_override_id', id),
  ]);
  for (const r of [rules, instTpl, instOverride]) {
    if (r.error) {
      throw new Error(r.error.message || 'Failed to check template references');
    }
  }
  const ruleCount = rules.count ?? 0;
  const instanceCount = (instTpl.count ?? 0) + (instOverride.count ?? 0);
  if (ruleCount + instanceCount > 0) {
    throw new Error(
      `Cannot delete — template is assigned to ${ruleCount} rule(s), ${instanceCount} live instance(s) (including per-employee overrides). Deactivate it instead.`,
    );
  }
  const { error } = await db.from('annual_review_templates').delete().eq('id', id);
  if (error) throw new Error(error.message || 'Failed to delete template');
  return { ok: true };
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
  employee?: { id: string; full_name: string | null; employee_code: string | null; designation: string | null; doj?: string | null };
}

export async function listInstancesForCycle(cycleId: string): Promise<InstanceWithEmployee[]> {
  // POLICY §125 / ADR-135 — PostgREST silently caps unranged reads at 1,000 rows.
  // Analytics & Calibration tabs feed the entire cycle roster (~2,533 employees)
  // through this call, so the read MUST page. Order by `id` to guarantee a
  // stable pagination window.
  return fetchAllPaged<InstanceWithEmployee>((from, to) =>
    db
      .from('annual_review_instances')
      .select('*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj)')
      .eq('cycle_id', cycleId)
      .order('id')
      .range(from, to),
  );
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
  /** Restrict to employees whose profile.pms_grade matches (master-data name). */
  pmsGrade?: string;
  /** Restrict to employees whose profile.level matches (master-data name). */
  level?: string;
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
      '*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj)',
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
  args: { departmentId?: string; businessUnitId?: string; pmsGrade?: string; level?: string },
): Promise<string[] | null> {
  if (!args.departmentId && !args.businessUnitId && !args.pmsGrade && !args.level) return null;

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
    if (args.pmsGrade) pq = pq.eq('pms_grade', args.pmsGrade);
    if (args.level) pq = pq.eq('level', args.level);
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
    .select('*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj)')
    .eq('cycle_id', cycleId)
    .neq('overall_status', 'excluded')
    .or(`manager_id.eq.${reviewerId},skip_id.eq.${reviewerId},dept_head_id.eq.${reviewerId},bu_head_id.eq.${reviewerId},hr_id.eq.${reviewerId}`);
  if (error) throw error;
  return data ?? [];
}

// ---------- Reviewer-scoped pagination ----------
/**
 * Server-paginated reviewer queue for the Team Annual Review page.
 *
 * Why this exists: the unpaginated `listInstancesForReviewer` is silently capped
 * at the PostgREST 1,000-row Data API ceiling — senior managers / HR PMS users
 * mapped to large org slices saw the whole cycle render at once. This fetcher
 * applies the same reviewer `.or(...)` envelope but with `count: 'exact'` +
 * `.range()`, plus an optional status filter and an employee name/code search
 * resolved through a slim profile pre-fetch (mirrors `listInstancesPaginated`).
 */
export interface ListReviewerInstancesPaginatedArgs {
  reviewerId: string;
  cycleId: string;
  page: number;          // 1-indexed
  pageSize: number;
  search?: string;
  status?: AnnualReviewStatus | 'all';
  /**
   * "My role" filter — restrict the queue to rows where the current user is
   * only the specified reviewer. Default `'any'` preserves the legacy 5-way
   * OR envelope so multi-hat users still see everything.
   */
  scope?: ReviewerScope;
}

export type ReviewerScope = 'any' | 'manager' | 'skip' | 'dept' | 'bu' | 'hr' | 'management';

export async function listInstancesForReviewerPaginated(
  args: ListReviewerInstancesPaginatedArgs,
): Promise<PaginatedInstances> {
  const { data, error } = await db.rpc('get_my_annual_review_queue', {
    p_cycle_id: args.cycleId,
    p_page: Math.max(args.page, 1),
    p_page_size: Math.min(Math.max(args.pageSize, 1), 100),
    p_search: args.search?.trim() || null,
    p_status: args.status ?? 'all',
    p_scope: args.scope ?? 'any',
  });
  if (error) throw error;
  const payload = data as { rows?: InstanceWithEmployee[]; total?: number } | null;
  return { rows: payload?.rows ?? [], total: Number(payload?.total ?? 0) };
}

/**
 * Per-reviewer-role counts for the current user in a cycle. Drives which
 * "My role" chips render on the Team Annual Review page (chip hidden when
 * count === 0). One head+count query per role — cheap and RLS-safe.
 */
export type ReviewerRoleCounts = {
  manager: number;
  skip: number;
  dept: number;
  bu: number;
  hr: number;
  management: number;
};

export async function getReviewerRoleCounts(
  _reviewerId: string,
  cycleId: string,
): Promise<ReviewerRoleCounts> {
  const { data, error } = await db.rpc('get_my_annual_review_role_counts', {
    p_cycle_id: cycleId,
  });
  if (error) throw error;
  const counts = data as Partial<ReviewerRoleCounts> | null;
  return {
    manager: Number(counts?.manager ?? 0),
    skip: Number(counts?.skip ?? 0),
    dept: Number(counts?.dept ?? 0),
    bu: Number(counts?.bu ?? 0),
    hr: Number(counts?.hr ?? 0),
    management: Number(counts?.management ?? 0),
  };
}

/**
 * Single-instance lookup used by the dedicated detail page
 * (`/annual-review/team/:instanceId`). RLS gates access to the row.
 */
export async function getInstanceById(id: string): Promise<InstanceWithEmployee | null> {
  const { data, error } = await db
    .from('annual_review_instances')
    .select(
      '*, employee:profiles!annual_review_instances_employee_id_fkey(id, full_name, employee_code, designation, doj)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as InstanceWithEmployee | null) ?? null;
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
  departmentId?: string;
  businessUnitId?: string;
  managerId?: string;
  pmsGrade?: string;
  level?: string;
  onProgress?: (loaded: number) => void;
}): Promise<InstanceWithEmployee[]> {
  // 1) Optional name search + org filters → restrict to matching employee_ids.
  let restrictIds: string[] | null = null;
  const orgIds = await resolveEmployeeIdsForOrgFilters(args);
  if (orgIds && orgIds.length === 0) return [];
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
    if (orgIds) {
      const set = new Set(orgIds);
      restrictIds = restrictIds.filter((id) => set.has(id));
    }
    if (restrictIds.length === 0) return [];
  } else if (orgIds) {
    restrictIds = orgIds;
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
    if (args.managerId) q = q.eq('manager_id', args.managerId);
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
  // Cycle-level default workflow chain (admin-configurable on the Cycle editor).
  // Stamped onto each new instance.enabled_stages; per-employee overrides
  // (set_annual_review_enabled_stages) still win, and the writer preserves them.
  const { data: cycleRow, error: cycleErr } = await db
    .from('annual_review_cycles')
    .select('default_enabled_stages')
    .eq('id', args.cycleId)
    .single();
  if (cycleErr) throw cycleErr;
  const defaultStages = ((cycleRow as { default_enabled_stages?: unknown } | null)?.default_enabled_stages
    ?? ['self','manager','skip_manager','dept_head','bu_head','hr']) as AnnualReviewerRole[];
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

  // Department head map (mirrors BU head map). Used to snapshot dept_head_id.
  const { data: depts2, error: dh1Err } = await db.from('departments').select('id, head_user_id');
  if (dh1Err) throw dh1Err;
  const deptHead: Record<string, string | null> = {};
  for (const d of depts2 ?? []) deptHead[d.id] = (d as any).head_user_id ?? null;

  // HR head = head_user_id of the BU named "HR" within the company.
  // (Replaces deprecated org_head_config source; managed inline on the
  // Business Units tab via BuHeadColumn.)
  let hrHead: string | null = args.hrUserId ?? null;
  {
    const resolved = await getHrHeadUserId(args.companyId ?? null);
    if (resolved) hrHead = resolved;
  }

  const fallbackEvents: Array<{ employee_id: string; role: 'dept_head' | 'bu_head'; configured_id: string | null; resolved_id: string | null; reason: string | undefined }> = [];
  const rows = (people ?? []).map((p: any) => {
    const mgr = mgrMap.get(p.id) ?? null;
    const skip = mgr ? mgrMap.get(mgr) ?? null : null;
    const bu = deptToBu[p.department_id] ? buHead[deptToBu[p.department_id]] ?? null : null;
    // Legacy fallback when no BU head configured: 2 hops above skip.
    const buFallback = skip ? mgrMap.get(skip) ?? null : null;

    // Hierarchy guards — prevent a misconfigured dept/BU head (peer, self, or
    // unrelated employee) from being stamped as a reviewer. Falls back to the
    // reporting chain and records an audit event so admins can fix the source.
    const configuredDept = p.department_id ? deptHead[p.department_id] ?? null : null;
    const deptResolved = resolveHierarchicalHead({
      employeeId: p.id,
      configuredHeadId: configuredDept,
      fallbackId: mgr,
      mgrMap,
    });
    if (deptResolved.usedFallback && configuredDept) {
      fallbackEvents.push({ employee_id: p.id, role: 'dept_head', configured_id: configuredDept, resolved_id: deptResolved.headId, reason: deptResolved.reason });
    }

    const configuredBu = bu ?? null;
    const buResolved = resolveHierarchicalHead({
      employeeId: p.id,
      configuredHeadId: configuredBu,
      fallbackId: buFallback,
      mgrMap,
    });
    if (buResolved.usedFallback && configuredBu) {
      fallbackEvents.push({ employee_id: p.id, role: 'bu_head', configured_id: configuredBu, resolved_id: buResolved.headId, reason: buResolved.reason });
    }

    return {
      employee_id: p.id,
      template_id: args.templateId,
      cycle_id: args.cycleId,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: buResolved.headId ?? buFallback,
      dept_head_id: deptResolved.headId,
      hr_id: hrHead,
      enabled_stages: defaultStages,
    };
  });

  await writeSeedRowsPreservingOverrides(args.cycleId, rows);
  await logHeadFallbacks(args.cycleId, fallbackEvents);
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
type SeedRowForWrite = {
  employee_id: string;
  template_id: string;
  cycle_id: string;
  manager_id: string | null;
  skip_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  assigned_rule_id?: string | null;
  dept_head_id?: string | null;
  enabled_stages?: AnnualReviewerRole[];
};

export function buildSeedUpdatePatch(r: SeedRowForWrite): Record<string, unknown> {
  // ADR-117 — template_id is intentionally NOT part of the update patch.
  // Rewriting it on an existing row would clobber any per-employee template
  // choice (force-reset or explicit override) with the rule-driven value,
  // reintroducing the drift that caused the "employee still sees the old
  // template" bug. New instances still get template_id via the INSERT path.
  const patch: Record<string, unknown> = {
    manager_id: r.manager_id,
    skip_id: r.skip_id,
    bu_head_id: r.bu_head_id,
    dept_head_id: r.dept_head_id ?? null,
    hr_id: r.hr_id,
  };
  if ('assigned_rule_id' in r) patch.assigned_rule_id = r.assigned_rule_id ?? null;
  if ('enabled_stages' in r) patch.enabled_stages = r.enabled_stages ?? null;
  return patch;
}

async function writeSeedRowsPreservingOverrides(
  cycleId: string,
  rows: SeedRowForWrite[],
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
    const patch = buildSeedUpdatePatch(r);
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
/**
 * Statuses considered "safe to fully re-snapshot the reviewer chain".
 * Once the review has moved past self-review the manager (and later reviewers)
 * may have already begun acting on the row, so we must never silently swap
 * their ids out from under them.
 *
 * POLICY §AR-REVIEWER-RESYNC: resync updates reviewer routing columns only
 * when the instance is still at or before the self-review stage.
 */
const RESYNC_SAFE_STATUSES = new Set(['not_started', 'pending_self']);

type ComputedSeedRow = SeedRowForWrite;
type ComputeSeedResult = {
  rows: ComputedSeedRow[];
  skipped: number;
  fallbackEvents: Array<{ employee_id: string; role: 'dept_head' | 'bu_head'; configured_id: string | null; resolved_id: string | null; reason: string | undefined }>;
};

/**
 * Pure computation of the seed rows for a cycle — no writes. Extracted so
 * that both `seedInstancesByRules` (insert + update) and
 * `resyncReviewersFromMaster` (update-only, stage-guarded) share the same
 * hierarchy-resolution path.
 */
async function computeSeedRowsForCycle(args: { cycleId: string; hrUserId: string | null; companyId?: string | null }): Promise<ComputeSeedResult & { defaultStages: AnnualReviewerRole[] }> {
  // Cycle-level default workflow chain — stamped on each new instance.
  const { data: cycleRow, error: cycleErr } = await db
    .from('annual_review_cycles')
    .select('default_enabled_stages')
    .eq('id', args.cycleId)
    .single();
  if (cycleErr) throw cycleErr;
  const defaultStages = ((cycleRow as { default_enabled_stages?: unknown } | null)?.default_enabled_stages
    ?? ['self','manager','skip_manager','dept_head','bu_head','hr']) as AnnualReviewerRole[];

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

  // Department head snapshot map (mirrors BU head map).
  const { data: depts3, error: dh2Err } = await db.from('departments').select('id, head_user_id');
  if (dh2Err) throw dh2Err;
  const deptHead: Record<string, string | null> = {};
  for (const d of depts3 ?? []) deptHead[d.id] = (d as any).head_user_id ?? null;

  let hrHead: string | null = args.hrUserId ?? null;
  {
    const resolved = await getHrHeadUserId(args.companyId ?? null);
    if (resolved) hrHead = resolved;
  }

  // Pre-fetch one KRA set per distinct window used by any rule that opts into
  // the `has_kras` filter. Rules that don't use it get `null` and behave as
  // before (POLICY §AR-MAPPING-HAS-KRAS).
  const krasWindows = new Set<number>();
  for (const r of rules as Array<{ filters: any }>) {
    const f = r.filters ?? {};
    if (f.has_kras === 'yes' || f.has_kras === 'no') {
      krasWindows.add(windowMonthsFromFilters(f));
    }
  }
  const krasSets = new Map<number, Set<string>>();
  await Promise.all(
    [...krasWindows].map(async (w) => { krasSets.set(w, await fetchEmployeesWithKrasSince(w)); }),
  );

  const mgrMap = new Map<string, string | null>();
  for (const p of people ?? []) mgrMap.set(p.id, p.reporting_manager_id);

  const matches = (filters: any, p: any): boolean => {
    const f = filters ?? {};
    // Explicit employee-id list (POLICY §AR-MAPPING-EMPLOYEE-IDS) — mirror
    // matchesFilters in formMapping.ts. Keep both in sync or preview and
    // seed will diverge.
    const idList: string[] = Array.isArray(f.employee_ids) ? f.employee_ids : [];
    const idMode: 'only' | 'union' | undefined = f.employee_ids_mode;
    if (idMode === 'only') return idList.includes(p.id);
    if (idMode === 'union' && idList.includes(p.id)) return true;
    const list = (k: string): string[] => Array.isArray(f[k]) ? f[k] : [];
    if (list('roles').length && !list('roles').includes(p.designation)) return false;
    if (list('grades').length && !list('grades').includes(p.pms_grade)) return false;
    if (typeof f.grade_bucket === 'string' && f.grade_bucket && bucketFromGradeCode(p.pms_grade) !== f.grade_bucket) return false;
    if (list('levels').length && !list('levels').includes(p.level)) return false;
    if (list('department_ids').length && !list('department_ids').includes(p.department_id)) return false;
    if (list('bu_ids').length && !list('bu_ids').includes(deptToBu[p.department_id])) return false;
    if (f.has_kras === 'yes' || f.has_kras === 'no') {
      const set = krasSets.get(windowMonthsFromFilters(f));
      const present = !!(set && set.has(p.id));
      if (f.has_kras === 'yes' && !present) return false;
      if (f.has_kras === 'no' && present) return false;
    }
    return true;
  };

  const rows: any[] = [];
  let skipped = 0;
  const fallbackEvents: Array<{ employee_id: string; role: 'dept_head' | 'bu_head'; configured_id: string | null; resolved_id: string | null; reason: string | undefined }> = [];
  for (const p of people ?? []) {
    const rule = (rules as any[]).find((r) => matches(r.filters, p));
    if (!rule) { skipped++; continue; }
    const mgr = mgrMap.get(p.id) ?? null;
    const skip = mgr ? mgrMap.get(mgr) ?? null : null;
    const buId = deptToBu[p.department_id];
    const buFromCfg = buId ? buHead[buId] ?? null : null;
    const buFallback = skip ? mgrMap.get(skip) ?? null : null;

    const configuredDept = p.department_id ? deptHead[p.department_id] ?? null : null;
    const deptResolved = resolveHierarchicalHead({ employeeId: p.id, configuredHeadId: configuredDept, fallbackId: mgr, mgrMap });
    if (deptResolved.usedFallback && configuredDept) {
      fallbackEvents.push({ employee_id: p.id, role: 'dept_head', configured_id: configuredDept, resolved_id: deptResolved.headId, reason: deptResolved.reason });
    }
    const buResolved = resolveHierarchicalHead({ employeeId: p.id, configuredHeadId: buFromCfg, fallbackId: buFallback, mgrMap });
    if (buResolved.usedFallback && buFromCfg) {
      fallbackEvents.push({ employee_id: p.id, role: 'bu_head', configured_id: buFromCfg, resolved_id: buResolved.headId, reason: buResolved.reason });
    }

    rows.push({
      employee_id: p.id,
      template_id: rule.template_id,
      cycle_id: args.cycleId,
      assigned_rule_id: rule.id,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: buResolved.headId ?? buFallback,
      dept_head_id: deptResolved.headId,
      hr_id: hrHead,
      enabled_stages: defaultStages,
    });
  }

  return { rows, skipped, fallbackEvents, defaultStages };
}

export async function seedInstancesByRules(args: { cycleId: string; hrUserId: string | null; companyId?: string | null }) {
  const computed = await computeSeedRowsForCycle(args);
  await writeSeedRowsPreservingOverrides(args.cycleId, computed.rows);
  await logHeadFallbacks(args.cycleId, computed.fallbackEvents);
  // §AR-SELF-OPEN-LATE: any late-seeded instance still sitting at
  // `not_started` after the cycle's `self_review_start` must be auto-opened
  // so HR proxy submission and self-review UIs unlock immediately.
  const opened = await openSelfReviewForPending(args.cycleId);
  return { seeded: computed.rows.length, skipped: computed.skipped, opened };
}

/**
 * Flips any `not_started` instances of a cycle to `pending_self` when the
 * cycle is active and its `self_review_start` window has begun. Idempotent;
 * returns the number of rows opened. Safe to call after seed / resync.
 * DB does the work via `open_self_review_for_pending` (SECURITY DEFINER)
 * so a single audit row is written per invocation.
 */
export async function openSelfReviewForPending(cycleId: string): Promise<number> {
  const { data, error } = await db.rpc('open_self_review_for_pending', { _cycle_id: cycleId });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Re-snapshots reviewer routing columns (`manager_id`, `skip_id`,
 * `dept_head_id`, `bu_head_id`, `hr_id`) on **existing** instances of a cycle
 * from the current master (`profiles.reporting_manager_id`,
 * `departments.head_user_id`, `business_units.head_user_id`).
 *
 * Guardrails (POLICY §AR-REVIEWER-RESYNC):
 *  - Never inserts new instances — this is a repair path, not a seed.
 *  - Skips instances whose `overall_status` is past `pending_self` so an
 *    active reviewer is never swapped mid-flight.
 *  - Never touches scores, submissions, evidence, workflow status, or
 *    template overrides (only the columns in `buildSeedUpdatePatch`).
 */
export async function resyncReviewersFromMaster(args: { cycleId: string; hrUserId: string | null; companyId?: string | null }): Promise<{ resynced: number; skippedInFlight: number; skippedNew: number; skippedNoRule: number }> {
  const computed = await computeSeedRowsForCycle(args);

  const existing = await fetchAllPaged<{ id: string; employee_id: string; overall_status: string }>((from, to) =>
    db.from('annual_review_instances')
      .select('id, employee_id, overall_status')
      .eq('cycle_id', args.cycleId)
      .order('employee_id')
      .range(from, to)
  );
  const existingByEmp = new Map(existing.map((r) => [r.employee_id, r]));

  let resynced = 0;
  let skippedInFlight = 0;
  let skippedNew = 0;
  for (const r of computed.rows) {
    const ex = existingByEmp.get(r.employee_id);
    if (!ex) { skippedNew++; continue; }
    if (!RESYNC_SAFE_STATUSES.has(ex.overall_status)) { skippedInFlight++; continue; }
    const patch = buildSeedUpdatePatch(r);
    const { error } = await db.from('annual_review_instances').update(patch).eq('id', ex.id);
    if (error) throw error;
    resynced++;
  }

  await logHeadFallbacks(args.cycleId, computed.fallbackEvents);
  return { resynced, skippedInFlight, skippedNew, skippedNoRule: computed.skipped };
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
  // POLICY §AR-SELF-DRAFT-OWNERSHIP: self-review response rows MUST always be
  // owned by the reviewee, even when a proxy (manager/admin) is drafting on
  // their behalf. Otherwise the reviewee gets locked out of their own draft
  // by the (instance_id, reviewer_role) unique constraint + RLS scoping.
  let payload = args;
  if (args.reviewer_role === 'self') {
    const { data: inst, error: instErr } = await db
      .from('annual_review_instances')
      .select('employee_id')
      .eq('id', args.instance_id)
      .single();
    if (instErr) throw instErr;
    if (inst?.employee_id) {
      payload = { ...args, reviewer_id: inst.employee_id };
    }
  }
  const { data, error } = await db
    .from('annual_review_responses')
    .upsert(payload, { onConflict: 'instance_id,reviewer_role' })
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

/**
 * Roll a completed / finalized annual review back to pending_hr.
 * Admin / HR PMS only. Nulls final rating, HR remarks and finalized_at/by,
 * unlocks the HR stage response, and audit-logs the reason.
 */
export async function rollbackFinalizedInstance(
  instanceId: string,
  reason: string,
) {
  const { data, error } = await db.rpc('rollback_annual_review_completed', {
    p_instance_id: instanceId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

/** Patch eligibility-input values on the instance (used by HR pre-finalization). */
export async function updateEligibilityInputs(
  instanceId: string,
  inputs: Record<string, string | number | boolean>,
  remark?: string | null,
) {
  const patch: Record<string, unknown> = { eligibility_inputs: inputs };
  if (remark !== undefined) patch.eligibility_remark = remark && remark.trim() ? remark.trim() : null;
  const { data, error } = await db
    .from('annual_review_instances')
    .update(patch)
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

/**
 * Persist only the `system_scores` map on an instance. Used by HR to save
 * scores incrementally before all reviewer stages are locked (i.e. before
 * `finalizeInstance` is callable). Does NOT change status or final rating.
 */
export async function updateSystemScores(instanceId: string, systemScores: Record<string, number>) {
  const { error } = await db
    .from('annual_review_instances')
    .update({ system_scores: systemScores })
    .eq('id', instanceId);
  if (error) throw error;
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
  role: 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr';
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
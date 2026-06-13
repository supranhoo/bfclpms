import { supabase } from '@/integrations/supabase/client';
import type {
  AnnualReviewAssignmentRule,
  AnnualReviewCycle,
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewTemplate,
  AnnualReviewerRole,
  EvidenceItem,
} from '@/types/annualReview';

/**
 * Service layer for the Annual Review module — wraps every DB / RPC / storage call
 * so hooks and components never touch the supabase client directly. Casts to
 * `any` are used because the auto-generated `types.ts` regenerates on the next
 * migration approval; until then these tables are not yet in the typed schema.
 */

const BUCKET = 'review-evidence';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

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

export async function updateInstance(id: string, patch: Partial<AnnualReviewInstance>): Promise<AnnualReviewInstance> {
  const { data, error } = await db.from('annual_review_instances').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

/** Bulk-seed instances for an entire cycle. Resolves the snapshotted chain from profiles.reporting_manager_id. */
export async function seedInstancesForCycle(args: { cycleId: string; templateId: string; hrUserId: string | null }) {
  // Pull active, non-dummy employees and map two levels up (mgr → skip).
  const { data: people, error } = await db
    .from('profiles')
    .select('id, reporting_manager_id, functional_manager_id')
    .eq('is_active', true)
    .eq('is_dummy_employee', false);
  if (error) throw error;
  const map = new Map<string, { mgr: string | null; func: string | null }>();
  for (const p of people ?? []) map.set(p.id, { mgr: p.reporting_manager_id, func: p.functional_manager_id });

  const rows = (people ?? []).map((p: any) => {
    const mgr = map.get(p.id)?.mgr ?? null;
    const skip = mgr ? map.get(mgr)?.mgr ?? null : null;
    const bu = skip ? map.get(skip)?.mgr ?? null : null;
    return {
      employee_id: p.id,
      template_id: args.templateId,
      cycle_id: args.cycleId,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: bu,
      hr_id: args.hrUserId,
    };
  });

  // Upsert in chunks to stay under the wire limit.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: upErr } = await db
      .from('annual_review_instances')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'employee_id,cycle_id' });
    if (upErr) throw upErr;
  }
  return rows.length;
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
export async function seedInstancesByRules(args: { cycleId: string; hrUserId: string | null }) {
  const { data: rules, error: rulesErr } = await db
    .from('annual_review_assignment_rules')
    .select('id, template_id, priority, filters, is_active')
    .eq('cycle_id', args.cycleId)
    .eq('is_active', true)
    .order('priority', { ascending: true });
  if (rulesErr) throw rulesErr;
  if (!rules || rules.length === 0) throw new Error('No active rules — add a rule first.');

  const { data: people, error: pErr } = await db
    .from('profiles')
    .select('id, reporting_manager_id, functional_manager_id, designation, pms_grade, level, department_id')
    .eq('is_active', true)
    .eq('is_dummy_employee', false);
  if (pErr) throw pErr;

  // Department → BU lookup (one query, no per-row N+1).
  const deptIds = [...new Set((people ?? []).map((p: any) => p.department_id).filter(Boolean))];
  let deptToBu: Record<string, string> = {};
  if (deptIds.length) {
    const { data: depts, error: dErr } = await db
      .from('departments').select('id, business_unit_id').in('id', deptIds);
    if (dErr) throw dErr;
    deptToBu = Object.fromEntries((depts ?? []).map((d: any) => [d.id, d.business_unit_id]));
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
    const bu = skip ? mgrMap.get(skip) ?? null : null;
    rows.push({
      employee_id: p.id,
      template_id: rule.template_id,
      cycle_id: args.cycleId,
      assigned_rule_id: rule.id,
      manager_id: mgr,
      skip_id: skip,
      bu_head_id: bu,
      hr_id: args.hrUserId,
    });
  }

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: upErr } = await db
      .from('annual_review_instances')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'employee_id,cycle_id' });
    if (upErr) throw upErr;
  }
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
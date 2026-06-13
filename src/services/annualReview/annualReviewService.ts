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
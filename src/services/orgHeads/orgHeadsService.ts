import { supabase } from '@/integrations/supabase/client';

/**
 * Org Heads service. Wraps the BU-head / HR-head RPCs introduced for the
 * Annual Review reviewer-chain mapping. All writes are admin/hr_pms only and
 * audit-logged server-side.
 *
 * Resolver semantics: "head" = top of the reporting hierarchy among ACTIVE
 * employees in scope. See public.resolve_bu_head / public.resolve_hr_head.
 */

export type HeadSource = 'auto' | 'manual';

export interface BuHeadRow {
  id: string;
  name: string;
  code: string | null;
  head_user_id: string | null;
  head_source: HeadSource;
  head_updated_at: string | null;
  head_updated_by: string | null;
}

/** Department head row — same shape as BuHeadRow plus business_unit_id for context. */
export interface DeptHeadRow {
  id: string;
  name: string;
  code: string | null;
  business_unit_id: string | null;
  head_user_id: string | null;
  head_source: HeadSource;
  head_updated_at: string | null;
  head_updated_by: string | null;
}

export interface OrgHeadConfigRow {
  id: string;
  company_id: string | null;
  hr_business_unit_id: string | null;
  hr_head_user_id: string | null;
  hr_head_source: HeadSource;
  hr_head_updated_at: string | null;
  hr_head_updated_by: string | null;
}

export async function listBuHeads(): Promise<BuHeadRow[]> {
  const { data, error } = await supabase
    .from('business_units')
    .select('id, name, code, head_user_id, head_source, head_updated_at, head_updated_by')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BuHeadRow[];
}

export async function getOrgHeadConfig(companyId: string | null): Promise<OrgHeadConfigRow | null> {
  let q = supabase
    .from('org_head_config')
    .select('id, company_id, hr_business_unit_id, hr_head_user_id, hr_head_source, hr_head_updated_at, hr_head_updated_by');
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data ?? null) as OrgHeadConfigRow | null;
}

export async function setBuHead(buId: string, userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_bu_head' as any, {
    p_bu_id: buId, p_user_id: userId, p_reason: reason,
  });
  if (error) throw error;
}

export async function recalculateBuHead(buId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('recalculate_bu_head' as any, { p_bu_id: buId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function setHrDepartment(companyId: string | null, buId: string): Promise<void> {
  const { error } = await supabase.rpc('set_hr_department' as any, {
    p_company_id: companyId, p_bu_id: buId,
  });
  if (error) throw error;
}

export async function setHrHead(companyId: string | null, userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_hr_head' as any, {
    p_company_id: companyId, p_user_id: userId, p_reason: reason,
  });
  if (error) throw error;
}

export async function recalculateHrHead(companyId: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('recalculate_hr_head' as any, { p_company_id: companyId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// ---------- Department Heads (mirror of BU head pipeline) ----------

export async function listDepartmentHeads(): Promise<DeptHeadRow[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, code, business_unit_id, head_user_id, head_source, head_updated_at, head_updated_by')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeptHeadRow[];
}

export async function setDepartmentHead(deptId: string, userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('set_department_head' as any, {
    p_dept_id: deptId, p_user_id: userId, p_reason: reason,
  });
  if (error) throw error;
}

export async function recalculateDepartmentHead(deptId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('recalculate_department_head' as any, { p_dept_id: deptId });
  if (error) throw error;
  return (data as string | null) ?? null;
}
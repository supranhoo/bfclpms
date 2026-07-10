import { supabase } from '@/integrations/supabase/client';

export interface BulkExcludeResult { instance_id: string; status: string; message: string | null }
export interface BulkAddResult { employee_id: string; instance_id: string | null; status: string; message: string | null }
export interface BulkRemapResult { instance_id: string; status: string; message: string | null }

export async function excludeInstance(instanceId: string, reason: string) {
  const { data, error } = await supabase.rpc('exclude_annual_review_instance', {
    p_instance_id: instanceId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function restoreInstance(instanceId: string, reason: string) {
  const { data, error } = await supabase.rpc('restore_annual_review_instance', {
    p_instance_id: instanceId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function bulkExclude(instanceIds: string[], reason: string): Promise<BulkExcludeResult[]> {
  const { data, error } = await supabase.rpc('bulk_exclude_annual_review_instances', {
    p_instance_ids: instanceIds, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkExcludeResult[];
}

export async function bulkAdd(employeeIds: string[], cycleId: string): Promise<BulkAddResult[]> {
  const { data, error } = await supabase.rpc('bulk_create_annual_review_instances', {
    p_employee_ids: employeeIds, p_cycle_id: cycleId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkAddResult[];
}

export async function bulkRemap(
  instanceIds: string[], templateId: string, reason: string,
): Promise<BulkRemapResult[]> {
  const { data, error } = await supabase.rpc('bulk_set_annual_review_template_override', {
    p_instance_ids: instanceIds, p_template_id: templateId, p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkRemapResult[];
}

/**
 * Resolve employee codes → employee_id + existing instance_id (for the cycle).
 * Uses profiles + annual_review_instances left join. Codes not found are reported.
 */
export interface ResolvedCode {
  code: string;
  employee_id: string | null;
  full_name: string | null;
  instance_id: string | null;
  overall_status: string | null;
}

export async function resolveEmployeeCodes(
  codes: string[],
  cycleId: string,
): Promise<ResolvedCode[]> {
  const clean = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
  if (clean.length === 0) return [];
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, employee_code')
    .in('employee_code', clean);
  if (pErr) throw new Error(pErr.message);
  const empIds = (profs ?? []).map((p) => p.id);
  const instMap = new Map<string, { instance_id: string; overall_status: string }>();
  if (empIds.length > 0) {
    const { data: insts, error: iErr } = await supabase
      .from('annual_review_instances')
      .select('id, employee_id, overall_status')
      .eq('cycle_id', cycleId)
      .in('employee_id', empIds);
    if (iErr) throw new Error(iErr.message);
    (insts ?? []).forEach((i) => {
      instMap.set(i.employee_id, { instance_id: i.id, overall_status: i.overall_status });
    });
  }
  const byCode = new Map<string, { id: string; full_name: string | null }>();
  (profs ?? []).forEach((p) => {
    if (p.employee_code) byCode.set(p.employee_code, { id: p.id, full_name: p.full_name });
  });
  return clean.map((code) => {
    const prof = byCode.get(code);
    const inst = prof ? instMap.get(prof.id) : undefined;
    return {
      code,
      employee_id: prof?.id ?? null,
      full_name: prof?.full_name ?? null,
      instance_id: inst?.instance_id ?? null,
      overall_status: inst?.overall_status ?? null,
    };
  });
}

export function resultsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}
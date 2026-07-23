import { supabase } from '@/integrations/supabase/client';

export interface DirectoryEmployee {
  employee_id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  department_id: string | null;
  has_email: boolean;
  has_signed_in: boolean;
  instance_id: string | null;
  overall_status: string | null;
  in_my_queue: boolean;
  can_assist_this_employee?: boolean;
}

export interface SearchActiveEmployeesArgs {
  query: string;
  cycleId: string;
  limit?: number;
  offset?: number;
}

export async function searchActiveEmployeesForReview(
  args: SearchActiveEmployeesArgs,
): Promise<DirectoryEmployee[]> {
  if (!args.cycleId) return [];
  const { data, error } = await supabase.rpc('search_active_employees_for_review', {
    p_query: args.query ?? '',
    p_cycle_id: args.cycleId,
    p_limit: args.limit ?? 50,
    p_offset: args.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DirectoryEmployee[];
}

export async function createOrGetAnnualReviewInstance(
  employeeId: string,
  cycleId: string,
): Promise<{ instanceId: string; wasCreated: boolean }> {
  const { data, error } = await supabase.rpc('create_or_get_annual_review_instance', {
    p_employee_id: employeeId,
    p_cycle_id: cycleId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.instance_id) throw new Error('No instance returned');
  return { instanceId: row.instance_id as string, wasCreated: Boolean(row.was_created) };
}
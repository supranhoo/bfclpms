import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the HR head user id for a given company by reading
 * `business_units.head_user_id` of the BU named "HR" (case-insensitive)
 * within that company. The BU is matched via its division's company_id.
 *
 * Returns null if no such BU exists or the head is not configured.
 * This replaces the now-deprecated `org_head_config.hr_head_user_id` source.
 */
export async function getHrHeadUserId(companyId: string | null): Promise<string | null> {
  // Pull all BUs named "HR" with their division's company; filter in JS so we
  // don't depend on PostgREST embed filter syntax for the company match.
  const { data, error } = await supabase
    .from('business_units')
    .select('head_user_id, name, divisions:division_id(company_id)')
    .ilike('name', 'hr');
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    head_user_id: string | null;
    name: string;
    divisions: { company_id: string | null } | null;
  }>;
  const match = rows.find((r) => {
    if (!companyId) return true;
    return r.divisions?.company_id === companyId;
  });
  return match?.head_user_id ?? null;
}
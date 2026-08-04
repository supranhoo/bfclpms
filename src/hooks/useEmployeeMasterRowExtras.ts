/**
 * ADR-247 — Employee Master grid column parity.
 *
 * `get_reviewer_roster_slim` intentionally returns a narrow projection, so the
 * grid cannot render mobile number, portal access, location, category,
 * employment status or the joining dates. This hook hydrates those columns for
 * the CURRENT PAGE only (bounded by page size) plus the admin-defined custom
 * field values, so the cost stays constant regardless of roster size.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  GRID_EXTRA_PROFILE_SELECT,
} from '@/lib/employeeMasterColumns';
import type { CustomFieldValues } from '@/lib/employeeMasterCustomFields';

export interface EmployeeMasterExtras {
  mobile_number?: string | null;
  portal_access?: boolean | null;
  is_dummy_employee?: boolean | null;
  location_id?: string | null;
  employee_category?: string | null;
  employment_status?: string | null;
  group_doj?: string | null;
  doj?: string | null;
  confirmation_date?: string | null;
  custom?: CustomFieldValues;
}

export function useEmployeeMasterRowExtras(ids: string[], enabled = true) {
  const sortedIds = [...ids].sort();
  return useQuery({
    queryKey: ['employee-master-row-extras', sortedIds],
    enabled: enabled && sortedIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, EmployeeMasterExtras>> => {
      const [profRes, cfRes] = await Promise.all([
        (supabase as any).from('profiles').select(GRID_EXTRA_PROFILE_SELECT).in('id', sortedIds),
        (supabase as any)
          .from('employee_master_custom_field_values')
          .select('employee_id, values')
          .in('employee_id', sortedIds),
      ]);
      if (profRes.error) throw profRes.error;

      const map = new Map<string, EmployeeMasterExtras>();
      for (const row of profRes.data || []) {
        const { id, ...rest } = row as any;
        map.set(id, rest as EmployeeMasterExtras);
      }
      // Custom field values are best-effort — an RLS denial must not blank the grid.
      if (!cfRes.error) {
        for (const row of cfRes.data || []) {
          const existing = map.get((row as any).employee_id) || {};
          existing.custom = ((row as any).values as CustomFieldValues) || {};
          map.set((row as any).employee_id, existing);
        }
      }
      return map;
    },
  });
}

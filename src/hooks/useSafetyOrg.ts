import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Reuses PMS org tree (business_units + departments) per the Safety roadmap
 * decision: single source of truth for organisation, no parallel safety_*
 * org tables. (See .lovable/plan.md §13.)
 */

export interface BusinessUnitRow { id: string; name: string }
export interface DepartmentRow { id: string; name: string; business_unit_id: string | null }

export function useBusinessUnits() {
  return useQuery({
    queryKey: ['safety', 'org', 'business_units'],
    queryFn: async (): Promise<BusinessUnitRow[]> => {
      const { data, error } = await supabase
        .from('business_units')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDepartments(businessUnitId?: string | null) {
  return useQuery({
    queryKey: ['safety', 'org', 'departments', businessUnitId ?? 'all'],
    queryFn: async (): Promise<DepartmentRow[]> => {
      let q = supabase.from('departments').select('id, name, business_unit_id').order('name');
      if (businessUnitId) q = q.eq('business_unit_id', businessUnitId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DepartmentRow[];
    },
  });
}

export interface SafetyProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
}

/**
 * Standard label for a Safety user picker / display:
 *   "Full Name (EMP123)" when both present,
 *   "Full Name" when no code,
 *   "EMP123" when no name,
 *   email or id fallback.
 * Used across every Safety screen so the employee code is always visible
 * alongside the user's name.
 */
export function formatSafetyProfileLabel(
  p: Pick<SafetyProfileLite, 'full_name' | 'email' | 'employee_code' | 'id'> | null | undefined,
): string {
  if (!p) return '—';
  const name = p.full_name?.trim() || p.email?.trim() || p.id.slice(0, 8);
  const code = p.employee_code?.trim();
  return code ? `${name} (${code})` : name;
}

export function useActiveProfilesLite() {
  return useQuery({
    queryKey: ['safety', 'profiles', 'lite'],
    queryFn: async (): Promise<SafetyProfileLite[]> => {
      // Page through the profiles table so we are not silently capped by
      // PostgREST's default 1000-row limit on large organisations.
      const PAGE = 1000;
      const out: SafetyProfileLite[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, employee_code')
          .eq('is_active', true)
          .order('full_name')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data ?? [];
        for (const p of batch) {
          out.push({
            id: p.id,
            full_name: p.full_name,
            email: p.email,
            employee_code: p.employee_code,
          });
        }
        if (batch.length < PAGE) break;
      }
      return out;
    },
  });
}
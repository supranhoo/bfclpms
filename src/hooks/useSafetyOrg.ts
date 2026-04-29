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

export interface SafetyProfileLite { id: string; full_name: string | null; email: string | null }

export function useActiveProfilesLite() {
  return useQuery({
    queryKey: ['safety', 'profiles', 'lite'],
    queryFn: async (): Promise<SafetyProfileLite[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_active')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
      }));
    },
  });
}
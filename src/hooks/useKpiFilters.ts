import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPaged } from '@/lib/fetchAll';

export interface FilteredProfile {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  department_name?: string | null;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  division_id?: string | null;
  division_name?: string | null;
  manager_name?: string | null;
}

export type ReviewStatus = 'kra_set' | 'self_review' | 'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review' | 'approved';

export interface KpiFilterState {
  divisionId: string | null;
  businessUnitId: string | null;
  departmentId: string | null;
  managerId: string | null;
  employeeId: string | null;
  categoryId: string | null;
  status: ReviewStatus | null;
}

// Fetch profiles with full organization hierarchy
export function useProfilesWithHierarchy() {
  return useQuery({
    queryKey: ['profiles-hierarchy'],
    queryFn: async () => {
      // Paged fetch to bypass PostgREST's 1000-row default cap.
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            email,
            employee_code,
            department_id,
            reporting_manager_id,
            departments (
              id, 
              name, 
              business_unit_id,
              business_units (
                id,
                name,
                division_id,
                divisions (
                  id,
                  name
                )
              )
            )
          `)
          .order('full_name')
          .range(from, to)
      );

      // Flatten the hierarchy for easier access
      return data?.map(p => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        employee_code: p.employee_code,
        department_id: p.department_id,
        reporting_manager_id: p.reporting_manager_id,
        department_name: (p.departments as any)?.name || null,
        business_unit_id: (p.departments as any)?.business_unit_id || null,
        business_unit_name: (p.departments as any)?.business_units?.name || null,
        division_id: (p.departments as any)?.business_units?.division_id || null,
        division_name: (p.departments as any)?.business_units?.divisions?.name || null,
      })) as FilteredProfile[];
    },
  });
}

// Hook to get unique managers from profiles
export function useManagers() {
  const { data: profiles } = useProfilesWithHierarchy();
  
  return useMemo(() => {
    if (!profiles) return [];
    const managerIds = new Set(profiles.map(p => p.reporting_manager_id).filter(Boolean));
    return profiles.filter(p => managerIds.has(p.id));
  }, [profiles]);
}

// Main hook for cascading KPI filters
export function useKpiFilters() {
  const { effectiveRole } = useAuth();
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'auditor';
  
  const [filters, setFilters] = useState<KpiFilterState>({
    divisionId: null,
    businessUnitId: null,
    departmentId: null,
    managerId: null,
    employeeId: null,
    categoryId: null,
    status: null,
  });

  const { data: profiles, isLoading: loadingProfiles } = useProfilesWithHierarchy();
  
  // Get unique divisions from profiles
  const divisions = useMemo(() => {
    if (!profiles) return [];
    const divMap = new Map<string, { id: string; name: string }>();
    profiles.forEach(p => {
      if (p.division_id && p.division_name) {
        divMap.set(p.division_id, { id: p.division_id, name: p.division_name });
      }
    });
    return Array.from(divMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles]);

  // Get business units filtered by selected division
  const businessUnits = useMemo(() => {
    if (!profiles) return [];
    const buMap = new Map<string, { id: string; name: string; division_id: string }>();
    profiles.forEach(p => {
      if (p.business_unit_id && p.business_unit_name) {
        if (!filters.divisionId || p.division_id === filters.divisionId) {
          buMap.set(p.business_unit_id, { 
            id: p.business_unit_id, 
            name: p.business_unit_name,
            division_id: p.division_id || ''
          });
        }
      }
    });
    return Array.from(buMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, filters.divisionId]);

  // Get departments filtered by selected business unit
  const departments = useMemo(() => {
    if (!profiles) return [];
    const deptMap = new Map<string, { id: string; name: string; business_unit_id: string }>();
    profiles.forEach(p => {
      if (p.department_id && p.department_name) {
        const matchesBU = !filters.businessUnitId || p.business_unit_id === filters.businessUnitId;
        const matchesDiv = !filters.divisionId || p.division_id === filters.divisionId;
        if (matchesBU && matchesDiv) {
          deptMap.set(p.department_id, { 
            id: p.department_id, 
            name: p.department_name,
            business_unit_id: p.business_unit_id || ''
          });
        }
      }
    });
    return Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [profiles, filters.divisionId, filters.businessUnitId]);

  // Get managers (employees who have reportees)
  const managers = useMemo(() => {
    if (!profiles) return [];
    const managerIds = new Set(profiles.map(p => p.reporting_manager_id).filter(Boolean));
    let filteredManagers = profiles.filter(p => managerIds.has(p.id));
    
    // Apply hierarchy filters
    if (filters.divisionId) {
      filteredManagers = filteredManagers.filter(m => m.division_id === filters.divisionId);
    }
    if (filters.businessUnitId) {
      filteredManagers = filteredManagers.filter(m => m.business_unit_id === filters.businessUnitId);
    }
    if (filters.departmentId) {
      filteredManagers = filteredManagers.filter(m => m.department_id === filters.departmentId);
    }
    
    return filteredManagers.sort((a, b) => 
      (a.full_name || a.email).localeCompare(b.full_name || b.email)
    );
  }, [profiles, filters.divisionId, filters.businessUnitId, filters.departmentId]);

  // Get employees filtered by all hierarchy levels
  const employees = useMemo(() => {
    if (!profiles) return [];
    let filtered = profiles;
    
    if (filters.divisionId) {
      filtered = filtered.filter(p => p.division_id === filters.divisionId);
    }
    if (filters.businessUnitId) {
      filtered = filtered.filter(p => p.business_unit_id === filters.businessUnitId);
    }
    if (filters.departmentId) {
      filtered = filtered.filter(p => p.department_id === filters.departmentId);
    }
    if (filters.managerId) {
      filtered = filtered.filter(p => p.reporting_manager_id === filters.managerId);
    }
    
    return filtered.sort((a, b) => 
      (a.full_name || a.email).localeCompare(b.full_name || b.email)
    );
  }, [profiles, filters.divisionId, filters.businessUnitId, filters.departmentId, filters.managerId]);

  // Update filter with cascading reset
  const updateFilter = useCallback((key: keyof KpiFilterState, value: string | null) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      
      // Cascade reset child filters when parent changes
      if (key === 'divisionId') {
        newFilters.businessUnitId = null;
        newFilters.departmentId = null;
        newFilters.managerId = null;
        newFilters.employeeId = null;
      } else if (key === 'businessUnitId') {
        newFilters.departmentId = null;
        newFilters.managerId = null;
        newFilters.employeeId = null;
      } else if (key === 'departmentId') {
        newFilters.managerId = null;
        newFilters.employeeId = null;
      } else if (key === 'managerId') {
        newFilters.employeeId = null;
      }
      
      return newFilters;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      divisionId: null,
      businessUnitId: null,
      departmentId: null,
      managerId: null,
      employeeId: null,
      categoryId: null,
      status: null,
    });
  }, []);

  // Get employee IDs that match current filters (for KPI filtering)
  const filteredEmployeeIds = useMemo(() => {
    if (filters.employeeId) return [filters.employeeId];
    return employees.map(e => e.id);
  }, [filters.employeeId, employees]);

  return {
    filters,
    updateFilter,
    resetFilters,
    divisions,
    businessUnits,
    departments,
    managers,
    employees,
    filteredEmployeeIds,
    isLoading: loadingProfiles,
    isAdmin,
  };
}

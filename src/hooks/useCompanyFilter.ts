import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import { useProfilesVersion } from '@/hooks/useProfilesVersion';

export interface CompanyOption {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean | null;
}

export function useCompanyFilter() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const profilesVersion = useProfilesVersion();

  // Fetch companies
  const { data: companiesData } = useQuery({
    queryKey: ['companies-for-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, code, is_default')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CompanyOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Stable reference for the fallback empty array so consumers that depend on
  // `companies` don't see a new reference on every render. See RCA in
  // POLICY → Operational Resilience (editable grids preserving user input).
  const companies = useMemo(() => companiesData ?? [], [companiesData]);

  // Build employee → company mapping via direct company_id OR department → BU → division → company chain
  const { data: mapData } = useQuery({
    queryKey: ['employee-company-map', profilesVersion],
    queryFn: async () => {
      // Paged fetches to bypass PostgREST's 1000-row default cap.
      const profiles = await fetchAllPaged<any>((from, to) =>
        supabase.from('profiles').select('id, department_id, company_id, employee_code').range(from, to)
      );
      const departments = await fetchAllPaged<any>((from, to) =>
        supabase.from('departments').select('id, business_unit_id').range(from, to)
      );
      const bus = await fetchAllPaged<any>((from, to) =>
        supabase.from('business_units').select('id, division_id').range(from, to)
      );
      const divs = await fetchAllPaged<any>((from, to) =>
        supabase.from('divisions').select('id, company_id').range(from, to)
      );

      const deptToBu = new Map(departments?.map(d => [d.id, d.business_unit_id]) ?? []);
      const buToDiv = new Map(bus?.map(b => [b.id, b.division_id]) ?? []);
      const divToCompany = new Map(divs?.map(d => [d.id, d.company_id]) ?? []);

      const companyMap = new Map<string, string>();
      const codeToIdMap = new Map<string, string>();

      (profiles ?? []).forEach(p => {
        if ((p as any).employee_code) {
          codeToIdMap.set((p as any).employee_code, p.id);
        }
        if ((p as any).company_id) {
          companyMap.set(p.id, (p as any).company_id);
          return;
        }
        if (!p.department_id) return;
        const buId = deptToBu.get(p.department_id);
        if (!buId) return;
        const divId = buToDiv.get(buId);
        if (!divId) return;
        const companyId = divToCompany.get(divId);
        if (companyId) companyMap.set(p.id, companyId);
      });

      return { companyMap, codeToIdMap };
    },
    staleTime: 10 * 60 * 1000,
  });

  const employeeCompanyMap = useMemo(() => mapData?.companyMap ?? new Map<string, string>(), [mapData]);
  const codeToIdMap = useMemo(() => mapData?.codeToIdMap ?? new Map<string, string>(), [mapData]);

  const companyEmployeeIds = useMemo(() => {
    if (selectedCompanyId === 'all' || !employeeCompanyMap.size) return null;
    const ids = new Set<string>();
    employeeCompanyMap.forEach((companyId, empId) => {
      if (companyId === selectedCompanyId) ids.add(empId);
    });
    return ids;
  }, [selectedCompanyId, employeeCompanyMap]);

  // All public helpers below are wrapped in useCallback so consumers can use
  // them in useEffect / useMemo dependency arrays without triggering a reseed
  // on every render. Removing the useCallback wrappers caused unsaved cells in
  // Incentive data-entry grids to be wiped (RCA 2026-06-25).
  const filterByCompany = useCallback(
    (employeeId: string | undefined | null): boolean => {
      if (selectedCompanyId === 'all' || !companyEmployeeIds) return true;
      if (!employeeId) return false;
      return companyEmployeeIds.has(employeeId);
    },
    [selectedCompanyId, companyEmployeeIds],
  );

  const getCompanyName = useCallback(
    (employeeId: string): string => {
      const companyId = employeeCompanyMap.get(employeeId);
      if (!companyId) return '';
      return companies.find(c => c.id === companyId)?.name ?? '';
    },
    [companies, employeeCompanyMap],
  );

  const getCompanyCode = useCallback(
    (employeeId: string): string => {
      const companyId = employeeCompanyMap.get(employeeId);
      if (!companyId) return '';
      return companies.find(c => c.id === companyId)?.code ?? '';
    },
    [companies, employeeCompanyMap],
  );

  const getCompanyCodeByEmpCode = useCallback(
    (empCode: string): string => {
      const empId = codeToIdMap.get(empCode);
      if (!empId) return '';
      const companyId = employeeCompanyMap.get(empId);
      if (!companyId) return '';
      return companies.find(c => c.id === companyId)?.code ?? '';
    },
    [codeToIdMap, companies, employeeCompanyMap],
  );

  return {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    companyEmployeeIds,
    filterByCompany,
    getCompanyName,
    getCompanyCode,
    getCompanyCodeByEmpCode,
    employeeCompanyMap,
  };
}

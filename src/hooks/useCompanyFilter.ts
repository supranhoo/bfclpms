import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyOption {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean | null;
}

export function useCompanyFilter() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');

  // Fetch companies
  const { data: companies } = useQuery({
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

  // Build employee → company mapping via direct company_id OR department → BU → division → company chain
  const { data: employeeCompanyMap } = useQuery({
    queryKey: ['employee-company-map'],
    queryFn: async () => {
      // Fetch all profiles with department_id and company_id
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, department_id, company_id, employee_code');
      if (pErr) throw pErr;

      // Fetch departments → BU
      const { data: departments, error: dErr } = await supabase
        .from('departments')
        .select('id, business_unit_id');
      if (dErr) throw dErr;

      // Fetch BUs → division
      const { data: bus, error: bErr } = await supabase
        .from('business_units')
        .select('id, division_id');
      if (bErr) throw bErr;

      // Fetch divisions → company
      const { data: divs, error: divErr } = await supabase
        .from('divisions')
        .select('id, company_id');
      if (divErr) throw divErr;

      // Build lookup maps
      const deptToBu = new Map(departments?.map(d => [d.id, d.business_unit_id]) ?? []);
      const buToDiv = new Map(bus?.map(b => [b.id, b.division_id]) ?? []);
      const divToCompany = new Map(divs?.map(d => [d.id, d.company_id]) ?? []);

      // Build employee → company map and employee_code → employee_id map
      const map = new Map<string, string>();
      const codeToIdMap = new Map<string, string>();
      (profiles ?? []).forEach(p => {
        if ((p as any).employee_code) {
          codeToIdMap.set((p as any).employee_code, p.id);
        }
        // Priority 1: Direct company_id on profile
        if ((p as any).company_id) {
          map.set(p.id, (p as any).company_id);
          return;
        }
        // Priority 2: Derive from department chain
        if (!p.department_id) return;
        const buId = deptToBu.get(p.department_id);
        if (!buId) return;
        const divId = buToDiv.get(buId);
        if (!divId) return;
        const companyId = divToCompany.get(divId);
        if (companyId) map.set(p.id, companyId);
      });

      return { companyMap: map, codeToIdMap };
    },
    staleTime: 10 * 60 * 1000,
  });

  // Set of employee IDs for the selected company
  const companyEmployeeIds = useMemo(() => {
    if (selectedCompanyId === 'all' || !employeeCompanyMap) return null;
    const ids = new Set<string>();
    employeeCompanyMap.forEach((companyId, empId) => {
      if (companyId === selectedCompanyId) ids.add(empId);
    });
    return ids;
  }, [selectedCompanyId, employeeCompanyMap]);

  // Filter function: returns true if employee passes the company filter
  const filterByCompany = (employeeId: string | undefined | null): boolean => {
    if (selectedCompanyId === 'all' || !companyEmployeeIds) return true;
    if (!employeeId) return false;
    return companyEmployeeIds.has(employeeId);
  };

  // Get company name for an employee
  const getCompanyName = (employeeId: string): string => {
    if (!employeeCompanyMap || !companies) return '';
    const companyId = employeeCompanyMap.get(employeeId);
    if (!companyId) return '';
    return companies.find(c => c.id === companyId)?.name ?? '';
  };

  // Get company code for an employee
  const getCompanyCode = (employeeId: string): string => {
    if (!employeeCompanyMap || !companies) return '';
    const companyId = employeeCompanyMap.get(employeeId);
    if (!companyId) return '';
    return companies.find(c => c.id === companyId)?.code ?? '';
  };

  return {
    companies: companies ?? [],
    selectedCompanyId,
    setSelectedCompanyId,
    companyEmployeeIds,
    filterByCompany,
    getCompanyName,
    getCompanyCode,
    employeeCompanyMap: employeeCompanyMap ?? new Map<string, string>(),
  };
}

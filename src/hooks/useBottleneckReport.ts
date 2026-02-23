import { useMemo, useState } from 'react';
import { useAllKpis } from '@/hooks/useKpis';
import { useDepartments, useDivisions, useBusinessUnits } from '@/hooks/useOrganization';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type StageKey = 'kra_set' | 'self_review' | 'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review';

export const STAGE_LABELS: Record<StageKey, string> = {
  kra_set: 'KRA Set (Not Started)',
  self_review: 'Awaiting Self Review',
  manager_check: 'Awaiting Manager Review',
  skip_level_check: 'Awaiting Skip-Level Review',
  hr_pms_review: 'Awaiting HR PMS Review',
  audit: 'Awaiting Auditor Review',
  management_review: 'Awaiting Management Review',
};

export const ALL_STAGES = Object.keys(STAGE_LABELS) as StageKey[];

export interface BottleneckRow {
  kpiId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  departmentId: string | null;
  kpiName: string;
  kraName: string;
  period: string;
  year: number | null;
  currentStage: string;
  stageKey: StageKey;
  responsiblePerson: string;
  daysPending: number;
  lastUpdated: string;
}

function getResponsiblePerson(
  stageKey: StageKey,
  employeeName: string,
  managerName: string | null,
): string {
  switch (stageKey) {
    case 'kra_set':
    case 'self_review':
      return employeeName;
    case 'manager_check':
      return managerName || 'Reporting Manager';
    case 'skip_level_check':
      return 'Skip-Level Manager';
    case 'hr_pms_review':
      return 'HR PMS';
    case 'audit':
      return 'Auditor';
    case 'management_review':
      return 'Management';
    default:
      return '-';
  }
}

export function useBottleneckReport() {
  const { data: allKpis, isLoading: kpisLoading } = useAllKpis();
  const { data: departments } = useDepartments();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();

  // Fetch all profiles for manager name lookup
  const { data: profilesMap } = useQuery({
    queryKey: ['profiles-map-bottleneck'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id, reporting_manager_id');
      const map = new Map<string, { full_name: string; employee_code: string; department_id: string | null; reporting_manager_id: string | null }>();
      data?.forEach(p => map.set(p.id, p));
      return map;
    },
  });

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Build department lookup
  const deptMap = useMemo(() => {
    const m = new Map<string, { name: string; businessUnitId: string | null }>();
    departments?.forEach(d => m.set(d.id, { name: d.name, businessUnitId: d.business_unit_id }));
    return m;
  }, [departments]);

  const buMap = useMemo(() => {
    const m = new Map<string, { name: string; divisionId: string | null }>();
    businessUnits?.forEach(bu => m.set(bu.id, { name: bu.name, divisionId: bu.division_id }));
    return m;
  }, [businessUnits]);

  // Process all non-approved KPIs into bottleneck rows
  const allRows = useMemo(() => {
    if (!allKpis || !profilesMap) return [];

    return allKpis
      .filter(kpi => kpi.status !== 'approved')
      .map((kpi): BottleneckRow | null => {
        const stageKey = kpi.status as StageKey;
        if (!STAGE_LABELS[stageKey]) return null;

        const profile = kpi.profiles as { id?: string; full_name?: string; employee_code?: string; department_id?: string; reporting_manager_id?: string } | null;
        const employeeName = profile?.full_name || 'Unknown';
        const employeeCode = profile?.employee_code || '-';
        const deptId = profile?.department_id || null;
        const deptInfo = deptId ? deptMap.get(deptId) : null;
        const managerId = profile?.reporting_manager_id;
        const managerProfile = managerId ? profilesMap.get(managerId) : null;

        const daysPending = Math.floor((Date.now() - new Date(kpi.updated_at).getTime()) / 86400000);

        return {
          kpiId: kpi.id,
          employeeCode,
          employeeName,
          departmentName: deptInfo?.name || '-',
          departmentId: deptId,
          kpiName: kpi.kpi_name,
          kraName: kpi.kra_name,
          period: kpi.review_period || '-',
          year: kpi.review_year,
          currentStage: STAGE_LABELS[stageKey],
          stageKey,
          responsiblePerson: getResponsiblePerson(stageKey, employeeName, managerProfile?.full_name || null),
          daysPending,
          lastUpdated: kpi.updated_at,
        };
      })
      .filter(Boolean) as BottleneckRow[];
  }, [allKpis, profilesMap, deptMap]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = allRows;

    if (selectedYear !== 'all') {
      rows = rows.filter(r => String(r.year) === selectedYear);
    }
    if (selectedPeriod !== 'all') {
      rows = rows.filter(r => r.period === selectedPeriod);
    }
    if (selectedDepartment !== 'all') {
      rows = rows.filter(r => r.departmentId === selectedDepartment);
    }
    if (selectedDivision !== 'all') {
      rows = rows.filter(r => {
        if (!r.departmentId) return false;
        const dept = deptMap.get(r.departmentId);
        if (!dept?.businessUnitId) return false;
        const bu = buMap.get(dept.businessUnitId);
        return bu?.divisionId === selectedDivision;
      });
    }
    if (selectedBusinessUnit !== 'all') {
      rows = rows.filter(r => {
        if (!r.departmentId) return false;
        const dept = deptMap.get(r.departmentId);
        return dept?.businessUnitId === selectedBusinessUnit;
      });
    }
    if (selectedStage !== 'all') {
      rows = rows.filter(r => r.stageKey === selectedStage);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.kpiName.toLowerCase().includes(q)
      );
    }

    return rows.sort((a, b) => b.daysPending - a.daysPending);
  }, [allRows, selectedYear, selectedPeriod, selectedDepartment, selectedDivision, selectedBusinessUnit, selectedStage, searchQuery, deptMap, buMap]);

  // Summary stats
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const selfReview = filteredRows.filter(r => r.stageKey === 'self_review').length;
    const manager = filteredRows.filter(r => r.stageKey === 'manager_check').length;
    const auditMgmt = filteredRows.filter(r => r.stageKey === 'audit' || r.stageKey === 'management_review').length;
    const avgDays = total > 0 ? Math.round(filteredRows.reduce((s, r) => s + r.daysPending, 0) / total) : 0;
    return { total, selfReview, manager, auditMgmt, avgDays };
  }, [filteredRows]);

  // Chart data: stage distribution by department
  const chartData = useMemo(() => {
    const deptStageMap = new Map<string, Record<string, number>>();
    filteredRows.forEach(r => {
      const dept = r.departmentName;
      if (!deptStageMap.has(dept)) {
        deptStageMap.set(dept, {});
      }
      const entry = deptStageMap.get(dept)!;
      entry[r.stageKey] = (entry[r.stageKey] || 0) + 1;
    });

    return Array.from(deptStageMap.entries())
      .map(([dept, stages]) => ({ department: dept, ...stages }))
      .sort((a, b) => {
        const totalA = ALL_STAGES.reduce((s, k) => s + ((a as any)[k] || 0), 0);
        const totalB = ALL_STAGES.reduce((s, k) => s + ((b as any)[k] || 0), 0);
        return totalB - totalA;
      })
      .slice(0, 15);
  }, [filteredRows]);

  // Available years and periods
  const availableYears = useMemo(() => {
    const years = new Set(allRows.map(r => r.year).filter(Boolean));
    return Array.from(years).sort((a, b) => (b || 0) - (a || 0));
  }, [allRows]);

  const availablePeriods = useMemo(() => {
    const periods = new Set(allRows.map(r => r.period).filter(p => p !== '-'));
    return Array.from(periods).sort();
  }, [allRows]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: paginatedRows,
    allFilteredRows: filteredRows,
    stats,
    chartData,
    isLoading: kpisLoading,
    // Filters
    selectedYear, setSelectedYear,
    selectedPeriod, setSelectedPeriod,
    selectedDepartment, setSelectedDepartment,
    selectedDivision, setSelectedDivision,
    selectedBusinessUnit, setSelectedBusinessUnit,
    selectedStage, setSelectedStage,
    searchQuery, setSearchQuery,
    // Filter options
    departments: departments || [],
    divisions: divisions || [],
    businessUnits: businessUnits || [],
    availableYears,
    availablePeriods,
    // Pagination
    page, setPage, totalPages, pageSize,
  };
}

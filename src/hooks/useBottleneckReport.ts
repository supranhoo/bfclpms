import { useMemo, useState } from 'react';
import { useAllKpis } from '@/hooks/useKpis';
import { useDepartments, useDivisions, useBusinessUnits } from '@/hooks/useOrganization';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type StageKey = 'kra_set' | 'self_review' | 'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review';

export const STAGE_LABELS: Record<StageKey, string> = {
  kra_set: 'KRA Set (Awaiting Start)',
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
  responsibleRole: string;
  daysPending: number;
  lastUpdated: string;
}

export interface TopHolder {
  name: string;
  role: string;
  totalPending: number;
  criticalCount: number;
  avgDays: number;
}

export interface UrgencyStats {
  green: number;
  amber: number;
  red: number;
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

function getResponsibleRole(stageKey: StageKey): string {
  switch (stageKey) {
    case 'kra_set':
    case 'self_review': return 'Employee';
    case 'manager_check': return 'Manager';
    case 'skip_level_check': return 'Skip-Level';
    case 'hr_pms_review': return 'HR PMS';
    case 'audit': return 'Auditor';
    case 'management_review': return 'Management';
    default: return '-';
  }
}

export function useBottleneckReport() {
  const { data: allKpis, isLoading: kpisLoading } = useAllKpis();
  const { data: departments } = useDepartments();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();

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
  const [monthWindowStart, setMonthWindowStart] = useState(0);
  const [employeeChartDepartment, setEmployeeChartDepartment] = useState<string>('all');

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
      .filter(kpi => kpi.status !== 'approved' && (kpi as any).is_issued !== false)
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
          responsibleRole: getResponsibleRole(stageKey),
          daysPending,
          lastUpdated: kpi.updated_at,
        };
      })
      .filter(Boolean) as BottleneckRow[];
  }, [allKpis, profilesMap, deptMap]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = allRows;

    if (selectedYear !== 'all') rows = rows.filter(r => String(r.year) === selectedYear);
    if (selectedPeriod !== 'all') rows = rows.filter(r => r.period === selectedPeriod);
    if (selectedDepartment !== 'all') rows = rows.filter(r => r.departmentId === selectedDepartment);
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
    if (selectedStage !== 'all') rows = rows.filter(r => r.stageKey === selectedStage);
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

  // Summary stats (expanded with KRA Set, Audit, Management split)
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const kraSet = filteredRows.filter(r => r.stageKey === 'kra_set').length;
    const selfReview = filteredRows.filter(r => r.stageKey === 'self_review').length;
    const manager = filteredRows.filter(r => r.stageKey === 'manager_check').length;
    const skipLevel = filteredRows.filter(r => r.stageKey === 'skip_level_check').length;
    const hrPms = filteredRows.filter(r => r.stageKey === 'hr_pms_review').length;
    const audit = filteredRows.filter(r => r.stageKey === 'audit').length;
    const management = filteredRows.filter(r => r.stageKey === 'management_review').length;
    const avgDays = total > 0 ? Math.round(filteredRows.reduce((s, r) => s + r.daysPending, 0) / total) : 0;
    return { total, kraSet, selfReview, manager, skipLevel, hrPms, audit, management, avgDays };
  }, [filteredRows]);

  // Urgency stats (3/5/7 day thresholds)
  const urgencyStats = useMemo((): UrgencyStats => {
    let green = 0, amber = 0, red = 0;
    filteredRows.forEach(r => {
      if (r.daysPending <= 3) green++;
      else if (r.daysPending <= 5) amber++;
      else red++;
    });
    return { green, amber, red };
  }, [filteredRows]);

  // Top bottleneck holders
  const topHolders = useMemo((): TopHolder[] => {
    const holderMap = new Map<string, { role: string; days: number[]; critical: number }>();
    filteredRows.forEach(r => {
      const key = r.responsiblePerson;
      if (!holderMap.has(key)) {
        holderMap.set(key, { role: r.responsibleRole, days: [], critical: 0 });
      }
      const entry = holderMap.get(key)!;
      entry.days.push(r.daysPending);
      if (r.daysPending >= 7) entry.critical++;
    });

    return Array.from(holderMap.entries())
      .map(([name, data]) => ({
        name,
        role: data.role,
        totalPending: data.days.length,
        criticalCount: data.critical,
        avgDays: Math.round(data.days.reduce((a, b) => a + b, 0) / data.days.length),
      }))
      .sort((a, b) => b.criticalCount - a.criticalCount || b.totalPending - a.totalPending);
  }, [filteredRows]);

  // Chart data
  const chartData = useMemo(() => {
    const deptStageMap = new Map<string, Record<string, number>>();
    filteredRows.forEach(r => {
      const dept = r.departmentName;
      if (!deptStageMap.has(dept)) deptStageMap.set(dept, {});
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

  const availableYears = useMemo(() => {
    const years = new Set(allRows.map(r => r.year).filter(Boolean));
    return Array.from(years).sort((a, b) => (b || 0) - (a || 0));
  }, [allRows]);

  const availablePeriods = useMemo(() => {
    const periods = new Set(allRows.map(r => r.period).filter(p => p !== '-'));
    return Array.from(periods).sort();
  }, [allRows]);

  // Available months for tile navigation (newest first)
  const availableMonths = useMemo(() => {
    const monthSet = new Map<string, { label: string; period: string; year: string }>();
    allRows.forEach(r => {
      if (r.period === '-' || !r.year) return;
      const key = `${r.period}-${r.year}`;
      if (!monthSet.has(key)) {
        const shortLabel = r.period.substring(0, 3) + ' ' + r.year;
        monthSet.set(key, { label: shortLabel, period: r.period, year: String(r.year) });
      }
    });
    return Array.from(monthSet.values()).sort((a, b) => {
      const yDiff = Number(b.year) - Number(a.year);
      if (yDiff !== 0) return yDiff;
      return b.period.localeCompare(a.period);
    });
  }, [allRows]);

  // Departments that actually have pending KPIs (for employee chart filter)
  const employeeChartDepartments = useMemo(() => {
    const deptSet = new Map<string, string>();
    filteredRows.forEach(r => {
      if (r.departmentId && r.departmentName !== '-') {
        deptSet.set(r.departmentId, r.departmentName);
      }
    });
    return Array.from(deptSet.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows]);

  // Employee chart data (with its own department filter)
  const employeeChartData = useMemo(() => {
    let rows = filteredRows;
    if (employeeChartDepartment !== 'all') {
      rows = rows.filter(r => r.departmentId === employeeChartDepartment);
    }

    const empMap = new Map<string, Record<string, number>>();
    rows.forEach(r => {
      const key = r.employeeName;
      if (!empMap.has(key)) empMap.set(key, {});
      const entry = empMap.get(key)!;
      entry[r.stageKey] = (entry[r.stageKey] || 0) + 1;
    });

    return Array.from(empMap.entries())
      .map(([employee, stages]) => ({ employee, ...stages }))
      .sort((a, b) => {
        const totalA = ALL_STAGES.reduce((s, k) => s + ((a as any)[k] || 0), 0);
        const totalB = ALL_STAGES.reduce((s, k) => s + ((b as any)[k] || 0), 0);
        return totalB - totalA;
      })
      .slice(0, 15);
  }, [filteredRows, employeeChartDepartment]);

  const totalPages = Math.ceil(filteredRows.length / pageSize);
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: paginatedRows,
    allFilteredRows: filteredRows,
    stats,
    urgencyStats,
    topHolders,
    chartData,
    isLoading: kpisLoading,
    selectedYear, setSelectedYear,
    selectedPeriod, setSelectedPeriod,
    selectedDepartment, setSelectedDepartment,
    selectedDivision, setSelectedDivision,
    selectedBusinessUnit, setSelectedBusinessUnit,
    selectedStage, setSelectedStage,
    searchQuery, setSearchQuery,
    departments: departments || [],
    divisions: divisions || [],
    businessUnits: businessUnits || [],
    availableYears,
    availablePeriods,
    availableMonths,
    monthWindowStart, setMonthWindowStart,
    employeeChartData, employeeChartDepartment, setEmployeeChartDepartment, employeeChartDepartments,
    page, setPage, totalPages, pageSize,
  };
}

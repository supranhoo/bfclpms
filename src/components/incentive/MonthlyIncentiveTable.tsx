import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Download, CheckCircle2, DollarSign, Calculator, Loader2, Users, ShieldAlert, Clock, IndianRupee, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIncentiveRecords, useConfirmIncentiveRecords, useMarkIncentivePaid, useComputeIncentives, useIncentiveReportData, useEmployeeKpiStatusForPeriod } from '@/hooks/useIncentiveRecords';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import { useIncentiveProgramMappingCount, useIncentiveProgramMappedEmployeeIds } from '@/hooks/useIncentiveProgramMappingCount';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { useAuth } from '@/contexts/AuthContext';
import { IncentiveDryRunDialog } from './IncentiveDryRunDialog';
import { IncentiveStatusOverride } from './IncentiveStatusOverride';
import { RatingBadge } from '@/components/ui/RatingBadge';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const INC_DEFAULT_FIELDS = [
  { field_key: 'employee_code',            default_label: 'Employee Code',            default_sort: 10,  is_required: true },
  { field_key: 'employee_name',            default_label: 'Employee Name',            default_sort: 20,  is_required: true },
  { field_key: 'designation',              default_label: 'Designation',              default_sort: 30 },
  { field_key: 'department',               default_label: 'Department',               default_sort: 40 },
  { field_key: 'business_unit',            default_label: 'Business Unit',            default_sort: 50 },
  { field_key: 'division',                 default_label: 'Division',                 default_sort: 60 },
  { field_key: 'month',                    default_label: 'Month',                    default_sort: 70 },
  { field_key: 'year',                     default_label: 'Year',                     default_sort: 80 },
  { field_key: 'period',                   default_label: 'Period',                   default_sort: 90 },
  { field_key: 'programme_name',           default_label: 'Programme Name',           default_sort: 100 },
  { field_key: 'pms_score',                default_label: 'PMS Score',                default_sort: 110 },
  { field_key: 'slab_range',               default_label: 'Slab Range',               default_sort: 120 },
  { field_key: 'slab_rating',              default_label: 'Slab Rating',              default_sort: 130 },
  { field_key: 'base_incentive_percent',   default_label: 'Base Incentive %',         default_sort: 140 },
  { field_key: 'is_disqualified',          default_label: 'Is Disqualified',          default_sort: 150 },
  { field_key: 'dq_reasons',               default_label: 'DQ Reasons',               default_sort: 160 },
  { field_key: 'lti_penalty_percent',      default_label: 'LTI Penalty %',            default_sort: 170 },
  { field_key: 'pro_rata_factor',          default_label: 'Pro-rata Factor',          default_sort: 180 },
  { field_key: 'production_value',         default_label: 'Production Value',         default_sort: 190 },
  { field_key: 'original_score',           default_label: 'Original Score',           default_sort: 200 },
  { field_key: 'adjusted_score',           default_label: 'Adjusted Score',           default_sort: 210 },
  { field_key: 'final_incentive_percent',  default_label: 'Final Incentive %',        default_sort: 220 },
  { field_key: 'incentive_amount',         default_label: 'Incentive Amount',         default_sort: 230, is_required: true },
  { field_key: 'incentive_status',         default_label: 'Incentive Status',         default_sort: 240 },
  { field_key: 'record_status',            default_label: 'Record Status',            default_sort: 250 },
  { field_key: 'incentive_base',           default_label: 'Incentive Base',           default_sort: 260 },
  { field_key: 'retroactive_adjustment',   default_label: 'Retroactive Adjustment',   default_sort: 270 },
  { field_key: 'adjustment_source_period', default_label: 'Adjustment Source Period', default_sort: 280 },
  { field_key: 'computed_at',              default_label: 'Computed At',              default_sort: 290 },
  { field_key: 'confirmed_by',             default_label: 'Confirmed By',             default_sort: 300 },
] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = Array.from({ length: 5 }, (_, i) => String(2024 + i));

export function MonthlyIncentiveTable() {
  const { user } = useAuth();
  const resolvedIncFields = useResolvedReportFields('RPT-INC-001', INC_DEFAULT_FIELDS);
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentDate.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(String(currentDate.getFullYear()));
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [incentiveStatusFilter, setIncentiveStatusFilter] = useState<string>('all');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>('all');
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [employeeNameMap, setEmployeeNameMap] = useState<Map<string, { name: string; code: string }>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllRecords, setSelectAllRecords] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const { companies, employeeCompanyMap } = useCompanyFilter();
  const companyNameToId = useMemo(() => new Map(companies.map(c => [c.name, c.id])), [companies]);
  const companyIdToName = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
  const selectedCompanyNames = useMemo(
    () => selectedCompanyIds.map(id => companyIdToName.get(id)).filter(Boolean) as string[],
    [selectedCompanyIds, companyIdToName]
  );

  const { data: programs = [] } = useIncentivePrograms();
  const activePrograms = (programs as any[]).filter((p: any) => p.is_active);

  const isAllMode = selectedMonth === 'all' || selectedYear === 'all';

  const { data: standardRecords = [], isLoading: stdLoading, isError: stdError, error: stdErrorObj } = useIncentiveRecords(
    isAllMode ? undefined : selectedMonth,
    isAllMode ? undefined : Number(selectedYear),
    selectedProgram !== 'all' ? selectedProgram : undefined
  );

  const { data: batchedRecords, isLoading: batchLoading } = useIncentiveReportData({
    month: selectedMonth,
    year: selectedYear,
    programId: selectedProgram,
  });

  const records = isAllMode ? (batchedRecords || []) : standardRecords;
  const isLoading = isAllMode ? batchLoading : stdLoading;
  const isError = !isAllMode && stdError;
  const error = stdErrorObj;

  const confirmRecords = useConfirmIncentiveRecords();
  const markPaid = useMarkIncentivePaid();
  const computeIncentives = useComputeIncentives();
  const { data: mappedEmployeeCount = 0 } = useIncentiveProgramMappingCount(
    selectedProgram !== 'all' ? selectedProgram : undefined
  );
  const { data: mappedEmployeeIds = [] } = useIncentiveProgramMappedEmployeeIds(
    selectedProgram !== 'all' ? selectedProgram : undefined
  );
  const selectedProgramName = useMemo(
    () => (activePrograms.find((p: any) => p.id === selectedProgram)?.name) || 'this programme',
    [activePrograms, selectedProgram]
  );

  // Filter-aware scope: mapped employees ∩ selected companies
  const scopedEmployeeIds = useMemo(() => {
    if (!mappedEmployeeIds.length) return [] as string[];
    if (selectedCompanyIds.length === 0) return mappedEmployeeIds;
    const companySet = new Set(selectedCompanyIds);
    return mappedEmployeeIds.filter(id => {
      const c = employeeCompanyMap.get(id);
      return c && companySet.has(c);
    });
  }, [mappedEmployeeIds, selectedCompanyIds, employeeCompanyMap]);

  const filteredMappedCount = scopedEmployeeIds.length;
  const scopeText = useMemo(() => {
    const parts: string[] = [`${selectedMonth} ${selectedYear}`];
    if (selectedCompanyNames.length > 0) parts.push(`Company: ${selectedCompanyNames.join(', ')}`);
    if (periodFilter !== 'all') parts.push(`Period: ${periodFilter}`);
    return parts.join(' · ');
  }, [selectedMonth, selectedYear, selectedCompanyNames, periodFilter]);

  const buildScope = () => ({
    employee_ids: selectedCompanyIds.length > 0 ? scopedEmployeeIds : [],
    // 'Full Month' is a derived UI view → compute all sub-periods (null scope)
    payment_period: periodFilter !== 'all' && periodFilter !== 'Full Month' ? periodFilter : null,
  });

  const canComputeNow = selectedProgram !== 'all' && !isAllMode && filteredMappedCount > 0;
  const handleComputeNow = () => {
    if (!canComputeNow) return;
    computeIncentives.mutate({
      review_period: selectedMonth,
      review_year: Number(selectedYear),
      program_id: selectedProgram,
      scope: buildScope(),
    });
  };

  // Reset selection and page when filters change
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllRecords(false);
    setCurrentPage(1);
  }, [selectedMonth, selectedYear, selectedProgram, statusFilter, incentiveStatusFilter, eligibilityFilter, periodFilter, searchTerm, selectedCompanyIds]);

  const filteredRecords = useMemo(() => {
    const companyIdSet = selectedCompanyIds.length > 0 ? new Set(selectedCompanyIds) : null;
    return (records as any[]).filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (incentiveStatusFilter !== 'all' && r.incentive_status !== incentiveStatusFilter) return false;
      if (eligibilityFilter === 'eligible' && r.is_disqualified) return false;
      if (eligibilityFilter === 'disqualified' && !r.is_disqualified) return false;
      if (eligibilityFilter === 'prorata' && r.pro_rata_factor >= 1) return false;
      if (periodFilter !== 'all') {
        // 'Full Month' is a derived aggregation: include sub-period production rows AND legacy 'Full Month' rows
        if (periodFilter === 'Full Month') {
          if (!['1-10', '11-20', '21-31', 'Full Month'].includes(r.payment_period)) return false;
        } else if (r.payment_period !== periodFilter) {
          return false;
        }
      }
      if (companyIdSet) {
        const empCompanyId = employeeCompanyMap.get(r.employee_id);
        if (!empCompanyId || !companyIdSet.has(empCompanyId)) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = r.profiles?.full_name?.toLowerCase() || '';
        const code = r.profiles?.employee_code?.toLowerCase() || '';
        const dept = r.profiles?.departments?.name?.toLowerCase() || '';
        const desig = r.profiles?.designation?.toLowerCase() || '';
        if (!name.includes(term) && !code.includes(term) && !dept.includes(term) && !desig.includes(term)) return false;
      }
      return true;
    });
  }, [records, statusFilter, incentiveStatusFilter, eligibilityFilter, periodFilter, searchTerm, selectedCompanyIds, employeeCompanyMap]);

  // Aggregate to one row per employee for the UI table.
  // Bulk actions still target the underlying record IDs (recordIds).
  const aggregatedRows = useMemo(() => {
    const byEmp = new Map<string, any>();
    filteredRecords.forEach((r: any) => {
      const empId = r.employee_id;
      if (!empId) return;
      const existing = byEmp.get(empId);
      if (!existing) {
        byEmp.set(empId, {
          ...r,
          id: empId, // row key = employee id
          employee_id: empId,
          recordIds: [r.id],
          incentive_amount: Number(r.incentive_amount || 0),
        });
      } else {
        existing.recordIds.push(r.id);
        existing.incentive_amount = Number(existing.incentive_amount || 0) + Number(r.incentive_amount || 0);
        // Prefer the highest final_incentive_percent for display
        if ((r.final_incentive_percent || 0) > (existing.final_incentive_percent || 0)) {
          existing.final_incentive_percent = r.final_incentive_percent;
          existing.incentive_slabs = r.incentive_slabs;
        }
        // If any underlying record is non-final, weaken aggregate workflow status
        if (existing.status === 'paid' && r.status !== 'paid') existing.status = r.status;
        if (existing.status === 'confirmed' && r.status === 'draft') existing.status = 'draft';
      }
    });
    return Array.from(byEmp.values());
  }, [filteredRecords]);

  // Per-employee KPI status (Approved if all KPIs in period are status='approved', else Pending)
  const employeeIds = useMemo(() => aggregatedRows.map((r: any) => r.employee_id).filter(Boolean), [aggregatedRows]);
  const { data: kpiStatusMap } = useEmployeeKpiStatusForPeriod(
    employeeIds,
    isAllMode ? undefined : selectedMonth,
    isAllMode ? undefined : Number(selectedYear),
  );

  const summaryStats = useMemo(() => {
    const total = aggregatedRows.length;
    const eligible = aggregatedRows.filter((r: any) => !r.is_disqualified).length;
    const disqualified = aggregatedRows.filter((r: any) => r.is_disqualified).length;
    const prorata = aggregatedRows.filter((r: any) => !r.is_disqualified && r.pro_rata_factor < 1).length;
    const totalAmount = aggregatedRows.reduce((s: number, r: any) => s + Math.round(r.incentive_amount || 0), 0);
    return { total, eligible, disqualified, prorata, totalAmount };
  }, [aggregatedRows]);

  // Pagination
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(aggregatedRows.length / pageSize));
  const paginatedRecords = pageSize === 0
    ? aggregatedRows
    : aggregatedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showStart = aggregatedRows.length === 0 ? 0 : (pageSize === 0 ? 1 : (currentPage - 1) * pageSize + 1);
  const showEnd = pageSize === 0 ? aggregatedRows.length : Math.min(currentPage * pageSize, aggregatedRows.length);

  // Selection toggles operate on aggregated employee rows; we expand to underlying record IDs at action time.
  const toggleSelect = (rowId: string) => {
    setSelectAllRecords(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paginatedRecords.map((r: any) => r.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedIds.has(id));
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.delete(id));
        return next;
      });
      setSelectAllRecords(false);
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: string) => next.add(id));
        return next;
      });
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllRecords(true);
    setSelectedIds(new Set(aggregatedRows.map((r: any) => r.id)));
  };

  const selectedCount = selectedIds.size;
  const allPageSelected = paginatedRecords.length > 0 &&
    paginatedRecords.every((r: any) => selectedIds.has(r.id));
  const showSelectAllBanner = allPageSelected && aggregatedRows.length > paginatedRecords.length && !selectAllRecords;

  // Expand selected employee rows back to underlying incentive record IDs
  const selectedRecordIds = useMemo(() => {
    const ids: string[] = [];
    aggregatedRows.forEach((row: any) => {
      if (selectedIds.has(row.id)) ids.push(...(row.recordIds || []));
    });
    return ids;
  }, [aggregatedRows, selectedIds]);

  // Mark Paid impact data — operates on filteredRecords (raw incentive records)
  const markPaidTargets = useMemo(() => {
    const confirmed = filteredRecords.filter((r: any) => r.status === 'confirmed');
    if (selectedCount > 0) {
      const idSet = new Set(selectedRecordIds);
      return confirmed.filter((r: any) => idSet.has(r.id));
    }
    return confirmed;
  }, [filteredRecords, selectedRecordIds, selectedCount]);

  const markPaidImpact = useMemo(() => ({
    count: markPaidTargets.length,
    totalAmount: markPaidTargets.reduce((s: number, r: any) => s + (r.incentive_amount || 0), 0),
    employees: markPaidTargets.map((r: any) => ({
      name: r.profiles?.full_name || 'Unknown',
      code: r.profiles?.employee_code || '',
      amount: r.incentive_amount || 0,
    })),
  }), [markPaidTargets]);

  const handleExport = () => {
    if (!filteredRecords.length) return;
    const exportData = filteredRecords.map((r: any) => {
      const p = r.profiles;
      const dept = p?.departments;
      const bu = dept?.business_units;
      const div = bu?.divisions;
      const slab = r.incentive_slabs;
      const prog = r.incentive_programs;
      return {
        'Employee Code': p?.employee_code ?? '',
        'Employee Name': p?.full_name ?? '',
        'Designation': p?.designation ?? '',
        'Department': dept?.name ?? '',
        'Business Unit': bu?.name ?? '',
        'Division': div?.name ?? '',
        'Month': r.review_period,
        'Year': r.review_year,
        'Period': r.payment_period || 'Full Month',
        'Programme Name': prog?.name ?? '',
        'PMS Score': r.pms_score ?? '',
        'Slab Range': slab ? `${slab.min_value}–${slab.max_value}` : '',
        'Slab Rating': slab?.rating_label ?? '',
        'Base Incentive %': r.base_incentive_percent,
        'Is Disqualified': r.is_disqualified ? 'Yes' : 'No',
        'DQ Reasons': (r.disqualification_reasons || []).join(', '),
        'LTI Penalty %': r.lti_penalty_percent,
        'Pro-rata Factor': r.pro_rata_factor,
        'Production Value': r.production_value ?? '',
        'Original Score': r.original_score ?? '',
        'Adjusted Score': r.adjusted_score ?? '',
        'Final Incentive %': r.final_incentive_percent,
        'Incentive Amount': Math.round(r.incentive_amount || 0),
        'Incentive Status': r.incentive_status,
        'Record Status': r.status,
        'Incentive Base': prog?.incentive_base ?? '',
        'Retroactive Adjustment': r.is_retroactive_adjustment ? 'Yes' : 'No',
        'Adjustment Source Period': r.adjustment_source_period ?? '',
        'Computed At': r.computed_at ?? '',
        'Confirmed By': r.confirmed_by ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incentive Report');
    const suffix = selectedMonth !== 'all' ? `_${selectedMonth}` : '';
    const ySuffix = selectedYear !== 'all' ? `_${selectedYear}` : '';
    XLSX.writeFile(wb, `Incentive_Report${suffix}${ySuffix}.xlsx`);
  };

  const handleConfirmAll = () => {
    const drafts = filteredRecords.filter((r: any) => r.status === 'draft');
    const targets = selectedCount > 0
      ? (() => { const idSet = new Set(selectedRecordIds); return drafts.filter((r: any) => idSet.has(r.id)); })()
      : drafts;
    const draftIds = targets.map((r: any) => r.id);
    if (draftIds.length > 0 && user?.id) confirmRecords.mutate({ ids: draftIds, confirmedBy: user.id });
  };

  const handleMarkAllPaid = () => {
    if (markPaidTargets.length > 0) {
      setShowMarkPaidDialog(true);
    }
  };

  const handleConfirmMarkPaid = () => {
    const ids = markPaidTargets.map((r: any) => r.id);
    if (ids.length > 0) markPaid.mutate(ids);
    setShowMarkPaidDialog(false);
    setSelectedIds(new Set());
  };

  const handleCompute = async () => {
    if (selectedProgram === 'all' || isAllMode) return;
    try {
      const result = await computeIncentives.mutateAsync({
        review_period: selectedMonth,
        review_year: Number(selectedYear),
        program_id: selectedProgram,
        dry_run: true,
        scope: buildScope(),
      });
      console.error('Compute payload shape:', { summary: (result as any)?.summary, recordSample: (result as any)?.records?.[0] });
      setDryRunResult(result);
      setShowPreview(true);
      const ids = (result as any)?.records?.map((r: any) => r.employee_id) || [];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code')
          .in('id', ids);
        const nameMap = new Map<string, { name: string; code: string }>(
          (profiles || []).map((p: any) => [p.id, { name: p.full_name || 'Unknown', code: p.employee_code || '' }])
        );
        setEmployeeNameMap(nameMap);
      }
    } catch { /* error handled by hook */ }
  };

  const handleConfirmCompute = async () => {
    if (selectedProgram === 'all' || isAllMode) return;
    try {
      await computeIncentives.mutateAsync({
        review_period: selectedMonth,
        review_year: Number(selectedYear),
        program_id: selectedProgram,
        dry_run: false,
        scope: buildScope(),
      });
      setShowPreview(false);
      setDryRunResult(null);
    } catch { /* error handled by hook */ }
  };

  const canCompute = selectedProgram !== 'all' && !isAllMode;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Programme</label>
              <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programmes</SelectItem>
                  {activePrograms.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {companies.length > 1 && (
              <div className="w-48">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Company</label>
                <MultiSelectFilter
                  options={companies.map(c => c.name)}
                  value={selectedCompanyNames}
                  onChange={(names) => {
                    const ids = names.map(n => companyNameToId.get(n)).filter(Boolean) as string[];
                    setSelectedCompanyIds(ids);
                  }}
                  placeholder="All Companies"
                  searchPlaceholder="Search companies..."
                  className="w-full h-10"
                />
              </div>
            )}
            <div className="w-32">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  <SelectItem value="Full Month">Full Month</SelectItem>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="11-20">11-20</SelectItem>
                  <SelectItem value="21-31">21-31</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-28">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Eligibility</label>
              <Select value={eligibilityFilter} onValueChange={setEligibilityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="eligible">Eligible</SelectItem>
                  <SelectItem value="disqualified">Disqualified</SelectItem>
                  <SelectItem value="prorata">Pro-rata</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Incentive Status</label>
              <Select value={incentiveStatusFilter} onValueChange={setIncentiveStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="finalised">Finalised</SelectItem>
                  <SelectItem value="forfeited">Forfeited</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Name, code, dept..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end items-center">
            {selectedCount > 0 && (
              <Badge variant="secondary" className="text-xs mr-2">
                {selectedCount} selected
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" onClick={handleCompute} disabled={!canCompute || computeIncentives.isPending}>
                      {computeIncentives.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}
                      Compute
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[260px]">
                    Computes for {filteredMappedCount} employee(s) matching current Company / Period filters.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!filteredRecords.length}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button size="sm" onClick={handleConfirmAll} disabled={confirmRecords.isPending || isAllMode}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {selectedCount > 0 ? 'Confirm Selected' : 'Confirm All'}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleMarkAllPaid} disabled={markPaid.isPending || isAllMode || markPaidTargets.length === 0}>
              <DollarSign className="h-4 w-4 mr-1" /> {selectedCount > 0 ? 'Mark Selected Paid' : 'Mark Paid'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={Users} label="Total Records" value={summaryStats.total} />
        <SummaryCard icon={Users} label="Eligible" value={summaryStats.eligible} className="text-primary" />
        <SummaryCard icon={ShieldAlert} label="Disqualified" value={summaryStats.disqualified} className="text-destructive" />
        <SummaryCard icon={Clock} label="Pro-rata" value={summaryStats.prorata} className="text-accent-foreground" />
        <SummaryCard icon={IndianRupee} label="Total Amount (₹)" value={summaryStats.totalAmount.toLocaleString('en-IN')} />
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">
            Showing {showStart}–{showEnd} of {aggregatedRows.length} employees
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all on page"
                    />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                   <TableHead>PMS Score</TableHead>
                  <TableHead>KPI Status</TableHead>
                  <TableHead>Slab</TableHead>
                  <TableHead>Base %</TableHead>
                  <TableHead>DQ Reason</TableHead>
                  <TableHead>LTI Penalty</TableHead>
                  <TableHead>Pro-rata</TableHead>
                  <TableHead>Final %</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>DQ / Incentive Status</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : isError ? (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-destructive">Error: {(error as Error)?.message || 'Unknown error'}</TableCell></TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="py-10">
                      {canComputeNow ? (
                        <div className="mx-auto max-w-md text-center space-y-4">
                          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Calculator className="h-6 w-6 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-base font-semibold">No incentive records yet</h3>
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{filteredMappedCount}</span>
                              {selectedCompanyIds.length > 0 ? ` of ${mappedEmployeeCount}` : ''} employee
                              {filteredMappedCount === 1 ? '' : 's'} match current filters for{' '}
                              <span className="font-medium text-foreground">{selectedProgramName}</span>. Click below to
                              compute incentives for {scopeText}.
                            </p>
                            {periodFilter !== 'all' && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                Period filter is set to <span className="font-medium text-foreground">{periodFilter}</span>. Compute will only write rows where employees have production data in that range.
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 justify-center">
                            <Button
                              size="sm"
                              onClick={handleComputeNow}
                              disabled={computeIncentives.isPending}
                            >
                              {computeIncentives.isPending ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Computing…</>
                              ) : (
                                <><Calculator className="h-4 w-4" /> Compute Now</>
                              )}
                            </Button>
                            {periodFilter !== 'all' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={computeIncentives.isPending}
                                onClick={() => {
                                  computeIncentives.mutate({
                                    review_period: selectedMonth,
                                    review_year: Number(selectedYear),
                                    program_id: selectedProgram,
                                    scope: {
                                      employee_ids: selectedCompanyIds.length > 0 ? scopedEmployeeIds : [],
                                      payment_period: null,
                                    },
                                  });
                                }}
                              >
                                <Calculator className="h-4 w-4" /> Compute for All Periods
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : selectedProgram !== 'all' && mappedEmployeeCount === 0 ? (
                        <div className="text-center text-sm text-muted-foreground">
                          No employees are mapped to <span className="font-medium text-foreground">{selectedProgramName}</span>.
                          Map employees in the programme configuration before computing incentives.
                        </div>
                      ) : (
                        <div className="text-center text-sm text-muted-foreground">
                          No records found. Adjust filters or compute incentives first.
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {showSelectAllBanner && (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center py-2 bg-muted/50">
                          <span className="text-sm">All {paginatedRecords.length} on this page are selected. </span>
                          <Button variant="link" size="sm" className="p-0 h-auto text-sm font-semibold" onClick={handleSelectAllRecords}>
                            Select all {aggregatedRows.length} employees
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {selectAllRecords && (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center py-2 bg-primary/10">
                          <span className="text-sm font-medium">All {aggregatedRows.length} employees are selected. </span>
                          <Button variant="link" size="sm" className="p-0 h-auto text-sm" onClick={() => { setSelectAllRecords(false); setSelectedIds(new Set()); }}>
                            Clear selection
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedRecords.map((r: any) => (
                      <TableRow key={r.id} className={r.is_disqualified ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select ${r.profiles?.full_name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{r.profiles?.full_name}</div>
                          <div className="text-xs text-muted-foreground">{r.profiles?.employee_code}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.payment_period || 'Full Month'}</TableCell>
                         <TableCell>{r.pms_score != null ? Number(r.pms_score ?? 0).toFixed(2) : '—'}</TableCell>
                        <TableCell>
                          {(() => {
                            const ks = kpiStatusMap?.get(r.employee_id);
                            if (!ks || ks.total === 0) {
                              return <Badge variant="outline" className="text-xs">No KPIs</Badge>;
                            }
                            return ks.allApproved ? (
                              <Badge className="text-xs">Approved</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Pending ({ks.approved}/{ks.total})
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {r.incentive_slabs ? (
                            <span className="text-xs">{Number(r.incentive_slabs.min_value ?? 0)}–{Number(r.incentive_slabs.max_value ?? 0)}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{Number(r.base_incentive_percent ?? 0)}%</TableCell>
                        <TableCell>
                          {r.is_disqualified ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-xs">{r.disqualification_reasons?.[0] || 'DQ'}</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs max-w-[200px]">{(r.disqualification_reasons || []).join(', ') || 'Disqualified'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{Number(r.lti_penalty_percent ?? 0) > 0 ? `${Number(r.lti_penalty_percent ?? 0)}%` : '—'}</TableCell>
                        <TableCell>{Number(r.pro_rata_factor ?? 1) < 1 ? Number(r.pro_rata_factor ?? 0).toFixed(2) : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={Number(r.final_incentive_percent ?? 0) > 0 ? 'default' : 'secondary'}>
                            {Number(r.final_incentive_percent ?? 0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(r.incentive_amount ?? 0) > 0 ? `₹${Math.round(Number(r.incentive_amount ?? 0)).toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell>
                          {r.is_disqualified ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-xs">Disqualified</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs max-w-[200px]">{(r.disqualification_reasons || []).join(', ') || 'Disqualified'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge variant={r.incentive_status === 'finalised' ? 'default' : 'outline'} className="text-xs capitalize">
                              {r.incentive_status || 'hold'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'paid' ? 'default' : r.status === 'confirmed' ? 'secondary' : 'outline'} className="text-xs">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <IncentiveStatusOverride recordId={r.recordIds?.[0] || r.id} currentStatus={r.incentive_status || 'hold'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination Controls */}
          {filteredRecords.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="0">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {pageSize > 0 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">Page {currentPage} of {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <IncentiveDryRunDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        result={dryRunResult}
        onConfirm={handleConfirmCompute}
        isConfirming={computeIncentives.isPending}
        employeeNames={employeeNameMap}
        scopeText={scopeText}
      />

      {/* Mark Paid Impact Dialog */}
      <AlertDialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Mark as Paid</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted rounded-md p-2 text-center">
                    <p className="text-xs text-muted-foreground">Employees</p>
                    <p className="text-lg font-semibold">{markPaidImpact.count}</p>
                  </div>
                  <div className="bg-muted rounded-md p-2 text-center">
                    <p className="text-xs text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-semibold">₹{Math.round(markPaidImpact.totalAmount).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="max-h-48 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Employee</TableHead>
                        <TableHead className="text-xs text-right">Amount (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {markPaidImpact.employees.slice(0, 20).map((emp, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1">
                            <span className="font-medium">{emp.name}</span>
                            {emp.code && <span className="text-muted-foreground ml-1">({emp.code})</span>}
                          </TableCell>
                          <TableCell className="text-xs py-1 text-right">₹{Math.round(emp.amount).toLocaleString('en-IN')}</TableCell>
                        </TableRow>
                      ))}
                      {markPaidImpact.employees.length > 20 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-1">
                            +{markPaidImpact.employees.length - 20} more
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">This action will mark the above records as paid and cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMarkPaid}>
              <DollarSign className="h-4 w-4 mr-1" /> Confirm Mark Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, className }: { icon: any; label: string; value: string | number; className?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <Icon className={`h-5 w-5 text-muted-foreground ${className || ''}`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-semibold ${className || ''}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
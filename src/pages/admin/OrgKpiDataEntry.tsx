import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories, useDepartments, useProfiles } from '@/hooks/useOrganization';
import { useOrgKpiValues, useBulkUpsertOrgKpiValues, OrgKpiValue } from '@/hooks/useOrgKpiValues';
import { useOrgLevelKpisWithEmployees, useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { useOrgKpiOwnershipMap } from '@/hooks/useOrgKpiDataOwner';
import { useUnmarkAsOrgLevel } from '@/hooks/useMarkAsOrgLevel';
import { usePropagateOrgKpiValue } from '@/hooks/usePropagateOrgKpiValue';
import { useBatchInsertAuditLogs } from '@/hooks/useOrgKpiAuditLog';
import { useRollbackOrgKpiPropagation } from '@/hooks/useRollbackOrgKpiPropagation';
import { OrgLevelScope } from '@/hooks/useKpis';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { OrgKpiProgressBar } from '@/components/admin/OrgKpiProgressBar';
import { OrgKpiEntryCard, OrgKpiCardData } from '@/components/admin/OrgKpiEntryCard';
import { OrgKpiBulkExport } from '@/components/admin/OrgKpiBulkExport';
import { OrgKpiBulkImport } from '@/components/admin/OrgKpiBulkImport';
import { OrgKpiOwnerManagement } from '@/components/admin/OrgKpiOwnerManagement';
import { OrgKpiImpactSheet } from '@/components/admin/OrgKpiImpactSheet';
import { OrgKpiSuggestionsPanel } from '@/components/admin/OrgKpiSuggestionsPanel';
import { Building2, AlertTriangle, Search, Copy, Upload, Users as UsersIcon, Lightbulb, Info } from 'lucide-react';
import { isKpiLockedForPeriod, getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { useToast } from '@/hooks/use-toast';

// Helper to get previous period
function getPreviousPeriod(period: string, year: number): { period: string; year: number } {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const idx = months.indexOf(period);
  if (idx <= 0) return { period: 'December', year: year - 1 };
  return { period: months[idx - 1], year };
}

export default function OrgKpiDataEntry() {
  const { profile, role } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'entry' | 'suggestions' | 'owners'>('entry');
  const [importOpen, setImportOpen] = useState(false);

  // Impact sheet state
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactTarget, setImpactTarget] = useState<{ categoryId: string; kraName: string; kpiName: string; achievedValue: number | null } | null>(null);

  // Data queries - use the new hook that filters by employee mapping
  const { data: orgLevelData, isLoading: kpisLoading } = useOrgLevelKpisWithEmployees(selectedPeriod, selectedYear);
  // ALL org-level KPIs (unfiltered) for Data Owners tab
  const { data: allOrgLevelKpis } = useOrgLevelKpis(selectedPeriod, selectedYear);
  const orgLevelKpis = useMemo(() => orgLevelData?.kpis?.map(k => k.kpi) || [], [orgLevelData]);
  const employeeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    orgLevelData?.kpis?.forEach(k => {
      const key = `${k.kpi.category_id}||${k.kpi.kra_name}||${k.kpi.kpi_name}`;
      map.set(key, k.employeeCount);
    });
    return map;
  }, [orgLevelData]);
  const mappedDepartmentsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    orgLevelData?.kpis?.forEach(k => {
      const key = `${k.kpi.category_id}||${k.kpi.kra_name}||${k.kpi.kpi_name}`;
      map.set(key, new Set(k.departmentIds));
    });
    return map;
  }, [orgLevelData]);
  const mappedEmployeesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    orgLevelData?.kpis?.forEach(k => {
      const key = `${k.kpi.category_id}||${k.kpi.kra_name}||${k.kpi.kpi_name}`;
      map.set(key, new Set(k.employeeIds));
    });
    return map;
  }, [orgLevelData]);
  const unmappedCount = orgLevelData?.unmappedCount || 0;

  const { data: categories } = useKraCategories();
  const { data: departments } = useDepartments();
  const { data: allProfiles } = useProfiles();
  const { data: existingOrgValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);
  const { ownershipMap, isAdmin } = useOrgKpiOwnershipMap();
  const bulkUpsert = useBulkUpsertOrgKpiValues();
  const propagate = usePropagateOrgKpiValue();
  const insertAuditLogs = useBatchInsertAuditLogs();
  const rollbackMutation = useRollbackOrgKpiPropagation();
  const unmarkMutation = useUnmarkAsOrgLevel();

  // Previous period data
  const prev = getPreviousPeriod(selectedPeriod, selectedYear);
  const { data: previousValues } = useOrgKpiValues(undefined, prev.period, prev.year);

  // Build previous values map
  const prevValuesMap = useMemo(() => {
    const map = new Map<string, number | null>();
    previousValues?.forEach(v => {
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}`;
      map.set(key, v.achieved_value);
    });
    return map;
  }, [previousValues]);

  // Build existing values map
  const existingValuesMap = useMemo(() => {
    const map = new Map<string, OrgKpiValue>();
    existingOrgValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, v);
    });
    return map;
  }, [existingOrgValues]);

  // Filter by ownership
  const ownershipFilteredKpis = useMemo(() => {
    if (!orgLevelKpis) return [];
    if (isAdmin) return orgLevelKpis;
    return orgLevelKpis.filter(kpi => {
      const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
      return ownershipMap.get(ownerKey)?.canEdit === true;
    });
  }, [orgLevelKpis, isAdmin, ownershipMap]);

  // Filter by frequency — hide KPIs not due in the selected month
  const frequencyFilteredKpis = useMemo(() => {
    return ownershipFilteredKpis.filter(kpi => {
      const freq = (kpi as any).frequency;
      if (!freq || freq === 'Monthly' || freq === 'Daily' || freq === 'Weekly') return true;
      return !isKpiLockedForPeriod(freq, selectedPeriod, selectedYear, (kpi as any).frequency_cycle_start);
    });
  }, [ownershipFilteredKpis, selectedPeriod, selectedYear]);

  // Get categories
  const orgLevelCategories = useMemo(() => {
    if (!frequencyFilteredKpis || !categories) return [];
    const categoryIds = new Set(frequencyFilteredKpis.map(k => k.category_id));
    return categories.filter(c => categoryIds.has(c.id));
  }, [frequencyFilteredKpis, categories]);

  // Filter by category and search
  const filteredKpis = useMemo(() => {
    let result = frequencyFilteredKpis;
    if (selectedCategoryId !== 'all') {
      result = result.filter(k => k.category_id === selectedCategoryId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(k =>
        k.kpi_name.toLowerCase().includes(q) ||
        k.kra_name.toLowerCase().includes(q) ||
        k.kra_categories?.name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [frequencyFilteredKpis, selectedCategoryId, searchQuery]);

  // Group by category
  const groupedKpis = useMemo(() => {
    const map = new Map<string, { categoryName: string; color: string; kpis: typeof filteredKpis }>();
    filteredKpis.forEach(kpi => {
      const catId = kpi.category_id;
      const catName = kpi.kra_categories?.name || 'Uncategorized';
      const color = kpi.kra_categories?.color || '#6B7280';
      const existing = map.get(catId) || { categoryName: catName, color, kpis: [] };
      existing.kpis.push(kpi);
      map.set(catId, existing);
    });
    return Array.from(map.entries());
  }, [filteredKpis]);

  // Progress calculation
  const progressData = useMemo(() => {
    const totalKpis = frequencyFilteredKpis.length;
    let enteredKpis = 0;
    const categoryMap = new Map<string, { total: number; entered: number }>();

    frequencyFilteredKpis.forEach(kpi => {
      const catId = kpi.category_id;
      const cat = categoryMap.get(catId) || { total: 0, entered: 0 };
      cat.total++;

      const scope = (kpi as any).org_level_scope || 'organization';
      let isEntered = false;

      if (scope === 'organization') {
        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
        const val = existingValuesMap.get(key);
        isEntered = val?.achieved_value !== null && val?.achieved_value !== undefined;
      } else {
        const prefix = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||`;
        isEntered = Array.from(existingValuesMap.entries()).some(([k, v]) =>
          k.startsWith(prefix) && v.achieved_value !== null && v.achieved_value !== undefined
        );
      }

      if (isEntered) {
        enteredKpis++;
        cat.entered++;
      }
      categoryMap.set(catId, cat);
    });

    const categoryProgress = orgLevelCategories.map(cat => ({
      categoryId: cat.id,
      categoryName: cat.name,
      color: cat.color || '#6B7280',
      total: categoryMap.get(cat.id)?.total || 0,
      entered: categoryMap.get(cat.id)?.entered || 0,
    }));

    return { totalKpis, enteredKpis, categoryProgress };
  }, [frequencyFilteredKpis, existingValuesMap, orgLevelCategories]);

  // Build card data for a KPI
  const buildCardData = useCallback((kpi: typeof filteredKpis[0]): OrgKpiCardData => {
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'organization';
    const catName = kpi.kra_categories?.name || '';
    const catColor = kpi.kra_categories?.color || '#6B7280';
    const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    const existing = existingValuesMap.get(key);
    const prevKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
    const previousValue = prevValuesMap.get(prevKey) ?? null;
    const empCount = employeeCountMap.get(prevKey) ?? 0;

    // Determine status
    let status: 'pending' | 'entered' | 'propagated' = 'pending';
    if (existing?.achieved_value !== null && existing?.achieved_value !== undefined) {
      status = existing?.status === 'propagated' ? 'propagated' : 'entered';
    }

    // Build scoped rows for dept/employee
    let scopedRows: OrgKpiCardData['scopedRows'] = undefined;
    let scopeLabel: string | undefined;

    if (scope === 'department' && departments) {
      scopeLabel = 'Department';
      const kpiKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
      const mappedDeptIds = mappedDepartmentsMap.get(kpiKey);
      const filteredDepts = mappedDeptIds
        ? departments.filter(dept => mappedDeptIds.has(dept.id))
        : departments;
      const kpiMappedEmpIds = mappedEmployeesMap.get(kpiKey);
      scopedRows = filteredDepts.map(dept => {
        const scopeKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${dept.id}||null`;
        const val = existingValuesMap.get(scopeKey);
        // Build employee names sub-text for this department
        let scopeSubText: string | undefined;
        if (kpiMappedEmpIds && allProfiles) {
          const names = allProfiles
            .filter(p => kpiMappedEmpIds.has(p.id) && p.department_id === dept.id)
            .map(p => (p.full_name || '').split(' ')[0])
            .filter(Boolean);
          if (names.length > 0) scopeSubText = names.join(', ');
        }
        return {
          scopeId: dept.id,
          scopeName: dept.name,
          scopeSubText,
          achievedValue: val?.achieved_value ?? null,
          remarks: val?.remarks ?? '',
          evidenceUrl: val?.evidence_url ?? null,
        };
      });
    } else if (scope === 'employee' && allProfiles) {
      scopeLabel = 'Employee';
      const kpiKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
      const mappedEmpIds = mappedEmployeesMap.get(kpiKey);
      const filteredEmps = mappedEmpIds
        ? allProfiles.filter(emp => mappedEmpIds.has(emp.id))
        : allProfiles;
      scopedRows = filteredEmps.map(emp => {
        const scopeKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${emp.id}`;
        const val = existingValuesMap.get(scopeKey);
        return {
          scopeId: emp.id,
          scopeName: emp.full_name || emp.email,
          achievedValue: val?.achieved_value ?? null,
          remarks: val?.remarks ?? '',
          evidenceUrl: val?.evidence_url ?? null,
        };
      });
    }

    return {
      categoryId: kpi.category_id,
      categoryName: catName,
      categoryColor: catColor,
      kraName: kpi.kra_name,
      kpiName: kpi.kpi_name,
      targetValue: kpi.target_value,
      uom: kpi.uom,
      r5: kpi.r5 ?? null,
      r4: kpi.r4 ?? null,
      r3: kpi.r3 ?? null,
      r2: kpi.r2 ?? null,
      r1: kpi.r1 ?? null,
      scope,
      achievedValue: existing?.achieved_value ?? null,
      remarks: existing?.remarks ?? '',
      evidenceUrl: existing?.evidence_url ?? null,
      previousValue,
      previousPeriodLabel: previousValue !== null ? `${prev.period.slice(0, 3)} ${prev.year}` : null,
      status,
      scopedRows,
      scopeLabel,
      employeeCount: empCount,
    };
  }, [existingValuesMap, prevValuesMap, departments, allProfiles, prev, employeeCountMap, mappedDepartmentsMap, mappedEmployeesMap]);

  // Save handler for a single card
  const handleCardSave = useCallback(async (
    kpi: typeof filteredKpis[0],
    values: { achievedValue: number | null; remarks: string; evidenceUrl: string | null; scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null }> }
  ) => {
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'organization';
    const toSave: Array<any> = [];
    const auditEntries: Array<any> = [];

    if (scope === 'organization') {
      const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
      const oldVal = existingValuesMap.get(key)?.achieved_value ?? null;
      toSave.push({
        category_id: kpi.category_id,
        kra_name: kpi.kra_name,
        kpi_name: kpi.kpi_name,
        review_period: selectedPeriod,
        review_year: selectedYear,
        achieved_value: values.achievedValue,
        remarks: values.remarks || undefined,
        evidence_url: values.evidenceUrl,
        entered_by: profile?.id,
      });
      if (values.achievedValue !== oldVal) {
        auditEntries.push({
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          action: oldVal === null ? 'created' : 'updated',
          performed_by: profile?.id,
          old_value: oldVal,
          new_value: values.achievedValue,
        });
      }
    } else if (values.scopedValues) {
      values.scopedValues.forEach(sv => {
        const isDept = scope === 'department';
        const scopeKey = isDept
          ? `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${sv.scopeId}||null`
          : `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${sv.scopeId}`;
        const oldVal = existingValuesMap.get(scopeKey)?.achieved_value ?? null;
        toSave.push({
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          achieved_value: sv.achievedValue,
          remarks: sv.remarks || undefined,
          evidence_url: sv.evidenceUrl,
          entered_by: profile?.id,
          department_id: isDept ? sv.scopeId : undefined,
          employee_id: !isDept ? sv.scopeId : undefined,
        });
        if (sv.achievedValue !== oldVal) {
          auditEntries.push({
            category_id: kpi.category_id,
            kra_name: kpi.kra_name,
            kpi_name: kpi.kpi_name,
            review_period: selectedPeriod,
            review_year: selectedYear,
            action: oldVal === null ? 'created' : 'updated',
            performed_by: profile?.id,
            old_value: oldVal,
            new_value: sv.achievedValue,
          });
        }
      });
    }

    if (toSave.length > 0) {
      await bulkUpsert.mutateAsync(toSave);
    }
    if (auditEntries.length > 0) {
      try { await insertAuditLogs.mutateAsync(auditEntries); } catch { /* non-blocking */ }
    }
  }, [existingValuesMap, selectedPeriod, selectedYear, profile?.id, bulkUpsert, insertAuditLogs]);

  // Save & Propagate handler
  const handleCardSaveAndPropagate = useCallback(async (
    kpi: typeof filteredKpis[0],
    values: Parameters<typeof handleCardSave>[1]
  ) => {
    await handleCardSave(kpi, values);
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'organization';
    
    if (scope === 'organization') {
      await propagate.mutateAsync({
        categoryId: kpi.category_id,
        kraName: kpi.kra_name,
        kpiName: kpi.kpi_name,
        reviewPeriod: selectedPeriod,
        reviewYear: selectedYear,
        achievedValue: values.achievedValue,
        scope: 'organization',
      });
    } else if (scope === 'department' && values.scopedValues) {
      for (const sv of values.scopedValues) {
        if (sv.achievedValue === null) continue;
        await propagate.mutateAsync({
          categoryId: kpi.category_id,
          kraName: kpi.kra_name,
          kpiName: kpi.kpi_name,
          reviewPeriod: selectedPeriod,
          reviewYear: selectedYear,
          achievedValue: sv.achievedValue,
          scope: 'department',
          departmentId: sv.scopeId,
        });
      }
    } else if (scope === 'employee' && values.scopedValues) {
      for (const sv of values.scopedValues) {
        if (sv.achievedValue === null) continue;
        await propagate.mutateAsync({
          categoryId: kpi.category_id,
          kraName: kpi.kra_name,
          kpiName: kpi.kpi_name,
          reviewPeriod: selectedPeriod,
          reviewYear: selectedYear,
          achievedValue: sv.achievedValue,
          scope: 'employee',
          employeeId: sv.scopeId,
        });
      }
    }

    // Set org_kpi_values status to 'propagated' for all matching rows
    await supabase
      .from('org_kpi_values')
      .update({ status: 'propagated', updated_at: new Date().toISOString() })
      .eq('category_id', kpi.category_id)
      .eq('kra_name', kpi.kra_name)
      .eq('kpi_name', kpi.kpi_name)
      .eq('review_period', selectedPeriod)
      .eq('review_year', selectedYear);
    
    queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
  }, [handleCardSave, propagate, selectedPeriod, selectedYear, queryClient]);

  // Copy from previous period
  const handleCopyFromPrevious = async () => {
    if (!previousValues || previousValues.length === 0) {
      toast({ title: 'No data found for previous period', variant: 'destructive' });
      return;
    }

    const toCopy = previousValues.filter(pv => {
      const key = `${pv.category_id}||${pv.kra_name}||${pv.kpi_name}||${pv.department_id || 'null'}||${pv.employee_id || 'null'}`;
      const existing = existingValuesMap.get(key);
      return pv.achieved_value !== null && (!existing || existing.achieved_value === null);
    });

    if (toCopy.length === 0) {
      toast({ title: 'All KPIs already have values for this period' });
      return;
    }

    const values = toCopy.map(pv => ({
      category_id: pv.category_id,
      kra_name: pv.kra_name,
      kpi_name: pv.kpi_name,
      review_period: selectedPeriod,
      review_year: selectedYear,
      achieved_value: pv.achieved_value,
      remarks: pv.remarks || undefined,
      entered_by: profile?.id,
      department_id: pv.department_id || undefined,
      employee_id: pv.employee_id || undefined,
    }));

    await bulkUpsert.mutateAsync(values);
    
    const auditEntries = toCopy.map(pv => ({
      category_id: pv.category_id,
      kra_name: pv.kra_name,
      kpi_name: pv.kpi_name,
      review_period: selectedPeriod,
      review_year: selectedYear,
      action: 'copied_from_previous',
      performed_by: profile?.id || '',
      old_value: null as number | null,
      new_value: pv.achieved_value,
    }));
    try { await insertAuditLogs.mutateAsync(auditEntries); } catch { /* non-blocking */ }
    toast({ title: `Copied ${toCopy.length} values from ${prev.period} ${prev.year}` });
  };

  // Bulk import handler
  const handleBulkImport = async (values: Array<{
    category_id: string; kra_name: string; kpi_name: string; achieved_value: number | null; remarks?: string;
  }>) => {
    const toSave = values.map(v => ({
      ...v,
      review_period: selectedPeriod,
      review_year: selectedYear,
      entered_by: profile?.id,
    }));
    await bulkUpsert.mutateAsync(toSave);
    const auditEntries = values.map(v => ({
      category_id: v.category_id,
      kra_name: v.kra_name,
      kpi_name: v.kpi_name,
      review_period: selectedPeriod,
      review_year: selectedYear,
      action: 'imported',
      performed_by: profile?.id || '',
      new_value: v.achieved_value,
    }));
    try { await insertAuditLogs.mutateAsync(auditEntries); } catch { /* non-blocking */ }
  };

  // KPI definitions for export/import
  const kpiDefinitions = useMemo(() => {
    return ownershipFilteredKpis.map(kpi => ({
      categoryId: kpi.category_id,
      categoryName: kpi.kra_categories?.name || '',
      categoryColor: kpi.kra_categories?.color || '#6B7280',
      kraName: kpi.kra_name,
      kpiName: kpi.kpi_name,
    }));
  }, [ownershipFilteredKpis]);

  // ALL org-level KPI definitions for owner management (no employee filter)
  const allKpiDefinitions = useMemo(() => {
    if (!allOrgLevelKpis) return [];
    return allOrgLevelKpis.map(kpi => ({
      categoryId: kpi.category_id,
      categoryName: kpi.kra_categories?.name || '',
      categoryColor: kpi.kra_categories?.color || '#6B7280',
      kraName: kpi.kra_name,
      kpiName: kpi.kpi_name,
    }));
  }, [allOrgLevelKpis]);

  // Export data
  const exportData = useMemo(() => {
    return ownershipFilteredKpis.map(kpi => {
      const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
      const existing = existingValuesMap.get(key);
      const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'organization';
      return {
        categoryName: kpi.kra_categories?.name || '',
        kraName: kpi.kra_name,
        kpiName: kpi.kpi_name,
        targetValue: kpi.target_value,
        uom: kpi.uom,
        achievedValue: existing?.achieved_value ?? null,
        remarks: existing?.remarks ?? '',
        scope,
      };
    });
  }, [ownershipFilteredKpis, existingValuesMap]);

  if (kpisLoading) {
    return <TableSkeleton rows={5} columns={5} />;
  }

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization KPI Data Entry</h1>
        <p className="text-muted-foreground">
          Enter organizational KPI data with card-based interface and progress tracking
        </p>
      </div>

      {/* No KPIs warning */}
      {orgLevelData && orgLevelData.totalOrgKpis === 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-foreground">No Organization-Level KPIs Found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Mark individual KPIs as "Organization-Level" in the Admin KPI Editor, or check the Suggestions tab.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unmapped KPIs info banner */}
      {unmappedCount > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{unmappedCount}</span> org-level KPI{unmappedCount !== 1 ? 's' : ''} have no employees mapped and are hidden from data entry.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls Row */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Period + Search + Actions */}
          <div className="flex flex-wrap items-end gap-4">
            <ReviewPeriodSelector
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onPeriodChange={setSelectedPeriod}
              onYearChange={setSelectedYear}
            />
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search KPIs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleCopyFromPrevious} className="gap-1.5">
                  <Copy className="h-4 w-4" />
                  Copy from Last Period
                </Button>
                <OrgKpiBulkExport kpis={exportData} reviewPeriod={selectedPeriod} reviewYear={selectedYear} />
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
                  <Upload className="h-4 w-4" />
                  Import Excel
                </Button>
              </div>
            )}
          </div>

          {/* Category pills */}
          {orgLevelCategories.length > 1 && (
            <div className="flex flex-wrap gap-2 min-w-0">
              <Badge
                variant={selectedCategoryId === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategoryId('all')}
              >
                All ({frequencyFilteredKpis.length})
              </Badge>
              {orgLevelCategories.map(cat => {
                const count = frequencyFilteredKpis.filter(k => k.category_id === cat.id).length;
                return (
                  <Badge
                    key={cat.id}
                    variant={selectedCategoryId === cat.id ? 'default' : 'outline'}
                    className="cursor-pointer gap-1.5"
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color || '#6B7280' }} />
                    {cat.name} ({count})
                  </Badge>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Bar */}
      {frequencyFilteredKpis.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <OrgKpiProgressBar
              totalKpis={progressData.totalKpis}
              enteredKpis={progressData.enteredKpis}
              categoryProgress={progressData.categoryProgress}
            />
          </CardContent>
        </Card>
      )}

      {/* Tab Toggle: Entry vs Suggestions vs Owner Management */}
      {isAdmin && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'entry' | 'suggestions' | 'owners')}>
          <TabsList>
            <TabsTrigger value="entry" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Data Entry
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-1.5">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="owners" className="gap-1.5">
              <UsersIcon className="h-4 w-4" />
              Data Owners
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Owner Management Tab */}
      {activeTab === 'owners' && isAdmin && (
        <OrgKpiOwnerManagement kpiDefinitions={allKpiDefinitions} />
      )}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && isAdmin && (
        <OrgKpiSuggestionsPanel reviewPeriod={selectedPeriod} reviewYear={selectedYear} />
      )}

      {/* Card-Based Entry */}
      {activeTab === 'entry' && (
        <div className="space-y-6">
          {groupedKpis.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No org-level KPIs found for the selected filters</p>
              </CardContent>
            </Card>
          )}

          {groupedKpis.map(([catId, group]) => {
            const enteredInCat = group.kpis.filter(kpi => {
              const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
              const val = existingValuesMap.get(key);
              return val?.achieved_value !== null && val?.achieved_value !== undefined;
            }).length;

            return (
              <div key={catId} className="space-y-3">
                {/* Category Header */}
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                  <h2 className="text-lg font-semibold text-foreground">{group.categoryName}</h2>
                  <Badge variant="outline" className="text-xs">
                    {enteredInCat}/{group.kpis.length} entered
                  </Badge>
                </div>

                {/* KPI Cards */}
                {group.kpis.map(kpi => {
                  const cardData = buildCardData(kpi);
                  return (
                    <OrgKpiEntryCard
                      key={`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${selectedPeriod}||${selectedYear}`}
                      data={cardData}
                      reviewPeriod={selectedPeriod}
                      reviewYear={selectedYear}
                      isAdmin={isAdmin}
                      onSave={(values) => handleCardSave(kpi, values)}
                      onSaveAndPropagate={(values) => handleCardSaveAndPropagate(kpi, values)}
                      onUnlock={async () => {
                        await supabase
                          .from('org_kpi_values')
                          .update({ status: 'entered', updated_at: new Date().toISOString() })
                          .eq('category_id', kpi.category_id)
                          .eq('kra_name', kpi.kra_name)
                          .eq('kpi_name', kpi.kpi_name)
                          .eq('review_period', selectedPeriod)
                          .eq('review_year', selectedYear);
                        try {
                          await insertAuditLogs.mutateAsync([{
                            category_id: kpi.category_id,
                            kra_name: kpi.kra_name,
                            kpi_name: kpi.kpi_name,
                            review_period: selectedPeriod,
                            review_year: selectedYear,
                            action: 'unlocked',
                            performed_by: profile?.id || '',
                          }]);
                        } catch { /* non-blocking */ }
                        queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
                        toast({ title: 'Entry unlocked for editing' });
                      }}
                      onOpenImpact={() => {
                        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
                        const val = existingValuesMap.get(key);
                        setImpactTarget({
                          categoryId: kpi.category_id,
                          kraName: kpi.kra_name,
                          kpiName: kpi.kpi_name,
                          achievedValue: val?.achieved_value ?? null,
                        });
                        setImpactOpen(true);
                      }}
                      onRollback={async (reason: string) => {
                        await rollbackMutation.mutateAsync({
                          categoryId: kpi.category_id,
                          kraName: kpi.kra_name,
                          kpiName: kpi.kpi_name,
                          reviewPeriod: selectedPeriod,
                          reviewYear: selectedYear,
                          reason,
                        });
                      }}
                      onRemoveFromOrg={isAdmin ? async () => {
                        await unmarkMutation.mutateAsync({
                          categoryId: kpi.category_id,
                          kraName: kpi.kra_name,
                          kpiName: kpi.kpi_name,
                          reviewPeriod: selectedPeriod,
                          reviewYear: selectedYear,
                        });
                        toast({ title: `"${kpi.kpi_name}" removed from Org KPIs` });
                      } : undefined}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Import Dialog */}
      <OrgKpiBulkImport
        open={importOpen}
        onOpenChange={setImportOpen}
        kpiDefinitions={kpiDefinitions}
        onImport={handleBulkImport}
      />

      {/* Impact Analysis Sheet */}
      {impactTarget && (
        <OrgKpiImpactSheet
          open={impactOpen}
          onOpenChange={setImpactOpen}
          categoryId={impactTarget.categoryId}
          kraName={impactTarget.kraName}
          kpiName={impactTarget.kpiName}
          reviewPeriod={selectedPeriod}
          reviewYear={selectedYear}
          currentAchievedValue={impactTarget.achievedValue}
        />
      )}
    </div>
  );
}

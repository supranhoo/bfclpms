import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories, useDepartments, useProfiles } from '@/hooks/useOrganization';
import { useOrgKpiValues, useBulkUpsertOrgKpiValues, useClearOrgKpiEntry, OrgKpiValue } from '@/hooks/useOrgKpiValues';
import { useOrgLevelKpisWithEmployees, useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { useOrgKpiOwnershipMap } from '@/hooks/useOrgKpiDataOwner';
import { useUnmarkAsOrgLevel } from '@/hooks/useMarkAsOrgLevel';
import { usePropagateOrgKpiValue } from '@/hooks/usePropagateOrgKpiValue';
import { usePreviewOrgKpiPropagation, PropagationPreviewResult } from '@/hooks/usePreviewOrgKpiPropagation';
import { PropagationPreviewDialog } from '@/components/admin/PropagationPreviewDialog';

import { useBatchInsertAuditLogs } from '@/hooks/useOrgKpiAuditLog';
import { useRollbackOrgKpiPropagation, useBulkRollbackOrgKpiPropagation } from '@/hooks/useRollbackOrgKpiPropagation';
import { OrgLevelScope } from '@/hooks/useKpis';
import { supabase } from '@/integrations/supabase/client';
// useQueryClient imported above with useQuery
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
import { OrgKpiPendingReport, PendingReportRow } from '@/components/admin/OrgKpiPendingReport';
import { OrgKpiBulkImport } from '@/components/admin/OrgKpiBulkImport';
import { OrgKpiOwnerManagement } from '@/components/admin/OrgKpiOwnerManagement';
import { OrgKpiImpactSheet } from '@/components/admin/OrgKpiImpactSheet';
import { OrgKpiSuggestionsPanel } from '@/components/admin/OrgKpiSuggestionsPanel';
import { Building2, AlertTriangle, Search, Copy, Upload, Users as UsersIcon, Lightbulb, Info, Mail, Loader2 } from 'lucide-react';
import { isKpiLockedForPeriod, getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { differenceInDays, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';
import { GovernanceLockBanner } from '@/components/review/GovernanceLockBanner';
import { normalizeText, normalizeKpiKey } from '@/lib/orgKpiKey';

/**
 * Local aliases that delegate to the canonical helpers in src/lib/orgKpiKey.ts.
 * Keeping the short names avoids touching ~50+ call sites in this file.
 */
const nk = normalizeText;
const kpiKey = normalizeKpiKey;

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'entered' | 'propagated' | 'stuck'>('all');
  const [activeTab, setActiveTab] = useState<'entry' | 'suggestions' | 'owners'>('entry');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  // Impact sheet state
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactTarget, setImpactTarget] = useState<{ categoryId: string; kraName: string; kpiName: string; achievedValue: number | null } | null>(null);

  // Data queries - use the new hook that filters by employee mapping
  const { data: orgLevelData, isLoading: kpisLoading } = useOrgLevelKpisWithEmployees(selectedPeriod, selectedYear);
  // ALL org-level KPIs (unfiltered) for Data Owners tab
  const { data: allOrgLevelKpis } = useOrgLevelKpis(selectedPeriod, selectedYear);
  const orgLevelKpis = useMemo(() => orgLevelData?.kpis?.map(k => k.kpi) || [], [orgLevelData]);
  // (kraSetEmpIdsByKey is built below, scope-aware, after mappedEmployeesMap is in scope)
  const employeeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    orgLevelData?.kpis?.forEach(k => {
      const key = kpiKey(k.kpi.category_id, k.kpi.kra_name, k.kpi.kpi_name);
      map.set(key, k.employeeCount);
    });
    return map;
  }, [orgLevelData]);
  const mappedDepartmentsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    orgLevelData?.kpis?.forEach(k => {
      const key = kpiKey(k.kpi.category_id, k.kpi.kra_name, k.kpi.kpi_name);
      map.set(key, new Set(k.departmentIds));
    });
    return map;
  }, [orgLevelData]);
  const mappedEmployeesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    orgLevelData?.kpis?.forEach(k => {
      const key = kpiKey(k.kpi.category_id, k.kpi.kra_name, k.kpi.kpi_name);
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
  const previewPropagation = usePreviewOrgKpiPropagation();
  const clearEntry = useClearOrgKpiEntry();

  // Phase A4 — pre-flight propagation preview state
  const [previewState, setPreviewState] = useState<{
    open: boolean;
    loading: boolean;
    result: PropagationPreviewResult | null;
    pendingExec: (() => Promise<void>) | null;
  }>({ open: false, loading: false, result: null, pendingExec: null });

  // Governance permissions check
  const governancePerms = useReviewPeriodPermissions(selectedPeriod, selectedYear);
  const governanceLocked = governancePerms.view_only || !governancePerms.edit_scores;
  const insertAuditLogs = useBatchInsertAuditLogs();
  const rollbackMutation = useRollbackOrgKpiPropagation();
  const bulkRollbackMutation = useBulkRollbackOrgKpiPropagation();
  const unmarkMutation = useUnmarkAsOrgLevel();

  // Per-employee target map and KPI IDs map from the hook (no separate query needed)
  const employeeTargetMap = orgLevelData?.perEmployeeTargetMap;
  const employeeKpiIdsMap = orgLevelData?.employeeKpiIdsMap;

  // Previous period data
  const prev = getPreviousPeriod(selectedPeriod, selectedYear);
  const { data: previousValues } = useOrgKpiValues(undefined, prev.period, prev.year);

  // Build previous values map
  const prevValuesMap = useMemo(() => {
    const map = new Map<string, number | null>();
    previousValues?.forEach(v => {
      const key = kpiKey(v.category_id, v.kra_name, v.kpi_name);
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
      const key = `${kpiKey(v.category_id, v.kra_name, v.kpi_name)}||${deptPart}||${empPart}`;
      map.set(key, v);
    });
    return map;
  }, [existingOrgValues]);

  // Filter by ownership
  const ownershipFilteredKpis = useMemo(() => {
    if (!orgLevelKpis) return [];
    if (isAdmin) return orgLevelKpis;
    return orgLevelKpis.filter(kpi => {
      const ownerKey = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
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

  // Per-definition set of employee_ids whose child kpis row is still 'kra_set'.
  // Used together with OKV.status to compute genuine "stuck" rows.
  const kraSetEmpIdsByKey = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const raw = (orgLevelData as any)?.kraSetEmpIdsByKey || {};
    Object.entries(raw).forEach(([k, ids]) => {
      map.set(k, new Set(ids as string[]));
    });
    return map;
  }, [orgLevelData]);

  // Helper: derive KPI status from OKV (existingValuesMap) + child kpis state.
  // CONTRACT (v2.66.7.22):
  //   pending    — no OKV value entered for this scope
  //   entered    — OKV exists but its status is NOT propagated/approved (still draft/sent_back/etc.)
  //   propagated — OKV.status is propagated/approved AND no relevant child KPI is still 'kra_set'
  //   stuck      — OKV.status is propagated/approved BUT at least one relevant child KPI is still 'kra_set'
  // Pre-propagation entered rows are NEVER 'stuck'. 'kra_set' alone is the normal starting state.
  const getKpiStatus = useCallback((kpi: typeof frequencyFilteredKpis[0]): 'pending' | 'entered' | 'propagated' | 'stuck' => {
    const scope = (kpi as any).org_level_scope || 'employee';
    const defKey = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
    const kraSetEmpIds = kraSetEmpIdsByKey.get(defKey) || new Set<string>();

    const isPropagatedOrApproved = (status: string | null | undefined) =>
      status === 'propagated' || status === 'approved';

    if (scope === 'organization') {
      const key = `${defKey}||null||null`;
      const val = existingValuesMap.get(key);
      const hasValue = (val?.achieved_value !== null && val?.achieved_value !== undefined) || val?.is_na;
      if (!hasValue) return 'pending';
      if (!isPropagatedOrApproved(val?.status)) return 'entered';
      // OKV claims propagated — only now does a kra_set child mean stuck.
      return kraSetEmpIds.size > 0 ? 'stuck' : 'propagated';
    }

    const prefix = `${defKey}||`;
    const currentEmpIds = mappedEmployeesMap.get(defKey);
    const currentDeptIds = mappedDepartmentsMap.get(defKey);
    const matching = Array.from(existingValuesMap.entries()).filter(([k, v]) => {
      if (!k.startsWith(prefix)) return false;
      if (!((v.achieved_value !== null && v.achieved_value !== undefined) || v.is_na)) return false;
      const parts = k.split('||');
      const empPart = parts[parts.length - 1];
      const deptPart = parts[parts.length - 2];
      if (scope === 'employee') {
        if (empPart === 'null') return false;
        if (currentEmpIds && currentEmpIds.size > 0 && !currentEmpIds.has(empPart)) return false;
        return true;
      }
      if (scope === 'department') {
        if (deptPart === 'null') return false;
        if (currentDeptIds && currentDeptIds.size > 0 && !currentDeptIds.has(deptPart)) return false;
        return true;
      }
      return true;
    });
    if (matching.length === 0) return 'pending';

    const allPropagated = matching.every(([, v]) => isPropagatedOrApproved(v.status));
    if (!allPropagated) return 'entered';

    // Scope-aware stuck check: only the relevant child kpis rows matter.
    if (scope === 'employee') {
      // Stuck iff at least one entered+propagated employee still has child status='kra_set'.
      const stuckHit = matching.some(([k]) => {
        const parts = k.split('||');
        const empId = parts[parts.length - 1];
        return kraSetEmpIds.has(empId);
      });
      return stuckHit ? 'stuck' : 'propagated';
    }
    if (scope === 'department') {
      // Stuck iff any kra_set child belongs to a propagated department in this definition.
      const propagatedDeptIds = new Set(
        matching.map(([k]) => k.split('||')[k.split('||').length - 2]).filter(d => d && d !== 'null')
      );
      const empToDept = new Map<string, string | null>();
      (allProfiles || []).forEach(p => empToDept.set(p.id, p.department_id ?? null));
      const stuckHit = Array.from(kraSetEmpIds).some(empId => {
        const d = empToDept.get(empId);
        return d ? propagatedDeptIds.has(d) : false;
      });
      return stuckHit ? 'stuck' : 'propagated';
    }
    return kraSetEmpIds.size > 0 ? 'stuck' : 'propagated';
  }, [existingValuesMap, mappedEmployeesMap, mappedDepartmentsMap, kraSetEmpIdsByKey, allProfiles]);

  // Filter by category, search, and status
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
    if (statusFilter !== 'all') {
      result = result.filter(k => getKpiStatus(k) === statusFilter);
    }
    return result;
  }, [frequencyFilteredKpis, selectedCategoryId, searchQuery, statusFilter, getKpiStatus]);

  // Compute data owner tiles data
  const ownerTilesData = useMemo(() => {
    if (!isAdmin) return [];
    const ownerMap = new Map<string, { ownerId: string; ownerName: string; totalKpis: number; enteredKpis: number }>();

    ownershipMap.forEach((val, ownerMapKey) => {
      // Check if this KPI is in the current filtered set (frequencyFilteredKpis)
      const isInScope = frequencyFilteredKpis.some(k =>
        kpiKey(k.category_id, k.kra_name, k.kpi_name) === ownerMapKey
      );
      if (!isInScope) return;

      const kpiStatus = (() => {
        const kpi = frequencyFilteredKpis.find(k =>
          kpiKey(k.category_id, k.kra_name, k.kpi_name) === ownerMapKey
        );
        return kpi ? getKpiStatus(kpi) : 'pending';
      })();
      const isEntered = kpiStatus === 'entered' || kpiStatus === 'propagated';

      val.owners.forEach(owner => {
        const existing = ownerMap.get(owner.owner_id) || {
          ownerId: owner.owner_id,
          ownerName: owner.owner?.full_name || owner.owner?.email || 'Unknown',
          totalKpis: 0,
          enteredKpis: 0,
        };
        existing.totalKpis++;
        if (isEntered) existing.enteredKpis++;
        ownerMap.set(owner.owner_id, existing);
      });
    });

    return Array.from(ownerMap.values()).sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [isAdmin, ownershipMap, frequencyFilteredKpis, getKpiStatus]);

  // Apply owner filter on top of filteredKpis
  const ownerFilteredKpis = useMemo(() => {
    if (!selectedOwnerId) return filteredKpis;
    return filteredKpis.filter(kpi => {
      const k = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
      const entry = ownershipMap.get(k);
      return entry?.owners.some(o => o.owner_id === selectedOwnerId);
    });
  }, [filteredKpis, selectedOwnerId, ownershipMap]);

  // Group by category
  const groupedKpis = useMemo(() => {
    const map = new Map<string, { categoryName: string; color: string; kpis: typeof ownerFilteredKpis }>();
    ownerFilteredKpis.forEach(kpi => {
      const catId = kpi.category_id;
      const catName = kpi.kra_categories?.name || 'Uncategorized';
      const color = kpi.kra_categories?.color || '#6B7280';
      const existing = map.get(catId) || { categoryName: catName, color, kpis: [] };
      existing.kpis.push(kpi);
      map.set(catId, existing);
    });
    return Array.from(map.entries());
  }, [ownerFilteredKpis]);

  // Scope KPIs for progress: respect owner filter
  const progressScopedKpis = useMemo(() => {
    if (!selectedOwnerId) return frequencyFilteredKpis;
    return frequencyFilteredKpis.filter(kpi => {
      const k = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
      const entry = ownershipMap.get(k);
      return entry?.owners.some(o => o.owner_id === selectedOwnerId);
    });
  }, [frequencyFilteredKpis, selectedOwnerId, ownershipMap]);

  // Progress calculation with 3-state tracking (scoped to selected owner)
  const progressData = useMemo(() => {
    const totalKpis = progressScopedKpis.length;
    let enteredKpis = 0;
    let propagatedKpis = 0;
    const categoryMap = new Map<string, { total: number; entered: number; propagated: number }>();

    progressScopedKpis.forEach(kpi => {
      const catId = kpi.category_id;
      const cat = categoryMap.get(catId) || { total: 0, entered: 0, propagated: 0 };
      cat.total++;

      const status = getKpiStatus(kpi);

      if (status === 'propagated') {
        propagatedKpis++;
        cat.propagated++;
      } else if (status === 'entered') {
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
      propagated: categoryMap.get(cat.id)?.propagated || 0,
    }));

    return { totalKpis, enteredKpis, propagatedKpis, categoryProgress };
  }, [progressScopedKpis, getKpiStatus, orgLevelCategories]);

  // Build card data for a KPI
  const buildCardData = useCallback((kpi: typeof filteredKpis[0]): OrgKpiCardData => {
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
    const catName = kpi.kra_categories?.name || '';
    const catColor = kpi.kra_categories?.color || '#6B7280';
    const key = `${kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name)}||null||null`;
    const existing = existingValuesMap.get(key);
    const prevK = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
    const previousValue = prevValuesMap.get(prevK) ?? null;
    const empCountKey = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
    const empCount = employeeCountMap.get(empCountKey) ?? 0;

    // Determine status using the shared helper (handles all scopes correctly)
    const status = getKpiStatus(kpi);

    // Build scoped rows for dept/employee
    let scopedRows: OrgKpiCardData['scopedRows'] = undefined;
    let scopeLabel: string | undefined;

    if (scope === 'department' && departments) {
      scopeLabel = 'Department';
      const kk = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
      const mappedDeptIds = mappedDepartmentsMap.get(kk);
      const filteredDepts = mappedDeptIds
        ? departments.filter(dept => mappedDeptIds.has(dept.id))
        : departments;
      const kpiMappedEmpIds = mappedEmployeesMap.get(kk);
      scopedRows = filteredDepts.map(dept => {
        const scopeKey = `${kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name)}||${dept.id}||null`;
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
            isNa: val?.is_na ?? false,
            targetValue: kpi.target_value ?? null,
            uom: kpi.uom ?? null,
            uomType: (kpi as any).uom_type || 'numeric',
            qualitativeOptions: (kpi as any).qualitative_options || null,
            subFactors: val?.sub_factors ?? undefined,
          };
      });
    } else if (scope === 'employee' && allProfiles) {
      scopeLabel = 'Employee';
      const kk2 = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
      const mappedEmpIds = mappedEmployeesMap.get(kk2);
      const filteredEmps = mappedEmpIds
        ? allProfiles.filter(emp => mappedEmpIds.has(emp.id))
        : allProfiles;
      scopedRows = filteredEmps
        .map(emp => {
          const dept = departments?.find(d => d.id === emp.department_id);
          const scopeKey = `${kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name)}||null||${emp.id}`;
          const val = existingValuesMap.get(scopeKey);
          // Per-employee target from their individual KPI record
          const empTargetKey = `${kk2}||${emp.id}`;
          const empTarget = employeeTargetMap?.[empTargetKey];
          return {
            scopeId: emp.id,
            scopeName: emp.full_name || emp.email,
            departmentName: dept?.name,
            designation: emp.designation ?? undefined,
            achievedValue: val?.achieved_value ?? null,
            remarks: val?.remarks ?? '',
            evidenceUrl: val?.evidence_url ?? null,
            isNa: val?.is_na ?? false,
            targetValue: empTarget?.target_value ?? null,
            uom: empTarget?.uom ?? null,
            uomType: (kpi as any).uom_type || 'numeric',
            qualitativeOptions: (kpi as any).qualitative_options || null,
            subFactors: val?.sub_factors ?? undefined,
          };
        })
        .sort((a, b) => {
          const deptA = a.departmentName ?? '';
          const deptB = b.departmentName ?? '';
          if (deptA !== deptB) return deptA.localeCompare(deptB);
          return a.scopeName.localeCompare(b.scopeName);
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
      isNa: existing?.is_na ?? false,
      uomType: (kpi as any).uom_type || 'numeric',
      qualitativeOptions: (kpi as any).qualitative_options || null,
      criteria: (kpi as any).criteria || null,
    };
  }, [existingValuesMap, prevValuesMap, departments, allProfiles, prev, employeeCountMap, mappedDepartmentsMap, mappedEmployeesMap, employeeTargetMap]);

  // Save handler for a single card
  const handleCardSave = useCallback(async (
    kpi: typeof filteredKpis[0],
    values: { achievedValue: number | null; remarks: string; evidenceUrl: string | null; isNa?: boolean; naRemarks?: string; scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null; isNa?: boolean; subFactors?: any }> }
  ) => {
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
    const toSave: Array<any> = [];
    const auditEntries: Array<any> = [];

    if (scope === 'organization') {
      const key = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||null||null`;
      const oldVal = existingValuesMap.get(key)?.achieved_value ?? null;
      toSave.push({
        category_id: kpi.category_id,
        kra_name: kpi.kra_name,
        kpi_name: kpi.kpi_name,
        review_period: selectedPeriod,
        review_year: selectedYear,
        achieved_value: values.isNa ? null : values.achievedValue,
        remarks: values.isNa ? (values.naRemarks || undefined) : (values.remarks || undefined),
        evidence_url: values.isNa ? null : values.evidenceUrl,
        entered_by: profile?.id,
        is_na: values.isNa ?? false,
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
          ? `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||${sv.scopeId}||null`
          : `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||null||${sv.scopeId}`;
        const oldVal = existingValuesMap.get(scopeKey)?.achieved_value ?? null;

        // Guard: skip if this would destructively overwrite a non-null DB value with null
        // (race condition protection — user never touched this row's achieved value)
        // BUT: always allow save if sub_factors are present (HR may have entered factors without achieved value)
        if (sv.achievedValue === null && !sv.isNa && oldVal !== null && !sv.subFactors) return;

        toSave.push({
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          achieved_value: sv.isNa ? null : sv.achievedValue,
          remarks: sv.isNa ? '' : (sv.remarks || undefined),
          evidence_url: sv.isNa ? null : sv.evidenceUrl,
          entered_by: profile?.id,
          department_id: isDept ? sv.scopeId : undefined,
          employee_id: !isDept ? sv.scopeId : undefined,
          is_na: sv.isNa ?? false,
          ...(sv.subFactors !== undefined ? { sub_factors: sv.subFactors } : {}),
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

  // Save & Propagate handler — internal executor (called after preview confirmation)
  const executeSaveAndPropagate = useCallback(async (
    kpi: typeof filteredKpis[0],
    values: Parameters<typeof handleCardSave>[1],
    filterEmployeeIds?: string[],
  ) => {
    await handleCardSave(kpi, values);
    const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
    
    // Track which scope IDs were actually propagated
    const propagatedScopeIds: string[] = [];
    
    // Track propagation results for completeness validation
    let totalPropagated = 0;
    // v2.66.8 — Aggregate skip totals across the per-scope loop so we can emit
    // ONE summary toast for the whole batch instead of N stacked toasts (the
    // previous "1 matching past initial stage" message that fired 13× silently).
    let totalSkippedBenign = 0;
    let totalSkippedHard = 0;
    const kk = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
    const expectedCount = employeeCountMap.get(kk) ?? 0;
    
    // Block propagation of blank data — scope-aware (v2.13.9)
    const isMissingData = scope === 'organization'
      ? (!values.isNa && values.achievedValue === null)
      : (!values.isNa && (!values.scopedValues ||
          !values.scopedValues.some(sv => sv.achievedValue !== null || sv.isNa)));

    if (isMissingData) {
      toast({
        title: 'Cannot propagate blank data',
        description: 'Please enter an achieved value or mark as N/A before propagating.',
        variant: 'destructive',
      });
      return;
    }

    if (scope === 'organization') {
      const result = await propagate.mutateAsync({
        categoryId: kpi.category_id,
        kraName: kpi.kra_name,
        kpiName: kpi.kpi_name,
        reviewPeriod: selectedPeriod,
        reviewYear: selectedYear,
        achievedValue: values.isNa ? null : values.achievedValue,
        scope: 'organization',
        isNa: values.isNa,
        naRemarks: values.naRemarks,
        remarks: values.remarks || undefined,
        evidenceUrl: values.evidenceUrl || undefined,
      });
      totalPropagated = result.propagatedCount;
      propagatedScopeIds.push('organization');
    } else if ((scope === 'department' || scope === 'employee') && values.scopedValues) {
      for (const sv of values.scopedValues) {
        // Skip if filterEmployeeIds provided and this scope isn't in the list
        if (filterEmployeeIds && !filterEmployeeIds.includes(sv.scopeId)) continue;
        if (sv.achievedValue === null && !sv.isNa) continue;
        // v2.65.4 — Block silent zero-propagation:
        // Skip rows that hold 0 but were not edited this session (stale Save value).
        // Owner must explicitly type a value (or 0) before Propagate writes it.
        if (!(sv as any)._touched && sv.achievedValue === 0 && !sv.isNa) continue;
        const result = await propagate.mutateAsync({
          categoryId: kpi.category_id,
          kraName: kpi.kra_name,
          kpiName: kpi.kpi_name,
          reviewPeriod: selectedPeriod,
          reviewYear: selectedYear,
          achievedValue: sv.isNa ? null : sv.achievedValue,
          scope,
          ...(scope === 'department' ? { departmentId: sv.scopeId } : { employeeId: sv.scopeId }),
          isNa: sv.isNa,
          remarks: sv.remarks || undefined,
          evidenceUrl: sv.evidenceUrl || undefined,
          // v2.66.8 — silence per-scope toasts; we emit one summary below
          silent: true,
        });
        totalPropagated += result.propagatedCount;
        // Aggregate skip reasons for the summary toast
        const skipped = result.skipped || [];
        for (const s of skipped) {
          if (s.reason === 'not_in_kra_set') totalSkippedBenign++;
          else totalSkippedHard++;
        }
        propagatedScopeIds.push(sv.scopeId);
      }

      // v2.66.8 — Single summary toast for the per-scope batch
      if (totalPropagated > 0 && (totalSkippedBenign + totalSkippedHard) === 0) {
        toast({
          title: `Propagated to ${totalPropagated} employee KPI(s)`,
          description: 'Review submissions updated with org-level values.',
        });
      } else if (totalPropagated > 0 && totalSkippedBenign > 0 && totalSkippedHard === 0) {
        toast({
          title: `Propagated to ${totalPropagated} employee KPI(s)`,
          description: `${totalSkippedBenign} already past the data-owner stage — their previously propagated values remain in place.`,
        });
      } else if (totalPropagated === 0 && totalSkippedBenign > 0 && totalSkippedHard === 0) {
        toast({
          title: 'Already propagated',
          description: `All ${totalSkippedBenign} matching KPI(s) have already advanced past the data-owner stage. Re-propagation is intentionally blocked once an employee has self-reviewed (POLICY §88).`,
        });
      } else if (totalSkippedHard > 0) {
        toast({
          title: `Propagation incomplete`,
          description: `${totalPropagated} updated, ${totalSkippedHard} could not be advanced (missing rows or race condition). Please refresh and retry.`,
          variant: 'destructive',
        });
      }
    }

    // Propagation completeness validation (PA3) — v2.66.10 skip-aware
    // Only flag a true gap. Benign skips (already past initial stage) are
    // already surfaced by the "Already propagated" toast above and must NOT
    // be reported as KPI-name mismatches.
    if (propagatedScopeIds.length > 0 && expectedCount > 0 && totalPropagated < expectedCount) {
      const accountedSkips = totalSkippedBenign + totalSkippedHard;
      const unaccounted = Math.max(0, expectedCount - totalPropagated - accountedSkips);
      if (totalSkippedHard > 0) {
        toast({
          title: `Partial propagation: ${totalPropagated}/${expectedCount} updated`,
          description: `${totalSkippedHard} could not be advanced (missing rows or race condition). Please refresh and retry.`,
          variant: 'destructive',
        });
      } else if (unaccounted > 0) {
        toast({
          title: `Partial propagation: ${totalPropagated}/${expectedCount} employees updated`,
          description: `${unaccounted} employee(s) may have mismatched KPI names. Check the Pending Report for details.`,
          variant: 'destructive',
        });
      }
      // else: entire shortfall is benign (already self-reviewed) — no extra toast
    }

    // v2.65.6 — Half-propagation forward-guard
    // Detect employees with a kpis row for this (category, kra, kpi, period, year, is_org_level)
    // who did NOT receive a propagate call this session. Such rows would otherwise have their
    // org_kpi_values.status flipped to 'propagated' below while their kpis.status stays 'kra_set'
    // and no review_submissions row is created — the exact "half-propagation" defect.
    let missedEmployeeIds: string[] = [];
    if ((scope === 'department' || scope === 'employee') && propagatedScopeIds.length > 0) {
      try {
        const { data: allOrgKpiRows } = await supabase
          .from('kpis')
          .select('employee_id, profiles!kpis_employee_id_fkey(full_name, employee_code)')
          .eq('category_id', kpi.category_id)
          .ilike('kra_name', kpi.kra_name)
          .ilike('kpi_name', kpi.kpi_name)
          .eq('review_period', selectedPeriod)
          .eq('review_year', selectedYear)
          .eq('is_org_level', true);

        const expectedEmpIds = new Set((allOrgKpiRows || []).map(r => r.employee_id));
        const propagatedSet = new Set(propagatedScopeIds);
        // For department scope, propagatedScopeIds are department IDs — only check employee scope here
        if (scope === 'employee') {
          const missed = (allOrgKpiRows || []).filter(r => !propagatedSet.has(r.employee_id));
          missedEmployeeIds = missed.map(r => r.employee_id);
          if (missed.length > 0) {
            const names = missed.slice(0, 5).map((r: any) => r.profiles?.full_name || r.employee_id).join(', ');
            const suffix = missed.length > 5 ? ` +${missed.length - 5} more` : '';
            toast({
              title: `${missed.length} employee KPI(s) skipped during propagation`,
              description: `Not in current view — their org_kpi_values.status was NOT updated to keep state consistent. Missed: ${names}${suffix}. Use Data Repair → "Repair Orphaned Propagations" to fix historical rows.`,
              variant: 'destructive',
            });
          }
        }
      } catch (err) {
        // Non-blocking — guard failure should not block propagation
        console.warn('[OrgKpiDataEntry] Half-propagation guard query failed:', err);
      }
    }

    // Only update org_kpi_values status for rows that were actually propagated
    if (propagatedScopeIds.length > 0) {
      if (scope === 'organization') {
        // Org scope: update all rows for this KPI (single value propagated to all)
        await supabase
          .from('org_kpi_values')
          .update({ status: 'propagated', updated_at: new Date().toISOString() })
          .eq('category_id', kpi.category_id)
          .eq('kra_name', kpi.kra_name)
          .eq('kpi_name', kpi.kpi_name)
          .eq('review_period', selectedPeriod)
          .eq('review_year', selectedYear);
      } else if (scope === 'department') {
        for (const deptId of propagatedScopeIds) {
          await supabase
            .from('org_kpi_values')
            .update({ status: 'propagated', updated_at: new Date().toISOString() })
            .eq('category_id', kpi.category_id)
            .eq('kra_name', kpi.kra_name)
            .eq('kpi_name', kpi.kpi_name)
            .eq('review_period', selectedPeriod)
            .eq('review_year', selectedYear)
            .eq('department_id', deptId);
        }
      } else {
        for (const empId of propagatedScopeIds) {
          await supabase
            .from('org_kpi_values')
            .update({ status: 'propagated', updated_at: new Date().toISOString() })
            .eq('category_id', kpi.category_id)
            .eq('kra_name', kpi.kra_name)
            .eq('kpi_name', kpi.kpi_name)
            .eq('review_period', selectedPeriod)
            .eq('review_year', selectedYear)
            .eq('employee_id', empId);
        }
      }
    }

    // Write propagation audit log entries
    if (propagatedScopeIds.length > 0) {
      const propagationAuditEntries: Array<any> = [];
      if (scope === 'organization') {
        propagationAuditEntries.push({
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          action: 'propagated',
          performed_by: profile?.id || '',
          new_value: values.isNa ? null : values.achievedValue,
          remarks: `Propagated to ${totalPropagated} employee(s)`,
        });
      } else if (values.scopedValues) {
        for (const sv of values.scopedValues) {
          if (!propagatedScopeIds.includes(sv.scopeId)) continue;
          propagationAuditEntries.push({
            category_id: kpi.category_id,
            kra_name: kpi.kra_name,
            kpi_name: kpi.kpi_name,
            review_period: selectedPeriod,
            review_year: selectedYear,
            action: 'propagated',
            performed_by: profile?.id || '',
            new_value: sv.isNa ? null : sv.achievedValue,
            remarks: `Scope: ${sv.scopeId}`,
          });
        }
      }
      if (propagationAuditEntries.length > 0) {
        try { await insertAuditLogs.mutateAsync(propagationAuditEntries); } catch { /* non-blocking */ }
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
  }, [handleCardSave, propagate, selectedPeriod, selectedYear, queryClient, profile?.id, insertAuditLogs, employeeCountMap]);

  /**
   * Phase A4 — Pre-flight propagation gate.
   * Resolves matching KPI ids, asks the read-only preview RPC how many will
   * actually advance, then opens a confirmation dialog. The live propagation
   * RPC only runs if the user confirms.
   */
  const handleCardSaveAndPropagate = useCallback(async (
    kpi: typeof filteredKpis[0],
    values: Parameters<typeof handleCardSave>[1],
    filterEmployeeIds?: string[],
  ) => {
    // Resolve the candidate kpi_ids using the same matching rules as the live RPC.
    let candidateIds: string[] = [];
    try {
      const escapedKra = kpi.kra_name.replace(/[%_]/g, '\\$&');
      const escapedKpi = kpi.kpi_name.replace(/[%_]/g, '\\$&');
      const { data: rows } = await supabase
        .from('kpis')
        .select('id, employee_id')
        .eq('category_id', kpi.category_id)
        .ilike('kra_name', escapedKra)
        .ilike('kpi_name', escapedKpi)
        .eq('review_period', selectedPeriod)
        .eq('review_year', selectedYear)
        .eq('is_org_level', true);

      let allRows = rows || [];
      const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
      if (scope === 'employee' && Array.isArray(filterEmployeeIds) && filterEmployeeIds.length > 0) {
        allRows = allRows.filter(r => filterEmployeeIds.includes(r.employee_id));
      }
      candidateIds = allRows.map(r => r.id);
    } catch (err) {
      console.warn('[OrgKpiDataEntry] preview candidate resolution failed:', err);
    }

    // Open dialog in loading state, fetch preview
    setPreviewState({
      open: true,
      loading: true,
      result: null,
      pendingExec: () => executeSaveAndPropagate(kpi, values, filterEmployeeIds),
    });

    try {
      const result = await previewPropagation.mutateAsync({ kpiIds: candidateIds });
      setPreviewState((s) => ({ ...s, loading: false, result }));
    } catch (err: any) {
      setPreviewState({ open: false, loading: false, result: null, pendingExec: null });
      toast({
        title: 'Could not preview propagation',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [selectedPeriod, selectedYear, previewPropagation, executeSaveAndPropagate, toast]);

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
      const key = `${kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name)}||null||null`;
      const existing = existingValuesMap.get(key);
      const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
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

  // Pending report data — granular rows per scope target
  const pendingReportRows = useMemo((): PendingReportRow[] => {
    const rows: PendingReportRow[] = [];
    const periodStart = parse(`1 ${selectedPeriod} ${selectedYear}`, 'd MMMM yyyy', new Date());
    const today = new Date();
    const daysSincePeriodStart = Math.max(0, differenceInDays(today, periodStart));

    frequencyFilteredKpis.forEach(kpi => {
      const scope = ((kpi as any).org_level_scope as string) || 'employee';
      const kk = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
      const ownerEntry = ownershipMap.get(kk);
      const ownerNames = ownerEntry?.owners?.map(o => o.owner?.full_name || 'Unknown').join(', ') || '';
      const ownerEmails = ownerEntry?.owners?.map(o => o.owner?.email || '').filter(Boolean).join(', ') || '';
      const prevValue = prevValuesMap.get(kk) ?? null;
      const empCount = employeeCountMap.get(kk) ?? null;
      const freq = (kpi as any).frequency || '';

      const baseRow = {
        category: kpi.kra_categories?.name || '',
        kraName: kpi.kra_name,
        kpiName: kpi.kpi_name,
        target: kpi.target_value,
        uom: kpi.uom,
        scope: scope.charAt(0).toUpperCase() + scope.slice(1),
        dataOwners: ownerNames,
        dataOwnerEmails: ownerEmails,
        r5: kpi.r5 ?? '',
        r4: kpi.r4 ?? '',
        r3: kpi.r3 ?? '',
        r2: kpi.r2 ?? '',
        r1: kpi.r1 ?? '',
        frequency: freq,
        previousValue: prevValue,
        employeeCount: empCount,
      };

      if (scope === 'organization') {
        const valKey = `${kk}||null||null`;
        const val = existingValuesMap.get(valKey);
        const hasValue = val?.achieved_value !== null && val?.achieved_value !== undefined;
        const isPropagated = val?.status === 'propagated' || val?.status === 'approved';
        const isStuck = hasValue && isPropagated && (kraSetEmpIdsByKey.get(kk)?.size ?? 0) > 0;
        const status = hasValue
          ? (isStuck ? 'Stuck' : (isPropagated ? 'Propagated' : 'Entered'))
          : 'Pending';
        rows.push({
          ...baseRow,
          status: status as PendingReportRow['status'],
          department: '',
          employee: '',
          employeeCode: '',
          achievedValue: val?.achieved_value ?? null,
          remark: val?.remarks ?? '',
          daysPending: status === 'Pending' ? daysSincePeriodStart : null,
          daysSinceLastUpdate: (status !== 'Pending' && val?.updated_at) ? differenceInDays(today, new Date(val.updated_at)) : null,
        });
      } else if (scope === 'department' && departments) {
        const mappedDeptIds = mappedDepartmentsMap.get(kk);
        const filteredDepts = mappedDeptIds
          ? departments.filter(d => mappedDeptIds.has(d.id))
          : departments;
        filteredDepts.forEach(dept => {
          const valKey = `${kk}||${dept.id}||null`;
          const val = existingValuesMap.get(valKey);
          const hasValue = val?.achieved_value !== null && val?.achieved_value !== undefined;
          const isPropagated = val?.status === 'propagated' || val?.status === 'approved';
          // Department-stuck: any kra_set employee in this department.
          const kraSetEmps = kraSetEmpIdsByKey.get(kk);
          const hasDeptStuckEmp = !!kraSetEmps && (allProfiles || []).some(
            p => p.department_id === dept.id && kraSetEmps.has(p.id)
          );
          const isStuck = hasValue && isPropagated && hasDeptStuckEmp;
          const status = hasValue
            ? (isStuck ? 'Stuck' : (isPropagated ? 'Propagated' : 'Entered'))
            : 'Pending';
          rows.push({
            ...baseRow,
            status: status as PendingReportRow['status'],
            department: dept.name,
            employee: '',
            employeeCode: '',
            achievedValue: val?.achieved_value ?? null,
            remark: val?.remarks ?? '',
            daysPending: status === 'Pending' ? daysSincePeriodStart : null,
            daysSinceLastUpdate: (status !== 'Pending' && val?.updated_at) ? differenceInDays(today, new Date(val.updated_at)) : null,
          });
        });
      } else if (scope === 'employee' && allProfiles) {
        const mappedEmpIds = mappedEmployeesMap.get(kk);
        const filteredEmps = mappedEmpIds
          ? allProfiles.filter(emp => mappedEmpIds.has(emp.id))
          : allProfiles;
        filteredEmps.forEach(emp => {
          const dept = departments?.find(d => d.id === emp.department_id);
          const valKey = `${kk}||null||${emp.id}`;
          const val = existingValuesMap.get(valKey);
          const hasValue = val?.achieved_value !== null && val?.achieved_value !== undefined;
          const isPropagated = val?.status === 'propagated' || val?.status === 'approved';
          // Employee-stuck: only this employee's child KPI being kra_set counts.
          const isStuck = hasValue && isPropagated && !!kraSetEmpIdsByKey.get(kk)?.has(emp.id);
          const status = hasValue
            ? (isStuck ? 'Stuck' : (isPropagated ? 'Propagated' : 'Entered'))
            : 'Pending';
          rows.push({
            ...baseRow,
            status: status as PendingReportRow['status'],
            department: dept?.name || '',
            employee: emp.full_name || emp.email,
            employeeCode: (emp as any).employee_code || '',
            achievedValue: val?.achieved_value ?? null,
            remark: val?.remarks ?? '',
            daysPending: status === 'Pending' ? daysSincePeriodStart : null,
            daysSinceLastUpdate: (status !== 'Pending' && val?.updated_at) ? differenceInDays(today, new Date(val.updated_at)) : null,
          });
        });
      }
    });

    return rows;
  }, [frequencyFilteredKpis, existingValuesMap, ownershipMap, prevValuesMap, employeeCountMap, departments, allProfiles, mappedDepartmentsMap, mappedEmployeesMap, selectedPeriod, selectedYear, kraSetEmpIdsByKey]);
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

      {/* Governance Lock Banner */}
      {!governancePerms.isLoading && governanceLocked && (
        <GovernanceLockBanner permissions={governancePerms} viewLevel="employee" />
      )}

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
                <OrgKpiPendingReport rows={pendingReportRows} reviewPeriod={selectedPeriod} reviewYear={selectedYear} />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={isSendingReminder}
                  onClick={async () => {
                    setIsSendingReminder(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('send-pending-report-reminder', {
                        body: { review_period: selectedPeriod, review_year: selectedYear },
                      });
                      // Check data.error first — the SDK sets `error` for any non-2xx,
                      // but the function returns a JSON body with the real message
                      if (data?.error) throw new Error(data.error);
                      if (error) throw error;
                      toast({
                        title: 'Reminder Sent',
                        description: `Notified ${data?.owners_notified ?? 0} data owner(s) about ${data?.total_pending ?? 0} pending KPI(s).`,
                      });
                    } catch (err: any) {
                      toast({ title: 'Failed to Send Reminder', description: err.message, variant: 'destructive' });
                    } finally {
                      setIsSendingReminder(false);
                    }
                  }}
                >
                  {isSendingReminder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Reminder
                </Button>
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
              propagatedKpis={progressData.propagatedKpis}
              categoryProgress={progressData.categoryProgress}
            />
          </CardContent>
        </Card>
      )}

      {/* Status Filter Chips */}
      {frequencyFilteredKpis.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all' as const, label: 'All', count: progressData.totalKpis },
              { key: 'pending' as const, label: 'Pending', count: progressData.totalKpis - progressData.enteredKpis - progressData.propagatedKpis },
              { key: 'entered' as const, label: 'Entered', count: progressData.enteredKpis },
              { key: 'propagated' as const, label: 'Propagated', count: progressData.propagatedKpis },
              { key: 'stuck' as const, label: 'Stuck (admin repair)', count: frequencyFilteredKpis.filter(k => getKpiStatus(k) === 'stuck').length },
            ]).map(f => (
              <Badge
                key={f.key}
                variant={statusFilter === f.key ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label} ({f.count})
              </Badge>
            ))}
          </div>
          {(() => {
            const pendingRows = pendingReportRows.filter(r => r.status === 'Pending');
            const pendingAssignments = pendingRows.length;
            const pendingKpis = new Set(
              pendingRows.map(r => `${r.category}||${r.kraName}||${r.kpiName}`)
            ).size;
            if (pendingAssignments === 0) return null;
            return (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{pendingKpis} KPI{pendingKpis === 1 ? '' : 's'} pending</span>
                {' '}(covering {pendingAssignments} employee assignment{pendingAssignments === 1 ? '' : 's'}). One card = one KPI to enter; the Pending Report lists each employee assignment individually.
              </p>
            );
          })()}
        </div>
      )}

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

      {/* Data Owner Filter Tiles */}
      {isAdmin && activeTab === 'entry' && ownerTilesData.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={selectedOwnerId === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedOwnerId(null)}
          >
            All ({frequencyFilteredKpis.length})
          </Badge>
          {ownerTilesData.map(owner => (
            <Badge
              key={owner.ownerId}
              variant={selectedOwnerId === owner.ownerId ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedOwnerId(owner.ownerId)}
            >
              {owner.ownerName} ({owner.enteredKpis}/{owner.totalKpis})
            </Badge>
          ))}
        </div>
      )}

      {/* Owner Management Tab */}
      {activeTab === 'owners' && isAdmin && (
        <OrgKpiOwnerManagement kpiDefinitions={allKpiDefinitions} reviewPeriod={selectedPeriod} reviewYear={selectedYear} />
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
            const catPending = group.kpis.filter(kpi => getKpiStatus(kpi) === 'pending').length;
            const catEntered = group.kpis.filter(kpi => getKpiStatus(kpi) === 'entered').length;
            const catPropagated = group.kpis.filter(kpi => getKpiStatus(kpi) === 'propagated').length;

            return (
              <div key={catId} className="space-y-3">
                {/* Category Header */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                  <h2 className="text-lg font-semibold text-foreground">{group.categoryName}</h2>
                  <div className="flex gap-1.5 text-xs">
                    {catPending > 0 && <Badge variant="outline" className="text-xs">{catPending} Pending</Badge>}
                    {catEntered > 0 && <Badge variant="secondary" className="text-xs">{catEntered} Entered</Badge>}
                    {catPropagated > 0 && <Badge variant="default" className="text-xs">{catPropagated} Propagated</Badge>}
                  </div>
                </div>

                {/* KPI Cards */}
                {group.kpis.map(kpi => {
                  const cardData = buildCardData(kpi);
                  const scope = ((kpi as any).org_level_scope as OrgLevelScope) || 'employee';
                  const empKpiK = kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
                  const empKpiIds = scope === 'employee' ? employeeKpiIdsMap?.[empKpiK] : undefined;
                  return (
                    <OrgKpiEntryCard
                      key={`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${selectedPeriod}||${selectedYear}`}
                      data={cardData}
                      reviewPeriod={selectedPeriod}
                      reviewYear={selectedYear}
                      isAdmin={isAdmin}
                      governanceLocked={governanceLocked}
                      employeeKpiIds={empKpiIds}
                      onSave={(values) => handleCardSave(kpi, values)}
                      onSaveAndPropagate={(values, filterIds) => handleCardSaveAndPropagate(kpi, values, filterIds)}
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
                        const key = `${kpiKey(kpi.category_id, kpi.kra_name, kpi.kpi_name)}||null||null`;
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
                      onBulkRollback={isAdmin ? async (reason: string) => {
                        await bulkRollbackMutation.mutateAsync({
                          kraName: kpi.kra_name,
                          kpiName: kpi.kpi_name,
                          reviewPeriod: selectedPeriod,
                          reviewYear: selectedYear,
                          reason,
                        });
                      } : undefined}
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
                      onClearEntry={isAdmin ? async () => {
                        await clearEntry.mutateAsync({
                          categoryId: kpi.category_id,
                          kraName: kpi.kra_name,
                          kpiName: kpi.kpi_name,
                          reviewPeriod: selectedPeriod,
                          reviewYear: selectedYear,
                        });
                        try {
                          await insertAuditLogs.mutateAsync([{
                            category_id: kpi.category_id,
                            kra_name: kpi.kra_name,
                            kpi_name: kpi.kpi_name,
                            review_period: selectedPeriod,
                            review_year: selectedYear,
                            action: 'cleared',
                            performed_by: profile?.id || '',
                          }]);
                        } catch { /* non-blocking */ }
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

      {/* Phase A4 — Pre-flight propagation preview */}
      <PropagationPreviewDialog
        open={previewState.open}
        isLoading={previewState.loading}
        preview={previewState.result}
        onCancel={() => setPreviewState({ open: false, loading: false, result: null, pendingExec: null })}
        onConfirm={async () => {
          const exec = previewState.pendingExec;
          setPreviewState({ open: false, loading: false, result: null, pendingExec: null });
          if (exec) await exec();
        }}
      />
    </div>
  );
}

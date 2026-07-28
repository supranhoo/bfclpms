import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Layers, RefreshCw, Search, EyeOff, Eye,
  Calendar, CalendarDays, Building2, Network, Factory, Users, Tag, UserCog, Target,
  IdCard, Award, Crosshair, X, UserCheck, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import {
  useDepartments,
  useBusinessUnits,
  useDivisions,
  useKraCategories,
} from '@/hooks/useOrganization';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBulkReviewFlag,
  useBulkScopePreview,
  useBulkReviewSnapshotAll,
  useBulkManagementApprove,
  useBulkWriteStageScores,
  useBulkSaveStageDrafts,
  useBulkOrgKpiFlags,
  useBulkEmployeeAttrs,
  useMyReviewScope,
  useStageReadyScope,
  type BulkScopeFilters,
  type BulkReviewRow,
} from '@/hooks/useBulkReview';
import { BulkCellDrawer } from '@/components/review/BulkCellDrawer';
import { BulkReviewMatrixGrid } from '@/components/review/BulkReviewMatrixGrid';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { BulkApproveDialog } from '@/components/review/BulkApproveDialog';
import { MultiSelectFilter } from '@/components/review/MultiSelectFilter';
import { readUrlArrays, writeUrlArrays } from '@/lib/bulkUrlState';
import { allowedViewerStages, clampViewerStage } from '@/lib/bulkReviewerStages';
import { useIsFunctionalManager } from '@/hooks/useIsFunctionalManager';
import {
  allowedEmployeeIds, distinctAttrOptions, BLANK_SENTINEL, type EmpAttrs,
  allowedOrgEmployeeIds, hasOrgFilter, type EmpOrgAttrs,
} from '@/lib/bulkEmployeeFilter';
import { bulkActionForStage } from '@/lib/bulkActionForStage';
import { summariseSkipReasons, summariseStageWriteOutcome } from '@/lib/summariseSkipReasons';
import { kpiRowKey as makeKpiRowKey } from '@/lib/bulkRowSelection';
import { isRowDueInPeriod } from '@/lib/bulkReviewDueFilter';
import { isRowInMyReviewScope, matchesCategoryFilter } from '@/lib/bulkAuditScopeFilter';
import { computeOrgKpiCoverageGaps } from '@/lib/orgKpiAuditCoverage';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarClock, ListChecks } from 'lucide-react';
import { useUrlFilterStateNullable } from '@/hooks/useUrlFilterState';
import { buildBulkSignoffImpact, type ImpactSummary } from '@/lib/bulkSignoffImpact';
import { useBulkSignoffPreviewData } from '@/hooks/useBulkSignoffPreviewData';
import type { CellInputs } from '@/lib/carriedScoreResolver';

// Full month names — must match kpis.review_period exactly (DB stores 'April', 'May', ...).
// Ordered by fiscal year (Apr → Mar) for display.
const PERIOD_OPTIONS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
];
const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];


/**
 * Bulk Review Dashboard (PRD v2.0, Phase 1 — M2 shell).
 *
 * Hard rules enforced here:
 *  - Mounts empty. No `kpis`/`review_submissions` reads on mount.
 *  - Filter changes only fire `bulk_scope_preview` (counts).
 *  - Snapshot RPC fires only after explicit "Load Scope" click.
 *  - 25k cell / 5MB payload cap disables Load button.
 *  - No realtime — manual Refresh pill only.
 */
export default function BulkReviewDashboard() {
  const { effectiveRole, user } = useAuth();
  const { toast } = useToast();
  const flagQuery = useBulkReviewFlag();
  const qc = useQueryClient();
  const isFunctionalManager = useIsFunctionalManager();

  const viewerStageOptions = useMemo(
    () => allowedViewerStages(effectiveRole, isFunctionalManager),
    [effectiveRole, isFunctionalManager],
  );

  const now = new Date();
  const defaultPeriod = CALENDAR_MONTHS[now.getMonth()] || 'April';
  const defaultYear = now.getFullYear();

  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [year, setYear] = useState<number>(defaultYear);
  const [viewerStage, setViewerStage] = useState<string>(
    effectiveRole === 'manager' ? 'manager'
      : effectiveRole === 'auditor' ? 'auditor'
      : effectiveRole === 'hr_pms' ? 'hr_pms'
      : effectiveRole === 'management' ? 'management'
      : effectiveRole === 'skip_level' ? 'skip_level'
      : 'manager'
  );
  // Clamp the (possibly URL- or default-seeded) viewerStage to the set of
  // stages the current user is actually allowed to act as. Runs whenever the
  // allowed list changes (e.g. after the FM-relationship query resolves).
  useEffect(() => {
    const next = clampViewerStage(viewerStage, viewerStageOptions);
    if (next && next !== viewerStage) setViewerStage(next);
  }, [viewerStage, viewerStageOptions]);
  // Multi-select state — empty array = "All". Persisted to URL query params.
  const initialUrl = useMemo(
    () => readUrlArrays(
      typeof window !== 'undefined' ? window.location.search : '',
      ['companies', 'divisions', 'bus', 'depts', 'cats', 'kras', 'desigs', 'grades', 'mgrs'],
    ),
    [],
  );
  const [companyIds, setCompanyIds] = useState<string[]>(initialUrl.companies);
  const [divisionIds, setDivisionIds] = useState<string[]>(initialUrl.divisions);
  const [businessUnitIds, setBusinessUnitIds] = useState<string[]>(initialUrl.bus);
  const [departmentIds, setDepartmentIds] = useState<string[]>(initialUrl.depts);
  const [categoryIds, setCategoryIds] = useState<string[]>(initialUrl.cats);
  const [kraNames, setKraNames] = useState<string[]>(initialUrl.kras);
  const [designations, setDesignations] = useState<string[]>(initialUrl.desigs);
  const [grades, setGrades] = useState<string[]>(initialUrl.grades);
  const [managerIds, setManagerIds] = useState<string[]>(initialUrl.mgrs);
  const [search, setSearch] = useState('');
  const [displayMode, setDisplayMode] = useState<'score' | 'wt' | 'both'>('score');
  const [hideEmpty, setHideEmpty] = useState(false);
  // Hide multi-month KPI rows whose cycle is not anchored to the selected
  // month (sibling placeholders). Default ON; user can toggle off to see the
  // full matrix including non-due rows. Persisted in localStorage.
  const [hideNonDue, setHideNonDue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('bulkReview.hideNonDue');
    return raw === null ? true : raw === 'true';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bulkReview.hideNonDue', String(hideNonDue));
    }
  }, [hideNonDue]);
  // "My audit scope only" — auditor-only toggle. Default ON: an auditor's
  // mental model is "show me what I have to review". Persisted in localStorage.
  const [myScopeOnly, setMyScopeOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('bulkReview.myScopeOnly');
    return raw === null ? true : raw === 'true';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('bulkReview.myScopeOnly', String(myScopeOnly));
    }
  }, [myScopeOnly]);
  // Admin-only "Stage-ready only" — when an admin uses the viewer-stage
  // dropdown to act AS another stage, hide rows whose previous workflow
  // stage has not yet been completed (e.g. don't show a self_review row in
  // the HR PMS view). Default ON; persisted in localStorage. Independent
  // of reviewer-identity scope (admins aren't a reviewer).
  const [adminStageReadyOnly, setAdminStageReadyOnly] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem('bulkReview.adminStageReadyOnly');
    return raw === null ? true : raw === 'true';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'bulkReview.adminStageReadyOnly',
        String(adminStageReadyOnly),
      );
    }
  }, [adminStageReadyOnly]);
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<BulkReviewRow | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  // Reviewer-entered inputs flow back from the dialog so we can recompute the
  // preview math live and forward them to the RPC at confirm time.
  const [dialogInputs, setDialogInputs] = useState<Map<string, CellInputs>>(new Map());
  const [dialogIsOverride, setDialogIsOverride] = useState(false);
  // URL-bound focus on a single KPI row (`<kra>|<kpi>`). Persists across
  // reloads and shareable via the URL — same convention as the other filters.
  const [kpiFocusKey, setKpiFocusKey] = useUrlFilterStateNullable('kpi');
  const approve = useBulkManagementApprove();
  const stageWrite = useBulkWriteStageScores();
  const stageDraft = useBulkSaveStageDrafts();
  // Stable batch id generated when the dialog opens; reused for storage scoping + RPC.
  const [batchId, setBatchId] = useState<string>('');

  const { companies } = useCompanyFilter();
  const { data: departments } = useDepartments();
  const { data: businessUnits } = useBusinessUnits();
  const { data: divisions } = useDivisions();
  const { data: categories } = useKraCategories();

  // URL persistence — push current arrays back into the query string. Empty
  // arrays are stripped (`writeUrlArrays`) so the URL stays clean on reset.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextSearch = writeUrlArrays(window.location.search, {
      companies: companyIds, divisions: divisionIds, bus: businessUnitIds,
      depts: departmentIds, cats: categoryIds, kras: kraNames,
      desigs: designations, grades, mgrs: managerIds,
    });
    const newUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }, [companyIds, divisionIds, businessUnitIds, departmentIds, categoryIds, kraNames,
      designations, grades, managerIds]);

  const filteredBusinessUnits = useMemo(() => {
    if (divisionIds.length === 0) return businessUnits ?? [];
    const set = new Set(divisionIds);
    return (businessUnits ?? []).filter((bu: any) => set.has(bu.division_id));
  }, [businessUnits, divisionIds]);
  const filteredDepartments = useMemo(() => {
    let list = departments ?? [];
    if (businessUnitIds.length > 0) {
      const set = new Set(businessUnitIds);
      list = list.filter((d: any) => set.has(d.business_unit_id));
    } else if (divisionIds.length > 0) {
      const buIds = new Set(filteredBusinessUnits.map((b: any) => b.id));
      list = list.filter((d: any) => buIds.has(d.business_unit_id));
    }
    return list;
  }, [departments, businessUnitIds, divisionIds, filteredBusinessUnits]);

  // Server-side `bulk_scope_preview` / `bulk_review_snapshot` accept a single
  // value per axis. When the user picks ONE option we forward it (so the cap
  // check is tight); when they pick multiple, we send `null` (broadest scope)
  // and apply the multi-filter client-side over `rawRows` below — same
  // pattern as the KRA filter shipped in v2.66.12.5.
  const oneOrNull = (arr: string[]): string | null => arr.length === 1 ? arr[0] : null;
  const filters: BulkScopeFilters = useMemo(() => ({
    department_id: oneOrNull(departmentIds),
    company_id: oneOrNull(companyIds),
    division_id: oneOrNull(divisionIds),
    business_unit_id: oneOrNull(businessUnitIds),
    category_id: oneOrNull(categoryIds),
  }), [departmentIds, companyIds, divisionIds, businessUnitIds, categoryIds]);

  const activeFilterCount =
    (companyIds.length > 0 ? 1 : 0) +
    (divisionIds.length > 0 ? 1 : 0) +
    (businessUnitIds.length > 0 ? 1 : 0) +
    (departmentIds.length > 0 ? 1 : 0) +
    (categoryIds.length > 0 ? 1 : 0) +
    (kraNames.length > 0 ? 1 : 0) +
    (designations.length > 0 ? 1 : 0) +
    (grades.length > 0 ? 1 : 0) +
    (managerIds.length > 0 ? 1 : 0);

  const invalidateScope = () => setScopeLoaded(false);

  const flagOn = flagQuery.data === true;

  const preview = useBulkScopePreview(period, year, filters, flagOn);
  // Matrix mode → accumulate every page so all mapped employees are reachable.
  // Flat / non-matrix usage (legacy) keeps the paged snapshot intact.
  const snapshotAll = useBulkReviewSnapshotAll(
    period, year, viewerStage, filters,
    flagOn && scopeLoaded,
  );
  const snapshot = snapshotAll;

  // Reset KRA selection whenever Category / Period / Year changes so a stale
  // KRA value never silently filters out everything.
  useEffect(() => {
    setKraNames([]);
  }, [categoryIds, period, year]);

  const capExceeded = preview.data?.cap_exceeded ?? false;
  const canLoad = flagOn && !!preview.data && !capExceeded && (preview.data?.cell_count ?? 0) > 0;

  const rawRows = snapshot.data?.rows ?? [];
  const kraOptionList = useMemo(() => {
    const set = new Set<string>();
    for (const r of rawRows) {
      const name = (r.kra_name ?? '').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawRows]);

  // Resolve a friendly label for the active KPI focus chip. Falls back to the
  // KPI portion of the key when the row isn't (yet) in the loaded snapshot.
  const focusedKpiLabel = useMemo(() => {
    if (!kpiFocusKey) return null;
    const hit = rawRows.find(r => makeKpiRowKey(r) === kpiFocusKey);
    if (hit) return `${hit.kra_name} · ${hit.kpi_name}`;
    return kpiFocusKey.replace('|', ' · ');
  }, [kpiFocusKey, rawRows]);

  // Employee attribute index (designation / grade / reporting manager) for
  // the currently loaded snapshot — backs the 3 employee-axis filters.
  const distinctEmpIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rawRows) if (r.employee_id) s.add(r.employee_id);
    return Array.from(s);
  }, [rawRows]);
  const empAttrsQ = useBulkEmployeeAttrs(distinctEmpIds, scopeLoaded);
  const attrsByEmp = useMemo(() => {
    const m = new Map<string, EmpAttrs>();
    for (const a of empAttrsQ.data ?? []) {
      m.set(a.id, {
        designation: a.designation,
        pms_grade: a.pms_grade,
        reporting_manager_id: a.reporting_manager_id,
      });
    }
    return m;
  }, [empAttrsQ.data]);
  const managerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of empAttrsQ.data ?? []) {
      if (a.reporting_manager_id && a.reporting_manager_name) {
        m.set(a.reporting_manager_id, a.reporting_manager_name);
      }
    }
    return m;
  }, [empAttrsQ.data]);
  const designationOptions = useMemo(
    () => distinctAttrOptions(attrsByEmp, 'designation'),
    [attrsByEmp],
  );
  const gradeOptions = useMemo(
    () => distinctAttrOptions(attrsByEmp, 'pms_grade'),
    [attrsByEmp],
  );
  const managerOptions = useMemo(() => {
    const ids = new Set<string>();
    attrsByEmp.forEach(a => { if (a.reporting_manager_id) ids.add(a.reporting_manager_id); });
    return Array.from(ids)
      .map(id => ({ value: id, label: managerNameById.get(id) ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [attrsByEmp, managerNameById]);
  const allowedEmpSet = useMemo(
    () => allowedEmployeeIds(attrsByEmp, designations, grades, managerIds),
    [attrsByEmp, designations, grades, managerIds],
  );

  // ADR-195 — Org-axis client-side filter. The server honours only ONE value
  // per axis (`oneOrNull`), so multi-selections must be enforced here or the
  // filter is a silent no-op (RCA: Ferro/CPP employees rendering while only
  // DRI + SMS divisions were selected).
  const orgByEmp = useMemo(() => {
    const m = new Map<string, EmpOrgAttrs>();
    for (const a of empAttrsQ.data ?? []) {
      m.set(a.id, {
        company_id: a.company_id ?? null,
        department_id: a.department_id ?? null,
        business_unit_id: a.business_unit_id ?? null,
        division_id: a.division_id ?? null,
      });
    }
    return m;
  }, [empAttrsQ.data]);
  const orgFilterActive = hasOrgFilter(companyIds, divisionIds, businessUnitIds, departmentIds);
  const allowedOrgEmpSet = useMemo(
    () => allowedOrgEmployeeIds(orgByEmp, companyIds, divisionIds, businessUnitIds, departmentIds),
    [orgByEmp, companyIds, divisionIds, businessUnitIds, departmentIds],
  );
  // Fail-closed: while the attribute hydration is in flight we cannot decide
  // membership, so an active org filter must not leak out-of-scope rows.
  const orgAttrsReady = !orgFilterActive || (!empAttrsQ.isLoading && !empAttrsQ.isError);

  // Workflow-driven "My scope" — pairs of (kpi_id, employee_id) where the
  // current user is the resolved reviewer at the active viewerStage for the
  // selected period. Replaces the prior auditor-only `useMyAuditScope` which
  // expanded employee-level audit assignments into every KPI of that
  // employee. The toggle is now meaningful for every reviewer stage.
  const isReviewerRole =
    effectiveRole === 'auditor'
    || effectiveRole === 'manager'
    || effectiveRole === 'hr_pms'
    || effectiveRole === 'skip_level'
    || effectiveRole === 'management';
  const myReviewScopeQ = useMyReviewScope(period, year, viewerStage, isReviewerRole);
  const myReviewScope = myReviewScopeQ.data;
  const isAuditor = effectiveRole === 'auditor';
  // Admin viewing-as another stage: enable stage-readiness filter.
  const isAdminViewer = effectiveRole === 'admin';
  const stageReadyScopeQ = useStageReadyScope(
    period, year, viewerStage, isAdminViewer,
  );
  const stageReadyScope = stageReadyScopeQ.data;
  // Fail-closed gate: while the admin role-ready scope is loading or errored,
  // we must NOT leak upstream rows into the actionable view. If the filter is
  // ON and the data isn't here yet, treat the role-ready set as empty.
  const stageReadyReady =
    !isAdminViewer
    || !adminStageReadyOnly
    || (!stageReadyScopeQ.isLoading && !stageReadyScopeQ.isError && !!stageReadyScope);

  /** Row predicate: is this row inside the current user's resolved-reviewer scope? */
  const isRowInMyScope = (r: BulkReviewRow): boolean =>
    !!myReviewScope && isRowInMyReviewScope(r, myReviewScope.pairs);

  // Multi-axis client-side filter over the snapshot.
  const loadedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const kraSet = new Set(kraNames);
    let rows = rawRows;
    if (kraSet.size > 0) {
      rows = rows.filter(r => kraSet.has(r.kra_name ?? ''));
    }
    if (term) {
      rows = rows.filter(r =>
        (r.kpi_name ?? '').toLowerCase().includes(term)
        || (r.kra_name ?? '').toLowerCase().includes(term)
        || (r.employee_name ?? '').toLowerCase().includes(term)
        || (r.employee_code ?? '').toLowerCase().includes(term),
      );
    }
    if (hideEmpty) {
      rows = rows.filter(r => {
        const scores = [r.self_score, r.manager_score, r.skip_level_score, r.hr_pms_score, r.auditor_score, r.management_score, r.final_score];
        return scores.some(s => s !== null && s !== undefined);
      });
    }
    if (hideNonDue) {
      rows = rows.filter(r => isRowDueInPeriod(r, period, year));
    }
    if (designations.length || grades.length || managerIds.length) {
      rows = rows.filter(r => allowedEmpSet.has(r.employee_id));
    }
    // Multi-value Company / Division / BU / Department (ADR-195).
    if (orgFilterActive) {
      rows = orgAttrsReady
        ? rows.filter(r => allowedOrgEmpSet.has(r.employee_id))
        : [];
    }
    // Multi-category client filter — server only honours single category
    // (oneOrNull). Without this branch, picking 2+ categories was a silent
    // no-op. Requires `category_id` returned by `bulk_review_snapshot`.
    if (categoryIds.length > 0) {
      rows = rows.filter(r => matchesCategoryFilter(r, categoryIds));
    }
    // Auditor "My audit scope only" — restrict to KPIs/employees assigned
    // to the current auditor. Hidden for other roles.
    if (isReviewerRole && myScopeOnly && myReviewScope) {
      rows = rows.filter(isRowInMyScope);
    }
    // Admin "Stage-ready only" — hide rows whose previous workflow stage
    // has not been completed yet (admin path; reviewer-identity is not
    // applicable). Mirrors the gate baked into my_review_scope for
    // reviewer roles.
    if (isAdminViewer && adminStageReadyOnly) {
      // Fail-closed: if the role-ready pair set is still loading/errored,
      // hide every row instead of silently showing the full scope.
      const pairs = stageReadyScope?.pairs ?? new Set<string>();
      rows = rows.filter(r => isRowInMyReviewScope(r, pairs));
    }
    return rows;
  }, [rawRows, search, hideEmpty, hideNonDue, period, year, kraNames, designations, grades, managerIds, allowedEmpSet, categoryIds, isReviewerRole, myScopeOnly, myReviewScope, isAdminViewer, adminStageReadyOnly, stageReadyScope, stageReadyReady]);

  // Count of currently-loaded rows that fall inside the auditor's scope —
  // surfaced as a muted chip so even with the toggle off the auditor knows
  // "X of Y rows are mine".
  const inMyScopeCount = useMemo(() => {
    if (!isReviewerRole || !myReviewScope) return 0;
    let n = 0;
    for (const r of rawRows) if (isRowInMyScope(r)) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReviewerRole, myReviewScope, rawRows]);

  // Prune stale selections when role-ready filter, scope, or stage changes
  // so a row selected in QA mode does not silently survive into a sign-off
  // batch after the user switches the filter ON. We intersect selectedIds
  // with the submission IDs of currently *visible/actionable* rows.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleSubIds = new Set<string>();
    for (const r of loadedRows) {
      if (r.submission_id) visibleSubIds.add(r.submission_id);
    }
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visibleSubIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
    // Intentionally watching loadedRows reference; selectedIds is read but
    // setter call is conditional so we avoid the lint loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedRows, viewerStage, adminStageReadyOnly, myScopeOnly]);

  // Count of rows hidden specifically by the non-due filter (post other filters
  // except non-due itself) — surfaced as a badge so users know how many rows
  // are being suppressed.
  const nonDueHiddenCount = useMemo(() => {
    if (!rawRows.length) return 0;
    let n = 0;
    for (const r of rawRows) {
      if (!isRowDueInPeriod(r, period, year)) n++;
    }
    return n;
  }, [rawRows, period, year]);

  // Org-KPI flags for the currently loaded snapshot.
  const distinctKpiIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rawRows) if (r.kpi_id) s.add(r.kpi_id);
    return Array.from(s);
  }, [rawRows]);
  const orgFlagsQ = useBulkOrgKpiFlags(distinctKpiIds, scopeLoaded);
  const isOrgByKpiId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of orgFlagsQ.data ?? []) m.set(f.kpi_id, f.is_org_level);
    return m;
  }, [orgFlagsQ.data]);

  // Org-KPI auditor coverage gaps (June 2026 RCA, "Sindhu Raj Singh / Adherence
  // to Manning Norms"). When an Org KPI is propagated to N employees but the
  // auditor's KPI/employee assignments cover K < N, the "My scope only" toggle
  // silently hides (N − K) cells. We surface that as a non-blocking soft alert
  // so the auditor can ask Admin to widen Audit Delegation instead of assuming
  // the KPI doesn't exist for those employees. Uses only data already in
  // memory — no new RPC.
  const orgKpiCoverageGaps = useMemo(() => {
    if (!isAuditor || !myReviewScope || rawRows.length === 0) return [];
    const orgIds = new Set<string>();
    for (const [kpiId, flag] of isOrgByKpiId) if (flag) orgIds.add(kpiId);
    if (orgIds.size === 0) return [];
    // Adapt the new pair-set into the legacy {employeeIds, kpiIds} shape the
    // coverage gap helper expects. Coverage now means "this (kpi,emp) pair
    // is in my resolved-reviewer scope" — same intent, stricter source.
    const empSet = new Set<string>();
    const kpiSet = new Set<string>();
    for (const p of myReviewScope.pairs) {
      const [k, e] = p.split('|');
      kpiSet.add(k); empSet.add(e);
    }
    return computeOrgKpiCoverageGaps(rawRows as any, orgIds, { employeeIds: empSet, kpiIds: kpiSet });
  }, [isAuditor, myReviewScope, rawRows, isOrgByKpiId]);

  // Prune stale selections when the scope changes so they don't silently hide
  // every row. We prune per-value (not full clear) so URL deep-links survive.
  useEffect(() => {
    if (!scopeLoaded || attrsByEmp.size === 0) return;
    const dSet = new Set(distinctAttrOptions(attrsByEmp, 'designation'));
    const gSet = new Set(distinctAttrOptions(attrsByEmp, 'pms_grade'));
    const mSet = new Set<string>();
    attrsByEmp.forEach(a => { if (a.reporting_manager_id) mSet.add(a.reporting_manager_id); });
    setDesignations(prev => prev.filter(v => dSet.has(v)));
    setGrades(prev => prev.filter(v => gSet.has(v)));
    setManagerIds(prev => prev.filter(v => mSet.has(v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeLoaded, attrsByEmp]);

  const variance = useMemo(() => {
    let count = 0;
    for (const r of loadedRows) {
      const scores = [
        r.self_score, r.manager_score, r.skip_level_score,
        r.hr_pms_score, r.auditor_score, r.management_score,
      ].filter((s): s is number => s !== null && s !== undefined);
      if (scores.length >= 2) {
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        if (max - min > 1.0) count++;
      }
    }
    return count;
  }, [loadedRows]);

  // ── Stage-ready breakdown (admin viewer) ────────────────────────────────
  // When the "<stage>-ready only" toggle is ON, admins frequently see counts
  // that look surprisingly low (e.g. "1 of 384"). The reason is that the
  // RPC `stage_ready_kpis` correctly excludes rows that are either upstream
  // (still waiting on a previous stage) or already past the viewer stage —
  // a row whose status equals or follows the viewer stage in canonical
  // order has been actioned (or moved beyond) and is not actionable now.
  //
  // We surface that "why" inline so reviewers like Vivek don't have to ask.
  // Counts are derived from rawRows + stageReadyScope.pairs only — no new
  // RPC, no extra round-trip. Order is the canonical workflow order; the
  // per-employee resolved workflow may skip stages, so the breakdown is a
  // best-effort hint, not a sign-off authority. Sign-off still routes
  // strictly through stage_ready_kpis (the pairs Set above).
  const stageReadyBreakdown = useMemo(() => {
    if (!isAdminViewer || !scopeLoaded) {
      return { ready: 0, past: 0, upstream: 0, noStage: 0, total: 0 };
    }
    const STATUS_ORDER = [
      'kra_set', 'self_review', 'manager_check', 'functional_manager_check',
      'skip_level_check', 'audit', 'hr_pms_review', 'management_review', 'approved',
    ];
    const VIEWER_TO_STATUS: Record<string, string> = {
      manager: 'manager_check',
      functional_manager: 'functional_manager_check',
      skip_level: 'skip_level_check',
      auditor: 'audit',
      hr_pms: 'hr_pms_review',
      management: 'management_review',
    };
    const target = VIEWER_TO_STATUS[viewerStage];
    const targetIdx = target ? STATUS_ORDER.indexOf(target) : -1;
    const pairs = stageReadyScope?.pairs ?? new Set<string>();
    let ready = 0, past = 0, upstream = 0, noStage = 0;
    for (const r of rawRows) {
      if (!r.kpi_id || !r.employee_id) continue;
      const key = `${r.kpi_id}|${r.employee_id}`;
      if (pairs.has(key)) { ready++; continue; }
      if (targetIdx < 0) { noStage++; continue; }
      const sIdx = STATUS_ORDER.indexOf((r.status ?? '') as string);
      if (sIdx < 0) noStage++;
      else if (sIdx >= targetIdx) past++;
      else upstream++;
    }
    return { ready, past, upstream, noStage, total: rawRows.length };
  }, [isAdminViewer, scopeLoaded, viewerStage, stageReadyScope, rawRows]);

  const bulkAction = bulkActionForStage(effectiveRole, viewerStage);
  const canApprove = !!bulkAction;
  const isActionPending = bulkAction?.kind === 'mgmt' ? approve.isPending : stageWrite.isPending;
  const canReopen = effectiveRole === 'admin' || effectiveRole === 'management';

  // ── Bulk Sign-off Impact Preview ────────────────────────────────────────
  // Only the selected rows in scope. Sign-off mode only (Management approve
  // doesn't use the cascade preview).
  const isSignoffMode = bulkAction?.kind === 'stage';
  const selectedRows = useMemo(
    () => loadedRows.filter(r => r.submission_id && selectedIds.has(r.submission_id)),
    [loadedRows, selectedIds],
  );
  const selectedKpiIds = useMemo(
    () => selectedRows.map(r => r.kpi_id).filter(Boolean) as string[],
    [selectedRows],
  );
  const selectedSubmissionIds = useMemo(
    () => selectedRows.map(r => r.submission_id!).filter(Boolean),
    [selectedRows],
  );
  const previewDataQ = useBulkSignoffPreviewData(
    selectedKpiIds,
    selectedSubmissionIds,
    confirmApprove && !!bulkAction,
  );
  const impactPreview: ImpactSummary | null = useMemo(() => {
    if (!confirmApprove || !bulkAction || !previewDataQ.data) return null;
    const stage = bulkAction.kind === 'stage'
      ? (bulkAction.stage as 'manager' | 'functional_manager' | 'skip_level' | 'hr_pms' | 'auditor')
      : 'management';
    return buildBulkSignoffImpact({
      stage,
      loadedRows: loadedRows as any,
      selectedSubmissionIds: new Set(selectedSubmissionIds),
      ruleByKpiId: previewDataQ.data.ruleByKpiId,
      achievedBySubmissionId: previewDataQ.data.achievedBySubmissionId,
      inputsBySubmissionId: dialogInputs,
      isOverride: dialogIsOverride,
    });
  }, [confirmApprove, previewDataQ.data, bulkAction, loadedRows, selectedSubmissionIds, dialogInputs, dialogIsOverride]);

  // submission_id → kpi_id (preview cells only carry kpi_name; we need id for
  // the UoM-aware Achieved input).
  const kpiIdBySubmissionId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of selectedRows) {
      if (r.submission_id && r.kpi_id) m.set(r.submission_id, r.kpi_id);
    }
    return m;
  }, [selectedRows]);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllFromMatrix = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  const openApproveDialog = () => {
    // Fresh batch id per open — guarantees storage isolation + RPC idempotency.
    setBatchId(typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setConfirmApprove(true);
  };

  const handleBulkApprove = async (
    reason: string,
    attachmentUrls: string[],
    extras?: {
      achievedValues?: Record<string, number | string | null>;
      isOverride?: boolean;
      isNa?: Record<string, boolean>;
      naReasons?: Record<string, string>;
    },
  ) => {
    const cells = loadedRows
      .filter(r => r.submission_id && selectedIds.has(r.submission_id))
      .map(r => ({ submission_id: r.submission_id!, expected_row_version: r.row_version ?? null }));
    if (cells.length === 0) return;
    if (!bulkAction) return;
    try {
      if (bulkAction.kind === 'mgmt') {
        const res = await approve.mutateAsync({
          cells,
          reason,
          attachment_urls: attachmentUrls,
          achieved_values: extras?.achievedValues ?? null,
          is_override: extras?.isOverride ?? false,
        });
        const advanced = (res as any).advanced ?? res.applied;
        const overrideCount = (res as any).override_count ?? 0;
        toast({
          title: `Approved ${res.applied} / ${cells.length}`,
          description: [
            `${advanced} advanced to APPROVED`,
            overrideCount > 0 ? `${overrideCount} via admin override` : null,
            summariseSkipReasons(res.skipped),
          ].filter(Boolean).join(' · '),
        });
      } else {
        // Stage sign-off: no `score` field → server inherits prior-stage value
        // (POLICY §111.7.a cascade) and reconciles kpis.status via
        // reconcile_workflow_statuses. Shared remark + evidence are persisted
        // onto the acted stage's *_remarks / *_evidence_urls columns
        // (POLICY §111.7.a — RCA 2026-05-25 v2.66.13.6).
        const res = await stageWrite.mutateAsync({
          stage: bulkAction.stage!,
          cells: cells.map(c => ({
            submission_id: c.submission_id,
            expected_row_version: c.expected_row_version,
          })),
          reason,
          attachment_urls: attachmentUrls,
          achieved_values: extras?.achievedValues,
          is_override: extras?.isOverride,
          is_na: extras?.isNa,
          na_reasons: extras?.naReasons,
        });
        // POLICY §111.7.c — toast must distinguish applied vs advanced vs
        // skipped instead of conflating them into a misleading "Signed off
        // N/M" headline. See summariseStageWriteOutcome unit tests.
        const advanced = (res as any).advanced;
        const summary = summariseStageWriteOutcome({
          total: cells.length,
          applied: res.applied ?? 0,
          advanced: typeof advanced === 'number' ? advanced : null,
          skipped: res.skipped ?? [],
          relocked: (res as any).relocked ?? 0,
          relockedNonTerminal: (res as any).relocked_non_terminal ?? 0,
          overrideApproved: (res as any).override_approved ?? 0,
        });
        toast({
          title: summary.title,
          description: summary.lines.join(' · '),
        });
      }
      setSelectedIds(new Set());
      setConfirmApprove(false);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const isDrift = msg.includes('bulk_advance_drift');
      toast({
        title: isDrift
          ? 'Approval stuck — escalate to admin'
          : bulkAction.kind === 'mgmt' ? 'Approval failed' : 'Sign-off failed',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  // POLICY §111.7.a.8 — Save the dialog's typed inputs as a draft against the
  // reviewer's own stage columns. NO workflow advancement, NO final-score
  // stamping. Reviewer can resume from the single-row scorecard or reopen the
  // bulk dialog later and the values pre-hydrate via reviewerDraftHydration.
  const handleSaveDraft = async (
    reason: string,
    attachmentUrls: string[],
    extras?: {
      achievedValues?: Record<string, number | string | null>;
      isNa?: Record<string, boolean>;
      naReasons?: Record<string, string>;
    },
  ) => {
    if (!bulkAction || bulkAction.kind !== 'stage' || !bulkAction.stage) return;
    const cells = loadedRows
      .filter(r => r.submission_id && selectedIds.has(r.submission_id))
      .map(r => ({ submission_id: r.submission_id!, expected_row_version: r.row_version ?? null }));
    if (cells.length === 0) return;
    try {
      const res = await stageDraft.mutateAsync({
        stage: bulkAction.stage,
        cells,
        reason,
        attachment_urls: attachmentUrls,
        achieved_values: extras?.achievedValues,
        is_na: extras?.isNa,
        na_reasons: extras?.naReasons,
      });
      const skipped = res.skipped ?? [];
      toast({
        title: `Draft saved for ${res.applied} of ${cells.length} cell${cells.length === 1 ? '' : 's'}`,
        description: [
          'Workflow not advanced — reviewers can resume from the KPI scorecard.',
          skipped.length > 0 ? summariseSkipReasons(skipped) : null,
        ].filter(Boolean).join(' · '),
      });
      setSelectedIds(new Set());
      setConfirmApprove(false);
    } catch (e: any) {
      toast({
        title: 'Saving draft failed',
        description: String(e?.message ?? e),
        variant: 'destructive',
      });
    }
  };

  // Flag OFF → hard refuse
  if (flagQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Bulk Review is disabled</AlertTitle>
          <AlertDescription>
            Bulk Review is disabled by your administrator. Please use the
            standard <Link to="/dashboard?view=team" className="underline">Team Reviews</Link> page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Sticky 2-row header — strict grid rhythm */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b shadow-sm">
        {/* Row 1 — identity · search · primary actions */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/40">
          {/* Title chip + inline counters */}
          <div className="flex items-center gap-2 shrink-0">
            <Layers className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold whitespace-nowrap">Bulk Review</h1>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Beta</Badge>
            {preview.isLoading ? (
              <Skeleton className="h-3 w-32 ml-1" />
            ) : preview.data ? (
              <span className="hidden md:flex items-center gap-2 ml-1 text-[11px] text-muted-foreground tabular-nums">
                <span><strong className="text-foreground">{preview.data.emp_count}</strong> emp</span>
                <span className="opacity-40">·</span>
                <span><strong className="text-foreground">{preview.data.kpi_count}</strong> KPI</span>
                <span className="opacity-40">·</span>
                <span>~{preview.data.est_payload_kb} KB</span>
                {scopeLoaded && snapshot.data && (
                  <>
                    <span className="opacity-40">·</span>
                    <span><strong className="text-foreground">{snapshot.data.rows?.length ?? 0}</strong>/<strong className="text-foreground">{snapshot.data.total ?? 0}</strong> rows</span>
                    <span className="opacity-40">·</span>
                    <span>Δ&gt;1: <strong className="text-foreground">{variance}</strong></span>
                    {isReviewerRole && myReviewScope && (
                      <>
                        <span className="opacity-40">·</span>
                        <span title="Rows where you are the resolved reviewer for the active stage (out of the loaded snapshot)">
                          <strong className="text-foreground">{inMyScopeCount}</strong> in my scope
                        </span>
                        {isAuditor && myScopeOnly && orgKpiCoverageGaps.length > 0 && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full text-amber-600 hover:bg-amber-500/10"
                                aria-label="Audit coverage gap details"
                                title="Audit coverage gap"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="start" className="w-[360px] text-xs">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                <span className="font-medium">
                                  Audit coverage gap on {orgKpiCoverageGaps.length} Org KPI{orgKpiCoverageGaps.length > 1 ? 's' : ''}
                                </span>
                              </div>
                              <p className="text-muted-foreground mb-2">
                                These Org KPIs exist for more employees than your Audit Delegation
                                covers. "My scope only" is hiding the uncovered cells. Ask Admin to
                                extend your KPI-level assignment, or toggle <strong>My scope only</strong> off
                                to inspect the missing rows read-only.
                              </p>
                              <ul className="space-y-0.5">
                                {orgKpiCoverageGaps.slice(0, 6).map((g) => (
                                  <li key={g.key} className="flex items-baseline gap-1.5">
                                    <span className="text-muted-foreground">·</span>
                                    <span className="truncate">{g.kpi_name}</span>
                                    <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0 ml-auto">
                                      {g.covered} of {g.total} covered
                                    </Badge>
                                  </li>
                                ))}
                                {orgKpiCoverageGaps.length > 6 && (
                                  <li className="text-muted-foreground">
                                    · …and {orgKpiCoverageGaps.length - 6} more
                                  </li>
                                )}
                              </ul>
                            </PopoverContent>
                          </Popover>
                        )}
                      </>
                    )}
                  </>
                )}
                {capExceeded && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[10px] ml-1">Scope too large</Badge>
                )}
              </span>
            ) : null}
          </div>

          {/* Search — anchored, fills middle */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search KPI / Employee…"
              className="pl-8 h-9"
              aria-label="Search KPI or employee"
            />
          </div>

          {/* Month + Year — moved next to search for quicker period switching */}
          <div className="flex items-center gap-2 shrink-0">
            <Select value={period} onValueChange={(v) => { setPeriod(v); invalidateScope(); }}>
              <SelectTrigger className="h-9 w-[120px] text-xs" aria-label="Month">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Month" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative w-[96px]">
              <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="number"
                value={year}
                onChange={(e) => { setYear(Number(e.target.value) || defaultYear); invalidateScope(); }}
                className="h-9 w-full pl-7 text-xs"
                aria-label="Year"
              />
            </div>
          </div>

          {/* Right action cluster */}
          <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-border/50">
            <Select
              value={viewerStage}
              onValueChange={setViewerStage}
              disabled={viewerStageOptions.length <= 1}
            >
              <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Reviewer stage">
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Stage" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {viewerStageOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9"
              disabled={!canLoad}
              onClick={() => { setScopeLoaded(true); }}
            >
              Load Scope
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
              )}
            </Button>
            {scopeLoaded && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  // Manual refresh — invalidate snapshot + dependent side-queries
                  // (org-KPI gap flags, employee attributes for filters) so a
                  // single click reflects external mapping/profile changes.
                  qc.invalidateQueries({ queryKey: ['bulk_review_snapshot_all'] });
                  qc.invalidateQueries({ queryKey: ['rpc_kpi_org_flags'] });
                  qc.invalidateQueries({ queryKey: ['bulk_employee_attrs'] });
                }}
                disabled={snapshot.isFetching}
                title="Refresh"
                aria-label="Refresh snapshot"
              >
                <RefreshCw className={`h-4 w-4 ${snapshot.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Row 2 — single-row filter bar; horizontal scroll when overflow */}
        <div className="flex items-stretch gap-2 px-2 sm:px-4 h-11 bg-muted/30">
          <div className="matrix-scroll flex flex-nowrap items-center gap-2 flex-1 min-w-0 overflow-x-auto">
            {/* Company */}
            {companies.length > 1 && (
              <MultiSelectFilter
                icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                label="Companies"
                width={160}
                values={companyIds}
                onChange={(v) => { setCompanyIds(v); invalidateScope(); }}
                options={companies.map(c => ({ value: c.id, label: c.name }))}
              />
            )}

            {/* Division */}
            <MultiSelectFilter
              icon={<Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Divisions"
              width={160}
              values={divisionIds}
              onChange={(v) => {
                setDivisionIds(v);
                setBusinessUnitIds([]); setDepartmentIds([]);
                invalidateScope();
              }}
              options={(divisions ?? []).map((d: any) => ({ value: d.id, label: d.name }))}
            />

            {/* Business Unit */}
            <MultiSelectFilter
              icon={<Factory className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="BU"
              width={160}
              values={businessUnitIds}
              onChange={(v) => {
                setBusinessUnitIds(v); setDepartmentIds([]); invalidateScope();
              }}
              options={filteredBusinessUnits.map((b: any) => ({ value: b.id, label: b.name }))}
            />

            {/* Department */}
            <MultiSelectFilter
              icon={<Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Departments"
              width={180}
              values={departmentIds}
              onChange={(v) => { setDepartmentIds(v); invalidateScope(); }}
              options={filteredDepartments.map((d: any) => ({ value: d.id, label: d.name }))}
            />

            {/* Category */}
            <MultiSelectFilter
              icon={<Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Categories"
              width={170}
              values={categoryIds}
              onChange={(v) => { setCategoryIds(v); invalidateScope(); }}
              options={(categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
            />

            {/* KRA — cascades from Category; client-side filter on accumulated snapshot */}
            <MultiSelectFilter
              icon={<Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="KRAs"
              width={180}
              values={kraNames}
              onChange={setKraNames}
              options={kraOptionList.map((name) => ({ value: name, label: name }))}
              disabled={!scopeLoaded}
              title={scopeLoaded ? undefined : 'Load scope to see KRAs'}
              emptyText="No KRAs in loaded scope"
            />

            {/* Designation — client-side from loaded snapshot's profiles */}
            <MultiSelectFilter
              icon={<IdCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Designations"
              width={180}
              values={designations}
              onChange={setDesignations}
              options={designationOptions.map((v) => ({
                value: v, label: v === BLANK_SENTINEL ? '(blank)' : v,
              }))}
              disabled={!scopeLoaded}
              title={scopeLoaded ? undefined : 'Load scope to see designations'}
              emptyText="No designations in loaded scope"
            />

            {/* Grade */}
            <MultiSelectFilter
              icon={<Award className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Grades"
              width={150}
              values={grades}
              onChange={setGrades}
              options={gradeOptions.map((v) => ({
                value: v, label: v === BLANK_SENTINEL ? '(blank)' : v,
              }))}
              disabled={!scopeLoaded}
              title={scopeLoaded ? undefined : 'Load scope to see grades'}
              emptyText="No grades in loaded scope"
            />

            {/* Reporting Manager */}
            <MultiSelectFilter
              icon={<UserCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              label="Reporting Managers"
              width={200}
              values={managerIds}
              onChange={setManagerIds}
              options={managerOptions}
              disabled={!scopeLoaded}
              title={scopeLoaded ? undefined : 'Load scope to see managers'}
              emptyText="No reporting managers in loaded scope"
            />
          </div>

          {/* View-mode pill — outside grid, anchored right */}
          <div className="flex items-center gap-1 rounded-md border bg-background p-0.5 shrink-0 self-center ml-2 pl-2 border-l border-border/50">
            <ToggleGroup
              type="single"
              value={displayMode}
              onValueChange={(v) => v && setDisplayMode(v as 'score' | 'wt' | 'both')}
              className="h-7"
            >
              <ToggleGroupItem value="wt" className="h-7 px-2 text-[11px]">Wt%</ToggleGroupItem>
              <ToggleGroupItem value="score" className="h-7 px-2 text-[11px]">Score</ToggleGroupItem>
              <ToggleGroupItem value="both" className="h-7 px-2 text-[11px]">Both</ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHideEmpty(v => !v)}
              aria-pressed={hideEmpty}
              aria-label={hideEmpty ? 'Show all rows' : 'Hide unscored rows'}
              title={hideEmpty ? 'Show all rows' : 'Hide unscored rows'}
            >
              {hideEmpty ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={hideNonDue ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={() => setHideNonDue(v => !v)}
                    aria-pressed={hideNonDue}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {hideNonDue ? 'Due only' : 'All cycles'}
                    {hideNonDue && nonDueHiddenCount > 0 && (
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] tabular-nums">
                        {nonDueHiddenCount}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                  {hideNonDue
                    ? `Showing only rows whose cycle's anchor month is ${period} ${year}. Multi-month KPI siblings and off-cycle rows are hidden${nonDueHiddenCount > 0 ? ` (${nonDueHiddenCount} row${nonDueHiddenCount === 1 ? '' : 's'} hidden)` : ' (none in this view)'}. Click to show all cycles.`
                    : `Showing all rows including multi-month KPI siblings that are not actionable in ${period}. Click to hide non-due rows.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isReviewerRole && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={myScopeOnly ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => setMyScopeOnly(v => !v)}
                      aria-pressed={myScopeOnly}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {myScopeOnly ? 'My scope only' : 'All in scope'}
                      {myReviewScope && (
                        <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] tabular-nums">
                          {myScopeOnly ? inMyScopeCount : myReviewScope.total}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[320px] text-xs">
                    {myScopeOnly
                      ? `Showing only KPIs currently waiting on your stage (${viewerStage.replace('_', ' ')}) — i.e. the previous stage has been completed and you are the resolved reviewer in ${period} ${year}. Rows still pending earlier stages are intentionally hidden. Click to see all loaded KPIs.`
                      : `Showing every KPI in the loaded scope, including those routed to other reviewers. Click to restrict to KPIs where you are the resolved ${viewerStage.replace('_', ' ')}.`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isAdminViewer && (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={adminStageReadyOnly ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => setAdminStageReadyOnly(v => !v)}
                      aria-pressed={adminStageReadyOnly}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      {adminStageReadyOnly
                        ? `${viewerStage.replace('_', ' ')}-ready only`
                        : 'All stages (QA)'}
                      {stageReadyScope && (
                        <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] tabular-nums">
                          {adminStageReadyOnly ? loadedRows.length : stageReadyScope.total}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[320px] text-xs">
                    {adminStageReadyOnly
                      ? `Admin role-ready view: only KPIs currently waiting at ${viewerStage.replace('_', ' ')} in ${period} ${year} are visible AND actionable. Upstream rows are hidden so they cannot accidentally be signed off. Click to switch to full QA view.`
                      : `Admin QA view: every KPI in scope is shown (including rows still pending earlier stages). Rows outside ${viewerStage.replace('_', ' ')} readiness are visible for inspection but should NOT be bulk-signed at this stage — switch the filter back ON before sign-off.`}
                    {stageReadyBreakdown.total > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5 tabular-nums">
                        <div className="font-medium text-foreground">Of {stageReadyBreakdown.total} loaded rows:</div>
                        <div>• {stageReadyBreakdown.ready} actionable at {viewerStage.replace('_', ' ')} now</div>
                        <div>• {stageReadyBreakdown.upstream} still waiting on a prior stage</div>
                        <div>• {stageReadyBreakdown.past} already at/past {viewerStage.replace('_', ' ')}</div>
                        <div>• {stageReadyBreakdown.noStage} on a workflow that doesn't include {viewerStage.replace('_', ' ')}</div>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!scopeLoaded && (
        <div className="p-3 md:p-4">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">Pick a scope and click Load Scope</p>
            <p className="text-sm">
              Nothing is fetched until you do — your dashboard stays fast and Cloud-friendly.
            </p>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Loaded grid */}
      {scopeLoaded && (
        <div className="px-2 md:px-3 pt-2 pb-3 space-y-2">
          {/* Active KPI focus chip — set via the focus icon in the matrix
              KPI cell. Clearing returns the matrix to all KPIs in scope. */}
          {kpiFocusKey && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1.5 pl-2 pr-1 h-6">
                <Crosshair className="h-3 w-3 text-primary" />
                <span className="font-medium">KPI focus:</span>
                <span className="max-w-[360px] truncate">{focusedKpiLabel}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-4 w-4 ml-0.5"
                  onClick={() => setKpiFocusKey(null)}
                  aria-label="Clear KPI focus"
                  title="Clear KPI focus"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </div>
          )}
          {snapshot.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : snapshot.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to load snapshot</AlertTitle>
                  <AlertDescription>{(snapshot.error as Error).message}</AlertDescription>
                </Alert>
              ) : loadedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No KPIs match the selected scope.
                </p>
              ) : (
                <>
                  <BulkReviewMatrixGrid
                    rows={loadedRows}
                    viewerStage={viewerStage}
                    selectedSubmissionIds={selectedIds}
                    onToggleSubmission={toggleOne}
                    onToggleAll={toggleAllFromMatrix}
                    onCellClick={setActiveRow}
                    displayMode={displayMode}
                    isOrgByKpiId={isOrgByKpiId}
                    kpiFocusKey={kpiFocusKey}
                    onFocusKpi={setKpiFocusKey}
                    onReplaceSelection={setSelectedIds}
                  />
                </>
              )}

              {/* Snapshot loads every page on Load Scope; employees scroll
                  horizontally with the KPI/KRA column frozen on the left. */}

          {/* Action toolbar */}
          {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-10 mx-auto max-w-fit">
              <Card className="shadow-lg">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <span className="text-sm font-medium">{selectedRows.length} selected</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                  {canApprove && bulkAction && (
                    <Button
                      size="sm"
                      onClick={openApproveDialog}
                      disabled={isActionPending}
                    >
                      {isActionPending ? bulkAction.pendingLabel : bulkAction.label}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <BulkCellDrawer
        row={activeRow}
        viewerStage={viewerStage}
        open={!!activeRow}
        onOpenChange={(o) => !o && setActiveRow(null)}
        canReopen={canReopen}
      />

      <BulkApproveDialog
        open={confirmApprove}
        cellCount={selectedRows.length}
        batchId={batchId || 'pending'}
        uploaderUserId={user?.id ?? 'anonymous'}
        isLoading={isActionPending}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={({ reason, attachmentUrls, achievedValues, isOverride, isNa, naReasons }) =>
          handleBulkApprove(reason, attachmentUrls, { achievedValues, isOverride, isNa, naReasons })
        }
        onSaveDraft={
          bulkAction?.kind === 'stage'
            ? ({ reason, attachmentUrls, achievedValues, isNa, naReasons }) =>
                handleSaveDraft(reason, attachmentUrls, { achievedValues, isNa, naReasons })
            : undefined
        }
        isSavingDraft={stageDraft.isPending}
        mode={bulkAction?.kind === 'stage' ? 'signoff' : 'approve'}
        stageLabel={
          bulkAction?.kind === 'stage'
            ? ({ manager: 'Manager', skip_level: 'Skip-Level', hr_pms: 'HR PMS', auditor: 'Auditor' } as const)[bulkAction.stage!]
            : undefined
        }
        preview={impactPreview}
        previewLoading={previewDataQ.isLoading}
        previewError={previewDataQ.error ? (previewDataQ.error as Error).message : null}
        ruleByKpiId={previewDataQ.data?.ruleByKpiId}
        kpiIdBySubmissionId={kpiIdBySubmissionId}
        isAdmin={effectiveRole === 'admin'}
        onInputsChange={(inputs, isOverride) => {
          setDialogInputs(inputs);
          setDialogIsOverride(isOverride);
        }}
      />
    </div>
  );
}

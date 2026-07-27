import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCycles, useTemplates, useRules, useCycleInstances, useActiveCycle, useTemplate,
  useSendBackStatus, useCloseCycle, useOverrideRating, useCloneTemplate, useCloneCycle,
  useAnnualReviewInstancesPaginated, useCycleStatusCounts, useReopenCycle,
  useInstanceStageScores, useRollbackFinalizedInstance,
} from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import { remapStageValueMapByDuplicates } from '@/lib/annualReview/displayStageForResponse';
import { rollbackTerminalLabel } from '@/lib/annualReview/rollbackTerminalStage';
import { canEditWorkflowAndReviewers } from '@/lib/annualReview/workflowEditVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  useBusinessUnits, useDepartments, useActiveProfilesLite, formatSafetyProfileLabel,
} from '@/hooks/useSafetyOrg';
import { usePmsGrades, useLevels } from '@/hooks/useOrganization';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { AccessControlTab } from '@/components/annual-review/AccessControlTab';
import { OrphanedReviewsTab } from '@/components/annual-review/OrphanedReviewsTab';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, Settings2, ListChecks, Calendar, Layers, Pencil, Plus, Download, BarChart3, CheckCheck, Undo2, Lock, Bell, Scale, Copy, Unlock, MoreHorizontal, Trash2, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { HrFinalizationSheet } from '@/components/annual-review/HrFinalizationSheet';
import { BulkActionsTab } from '@/components/annual-review/BulkActionsTab';
import { fyStartFromCycle } from '@/lib/annualReview/fiscalYear';
import { prevStatus } from '@/lib/annualReview/stageChain';
import { useKraDerivedRatingsForInstances } from '@/hooks/useKraDerivedRatingsForInstances';
import { isKraBasedTemplate } from '@/lib/annualReview/kraDerivedRating';
import { UnifiedBulkDialog } from '@/components/annual-review/UnifiedBulkDialog';
import { AnnualReviewExportMenu } from '@/components/annual-review/AnnualReviewExportMenu';
import { ChangeWorkflowDialog } from '@/components/annual-review/ChangeWorkflowDialog';
import { InstanceStageWeightsDialog } from '@/components/annual-review/InstanceStageWeightsDialog';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import { TemplateUploadDialog } from '@/components/annual-review/TemplateUploadDialog';
import { downloadTemplateFormatWorkbook, downloadFilledTemplateWorkbook } from '@/lib/annualReview/templateWorkbook';
import {
  useShowReviewerNamesInStepper,
  useSetShowReviewerNamesInStepper,
  useAutoReassignHrOnBuHeadChange,
  useSetAutoReassignHrOnBuHeadChange,
} from '@/hooks/useAnnualReviewSettings';
import { AssistedSubmissionSettings } from '@/components/admin/AssistedSubmissionSettings';
import { PilotAccessCard } from '@/components/annual-review/PilotAccessCard';
import { CycleBulkDataUploadDialog } from '@/components/annual-review/CycleBulkDataUploadDialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { previewHrFinalSync, applyHrFinalSync } from '@/services/annualReview/hrFinalSync';
import { RefreshCw } from 'lucide-react';
import { RecentStageWeightOverridesPanel } from '@/components/annual-review/RecentStageWeightOverridesPanel';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import { SyncAssignmentsDialog } from '@/components/annual-review/SyncAssignmentsDialog';
import {
  previewAudience, findSeededConflicts, type SeededConflict,
} from '@/services/annualReview/formMapping';
import { SystemKpiLibraryPanel } from '@/components/annual-review/SystemKpiLibraryPanel';
import { SystemKpiWeightMatrix } from '@/components/annual-review/SystemKpiWeightMatrix';
import { TemplateArchetypesPanel } from '@/components/annual-review/TemplateArchetypesPanel';
import { CriteriaLibraryPanel } from '@/components/annual-review/CriteriaLibraryPanel';
import { CriteriaMatrixPanel } from '@/components/annual-review/CriteriaMatrixPanel';
import type {
  AnnualReviewCycle, AnnualReviewTemplate, AssignmentFilters, AnnualReviewerRole,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import {
  resolveStageWeights, computeFinalScore, STAGE_WEIGHT_KEYS,
  type StageWeightKey, type StageWeights,
} from '@/lib/annualReview/finalScore';
import { computeCriteriaRatingOutOf5 } from '@/lib/annualReview/scoring';

export default function AnnualReviewAdmin() {
  const nav = useNavigate();
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Annual Review Admin</h1>
          <p className="text-sm text-muted-foreground">Manage cycles, templates, rules, and finalize reviews.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => nav('/annual-review/admin/mapping')}>
            <ListChecks className="h-4 w-4 mr-2" />
            Form Mapping
          </Button>
          <Button variant="outline" onClick={() => nav('/annual-review/admin/factory')}>
            <Layers className="h-4 w-4 mr-2" />
            Template Factory
          </Button>
        </div>
      </header>
      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="flex flex-wrap md:flex-nowrap w-full h-auto gap-1 p-1 overflow-x-auto justify-start">
          <TabsTrigger value="progress" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><ListChecks className="h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><BarChart3 className="h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="calibration" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Scale className="h-4 w-4" />Calibration</TabsTrigger>
          <TabsTrigger value="cycles" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Calendar className="h-4 w-4" />Cycles</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Settings2 className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Layers className="h-4 w-4" />Rules</TabsTrigger>
          <TabsTrigger value="system-kpis" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Scale className="h-4 w-4" />System KPIs</TabsTrigger>
          <TabsTrigger value="bulk" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Upload className="h-4 w-4" />Bulk Actions</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><Settings2 className="h-4 w-4" />Settings</TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><ShieldCheck className="h-4 w-4" />Access Control</TabsTrigger>
          <TabsTrigger value="orphans" className="gap-1.5 flex-1 md:flex-none whitespace-nowrap px-3"><ShieldCheck className="h-4 w-4" />Orphaned Reviews</TabsTrigger>
        </TabsList>
        <TabsContent value="progress" className="mt-4"><ProgressTab /></TabsContent>
        <TabsContent value="analytics" className="mt-4"><AnalyticsTab /></TabsContent>
        <TabsContent value="calibration" className="mt-4"><CalibrationTab /></TabsContent>
        <TabsContent value="cycles" className="mt-4"><CyclesTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
        <TabsContent value="system-kpis" className="mt-4">
          <div className="space-y-6">
            <TemplateArchetypesPanel />
            <SystemKpiLibraryPanel />
            <SystemKpiWeightMatrix />
            <CriteriaLibraryPanel />
            <CriteriaMatrixPanel />
          </div>
        </TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkActionsTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessControlTab /></TabsContent>
        <TabsContent value="orphans" className="mt-4"><OrphanedReviewsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Annual-Review-module settings panel. Currently exposes the
 * "show reviewer names in stepper" admin toggle (default OFF).
 */
function SettingsTab() {
  const { data: showNames = false, isLoading } = useShowReviewerNamesInStepper();
  const setMut = useSetShowReviewerNamesInStepper();
  const { data: autoHr = false, isLoading: autoHrLoading } = useAutoReassignHrOnBuHeadChange();
  const setAutoHrMut = useSetAutoReassignHrOnBuHeadChange();
  const { data: activeCycle } = useActiveCycle();
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPreview, setSyncPreview] = useState<number | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  async function openSyncDialog() {
    if (!activeCycle?.id) {
      toast.error('No active cycle. Start a cycle before syncing HR Final.');
      return;
    }
    setSyncBusy(true);
    try {
      const rows = await previewHrFinalSync(activeCycle.id);
      setSyncPreview(rows.length);
      setSyncOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncBusy(false);
    }
  }

  async function confirmSync() {
    if (!activeCycle?.id) return;
    setSyncBusy(true);
    try {
      const updated = await applyHrFinalSync(activeCycle.id);
      toast.success(
        updated === 0
          ? 'No HR Final assignments needed updating.'
          : `Updated HR Final on ${updated} instance${updated === 1 ? '' : 's'}.`,
      );
      setSyncOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="space-y-6">
    <PilotAccessCard />
    <Card>
      <CardHeader>
        <CardTitle>Bulk Data Upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Upload every employee&apos;s System KPI values and Eligibility inputs (Absent Days,
          LWP, LTI, STI, UA/UC/Near Miss, 5S, PM10, Production, Preventive Maintenance,
          Trainings, Disciplinary Action, etc.) from a <b>single spreadsheet</b>.
          Columns shared across forms (KRA / Management / Workmen / Trainee) collapse to
          one column — the system routes each value to the correct form automatically.
          Finalized and acknowledged rows are skipped.
        </p>
        <Button variant="outline" onClick={() => setBulkUploadOpen(true)} disabled={!activeCycle}>
          <Upload className="h-4 w-4 mr-2" /> Open Bulk Upload
        </Button>
        {!activeCycle && (
          <p className="text-xs text-muted-foreground">Start or activate a cycle to enable bulk upload.</p>
        )}
      </CardContent>
    </Card>
    <CycleBulkDataUploadDialog
      open={bulkUploadOpen}
      onOpenChange={setBulkUploadOpen}
      cycle={activeCycle ?? null}
    />
    <Card>
      <CardHeader>
        <CardTitle>Display Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Show reviewer names in workflow stepper</Label>
            <p className="text-xs text-muted-foreground max-w-xl">
              When ON, each stage in the Annual Review progress tracker displays the mapped
              reviewer&apos;s name (e.g. &ldquo;Ramesh Kumar&rdquo;) beneath the stage label.
              Stages whose reviewer slot is empty render &ldquo;— Unassigned&rdquo;.
            </p>
          </div>
          <Switch
            checked={showNames}
            disabled={isLoading || setMut.isPending}
            onCheckedChange={(v) => {
              setMut.mutate(v, {
                onSuccess: () => toast.success(`Reviewer names ${v ? 'enabled' : 'hidden'}.`),
                onError: (e) => toast.error((e as Error).message),
              });
            }}
          />
        </div>
        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Auto re-assign HR Final when HR BU Head changes
            </Label>
            <p className="text-xs text-muted-foreground max-w-xl">
              When ON, updating the HR Business Unit Head automatically re-points the
              <strong> HR Final </strong> approver on every <em>non-finalized</em>
              annual review instance to the new BU Head. Finalized reviews and instances
              with a manual per-instance reassignment are never touched.
            </p>
          </div>
          <Switch
            checked={autoHr}
            disabled={autoHrLoading || setAutoHrMut.isPending}
            onCheckedChange={(v) => {
              setAutoHrMut.mutate(v, {
                onSuccess: () =>
                  toast.success(`Auto re-assign HR Final ${v ? 'enabled' : 'disabled'}.`),
                onError: (e) => toast.error((e as Error).message),
              });
            }}
          />
        </div>
        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Sync HR Final to current BU Head now</Label>
            <p className="text-xs text-muted-foreground max-w-xl">
              One-time action. Re-points HR Final on every non-finalized instance in the
              active cycle to the current HR BU Head. Skips finalized reviews and
              instances with a manual override. Each change is audit-logged.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={openSyncDialog}
            disabled={syncBusy || !activeCycle?.id}
          >
            {syncBusy ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync now
          </Button>
        </div>
      </CardContent>
    </Card>
    <AssistedSubmissionSettings />
    <ConfirmDestructiveDialog
      open={syncOpen}
      onCancel={() => setSyncOpen(false)}
      onConfirm={confirmSync}
      isLoading={syncBusy}
      title="Sync HR Final to current BU Head?"
      description={
        syncPreview === null
          ? 'Computing preview...'
          : syncPreview === 0
            ? 'All non-finalized instances already point to the current HR BU Head. No changes will be made.'
            : `${syncPreview} non-finalized review instance${syncPreview === 1 ? '' : 's'} will be re-pointed to the current HR BU Head. Each change is audit-logged. Continue?`
      }
      confirmLabel={syncPreview && syncPreview > 0 ? 'Sync now' : 'OK'}
    />
    </div>
  );
}

/**
 * Exports the active-cycle progress grid to an .xlsx workbook.
 * `rows` should be the FULL filtered dataset (not just the visible page).
 * Includes a long-format "Stage Detail" sheet for pivot use.
 */
function exportProgress(
  cycleName: string,
  rows: InstanceWithEmployee[],
  stageScores: Record<string, Partial<Record<'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr', number | null>>>,
  filtersApplied: Record<string, string>,
  templatesById: Record<string, AnnualReviewTemplate> = {},
) {
  const data = rows.map((i) => {
    const s = stageScores[i.id] ?? {};
    const tpl = templatesById[svc.resolveTemplateId(i) ?? ''] ?? null;
    const criteriaForRow = tpl?.sections?.criteria ?? [];
    const rate = (v: number | null | undefined, role: AnnualReviewerRole) => {
      const r = computeCriteriaRatingOutOf5(criteriaForRow, v ?? null, role);
      return r == null ? '' : Number(r.toFixed(2));
    };
    const weights = resolveStageWeights(i, tpl);
    const sysTotal = Object.values(i.system_scores ?? {})
      .reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0) || null;
    const blend = computeFinalScore({
      stageWeights: weights,
      responsesByRole: {
        self: s.self ?? null, manager: s.manager ?? null,
        skip_manager: s.skip_manager ?? null, bu_head: s.bu_head ?? null, hr: s.hr ?? null,
      },
      systemScoreTotal: sysTotal,
      criteriaWeightedScore: i.criteria_weighted_score ?? null,
    });
    const weightsSource = i.stage_weights_override
      ? 'override'
      : (tpl?.sections as { stage_weights?: StageWeights } | undefined)?.stage_weights
        ? 'template'
        : 'legacy';
    return {
    'Employee Code': i.employee?.employee_code ?? '',
    'Employee Name': i.employee?.full_name ?? '',
    'Designation': i.employee?.designation ?? '',
    'Stage': i.overall_status,
      'Self Rating (/5)': rate(s.self, 'self'),
      'Manager Rating (/5)': rate(s.manager, 'manager'),
      'Skip Rating (/5)': rate(s.skip_manager, 'skip_manager'),
      'Dept Head Rating (/5)': rate(s.dept_head, 'dept_head'),
      'BU Head Rating (/5)': rate(s.bu_head, 'bu_head'),
      'HR Rating (/5)': rate(s.hr, 'hr'),
      'Self Weighted (raw)': s.self ?? '',
      'Manager Weighted (raw)': s.manager ?? '',
      'Skip Weighted (raw)': s.skip_manager ?? '',
      'Dept Head Weighted (raw)': s.dept_head ?? '',
      'BU Head Weighted (raw)': s.bu_head ?? '',
      'HR Weighted (raw)': s.hr ?? '',
    'Total Score': i.total_score ?? '',
    'Criteria Weighted Score': i.criteria_weighted_score ?? '',
    'Weights Source': weightsSource,
    'Weight Self %': weights.self ?? '',
    'Weight Manager %': weights.manager ?? '',
    'Weight Skip %': weights.skip_manager ?? '',
    'Weight Dept %': weights.dept_head ?? '',
    'Weight BU %': weights.bu_head ?? '',
    'Weight HR %': weights.hr ?? '',
    'Weight System %': weights.system ?? '',
    'Weight Criteria %': weights.criteria ?? '',
    'Blended Final (0-100)': blend.rawScore_0_100 ?? '',
    'Blended Final (0-5)': blend.scaled_0_5 ?? '',
    'Blend Renormalised': blend.renormalised ? 'yes' : 'no',
    'Final Rating': i.final_rating ?? '',
    'Finalized At': i.finalized_at ?? '',
    };
  });
  const detail: Array<Record<string, string | number>> = [];
  for (const i of rows) {
    const s = stageScores[i.id] ?? {};
    const tpl = templatesById[svc.resolveTemplateId(i) ?? ''] ?? null;
    const criteriaForRow = tpl?.sections?.criteria ?? [];
    (['self', 'manager', 'skip_manager', 'bu_head', 'hr'] as const).forEach((role) => {
      if (s[role] == null) return;
      const r = computeCriteriaRatingOutOf5(criteriaForRow, s[role], role);
      detail.push({
        'Employee Code': i.employee?.employee_code ?? '',
        'Employee Name': i.employee?.full_name ?? '',
        'Stage': role,
        'Weighted Score': s[role] as number,
        'Rating (/5)': r == null ? '' : Number(r.toFixed(2)),
      });
    });
  }
  const weightsSheet: Array<Record<string, string | number>> = [];
  for (const i of rows) {
    const tpl = templatesById[svc.resolveTemplateId(i) ?? ''] ?? null;
    const weights = resolveStageWeights(i, tpl);
    const source = i.stage_weights_override
      ? 'override'
      : (tpl?.sections as { stage_weights?: StageWeights } | undefined)?.stage_weights
        ? 'template'
        : 'legacy';
    for (const key of STAGE_WEIGHT_KEYS as StageWeightKey[]) {
      const w = weights[key];
      if (w == null || w === 0) continue;
      weightsSheet.push({
        'Employee Code': i.employee?.employee_code ?? '',
        'Employee Name': i.employee?.full_name ?? '',
        'Bucket': key,
        'Weight %': w,
        'Source': source,
      });
    }
  }
  const filterRows = Object.entries(filtersApplied).map(([k, v]) => ({ Filter: k, Value: v }));
  filterRows.push({ Filter: 'Exported At', Value: new Date().toISOString() });
  filterRows.push({ Filter: 'Row Count', Value: String(rows.length) });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Progress');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Stage Detail');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weightsSheet), 'Weights Breakdown');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filterRows), 'Filters');
  const safe = cycleName.replace(/[^a-zA-Z0-9._-]/g, '_');
  XLSX.writeFile(wb, `annual-review-progress_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ------------------------------------------------------------------
// Tab 1 — Progress + bulk upload + HR finalize sheet
// ------------------------------------------------------------------
function ProgressTab() {
  const { data: activeCycle } = useActiveCycle();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_self' | 'pending_manager' | 'pending_skip' | 'pending_dept' | 'pending_bu' | 'pending_management' | 'pending_hr' | 'completed' | 'not_started' | 'excluded'>('all');
  const [customWeightsOnly, setCustomWeightsOnly] = useState(false);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [businessUnitId, setBusinessUnitId] = useState<string>('');
  const [managerId, setManagerId] = useState<string>('');
  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
  const [pmsGrade, setPmsGrade] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: departments = [] } = useDepartments(businessUnitId || undefined);
  const { data: profilesLite = [] } = useActiveProfilesLite();
  const { data: pmsGrades = [] } = usePmsGrades();
  const { data: levels = [] } = useLevels();
  const selectedManager = profilesLite.find((p) => p.id === managerId);
  const anyOrgFilter = !!(departmentId || businessUnitId || managerId || pmsGrade || level);
  const resetFilters = () => {
    setSearch(''); setStatusFilter('all'); setCustomWeightsOnly(false);
    setDepartmentId(''); setBusinessUnitId(''); setManagerId('');
    setPmsGrade(''); setLevel(''); setPage(1);
  };
  const paginatedArgs = activeCycle
    ? {
        cycleId: activeCycle.id, page, pageSize, search,
        status: statusFilter, hasOverride: customWeightsOnly,
        departmentId: departmentId || undefined,
        businessUnitId: businessUnitId || undefined,
        managerId: managerId || undefined,
        pmsGrade: pmsGrade || undefined,
        level: level || undefined,
      }
    : undefined;
  const pagedQuery = useAnnualReviewInstancesPaginated(paginatedArgs);
  const { data: paged, refetch } = pagedQuery;
  const instances = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const pageInstanceIds = useMemo(() => instances.map((i) => i.id), [instances]);
  const { data: stageScoresMap = {} } = useInstanceStageScores(pageInstanceIds);
  const [exporting, setExporting] = useState(false);
  const countsQuery = useCycleStatusCounts(activeCycle?.id);
  const { data: counts = { total: 0, pending_self: 0, completed: 0, not_started: 0, pending_manager: 0, pending_skip: 0, pending_dept: 0, pending_bu: 0, pending_hr: 0, pending_management: 0, excluded: 0 } } = countsQuery;
  const [selected, setSelected] = useState<InstanceWithEmployee | null>(null);
  const [unifiedOpen, setUnifiedOpen] = useState(false);
  const [bulkInstances, setBulkInstances] = useState<InstanceWithEmployee[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const { data: template } = useTemplate(svc.resolveTemplateId(selected) ?? undefined);
  const { data: uploadTemplate } = useTemplate(svc.resolveTemplateId(instances[0]) ?? undefined);
  const [changeTplFor, setChangeTplFor] = useState<InstanceWithEmployee | null>(null);
  const [changeWfFor, setChangeWfFor] = useState<InstanceWithEmployee | null>(null);
  const [weightsFor, setWeightsFor] = useState<InstanceWithEmployee | null>(null);
  const [stepBackFor, setStepBackFor] = useState<InstanceWithEmployee | null>(null);
  const [stepBackReason, setStepBackReason] = useState('');
  const [rollbackFor, setRollbackFor] = useState<InstanceWithEmployee | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const { data: allTemplates = [] } = useTemplates();
  const sendBack = useSendBackStatus();
  const rollbackFinalized = useRollbackFinalizedInstance();
  const templatesByIdMap = useMemo(() => {
    const m: Record<string, AnnualReviewTemplate> = {};
    for (const t of allTemplates) m[t.id] = t;
    return m;
  }, [allTemplates]);
  // ADR-130 / POLICY §AR-KRA-GRID-DISPLAY — for KRA-based templates
  // (weighted_score is always 0), project a rating from the employee's
  // rolled-up KRA achievement so the grid's /5, Final and Rating columns
  // stop rendering "—" for locked stages.
  const kraFiscalYear = activeCycle ? fyStartFromCycle(activeCycle) : null;
  const kraTemplateFor = useCallback(
    (i: InstanceWithEmployee) =>
      templatesByIdMap[svc.resolveTemplateId(i) ?? ''] ?? null,
    [templatesByIdMap],
  );
  const kraDerivedByInstance = useKraDerivedRatingsForInstances(
    instances,
    kraTemplateFor,
    kraFiscalYear,
  );
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState<null | 'finalize' | 'sendBack'>(null);
  const [bulkRating, setBulkRating] = useState('');
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  const bulkFinalize = useMutation({
    mutationFn: () => svc.bulkFinalize({
      instanceIds: Array.from(selectedIds),
      finalRating: bulkRating,
      hrRemarks: bulkRemarks.trim() || null,
    }),
    onSuccess: (n) => {
      toast.success(`Finalized ${n} review${n === 1 ? '' : 's'}.`);
      setBulkOpen(null); setSelectedIds(new Set()); setBulkRating(''); setBulkRemarks('');
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkSendBack = useMutation({
    mutationFn: async () => {
      let n = 0;
      for (const id of selectedIds) {
        const inst = instances.find((i) => i.id === id);
        if (!inst || inst.overall_status === 'pending_self' || inst.overall_status === 'not_started' || inst.overall_status === 'completed') continue;
        const roleMap: Record<string, AnnualReviewerRole> = {
          pending_manager: 'manager', pending_skip: 'skip_manager', pending_dept: 'dept_head', pending_bu: 'bu_head', pending_hr: 'hr',
        };
        const role = roleMap[inst.overall_status];
        if (!role) continue;
        await sendBack.mutateAsync({ instanceId: id, role, reason: bulkReason.trim() || null });
        n++;
      }
      return n;
    },
    onSuccess: (n) => {
      toast.success(`Sent back ${n} review${n === 1 ? '' : 's'}.`);
      setBulkOpen(null); setSelectedIds(new Set()); setBulkReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMissing = useMutation({
    mutationFn: async () => {
      if (!activeCycle) throw new Error('No active cycle');
      return svc.seedInstancesByRules({ cycleId: activeCycle.id, hrUserId: user?.id ?? null });
    },
    onSuccess: (r) => {
      toast.success(
        r.seeded > 0
          ? `Seeded ${r.seeded} new instance${r.seeded === 1 ? '' : 's'}` +
              (r.skipped ? ` · ${r.skipped} skipped (no matching rule)` : '')
          : 'No new employees to seed — everyone eligible already has an instance.',
      );
      qc.invalidateQueries();
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // POLICY §AR-REVIEWER-RESYNC — repair path that re-snapshots reviewer
  // routing columns from the current master. Only touches instances whose
  // status is still ≤ pending_self so no active reviewer is swapped mid-flight.
  const resyncReviewers = useMutation({
    mutationFn: async () => {
      if (!activeCycle) throw new Error('No active cycle');
      return svc.resyncReviewersFromMaster({ cycleId: activeCycle.id, hrUserId: user?.id ?? null });
    },
    onSuccess: (r) => {
      const parts = [`Resynced ${r.resynced} instance${r.resynced === 1 ? '' : 's'}`];
      if (r.skippedInFlight) parts.push(`${r.skippedInFlight} skipped (already in progress)`);
      if (r.skippedNew) parts.push(`${r.skippedNew} skipped (not yet seeded)`);
      if (r.skippedNoRule) parts.push(`${r.skippedNoRule} skipped (no matching rule)`);
      toast.success(parts.join(' · '));
      qc.invalidateQueries();
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // §AR-SELF-OPEN-LATE — opens the self-review stage for any instance still
  // stuck at `not_started` after the cycle's `self_review_start`. Idempotent.
  const openSelfLate = useMutation({
    mutationFn: async () => {
      if (!activeCycle) throw new Error('No active cycle');
      return svc.openSelfReviewForPending(activeCycle.id);
    },
    onSuccess: (opened) => {
      toast.success(opened
        ? `Opened self-review for ${opened} instance${opened === 1 ? '' : 's'}.`
        : 'No instances were pending — everything is already open.');
      qc.invalidateQueries();
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = instances; // server-side filtering already applied
  const inProgressCount = counts.pending_manager + counts.pending_skip + counts.pending_dept
    + counts.pending_bu + counts.pending_hr + counts.pending_management;
  const summaryCounts = { total: counts.total, self: counts.pending_self, in_progress: inProgressCount, completed: counts.completed };

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));
  const toggleAll = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) filtered.forEach((i) => next.delete(i.id));
    else filtered.forEach((i) => next.add(i.id));
    setSelectedIds(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const selectedCount = selectedIds.size;
  const selectedPendingHrCount = useMemo(
    () => instances.filter((i) => selectedIds.has(i.id) && i.overall_status === 'pending_hr').length,
    [instances, selectedIds],
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (!activeCycle) return <Card><CardContent className="p-6">Activate a cycle to see progress.</CardContent></Card>;

  return (
    <div className="space-y-4">
      {(countsQuery.isError || pagedQuery.isError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load annual review progress</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{(countsQuery.error ?? pagedQuery.error) instanceof Error
              ? (countsQuery.error ?? pagedQuery.error as Error).message
              : 'The review data request failed. Please retry.'}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              void countsQuery.refetch();
              void pagedQuery.refetch();
            }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Total Active Reviews', val: summaryCounts.total },
          { label: 'Self-Review Pending', val: summaryCounts.self },
          { label: 'In Progress', val: summaryCounts.in_progress },
          { label: 'Completed', val: summaryCounts.completed },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-3xl font-bold">{m.val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by name or employee code…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}
          >
            <SelectTrigger className="w-44 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="pending_self">Pending self</SelectItem>
              <SelectItem value="pending_manager">Pending manager</SelectItem>
              <SelectItem value="pending_skip">Pending skip</SelectItem>
              <SelectItem value="pending_dept">Pending dept head</SelectItem>
              <SelectItem value="pending_bu">Pending BU</SelectItem>
              <SelectItem value="pending_management">Pending management</SelectItem>
              <SelectItem value="pending_hr">Pending HR</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="excluded">Excluded</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={businessUnitId || 'all'}
            onValueChange={(v) => { setBusinessUnitId(v === 'all' ? '' : v); setDepartmentId(''); setPage(1); }}
          >
            <SelectTrigger className="w-48 h-10"><SelectValue placeholder="All business units" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business units</SelectItem>
              {businessUnits.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={departmentId || 'all'}
            onValueChange={(v) => { setDepartmentId(v === 'all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-52 h-10"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover open={managerPickerOpen} onOpenChange={setManagerPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={managerPickerOpen}
                className="h-10 w-56 justify-between gap-2 font-normal"
              >
                <span className={cn('truncate', !selectedManager && 'text-muted-foreground')}>
                  {selectedManager ? formatSafetyProfileLabel(selectedManager) : 'All managers'}
                </span>
                {managerId ? (
                  <X
                    className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setManagerId(''); setPage(1); }}
                  />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search manager…" />
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    {profilesLite.slice(0, 200).map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.full_name ?? ''} ${p.employee_code ?? ''}`}
                        onSelect={() => {
                          setManagerId(p.id === managerId ? '' : p.id);
                          setManagerPickerOpen(false); setPage(1);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', managerId === p.id ? 'opacity-100' : 'opacity-0')} />
                        {formatSafetyProfileLabel(p)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Select
            value={pmsGrade || 'all'}
            onValueChange={(v) => { setPmsGrade(v === 'all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-44 h-10"><SelectValue placeholder="All PMS grades" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PMS grades</SelectItem>
              {(pmsGrades ?? []).map((g: { id: string; name: string }) => (
                <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={level || 'all'}
            onValueChange={(v) => { setLevel(v === 'all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-40 h-10"><SelectValue placeholder="All levels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {(levels ?? []).map((l: { id: string; name: string }) => (
                <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant={customWeightsOnly ? 'default' : 'outline'}
            className="gap-1.5 h-10"
            onClick={() => { setCustomWeightsOnly((v) => !v); setPage(1); }}
            aria-pressed={customWeightsOnly}
            title="Show only employees with a custom final-score weight override"
          >
            <Scale className="h-4 w-4" /> Custom weights only
          </Button>
          {(anyOrgFilter || search || statusFilter !== 'all' || customWeightsOnly) && (
            <Button type="button" size="sm" variant="ghost" className="h-10 gap-1.5" onClick={resetFilters}>
              <X className="h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" className="gap-2"
            disabled={seedMissing.isPending || !activeCycle}
            onClick={() => seedMissing.mutate()}
            title="Create annual review instances for newly added active employees using the current assignment rules"
          >
            {seedMissing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Seed missing employees
          </Button>
          <Button
            variant="outline" className="gap-2"
            disabled={resyncReviewers.isPending || !activeCycle}
            onClick={() => resyncReviewers.mutate()}
            title="Re-snapshot manager / skip / dept-head / BU-head / HR from the current employee master. Only touches instances still at self-review; instances already in progress are skipped."
          >
            {resyncReviewers.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Resync reviewers from master
          </Button>
          <Button
            variant="outline" className="gap-2"
            disabled={openSelfLate.isPending || !activeCycle}
            onClick={() => openSelfLate.mutate()}
            title="Open self-review for any late-seeded instance still stuck at 'not started' after the cycle's self-review start. Idempotent."
          >
            {openSelfLate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Open self-review for pending
          </Button>
          <Button
            variant="outline" className="gap-2"
            onClick={async () => {
              try {
                const r = await svc.runReminderCron();
                toast.success(`Queued ${r.queued} reminder${r.queued === 1 ? '' : 's'}.`);
              } catch (e) { toast.error((e as Error).message); }
            }}
          >
            <Bell className="h-4 w-4" /> Send reminders now
          </Button>
          <Button
            variant="outline" className="gap-2"
            disabled={total === 0 || exporting}
            onClick={async () => {
                  if (!activeCycle) return;
                  setExporting(true);
                  try {
                    const all = await svc.fetchAllInstancesForExport({
                      cycleId: activeCycle.id,
                      search,
                      status: statusFilter as any,
                      hasOverride: customWeightsOnly,
                      departmentId: departmentId || undefined,
                      businessUnitId: businessUnitId || undefined,
                      managerId: managerId || undefined,
                      pmsGrade: pmsGrade || undefined,
                      level: level || undefined,
                    });
                    const ids = all.map((i) => i.id);
                    const scores = await svc.fetchInstanceStageScores(ids);
                    const tplIds = Array.from(new Set(
                      all.map((i) => svc.resolveTemplateId(i)).filter((x): x is string => !!x),
                    ));
                    const tplList = await Promise.all(tplIds.map((tid) => svc.getTemplate(tid).catch(() => null)));
                    const tplMap: Record<string, AnnualReviewTemplate> = {};
                    for (const t of tplList) if (t) tplMap[t.id] = t;
                    exportProgress(activeCycle.name, all, scores, {
                      Search: search || '(none)',
                      Stage: statusFilter,
                      'Custom weights only': customWeightsOnly ? 'yes' : 'no',
                      'PMS Grade': pmsGrade || '(all)',
                      Level: level || '(all)',
                    }, tplMap);
                    toast.success(`Exported ${all.length} row${all.length === 1 ? '' : 's'}.`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setExporting(false);
                  }
            }}
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Progress snapshot
          </Button>
          <Button
            variant="outline" className="gap-2"
            disabled={total === 0 || bulkLoading}
            onClick={async () => {
              if (!activeCycle) return;
              setBulkLoading(true);
              try {
                const rows = await svc.fetchAllInstancesForExport({
                  cycleId: activeCycle.id,
                  search,
                  status: statusFilter,
                  hasOverride: customWeightsOnly,
                  departmentId: departmentId || undefined,
                  businessUnitId: businessUnitId || undefined,
                  managerId: managerId || undefined,
                  pmsGrade: pmsGrade || undefined,
                  level: level || undefined,
                });
                setBulkInstances(rows);
                setUnifiedOpen(true);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBulkLoading(false);
              }
            }}
          >
            {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Bulk workbook
          </Button>
          <AnnualReviewExportMenu
            cycle={activeCycle ?? null}
            filters={{
              search,
              status: statusFilter,
              hasOverride: customWeightsOnly,
              departmentId: departmentId || undefined,
              businessUnitId: businessUnitId || undefined,
              managerId: managerId || undefined,
              pmsGrade: pmsGrade || undefined,
              level: level || undefined,
            }}
            total={total}
          />
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">{selectedCount} selected · {selectedPendingHrCount} ready to finalize</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={selectedCount === 0} onClick={() => setBulkOpen('sendBack')}>
              <Undo2 className="h-4 w-4" /> Bulk send back
            </Button>
            <Button size="sm" className="gap-1.5" disabled={selectedPendingHrCount === 0} onClick={() => setBulkOpen('finalize')}>
              <CheckCheck className="h-4 w-4" /> Bulk finalize ({selectedPendingHrCount})
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right" title="Self reviewer rating on a 0–5 scale (normalised from stored weighted score).">Self /5</TableHead>
                <TableHead className="text-right" title="Manager rating on a 0–5 scale.">Manager /5</TableHead>
                <TableHead className="text-right" title="Skip manager rating on a 0–5 scale.">Skip /5</TableHead>
                <TableHead className="text-right" title="Department head rating on a 0–5 scale.">Dept /5</TableHead>
                <TableHead className="text-right" title="BU head rating on a 0–5 scale.">BU /5</TableHead>
                <TableHead className="text-right" title="HR rating on a 0–5 scale.">HR /5</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                // POLICY §AR-STAGE-LABEL-DISPLAY-SSOT (ADR-128): shift a lower
                // stage's /5 value up to its duplicate higher stage so the
                // grid columns agree with the header/pipeline (Dept≡BU etc.).
                const ss = remapStageValueMapByDuplicates(
                  stageScoresMap[i.id] ?? {},
                  i as any,
                );
                const tplForRow = templatesByIdMap[svc.resolveTemplateId(i) ?? ''] ?? null;
                const criteriaForRow = tplForRow?.sections?.criteria ?? [];
                const isKraTpl = isKraBasedTemplate(tplForRow);
                const kraRow = kraDerivedByInstance[i.id];
                // For KRA-based templates, weighted_score is always 0 because
                // reviewers don't touch per-criterion scores. Fall back to the
                // KRA-derived /5 for any stage that has a locked response.
                const fmt = (v: number | null | undefined, role: AnnualReviewerRole) => {
                  const rating = computeCriteriaRatingOutOf5(criteriaForRow, v, role);
                  if (rating != null) return rating.toFixed(1);
                  if (isKraTpl && ss[role] != null && kraRow?.rating_0_5 != null) {
                    return (
                      <span title="Derived from KRA achievement (POLICY §AR-KRA-GRID-DISPLAY)">
                        {kraRow.rating_0_5.toFixed(1)}
                      </span>
                    );
                  }
                  return <span className="text-muted-foreground/50">—</span>;
                };
                const finalDisplay = i.total_score != null
                  ? i.total_score.toFixed(2)
                  : isKraTpl && kraRow?.projected
                    ? <span title="Projected — HR has not finalized (POLICY §AR-KRA-GRID-DISPLAY).">
                        {kraRow.projected.total_0_100.toFixed(2)}*
                      </span>
                    : <span className="text-muted-foreground/50">—</span>;
                const ratingDisplay = i.final_rating
                  ?? (isKraTpl && kraRow?.projected
                    ? <span title="Projected — HR has not finalized.">{kraRow.projected.rating}*</span>
                    : <span className="text-muted-foreground/50">—</span>);
                // Per policy: template can be changed at any non-terminal stage.
                // ChangeTemplateDialog auto-force-resets past-self instances.
                 // ADR-160c: workflow/reviewer edit is allowed even on Completed
                 // (re-open via supersede). Change-template / weights stay gated.
                 const canChange = i.overall_status !== 'excluded';
                 const isCompleted = i.overall_status === 'completed';
                 const canChangeTemplateOrWeights =
                   canChange && !isCompleted;
                 const isPastSelf =
                   canChangeTemplateOrWeights &&
                   i.overall_status !== 'not_started' &&
                   i.overall_status !== 'pending_self';
                return (
                <TableRow key={i.id} className="min-h-10">
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(i.id)}
                      onCheckedChange={() => toggleOne(i.id)}
                      aria-label={`Select ${i.employee?.full_name ?? ''}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{i.employee?.full_name ?? i.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{i.employee?.employee_code}</div>
                  </TableCell>
                  <TableCell><AnnualReviewStatusBadge status={i.overall_status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.self, 'self')}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.manager, 'manager')}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.skip_manager, 'skip_manager')}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.dept_head, 'dept_head')}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.bu_head, 'bu_head')}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.hr, 'hr')}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{finalDisplay}</TableCell>
                  <TableCell className="text-right">{ratingDisplay}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSelected(i)}>
                          <CheckCheck className="h-4 w-4 mr-2" /> Finalize / View
                        </DropdownMenuItem>
                        {(() => {
                          const roleMap: Record<string, AnnualReviewerRole> = {
                            pending_manager: 'manager', pending_skip: 'skip_manager', pending_dept: 'dept_head', pending_bu: 'bu_head', pending_hr: 'hr',
                          };
                          const stepBackRole = roleMap[i.overall_status];
                          if (!stepBackRole) return null;
                          return (
                            <DropdownMenuItem onClick={() => { setStepBackReason(''); setStepBackFor(i); }}>
                              <Undo2 className="h-4 w-4 mr-2" /> Step back to previous stage
                            </DropdownMenuItem>
                          );
                        })()}
                        {i.overall_status === 'completed' && (
                          <DropdownMenuItem
                            onClick={() => { setRollbackReason(''); setRollbackFor(i); }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Undo2 className="h-4 w-4 mr-2" /> Roll back finalized review
                          </DropdownMenuItem>
                        )}
                        {canChangeTemplateOrWeights && (
                          <DropdownMenuItem
                            onClick={() => setChangeTplFor(i)}
                            className={isPastSelf ? 'text-destructive focus:text-destructive' : undefined}
                          >
                            <Layers className="h-4 w-4 mr-2" />
                            {isPastSelf ? 'Change template (reset self-review)' : 'Change template'}
                          </DropdownMenuItem>
                        )}
                        {canEditWorkflowAndReviewers(i.overall_status) && (
                          <DropdownMenuItem
                            onClick={() => setChangeWfFor(i)}
                            className={isCompleted ? 'text-destructive focus:text-destructive' : undefined}
                          >
                            <ListChecks className="h-4 w-4 mr-2" />
                            {isCompleted ? 'Edit workflow & reviewers (re-open)' : 'Edit workflow & reviewers'}
                          </DropdownMenuItem>
                        )}
                        {canChangeTemplateOrWeights && !isPastSelf && (
                          <DropdownMenuItem onClick={() => setWeightsFor(i)}>
                            <Scale className="h-4 w-4 mr-2" /> Customise weights
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No instances.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
          <p className="text-muted-foreground">
            Showing <span className="tabular-nums">{filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + filtered.length}</span> of <span className="tabular-nums">{total}</span>
            {' · '}
            <span className="text-xs">Download data → Progress snapshot exports all filtered rows.</span>
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Rows</Label>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <span className="text-xs tabular-nums">Page {page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
          </div>
        </div>
      </Card>

      {activeCycle && (
        <UnifiedBulkDialog
          open={unifiedOpen}
          onOpenChange={(o) => {
            setUnifiedOpen(o);
            if (!o) setBulkInstances(null);
          }}
          cycle={activeCycle}
          instances={bulkInstances ?? []}
          templates={allTemplates}
          systemTemplate={uploadTemplate ?? null}
          onDone={refetch}
        />
      )}
      <HrFinalizationSheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        instance={selected}
        template={template ?? null}
        fiscalYear={activeCycle ? fyStartFromCycle(activeCycle) : null}
      />

      <ChangeTemplateDialog
        instance={changeTplFor}
        onClose={() => setChangeTplFor(null)}
        onDone={() => { setChangeTplFor(null); refetch(); }}
      />

      <ChangeWorkflowDialog
        instance={changeWfFor}
        onClose={() => setChangeWfFor(null)}
        onDone={() => { setChangeWfFor(null); refetch(); }}
      />

      <InstanceStageWeightsDialog
        open={!!weightsFor}
        onOpenChange={(o) => !o && setWeightsFor(null)}
        instance={weightsFor}
        template={template ?? null}
        onSaved={() => { setWeightsFor(null); refetch(); }}
      />

      <RecentStageWeightOverridesPanel cycleId={activeCycle?.id} />

      <AlertDialog open={bulkOpen === 'finalize'} onOpenChange={(o) => !o && setBulkOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk finalize {selectedPendingHrCount} review{selectedPendingHrCount === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only instances in <strong>pending HR</strong> are affected. The same rating and remark are applied to all selected.
              This action is recorded in the audit log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Final rating</Label>
              <Input value={bulkRating} onChange={(e) => setBulkRating(e.target.value)} placeholder="e.g. Exceeds expectations" />
            </div>
            <div className="space-y-1"><Label>HR remarks (optional)</Label>
              <Textarea rows={3} value={bulkRemarks} onChange={(e) => setBulkRemarks(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bulkFinalize.mutate(); }}
              disabled={!bulkRating.trim() || bulkFinalize.isPending}
            >
              {bulkFinalize.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Finalize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen === 'sendBack'} onOpenChange={(o) => !o && setBulkOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk send back {selectedCount} review{selectedCount === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each selected instance is reverted one stage so the previous reviewer can revise and resubmit.
              Instances in <em>self</em>, <em>not started</em>, or <em>completed</em> are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Textarea rows={3} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="What needs to be revised?" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); bulkSendBack.mutate(); }}
              disabled={bulkSendBack.isPending}
            >
              {bulkSendBack.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!stepBackFor} onOpenChange={(o) => !o && setStepBackFor(null)}>
        <AlertDialogContent>
          {(() => {
            if (!stepBackFor) return null;
            const roleMap: Record<string, AnnualReviewerRole> = {
              pending_manager: 'manager', pending_skip: 'skip_manager', pending_dept: 'dept_head', pending_bu: 'bu_head', pending_hr: 'hr',
            };
            const role = roleMap[stepBackFor.overall_status];
            let prevLabel = 'previous stage';
            try {
              if (role) prevLabel = prevStatus(role, stepBackFor.enabled_stages ?? null).replace(/^pending_/, '');
            } catch { /* no previous stage */ }
            const name = stepBackFor.employee?.full_name ?? stepBackFor.employee_id;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Step back to previous stage?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {name} — current stage will revert to <strong>{prevLabel}</strong> so that reviewer can revise and resubmit.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1">
                  <Label>Reason (optional)</Label>
                  <Textarea rows={3} value={stepBackReason} onChange={(e) => setStepBackReason(e.target.value)} placeholder="What needs to be revised?" />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async (e) => {
                      e.preventDefault();
                      if (!role) return;
                      try {
                        await sendBack.mutateAsync({ instanceId: stepBackFor.id, role, reason: stepBackReason.trim() || null });
                        toast.success('Review stepped back to previous stage.');
                        setStepBackFor(null);
                        setStepBackReason('');
                        qc.invalidateQueries();
                      } catch (err) {
                        const e = err as { message?: string; hint?: string; details?: string };
                        toast.error(e?.message || e?.hint || e?.details || 'Failed to step back');
                      }
                    }}
                    disabled={sendBack.isPending || !role}
                  >
                    {sendBack.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Step back
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rollbackFor} onOpenChange={(o) => !o && setRollbackFor(null)}>
        <AlertDialogContent>
          {rollbackFor && (() => {
            const terminalLabel = rollbackTerminalLabel(
              (rollbackFor.enabled_stages ?? []) as any,
            );
            const noTerminal = terminalLabel === 'the previous reviewer stage';
            return (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Roll back finalized review?</AlertDialogTitle>
                <AlertDialogDescription>
                  {rollbackFor.employee?.full_name ?? rollbackFor.employee_id} — this will clear the
                  {' '}<strong>final rating</strong>, HR remarks and finalized timestamp, unlock the
                  {' '}last reviewer stage response, and return the instance to{' '}
                  <strong>{terminalLabel}</strong> so it can be revised. Historical audit trail is preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1">
                <Label>Reason (required, min 3 chars)</Label>
                <Textarea
                  rows={3}
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  placeholder="Why is this finalized review being rolled back?"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!rollbackFor) return;
                    try {
                      const to = await rollbackFinalized.mutateAsync({
                        instanceId: rollbackFor.id,
                        reason: rollbackReason.trim(),
                      });
                      toast.success(`Finalized review rolled back to ${to ?? terminalLabel}.`);
                      setRollbackFor(null);
                      setRollbackReason('');
                      qc.invalidateQueries();
                    } catch (err) {
                      const e = err as { message?: string; hint?: string; details?: string };
                      toast.error(e?.message || e?.hint || e?.details || 'Failed to roll back');
                    }
                  }}
                  disabled={rollbackReason.trim().length < 3 || rollbackFinalized.isPending || noTerminal}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {rollbackFinalized.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Roll back
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------
// Analytics tab — rating distribution, stage funnel, on-time vs overdue
// ------------------------------------------------------------------

/**
 * Per-employee template override dialog (Part B).
 * Admin / hr_pms only. Service-side RPC enforces role, stage gate, and audit log.
 * Allowed only while instance is `not_started` or `pending_self`.
 */
function ChangeTemplateDialog({
  instance, onClose, onDone,
}: {
  instance: InstanceWithEmployee | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: templates = [] } = useTemplates();
  const activeTemplates = templates.filter((t) => t.is_active);
  const [tplId, setTplId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [gate, setGate] = useState<string>('');
  const currentId = svc.resolveTemplateId(instance) ?? '';
  const isClearing = tplId === '__clear__';
  const isPastSelf =
    !!instance &&
    instance.overall_status !== 'not_started' &&
    instance.overall_status !== 'pending_self' &&
    instance.overall_status !== 'completed' &&
    instance.overall_status !== 'excluded';

  // Reset when opening on a new instance.
  useMemo(() => {
    setTplId(currentId || '');
    setReason('');
    setGate('');
  }, [instance?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!instance) throw new Error('No instance');
      if (isPastSelf) {
        // Past self-review: destructive path — archive + wipe responses,
        // swap template, restart at pending_self so employee refills.
        if (isClearing) throw new Error('Cannot clear override after submission — pick an explicit template.');
        const res = await svc.bulkForceResetInstances(
          [{ instanceId: instance.id, templateId: tplId }],
          reason.trim(),
        );
        if (res.failed.length > 0) throw new Error(res.failed[0].error);
        return;
      }
      await svc.setTemplateOverride({
        instanceId: instance.id,
        templateId: isClearing ? null : tplId,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success(isPastSelf
        ? 'Template swapped. Employee can now re-submit the self-review.'
        : 'Template updated.');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave =
    reason.trim().length >= (isPastSelf ? 10 : 3) &&
    (isPastSelf ? gate.trim().toUpperCase() === 'RESET' : true) &&
    (isClearing
      ? !!instance?.template_override_id
      : !!tplId && tplId !== currentId);

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={isPastSelf ? 'text-destructive' : undefined}>
            {isPastSelf ? 'Change template (reset self-review)' : 'Change template'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                {isPastSelf
                  ? <>
                      <strong>{instance?.employee?.full_name ?? '—'}</strong> has already submitted
                      (<code>{instance?.overall_status}</code>). Swapping the template will archive
                      and wipe existing responses, then restart the instance at <code>pending_self</code>
                      {' '}so the employee refills the blank new form. Audit-logged.
                    </>
                  : <>Override the template for <strong>{instance?.employee?.full_name ?? '—'}</strong> for this cycle only. Audit-logged.</>}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Current: <span className="font-medium">{activeTemplates.find((t) => t.id === currentId)?.name ?? '—'}</span>
            {instance?.template_override_id && <Badge variant="outline" className="ml-2">override</Badge>}
          </div>
          <div className="space-y-1">
            <Label>New template</Label>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Pick a template" /></SelectTrigger>
              <SelectContent>
                {activeTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
                {!isPastSelf && instance?.template_override_id && (
                  <SelectItem value="__clear__">— Clear override (use rule-seeded template) —</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason {isPastSelf ? '(min 10 chars)' : '(min 3 chars)'}</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this employee getting a different template?" />
          </div>
          {isPastSelf && (
            <div className="space-y-1">
              <Label>Type <code>RESET</code> to confirm</Label>
              <Input value={gate} onChange={(e) => setGate(e.target.value)} autoComplete="off" />
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); save.mutate(); }}
            disabled={!canSave || save.isPending}
            className={isPastSelf ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isPastSelf ? 'Reset & swap template' : 'Save'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const STAGE_ORDER = ['not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu','pending_hr','completed'] as const;
const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started', pending_self: 'Self', pending_manager: 'Manager',
  pending_skip: 'Skip', pending_dept: 'Dept', pending_bu: 'BU', pending_hr: 'HR', completed: 'Completed',
};

function AnalyticsTab() {
  const { data: activeCycle } = useActiveCycle();
  const { data: instances = [] } = useCycleInstances(activeCycle?.id);
  const instanceIds = useMemo(() => instances.map((i) => i.id), [instances]);
  const { data: stageScoresMap = {} } = useInstanceStageScores(instanceIds);
  const { data: allTemplates = [] } = useTemplates();
  const templatesById = useMemo(() => {
    const m: Record<string, AnnualReviewTemplate> = {};
    for (const t of allTemplates) m[t.id] = t;
    return m;
  }, [allTemplates]);

  const blendedData = useMemo(() => {
    const buckets = [
      { label: '< 2.0', min: 0, max: 2, count: 0 },
      { label: '2.0–3.0', min: 2, max: 3, count: 0 },
      { label: '3.0–4.0', min: 3, max: 4, count: 0 },
      { label: '4.0–4.5', min: 4, max: 4.5, count: 0 },
      { label: '4.5–5.0', min: 4.5, max: 5.0001, count: 0 },
    ];
    let scored = 0;
    for (const i of instances) {
      const tpl = templatesById[svc.resolveTemplateId(i) ?? ''] ?? null;
      const weights = resolveStageWeights(i, tpl);
      const s = stageScoresMap[i.id] ?? {};
      const sysTotal = Object.values(i.system_scores ?? {})
        .reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0) || null;
      const blend = computeFinalScore({
        stageWeights: weights,
        responsesByRole: {
          self: s.self ?? null, manager: s.manager ?? null,
          skip_manager: s.skip_manager ?? null, bu_head: s.bu_head ?? null, hr: s.hr ?? null,
        },
        systemScoreTotal: sysTotal,
        criteriaWeightedScore: i.criteria_weighted_score ?? null,
      });
      if (blend.scaled_0_5 == null) continue;
      scored++;
      const v = blend.scaled_0_5;
      const b = buckets.find((bk) => v >= bk.min && v < bk.max);
      if (b) b.count++;
    }
    return { buckets, scored };
  }, [instances, templatesById, stageScoresMap]);

  const ratingData = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of instances) {
      const r = (i.final_rating ?? '').trim();
      if (!r) continue;
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => b.count - a.count);
  }, [instances]);

  const stageData = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of instances) map.set(i.overall_status, (map.get(i.overall_status) ?? 0) + 1);
    return STAGE_ORDER.map((s) => ({ stage: STAGE_LABEL[s], count: map.get(s) ?? 0 }));
  }, [instances]);

  const onTimeData = useMemo(() => {
    if (!activeCycle?.hr_finalization_deadline) return null;
    const dl = new Date(activeCycle.hr_finalization_deadline).getTime();
    const now = Date.now();
    let onTime = 0, overdue = 0, completed = 0;
    for (const i of instances) {
      if (i.overall_status === 'completed') {
        completed++;
        if (i.finalized_at && new Date(i.finalized_at).getTime() <= dl) onTime++;
      } else if (now > dl) overdue++;
    }
    return [
      { label: 'Completed on time', value: onTime },
      { label: 'Completed late', value: completed - onTime },
      { label: 'Pending (overdue)', value: overdue },
      { label: 'Pending (in window)', value: instances.length - completed - overdue },
    ];
  }, [instances, activeCycle]);

  if (!activeCycle) return <Card><CardContent className="p-6">Activate a cycle to see analytics.</CardContent></Card>;

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2, 142 76% 36%))', 'hsl(var(--chart-3, 38 92% 50%))', 'hsl(var(--muted-foreground))'];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Stage funnel</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageData} layout="vertical" margin={{ left: 24, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage" width={90} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rating distribution</CardTitle></CardHeader>
        <CardContent style={{ height: 280 }}>
          {ratingData.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No reviews finalized yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="rating" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {ratingData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Blended final-score distribution</CardTitle>
          <p className="text-xs text-muted-foreground">
            Live blend of the configured weights (self/manager/skip/BU/HR/system/criteria) across {blendedData.scored} scored employee{blendedData.scored === 1 ? '' : 's'}. Recomputes as reviewers submit — independent of HR's manual final rating.
          </p>
        </CardHeader>
        <CardContent style={{ height: 260 }}>
          {blendedData.scored === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No stage scores available yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={blendedData.buckets} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {blendedData.buckets.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">On-time vs overdue</CardTitle>
          <p className="text-xs text-muted-foreground">
            {activeCycle.hr_finalization_deadline
              ? `Measured against HR deadline ${new Date(activeCycle.hr_finalization_deadline).toLocaleDateString()}.`
              : 'Set an HR finalization deadline on the active cycle to enable this view.'}
          </p>
        </CardHeader>
        <CardContent>
          {!onTimeData ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              {onTimeData.map((d, idx) => (
                <div key={d.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                  <p className="text-2xl font-semibold tabular-nums" style={{ color: COLORS[idx] }}>{d.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------
// Tab 2 — Cycles
// ------------------------------------------------------------------
/**
 * Cycle-level workflow chain editor. Six checkboxes; `self` is always on.
 * Writes a flat AnnualReviewerRole[] in canonical order back to the parent.
 */
function CycleDefaultStagesFieldset({
  value, onChange,
}: {
  value: AnnualReviewerRole[];
  onChange: (next: AnnualReviewerRole[]) => void;
}) {
  const STAGES: Array<{ key: AnnualReviewerRole; label: string }> = [
    { key: 'self',         label: 'Self Review' },
    { key: 'manager',      label: 'Manager' },
    { key: 'skip_manager', label: 'Skip Manager' },
    { key: 'dept_head',    label: 'Department Head' },
    { key: 'bu_head',      label: 'BU Head' },
    { key: 'hr',           label: 'HR Finalization' },
  ];
  const ordered = STAGES.map((s) => s.key);
  const set = new Set(value);
  const toggle = (key: AnnualReviewerRole) => {
    if (key === 'self') return; // always on
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(ordered.filter((s) => next.has(s)));
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">Default workflow stages</Label>
      <div className="rounded-md border p-3 space-y-1.5">
        {STAGES.map((s) => (
          <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={set.has(s.key)}
              disabled={s.key === 'self'}
              onCheckedChange={() => toggle(s.key)}
            />
            <span>{s.label}</span>
            {s.key === 'self' && <Badge variant="outline" className="ml-auto text-[10px]">Always on</Badge>}
          </label>
        ))}
        <p className="text-[11px] text-muted-foreground pt-1">
          Applied to every new instance seeded for this cycle. Stages where the reviewer is missing,
          deactivated, or is the employee themselves are auto-skipped at advance time.
        </p>
      </div>
    </div>
  );
}

function CyclesTab() {
  const { data: cycles = [], refetch } = useCycles();
  const [draft, setDraft] = useState<Partial<AnnualReviewCycle>>({ name: '', review_year: new Date().getFullYear(), status: 'draft' });
  const save = useMutation({
    mutationFn: () => svc.upsertCycle(draft),
    onSuccess: () => { toast.success('Cycle saved'); refetch(); setDraft({ name: '', review_year: new Date().getFullYear(), status: 'draft' }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeCycle = useCloseCycle();
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const reopenCycle = useReopenCycle();
  const [reopenSource, setReopenSource] = useState<AnnualReviewCycle | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const clone = useCloneCycle();
  const [cloneSource, setCloneSource] = useState<AnnualReviewCycle | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneYear, setCloneYear] = useState<number>(new Date().getFullYear() + 1);
  const [cloneCopyTemplates, setCloneCopyTemplates] = useState(false);
  const [cloneCopyRules, setCloneCopyRules] = useState(true);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle>{draft.id ? 'Edit cycle' : 'New cycle'}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Review year</Label><Input type="number" value={draft.review_year ?? ''} onChange={(e) => setDraft({ ...draft, review_year: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as AnnualReviewCycle['status'] })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(['self_review','manager_review','skip_review','dept_review','bu_review'] as const).map((k) => (
            <div key={k} className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">{k.replace('_',' ')} start</Label>
                <Input type="date" value={(draft as Record<string, unknown>)[`${k}_start`] as string ?? ''} onChange={(e) => setDraft({ ...draft, [`${k}_start`]: e.target.value })} />
              </div>
              <div className="space-y-1"><Label className="text-xs">{k.replace('_',' ')} end</Label>
                <Input type="date" value={(draft as Record<string, unknown>)[`${k}_end`] as string ?? ''} onChange={(e) => setDraft({ ...draft, [`${k}_end`]: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="space-y-1"><Label className="text-xs">HR finalization deadline</Label>
            <Input type="date" value={draft.hr_finalization_deadline ?? ''} onChange={(e) => setDraft({ ...draft, hr_finalization_deadline: e.target.value })} />
          </div>
          <CycleDefaultStagesFieldset
            value={(draft.default_enabled_stages as AnnualReviewerRole[] | undefined)
              ?? ['self','manager','skip_manager','dept_head','bu_head','hr']}
            onChange={(next) => setDraft({ ...draft, default_enabled_stages: next })}
          />
          <Button className="w-full" disabled={save.isPending || !draft.name} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle>Cycles</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Year</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {cycles.map((c) => (
                <TableRow key={c.id} className="min-h-10">
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.review_year}</TableCell>
                  <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setDraft(c)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => {
                      setCloneSource(c);
                      setCloneName(`${c.name} (copy)`);
                      setCloneYear((c.review_year ?? new Date().getFullYear()) + 1);
                      setCloneCopyTemplates(false);
                      setCloneCopyRules(true);
                    }}>
                      <Copy className="h-3.5 w-3.5" /> Clone
                    </Button>
                    {c.status !== 'closed' && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmCloseId(c.id)}
                      >
                        <Lock className="h-3.5 w-3.5 mr-1" /> Close
                      </Button>
                    )}
                    {c.status === 'closed' && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => { setReopenSource(c); setReopenReason(''); }}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" /> Reopen
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {cycles.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No cycles yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmCloseId} onOpenChange={(o) => !o && setConfirmCloseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this cycle?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing the cycle locks every response and prevents further edits — including by reviewers and HR.
              Admins can still override ratings via Calibration. This is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmCloseId) return;
                try {
                  const n = await closeCycle.mutateAsync(confirmCloseId);
                  toast.success(`Cycle closed. ${n} response(s) locked.`);
                  setConfirmCloseId(null);
                } catch (err) { toast.error((err as Error).message); }
              }}
              disabled={closeCycle.isPending}
            >
              {closeCycle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Close cycle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!reopenSource} onOpenChange={(o) => !o && setReopenSource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen <span className="font-mono">{reopenSource?.name}</span>?</AlertDialogTitle>
            <AlertDialogDescription>
              Reopening flips a closed cycle back to <strong>active</strong>, restoring write access
              for reviewers and HR. The reason is mandatory and recorded in the audit log.
              Use this sparingly — most corrections should be done via rating override.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why is this cycle being reopened?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                if (!reopenSource) return;
                try {
                  await reopenCycle.mutateAsync({ cycleId: reopenSource.id, reason: reopenReason.trim() });
                  toast.success('Cycle reopened.');
                  setReopenSource(null);
                } catch (err) { toast.error((err as Error).message); }
              }}
              disabled={reopenReason.trim().length < 3 || reopenCycle.isPending}
            >
              {reopenCycle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Reopen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cloneSource} onOpenChange={(o) => !o && setCloneSource(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clone cycle</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new draft cycle from <strong>{cloneSource?.name}</strong>. Dates are not carried over —
              set them on the new cycle before activation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>New cycle name</Label>
              <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
            </div>
            <div className="space-y-1"><Label>Review year</Label>
              <Input type="number" value={cloneYear} onChange={(e) => setCloneYear(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cloneCopyRules} onCheckedChange={setCloneCopyRules} /> Copy assignment rules
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={cloneCopyTemplates} onCheckedChange={setCloneCopyTemplates} /> Also clone each rule's template (new versions)
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cloneName.trim() || clone.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!cloneSource) return;
                try {
                  await clone.mutateAsync({
                    sourceId: cloneSource.id,
                    newName: cloneName.trim(),
                    reviewYear: cloneYear,
                    copyTemplates: cloneCopyTemplates,
                    copyRules: cloneCopyRules,
                  });
                  toast.success('Cycle cloned as draft.');
                  setCloneSource(null);
                  refetch();
                } catch (err) { toast.error((err as Error).message); }
              }}
            >
              {clone.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Clone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------
// Tab 3 — Templates (visual builder via TemplateEditorDialog)
// ------------------------------------------------------------------
function TemplatesTab() {
  return <TemplatesTabImpl />;
}

function TemplateWeightsSummary({ template }: { template: AnnualReviewTemplate }) {
  const w = (template.sections as { stage_weights?: Record<string, number> } | undefined)?.stage_weights;
  const LABEL: Record<string, string> = {
    self: 'Self', manager: 'Mgr', skip_manager: 'Skip', dept_head: 'Dept',
    bu_head: 'BU', hr: 'HR', system: 'Sys', criteria: 'Crit',
  };
  const COLOR: Record<string, string> = {
    self: 'hsl(var(--primary))',
    manager: 'hsl(var(--chart-2, 142 76% 36%))',
    skip_manager: 'hsl(var(--chart-3, 38 92% 50%))',
    dept_head: 'hsl(var(--chart-1, 12 76% 61%))',
    bu_head: 'hsl(var(--chart-4, 280 65% 60%))',
    hr: 'hsl(var(--chart-5, 340 75% 55%))',
    system: 'hsl(var(--muted-foreground))',
    criteria: 'hsl(var(--accent-foreground))',
  };
  const isLegacy = !w || Object.keys(w).length === 0;
  const entries = isLegacy
    ? [['criteria', 100] as [string, number]]
    : Object.entries(w!).filter(([, v]) => typeof v === 'number' && v > 0).sort(([a], [b]) => a.localeCompare(b));
  const total = entries.reduce((acc, [, v]) => acc + v, 0) || 1;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Final-score blend</span>
        {isLegacy && <Badge variant="outline" className="text-[10px]">legacy</Badge>}
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full border bg-muted/40" role="img" aria-label="Final-score weight blend">
        {entries.map(([k, v]) => (
          <div
            key={k}
            style={{ width: `${(v / total) * 100}%`, background: COLOR[k] ?? 'hsl(var(--primary))' }}
            title={`${LABEL[k] ?? k} ${v}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
        {entries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR[k] ?? 'hsl(var(--primary))' }} />
            {LABEL[k] ?? k} {v}%
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplatesTabImpl() {
  const { data: templates = [], refetch } = useTemplates();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AnnualReviewTemplate | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AnnualReviewTemplate | null>(null);

  const toggleActive = useMutation({
    mutationFn: (t: AnnualReviewTemplate) =>
      svc.upsertTemplate({ id: t.id, is_active: !t.is_active }),
    onSuccess: () => { toast.success('Template updated'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const clone = useCloneTemplate();
  const del = useMutation({
    mutationFn: (id: string) => svc.deleteTemplate(id),
    onSuccess: () => { toast.success('Template deleted'); setToDelete(null); refetch(); },
    onError: (e: Error) => toast.error(e?.message || 'Failed to delete template'),
  });

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (t: AnnualReviewTemplate) => { setEditing(t); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{templates.length} total template{templates.length === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => downloadTemplateFormatWorkbook()}>
            <Download className="h-4 w-4" /> Download Format
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload Template
          </Button>
          <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New Template</Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No templates yet. Click <strong>New Template</strong> to build one — you can auto-populate the Blue-Collar preset from inside the editor.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const critCount = t.sections?.criteria?.length ?? 0;
            const sheetKey = (t.sections as unknown as { sheet_key?: { source?: string; sheet_name?: string } } | undefined)?.sheet_key;
            const workbookBadge = sheetKey?.source === 'criteria_workbook' ? sheetKey.sheet_name : null;
            return (
              <Card key={t.id} className="hover:border-primary/40 transition">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{t.name}</h3>
                      <Badge variant={t.is_active ? 'default' : 'secondary'}
                        className={t.is_active ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : ''}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{critCount} criteria</span>
                    {typeof t.version === 'number' && t.version > 1 && (
                      <Badge variant="outline" className="text-xs">v{t.version}</Badge>
                    )}
                    {workbookBadge && (
                      <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                        Workbook · {workbookBadge}
                      </Badge>
                    )}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                    <TemplateWeightsSummary template={t} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)} className="gap-1.5">
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      variant="outline" size="sm" className="gap-1.5"
                      onClick={() => downloadFilledTemplateWorkbook(t)}
                      title="Export this template as an editable .xlsx"
                    >
                      <Download className="h-4 w-4" /> Export
                    </Button>
                    <Button
                      variant="outline" size="sm" className="gap-1.5"
                      disabled={clone.isPending}
                      onClick={async () => {
                        try {
                          await clone.mutateAsync({ sourceId: t.id, newName: null });
                          toast.success('New template version created (inactive).');
                          refetch();
                        } catch (e) { toast.error((e as Error).message); }
                      }}
                    >
                      <Copy className="h-4 w-4" /> Clone as new version
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => toggleActive.mutate(t)}
                      disabled={toggleActive.isPending}
                    >
                      {t.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setToDelete(t)}
                      disabled={del.isPending}
                      title="Delete this template (blocked if it is still referenced)"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editing}
        onSaved={refetch}
      />
      <TemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        existingTemplates={templates}
        onImported={() => refetch()}
      />
      <ConfirmDestructiveDialog
        open={!!toDelete}
        onCancel={() => (del.isPending ? undefined : setToDelete(null))}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        title="Delete template?"
        description={
          toDelete
            ? `This will permanently remove "${toDelete.name}"${typeof toDelete.version === 'number' ? ` (v${toDelete.version})` : ''}. This action cannot be undone. If the template is still assigned to any rule, employee override, or live instance, deletion will be blocked — deactivate it instead.`
            : ''
        }
        confirmLabel="Delete template"
        isLoading={del.isPending}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Tab 4 — Rules + seed-instances action
// ------------------------------------------------------------------
function RulesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cycles = [] } = useCycles();
  const { data: templates = [] } = useTemplates();
  const [cycleId, setCycleId] = useState<string | undefined>(undefined);
  const { data: rules = [], refetch } = useRules(cycleId);
  const [draft, setDraft] = useState<{
    id?: string; template_id: string; priority: number; name: string; filters: AssignmentFilters;
  }>({ template_id: '', priority: 10, name: '', filters: EMPTY_FILTERS });
  const [pendingDelete, setPendingDelete] = useState<null | { id: string; name: string }>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editorFlash, setEditorFlash] = useState(false);

  // Per-rule "Sync assignments" state — reuses the same dialog and RPC as
  // the Form Mapping Save flow. See mem://features/annual-review/per-employee-template-override.
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncConflicts, setSyncConflicts] = useState<SeededConflict[]>([]);
  const [syncRule, setSyncRule] = useState<{ templateId: string; templateName: string; ruleLabel: string } | null>(null);
  const [syncResolving, setSyncResolving] = useState<string | null>(null);

  const resetDraft = () => setDraft({ template_id: '', priority: 10, name: '', filters: EMPTY_FILTERS });

  const save = useMutation({
    mutationFn: () => svc.upsertRule({ ...draft, cycle_id: cycleId! }),
    onSuccess: () => { toast.success('Rule saved'); refetch(); resetDraft(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => svc.deleteRule(id),
    onSuccess: () => { toast.success('Rule deleted'); refetch(); setPendingDelete(null); },
    onError: (e: Error) => { toast.error(e.message); setPendingDelete(null); },
  });

  const startEdit = (r: (typeof rules)[number]) => {
    setDraft({
      id: r.id,
      template_id: r.template_id,
      priority: r.priority,
      name: r.name ?? '',
      filters: { ...EMPTY_FILTERS, ...((r.filters as Partial<AssignmentFilters>) ?? {}) },
    });
    // Defer so the CardTitle re-renders in edit mode before we scroll.
    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setEditorFlash(true);
      setTimeout(() => setEditorFlash(false), 1500);
    }, 0);
  };
  const seed = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw new Error('Pick a cycle first');
      return svc.seedInstancesByRules({ cycleId, hrUserId: user?.id ?? null });
    },
    onSuccess: (r) => {
      toast.success(`Seeded ${r.seeded} instance${r.seeded === 1 ? '' : 's'}` + (r.skipped ? ` · ${r.skipped} skipped (no matching rule)` : ''));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Resolve the rule's audience → find employees already seeded on a
  // DIFFERENT template → open the shared reassign dialog. Read-only until
  // the admin confirms.
  const openSyncForRule = async (r: (typeof rules)[number]) => {
    if (!cycleId) return;
    try {
      setSyncResolving(r.id);
      const audience = await previewAudience(
        { ...EMPTY_FILTERS, ...((r.filters as Partial<AssignmentFilters>) ?? {}) },
        { limit: 100_000 },
      );
      const audienceIds = Array.from(new Set([
        ...audience.sample.map((p) => p.id),
        ...(((r.filters as Partial<AssignmentFilters>)?.employee_ids ?? []) as string[]),
      ]));
      if (audienceIds.length === 0) {
        toast.info('This rule resolves to zero employees — nothing to sync.');
        return;
      }
      const conflicts = await findSeededConflicts(cycleId, audienceIds, r.template_id);
      if (conflicts.length === 0) {
        toast.success('No mismatched instances. Everyone in this audience is already on the mapped template.');
        return;
      }
      const tpl = templates.find((t) => t.id === r.template_id);
      setSyncRule({
        templateId: r.template_id,
        templateName: tpl?.name ?? 'target template',
        ruleLabel: r.name || tpl?.name || 'rule',
      });
      setSyncConflicts(conflicts);
      setSyncOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncResolving(null);
    }
  };

  const runSyncAll = async ({
    eligibleInstanceIds, resetInstanceIds, reason,
  }: { eligibleInstanceIds: string[]; resetInstanceIds: string[]; reason: string }) => {
    if (!syncRule) return;
    setSyncing(true);
    try {
      let okMove = 0, failMove = 0, okReset = 0, failReset = 0;
      if (eligibleInstanceIds.length > 0) {
        const res = await svc.bulkReassignViaOverride(
          eligibleInstanceIds.map((id) => ({ instanceId: id, templateId: syncRule.templateId })),
          reason,
        );
        okMove = res.ok; failMove = res.failed.length;
      }
      if (resetInstanceIds.length > 0) {
        const res = await svc.bulkForceResetInstances(
          resetInstanceIds.map((id) => ({ instanceId: id, templateId: syncRule.templateId })),
          reason,
        );
        okReset = res.ok; failReset = res.failed.length;
      }
      const totalFail = failMove + failReset;
      if (totalFail === 0) {
        toast.success(`Synced ${okMove + okReset} employees to ${syncRule.templateName} (${okMove} moved, ${okReset} reset).`);
      } else {
        toast.warning(`Synced ${okMove + okReset}; ${totalFail} failed.`);
      }
      setSyncOpen(false);
      setSyncConflicts([]);
      setSyncRule(null);
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Label>Cycle</Label>
        <Select value={cycleId} onValueChange={setCycleId}>
          <SelectTrigger className="h-10 w-[280px]"><SelectValue placeholder="Pick a cycle" /></SelectTrigger>
          <SelectContent>
            {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.status}</SelectItem>)}
          </SelectContent>
        </Select>
        {cycleId && (
          <Button variant="outline" disabled={seed.isPending || rules.length === 0} onClick={() => seed.mutate()}>
            {seed.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Seed instances by rules
          </Button>
        )}
      </div>

      {!cycleId && (
        <p className="text-sm text-muted-foreground">
          Pick a cycle above to load its assignment rules.
        </p>
      )}
      {cycleId && (
        <Card
          ref={editorRef}
          className={cn(
            'transition-shadow',
            editorFlash && 'ring-2 ring-primary shadow-lg',
          )}
        >
          <CardHeader>
            <CardTitle>
              {draft.id
                ? `Editing "${draft.name || 'rule'}"`
                : 'New rule'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Rules are evaluated in priority order (lower number first). The first rule matching an employee assigns their template.
              Leave all filters empty to match every employee.
            </p>
            <div className="mt-2 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Assign a template to one employee</p>
              <p>Create a rule whose filters uniquely match that person (e.g. their exact designation + department, or designation + grade + level) and set <strong>priority = 1</strong> so it wins before broader rules. Then click <strong>Seed instances by rules</strong>.</p>
              <p>Note: the seeder does not rewrite the template on an already-seeded instance. To change a template post-seed, delete that instance and re-seed.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4 items-end">
              <div className="space-y-1"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Template</Label>
                <Select value={draft.template_id} onValueChange={(v) => setDraft({ ...draft, template_id: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Priority</Label><Input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} /></div>
              <div className="flex gap-2">
                <Button disabled={!draft.template_id || save.isPending} onClick={() => save.mutate()} className="flex-1">
                  {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {draft.id ? 'Save' : 'Add rule'}
                </Button>
                {draft.id && <Button variant="outline" onClick={resetDraft}>Cancel</Button>}
              </div>
            </div>
            <RuleFiltersEditor
              value={draft.filters}
              onChange={(filters) => setDraft({ ...draft, filters })}
            />
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Filters</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id} className="min-h-10">
                    <TableCell>{r.priority}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{templates.find((t) => t.id === r.template_id)?.name ?? r.template_id}</TableCell>
                    <TableCell><RuleFiltersSummary filters={r.filters ?? EMPTY_FILTERS} /></TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="mr-2"
                        onClick={() => openSyncForRule(r)}
                        disabled={syncResolving === r.id}
                        title="Move ALL employees who are already seeded on a different template onto this rule's template. Employees who have already submitted are archived and restarted at pending_self."
                        aria-label={`Sync assignments for rule ${r.name ?? ''}`}
                      >
                        {syncResolving === r.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mr-2"
                        onClick={() => startEdit(r)}
                        aria-label={`Edit rule ${r.name ?? ''}`}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete({ id: r.id, name: r.name ?? '(unnamed rule)' })}
                        aria-label={`Delete rule ${r.name ?? ''}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No rules.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the rule{' '}
              <strong>{pendingDelete?.name}</strong>. Employees currently
              resolved to this rule will fall through to the next matching one
              on the next seed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SyncAssignmentsDialog
        open={syncOpen}
        onOpenChange={(o) => {
          setSyncOpen(o);
          if (!o) { setSyncConflicts([]); setSyncRule(null); }
        }}
        conflicts={syncConflicts}
        targetTemplateName={syncRule?.templateName ?? ''}
        onSyncAll={runSyncAll}
        submitting={syncing}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Calibration tab — distribution + per-instance rating override
// ------------------------------------------------------------------
function CalibrationTab() {
  const { data: activeCycle } = useActiveCycle();
  const { data: instances = [] } = useCycleInstances(activeCycle?.id);
  const override = useOverrideRating();
  const [target, setTarget] = useState<InstanceWithEmployee | null>(null);
  const [newRating, setNewRating] = useState('');
  const [reason, setReason] = useState('');

  const finalized = useMemo(() => instances.filter((i) => !!i.final_rating), [instances]);

  const distribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of finalized) {
      const r = (i.final_rating ?? '').trim();
      if (!r) continue;
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    const total = finalized.length || 1;
    return Array.from(map.entries())
      .map(([rating, count]) => ({ rating, count, pct: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);
  }, [finalized]);

  if (!activeCycle) return <Card><CardContent className="p-6">Activate a cycle to use calibration.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating distribution</CardTitle>
          <p className="text-xs text-muted-foreground">{finalized.length} of {instances.length} reviews finalized.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {distribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No final ratings yet.</p>
          ) : distribution.map((d) => (
            <div key={d.rating} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{d.rating}</span>
                <span className="tabular-nums text-muted-foreground">{d.count} · {d.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${d.pct}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finalized reviews — override rating</CardTitle>
          <p className="text-xs text-muted-foreground">
            Overrides are HR/Admin-only, require a reason, and are recorded in the audit log.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Current rating</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finalized.map((i) => (
                <TableRow key={i.id} className="min-h-10">
                  <TableCell>
                    <div className="font-medium">{i.employee?.full_name ?? i.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{i.employee?.employee_code}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{i.total_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline">{i.final_rating}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setTarget(i); setNewRating(i.final_rating ?? ''); setReason('');
                    }}>Override</Button>
                  </TableCell>
                </TableRow>
              ))}
              {finalized.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No finalized reviews yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override final rating</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.employee?.full_name} · current rating <strong>{target?.final_rating ?? '—'}</strong>.
              Provide a non-empty reason — this is permanently audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>New rating</Label>
              <Input value={newRating} onChange={(e) => setNewRating(e.target.value)} />
            </div>
            <div className="space-y-1"><Label>Reason</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newRating.trim() || reason.trim().length < 3 || override.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!target) return;
                try {
                  await override.mutateAsync({ instanceId: target.id, newRating: newRating.trim(), reason: reason.trim() });
                  toast.success('Rating overridden.');
                  setTarget(null);
                } catch (err) { toast.error((err as Error).message); }
              }}
            >
              {override.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
import { useMemo, useState } from 'react';
import {
  useCycles, useTemplates, useRules, useCycleInstances, useActiveCycle, useTemplate,
  useSendBackStatus, useCloseCycle, useOverrideRating, useCloneTemplate, useCloneCycle,
  useAnnualReviewInstancesPaginated, useCycleStatusCounts, useReopenCycle,
  useInstanceStageScores,
} from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
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
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, Settings2, ListChecks, Calendar, Layers, Pencil, Plus, Download, BarChart3, CheckCheck, Undo2, Lock, Bell, Scale, Copy, Unlock, MoreHorizontal } from 'lucide-react';
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
import { fyStartFromCycle } from '@/lib/annualReview/fiscalYear';
import { SystemScoresUploadDialog } from '@/components/annual-review/SystemScoresUploadDialog';
import { BulkTemplateAssignmentDialog } from '@/components/annual-review/BulkTemplateAssignmentDialog';
import { BulkWorkflowAssignmentDialog } from '@/components/annual-review/BulkWorkflowAssignmentDialog';
import { BulkStageWeightsAssignmentDialog } from '@/components/annual-review/BulkStageWeightsAssignmentDialog';
import { ChangeWorkflowDialog } from '@/components/annual-review/ChangeWorkflowDialog';
import { InstanceStageWeightsDialog } from '@/components/annual-review/InstanceStageWeightsDialog';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import { RecentStageWeightOverridesPanel } from '@/components/annual-review/RecentStageWeightOverridesPanel';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import {
  downloadSystemScoresTemplate,
  downloadTemplateAssignmentTemplate,
  downloadWorkflowAssignmentTemplate,
  downloadStageWeightsTemplate,
} from '@/lib/annualReview/bulkTemplates';
import type {
  AnnualReviewCycle, AnnualReviewTemplate, AssignmentFilters, AnnualReviewerRole,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import {
  resolveStageWeights, computeFinalScore, STAGE_WEIGHT_KEYS,
  type StageWeightKey, type StageWeights,
} from '@/lib/annualReview/finalScore';

export default function AnnualReviewAdmin() {
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Annual Review Admin</h1>
        <p className="text-sm text-muted-foreground">Manage cycles, templates, rules, and finalize reviews.</p>
      </header>
      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="progress" className="gap-1.5"><ListChecks className="h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-4 w-4" />Analytics</TabsTrigger>
          <TabsTrigger value="calibration" className="gap-1.5"><Scale className="h-4 w-4" />Calibration</TabsTrigger>
          <TabsTrigger value="cycles" className="gap-1.5"><Calendar className="h-4 w-4" />Cycles</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><Settings2 className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><Layers className="h-4 w-4" />Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="progress" className="mt-4"><ProgressTab /></TabsContent>
        <TabsContent value="analytics" className="mt-4"><AnalyticsTab /></TabsContent>
        <TabsContent value="calibration" className="mt-4"><CalibrationTab /></TabsContent>
        <TabsContent value="cycles" className="mt-4"><CyclesTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
      </Tabs>
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
  stageScores: Record<string, Partial<Record<'self' | 'manager' | 'skip_manager' | 'bu_head' | 'hr', number | null>>>,
  filtersApplied: Record<string, string>,
  templatesById: Record<string, AnnualReviewTemplate> = {},
) {
  const data = rows.map((i) => {
    const s = stageScores[i.id] ?? {};
    const tpl = templatesById[svc.resolveTemplateId(i) ?? ''] ?? null;
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
      'Self Score': s.self ?? '',
      'Manager Score': s.manager ?? '',
      'Skip Score': s.skip_manager ?? '',
      'BU Head Score': s.bu_head ?? '',
      'HR Score': s.hr ?? '',
    'Total Score': i.total_score ?? '',
    'Criteria Weighted Score': i.criteria_weighted_score ?? '',
    'Weights Source': weightsSource,
    'Weight Self %': weights.self ?? '',
    'Weight Manager %': weights.manager ?? '',
    'Weight Skip %': weights.skip_manager ?? '',
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
    (['self', 'manager', 'skip_manager', 'bu_head', 'hr'] as const).forEach((role) => {
      if (s[role] == null) return;
      detail.push({
        'Employee Code': i.employee?.employee_code ?? '',
        'Employee Name': i.employee?.full_name ?? '',
        'Stage': role,
        'Weighted Score': s[role] as number,
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_self' | 'pending_manager' | 'pending_skip' | 'pending_bu' | 'pending_hr' | 'completed' | 'not_started'>('all');
  const [customWeightsOnly, setCustomWeightsOnly] = useState(false);
  const paginatedArgs = activeCycle
    ? { cycleId: activeCycle.id, page, pageSize, search, status: statusFilter, hasOverride: customWeightsOnly }
    : undefined;
  const { data: paged, refetch } = useAnnualReviewInstancesPaginated(paginatedArgs);
  const instances = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const pageInstanceIds = useMemo(() => instances.map((i) => i.id), [instances]);
  const { data: stageScoresMap = {} } = useInstanceStageScores(pageInstanceIds);
  const [exporting, setExporting] = useState(false);
  const { data: counts = { total: 0, pending_self: 0, completed: 0, not_started: 0, pending_manager: 0, pending_skip: 0, pending_bu: 0, pending_hr: 0 } } = useCycleStatusCounts(activeCycle?.id);
  const [selected, setSelected] = useState<InstanceWithEmployee | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: template } = useTemplate(svc.resolveTemplateId(selected) ?? undefined);
  const { data: uploadTemplate } = useTemplate(svc.resolveTemplateId(instances[0]) ?? undefined);
  const [changeTplFor, setChangeTplFor] = useState<InstanceWithEmployee | null>(null);
  const [bulkTplOpen, setBulkTplOpen] = useState(false);
  const [changeWfFor, setChangeWfFor] = useState<InstanceWithEmployee | null>(null);
  const [bulkWfOpen, setBulkWfOpen] = useState(false);
  const [bulkWeightsOpen, setBulkWeightsOpen] = useState(false);
  const [weightsFor, setWeightsFor] = useState<InstanceWithEmployee | null>(null);
  const { data: allTemplates = [] } = useTemplates();
  const sendBack = useSendBackStatus();
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
          pending_manager: 'manager', pending_skip: 'skip_manager', pending_bu: 'bu_head', pending_hr: 'hr',
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

  const filtered = instances; // server-side filtering already applied
  const inProgressCount = counts.pending_manager + counts.pending_skip + counts.pending_bu + counts.pending_hr;
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
            className="max-w-xs"
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
              <SelectItem value="pending_bu">Pending BU</SelectItem>
              <SelectItem value="pending_hr">Pending HR</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
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
        </div>
        <div className="flex items-center gap-2">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download data
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Choose dataset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={total === 0 || exporting}
                onSelect={async () => {
                  if (!activeCycle) return;
                  setExporting(true);
                  try {
                    const all = await svc.fetchAllInstancesForExport({
                      cycleId: activeCycle.id,
                      search,
                      status: statusFilter as any,
                      hasOverride: customWeightsOnly,
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
                    }, tplMap);
                    toast.success(`Exported ${all.length} row${all.length === 1 ? '' : 's'}.`);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>Progress snapshot (.xlsx)</span>
                  <span className="text-[10px] text-muted-foreground">All filtered rows · scores · weights</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Bulk-edit templates</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!uploadTemplate || instances.length === 0}
                onSelect={() => {
                  if (!activeCycle || !uploadTemplate) return;
                  downloadSystemScoresTemplate(activeCycle, uploadTemplate, instances);
                  toast.success('System-score template downloaded.');
                }}
              >
                <Upload className="h-4 w-4 mr-2" /> System scores
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={instances.length === 0}
                onSelect={() => {
                  if (!activeCycle) return;
                  downloadTemplateAssignmentTemplate(activeCycle, allTemplates, instances);
                  toast.success('Template-assignment sheet downloaded.');
                }}
              >
                <Layers className="h-4 w-4 mr-2" /> Template assignments
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={instances.length === 0}
                onSelect={() => {
                  if (!activeCycle) return;
                  downloadWorkflowAssignmentTemplate(activeCycle, instances);
                  toast.success('Workflow-assignment sheet downloaded.');
                }}
              >
                <ListChecks className="h-4 w-4 mr-2" /> Workflow assignments
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={instances.length === 0}
                onSelect={() => {
                  if (!activeCycle) return;
                  downloadStageWeightsTemplate(activeCycle, instances, new Map(allTemplates.map((t) => [t.id, t])));
                  toast.success('Stage-weights sheet downloaded.');
                }}
              >
                <Scale className="h-4 w-4 mr-2" /> Stage weights
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={instances.length === 0}>
                <Upload className="h-4 w-4" /> Upload data
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Choose dataset</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!uploadTemplate}
                onSelect={() => setUploadOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                <div className="flex flex-col">
                  <span>System scores</span>
                  {!uploadTemplate && (
                    <span className="text-[10px] text-muted-foreground">Requires an active template</span>
                  )}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkTplOpen(true)}>
                <Layers className="h-4 w-4 mr-2" /> Template assignments
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkWfOpen(true)}>
                <ListChecks className="h-4 w-4 mr-2" /> Workflow assignments
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkWeightsOpen(true)}>
                <Scale className="h-4 w-4 mr-2" /> Stage weights
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                <TableHead className="text-right">Self</TableHead>
                <TableHead className="text-right">Manager</TableHead>
                <TableHead className="text-right">Skip</TableHead>
                <TableHead className="text-right">BU</TableHead>
                <TableHead className="text-right">HR</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => {
                const ss = stageScoresMap[i.id] ?? {};
                const fmt = (v: number | null | undefined) =>
                  v == null ? <span className="text-muted-foreground/50">—</span> : v.toFixed(1);
                const canChange = i.overall_status === 'not_started' || i.overall_status === 'pending_self';
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
                  <TableCell className="text-right tabular-nums">{fmt(ss.self)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.manager)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.skip_manager)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.bu_head)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(ss.hr)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{i.total_score?.toFixed(2) ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                  <TableCell className="text-right">{i.final_rating ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
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
                        {canChange && (
                          <>
                            <DropdownMenuItem onClick={() => setChangeTplFor(i)}>
                              <Layers className="h-4 w-4 mr-2" /> Change template
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setChangeWfFor(i)}>
                              <ListChecks className="h-4 w-4 mr-2" /> Change workflow
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setWeightsFor(i)}>
                              <Scale className="h-4 w-4 mr-2" /> Customise weights
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No instances.</TableCell></TableRow>
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

      {uploadTemplate && (
        <SystemScoresUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          template={uploadTemplate}
          cycle={activeCycle}
          rows={instances}
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

      <BulkTemplateAssignmentDialog
        open={bulkTplOpen}
        onOpenChange={setBulkTplOpen}
        cycle={activeCycle}
        instances={instances}
        templates={allTemplates}
        onDone={refetch}
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

      <BulkWorkflowAssignmentDialog
        open={bulkWfOpen}
        onOpenChange={setBulkWfOpen}
        cycle={activeCycle}
        instances={instances}
        onDone={refetch}
      />

      {activeCycle && (
        <BulkStageWeightsAssignmentDialog
          open={bulkWeightsOpen}
          onOpenChange={setBulkWeightsOpen}
          cycle={activeCycle}
          instances={instances}
          templatesById={new Map(allTemplates.map((t) => [t.id, t]))}
          onDone={refetch}
        />
      )}

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
  const currentId = svc.resolveTemplateId(instance) ?? '';
  const isClearing = tplId === '__clear__';

  // Reset when opening on a new instance.
  useMemo(() => {
    setTplId(currentId || '');
    setReason('');
  }, [instance?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => {
      if (!instance) throw new Error('No instance');
      return svc.setTemplateOverride({
        instanceId: instance.id,
        templateId: isClearing ? null : tplId,
        reason: reason.trim(),
      });
    },
    onSuccess: () => { toast.success('Template updated.'); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave =
    reason.trim().length >= 3 &&
    (isClearing
      ? !!instance?.template_override_id
      : !!tplId && tplId !== currentId);

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change template</AlertDialogTitle>
          <AlertDialogDescription>
            Override the template for <strong>{instance?.employee?.full_name ?? '—'}</strong> for this
            cycle only. Allowed before the review starts. The change is audit-logged.
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
                {instance?.template_override_id && (
                  <SelectItem value="__clear__">— Clear override (use rule-seeded template) —</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason (min 3 chars)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this employee getting a different template?" />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); save.mutate(); }}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const STAGE_ORDER = ['not_started','pending_self','pending_manager','pending_skip','pending_bu','pending_hr','completed'] as const;
const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started', pending_self: 'Self', pending_manager: 'Manager',
  pending_skip: 'Skip', pending_bu: 'BU', pending_hr: 'HR', completed: 'Completed',
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
          {(['self_review','manager_review','skip_review','bu_review'] as const).map((k) => (
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
    self: 'Self', manager: 'Mgr', skip_manager: 'Skip', bu_head: 'BU',
    hr: 'HR', system: 'Sys', criteria: 'Crit',
  };
  const COLOR: Record<string, string> = {
    self: 'hsl(var(--primary))',
    manager: 'hsl(var(--chart-2, 142 76% 36%))',
    skip_manager: 'hsl(var(--chart-3, 38 92% 50%))',
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

  const toggleActive = useMutation({
    mutationFn: (t: AnnualReviewTemplate) =>
      svc.upsertTemplate({ id: t.id, is_active: !t.is_active }),
    onSuccess: () => { toast.success('Template updated'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const clone = useCloneTemplate();

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (t: AnnualReviewTemplate) => { setEditing(t); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{templates.length} total template{templates.length === 1 ? '' : 's'}</p>
        <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New Template</Button>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No templates yet. Click <strong>New Template</strong> to build one — you can auto-populate the Blue-Collar preset from inside the editor.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const critCount = t.sections?.criteria?.length ?? 0;
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

  const resetDraft = () => setDraft({ template_id: '', priority: 10, name: '', filters: EMPTY_FILTERS });

  const save = useMutation({
    mutationFn: () => svc.upsertRule({ ...draft, cycle_id: cycleId! }),
    onSuccess: () => { toast.success('Rule saved'); refetch(); resetDraft(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => svc.deleteRule(id),
    onSuccess: () => { toast.success('Rule deleted'); refetch(); },
  });
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

      {cycleId && (
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? 'Edit rule' : 'New rule'}</CardTitle>
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
                      <Button variant="ghost" size="sm" onClick={() => setDraft({
                        id: r.id, template_id: r.template_id, priority: r.priority,
                        name: r.name ?? '', filters: { ...EMPTY_FILTERS, ...(r.filters ?? {}) },
                      })}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => del.mutate(r.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No rules.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
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
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, Search, Save, RefreshCw, Pin, Users, X } from 'lucide-react';
import { useActiveCycle, useTemplates, useRules } from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import AudienceEmployeePickerSection from '@/components/annual-review/audience/AudienceEmployeePickerSection';
import { SyncAssignmentsDialog } from '@/components/annual-review/SyncAssignmentsDialog';
import {
  previewAudience, checkMappingCoverage,
  fetchDepartmentNameMap,
  findSeededConflicts,
  type SeededConflict,
  type CoverageReport,
  type CoverageRow,
} from '@/services/annualReview/formMapping';
import type { AssignmentFilters } from '@/types/annualReview';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * ONE-SCREEN form mapping console.
 *
 * Purpose (launch-day tool): give admins a single place to answer
 * "will every employee see the right form tomorrow?" without touching
 * the factory / matrix / import layers.
 *
 *   1. Coverage banner    — mapped vs unmapped count for active cycle
 *   2. Templates panel    — active-cycle templates + how many people use each
 *   3. Audience builder   — filter-driven "who will this template cover?" preview,
 *                            commits as a new `annual_review_assignment_rules` row
 *   4. Employee override  — search person, see current form, pin a different one
 *
 * All writes reuse existing services — no new tables, no new RPCs.
 */
export default function AnnualReviewFormMapping() {
  const nav = useNavigate();
  const { data: cycle, isLoading: cycleLoading } = useActiveCycle();
  const { data: templates = [] } = useTemplates();
  const { data: rules = [], refetch: refetchRules } = useRules(cycle?.id);

  const coverageQ = useQuery({
    queryKey: ['annual-review', 'form-mapping', 'coverage', cycle?.id],
    queryFn: () => checkMappingCoverage(cycle!.id),
    enabled: !!cycle?.id,
  });

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => nav('/annual-review/admin')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Admin
          </Button>
          <h1 className="text-2xl font-bold">Form Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Assign the right review form to every employee for the active cycle.
            {cycle && <> Cycle: <strong>{cycle.name}</strong>.</>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => coverageQ.refetch()} disabled={coverageQ.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${coverageQ.isFetching ? 'animate-spin' : ''}`} />
          Refresh coverage
        </Button>
      </header>

      {cycleLoading && <div className="text-sm text-muted-foreground">Loading cycle…</div>}
      {!cycleLoading && !cycle && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No active cycle</AlertTitle>
          <AlertDescription>Start an annual review cycle from the Cycles tab before mapping forms.</AlertDescription>
        </Alert>
      )}

      {cycle && (
        <>
          <CoverageBanner report={coverageQ.data} loading={coverageQ.isLoading} />
          <TemplatesUsagePanel
            templates={templates}
            report={coverageQ.data}
            cycleId={cycle.id}
            onChanged={() => coverageQ.refetch()}
          />
          <div className="grid gap-6 xl:grid-cols-2 items-start">
            <AudienceBuilder
              cycleId={cycle.id}
              templates={templates}
              rules={rules}
              report={coverageQ.data}
              onCommitted={async () => {
                await Promise.all([refetchRules(), coverageQ.refetch()]);
                toast.success('Coverage updated.');
              }}
            />
            <EmployeeOverridePanel
              cycleId={cycle.id}
              templates={templates}
              report={coverageQ.data}
              onChanged={() => coverageQ.refetch()}
            />
          </div>
          {coverageQ.data && coverageQ.data.unmapped > 0 && (
            <UnmappedTable report={coverageQ.data} />
          )}
        </>
      )}
    </div>
  );
}

// ── Coverage banner ───────────────────────────────────────────────
function CoverageBanner({ report, loading }: { report?: CoverageReport; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculating coverage…
        </CardContent>
      </Card>
    );
  }
  if (!report) return null;
  const green = report.unmapped === 0;
  return (
    <Alert variant={green ? 'default' : 'destructive'}>
      {green ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      <AlertTitle>
        {green
          ? `All ${report.totalEmployees} active employees are mapped to a form.`
          : `${report.unmapped} of ${report.totalEmployees} employees have no form.`}
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap gap-2 mt-2 text-xs">
          <Badge variant="secondary">Total: {report.totalEmployees}</Badge>
          <Badge variant="default">Seeded: {report.seeded}</Badge>
          <Badge variant="outline">Will seed on start: {report.willSeed}</Badge>
          {report.unmapped > 0 && <Badge variant="destructive">Unmapped: {report.unmapped}</Badge>}
        </div>
      </AlertDescription>
    </Alert>
  );
}

// ── Templates panel with usage counts ─────────────────────────────
function TemplatesUsagePanel({
  templates, report, cycleId, onChanged,
}: {
  templates: { id: string; name: string; is_active: boolean | null }[];
  report?: CoverageReport;
  cycleId: string;
  onChanged: () => void | Promise<unknown>;
}) {
  const [openTemplate, setOpenTemplate] = useState<{ id: string; name: string } | null>(null);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    if (report) for (const r of report.rows) {
      if (!r.resolvedTemplateId) continue;
      m.set(r.resolvedTemplateId, (m.get(r.resolvedTemplateId) ?? 0) + 1);
    }
    return m;
  }, [report]);

  const rows = templates
    // Keep active templates AND inactive templates that still have seeded
    // instances in this cycle — otherwise archiving a template while
    // employees are still bound to it hides them from Form Mapping entirely
    // (BUG: "HK, Pol, Dust, hort - W" — 249 seeded employees invisible).
    .filter((t) => t.is_active !== false || (usage.get(t.id) ?? 0) > 0)
    .map((t) => ({ ...t, count: usage.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const totalCovered = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Templates in use</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{rows.length} template{rows.length === 1 ? '' : 's'}</Badge>
          <Badge variant="secondary">{totalCovered} employee{totalCovered === 1 ? '' : 's'} covered</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No active templates. Create one under Admin → Templates.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8">
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => t.count > 0 && setOpenTemplate({ id: t.id, name: t.name })}
              disabled={t.count === 0}
              className="group flex items-center justify-between border-b border-border/60 last:border-0 gap-3 h-10 text-left transition-colors enabled:hover:bg-muted/40 enabled:cursor-pointer disabled:cursor-default px-1 -mx-1 rounded"
              title={t.count > 0 ? 'View mapped employees' : 'No employees mapped'}
            >
              <span className="text-sm truncate flex items-center gap-2" title={t.name}>
                <span className="truncate">{t.name}</span>
                {t.is_active === false && (
                  <Badge variant="outline" className="shrink-0 text-[10px] py-0 h-4">Inactive</Badge>
                )}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {t.count > 0 && (
                  <Users className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
                <Badge variant={t.count > 0 ? 'default' : 'outline'}>
                  {t.count} employee{t.count === 1 ? '' : 's'}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      </CardContent>
      {openTemplate && report && (
        <TemplateEmployeesDialog
          open={!!openTemplate}
          onOpenChange={(v) => !v && setOpenTemplate(null)}
          template={openTemplate}
          cycleId={cycleId}
          report={report}
          onChanged={onChanged}
        />
      )}
    </Card>
  );
}

// ── Template employees dialog ─────────────────────────────────────
function TemplateEmployeesDialog({
  open, onOpenChange, template, cycleId, report, onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { id: string; name: string };
  cycleId: string;
  report: CoverageReport;
  onChanged: () => void | Promise<unknown>;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [pendingRow, setPendingRow] = useState<CoverageRow | null>(null);
  const [reason, setReason] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [designationFilter, setDesignationFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const mapped = useMemo(
    () => report.rows.filter((r) => r.resolvedTemplateId === template.id),
    [report, template.id],
  );

  const deptQ = useQuery({
    queryKey: ['departments', 'id-name-map'],
    queryFn: fetchDepartmentNameMap,
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const deptMap = deptQ.data;
    return mapped.filter((r) => {
      if (needle) {
        const hay =
          `${r.employee.full_name ?? ''} ${r.employee.employee_code ?? ''} ${r.employee.designation ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (deptFilter !== 'all') {
        const dn = deptMap?.get(r.employee.department_id ?? '') ?? '';
        if (dn !== deptFilter) return false;
      }
      if (gradeFilter !== 'all' && (r.employee.pms_grade ?? '') !== gradeFilter) return false;
      if (designationFilter !== 'all' && (r.employee.designation ?? '') !== designationFilter) return false;
      return true;
    });
  }, [q, mapped, deptFilter, gradeFilter, designationFilter, deptQ.data]);

  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of mapped) {
      const dn = deptQ.data?.get(r.employee.department_id ?? '') ?? '';
      if (dn) s.add(dn);
    }
    return Array.from(s).sort();
  }, [mapped, deptQ.data]);
  const gradeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of mapped) if (r.employee.pms_grade) s.add(r.employee.pms_grade);
    return Array.from(s).sort();
  }, [mapped]);
  const designationOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of mapped) if (r.employee.designation) s.add(r.employee.designation);
    return Array.from(s).sort();
  }, [mapped]);

  const filteredIds = useMemo(() => filtered.map((r) => r.employee.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearFilters = () => {
    setQ('');
    setDeptFilter('all');
    setGradeFilter('all');
    setDesignationFilter('all');
  };

  const empIds = useMemo(() => mapped.map((r) => r.employee.id), [mapped]);

  const instancesQ = useQuery({
    queryKey: ['annual-review', 'form-mapping', 'instances', cycleId, template.id],
    enabled: open && empIds.length > 0,
    queryFn: async () => {
      const out = new Map<string, string>();
      const CHUNK = 300;
      for (let i = 0; i < empIds.length; i += CHUNK) {
        const slice = empIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('annual_review_instances')
          .select('id, employee_id')
          .eq('cycle_id', cycleId)
          .in('employee_id', slice);
        if (error) throw error;
        for (const row of data ?? []) {
          out.set((row as { employee_id: string }).employee_id, (row as { id: string }).id);
        }
      }
      return out;
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!pendingRow) throw new Error('No row selected.');
      if (reason.trim().length < 3) throw new Error('Reason must be at least 3 characters.');
      let instanceId = instancesQ.data?.get(pendingRow.employee.id);
      // Seed-on-demand: the override RPC needs an instance_id. If the cycle
      // hasn't seeded this employee yet, run the idempotent rule-based seeder
      // and refetch so this single removal can proceed without sending the
      // admin to another screen.
      if (!instanceId) {
        await svc.seedInstancesByRules({ cycleId, hrUserId: user?.id ?? null });
        const refreshed = await instancesQ.refetch();
        instanceId = refreshed.data?.get(pendingRow.employee.id);
        if (!instanceId) {
          throw new Error('Could not seed this employee. Check assignment rules for the cycle.');
        }
      }
      // Rule-resolved rows: pin to NULL so this cycle explicitly excludes them.
      // Manually pinned rows: passing null clears the override and lets rules
      // re-resolve (may re-map to the same template).
      await svc.setTemplateOverride({
        instanceId,
        templateId: null,
        reason: reason.trim(),
      });
    },
    onSuccess: async () => {
      toast.success('Employee removed from this template.');
      setPendingRow(null);
      setReason('');
      await onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const seedMissing = useMutation({
    mutationFn: async () => {
      await svc.seedInstancesByRules({ cycleId, hrUserId: user?.id ?? null });
      await instancesQ.refetch();
    },
    onSuccess: async () => {
      toast.success('Missing instances seeded.');
      await onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const unseededCount = useMemo(() => {
    if (!instancesQ.data) return 0;
    return mapped.reduce(
      (n, r) => (instancesQ.data!.get(r.employee.id) ? n : n + 1),
      0,
    );
  }, [mapped, instancesQ.data]);

  const bulkRemove = async () => {
    if (bulkReason.trim().length < 3) {
      toast.error('Reason must be at least 3 characters.');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: ids.length });
    let ok = 0;
    let fail = 0;
    try {
      // Seed any missing instances up-front (idempotent) so the RPC finds them.
      const missing = ids.some((id) => !instancesQ.data?.get(id));
      if (missing) {
        await svc.seedInstancesByRules({ cycleId, hrUserId: user?.id ?? null });
        await instancesQ.refetch();
      }
      const latest = (await instancesQ.refetch()).data;
      for (const empId of ids) {
        const instanceId = latest?.get(empId);
        if (!instanceId) { fail++; setBulkProgress({ done: ok + fail, total: ids.length }); continue; }
        try {
          await svc.setTemplateOverride({
            instanceId,
            templateId: null,
            reason: bulkReason.trim(),
          });
          ok++;
        } catch {
          fail++;
        }
        setBulkProgress({ done: ok + fail, total: ids.length });
      }
      toast.success(`Removed ${ok} employee${ok === 1 ? '' : 's'}${fail ? ` (${fail} failed)` : ''}.`);
      setSelectedIds(new Set());
      setBulkOpen(false);
      setBulkReason('');
      await onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkRunning(false);
      setBulkProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {mapped.length} employee{mapped.length === 1 ? '' : 's'} mapped to this template for the active cycle.
            Removing an employee here creates an audit-logged per-employee override.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, code, or designation…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {deptOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Grade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {gradeOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={designationFilter} onValueChange={setDesignationFilter}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Designation" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All designations</SelectItem>
                {designationOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {(q || deptFilter !== 'all' || gradeFilter !== 'all' || designationFilter !== 'all') && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Showing {filtered.length} of {mapped.length}
              {selectedIds.size > 0 && <> · <strong>{selectedIds.size}</strong> selected</>}
            </span>
            <Button
              size="sm"
              variant="destructive"
              disabled={selectedIds.size === 0}
              onClick={() => { setBulkReason(''); setBulkOpen(true); }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Remove selected ({selectedIds.size})
            </Button>
          </div>
        </div>

        {mapped.length > 0 && instancesQ.isFetched && unseededCount > 0 && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-sm">
              {unseededCount} of {mapped.length} mapped employee{mapped.length === 1 ? '' : 's'} not seeded yet
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs">
                Removal will seed the employee on the fly. You can also seed everyone missing now.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => seedMissing.mutate()}
                disabled={seedMissing.isPending}
              >
                {seedMissing.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Seed missing now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {mapped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No employees are currently mapped to this template.
          </p>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAllFiltered}
                      aria-label="Select all filtered"
                    />
                  </TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const instanceId = instancesQ.data?.get(r.employee.id);
                  const isSeeded = !!instanceId;
                  return (
                    <TableRow key={r.employee.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(r.employee.id)}
                          onCheckedChange={() => toggleOne(r.employee.id)}
                          aria-label={`Select ${r.employee.full_name ?? r.employee.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.employee.employee_code ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {r.employee.full_name ?? '—'}
                        {r.hasOverride && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">Pinned</Badge>
                        )}
                        {!isSeeded && instancesQ.isFetched && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] border-amber-500/50 text-amber-700"
                          >
                            Not seeded
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {deptQ.data?.get(r.employee.department_id ?? '') || '—'}
                      </TableCell>
                      <TableCell className="text-sm">{r.employee.designation ?? '—'}</TableCell>
                      <TableCell className="text-sm">{r.employee.pms_grade ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={instancesQ.isLoading}
                          onClick={() => { setPendingRow(r); setReason(''); }}
                          title={isSeeded ? 'Remove from template' : 'Not seeded — will seed on confirm'}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      No matches.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {pendingRow && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Remove {pendingRow.employee.full_name} from {template.name}?</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-xs">
                {pendingRow.hasOverride
                  ? 'This employee is manually pinned. Removing clears the pin — they will fall back to rule resolution and may re-land on this same template if a rule still matches.'
                  : 'This employee matches a mapping rule. Removing creates a per-employee override that unmaps them for this cycle. Re-map via the audience builder or per-employee panel afterwards.'}
              </p>
              {!instancesQ.data?.get(pendingRow.employee.id) && (
                <p className="text-xs">
                  This employee isn't seeded yet. Confirming will seed their instance for this cycle and then apply the removal.
                </p>
              )}
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (min 3 characters, audit-logged)"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending || reason.trim().length < 3}
                >
                  {remove.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <X className="h-4 w-4 mr-1" />}
                  Confirm remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setPendingRow(null); setReason(''); }}
                  disabled={remove.isPending}
                >
                  Cancel
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>

        <Dialog open={bulkOpen} onOpenChange={(o) => !bulkRunning && setBulkOpen(o)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Remove {selectedIds.size} employee{selectedIds.size === 1 ? '' : 's'} from {template.name}?</DialogTitle>
              <DialogDescription>
                Each removal creates an audit-logged per-employee override. Employees not yet seeded will be seeded first.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={3}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Reason (min 3 characters, audit-logged)"
              disabled={bulkRunning}
            />
            {bulkProgress && (
              <p className="text-xs text-muted-foreground">
                Processed {bulkProgress.done} / {bulkProgress.total}…
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkRunning}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={bulkRemove}
                disabled={bulkRunning || bulkReason.trim().length < 3}
              >
                {bulkRunning
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <X className="h-4 w-4 mr-1" />}
                Confirm remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Audience builder ──────────────────────────────────────────────
function AudienceBuilder({
  cycleId, templates, rules, report, onCommitted,
}: {
  cycleId: string;
  templates: { id: string; name: string; is_active: boolean | null }[];
  rules: { id: string; template_id: string; name: string | null; priority: number }[];
  report?: CoverageReport;
  onCommitted: () => void | Promise<void>;
}) {
  const [templateId, setTemplateId] = useState<string>('');
  const [filters, setFilters] = useState<AssignmentFilters>(EMPTY_FILTERS);
  const [ruleName, setRuleName] = useState('');
  const [lastSavedTemplateId, setLastSavedTemplateId] = useState<string | null>(null);
  // Employee ids that matched the filters at save time — the source of truth
  // for shadow-rule detection. Without this, the banner blamed *any* rule
  // that had coverage anywhere, even when it had zero overlap with the new
  // audience.
  const [lastSavedAudienceIds, setLastSavedAudienceIds] = useState<string[] | null>(null);

  // Post-save sync state — when the just-saved rule overlaps employees
  // already seeded on a different template, offer bulk reassignment via
  // the per-instance override RPC.
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncConflicts, setSyncConflicts] = useState<SeededConflict[]>([]);
  const [syncTemplateId, setSyncTemplateId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const previewQ = useQuery({
    queryKey: ['annual-review', 'form-mapping', 'preview', filters],
    queryFn: () => previewAudience(filters, { limit: 25 }),
    staleTime: 5_000,
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error('Pick a template first.');
      // New rules take the HIGHEST precedence — strictly lower priority
      // number than every existing rule. The DB column has no CHECK, so
      // zero / negative priorities are valid and give us headroom without
      // touching existing rows. Fixes the tie-at-priority-1 shadow bug.
      const minExisting = rules.reduce(
        (m, r) => Math.min(m, r.priority ?? 100),
        100,
      );
      const priority = rules.length === 0 ? 100 : minExisting - 1;
      // Snapshot the exact audience before writing so the post-save shadow
      // check compares against what THIS rule was supposed to cover, not
      // "any employee currently resolved by any rule".
      const audience = await previewAudience(filters, { limit: 100_000 });
      // Fold in explicit ids too — `previewAudience` returns rows that
      // satisfy the whole matcher (facets + id list per mode), which is
      // exactly what we want for conflict scope.
      const audienceIds = Array.from(new Set([
        ...audience.sample.map((p) => p.id),
        ...((filters.employee_ids ?? []) as string[]),
      ]));
      // Detect employees who already have an instance on a DIFFERENT
      // template — the seeder won't move them, so surface them for
      // explicit sync via override.
      const conflicts = await findSeededConflicts(cycleId, audienceIds, templateId);
      await svc.upsertRule({
        cycle_id: cycleId,
        template_id: templateId,
        name: ruleName.trim() || null,
        priority,
        filters,
        is_active: true,
      });
      return { audienceIds, conflicts, savedTemplateId: templateId };
    },
    onSuccess: ({ audienceIds, conflicts, savedTemplateId }) => {
      toast.success('Rule saved. Recalculating coverage…');
      setLastSavedTemplateId(templateId);
      setLastSavedAudienceIds(audienceIds);
      setRuleName('');
      onCommitted();
      if (conflicts.length > 0) {
        setSyncConflicts(conflicts);
        setSyncTemplateId(savedTemplateId);
        setSyncOpen(true);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const savedTemplateName = useMemo(
    () => templates.find((t) => t.id === (syncTemplateId ?? templateId))?.name ?? '',
    [templates, syncTemplateId, templateId],
  );

  const runSync = async () => {
    if (!syncTemplateId) return;
    const eligible = syncConflicts.filter((c) => c.eligible_for_reassign);
    if (eligible.length === 0) {
      toast.error('No conflicts eligible for reassignment (all past pending_self).');
      return;
    }
    setSyncing(true);
    try {
      const reason = `Reassigned via Form Mapping rule (${savedTemplateName || 'new mapping'})`;
      const res = await svc.bulkReassignViaOverride(
        eligible.map((c) => ({ instanceId: c.instance_id, templateId: syncTemplateId })),
        reason,
      );
      if (res.failed.length === 0) {
        toast.success(`Reassigned ${res.ok} employee${res.ok === 1 ? '' : 's'} to ${savedTemplateName}.`);
      } else {
        toast.warning(`Reassigned ${res.ok}; ${res.failed.length} failed.`);
      }
      setSyncOpen(false);
      setSyncConflicts([]);
      setSyncTemplateId(null);
      await onCommitted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const activeTpls = templates.filter((t) => t.is_active !== false);

  // Post-save diagnostic. Two distinct outcomes require two distinct
  // messages — the old code always claimed "shadowed" even when the true
  // reason was "no employees matched at all".
  const postSaveDiag = useMemo((): null | {
    kind: 'shadowed'; ruleLabel: string;
  } | {
    kind: 'empty_audience';
  } => {
    if (!lastSavedTemplateId || !report || !lastSavedAudienceIds) return null;
    const covered = report.rows.filter(
      (r) => r.resolvedTemplateId === lastSavedTemplateId,
    ).length;
    if (covered > 0) return null;
    if (lastSavedAudienceIds.length === 0) return { kind: 'empty_audience' };
    // Which templates are actually resolved for THIS rule's audience?
    const audienceSet = new Set(lastSavedAudienceIds);
    const tplCountsForAudience = new Map<string, number>();
    for (const r of report.rows) {
      if (!audienceSet.has(r.employee.id)) continue;
      if (!r.resolvedTemplateId) continue;
      tplCountsForAudience.set(
        r.resolvedTemplateId,
        (tplCountsForAudience.get(r.resolvedTemplateId) ?? 0) + 1,
      );
    }
    // Nobody in the intended audience received any template — probably the
    // audience was seeded to unmapped or filtered out server-side. Not a
    // shadow scenario.
    if (tplCountsForAudience.size === 0) return { kind: 'empty_audience' };
    // Pick the highest-priority active rule that resolves at least one
    // employee in this audience to a *different* template.
    const sorted = [...rules]
      .filter((r) => r.template_id !== lastSavedTemplateId)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const shadow = sorted.find(
      (r) => (tplCountsForAudience.get(r.template_id) ?? 0) > 0,
    );
    if (!shadow) return null;
    const tpl = templates.find((t) => t.id === shadow.template_id);
    return { kind: 'shadowed', ruleLabel: shadow.name || tpl?.name || 'another rule' };
  }, [lastSavedTemplateId, lastSavedAudienceIds, report, rules, templates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Map a template to an audience</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Template</label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Pick a template…" /></SelectTrigger>
            <SelectContent>
              {activeTpls.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Audience filters</label>
          <RuleFiltersEditor value={filters} onChange={setFilters} />
          <div className="text-xs text-muted-foreground">
            <RuleFiltersSummary filters={filters} />
          </div>
        </div>
        <AudienceEmployeePickerSection
          cycleId={cycleId}
          templates={templates}
          value={filters}
          onChange={setFilters}
        />
        <div className="rounded-md border p-3 bg-muted/30">
          {previewQ.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Counting…
            </p>
          )}
          {previewQ.data && (
            <>
              <p className="text-sm">
                This will assign the template to{' '}
                <strong>{previewQ.data.total}</strong> employee{previewQ.data.total === 1 ? '' : 's'}.
              </p>
              {previewQ.data.sample.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  e.g. {previewQ.data.sample.slice(0, 5).map((p) => p.full_name).join(', ')}
                  {previewQ.data.total > 5 && '…'}
                </p>
              )}
            </>
          )}
        </div>
        <div className="grid gap-2">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Rule name (optional)</label>
          <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. Executives — All Depts" />
        </div>
        <Button
          onClick={() => commit.mutate()}
          disabled={!templateId || commit.isPending || previewQ.data?.total === 0}
          className="w-full"
        >
          {commit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save mapping rule
        </Button>
        {postSaveDiag?.kind === 'shadowed' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Saved, but shadowed by a higher-priority rule</AlertTitle>
            <AlertDescription>
              A higher-priority rule (<strong>{postSaveDiag.ruleLabel}</strong>){' '}
              already covers these employees, so your new rule resolves to 0
              people. Narrow the earlier rule, or lower its priority on the
              Rules tab.
            </AlertDescription>
          </Alert>
        )}
        {postSaveDiag?.kind === 'empty_audience' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Rule saved, but no employees resolved to it</AlertTitle>
            <AlertDescription>
              The audience filters no longer match anyone in this cycle. Adjust
              the filters or review priorities on the <strong>Rules</strong>{' '}
              tab.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Rules run in priority order (lowest number wins). New rules are saved
          with the highest precedence so they take effect immediately. Edit
          priorities on the <strong>Rules</strong> tab.
        </p>
      </CardContent>
      <SyncAssignmentsDialog
        open={syncOpen}
        onOpenChange={(o) => {
          setSyncOpen(o);
          if (!o) { setSyncConflicts([]); setSyncTemplateId(null); }
        }}
        conflicts={syncConflicts}
        targetTemplateName={savedTemplateName}
        onConfirm={runSync}
        submitting={syncing}
      />
    </Card>
  );
}

// SyncAssignmentsDialog now lives in
// src/components/annual-review/SyncAssignmentsDialog.tsx so the Rules tab in
// AnnualReviewAdmin can reuse it for the per-rule "Sync assignments" action.

// ── Per-employee override ─────────────────────────────────────────
function EmployeeOverridePanel({
  cycleId, templates, report, onChanged,
}: {
  cycleId: string;
  templates: { id: string; name: string; is_active: boolean | null }[];
  report?: CoverageReport;
  onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const [pinTpl, setPinTpl] = useState('');
  const [reason, setReason] = useState('');
  const templatesById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const filtered = useMemo(() => {
    if (!report) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return report.rows.slice(0, 25);
    return report.rows
      .filter((r) =>
        (r.employee.full_name ?? '').toLowerCase().includes(needle) ||
        (r.employee.employee_code ?? '').toLowerCase().includes(needle),
      ).slice(0, 25);
  }, [q, report]);

  const selectedRow = report?.rows.find((r) => r.employee.id === selectedEmp);

  // Ensure the employee has a seeded instance for this cycle (override
  // needs an instance_id). If none exists we surface a helpful message
  // rather than silently failing.
  const instanceQ = useQuery({
    queryKey: ['annual-review', 'form-mapping', 'instance', cycleId, selectedEmp],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_instances')
        .select('id')
        .eq('cycle_id', cycleId)
        .eq('employee_id', selectedEmp!)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!selectedEmp,
  });

  const pin = useMutation({
    mutationFn: async () => {
      if (!instanceQ.data) throw new Error('This employee has no instance yet. Seed the cycle first.');
      if (!pinTpl) throw new Error('Pick a template to pin.');
      if (reason.trim().length < 3) throw new Error('Reason must be at least 3 characters.');
      await svc.setTemplateOverride({
        instanceId: instanceQ.data,
        templateId: pinTpl,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Template pinned for this employee.');
      setReason(''); setPinTpl('');
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (!instanceQ.data) throw new Error('No instance.');
      if (reason.trim().length < 3) throw new Error('Reason must be at least 3 characters.');
      await svc.setTemplateOverride({
        instanceId: instanceQ.data,
        templateId: null,
        reason: reason.trim(),
      });
    },
    onSuccess: () => { toast.success('Override cleared.'); setReason(''); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Pin className="h-4 w-4" /> Pin a template to one employee
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Find employee</label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Name or employee code…"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground p-3">No matches.</p>}
            {filtered.map((r) => (
              <button
                key={r.employee.id}
                onClick={() => setSelectedEmp(r.employee.id)}
                className={`w-full text-left px-3 py-2 border-b last:border-0 text-sm hover:bg-muted/50 ${
                  selectedEmp === r.employee.id ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {r.employee.full_name}{' '}
                    <span className="text-xs text-muted-foreground">({r.employee.employee_code})</span>
                  </span>
                  {r.status === 'unmapped' && <Badge variant="destructive" className="text-[10px]">Unmapped</Badge>}
                  {r.hasOverride && <Badge variant="secondary" className="text-[10px]">Pinned</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {!selectedRow && (
            <p className="text-sm text-muted-foreground">Pick an employee to see and change their template.</p>
          )}
          {selectedRow && (
            <>
              <div className="rounded-md border p-3 space-y-1 bg-muted/30">
                <div className="text-sm font-medium">{selectedRow.employee.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedRow.employee.designation ?? '—'} · Grade {selectedRow.employee.pms_grade ?? '—'} · Level {selectedRow.employee.level ?? '—'}
                </div>
                <div className="text-xs pt-1">
                  Current form:{' '}
                  <strong>
                    {selectedRow.resolvedTemplateId
                      ? templatesById.get(selectedRow.resolvedTemplateId)?.name ?? selectedRow.resolvedTemplateId
                      : 'None (would be skipped on seed)'}
                  </strong>
                  {selectedRow.hasOverride && <Badge className="ml-2" variant="secondary">Manually pinned</Badge>}
                </div>
                {!instanceQ.data && instanceQ.isFetched && (
                  <p className="text-xs text-amber-600 pt-1">
                    No instance exists yet — seed the cycle first to enable per-employee override.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Pin template</label>
                <Select value={pinTpl} onValueChange={setPinTpl}>
                  <SelectTrigger><SelectValue placeholder="Pick a template to pin…" /></SelectTrigger>
                  <SelectContent>
                    {templates.filter((t) => t.is_active !== false).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Reason (audit-logged)</label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Why does this employee need a different form?" />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => pin.mutate()}
                  disabled={pin.isPending || !instanceQ.data}
                >
                  {pin.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pin className="h-4 w-4 mr-2" />}
                  Pin template
                </Button>
                {selectedRow.hasOverride && (
                  <Button
                    variant="outline"
                    onClick={() => clear.mutate()}
                    disabled={clear.isPending || !instanceQ.data}
                  >
                    {clear.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Clear override
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Unmapped table ────────────────────────────────────────────────
function UnmappedTable({ report }: { report: CoverageReport }) {
  const rows = report.rows.filter((r) => r.status === 'unmapped');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-destructive">Unmapped employees ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employee.id}>
                  <TableCell className="font-mono text-xs">{r.employee.employee_code}</TableCell>
                  <TableCell>{r.employee.full_name}</TableCell>
                  <TableCell>{r.employee.designation ?? '—'}</TableCell>
                  <TableCell>{r.employee.pms_grade ?? '—'}</TableCell>
                  <TableCell>{r.employee.level ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Create a rule that covers these employees using the audience builder above,
          or pin them individually via the per-employee panel.
        </p>
      </CardContent>
    </Card>
  );
}
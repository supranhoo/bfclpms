import { useMemo, useState } from 'react';
import {
  useCycles, useTemplates, useRules, useCycleInstances, useActiveCycle, useTemplate,
  useSendBackStatus, useCloseCycle, useOverrideRating,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, Settings2, ListChecks, Calendar, Layers, Pencil, Plus, Download, BarChart3, CheckCheck, Undo2, Lock, Bell, Scale } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { HrFinalizationSheet } from '@/components/annual-review/HrFinalizationSheet';
import { SystemScoresUploadDialog } from '@/components/annual-review/SystemScoresUploadDialog';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import type {
  AnnualReviewCycle, AnnualReviewTemplate, AssignmentFilters, AnnualReviewerRole,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

export default function AnnualReviewAdmin() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
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
 * Exports the active-cycle progress grid to an .xlsx workbook (single sheet).
 * Columns kept lean & deterministic for downstream pivot use.
 */
function exportProgress(cycleName: string, rows: InstanceWithEmployee[]) {
  const data = rows.map((i) => ({
    'Employee Code': i.employee?.employee_code ?? '',
    'Employee Name': i.employee?.full_name ?? '',
    'Designation': i.employee?.designation ?? '',
    'Stage': i.overall_status,
    'Total Score': i.total_score ?? '',
    'Criteria Weighted Score': i.criteria_weighted_score ?? '',
    'Final Rating': i.final_rating ?? '',
    'Finalized At': i.finalized_at ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Progress');
  const safe = cycleName.replace(/[^a-zA-Z0-9._-]/g, '_');
  XLSX.writeFile(wb, `annual-review-progress_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ------------------------------------------------------------------
// Tab 1 — Progress + bulk upload + HR finalize sheet
// ------------------------------------------------------------------
function ProgressTab() {
  const { data: activeCycle } = useActiveCycle();
  const { data: instances = [], refetch } = useCycleInstances(activeCycle?.id);
  const [selected, setSelected] = useState<InstanceWithEmployee | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: template } = useTemplate(selected?.template_id);
  const { data: uploadTemplate } = useTemplate(activeCycle ? instances[0]?.template_id : undefined);
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

  const counts = useMemo(() => {
    const c = { total: 0, self: 0, in_progress: 0, completed: 0 };
    for (const i of instances) {
      c.total++;
      if (i.overall_status === 'pending_self') c.self++;
      else if (i.overall_status === 'completed') c.completed++;
      else if (i.overall_status !== 'not_started') c.in_progress++;
    }
    return c;
  }, [instances]);

  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => instances.filter((i) => !search || (i.employee?.full_name ?? '').toLowerCase().includes(search.toLowerCase())),
    [instances, search],
  );

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

  if (!activeCycle) return <Card><CardContent className="p-6">Activate a cycle to see progress.</CardContent></Card>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Total Active Reviews', val: counts.total },
          { label: 'Self-Review Pending', val: counts.self },
          { label: 'In Progress', val: counts.in_progress },
          { label: 'Completed', val: counts.completed },
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
        <Input placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
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
          <Button
            variant="outline" className="gap-2"
            onClick={() => exportProgress(activeCycle.name, filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4" /> Export to Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setUploadOpen(true)} disabled={!uploadTemplate}>
            <Upload className="h-4 w-4" /> Bulk system-score upload
          </Button>
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
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
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
                  <TableCell className="text-right tabular-nums">{i.total_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right">{i.final_rating ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(i)}>Finalize</Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No instances.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
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
      />

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
const STAGE_ORDER = ['not_started','pending_self','pending_manager','pending_skip','pending_bu','pending_hr','completed'] as const;
const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started', pending_self: 'Self', pending_manager: 'Manager',
  pending_skip: 'Skip', pending_bu: 'BU', pending_hr: 'HR', completed: 'Completed',
};

function AnalyticsTab() {
  const { data: activeCycle } = useActiveCycle();
  const { data: instances = [] } = useCycleInstances(activeCycle?.id);

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
                    {c.status !== 'closed' && (
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmCloseId(c.id)}
                      >
                        <Lock className="h-3.5 w-3.5 mr-1" /> Close
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
    </div>
  );
}

// ------------------------------------------------------------------
// Tab 3 — Templates (visual builder via TemplateEditorDialog)
// ------------------------------------------------------------------
function TemplatesTab() {
  const { data: templates = [], refetch } = useTemplates();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AnnualReviewTemplate | null>(null);

  const toggleActive = useMutation({
    mutationFn: (t: AnnualReviewTemplate) =>
      svc.upsertTemplate({ id: t.id, is_active: !t.is_active }),
    onSuccess: () => { toast.success('Template updated'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

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
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)} className="gap-1.5">
                      <Pencil className="h-4 w-4" /> Edit
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
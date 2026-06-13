import { useMemo, useState } from 'react';
import {
  useCycles, useTemplates, useRules, useCycleInstances, useActiveCycle, useTemplate,
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Upload, Settings2, ListChecks, Calendar, Layers, Pencil, Plus, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { HrFinalizationSheet } from '@/components/annual-review/HrFinalizationSheet';
import { SystemScoresUploadDialog } from '@/components/annual-review/SystemScoresUploadDialog';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import type {
  AnnualReviewCycle, AnnualReviewTemplate, AssignmentFilters,
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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="progress" className="gap-1.5"><ListChecks className="h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="cycles" className="gap-1.5"><Calendar className="h-4 w-4" />Cycles</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><Settings2 className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><Layers className="h-4 w-4" />Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="progress" className="mt-4"><ProgressTab /></TabsContent>
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

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
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
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No instances.</TableCell></TableRow>
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
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setDraft(c)}>Edit</Button></TableCell>
                </TableRow>
              ))}
              {cycles.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No cycles yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
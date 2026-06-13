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
import { Loader2, Upload, Settings2, ListChecks, Calendar, Layers, Pencil, Plus } from 'lucide-react';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { HrFinalizationSheet } from '@/components/annual-review/HrFinalizationSheet';
import { SystemScoresUploadDialog } from '@/components/annual-review/SystemScoresUploadDialog';
import { TemplateEditorDialog } from '@/components/annual-review/TemplateEditorDialog';
import type {
  AnnualReviewCycle, AnnualReviewTemplate,
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
        <Button variant="outline" className="gap-2" onClick={() => setUploadOpen(true)} disabled={!uploadTemplate}>
          <Upload className="h-4 w-4" /> Bulk system-score upload
        </Button>
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
// Tab 3 — Templates (lean JSON editor + multilingual toggle + self-review fields)
// ------------------------------------------------------------------
function TemplatesTab() {
  const { data: templates = [], refetch } = useTemplates();
  const [selected, setSelected] = useState<AnnualReviewTemplate | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sectionsText, setSectionsText] = useState('');

  const load = (t: AnnualReviewTemplate | null) => {
    setSelected(t);
    setName(t?.name ?? '');
    setDesc(t?.description ?? '');
    setIsActive(t?.is_active ?? true);
    setSectionsText(JSON.stringify(t?.sections ?? defaultSections(), null, 2));
  };

  const save = useMutation({
    mutationFn: async () => {
      let sections: TemplateSections;
      try { sections = JSON.parse(sectionsText); } catch { throw new Error('Sections JSON is invalid'); }
      return svc.upsertTemplate({ id: selected?.id, name, description: desc, is_active: isActive, sections });
    },
    onSuccess: () => { toast.success('Template saved'); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={() => load(null)} className="mb-2">+ New template</Button>
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.id}>
                <button className={`w-full text-left rounded p-2 hover:bg-muted/50 ${selected?.id === t.id ? 'bg-muted' : ''}`} onClick={() => load(t)}>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.is_active ? 'Active' : 'Inactive'}</div>
                </button>
              </li>
            ))}
            {templates.length === 0 && <li className="text-sm text-muted-foreground p-2">No templates.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle>{selected ? 'Edit template' : 'New template'}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1 flex flex-col"><Label>Active</Label><div className="h-10 flex items-center"><Switch checked={isActive} onCheckedChange={setIsActive} /></div></div>
          </div>
          <div className="space-y-1"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Sections (JSON)</Label>
            <Textarea rows={20} value={sectionsText} onChange={(e) => setSectionsText(e.target.value)} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              Keys: <code>system_scores</code>, <code>criteria</code>, <code>eligibility_criteria</code>,
              <code> self_review_fields</code>, <code>settings</code>, <code>translations</code>.
              Supported languages: {SUPPORTED_LANGUAGES.map((l) => l.code).join(', ')}.
            </p>
          </div>
          <Button disabled={save.isPending || !name} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function defaultSections(): TemplateSections {
  return {
    settings: { enable_multilingual: false, default_language: 'en', available_languages: ['en'] },
    system_scores: [{ id: 'safety', name: 'Safety Score', weight: 20 }],
    eligibility_criteria: [{ id: 'attendance', name: 'Attendance', type: 'number', operator: 'gte', expected_value: 90 }],
    self_review_fields: [{ id: 'key_achievements', label: 'Key achievements', required: true }],
    criteria: [
      { id: 'role_delivery', name: 'Role delivery', description: 'Output and ownership of assigned work', weight: 10, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'], enable_remarks: true, enable_evidence: true },
    ],
    translations: {},
  };
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
  const [draft, setDraft] = useState({ template_id: '', priority: 10, name: '' });

  const save = useMutation({
    mutationFn: () => svc.upsertRule({ ...draft, cycle_id: cycleId! }),
    onSuccess: () => { toast.success('Rule saved'); refetch(); setDraft({ template_id: '', priority: 10, name: '' }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => svc.deleteRule(id),
    onSuccess: () => { toast.success('Rule deleted'); refetch(); },
  });
  const seed = useMutation({
    mutationFn: async () => {
      const rule = rules[0];
      if (!rule || !cycleId) throw new Error('Add a rule first');
      return svc.seedInstancesForCycle({ cycleId, templateId: rule.template_id, hrUserId: user?.id ?? null });
    },
    onSuccess: (n) => { toast.success(`Seeded ${n} instances`); qc.invalidateQueries(); },
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
            {seed.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Seed instances from first rule
          </Button>
        )}
      </div>

      {cycleId && (
        <Card>
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
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
              <Button disabled={!draft.template_id || save.isPending} onClick={() => save.mutate()}>Add rule</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Priority</TableHead><TableHead>Name</TableHead><TableHead>Template</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id} className="min-h-10">
                    <TableCell>{r.priority}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{templates.find((t) => t.id === r.template_id)?.name ?? r.template_id}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => del.mutate(r.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No rules.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
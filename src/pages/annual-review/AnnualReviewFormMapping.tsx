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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, Search, Save, RefreshCw, Pin } from 'lucide-react';
import { useActiveCycle, useTemplates, useRules } from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import { RuleFiltersEditor, RuleFiltersSummary, EMPTY_FILTERS } from '@/components/annual-review/RuleFiltersEditor';
import {
  previewAudience, checkMappingCoverage,
  type CoverageReport,
} from '@/services/annualReview/formMapping';
import type { AssignmentFilters } from '@/types/annualReview';
import { supabase } from '@/integrations/supabase/client';

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
          <TemplatesUsagePanel templates={templates} report={coverageQ.data} />
          <div className="max-w-3xl">
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
          </div>
          <EmployeeOverridePanel
            cycleId={cycle.id}
            templates={templates}
            report={coverageQ.data}
            onChanged={() => coverageQ.refetch()}
          />
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
  templates, report,
}: {
  templates: { id: string; name: string; is_active: boolean | null }[];
  report?: CoverageReport;
}) {
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    if (report) for (const r of report.rows) {
      if (!r.resolvedTemplateId) continue;
      m.set(r.resolvedTemplateId, (m.get(r.resolvedTemplateId) ?? 0) + 1);
    }
    return m;
  }, [report]);

  const rows = templates
    .filter((t) => t.is_active !== false)
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
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-border/60 last:border-0 gap-3 h-10"
            >
              <span className="text-sm truncate" title={t.name}>{t.name}</span>
              <Badge variant={t.count > 0 ? 'default' : 'outline'} className="shrink-0">
                {t.count} employee{t.count === 1 ? '' : 's'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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

  const previewQ = useQuery({
    queryKey: ['annual-review', 'form-mapping', 'preview', filters],
    queryFn: () => previewAudience(filters, { limit: 25 }),
    staleTime: 5_000,
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error('Pick a template first.');
      // New rules take the HIGHEST precedence (lowest priority number) so
      // freshly-created specific rules aren't shadowed by pre-existing
      // broader rules. Existing rules are untouched — admins can reorder
      // manually on the Rules tab if needed.
      const minExisting = rules.reduce(
        (m, r) => Math.min(m, r.priority ?? 100),
        100,
      );
      const priority = rules.length === 0 ? 100 : Math.max(1, minExisting - 10);
      await svc.upsertRule({
        cycle_id: cycleId,
        template_id: templateId,
        name: ruleName.trim() || null,
        priority,
        filters,
        is_active: true,
      });
    },
    onSuccess: () => {
      toast.success('Rule saved. Recalculating coverage…');
      setLastSavedTemplateId(templateId);
      setRuleName('');
      onCommitted();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeTpls = templates.filter((t) => t.is_active !== false);

  // After a save, if coverage shows the saved template still has 0 employees
  // resolved to it, an earlier (lower-priority-number) rule is shadowing it.
  const shadowingRule = useMemo(() => {
    if (!lastSavedTemplateId || !report) return null;
    const covered = report.rows.filter(
      (r) => r.resolvedTemplateId === lastSavedTemplateId,
    ).length;
    if (covered > 0) return null;
    // Find the top-priority rule that covers at least one employee — likely
    // the shadowing broad rule.
    const counts = new Map<string, number>();
    for (const r of report.rows) {
      if (!r.resolvedTemplateId) continue;
      counts.set(r.resolvedTemplateId, (counts.get(r.resolvedTemplateId) ?? 0) + 1);
    }
    const sorted = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const shadow = sorted.find(
      (r) => r.template_id !== lastSavedTemplateId && (counts.get(r.template_id) ?? 0) > 0,
    );
    if (!shadow) return null;
    const tpl = templates.find((t) => t.id === shadow.template_id);
    return shadow.name || tpl?.name || 'another rule';
  }, [lastSavedTemplateId, report, rules, templates]);

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
        {shadowingRule && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Saved, but shadowed by a higher-priority rule</AlertTitle>
            <AlertDescription>
              A higher-priority rule (<strong>{shadowingRule}</strong>) already
              covers these employees, so your new rule resolves to 0 people.
              Narrow the earlier rule, or lower its priority on the Rules tab.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Rules run in priority order (lowest number wins). New rules are saved
          with the highest precedence so they take effect immediately. Edit
          priorities on the <strong>Rules</strong> tab.
        </p>
      </CardContent>
    </Card>
  );
}

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
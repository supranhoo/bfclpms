import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowLeft, PlayCircle, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useCycles } from '@/hooks/useAnnualReview';
import { useBusinessUnits, useDepartments } from '@/hooks/useSafetyOrg';
import { useBusinessUnitSubUnits } from '@/hooks/useProductionTargets';
import {
  previewFactoryRun, commitFactoryRun,
  type PlannedRow, type FactoryRunInput, type ArchetypeCode, type GradeBucket,
} from '@/services/annualReview/templateFactory';
import { rebuildFactoryTemplatesForCycle } from '@/services/annualReview/templateFactoryBulk';
import { listArchetypes } from '@/services/annualReview/templateArchetypes';
import { STAGE_KEYS, type StageKey } from '@/services/annualReview/templateArchetypes';

const ARCHETYPE_CODES: ArchetypeCode[] = ['A', 'B', 'C', 'D'];
const GRADE_BUCKETS: GradeBucket[] = ['M', 'W', 'T', 'other'];

export default function TemplateFactory() {
  const nav = useNavigate();
  const { data: cycles = [] } = useCycles();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: archetypes = [] } = useQuery({
    queryKey: ['annual-review-template-archetypes'],
    queryFn: listArchetypes,
  });

  const [cycleId, setCycleId] = useState<string>('');
  const [buId, setBuId] = useState<string>('');
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [subUnitIds, setSubUnitIds] = useState<string[]>([]);
  const [includeNoSubUnit, setIncludeNoSubUnit] = useState(true);
  const [archetypeCodes, setArchetypeCodes] = useState<ArchetypeCode[]>(['A', 'B', 'C', 'D']);
  const [gradeBuckets, setGradeBuckets] = useState<GradeBucket[]>(['M', 'W', 'T', 'other']);
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideWeights, setOverrideWeights] = useState<Record<StageKey, number>>({
    self: 0, dept_head: 50, bu_head: 50,
  });
  const [plans, setPlans] = useState<PlannedRow[] | null>(null);

  const { data: departments = [] } = useDepartments(buId || null);
  const { data: subUnits = [] } = useBusinessUnitSubUnits(buId || undefined);

  const cycle = useMemo(() => cycles.find((c) => c.id === cycleId) ?? null, [cycles, cycleId]);

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const overrideTotal = STAGE_KEYS.reduce((s, k) => s + (overrideWeights[k] || 0), 0);

  const runInput: FactoryRunInput | null = useMemo(() => {
    if (!cycle) return null;
    const subs: (string | null)[] = [...subUnitIds];
    if (includeNoSubUnit) subs.push(null);
    return {
      cycle,
      departmentIds: deptIds,
      subUnitIds: subs,
      archetypeCodes,
      gradeBuckets,
      overrideStageWeights: overrideOn ? overrideWeights : null,
    };
  }, [cycle, deptIds, subUnitIds, includeNoSubUnit, archetypeCodes, gradeBuckets, overrideOn, overrideWeights]);

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!runInput) throw new Error('Pick a cycle first.');
      if (overrideOn && overrideTotal !== 100) {
        throw new Error(`Stage-weight override must sum to 100 (currently ${overrideTotal}).`);
      }
      return previewFactoryRun(runInput);
    },
    onSuccess: (rows) => {
      setPlans(rows);
      if (rows.length === 0) toast.info('Nothing to generate for this selection.');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!plans || plans.length === 0) throw new Error('Run preview first.');
      return commitFactoryRun(plans);
    },
    onSuccess: (res) => {
      if (res.errors.length) {
        toast.error(`Committed with ${res.errors.length} error${res.errors.length === 1 ? '' : 's'}. See table.`);
      } else {
        toast.success(`Templates ready: ${res.created} created, ${res.updated} updated.`);
      }
      // Re-run preview to refresh existing IDs.
      previewMut.mutate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rebuildMut = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw new Error('Pick a cycle first.');
      return rebuildFactoryTemplatesForCycle(cycleId);
    },
    onSuccess: (res) => {
      const errorText = res.errors.length ? `, ${res.errors.length} error(s)` : '';
      toast.success(
        `Rebuilt ${res.updated} template${res.updated === 1 ? '' : 's'} (scanned ${res.scanned}, skipped ${res.skipped}${errorText}).`,
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createCount = plans?.filter((p) => p.action === 'create').length ?? 0;
  const updateCount = plans?.filter((p) => p.action === 'update').length ?? 0;
  const zeroWeightCount = plans?.filter((p) => p.systemWeightTotal === 0 && p.criteriaCount === 0).length ?? 0;
  const badCriteriaWeightCount = plans?.filter(
    (p) => p.criteriaSource === 'library' && !p.criteriaWeightOk,
  ).length ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav('/annual-review/admin')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Template Factory</h1>
          <p className="text-sm text-muted-foreground">
            Bulk-generate annual-review templates from archetypes, system KPIs, and the weight matrix.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>1. Scope</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cycle *</Label>
              <Select value={cycleId} onValueChange={setCycleId}>
                <SelectTrigger><SelectValue placeholder="Pick a cycle…" /></SelectTrigger>
                <SelectContent>
                  {cycles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Business Unit</Label>
              <Select value={buId} onValueChange={(v) => { setBuId(v); setDeptIds([]); setSubUnitIds([]); }}>
                <SelectTrigger><SelectValue placeholder="Pick a BU…" /></SelectTrigger>
                <SelectContent>
                  {businessUnits.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Departments {deptIds.length > 0 && <span className="text-xs text-muted-foreground">({deptIds.length} selected)</span>}</Label>
              {departments.length > 0 && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDeptIds(departments.map((d) => d.id))}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeptIds([])}>None</Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto border rounded p-2">
              {departments.length === 0 && (
                <div className="text-sm text-muted-foreground col-span-full py-4 text-center">
                  {buId ? 'No departments in this BU.' : 'Pick a Business Unit first.'}
                </div>
              )}
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                  <Checkbox
                    checked={deptIds.includes(d.id)}
                    onCheckedChange={() => setDeptIds((prev) => toggle(prev, d.id))}
                  />
                  <span className="truncate">{d.name}</span>
                </label>
              ))}
            </div>
          </div>

          {subUnits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sub-Units {subUnitIds.length > 0 && <span className="text-xs text-muted-foreground">({subUnitIds.length} selected)</span>}</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSubUnitIds(subUnits.map((s) => s.id))}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => setSubUnitIds([])}>None</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                {subUnits.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                    <Checkbox
                      checked={subUnitIds.includes(s.id)}
                      onCheckedChange={() => setSubUnitIds((prev) => toggle(prev, s.id))}
                    />
                    <span className="truncate">{s.label}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={includeNoSubUnit} onCheckedChange={(v) => setIncludeNoSubUnit(Boolean(v))} />
                <span>Also generate a "no sub-unit" template per dept (falls back to dept-level weights)</span>
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Archetypes & Grade Buckets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Archetypes</Label>
            <div className="flex flex-wrap gap-3">
              {ARCHETYPE_CODES.map((code) => {
                const a = archetypes.find((x) => x.code === code);
                const disabled = !a || !a.is_active;
                return (
                  <label key={code} className={`flex items-center gap-2 text-sm border rounded px-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-muted'}`}>
                    <Checkbox
                      checked={archetypeCodes.includes(code)}
                      disabled={disabled}
                      onCheckedChange={() => setArchetypeCodes((prev) => toggle(prev, code))}
                    />
                    <div>
                      <div className="font-mono font-medium">{code}</div>
                      <div className="text-xs text-muted-foreground max-w-[16rem] truncate">
                        {a?.name_en ?? '(missing)'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Grade Buckets</Label>
            <div className="flex flex-wrap gap-3">
              {GRADE_BUCKETS.map((b) => (
                <label key={b} className="flex items-center gap-2 text-sm border rounded px-3 py-2 cursor-pointer hover:bg-muted">
                  <Checkbox
                    checked={gradeBuckets.includes(b)}
                    onCheckedChange={() => setGradeBuckets((prev) => toggle(prev, b))}
                  />
                  <span className="font-mono">{b}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Stage-Weight Override (optional)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={overrideOn} onCheckedChange={(v) => setOverrideOn(Boolean(v))} />
            <span>Override archetype defaults for this run (Self → Dept Head → BU Head)</span>
          </label>
          {overrideOn && (
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {STAGE_KEYS.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{k}</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={overrideWeights[k]}
                    onChange={(e) => setOverrideWeights((prev) => ({ ...prev, [k]: Number(e.target.value) || 0 }))}
                  />
                </div>
              ))}
              <div className={`col-span-3 text-xs font-mono ${overrideTotal === 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                Total: {overrideTotal}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>4. Preview & Commit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => previewMut.mutate()}
              disabled={previewMut.isPending || !cycleId || deptIds.length === 0}
            >
              {previewMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PlayCircle className="h-4 w-4 mr-2" />Preview
            </Button>
            <Button
              variant="default"
              onClick={() => commitMut.mutate()}
              disabled={commitMut.isPending || !plans || plans.length === 0}
            >
              {commitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Commit {plans ? `(${plans.length})` : ''}
            </Button>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => rebuildMut.mutate()}
              disabled={rebuildMut.isPending || !cycleId}
              title="Refresh system_scores, criteria, and display_mode on every factory-generated template in this cycle. Idempotent."
            >
              {rebuildMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-apply to existing templates
            </Button>
          </div>

          {plans && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Create: {createCount}</Badge>
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Update: {updateCount}</Badge>
                {zeroWeightCount > 0 && (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {zeroWeightCount} with no system weights & no criteria
                  </Badge>
                )}
                {badCriteriaWeightCount > 0 && (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {badCriteriaWeightCount} with criteria weights ≠ 100
                  </Badge>
                )}
              </div>
              <div className="border rounded max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Template Name</TableHead>
                      <TableHead className="w-24">Archetype</TableHead>
                      <TableHead className="w-24">Bucket</TableHead>
                      <TableHead className="w-24 text-right">Sys Wt %</TableHead>
                      <TableHead className="w-24 text-right">Criteria</TableHead>
                      <TableHead className="w-28 text-right">Crit Wt %</TableHead>
                      <TableHead className="w-24">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((p) => (
                      <TableRow key={`${p.key.department_id}/${p.key.sub_unit_id ?? '-'}/${p.key.archetype_code}/${p.key.grade_bucket}`}>
                        <TableCell className="text-sm">{p.templateName}</TableCell>
                        <TableCell><Badge variant="outline" className="font-mono">{p.key.archetype_code}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className="font-mono">{p.key.grade_bucket}</Badge></TableCell>
                        <TableCell className={`text-right font-mono ${p.systemWeightTotal === 0 ? 'text-red-600' : p.systemWeightTotal > 100 ? 'text-amber-600' : ''}`}>
                          {p.systemWeightTotal}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.criteriaCount}
                          <span className="ml-1 text-[10px] text-muted-foreground">({p.criteriaSource === 'library' ? 'lib' : 'archetype'})</span>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${
                          p.criteriaSource !== 'library' ? 'text-muted-foreground' :
                          p.criteriaWeightOk ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {p.criteriaSource === 'library' ? p.criteriaWeightTotal : '—'}
                        </TableCell>
                        <TableCell>
                          {p.action === 'create'
                            ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">create</Badge>
                            : <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">update</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
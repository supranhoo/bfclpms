/**
 * ADR-297 — add one KPI to many people, from the console.
 *
 * The console's job is to run the group, so creating a KPI is a group act:
 * define it once, choose who it lands on (the current scope), preview exactly
 * who receives it, then issue it. Three kinds:
 *
 *  - Individual        — each person owns their own number (classic KPI).
 *  - Shared value      — one value (e.g. production target vs actual) spreads
 *                        to everyone in scope.
 *  - Department event  — a single event (e.g. an LTI) hits the whole
 *                        department it lands in.
 *
 * Writes go through `bu_console_kpi_create` (admin-only, dry-run first).
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useConsoleKpiCreate, useConsoleKpiCreatePreview,
  type BuConsoleScope, type ConsoleKpiCreateResult, type ConsoleKpiKind,
} from '@/hooks/useBuConsole';
import { Loader2, Users } from 'lucide-react';

const KIND_COPY: Record<ConsoleKpiKind, { label: string; hint: string }> = {
  individual: {
    label: 'Individual',
    hint: 'Each person is measured on their own number.',
  },
  shared: {
    label: 'Shared value',
    hint: 'One value — e.g. production target vs actual — spreads to everyone in scope.',
  },
  department_event: {
    label: 'Department event',
    hint: 'A single event — e.g. an LTI — applies to the whole department it lands in.',
  },
};

const SKIP_LABELS: Record<string, string> = {
  duplicate_kpi: 'Already has this KPI this month',
};

export interface ConsoleKpiCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: BuConsoleScope | null;
  scopeLabel: string;
  /** Categories available in the loaded tree — the KPI must belong to one. */
  categories: Array<{ id: string; name: string }>;
  /** KRA names already present in scope, offered as suggestions. */
  kraNames: string[];
}

export function ConsoleKpiCreateDialog({
  open, onOpenChange, scope, scopeLabel, categories, kraNames,
}: ConsoleKpiCreateDialogProps) {
  const [kind, setKind] = useState<ConsoleKpiKind>('individual');
  const [categoryId, setCategoryId] = useState('');
  const [kraName, setKraName] = useState('');
  const [kpiName, setKpiName] = useState('');
  const [criteria, setCriteria] = useState('');
  const [uom, setUom] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [weightage, setWeightage] = useState('');
  const [preview, setPreview] = useState<ConsoleKpiCreateResult | null>(null);

  const previewMutation = useConsoleKpiCreatePreview();
  const commitMutation = useConsoleKpiCreate();

  const payload = useMemo(
    () => ({
      kind,
      category_id: categoryId,
      kra_name: kraName.trim(),
      kpi_name: kpiName.trim(),
      criteria: criteria.trim() || null,
      uom: uom.trim() || null,
      target_value: targetValue.trim() || null,
      weightage: weightage.trim() || null,
    }),
    [kind, categoryId, kraName, kpiName, criteria, uom, targetValue, weightage],
  );

  const canPreview =
    !!scope && !!categoryId && kraName.trim().length > 0 && kpiName.trim().length > 0;

  const reset = () => {
    setPreview(null);
    setKpiName('');
    setCriteria('');
    setUom('');
    setTargetValue('');
    setWeightage('');
  };

  const runPreview = async () => {
    if (!scope || !canPreview) return;
    const res = await previewMutation.mutateAsync({ kpi: payload as any, ...scope });
    setPreview(res);
  };

  const runCommit = async () => {
    if (!scope || !canPreview) return;
    const res = await commitMutation.mutateAsync({ kpi: payload as any, ...scope });
    if (res.authorized) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New KPI for this scope</DialogTitle>
          <DialogDescription>
            Define it once and issue it to everyone in {scopeLabel || 'the loaded scope'}.
          </DialogDescription>
        </DialogHeader>

        {!scope ? (
          <Alert>
            <AlertTitle>Load a scope first</AlertTitle>
            <AlertDescription>
              Choose a review month and the org filters, then apply the scope — the KPI lands on
              exactly the people the console is showing.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(KIND_COPY) as ConsoleKpiKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); setPreview(null); }}
                  aria-pressed={kind === k}
                  className={
                    'min-h-10 rounded-lg border p-3 text-left transition-colors ' +
                    (kind === k
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50 focus-visible:bg-muted/50')
                  }
                >
                  <span className="block text-sm font-medium">{KIND_COPY[k].label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {KIND_COPY[k].hint}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-kpi-category">Category</Label>
                <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPreview(null); }}>
                  <SelectTrigger id="new-kpi-category" className="h-10">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-kpi-kra">KRA</Label>
                <Input
                  id="new-kpi-kra"
                  className="h-10"
                  list="console-kra-suggestions"
                  value={kraName}
                  onChange={(e) => { setKraName(e.target.value); setPreview(null); }}
                  placeholder="e.g. Power generation"
                />
                <datalist id="console-kra-suggestions">
                  {kraNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-kpi-name">KPI name</Label>
                <Input
                  id="new-kpi-name"
                  className="h-10"
                  value={kpiName}
                  onChange={(e) => { setKpiName(e.target.value); setPreview(null); }}
                  placeholder="e.g. Power generation from 45 MWh"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-kpi-uom">Unit of measure</Label>
                <Input id="new-kpi-uom" className="h-10" value={uom}
                  onChange={(e) => setUom(e.target.value)} placeholder="MWh, %, count" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-kpi-target">Target</Label>
                <Input id="new-kpi-target" className="h-10" inputMode="decimal" value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)} placeholder="45" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-kpi-weight">Weightage (%)</Label>
                <Input id="new-kpi-weight" className="h-10" inputMode="decimal" value={weightage}
                  onChange={(e) => setWeightage(e.target.value)} placeholder="10" />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-kpi-criteria">Criteria / definition</Label>
                <Textarea id="new-kpi-criteria" rows={2} value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                  placeholder="How this KPI is measured and scored." />
              </div>
            </div>

            {preview && (
              preview.authorized ? (
                <div className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {preview.will_create ?? 0} employee
                      {(preview.will_create ?? 0) === 1 ? '' : 's'} will receive this KPI
                    </span>
                    {!!preview.will_skip && (
                      <Badge variant="outline">{preview.will_skip} skipped</Badge>
                    )}
                  </div>
                  <ScrollArea className="mt-2 max-h-40">
                    <ul className="space-y-1 pr-3 text-xs text-muted-foreground">
                      {(preview.preview ?? []).map((p) => (
                        <li key={p.employee_id}>
                          {p.full_name}
                          {p.employee_code ? ` (${p.employee_code})` : ''}
                          {p.department_name ? ` · ${p.department_name}` : ''}
                        </li>
                      ))}
                      {(preview.skipped ?? []).map((s) => (
                        <li key={`s-${s.employee_id}`} className="text-warning">
                          {s.full_name} — {SKIP_LABELS[s.reason] ?? s.reason}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertTitle>Not allowed</AlertTitle>
                  <AlertDescription>
                    Creating KPIs is admin-only. Management and audit can act on KPIs once they
                    leave KRA Set.
                  </AlertDescription>
                </Alert>
              )
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="outline"
            onClick={runPreview}
            disabled={!canPreview || previewMutation.isPending}
          >
            {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Preview recipients
          </Button>
          <Button
            onClick={runCommit}
            disabled={
              !canPreview || !preview?.authorized || !preview?.will_create || commitMutation.isPending
            }
          >
            {commitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue KPI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

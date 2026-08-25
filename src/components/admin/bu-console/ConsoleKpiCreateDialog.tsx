/**
 * ADR-297 — add one KPI to many people, from the console.
 * ADR-319 — the three "kinds" are gone: the dialog now speaks the same scope
 * vocabulary as the rest of the product (POLICY §KPI-SCOPE-SINGLE-VOCABULARY),
 * imported from `@/lib/review/kpiScope`. Individual, Organization, Department
 * and Employee behave exactly as before; only the words are unified, and the
 * not-yet-built scopes are shown disabled so both surfaces read identically.
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
  type BuConsoleScope, type ConsoleKpiCreateResult,
} from '@/hooks/useBuConsole';
import {
  KPI_SCOPES, KPI_SCOPE_COPY, PLANNED_KPI_SCOPES, PLANNED_KPI_SCOPE_LABELS,
  scopeNeedsTarget, type KpiScope,
} from '@/lib/review/kpiScope';
import { ScopeTargetPicker } from '@/components/admin/kpi-scope/ScopeTargetPicker';
import { Loader2, Users } from 'lucide-react';
import { coreTitle } from './mergeTriage';

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
  /**
   * ADR-313 — KPI names already in scope. Used only to warn, at typing time,
   * that the metric already exists under a slightly different title, so the
   * console stops manufacturing the duplicates the merge queue has to clean.
   */
  existingKpiNames?: string[];
}

export function ConsoleKpiCreateDialog({
  open, onOpenChange, scope, scopeLabel, categories, kraNames, existingKpiNames = [],
}: ConsoleKpiCreateDialogProps) {
  const [kpiScope, setKpiScope] = useState<KpiScope>('individual');
  // ADR-320 — a grouped scope owns exactly one target id.
  const [scopeTargetId, setScopeTargetId] = useState<string | null>(null);
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
      scope: kpiScope,
      scope_target_id: scopeTargetId,
      category_id: categoryId,
      kra_name: kraName.trim(),
      kpi_name: kpiName.trim(),
      criteria: criteria.trim() || null,
      uom: uom.trim() || null,
      target_value: targetValue.trim() || null,
      weightage: weightage.trim() || null,
    }),
    [kpiScope, scopeTargetId, categoryId, kraName, kpiName, criteria, uom, targetValue, weightage],
  );




  // ADR-313 — look-alike detection uses the same cleaning as the merge queue.
  const lookalikes = useMemo(() => {
    const typed = coreTitle(kpiName);
    if (typed.length < 4) return [];
    return existingKpiNames.filter((n) => coreTitle(n) === typed).slice(0, 5);
  }, [kpiName, existingKpiNames]);

  // ADR-320 — a grouped scope cannot be previewed until it names its target.
  const canPreview =
    !!scope && !!categoryId && kraName.trim().length > 0 && kpiName.trim().length > 0
    && (!scopeNeedsTarget(kpiScope) || !!scopeTargetId);

  const reset = () => {
    setPreview(null);
    setKpiName('');
    setCriteria('');
    setUom('');
    setTargetValue('');
    setWeightage('');
    setScopeTargetId(null);
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
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Scope
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {KPI_SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setKpiScope(s); setScopeTargetId(null); setPreview(null); }}
                    aria-pressed={kpiScope === s}
                    className={
                      'min-h-10 rounded-lg border p-3 text-left transition-colors min-w-0 ' +
                      (kpiScope === s
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50 focus-visible:bg-muted/50')
                    }
                  >
                    <span className="block text-sm font-medium">{KPI_SCOPE_COPY[s].label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground break-words">
                      {KPI_SCOPE_COPY[s].hint}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Coming soon:</span>
                {PLANNED_KPI_SCOPES.map((s) => (
                  <Badge key={s} variant="outline" className="opacity-60 font-normal">
                    {PLANNED_KPI_SCOPE_LABELS[s]}
                  </Badge>
                ))}
              </div>
            </fieldset>


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
                  aria-describedby={lookalikes.length ? 'new-kpi-name-dup' : undefined}
                />
                {lookalikes.length > 0 && (
                  <p id="new-kpi-name-dup" className="text-xs text-amber-600 dark:text-amber-500">
                    This scope already measures{' '}
                    <span className="font-medium">{lookalikes[0]}</span>
                    {lookalikes.length > 1 ? ` (+${lookalikes.length - 1} more variant${lookalikes.length > 2 ? 's' : ''})` : ''}
                    . Reuse the existing KPI instead of creating another variant.
                  </p>
                )}
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

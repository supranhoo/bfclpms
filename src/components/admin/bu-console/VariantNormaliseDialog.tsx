/**
 * ADR-315 / ADR-325 — align the definition variants of one KPI.
 *
 * ADR-327 — this action owns the shared definition only: description and
 * measurement formula. Employee scoring profiles are managed separately.
 *
 * Weightage is never written — it is a per-employee number and is not part of
 * the variant key (POLICY §CONSOLE-VARIANT-NORMALISE).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Layers, Loader2, ShieldCheck } from 'lucide-react';
import {
  useVariantNormalisePreview, useVariantNormaliseCommit,
  GROUP_EDIT_SKIP_LABELS,
  type KpiDetailArgs, type BuConsoleKpiVariant, type VariantNormaliseResult,
} from '@/hooks/useBuConsole';
import {
  resolveEditSpan, spanModesAvailable, describeSpan, periodLabel, toTarget,
  EDIT_SPAN_LABELS, MAX_ROLLOUT_PERIODS, type EditSpanMode,
} from './groupEditSpan';
import {
  buildNormalisePlan, definitionOf, pickCanonicalVariant, aggregateNormalise, classifyVariance,
  type CanonicalDefinition,
} from './variantNormalise';

interface Props {
  args: KpiDetailArgs | null;
  variants: BuConsoleKpiVariant[];
  kpiLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_DEF: CanonicalDefinition = {
  description: '', formula: '', scoring_logic: '', target_value: '',
};

export function VariantNormaliseDialog({
  args, variants, kpiLabel, open, onOpenChange,
}: Props) {
  const [canonicalKey, setCanonicalKey] = useState<string>('');
  const [def, setDef] = useState<CanonicalDefinition>(EMPTY_DEF);
  const [allowLocked, setAllowLocked] = useState(false);
  const [resetOverrides, setResetOverrides] = useState(false);
  const [spanMode, setSpanMode] = useState<EditSpanMode>('this');
  const [spanCount, setSpanCount] = useState(3);
  const [preview, setPreview] = useState<VariantNormaliseResult | null>(null);

  const previewMut = useVariantNormalisePreview();
  const commitMut = useVariantNormaliseCommit();

  // Reset to the best default whenever the dialog opens on a new KPI.
  useEffect(() => {
    if (!open) return;
    const best = pickCanonicalVariant(variants);
    setCanonicalKey(best?.variant_key ?? '');
    setDef(best ? definitionOf(best) : EMPTY_DEF);
    setPreview(null);
    setAllowLocked(false);
    setResetOverrides(false);
    setSpanMode('this');
  }, [open, args?.titleKey, args?.kpiName]);

  const variance = useMemo(() => classifyVariance(variants), [variants]);

  const spanModes = useMemo(
    () => (args ? spanModesAvailable(toTarget(args.period, args.year)) : (['this'] as EditSpanMode[])),
    [args?.period, args?.year],
  );
  const targets = useMemo(
    () => (args ? resolveEditSpan(toTarget(args.period, args.year), spanMode, spanCount) : []),
    [args?.period, args?.year, spanMode, spanCount],
  );

  const plan = useMemo(
    () => buildNormalisePlan(variants, canonicalKey, def),
    [variants, canonicalKey, def],
  );
  const totals = useMemo(() => aggregateNormalise(preview?.entries ?? []), [preview]);
  const busy = previewMut.isPending || commitMut.isPending;

  const invalidate = () => setPreview(null);

  const baseArgs = args && {
    categoryId: args.categoryId,
    kraName: args.kraName,
    kpiName: args.kpiName,
    buIds: args.buIds ?? [],
    deptIds: args.deptIds ?? [],
    divisionIds: args.divisionIds ?? [],
    managerIds: args.managerIds ?? [],
    titleKey: args.titleKey ?? null,
    allowLocked,
    resetOverrides,
  };

  const selectVariant = (key: string) => {
    setCanonicalKey(key);
    const v = variants.find(x => x.variant_key === key);
    if (v) setDef(definitionOf(v));
    invalidate();
  };

  const runPreview = () => {
    if (!baseArgs || plan.steps.length === 0) return;
    previewMut.mutate(
      { ...baseArgs, steps: plan.steps, targets: targets.map(t => ({ month: t.month, year: t.year })) },
      { onSuccess: setPreview },
    );
  };

  const runCommit = () => {
    if (!baseArgs || plan.steps.length === 0) return;
    commitMut.mutate(
      { ...baseArgs, steps: plan.steps, targets: targets.map(t => ({ month: t.month, year: t.year })) },
      { onSuccess: () => { onOpenChange(false); } },
    );
  };

  const skipRows = (preview?.entries ?? []).flatMap(e =>
    (e.result?.skip_summary ?? []).map(s => ({ ...s, variantKey: e.variantKey })),
  );

  /** Readable label per variant key — the preview table must not show raw hashes. */
  const variantLabels = useMemo(() => {
    const map = new Map<string, string>();
    variants.forEach((v, i) => {
      const target = v.target_value ?? null;
      map.set(v.variant_key, `Variant ${i + 1}${target !== null && target !== undefined ? ` · target ${target}` : ''}`);
    });
    return map;
  }, [variants]);

  const targetSummary = variance.targets.map(t => t || '—').join(' · ');


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1200px] min-w-0 flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-amber-600" />
             <span className="min-w-0 break-words">Standardise shared definition — {kpiLabel}</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {variants.length} variant{variants.length === 1 ? '' : 's'}:{' '}
             {variance.wordingGroups} shared-definition group{variance.wordingGroups === 1 ? '' : 's'} ·{' '}
             {variance.scoringGroups} employee scoring profile{variance.scoringGroups === 1 ? '' : 's'} protected.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Canonical wording</Label>
                <ul className="space-y-2">
                  {variants.map((v, i) => {
                    const d = definitionOf(v);
                    const selected = v.variant_key === canonicalKey;
                    return (
                      <li key={v.variant_key}>
                        <button
                          type="button"
                          onClick={() => selectVariant(v.variant_key)}
                          className={`w-full min-w-0 rounded-md border p-3 text-left text-xs transition-colors ${
                            selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">Variant {i + 1}</span>
                            <Badge variant="outline">
                              {v.employee_count} employee{v.employee_count === 1 ? '' : 's'}
                            </Badge>
                            <Badge variant="outline">
                              target {d.target_value || '—'}{v.uom ? ` ${v.uom}` : ''}
                            </Badge>
                              {selected && <Badge variant="secondary">Shared-definition source</Badge>}
                          </span>
                          <span className="mt-1 block break-words text-muted-foreground">
                            Description: {d.description || '—'}
                          </span>
                          <span className="block break-words text-muted-foreground">
                            Formula: {d.formula || '—'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    rows={3} value={def.description}
                    onChange={(e) => { setDef({ ...def, description: e.target.value }); invalidate(); }}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label className="text-xs">Formula</Label>
                  <Textarea
                    rows={3} value={def.formula}
                    onChange={(e) => { setDef({ ...def, formula: e.target.value }); invalidate(); }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground md:col-span-2">
                  Description and formula are often swapped on legacy rows — fix them here once and
                  every mapped row is aligned.
                </p>
              </div>

              <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                <p className="flex flex-wrap items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Employee scoring is protected.
                </p>
                <p className="break-words text-muted-foreground">
                  Targets ({targetSummary || '—'}), R0–R5 bands, scoring tests and weightages stay exactly as they are.{' '}
                  {' '}{plan.predictedVariantCount} variant{plan.predictedVariantCount === 1 ? '' : 's'}
                  {' '}may remain because employee scoring differences are deliberate.
                </p>
              </div>
          </div>

          {/* Plan summary */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs">
            <Badge variant="secondary">
              {plan.steps.length} variant{plan.steps.length === 1 ? '' : 's'} to rewrite
            </Badge>
            <Badge variant="outline">{plan.employeesAffected} employee rows in scope</Badge>
            <Badge variant="outline">{plan.alreadyAligned.length} already aligned</Badge>
            <Badge variant="outline">
              shared definition only · employee scoring untouched
            </Badge>
            <Badge variant={plan.steps.length ? 'secondary' : 'outline'}>
              {plan.steps.length
                ? `${plan.predictedVariantCount} variant${plan.predictedVariantCount === 1 ? '' : 's'} after apply`
                : 'Nothing to change'}
            </Badge>
          </div>

          {/* Span control (ADR-291 parity) */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-medium">Apply to</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={spanMode}
                onValueChange={(v) => { setSpanMode(v as EditSpanMode); invalidate(); }}
              >
                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {spanModes.map(m => (
                    <SelectItem key={m} value={m}>{EDIT_SPAN_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {spanMode === 'next_n' && (
                <Input
                  type="number" min={2} max={MAX_ROLLOUT_PERIODS} className="w-24"
                  value={spanCount}
                  onChange={(e) => { setSpanCount(Number(e.target.value) || 2); invalidate(); }}
                />
              )}
              <Badge variant="secondary">{describeSpan(targets)}</Badge>
            </div>
            {spanModes.length === 1 && (
              <p className="text-[11px] text-muted-foreground">
                The loaded month is in the past, so only that month can be aligned.
              </p>
            )}
          </div>

          {/* Guardrails */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Label htmlFor="vn-locked" className="text-xs font-normal">
                Include rows already in review (approved final scores stay immutable)
              </Label>
              <Switch
                id="vn-locked" checked={allowLocked}
                onCheckedChange={(v) => { setAllowLocked(v); invalidate(); }}
              />
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Label htmlFor="vn-reset" className="text-xs font-normal">
                Also align rows with individual overrides
              </Label>
              <Switch
                id="vn-reset" checked={resetOverrides}
                onCheckedChange={(v) => { setResetOverrides(v); invalidate(); }}
              />
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{totals.willWrite} rows will be written</Badge>
                <Badge variant="outline">{totals.willSkip} skipped</Badge>
                <Badge variant="outline">
                  employee scoring unchanged
                </Badge>
                {totals.failed > 0 && (
                  <Badge variant="destructive">{totals.failed} preview call(s) failed</Badge>
                )}
              </div>

              <div className="min-w-0 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Will write</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.entries.map((e, i) => (
                      <TableRow key={`${e.variantKey}-${i}`}>
                        <TableCell className="whitespace-nowrap">{periodLabel(e.target)}</TableCell>
                        <TableCell className="text-xs">
                          {variantLabels.get(e.variantKey) ?? 'Variant'}
                        </TableCell>

                        <TableCell className="text-right tabular-nums">
                          {e.error ? '—' : (e.result?.will_write ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.error ? e.error : (e.result?.will_skip ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {skipRows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skipRows.map((s: any, i) => (
                    <Badge key={`${s.reason}-${i}`} variant="outline" className="font-normal">
                      {GROUP_EDIT_SKIP_LABELS[s.reason] ?? s.reason} · {s.count ?? 0}
                    </Badge>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={runPreview}
            disabled={busy || plan.steps.length === 0}
          >
            {previewMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Preview
          </Button>
          <Button
            onClick={runCommit}
            disabled={busy || !preview || totals.willWrite === 0}
          >
            {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Standardise definition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

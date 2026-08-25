/**
 * ADR-315 — "Make this one": collapse several definition variants of the same
 * KPI into a single canonical definition.
 *
 * The admin picks (or edits) the canonical description / formula / scoring logic
 * / target, previews exactly which employee rows change per variant, and then
 * commits. Weightage is never written — it is a per-employee number and is not
 * part of the variant key (POLICY §CONSOLE-VARIANT-NORMALISE).
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Layers, Loader2 } from 'lucide-react';
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
  buildNormalisePlan, definitionOf, pickCanonicalVariant, aggregateNormalise,
  type CanonicalDefinition,
} from './variantNormalise';
import { GROUP_ACTION_CONFIRM_WORD } from '@/lib/review/groupPreviewSummary';

interface Props {
  args: KpiDetailArgs | null;
  variants: BuConsoleKpiVariant[];
  kpiLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VariantNormaliseDialog({ args, variants, kpiLabel, open, onOpenChange }: Props) {
  const [canonicalKey, setCanonicalKey] = useState<string>('');
  const [def, setDef] = useState<CanonicalDefinition>({
    description: '', formula: '', scoring_logic: '', target_value: '',
  });
  const [allowLocked, setAllowLocked] = useState(false);
  const [resetOverrides, setResetOverrides] = useState(false);
  const [spanMode, setSpanMode] = useState<EditSpanMode>('this');
  const [spanCount, setSpanCount] = useState(3);
  const [confirmText, setConfirmText] = useState('');
  const [preview, setPreview] = useState<VariantNormaliseResult | null>(null);

  const previewMut = useVariantNormalisePreview();
  const commitMut = useVariantNormaliseCommit();

  // Reset to the best default whenever the dialog opens on a new KPI.
  useEffect(() => {
    if (!open) return;
    const best = pickCanonicalVariant(variants);
    setCanonicalKey(best?.variant_key ?? '');
    setDef(best ? definitionOf(best) : { description: '', formula: '', scoring_logic: '', target_value: '' });
    setPreview(null);
    setConfirmText('');
    setAllowLocked(false);
    setResetOverrides(false);
    setSpanMode('this');
  }, [open, args?.titleKey, args?.kpiName]);

  const spanModes = useMemo(
    () => (args ? spanModesAvailable(toTarget(args.period, args.year)) : (['this'] as EditSpanMode[])),
    [args?.period, args?.year],
  );
  const targets = useMemo(
    () => (args ? resolveEditSpan(toTarget(args.period, args.year), spanMode, spanCount) : []),
    [args?.period, args?.year, spanMode, spanCount],
  );

  const plan = useMemo(() => buildNormalisePlan(variants, canonicalKey, def), [variants, canonicalKey, def]);
  const totals = useMemo(() => aggregateNormalise(preview?.entries ?? []), [preview]);
  const confirmed = confirmText.trim().toUpperCase() === GROUP_ACTION_CONFIRM_WORD;
  const busy = previewMut.isPending || commitMut.isPending;

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
    setPreview(null);
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1200px] min-w-0 flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="min-w-0 break-words">Make this one — {kpiLabel}</span>
          </DialogTitle>
          <DialogDescription className="break-words">
            {variants.length} definition variants exist because description, formula, scoring logic or
            target differ. Pick one canonical definition and every mapped row is aligned to it.
            Weightage is never changed.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {/* Variant picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Canonical definition</Label>
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
                        <Badge variant="outline">target {d.target_value || '—'}{v.uom ? ` ${v.uom}` : ''}</Badge>
                        {selected && <Badge variant="secondary">Canonical</Badge>}
                      </span>
                      <span className="mt-1 block break-words text-muted-foreground">
                        Description: {d.description || '—'}
                      </span>
                      <span className="block break-words text-muted-foreground">
                        Formula: {d.formula || '—'}
                      </span>
                      <span className="block break-words text-muted-foreground">
                        Scoring: {d.scoring_logic || '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Editable canonical fields */}
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={3} value={def.description}
                onChange={(e) => { setDef({ ...def, description: e.target.value }); setPreview(null); }}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Formula</Label>
              <Textarea
                rows={3} value={def.formula}
                onChange={(e) => { setDef({ ...def, formula: e.target.value }); setPreview(null); }}
              />
            </div>
            <div className="min-w-0 space-y-1 md:col-span-2">
              <Label className="text-xs">Scoring logic</Label>
              <Textarea
                rows={3} value={def.scoring_logic}
                onChange={(e) => { setDef({ ...def, scoring_logic: e.target.value }); setPreview(null); }}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Target</Label>
              <Input
                inputMode="decimal" value={def.target_value}
                onChange={(e) => { setDef({ ...def, target_value: e.target.value }); setPreview(null); }}
              />
            </div>
            <p className="self-end text-[11px] text-muted-foreground md:col-span-1">
              Description and formula are often swapped on legacy rows — fix them here once and every
              mapped employee gets the corrected text.
            </p>
          </div>

          {/* Plan summary */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-xs">
            <Badge variant="secondary">
              {plan.steps.length} variant{plan.steps.length === 1 ? '' : 's'} to rewrite
            </Badge>
            <Badge variant="outline">{plan.employeesAffected} employee rows in scope</Badge>
            <Badge variant="outline">
              {plan.alreadyAligned.length} already aligned
            </Badge>
            <Badge variant={plan.steps.length ? 'secondary' : 'outline'}>
              {plan.steps.length ? '1 variant after apply' : 'Nothing to change'}
            </Badge>
          </div>

          {/* Span control (ADR-291 parity) */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-medium">Apply to</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={spanMode}
                onValueChange={(v) => { setSpanMode(v as EditSpanMode); setPreview(null); }}
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
                  onChange={(e) => { setSpanCount(Number(e.target.value) || 2); setPreview(null); }}
                />
              )}
              <Badge variant="secondary">{describeSpan(targets)}</Badge>
            </div>
            {spanModes.length === 1 && (
              <p className="text-[11px] text-muted-foreground">
                The loaded month is in the past, so only that month can be normalised.
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
                onCheckedChange={(v) => { setAllowLocked(v); setPreview(null); }}
              />
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Label htmlFor="vn-reset" className="text-xs font-normal">
                Also align rows with individual overrides
              </Label>
              <Switch
                id="vn-reset" checked={resetOverrides}
                onCheckedChange={(v) => { setResetOverrides(v); setPreview(null); }}
              />
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">{totals.willWrite} rows will be written</Badge>
                <Badge variant="outline">{totals.willSkip} skipped</Badge>
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
                        <TableCell className="font-mono text-[11px]">{e.variantKey.slice(0, 8)}</TableCell>
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

              {totals.willWrite > 0 && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <Alert variant="destructive" className="border-0 bg-transparent p-0">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="break-words">
                      This rewrites the definition for {totals.willWrite} employee row
                      {totals.willWrite === 1 ? '' : 's'}. Type{' '}
                      <strong>{GROUP_ACTION_CONFIRM_WORD}</strong> to confirm.
                    </AlertDescription>
                  </Alert>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={GROUP_ACTION_CONFIRM_WORD}
                    className="max-w-xs"
                  />
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
            disabled={busy || !preview || totals.willWrite === 0 || !confirmed}
          >
            {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Make this one
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

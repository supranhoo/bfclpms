/**
 * ADR-274 — Tune one employee's copy of a shared KPI.
 *
 * Only weightage, target, unit and the numeric scoring ladder can be tuned per
 * employee; the KPI text stays group-owned so the title never diverges. Fields
 * saved here are recorded as overrides and are protected from later group
 * edits unless the admin explicitly resets them.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  useRowOverride, useClearRowOverrides, GROUP_EDIT_FIELD_LABELS, type BuConsoleEmployeeRow,
} from '@/hooks/useBuConsole';
import { KPI_DIRECTION_OPTIONS, directionConflictsWithLadder } from '@/components/admin/kpi-form/kpiFormModel';
import { diffChanges, hasChanges, isMultiMonthFrequency, validateCycleChange } from './groupEditModel';
import { getCycleOptionsForFrequency, deriveCycleOptionFromCycleStart } from '@/lib/frequencyCycleOptions';

/**
 * ADR-274a — per-employee tuning covers the same scoring inputs as the group
 * editor, minus the structural category / KRA move which must stay group-wide.
 */
const ROW_FIELDS = [
  'weightage', 'target_value', 'uom', 'frequency', 'criteria', 'source_of_data',
  'r5', 'r4', 'r3', 'r2', 'r1', 'r0',
  // ADR-275 — the cycle anchor and day counting are per-employee tunable too.
  'frequency_cycle_start', 'day_count_type',
] as const;

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

const DAY_COUNT_OPTIONS = [
  { value: 'working_days', label: 'Working days only' },
  { value: 'all_days', label: 'All calendar days' },
];

interface Props {
  row: BuConsoleEmployeeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RowOverrideDialog({ row, open, onOpenChange }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [allowLocked, setAllowLocked] = useState(false);
  const mut = useRowOverride();
  const clearMut = useClearRowOverrides();

  useEffect(() => {
    if (!open || !row) return;
    const r = row as unknown as Record<string, any>;
    const seed: Record<string, string> = {};
    ROW_FIELDS.forEach((f) => { seed[f] = r[f] != null ? String(r[f]) : ''; });
    setForm(seed);
    setAllowLocked(false);
  }, [open, row]);

  const original = useMemo(() => {
    const r = (row ?? {}) as unknown as Record<string, any>;
    return Object.fromEntries(ROW_FIELDS.map((f) => [f, r[f] ?? null]));
  }, [row]);

  const changes = diffChanges(original, form, ROW_FIELDS as unknown as string[]);
  const ladderConflict = directionConflictsWithLadder(form.criteria, form.r5, form.r1);
  const cycleError = validateCycleChange(changes);
  const overrides = (row?.override_fields ?? []) as string[];

  const cycleOptions = useMemo(() => {
    const opts = getCycleOptionsForFrequency(form.frequency) ?? [];
    const current = form.frequency_cycle_start;
    if (current && !opts.some((o) => o.value === current)) {
      const derived = deriveCycleOptionFromCycleStart(form.frequency, current);
      if (derived) return [derived, ...opts];
    }
    return opts;
  }, [form.frequency, form.frequency_cycle_start]);

  const save = () => {
    if (!row || !hasChanges(changes) || cycleError) return;
    mut.mutate(
      { kpiId: (row as any).kpi_id, changes, allowLocked },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tune for {row?.employee_name ?? 'this employee'}</DialogTitle>
          <DialogDescription>
            Changes here apply to this employee only and are protected from future group edits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Weightage" k="weightage" form={form} setForm={setForm} />
          <Field label="Target" k="target_value" form={form} setForm={setForm} />
          <Field label="Unit" k="uom" form={form} setForm={setForm} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={form.frequency || undefined}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  frequency: v,
                  frequency_cycle_start: isMultiMonthFrequency(v)
                    ? (prev.frequency === v ? prev.frequency_cycle_start : getCycleOptionsForFrequency(v)?.[0]?.value ?? '')
                    : '',
                }))
              }
            >
              <SelectTrigger><SelectValue placeholder="Unchanged" /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Direction</Label>
            <Select
              value={form.criteria || undefined}
              onValueChange={(v) => setForm((prev) => ({ ...prev, criteria: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Unchanged" /></SelectTrigger>
              <SelectContent>
                {KPI_DIRECTION_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Field label="Source of data" k="source_of_data" form={form} setForm={setForm} />
        </div>

        {isMultiMonthFrequency(form.frequency) && (
          <div className="space-y-1">
            <Label className="text-xs">Cycle anchor</Label>
            <Select
              value={form.frequency_cycle_start || undefined}
              onValueChange={(v) => setForm((prev) => ({ ...prev, frequency_cycle_start: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Pick the cycle" /></SelectTrigger>
              <SelectContent>
                {cycleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.value} — {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {form.frequency === 'Daily' && (
          <div className="space-y-1">
            <Label className="text-xs">Day counting</Label>
            <Select
              value={form.day_count_type || undefined}
              onValueChange={(v) => setForm((prev) => ({ ...prev, day_count_type: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Unchanged" /></SelectTrigger>
              <SelectContent>
                {DAY_COUNT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Scoring ladder</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const).map((k) => (
              <Field key={k} label={k.toUpperCase()} k={k} form={form} setForm={setForm} />
            ))}
          </div>
          {ladderConflict && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              The ladder runs against the chosen direction. Check the thresholds.
            </p>
          )}
        </div>

        {cycleError && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" /> {cycleError}
          </p>
        )}

        {overrides.length > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-medium">
              Already tuned for this employee — protected from group edits
            </p>
            <div className="flex flex-wrap gap-1">
              {overrides.map((f) => (
                <Badge key={f} variant="secondary">{GROUP_EDIT_FIELD_LABELS[f] ?? f}</Badge>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={clearMut.isPending}
              onClick={() =>
                row && clearMut.mutate({ kpiId: (row as any).kpi_id }, { onSuccess: () => onOpenChange(false) })
              }
            >
              {clearMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Follow the group definition again
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <Label className="text-xs font-medium">Allow even though the review has started</Label>
            <p className="text-[11px] text-muted-foreground">Approved final scores stay immutable.</p>
          </div>
          <Switch checked={allowLocked} onCheckedChange={setAllowLocked} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!hasChanges(changes) || !!cycleError || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, k, form, setForm,
}: {
  label: string; k: string;
  form: Record<string, string>;
  setForm: (f: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={form[k] ?? ''}
        onChange={(e) => setForm((prev) => ({ ...prev, [k]: e.target.value }))}
      />
    </div>
  );
}

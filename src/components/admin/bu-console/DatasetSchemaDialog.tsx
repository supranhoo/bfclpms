/**
 * ADR-309 — Column designer for a KPI's data table.
 *
 * Admins (and Performance Console editors) define what columns the KPI's table
 * carries and how those rows roll up into the headline number. Nothing about a
 * specific KPI is hardcoded — the shape is master data
 * (POLICY §KPI-LEDGER-CONFIGURABLE-SHAPE).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useUpsertLedgerDef } from '@/hooks/useOrgKpiDataset';
import {
  DATA_TYPE_LABELS, GRANULARITY_LABELS, ROLLUP_LABELS, TOTAL_RULE_LABELS,
  defaultMonthlyColumns, defaultTotalRule, granularityForFrequency, isNumericColumn,
  type LedgerBundle, type LedgerColumn, type LedgerDataType, type LedgerGranularity,
  type LedgerRollupRule, type LedgerTotalRule,
} from '@/lib/review/kpiLedgerModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  kraName: string;
  kpiName: string;
  kpiTitle?: string | null;
  /** KPI's own frequency — seeds the default row rhythm for a brand-new table. */
  frequency?: string | null;
  bundle: LedgerBundle | null;
}

const NONE = '__none__';

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
}

/** Never leave a column key blank — Radix Select rejects empty option values. */
function nextColumnKey(existing: LedgerColumn[]): string {
  const taken = new Set(existing.map((c) => c.column_key));
  let n = existing.length + 1;
  while (taken.has(`column_${n}`)) n += 1;
  return `column_${n}`;
}

export function DatasetSchemaDialog({
  open, onOpenChange, categoryId, kraName, kpiName, kpiTitle, frequency, bundle,
}: Props) {
  const mut = useUpsertLedgerDef();
  const [title, setTitle] = useState('Data table');
  const [granularity, setGranularity] = useState<LedgerGranularity>('monthly');
  const [rollupRule, setRollupRule] = useState<LedgerRollupRule>('sum_ratio');
  const [valueKey, setValueKey] = useState<string>(NONE);
  const [targetKey, setTargetKey] = useState<string>(NONE);
  const [weightKey, setWeightKey] = useState<string>(NONE);
  const [allowOverride, setAllowOverride] = useState(true);
  const [columns, setColumns] = useState<LedgerColumn[]>([]);

  useEffect(() => {
    if (!open) return;
    if (bundle) {
      setTitle(bundle.def.title ?? 'Data table');
      setGranularity(bundle.def.granularity);
      setRollupRule(bundle.def.rollup_rule);
      setValueKey(bundle.def.value_column_key ?? NONE);
      setTargetKey(bundle.def.target_column_key ?? NONE);
      setWeightKey(bundle.def.weight_column_key ?? NONE);
      setAllowOverride(bundle.def.allow_provider_override);
      setColumns(bundle.columns.map((c) => ({ ...c })));
    } else {
      setTitle(kpiTitle ? `${kpiTitle} — data table` : 'Data table');
      setGranularity(granularityForFrequency(frequency));
      setRollupRule('sum_ratio');
      const cols = defaultMonthlyColumns();
      setColumns(cols);
      setValueKey('achieved');
      setTargetKey('target');
      setWeightKey(NONE);
      setAllowOverride(true);
    }
  }, [open, bundle, kpiTitle, frequency]);

  const numericKeys = useMemo(
    () => columns
      .filter((c) => isNumericColumn(c) && !!c.column_key)
      .map((c) => ({ key: c.column_key, label: c.label || c.column_key })),
    [columns],
  );


  const errors = useMemo(() => {
    const list: string[] = [];
    if (!title.trim()) list.push('Give the data table a title.');
    if (columns.length === 0) list.push('Add at least one column.');
    const keys = new Set<string>();
    for (const c of columns) {
      if (!c.column_key) list.push(`"${c.label || 'Untitled'}" needs a key.`);
      else if (keys.has(c.column_key)) list.push(`Duplicate column key "${c.column_key}".`);
      keys.add(c.column_key);
      if (!c.label.trim()) list.push('Every column needs a label.');
      if (c.data_type === 'formula' && !c.formula?.trim()) {
        list.push(`"${c.label}" is derived but has no formula.`);
      }
    }
    if (rollupRule !== 'none' && valueKey === NONE) list.push('Choose which column holds the achieved value.');
    if (rollupRule === 'sum_ratio' && targetKey === NONE) list.push('Choose the target column for the ratio roll-up.');
    if (rollupRule === 'weighted' && weightKey === NONE) list.push('Choose the weight column for the weighted roll-up.');
    return list;
  }, [title, columns, rollupRule, valueKey, targetKey, weightKey]);

  const updateColumn = (index: number, patch: Partial<LedgerColumn>) =>
    setColumns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const addColumn = () =>
    setColumns((prev) => [
      ...prev,
      {
        column_key: nextColumnKey(prev), label: '', data_type: 'number', is_required: false, is_key: false,
        editable_by: 'provider', sort_order: (prev.length + 1) * 10, total_rule: null,
      },
    ]);

  const removeColumn = (index: number) =>
    setColumns((prev) => prev.filter((_, i) => i !== index));

  const save = () => {
    if (errors.length) return;
    mut.mutate(
      {
        categoryId, kraName, kpiName,
        title: title.trim(),
        granularity,
        rollupRule,
        valueColumnKey: valueKey === NONE ? null : valueKey,
        targetColumnKey: targetKey === NONE ? null : targetKey,
        weightColumnKey: weightKey === NONE ? null : weightKey,
        allowProviderOverride: allowOverride,
        columns: columns.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 })),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold">Design the data table</DialogTitle>
          <DialogDescription className="text-xs">
            Choose the columns this KPI's table carries and how its rows produce the headline number.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ledger-title">Title</Label>
              <Input id="ledger-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Granularity</Label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as LedgerGranularity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GRANULARITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label>Roll-up rule</Label>
              <Select value={rollupRule} onValueChange={(v) => setRollupRule(v as LedgerRollupRule)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLLUP_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <KeyPicker label="Achieved column" value={valueKey} onChange={setValueKey} options={numericKeys} />
            <KeyPicker label="Target column" value={targetKey} onChange={setTargetKey} options={numericKeys} />
            <KeyPicker label="Weight column" value={weightKey} onChange={setWeightKey} options={numericKeys} />
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Switch id="ledger-override" checked={allowOverride} onCheckedChange={setAllowOverride} />
              <Label htmlFor="ledger-override" className="text-sm font-normal">
                Allow the provider to override the rolled-up number (a reason is always recorded)
              </Label>
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Columns</h3>
              <Button size="sm" variant="outline" onClick={addColumn}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add column
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[190px]">Label</TableHead>
                    <TableHead className="w-[150px]">Key</TableHead>
                    <TableHead className="w-[150px]">Type</TableHead>
                    <TableHead className="w-[110px]">Unit</TableHead>
                    <TableHead className="w-[200px]">Formula</TableHead>
                    <TableHead className="w-[170px]">Bottom line</TableHead>
                    <TableHead className="w-[90px] text-center">Required</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((col, i) => (
                    <TableRow key={`${col.column_key}-${i}`}>
                      <TableCell>
                        <Input
                          value={col.label}
                          placeholder="Achieved"
                          onChange={(e) => {
                            const label = e.target.value;
                            const autoKey = !col.column_key
                              || /^column_\d+$/.test(col.column_key)
                              || col.column_key === slugify(col.label);
                            const nextKey = slugify(label);
                            updateColumn(i, autoKey && nextKey ? { label, column_key: nextKey } : { label });
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          value={col.column_key}
                          className="font-mono text-xs"
                          onChange={(e) => updateColumn(i, { column_key: slugify(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={col.data_type}
                          onValueChange={(v) => updateColumn(i, {
                            data_type: v as LedgerDataType,
                            editable_by: v === 'formula' ? 'system' : col.editable_by,
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(DATA_TYPE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={col.unit ?? ''}
                          placeholder="MT"
                          onChange={(e) => updateColumn(i, { unit: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={col.formula ?? ''}
                          disabled={col.data_type !== 'formula'}
                          placeholder="achieved / target * 100"
                          className="font-mono text-xs"
                          onChange={(e) => updateColumn(i, { formula: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={col.is_required}
                          onCheckedChange={(v) => updateColumn(i, { is_required: !!v })}
                          aria-label={`${col.label || 'Column'} required`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeColumn(i)}
                          aria-label={`Remove ${col.label || 'column'}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {columns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        No columns yet — add the ones this KPI needs.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {errors.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={errors.length > 0 || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save data table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyPicker({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Not used" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not used</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

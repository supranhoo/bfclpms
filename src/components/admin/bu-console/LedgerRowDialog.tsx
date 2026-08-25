/**
 * ADR-309 — Add or edit one ledger row.
 *
 * The form is generated from the KPI's column design, so no KPI-specific field
 * appears in code. Derived columns are recomputed live and never editable.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useBusinessUnits, useDepartments, useDivisions } from '@/hooks/useOrganization';
import { useSaveLedgerRow } from '@/hooks/useOrgKpiDataset';
import {
  CALENDAR_MONTH_ORDER, formatCell, withDerivedValues,
  type LedgerBundle, type LedgerRow,
} from '@/lib/review/kpiLedgerModel';
import { buildCycleScopeLabel } from '@/lib/frequencyUtils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: LedgerBundle;
  /** Console header month — a default only; the row owns its period (ADR-318). */
  period: string;
  year: number;
  row: LedgerRow | null;
  /** KPI frequency, used to explain the review anchor for multi-month cycles. */
  frequency?: string | null;
}

const NONE = '__none__';

export function LedgerRowDialog({ open, onOpenChange, bundle, period, year, row, frequency }: Props) {
  const save = useSaveLedgerRow();
  const { data: divisions = [] } = useDivisions();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: departments = [] } = useDepartments();

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [divisionId, setDivisionId] = useState(NONE);
  const [buId, setBuId] = useState(NONE);
  const [deptId, setDeptId] = useState(NONE);
  const [scopeLabel, setScopeLabel] = useState('');
  const [wholeOrg, setWholeOrg] = useState(false);
  const [reason, setReason] = useState('');
  const [rowPeriod, setRowPeriod] = useState(period);
  const [rowYear, setRowYear] = useState(year);

  useEffect(() => {
    if (!open) return;
    setValues(row?.values ?? {});
    setDivisionId(row?.division_id ?? NONE);
    setBuId(row?.business_unit_id ?? NONE);
    setDeptId(row?.department_id ?? NONE);
    setScopeLabel(row?.scope_label ?? '');
    setWholeOrg(String((row?.impact_scope as any)?.whole_org ?? 'false') === 'true');
    setReason('');
    // ADR-318: editing keeps the row where it is; only new rows take the header.
    setRowPeriod(row?.review_period ?? period);
    setRowYear(row?.review_year ?? year);
  }, [open, row, period, year]);

  const yearOptions = useMemo(() => {
    const base = year;
    const set = new Set<number>([base - 2, base - 1, base, base + 1, rowYear]);
    return [...set].sort((a, b) => a - b);
  }, [year, rowYear]);

  const cycle = useMemo(
    () => buildCycleScopeLabel(frequency ?? null, rowPeriod, rowYear),
    [frequency, rowPeriod, rowYear],
  );
  const isAnchorMonth = !cycle.isMultiMonth || cycle.anchorMonth === rowPeriod;

  const derived = useMemo(
    () => withDerivedValues(bundle.columns, values),
    [bundle.columns, values],
  );

  const missing = useMemo(
    () => bundle.columns
      .filter((c) => c.is_required && c.data_type !== 'formula')
      .filter((c) => {
        const v = derived[c.column_key];
        return v === null || v === undefined || v === '';
      })
      .map((c) => c.label),
    [bundle.columns, derived],
  );

  const submit = () => {
    if (missing.length) return;
    save.mutate(
      {
        id: row?.id ?? null,
        datasetId: bundle.def.id,
        reviewPeriod: rowPeriod,
        reviewYear: rowYear,
        divisionId: divisionId === NONE ? null : divisionId,
        businessUnitId: buId === NONE ? null : buId,
        departmentId: deptId === NONE ? null : deptId,
        scopeLabel: scopeLabel.trim() || null,
        impactScope: wholeOrg ? { whole_org: 'true' } : {},
        values: derived,
        reason: reason.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[820px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold">
            {row ? 'Edit data row' : 'Add data row'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {bundle.def.title} · {rowPeriod} {rowYear}
            {row ? ` · revision ${row.revision}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-6 py-4">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ledger-row-month">Month this data belongs to</Label>
              <Select value={rowPeriod} onValueChange={setRowPeriod}>
                <SelectTrigger id="ledger-row-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CALENDAR_MONTH_ORDER.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ledger-row-year">Year</Label>
              <Select value={String(rowYear)} onValueChange={(v) => setRowYear(Number(v))}>
                <SelectTrigger id="ledger-row-year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cycle.isMultiMonth && (
              <p
                className={`sm:col-span-2 rounded-md border p-3 text-xs ${
                  isAnchorMonth
                    ? 'border-border bg-muted/40 text-muted-foreground'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                This KPI is reviewed once per cycle. The cycle covers{' '}
                <strong>{cycle.cycleMonths.join(', ')}</strong> and is anchored on{' '}
                <strong>{cycle.anchorMonth} {cycle.anchorYear}</strong>.
                {!isAnchorMonth && ' You are entering a non-anchor month — normally left blank.'}
              </p>
            )}
            <ScopeSelect label="Division" value={divisionId} onChange={setDivisionId} options={divisions as any} />
            <ScopeSelect label="Business unit" value={buId} onChange={setBuId} options={businessUnits as any} />
            <ScopeSelect label="Department" value={deptId} onChange={setDeptId} options={departments as any} />
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ledger-scope-label">Row label</Label>
              <Input
                id="ledger-scope-label"
                value={scopeLabel}
                placeholder="e.g. CLU"
                onChange={(e) => setScopeLabel(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="ledger-whole-org"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={wholeOrg}
                onChange={(e) => setWholeOrg(e.target.checked)}
              />
              <Label htmlFor="ledger-whole-org" className="text-sm font-normal">
                This row affects the whole organisation (everyone can see it)
              </Label>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            {bundle.columns.map((col) => {
              const isDerived = col.data_type === 'formula';
              return (
                <div key={col.column_key} className="min-w-0 space-y-1.5">
                  <Label htmlFor={`ledger-${col.column_key}`}>
                    {col.label}
                    {col.is_required && !isDerived && <span className="ml-1 text-destructive">*</span>}
                    {col.unit && <span className="ml-1 text-xs text-muted-foreground">({col.unit})</span>}
                  </Label>
                  {isDerived ? (
                    <p
                      id={`ledger-${col.column_key}`}
                      className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
                    >
                      {formatCell(col, derived[col.column_key])}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        derived
                      </span>
                    </p>
                  ) : (
                    <Input
                      id={`ledger-${col.column_key}`}
                      type={col.data_type === 'date' ? 'date' : col.data_type === 'text' ? 'text' : 'number'}
                      step="any"
                      value={(values[col.column_key] as string | number | undefined) ?? ''}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [col.column_key]: e.target.value }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="ledger-reason">Reason for this change</Label>
            <Textarea
              id="ledger-reason"
              rows={2}
              value={reason}
              placeholder="Recorded in the change trail"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {missing.length > 0 && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              Still needed: {missing.join(', ')}
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={missing.length > 0 || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Not scoped" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not scoped</SelectItem>
          {(options ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

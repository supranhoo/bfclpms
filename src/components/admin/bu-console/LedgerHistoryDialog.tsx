/**
 * ADR-318 — "Enter history": one fiscal year of ledger rows in a single grid.
 *
 * A provider filling twelve months should not open twelve dialogs, and should
 * never have to move the console header to correct a past month. The grid is
 * generated from the KPI's own column design, accepts a paste straight from a
 * spreadsheet, and is preview-first: nothing is written until the officer has
 * seen how many lines are new, updated or untouched.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useBulkImportLedger } from '@/hooks/useOrgKpiDataset';
import { useToast } from '@/hooks/use-toast';
import { buildCycleScopeLabel } from '@/lib/frequencyUtils';
import {
  diffHistoryGrid, fiscalMonthSlots, formatCell, shortPeriodLabel,
  type LedgerBundle, type LedgerRow,
} from '@/lib/review/kpiLedgerModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: LedgerBundle;
  /** Existing rows for the whole fiscal cycle (already fiscal-filtered). */
  existingRows: LedgerRow[];
  fiscalStartYear: number;
  frequency?: string | null;
}

type Grid = Record<string, Record<string, unknown>>;

export function LedgerHistoryDialog({
  open, onOpenChange, bundle, existingRows, fiscalStartYear, frequency,
}: Props) {
  const bulk = useBulkImportLedger();
  const { toast } = useToast();

  const editable = useMemo(
    () => bundle.columns.filter((c) => c.data_type !== 'formula'),
    [bundle.columns],
  );
  const slots = useMemo(() => fiscalMonthSlots(fiscalStartYear), [fiscalStartYear]);

  const [grid, setGrid] = useState<Grid>({});
  const [reason, setReason] = useState('');
  const [scopeLabel, setScopeLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    const next: Grid = {};
    for (const { period, year } of slots) {
      const key = `${period}|${year}`;
      const existing = existingRows.find(
        (r) => r.review_period === period && r.review_year === year,
      );
      next[key] = Object.fromEntries(
        editable.map((c) => [c.column_key, existing?.values?.[c.column_key] ?? '']),
      );
    }
    setGrid(next);
    setReason('');
    setScopeLabel(existingRows[0]?.scope_label ?? '');
  }, [open, slots, existingRows, editable]);

  const lines = useMemo(
    () => diffHistoryGrid(bundle.columns, existingRows, grid, fiscalStartYear),
    [bundle.columns, existingRows, grid, fiscalStartYear],
  );
  const writable = lines.filter((l) => l.kind === 'new' || l.kind === 'updated');
  const counts = {
    added: lines.filter((l) => l.kind === 'new').length,
    updated: lines.filter((l) => l.kind === 'updated').length,
    unchanged: lines.filter((l) => l.kind === 'unchanged').length,
  };

  const anchorMonths = useMemo(() => {
    const set = new Set<string>();
    for (const { period, year } of slots) {
      const c = buildCycleScopeLabel(frequency ?? null, period, year);
      set.add(`${c.anchorMonth}|${c.anchorYear}`);
    }
    return set;
  }, [slots, frequency]);
  const isMultiMonth = buildCycleScopeLabel(
    frequency ?? null, slots[0].period, slots[0].year,
  ).isMultiMonth;

  const setCell = (key: string, columnKey: string, value: string) =>
    setGrid((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [columnKey]: value } }));

  /** Paste a spreadsheet block starting at the focused cell. */
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
  ) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n').filter((l) => l.length).map((l) => l.split('\t'));
    setGrid((prev) => {
      const next = { ...prev };
      matrix.forEach((cells, r) => {
        const slot = slots[rowIdx + r];
        if (!slot) return;
        const key = `${slot.period}|${slot.year}`;
        const row = { ...(next[key] ?? {}) };
        cells.forEach((cell, c) => {
          const col = editable[colIdx + c];
          if (col) row[col.column_key] = cell.trim();
        });
        next[key] = row;
      });
      return next;
    });
  };

  const apply = async () => {
    if (!writable.length) return;
    const payload = writable.map((l) => ({
      reviewPeriod: l.period,
      reviewYear: l.year,
      scopeLabel: scopeLabel.trim() || null,
      values: l.values,
      reason: reason.trim() || `History entry ${fiscalStartYear}–${fiscalStartYear + 1}`,
    }));
    const preview = await bulk.mutateAsync({ datasetId: bundle.def.id, rows: payload, dryRun: true });
    if (preview.errors.length) {
      toast({
        title: 'History not written',
        description: `${preview.errors.length} line(s) were rejected: ${preview.errors[0].error}`,
        variant: 'destructive',
      });
      return;
    }
    await bulk.mutateAsync({ datasetId: bundle.def.id, rows: payload, dryRun: false });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold">
            Enter history · fiscal {fiscalStartYear}–{fiscalStartYear + 1}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {bundle.def.title} — one line per month, July to June. Paste straight from your sheet;
            blank months stay blank.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 space-y-4 overflow-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="history-scope">Row label (applies to every month)</Label>
              <Input
                id="history-scope"
                value={scopeLabel}
                placeholder="e.g. CPP"
                onChange={(e) => setScopeLabel(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="history-reason">Reason for this change</Label>
              <Textarea
                id="history-reason"
                rows={2}
                value={reason}
                placeholder="Recorded once for the whole run"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Month</TableHead>
                  {bundle.columns.map((c) => (
                    <TableHead key={c.column_key} className="text-right">{c.label}</TableHead>
                  ))}
                  <TableHead className="w-[110px] text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map(({ period, year }, rowIdx) => {
                  const key = `${period}|${year}`;
                  const line = lines[rowIdx];
                  const isAnchor = !isMultiMonth || anchorMonths.has(key);
                  return (
                    <TableRow key={key} className={isAnchor ? undefined : 'bg-muted/30'}>
                      <TableCell className="whitespace-nowrap text-sm font-medium">
                        {shortPeriodLabel(period, year)}
                      </TableCell>
                      {bundle.columns.map((col, colIdx) => {
                        if (col.data_type === 'formula') {
                          return (
                            <TableCell key={col.column_key} className="text-right text-xs text-muted-foreground tabular-nums">
                              {formatCell(col, line?.values?.[col.column_key])}
                            </TableCell>
                          );
                        }
                        const editIdx = editable.findIndex((c) => c.column_key === col.column_key);
                        return (
                          <TableCell key={col.column_key} className="p-1">
                            <Input
                              className="h-8 text-right text-sm"
                              type={col.data_type === 'date' ? 'date' : col.data_type === 'text' ? 'text' : 'number'}
                              step="any"
                              aria-label={`${col.label} for ${period} ${year}`}
                              value={(grid[key]?.[col.column_key] as string | number | undefined) ?? ''}
                              onChange={(e) => setCell(key, col.column_key, e.target.value)}
                              onPaste={(e) => handlePaste(e, rowIdx, editIdx < 0 ? colIdx : editIdx)}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        {line?.kind === 'new' && <Badge className="text-[10px]">New</Badge>}
                        {line?.kind === 'updated' && (
                          <Badge variant="secondary" className="text-[10px]">Updated</Badge>
                        )}
                        {line?.kind === 'unchanged' && (
                          <span className="text-[10px] text-muted-foreground">Unchanged</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {isMultiMonth && (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Shaded months are not review anchors for this cycle — on a bi-monthly KPI the anchor
              month carries the target and achieved figures, and the month before it normally stays
              blank.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 border-t bg-muted/20 px-6 py-3">
          <p className="mr-auto text-xs text-muted-foreground">
            {counts.added} new · {counts.updated} updated · {counts.unchanged} unchanged
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void apply()} disabled={!writable.length || bulk.isPending}>
            {bulk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save {writable.length} month(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

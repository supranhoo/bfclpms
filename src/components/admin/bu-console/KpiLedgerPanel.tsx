/**
 * ADR-309 — "Data behind this KPI" panel.
 *
 * One surface with three faces, decided entirely by what the server lets the
 * signed-in person see and do:
 *  - provider / console editor: enter, import and correct rows;
 *  - approver: read the table that produced the number they are approving;
 *  - Audit / HR PMS / Management: the full table with exception flags and a
 *    single validation for the whole period.
 *
 * Rows are paged server-side (POLICY §RPT-SERVER-PAGINATION); the client never
 * pulls a full dataset. The roll-up shown always carries its working.
 */
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle, Download, Loader2, Pencil, Plus, ShieldCheck, Table2, Trash2, Upload,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import {
  useBulkImportLedger, useDeleteLedgerRow, useLedgerBundle, useLedgerRollup,
  useLedgerRows, useLedgerValidation, useValidateLedgerPeriod,
} from '@/hooks/useOrgKpiDataset';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  computeTotalsRow, detectExceptions, effectiveTotalRule, formatCell, isValidationLive,
  scopeLabelOf, sortRowsFiscal,
  type LedgerRow,
} from '@/lib/review/kpiLedgerModel';
import { fiscalStartYearOfKpi, isFiscalTuple } from '@/lib/fiscalWindow';
import { DatasetSchemaDialog } from './DatasetSchemaDialog';
import { LedgerRowDialog } from './LedgerRowDialog';
import { ExceptionKpiPanel } from './ExceptionKpiPanel';
import type { ExceptionConfig } from '@/lib/review/exceptionKpiModel';

interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
  kpiTitle?: string | null;
  /** KPI's own frequency — seeds the row rhythm when the table is first designed. */
  frequency?: string | null;
  period: string;
  year: number;
}

const PAGE_SIZE = 100;
/** A fiscal cycle is 12 months, so one page always covers it. */
const FISCAL_PAGE_SIZE = 500;

/** What slice of history the table is showing (ADR-316). */
type LedgerScope = 'period' | 'year' | 'fiscal';

export function KpiLedgerPanel({ categoryId, kraName, kpiName, kpiTitle, frequency, period, year }: Props) {
  const { hasRole, isAdmin } = useAuth();
  const { canWrite } = useBuConsoleCapability();
  const { toast } = useToast();

  const { data: bundle, isLoading } = useLedgerBundle({ categoryId, kraName, kpiName });
  const datasetId = bundle?.def.id;

  const [page, setPage] = useState(0);
  const [scope, setScope] = useState<LedgerScope>('period');
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [rowDialog, setRowDialog] = useState<{ open: boolean; row: LedgerRow | null }>({ open: false, row: null });
  const [deleteRow, setDeleteRow] = useState<LedgerRow | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateNote, setValidateNote] = useState('');

  const fiscalStart = fiscalStartYearOfKpi(period, year) ?? year;
  const isFiscal = scope === 'fiscal';

  const rowsQuery = useLedgerRows({
    datasetId,
    reviewYear: isFiscal ? fiscalStart : year,
    reviewPeriod: scope === 'period' ? period : null,
    page: isFiscal ? 0 : page,
    pageSize: isFiscal ? FISCAL_PAGE_SIZE : PAGE_SIZE,
  });
  // A Jul–Jun cycle spans two calendar years, so the second half is fetched alongside.
  const fiscalTailQuery = useLedgerRows({
    datasetId,
    reviewYear: fiscalStart + 1,
    reviewPeriod: null,
    page: 0,
    pageSize: FISCAL_PAGE_SIZE,
    enabled: isFiscal,
  });
  const rollup = useLedgerRollup({ datasetId, reviewYear: year, reviewPeriod: scope === 'period' ? period : null });
  const validation = useLedgerValidation({ datasetId, reviewYear: year, reviewPeriod: period });
  const del = useDeleteLedgerRow();
  const validate = useValidateLedgerPeriod();
  const bulk = useBulkImportLedger();

  const rows = useMemo(() => {
    const base = rowsQuery.data?.rows ?? [];
    if (!isFiscal) return base;
    const merged = [...base, ...(fiscalTailQuery.data?.rows ?? [])]
      .filter((r) => isFiscalTuple(r.review_period, r.review_year, fiscalStart));
    return sortRowsFiscal(merged);
  }, [rowsQuery.data, fiscalTailQuery.data, isFiscal, fiscalStart]);
  const total = isFiscal ? rows.length : (rowsQuery.data?.total ?? 0);
  const totalPages = isFiscal ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalsRow = useMemo(
    () => (bundle ? computeTotalsRow(bundle.columns, rows) : {}),
    [bundle, rows],
  );
  const hasTotals = useMemo(
    () => !!bundle && rows.length > 0 && bundle.columns.some((c) => effectiveTotalRule(c) !== 'none'),
    [bundle, rows],
  );

  const exceptions = useMemo(
    () => (bundle ? detectExceptions(bundle.def, bundle.columns, rows) : []),
    [bundle, rows],
  );
  const exceptionsByRow = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of exceptions) {
      map.set(e.rowId, [...(map.get(e.rowId) ?? []), e.message]);
    }
    return map;
  }, [exceptions]);

  const canValidate =
    isAdmin || hasRole('auditor') || hasRole('hr_pms') || hasRole('management');
  const canDesign = isAdmin || canWrite;

  const exportCsv = () => {
    if (!bundle) return;
    const headers = ['review_year', 'review_period', 'scope', ...bundle.columns.map((c) => c.label)];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const cells = [
        String(r.review_year),
        r.review_period,
        scopeLabelOf(r),
        ...bundle.columns.map((c) => {
          const raw = r.values?.[c.column_key];
          const text = raw === null || raw === undefined ? '' : String(raw);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        }),
      ];
      lines.push(cells.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(kpiTitle || kpiName).replace(/[^a-z0-9]+/gi, '_')}_${period}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!bundle) return;
    const text = await file.text();
    const [headerLine, ...dataLines] = text.split(/\r?\n/).filter((l) => l.trim());
    if (!headerLine) return;
    const headers = headerLine.split(',').map((h) => h.trim());
    const byLabel = new Map(bundle.columns.map((c) => [c.label.toLowerCase(), c.column_key]));
    const parsed = dataLines.map((line) => {
      const cells = line.split(',');
      const values: Record<string, unknown> = {};
      let scopeLabel: string | null = null;
      headers.forEach((h, i) => {
        const key = byLabel.get(h.toLowerCase());
        if (key) values[key] = cells[i]?.trim() ?? '';
        else if (h.toLowerCase() === 'scope') scopeLabel = cells[i]?.trim() ?? null;
      });
      return {
        reviewPeriod: period,
        reviewYear: year,
        scopeLabel,
        values,
        reason: `CSV import ${file.name}`,
      };
    });
    if (!parsed.length) return;

    const preview = await bulk.mutateAsync({ datasetId: bundle.def.id, rows: parsed, dryRun: true });
    toast({
      title: 'Import preview',
      description: `${preview.created} new, ${preview.updated} updated, ${preview.errors.length} problem(s). Applying now.`,
    });
    if (preview.errors.length === parsed.length) return;
    await bulk.mutateAsync({ datasetId: bundle.def.id, rows: parsed, dryRun: false });
  };

  if (isLoading) {
    return <Skeleton className="mb-4 h-32 w-full" />;
  }

  if (!bundle) {
    return (
      <section className="mb-4 rounded-lg border border-dashed p-4">
        <div className="flex items-start gap-3">
          <Table2 className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">No data table yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Give this KPI its own table — month by month, scope by scope — so the score always
              has the working behind it.
            </p>
          </div>
          {canDesign && (
            <Button size="sm" variant="outline" onClick={() => setSchemaOpen(true)}>
              Design data table
            </Button>
          )}
        </div>
        <DatasetSchemaDialog
          open={schemaOpen}
          onOpenChange={setSchemaOpen}
          categoryId={categoryId}
          kraName={kraName}
          kpiName={kpiName}
          kpiTitle={kpiTitle}
          frequency={frequency}
          bundle={null}
        />
      </section>
    );
  }

  const live = isValidationLive(validation.data);

  return (
    <section className="mb-4 rounded-lg border">
      <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Table2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold">{bundle.def.title}</h3>
        <Badge variant="outline" className="text-[10px]">{total} row(s)</Badge>
        {live && (
          <Badge className="gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Audit validated
          </Badge>
        )}
        {validation.data?.invalidated_at && (
          <Badge variant="destructive" className="text-[10px]">Validation stale</Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={scope}
            onValueChange={(v) => { setScope(v as LedgerScope); setPage(0); }}
          >
            <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Rows shown">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="period">{period} {year} only</SelectItem>
              <SelectItem value="year">All of {year}</SelectItem>
              <SelectItem value="fiscal">Fiscal year {fiscalStart}–{fiscalStart + 1} (Jul–Jun)</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" aria-hidden /> Export
          </Button>
          {canWrite && (
            <>
              <Button size="sm" variant="ghost" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-1 h-3.5 w-3.5" aria-hidden /> Import
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void importCsv(f);
                    }}
                  />
                </label>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRowDialog({ open: true, row: null })}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add row
              </Button>
            </>
          )}
          {canDesign && (
            <Button size="sm" variant="ghost" onClick={() => setSchemaOpen(true)}>Columns</Button>
          )}
          {canValidate && (
            <Button size="sm" variant={live ? 'ghost' : 'default'} onClick={() => setValidateOpen(true)}>
              <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
              {live ? 'Re-validate' : 'Validate period'}
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-xs">
        <span className="text-muted-foreground">Roll-up</span>
        <span className="font-semibold">
          {rollup.isLoading
            ? '…'
            : rollup.data?.value === null || rollup.data?.value === undefined
              ? '—'
              : Number(rollup.data.value).toFixed(2)}
        </span>
        <span className="text-muted-foreground">{rollup.data?.working ?? ''}</span>
        {exceptions.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {exceptions.length} exception(s) on this page
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Period</TableHead>
              <TableHead className="w-[160px]">Scope</TableHead>
              {bundle.columns.map((c) => (
                <TableHead key={c.column_key} className="text-right">{c.label}</TableHead>
              ))}
              <TableHead className="w-[90px] text-right">Rev</TableHead>
              {canWrite && <TableHead className="w-[90px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={bundle.columns.length + 4} className="py-6 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden />
                </TableCell>
              </TableRow>
            )}
            {!rowsQuery.isLoading && rows.map((r) => {
              const flags = exceptionsByRow.get(r.id) ?? [];
              return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {r.review_period} {r.review_year}
                  </TableCell>
                  <TableCell className="truncate">
                    {scopeLabelOf(r)}
                    {r.source && r.source !== 'entry' && (
                      <Badge variant="secondary" className="ml-1 text-[10px] capitalize">{r.source}</Badge>
                    )}
                    {flags.length > 0 && (
                      <span className="ml-1 inline-flex items-center" title={flags.join(' · ')}>
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                      </span>
                    )}
                  </TableCell>
                  {bundle.columns.map((c) => (
                    <TableCell key={c.column_key} className="text-right tabular-nums">
                      {formatCell(c, r.values?.[c.column_key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-xs text-muted-foreground">{r.revision}</TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit row"
                        onClick={() => setRowDialog({ open: true, row: r })}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove row"
                        onClick={() => setDeleteRow(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!rowsQuery.isLoading && hasTotals && bundle && (
              <TableRow className="border-t-2 bg-muted/40 font-semibold">
                <TableCell className="whitespace-nowrap">Total</TableCell>
                <TableCell className="truncate text-xs text-muted-foreground">
                  {rows.length} row(s)
                </TableCell>
                {bundle.columns.map((c) => (
                  <TableCell key={c.column_key} className="text-right tabular-nums">
                    {effectiveTotalRule(c) === 'none' ? '' : formatCell(c, totalsRow[c.column_key])}
                  </TableCell>
                ))}
                <TableCell />
                {canWrite && <TableCell />}
              </TableRow>
            )}
            {!rowsQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={bundle.columns.length + (canWrite ? 4 : 3)}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No data captured for this period yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs">
          <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <DatasetSchemaDialog
        open={schemaOpen}
        onOpenChange={setSchemaOpen}
        categoryId={categoryId}
        kraName={kraName}
        kpiName={kpiName}
        kpiTitle={kpiTitle}
        frequency={frequency}
        bundle={bundle}
      />

      {rowDialog.open && (
        <LedgerRowDialog
          open={rowDialog.open}
          onOpenChange={(o) => setRowDialog({ open: o, row: o ? rowDialog.row : null })}
          bundle={bundle}
          period={period}
          year={year}
          row={rowDialog.row}
        />
      )}

      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this data row?</AlertDialogTitle>
            <AlertDialogDescription>
              The row leaves the table but stays in the change trail, and any audit validation for
              this period will need to be done again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteRow) del.mutate({ rowId: deleteRow.id, reason: 'Removed from the console' });
                setDeleteRow(null);
              }}
            >
              Remove row
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={validateOpen} onOpenChange={setValidateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validate {period} {year} in one go</AlertDialogTitle>
            <AlertDialogDescription>
              This records a single validation covering every row in this period. If the data
              changes afterwards, the validation is marked stale automatically.
              {exceptions.length > 0 && ` ${exceptions.length} exception(s) are flagged on this page.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={validateNote}
            placeholder="Optional note for the record"
            onChange={(e) => setValidateNote(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                validate.mutate({
                  datasetId: bundle.def.id,
                  reviewYear: year,
                  reviewPeriod: period,
                  verdict: 'validated',
                  note: validateNote.trim() || null,
                });
                setValidateNote('');
                setValidateOpen(false);
              }}
            >
              Validate period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

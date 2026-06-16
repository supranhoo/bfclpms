import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { AnnualReviewCycle, AnnualReviewTemplate } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import {
  downloadUnifiedWorkbook, parseUnifiedWorkbook, applyUnifiedChanges,
  type RowChange,
} from '@/lib/annualReview/unifiedWorkbook';

/**
 * Single-workbook bulk editor (v2.66.36). Replaces the four legacy bulk
 * dialogs on the Annual Review Admin Progress tab. Delta-only — every cell
 * that matches the downloaded baseline is skipped.
 */
export function UnifiedBulkDialog({
  open, onOpenChange, cycle, instances, templates, systemTemplate, onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: AnnualReviewCycle;
  instances: InstanceWithEmployee[];
  templates: AnnualReviewTemplate[];
  systemTemplate: AnnualReviewTemplate | null;
  onDone?: () => void;
}) {
  const [rows, setRows] = useState<RowChange[] | null>(null);
  const [fatal, setFatal] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const instancesById = useMemo(
    () => new Map(instances.map((i) => [i.id, i])),
    [instances],
  );

  const reset = () => { setRows(null); setFatal([]); setProgress(null); };

  const applyRows = (rows ?? []).filter((r) => r.edits.length > 0 && r.errors.length === 0);
  const errorRows = (rows ?? []).filter((r) => r.errors.length > 0);
  const totalEdits = applyRows.reduce((acc, r) => acc + r.edits.length, 0);

  const handleDownload = () => {
    downloadUnifiedWorkbook({ cycle, instances, templates, systemTemplate });
    toast.success(`Workbook downloaded — ${instances.length} row${instances.length === 1 ? '' : 's'}.`);
  };

  const handleParse = async (file: File) => {
    reset();
    try {
      const res = await parseUnifiedWorkbook(file, instances, templates, systemTemplate);
      setRows(res.rows);
      setFatal(res.fatal);
      if (res.fatal.length > 0) toast.error(res.fatal[0]);
      else if (res.rows.length === 0) toast.info('No changes detected vs. the baseline.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleApply = async () => {
    if (!rows) return;
    setApplying(true);
    setProgress({ done: 0, total: applyRows.length });
    try {
      const r = await applyUnifiedChanges(rows, instancesById, (d, t) => setProgress({ done: d, total: t }));
      if (r.failed === 0) toast.success(`Applied ${r.applied} row${r.applied === 1 ? '' : 's'} (${totalEdits} cell change${totalEdits === 1 ? '' : 's'}).`);
      else toast.warning(`Applied ${r.applied}, failed ${r.failed}.`);
      onDone?.();
      if (r.failed === 0) onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Bulk workbook — download · edit · upload</DialogTitle>
          <DialogDescription>
            One workbook covers <strong>templates · workflow · stage weights · system scores · eligibility</strong>.
            The upload applies <strong>only the cells you actually changed</strong> — every other cell is ignored
            (governance-safe). A per-row <em>Reason</em> is required when any cell changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleDownload} className="gap-2">
              <Download className="h-4 w-4" /> Download workbook ({instances.length} rows)
            </Button>
            <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer text-sm">
              <Upload className="h-4 w-4" />
              <span>Upload &amp; preview</span>
              <input
                type="file" accept=".xlsx,.xls" hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (f) handleParse(f);
                }}
              />
            </label>
            {rows && (
              <div className="ml-auto flex items-center gap-2 text-xs">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {applyRows.length} row{applyRows.length === 1 ? '' : 's'} · {totalEdits} change{totalEdits === 1 ? '' : 's'}
                </Badge>
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> {errorRows.length} error{errorRows.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {fatal.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              {fatal.map((m, i) => <div key={i}>{m}</div>)}
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="border rounded-md max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Changes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.instanceId}>
                      <TableCell>
                        <div className="font-medium">{r.employeeName || r.employeeCode}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.employeeCode}</div>
                      </TableCell>
                      <TableCell>
                        {r.errors.length === 0
                          ? <Badge variant="default">Apply</Badge>
                          : <Badge variant="destructive">Error</Badge>}
                      </TableCell>
                      <TableCell className="text-xs space-y-1">
                        {r.edits.map((e, i) => (
                          <div key={i}>
                            <span className="font-medium capitalize">{e.kind.replace('_', ' ')}:</span>{' '}
                            {'label' in e ? e.label : 'to' in e ? `${e.from} → ${e.to}` : ''}
                          </div>
                        ))}
                        {r.errors.map((m, i) => (
                          <div key={`e${i}`} className="text-destructive">{m}</div>
                        ))}
                        {r.edits.length > 0 && (
                          <div className="text-muted-foreground">Reason: {r.reason || <em>missing</em>}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {progress && (
            <p className="text-xs text-muted-foreground">Applying… {progress.done} / {progress.total}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Close</Button>
          <Button
            onClick={handleApply}
            disabled={applying || !rows || applyRows.length === 0}
            className="gap-2"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            Apply {applyRows.length} row{applyRows.length === 1 ? '' : 's'} ({totalEdits} change{totalEdits === 1 ? '' : 's'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
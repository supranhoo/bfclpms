import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Upload, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  buildCycleBulkPlan, downloadBulkTemplate, parseAndDryRun, commitDryRun,
  type CycleBulkPlan, type DryRunReport,
} from '@/services/annualReview/cycleBulkDataUpload';
import type { AnnualReviewCycle } from '@/types/annualReview';

/**
 * One-sheet Bulk Data Upload spanning every form in a cycle.
 * Shared columns (LTI, 5S, Absent Days, etc.) collapse to a single column;
 * the resolver maps each row back to the employee's effective template.
 */
export function CycleBulkDataUploadDialog({
  open, onOpenChange, cycle, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycle: AnnualReviewCycle | null;
  onDone?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: plan, isLoading, refetch } = useQuery<CycleBulkPlan>({
    queryKey: ['annual-review', 'bulk-data-plan', cycle?.id],
    queryFn: () => buildCycleBulkPlan(cycle!.id),
    enabled: !!cycle?.id && open,
  });

  const cycleLabel = cycle ? `${cycle.review_year}` : '';

  const handleDownload = () => {
    if (!plan) return;
    downloadBulkTemplate(plan, cycleLabel);
    toast.success(`Template downloaded — ${plan.instances.length} rows, ${plan.columns.length} data columns.`);
  };

  const handleDryRun = async (f: File) => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await parseAndDryRun(f, plan);
      setReport(r);
      setFile(f);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!plan || !report) return;
    setBusy(true);
    try {
      const res = await commitDryRun(report, plan);
      if (res.failed) toast.error(`Committed ${res.updated}, ${res.failed} failed.`);
      else toast.success(`Committed ${res.updated} instance${res.updated === 1 ? '' : 's'}.`);
      setReport(null); setFile(null);
      onDone?.();
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Data Upload — one sheet, every form</DialogTitle>
          <DialogDescription>
            Download a single spreadsheet containing every employee in this cycle.
            Shared measurements (LTI, 5S, Absent Days, Disciplinary, etc.) live in one
            column each — the system routes them to the correct form (KRA / Management /
            Workmen / Trainee) automatically. Finalized and acknowledged rows are skipped.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing sheet…
          </div>
        )}

        {plan && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{plan.instances.length} employees</Badge>
              <Badge variant="secondary">{plan.columns.length} data columns</Badge>
              <Badge variant="outline">
                {plan.columns.filter((c) => c.kind === 'system_scores').length} System KPI
              </Badge>
              <Badge variant="outline">
                {plan.columns.filter((c) => c.kind === 'eligibility_inputs').length} Eligibility
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleDownload} className="gap-2">
                <Download className="h-4 w-4" /> Download template
              </Button>
              <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer text-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>Upload filled sheet</span>
                <input
                  type="file" accept=".xlsx,.xls,.csv" hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (f) handleDryRun(f);
                  }}
                />
              </label>
            </div>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Columns in this sheet
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {plan.columns.map((c) => (
                    <Badge key={`${c.kind}::${c.name}`} variant={c.kind === 'system_scores' ? 'default' : 'secondary'} className="text-xs">
                      {c.name}
                    </Badge>
                  ))}
                  {plan.columns.length === 0 && (
                    <span className="text-sm text-muted-foreground">No system-provided columns detected in this cycle&apos;s templates.</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {report && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    Dry-run preview {file ? `— ${file.name}` : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{report.applyCount} apply</Badge>
                    <Badge variant="secondary">{report.skipCount} skip</Badge>
                    <Badge variant="destructive">{report.errorCount} error</Badge>
                    <span className="text-muted-foreground">
                      {report.totalChanges} cell change{report.totalChanges === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Emp Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Verdict</TableHead>
                          <TableHead>Changes / Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.rows.slice(0, 200).map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.employeeCode}</TableCell>
                            <TableCell className="text-xs">{r.fullName}</TableCell>
                            <TableCell>
                              <Badge variant={r.verdict === 'apply' ? 'default' : r.verdict === 'error' ? 'destructive' : 'secondary'} className="text-xs">
                                {r.verdict}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.reason ? <span className="text-muted-foreground">{r.reason}</span> :
                                r.changes.map((c, j) => (
                                  <div key={j} className="leading-snug">
                                    <b>{c.column}</b>: {String(c.before ?? '—')} → {String(c.after)}
                                    {c.kind === 'system_scores' && c.rating !== undefined && (
                                      <span className="ml-2 text-muted-foreground">
                                        · rating {c.rating}/5 → {(c.afterPoints ?? 0).toFixed(2)} pts
                                        {typeof c.weight === 'number' ? ` of ${c.weight}` : ''}
                                        {c.matched === false ? ' · no band matched' : ''}
                                      </span>
                                    )}
                                  </div>
                                ))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {report.rows.length > 200 && (
                      <div className="p-2 text-xs text-muted-foreground border-t">
                        Showing first 200 of {report.rows.length} rows.
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => { setReport(null); setFile(null); }} disabled={busy}>
                      Discard
                    </Button>
                    <Button onClick={handleCommit} disabled={busy || report.applyCount === 0}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Commit {report.applyCount} row{report.applyCount === 1 ? '' : 's'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
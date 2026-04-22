import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Wrench } from 'lucide-react';

interface FixEntry {
  kpi_id: string;
  submission_id: string;
  kpi_name: string;
  employee_id: string;
  employee_name: string;
  achieved_value: number | null;
  old_score: number | null;
  old_rating: string | null;
  new_score: number;
  new_rating: string;
  criteria: string;
}
interface SkipEntry {
  kpi_id: string;
  kpi_name: string;
  employee_name: string;
  reason: string;
}
interface RescoreResult {
  dry_run: boolean;
  total_audit_rows: number;
  unique_kpis: number;
  eligible: number;
  skipped_count: number;
  applied_count: number;
  fixes: FixEntry[];
  skipped: SkipEntry[];
  message?: string;
}

const SKIP_LABELS: Record<string, string> = {
  final_score_locked: 'Finalized — frozen by §88',
  reviewer_score_present: 'Reviewer already entered a score',
  employee_resubmitted_after_backfill: 'Employee resubmitted after backfill',
  qualitative_uom_out_of_scope: 'Qualitative UOM (out of scope)',
  marked_na: 'Marked N/A',
  achieved_value_unparseable: 'Achieved value not numeric',
  already_correct: 'Score already matches engine',
  kpi_or_submission_missing: 'KPI or submission missing',
};

export function RescoreBackfilledSubmissionsDialog() {
  const [result, setResult] = useState<RescoreResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const run = useMutation({
    mutationFn: async (dryRun: boolean): Promise<RescoreResult> => {
      return await invokeAdminEdgeFunction<RescoreResult>(
        'rescore-backfilled-submissions',
        { dry_run: dryRun },
      );
    },
    onError: (err: Error) => {
      toast({ title: 'Re-score failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleScan = async () => {
    const r = await run.mutateAsync(true);
    setResult(r);
    toast({
      title: 'Scan complete',
      description: `${r.eligible} submission(s) need re-scoring; ${r.skipped_count} skipped.`,
    });
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    const r = await run.mutateAsync(false);
    setResult(r);
    toast({
      title: 'Re-score applied',
      description: `Updated ${r.applied_count} submission(s). Audit logs written.`,
    });
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" />
          Re-score Backfilled Submissions
          <Badge variant="secondary" className="ml-2">v2.66.7.16</Badge>
        </CardTitle>
        <CardDescription>
          Corrects review submissions created by the 21 Apr 2026 PROPAGATION_BACKFILL sweep
          where <code>self_score</code> was hardcoded to <strong>0</strong> instead of being
          calculated by the scoring engine. Skips finalized rows, reviewer-edited rows, and
          rows the employee has resubmitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleScan} disabled={run.isPending} variant="outline" size="sm">
            {run.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Preview (Dry Run)
          </Button>
          {result && result.eligible > 0 && result.dry_run && (
            <Button onClick={() => setConfirmOpen(true)} disabled={run.isPending} variant="destructive" size="sm">
              Apply {result.eligible} fix(es)
            </Button>
          )}
        </div>

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{result.total_audit_rows}</div>
                <div className="text-xs text-muted-foreground">Backfill rows</div>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{result.unique_kpis}</div>
                <div className="text-xs text-muted-foreground">Unique KPIs</div>
              </div>
              <div className="p-2 rounded bg-destructive/10 text-destructive">
                <div className="text-lg font-bold">{result.eligible}</div>
                <div className="text-xs">Need re-score</div>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{result.skipped_count}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>

            {!result.dry_run && (
              <div className="flex items-center gap-2 p-3 rounded bg-primary/10 text-primary text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Applied <strong>{result.applied_count}</strong> correction(s). Each change has an audit log entry tagged
                <code className="text-xs">PROPAGATION_BACKFILL_RESCORE</code>.
              </div>
            )}

            {result.fixes.length > 0 && (
              <div className="rounded border">
                <div className="px-3 py-2 text-xs font-medium bg-muted/40">
                  Corrections ({result.fixes.length})
                </div>
                <ScrollArea className="max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Criteria</TableHead>
                        <TableHead className="text-right">Achieved</TableHead>
                        <TableHead className="text-right">Old</TableHead>
                        <TableHead className="text-right">New</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.fixes.map((f) => (
                        <TableRow key={f.submission_id}>
                          <TableCell className="text-xs">{f.employee_name}</TableCell>
                          <TableCell className="text-xs">{f.kpi_name}</TableCell>
                          <TableCell className="text-xs">{f.criteria}</TableCell>
                          <TableCell className="text-xs text-right">{f.achieved_value ?? '—'}</TableCell>
                          <TableCell className="text-xs text-right text-destructive">
                            {f.old_score ?? '—'} ({f.old_rating ?? '—'})
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium text-primary">
                            {f.new_score} ({f.new_rating})
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {result.skipped.length > 0 && (
              <div className="rounded border">
                <div className="px-3 py-2 text-xs font-medium bg-muted/40 flex items-center gap-2">
                  <AlertCircle className="h-3 w-3" />
                  Skipped ({result.skipped.length})
                </div>
                <ScrollArea className="max-h-[200px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.skipped.map((s, i) => (
                        <TableRow key={`${s.kpi_id}-${i}`}>
                          <TableCell className="text-xs">{s.employee_name}</TableCell>
                          <TableCell className="text-xs">{s.kpi_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {SKIP_LABELS[s.reason] || s.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
        title={`Apply ${result?.eligible ?? 0} re-score correction(s)?`}
        description={`This will overwrite self_score and self_rating on ${result?.eligible ?? 0} review submission(s) using the canonical scoring engine. Finalized rows and reviewer-edited rows are already excluded. Each change is logged.`}
        confirmLabel="Apply Re-score"
        isLoading={run.isPending}
      />
    </Card>
  );
}
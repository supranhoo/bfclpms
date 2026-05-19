import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { PropagationPreviewResult } from '@/hooks/usePreviewOrgKpiPropagation';
import { summarisePropagationPreview } from '@/lib/orgKpiStatus';

interface PropagationPreviewDialogProps {
  open: boolean;
  isLoading?: boolean;
  preview: PropagationPreviewResult | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const REASON_LABEL: Record<string, string> = {
  eligible: 'Will advance',
  not_in_kra_set: 'Already past initial stage',
  reviewer_locked: 'Reviewer-locked',
  self_review_existing: 'Already in self-review',
  kpi_not_found: 'KPI row missing',
  approved_immutable: 'Approved — immutable',
};

function fmt(v: number | null | undefined) {
  return v === null || v === undefined ? '—' : String(v);
}

export function PropagationPreviewDialog({
  open,
  isLoading,
  preview,
  onConfirm,
  onCancel,
}: PropagationPreviewDialogProps) {
  // Single shared verdict — same predicate the tile chip uses (ADR-056).
  const verdict = summarisePropagationPreview(preview?.breakdown ?? []);
  const { total, willAdvance, willSkip, lockedCount, overwriteCount, effectivelyPropagated } = verdict;
  const allSkipped = total > 0 && willAdvance === 0;
  // ADR-064 — count rows that would be stepped back from a reviewer stage
  // back to self_review by the overwrite_and_stepback policy.
  const stepBackCount = (preview?.breakdown ?? []).filter(
    (r) =>
      r.will_advance &&
      ['manager_check', 'audit', 'auditor_check', 'skip_level_check', 'hr_pms_review', 'management_review'].includes(
        r.current_status,
      ),
  ).length;
  const approvedImmutable = (preview?.breakdown ?? []).filter(
    (r) => r.reason === 'approved_immutable',
  ).length;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm propagation</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating impact…
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="gap-1">
                      <span className="text-muted-foreground">Total matched:</span>
                      <span className="font-semibold text-foreground">{total}</span>
                    </Badge>
                    <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{willAdvance} will advance</span>
                    </Badge>
                    {willSkip > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        <span>{willSkip} will skip</span>
                      </Badge>
                    )}
                    {lockedCount > 0 && (
                      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
                        <Lock className="h-3 w-3" />
                        <span>{lockedCount} reviewer-locked</span>
                      </Badge>
                    )}
                    {overwriteCount > 0 && (
                      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{overwriteCount} will overwrite existing self-review</span>
                      </Badge>
                    )}
                    {stepBackCount > 0 && (
                      <Badge variant="outline" className="gap-1 border-amber-600 text-amber-800">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{stepBackCount} will be sent back to Self-Review</span>
                      </Badge>
                    )}
                    {approvedImmutable > 0 && (
                      <Badge variant="outline" className="gap-1 border-muted-foreground text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        <span>{approvedImmutable} approved (skipped)</span>
                      </Badge>
                    )}
                  </div>

                  {stepBackCount > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900">
                      <strong>Heads up:</strong> {stepBackCount} employee
                      {stepBackCount === 1 ? '' : 's'} have already moved into a
                      reviewer stage. Saving will overwrite their self-review
                      values and remarks, clear all reviewer scores, and reset
                      them back to <strong>Self-Review</strong> so the chain
                      re-runs. Approved rows are not touched.
                    </div>
                  )}

                  {allSkipped && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      All matching KPIs are already past the initial stage. Propagating
                      now will <strong>not</strong> advance any employee. The org KPI
                      definition will also <strong>not</strong> be marked as propagated.
                    </div>
                  )}

                  {effectivelyPropagated && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-800">
                      Tile shows <strong>Propagated</strong> for this reason — every mapped
                      employee has already advanced past the data-owner stage, so no row can
                      be advanced from here.
                    </div>
                  )}

                  {preview && preview.breakdown.length > 0 && (
                    <div className="max-h-72 overflow-y-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                          <tr className="text-left">
                            <th className="px-2 py-1.5 font-medium">Employee</th>
                            <th className="px-2 py-1.5 font-medium">Current status</th>
                            <th className="px-2 py-1.5 font-medium">Self-score Old → New</th>
                            <th className="px-2 py-1.5 font-medium">Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.breakdown.map((row) => (
                            <tr
                              key={row.kpi_id}
                              className="border-t hover:bg-muted/40"
                            >
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-foreground">
                                  {row.employee_name || '—'}
                                </div>
                                {row.employee_code && (
                                  <div className="text-muted-foreground">
                                    {row.employee_code}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                                {row.current_status}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[11px]">
                                <span className={row.value_changes ? 'text-amber-700' : 'text-muted-foreground'}>
                                  {fmt(row.current_self_score)} → {fmt(row.new_self_score)}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {row.will_advance ? (
                                  <span className="inline-flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Advance
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-destructive">
                                    <XCircle className="h-3 w-3" />
                                    {REASON_LABEL[row.reason] ?? row.reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading || total === 0}>
            {willAdvance === 0
              ? 'Propagate anyway'
              : `Propagate to ${willAdvance} employee${willAdvance === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

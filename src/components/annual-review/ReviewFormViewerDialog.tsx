/**
 * ADR-218e — read-only viewer for a submitted annual review form.
 *
 * Shows the employee's self-review answers, every reviewer stage remark
 * (Manager / Dept Head / BU Head / HR / Management), the system scores and the
 * shared "How this score was calculated" breakdown, so an analyst looking at a
 * bell-curve cell can see exactly where the rating came from.
 */
import { Link } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, FileText } from 'lucide-react';
import { useInstanceReviewForm } from '@/hooks/annualReview/useInstanceReviewForm';
import { ScoreBreakdownCard } from '@/components/annual-review/ScoreBreakdownCard';
import { buildStageBlocks, buildSystemScoreRows } from '@/lib/annualReview/reviewFormView';
import { STATUS_LABEL } from '@/lib/annualReview/constants';
import {
  DEFAULT_RATING_SLABS, formatRating5, formatSlabPercent, type RatingSlab,
} from '@/lib/annualReview/ratingSlab';
import { computedRating, effectiveRating, effectiveSlabPercent, isCalibrated } from '@/lib/annualReview/effectiveRating';
import type { AnnualReviewInstance } from '@/types/annualReview';

const fmt = (v: number | null | undefined, d = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—';
const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function ReviewFormViewerDialog({
  instanceId, slabs = DEFAULT_RATING_SLABS, onClose,
}: {
  instanceId: string | null;
  slabs?: ReadonlyArray<RatingSlab>;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useInstanceReviewForm(instanceId);
  const instance = data?.instance as AnnualReviewInstance | undefined;
  const template = data?.template ?? null;

  const stages = data
    ? buildStageBlocks({
      template,
      responses: data.responses,
      enabledStages: instance?.enabled_stages ?? null,
    })
    : [];
  const systemRows = buildSystemScoreRows(
    template,
    instance?.system_scores ?? null,
    instance?.system_scores_raw ?? null,
  );
  const selfFields = template?.sections?.self_review_fields ?? [];
  const selfAnswers = (data?.responses.find((r) => r.reviewer_role === 'self')?.qualitative_responses
    ?? {}) as Record<string, string>;
  const selfSubmittedAt = data?.responses.find((r) => r.reviewer_role === 'self')?.submitted_at ?? null;

  const calRow = instance
    ? {
      total_score: instance.total_score,
      calibrated_rating: (instance as unknown as { calibrated_rating?: number | null }).calibrated_rating ?? null,
    }
    : null;

  return (
    <Dialog open={!!instanceId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Submitted review form
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${data.employeeCode ?? '—'} · ${data.employeeName ?? '—'}`
              : 'Loading the review…'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message || 'This review is not available for your access level.'}
          </p>
        )}

        {data && instance && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline" className="mt-1">{STATUS_LABEL[instance.overall_status]}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Final Score</p>
                <p className="text-sm font-medium tabular-nums">{fmt(instance.total_score)} / 100</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rating (/5)</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatRating5(calRow ? effectiveRating(calRow) : null)}
                  {calRow && isCalibrated(calRow) && (
                    <Badge variant="outline" className="ml-2 text-[10px]" title={`Computed ${formatRating5(computedRating(calRow))}`}>
                      Calibrated
                    </Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Slab %</p>
                <p className="text-sm font-medium tabular-nums">
                  {formatSlabPercent(calRow ? effectiveSlabPercent(calRow, slabs) : null)}
                </p>
              </div>
            </div>

            {/* Self review answers */}
            {selfFields.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Self review submitted by the employee
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {selfSubmittedAt ? `submitted ${fmtDate(selfSubmittedAt)}` : 'not submitted'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selfFields.map((f) => (
                    <div key={f.id}>
                      <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                      <p className="whitespace-pre-wrap text-sm">{selfAnswers[f.id]?.trim() || '—'}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Stage remarks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reviewer ratings &amp; remarks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {stages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No reviewer stages recorded.</p>
                )}
                {stages.map((s) => (
                  <div key={s.role} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {s.label}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {s.reviewerName ?? '—'}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.submitted ? `Submitted ${fmtDate(s.submittedAt)}` : 'Not submitted'}
                        {s.weightedScore !== null && ` · Stage score ${fmt(s.weightedScore)}`}
                      </p>
                    </div>
                    {s.criteria.length > 0 && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="p-2 text-left font-medium">Criterion</th>
                              <th className="w-20 p-2 text-right font-medium">Rating</th>
                              <th className="p-2 text-left font-medium">Remark</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.criteria.map((c) => (
                              <tr key={c.id} className="border-t align-top">
                                <td className="p-2">{c.name}</td>
                                <td className="p-2 text-right tabular-nums">{fmt(c.score)}</td>
                                <td className="p-2 whitespace-pre-wrap text-muted-foreground">{c.comment ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {s.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        <span className="text-xs text-muted-foreground">Overall remark: </span>{s.notes}
                      </p>
                    )}
                  </div>
                ))}
                {instance.hr_remarks && (
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">HR remarks</p>
                    <p className="whitespace-pre-wrap text-sm">{instance.hr_remarks}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System scores */}
            {systemRows.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">System scores</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="p-2 text-left font-medium">Parameter</th>
                          <th className="p-2 text-right font-medium">Raw value</th>
                          <th className="p-2 text-right font-medium">Weight</th>
                          <th className="p-2 text-right font-medium">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {systemRows.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="p-2">{r.name}</td>
                            <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.raw)}</td>
                            <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.weight)}</td>
                            <td className="p-2 text-right tabular-nums">{fmt(r.points)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* How the score was calculated (shared SSOT card) */}
            <ScoreBreakdownCard
              template={template}
              criteriaScores={
                (data.responses
                  .slice()
                  .reverse()
                  .find((r) => Object.keys(r.criteria_scores ?? {}).length > 0)
                  ?.criteria_scores ?? {}) as Record<string, number>
              }
              systemScores={instance.system_scores ?? {}}
              defaultOpen
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {instanceId && (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to={`/annual-review/team/${instanceId}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open full review
              </Link>
            </Button>
          )}
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
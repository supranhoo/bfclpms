import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw, ShieldCheck } from 'lucide-react';
import type { EligibilityCriterion } from '@/types/annualReview';
import {
  ELIGIBILITY_STATUS_LABELS,
  effectiveSlabPercent,
  isSlabCapped,
  resolveEligibility,
  type SlabCapOptions,
} from '@/lib/annualReview/effectiveEligibility';
import { buildSlabCapOptions } from '@/lib/annualReview/reportRating';
import {
  formatRating5, formatSlabPercent, resolveSlabPercent, toRatingOutOf5,
} from '@/lib/annualReview/ratingSlab';
import { effectiveRating } from '@/lib/annualReview/effectiveRating';
import { useAnnualReviewRatingSlabs } from '@/hooks/useAnnualReviewRatingSlabs';
import { useBellCurveConfig } from '@/hooks/useBellCurveConfig';
import { useEligibilityExemptionPolicy } from '@/hooks/annualReview/useEligibilityExemptions';
import {
  useAnnualReviewInstanceChangeLog,
  useInstanceEligibilityExemptions,
} from '@/hooks/useAnnualReviewInstanceChangeLog';
import {
  actorLabel, eventTypeLabel, formatChange, formatChangeTimestamp, sortChangeLog,
} from '@/lib/annualReview/instanceChangeLog';

const COLLAPSED_ROWS = 5;

export interface AdminFinalOutcomeCardProps {
  instanceId: string;
  cycleId?: string | null;
  totalScore: number | null;
  finalRating: string | null;
  eligibilityCriteria: ReadonlyArray<EligibilityCriterion>;
  eligibilityInputs: Record<string, unknown> | null | undefined;
  calibration?: { calibrated_rating: number; calibration_reason: string | null; calibrated_at: string | null } | null;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * ADR-238 / POLICY §AR-ADMIN-FINAL-OUTCOME-VISIBILITY
 *
 * Admin / HR PMS read-only summary of the final outcome for one review:
 * score, computed vs calibrated vs effective rating, increment slab, the
 * eligibility/exemption position, and the audited change log. Rendering only —
 * every number comes from the shared SSOT helpers.
 */
export function AdminFinalOutcomeCard(props: AdminFinalOutcomeCardProps) {
  const {
    instanceId, cycleId, totalScore, finalRating,
    eligibilityCriteria, eligibilityInputs, calibration,
  } = props;
  const [expanded, setExpanded] = useState(false);

  const { data: slabs } = useAnnualReviewRatingSlabs();
  const { data: bellCurveConfig } = useBellCurveConfig(cycleId ?? undefined);
  const { data: policy = [] } = useEligibilityExemptionPolicy();
  const { data: exemptions = [] } = useInstanceEligibilityExemptions(instanceId);
  const log = useAnnualReviewInstanceChangeLog(instanceId);

  const capOptions: SlabCapOptions = buildSlabCapOptions(bellCurveConfig, slabs);

  const elig = useMemo(() => resolveEligibility({
    criteria: eligibilityCriteria,
    inputs: (eligibilityInputs ?? undefined) as Record<string, unknown> | undefined,
    exemptions,
    policy,
  }), [eligibilityCriteria, eligibilityInputs, exemptions, policy]);

  const computed = toRatingOutOf5(totalScore);
  const effective = effectiveRating({
    total_score: totalScore,
    calibrated_rating: calibration?.calibrated_rating ?? null,
  });
  const computedPercent = resolveSlabPercent(effective, slabs);
  const slabPercent = effectiveSlabPercent(computedPercent, elig.status, capOptions);
  const capped = isSlabCapped(computedPercent, elig.status, capOptions);

  const rows = sortChangeLog(log.data?.rows ?? []);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  const statusVariant = elig.status === 'ineligible'
    ? 'destructive'
    : elig.status === 'exempted' ? 'secondary' : 'outline';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Final Outcome
              <Badge variant="outline" className="text-[10px] uppercase">Admin only</Badge>
            </CardTitle>
            <CardDescription>
              Final score, exemption position and every recorded change for this review.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => log.refetch()}
            disabled={log.isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${log.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Score strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Metric
            label="Final score"
            value={totalScore === null || totalScore === undefined ? '—' : `${Number(totalScore).toFixed(2)}`}
            hint={finalRating ? `/ 100 · ${finalRating}` : '/ 100'}
          />
          <Metric label="Computed rating" value={formatRating5(computed)} hint="/ 5" />
          <Metric
            label="Calibrated rating"
            value={calibration ? formatRating5(calibration.calibrated_rating) : '—'}
            hint={calibration?.calibrated_at
              ? formatChangeTimestamp(calibration.calibrated_at)
              : 'Not calibrated'}
          />
          <Metric label="Effective rating" value={formatRating5(effective)} hint="/ 5 · used everywhere" />
          <Metric
            label="Increment slab"
            value={formatSlabPercent(slabPercent)}
            hint={capped ? `Capped from ${formatSlabPercent(computedPercent)}` : undefined}
          />
        </div>

        {calibration?.calibration_reason && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Calibration reason:</span>{' '}
            {calibration.calibration_reason}
          </p>
        )}

        <Separator />

        {/* Eligibility & exemption */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Eligibility</span>
            <Badge variant={statusVariant}>{ELIGIBILITY_STATUS_LABELS[elig.status]}</Badge>
            {elig.hasPendingExemption && <Badge variant="outline">Exemption pending</Badge>}
          </div>

          {exemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No exemption recorded.</p>
          ) : (
            <ul className="space-y-2">
              {exemptions.map((x) => (
                <li key={x.id ?? `${x.criterion_id}-${x.status}`} className="rounded-md border p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{x.criterion_name || x.criterion_id}</span>
                    <Badge variant={x.status === 'approved' ? 'secondary' : x.status === 'rejected' ? 'destructive' : 'outline'}>
                      {x.status}
                    </Badge>
                    {x.source === 'bulk' && <Badge variant="outline">Bulk run</Badge>}
                  </div>
                  {x.reason && (
                    <p className="text-xs text-muted-foreground">Reason: {x.reason}</p>
                  )}
                  {x.decision_note && (
                    <p className="text-xs text-muted-foreground">Decision note: {x.decision_note}</p>
                  )}
                  {(x.penalty_from_percent !== null && x.penalty_from_percent !== undefined) && (
                    <p className="text-xs text-muted-foreground">
                      Slab penalty: {formatSlabPercent(x.penalty_from_percent)} → {formatSlabPercent(x.penalty_to_percent ?? null)}
                    </p>
                  )}
                  {x.decided_at && (
                    <p className="text-xs text-muted-foreground">Decided {formatChangeTimestamp(x.decided_at)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {elig.blocking.length > 0 && (
            <p className="text-xs text-destructive">
              Blocking: {elig.blocking.map((f) => f.criterion.name).join(', ')}
            </p>
          )}
          {elig.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Eligibility inputs pending: {elig.missing.map((c) => c.name).join(', ')}
            </p>
          )}
        </div>

        <Separator />

        {/* Change log */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Change log</span>
            {log.data && log.data.total > 0 && (
              <span className="text-xs text-muted-foreground">{log.data.total} events</span>
            )}
          </div>

          {log.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : log.isError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Could not load the change log.
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => log.refetch()}>
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded.</p>
          ) : (
            <>
              <ol className="space-y-2 border-l pl-4">
                {visible.map((r, i) => (
                  <li key={`${r.occurred_at}-${r.field_label}-${i}`} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{eventTypeLabel(r.event_type)}</Badge>
                      <span className="font-medium">{r.field_label}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatChange(r)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatChangeTimestamp(r.occurred_at)} · {actorLabel(r)}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
              {rows.length > COLLAPSED_ROWS && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {expanded ? 'Show less' : `Show all ${rows.length} on this page`}
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useRecentStageWeightsOverrideAudits } from '@/hooks/useAnnualReview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Scale, RefreshCcw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { StageWeightsOverrideAudit } from '@/services/annualReview/annualReviewService';

/**
 * Phase 4 — Recent custom-weights audit feed.
 * Surfaces the immutable audit rows emitted by
 * `set_annual_review_stage_weights_override` (admin/HR PMS only via RLS).
 *
 * Read-only. No destructive actions; the audit log itself is append-only.
 */
const STAGE_LABEL: Record<string, string> = {
  self: 'Self',
  manager: 'Manager',
  skip_manager: 'Skip',
  bu_head: 'BU',
  hr: 'HR',
  system: 'System',
  criteria: 'Criteria',
};

function formatWeights(w: Record<string, number> | null): string {
  if (!w) return '—';
  const parts = Object.entries(w)
    .filter(([, v]) => typeof v === 'number')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${STAGE_LABEL[k] ?? k} ${v}%`);
  return parts.length ? parts.join(' · ') : '—';
}

export function RecentStageWeightOverridesPanel({ cycleId }: { cycleId: string | undefined }) {
  const { data: rows = [], isLoading, isFetching, refetch } = useRecentStageWeightsOverrideAudits(cycleId, 25);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" /> Recent custom-weight overrides
          <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
        </CardTitle>
        <Button
          size="sm" variant="ghost" className="gap-1.5 h-8"
          onClick={() => refetch()} disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading audit feed…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No custom weight overrides recorded for this cycle.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r: StageWeightsOverrideAudit) => {
              const cleared = r.next == null;
              return (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">
                      {r.employee_name ?? r.employee_id ?? 'Unknown employee'}
                      {r.employee_code && (
                        <span className="ml-2 text-xs text-muted-foreground">{r.employee_code}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      {r.performer_name && <> · by {r.performer_name}</>}
                    </div>
                  </div>
                  <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground mr-1">Previous:</span>
                      <span className="tabular-nums">{formatWeights(r.previous)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-1">
                        {cleared ? 'Cleared' : 'New:'}
                      </span>
                      <span className="tabular-nums">
                        {cleared
                          ? <Badge variant="outline">Reverted to template default</Badge>
                          : formatWeights(r.next)}
                      </span>
                    </div>
                  </div>
                  {r.reason && (
                    <p className="mt-1 text-xs text-muted-foreground italic">"{r.reason}"</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
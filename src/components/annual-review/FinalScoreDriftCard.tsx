import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { recomputeFinalScores } from '@/services/annualReview/finalScoreIntegrity';
import {
  DRIFT_RECOMPUTE_REASON,
  changesBand,
  driftDelta,
  summariseDrift,
  type FinalScoreDriftRow,
} from '@/lib/annualReview/finalScoreDrift';

const PREVIEW = 20;

/**
 * ADR-235 — Stored vs recomputed final-score monitor.
 * `annual_review_apply_final_summary` is the sole sanctioned writer of
 * `total_score`; any row listed here was written by a path that bypassed it.
 * The repair re-runs the sanctioned writer (audited, reversible).
 */
export function FinalScoreDriftCard({ cycleId }: { cycleId?: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['annual-review-final-score-drift', cycleId ?? 'all'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'annual_review_final_score_drift' as never,
        { p_cycle_id: cycleId ?? null } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as FinalScoreDriftRow[];
    },
  });

  const rows = data ?? [];
  const summary = summariseDrift(rows);
  const clean = !isLoading && summary.total === 0;

  const repair = useMutation({
    mutationFn: async () => {
      setBusy(true);
      return recomputeFinalScores({
        instanceIds: rows.map((r) => r.instance_id),
        reason: DRIFT_RECOMPUTE_REASON,
        allowOverwrite: true,
      });
    },
    onSuccess: (res) => {
      toast.success(`Recomputed ${res.applied} review(s)`, {
        description: res.skipped.length ? `${res.skipped.length} skipped` : undefined,
      });
      qc.invalidateQueries({ queryKey: ['annual-review-final-score-drift'] });
      qc.invalidateQueries({ queryKey: ['annual-review-final-score-integrity'] });
    },
    onError: (e: unknown) => {
      toast.error('Recompute failed', {
        description: e instanceof Error ? e.message : 'Unexpected error',
      });
    },
    onSettled: () => setBusy(false),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {clean
              ? <ShieldCheck className="h-4 w-4 text-primary" />
              : <TriangleAlert className="h-4 w-4 text-destructive" />}
            Stored vs recomputed final score
          </CardTitle>
          <CardDescription>
            The stored final score must equal the value the official calculation produces
            (ADR-235).
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!clean && (
            <Button size="sm" onClick={() => repair.mutate()} disabled={busy || isFetching}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Recompute {summary.total}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Recomputing completed reviews…
          </div>
        ) : clean ? (
          <p className="text-sm text-muted-foreground">
            Every completed review matches its recomputed score and rating band.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">{summary.total} drifted</Badge>
              {summary.understated > 0 && (
                <Badge variant="outline">{summary.understated} understated</Badge>
              )}
              {summary.overstated > 0 && (
                <Badge variant="outline">{summary.overstated} overstated</Badge>
              )}
              {summary.bandChanges > 0 && (
                <Badge variant="outline">{summary.bandChanges} change rating band</Badge>
              )}
              <Badge variant="outline">max ±{summary.maxDelta.toFixed(2)} pts</Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {rows.slice(0, PREVIEW).map((r) => (
                <li key={r.instance_id} className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {r.employee_name ?? '—'} ({r.employee_code ?? '—'})
                  </span>{' '}
                  · stored {r.stored_total === null ? '—' : Number(r.stored_total).toFixed(2)} →
                  correct{' '}
                  {r.computed_total === null ? '—' : Number(r.computed_total).toFixed(2)} (
                  {driftDelta(r) >= 0 ? '+' : ''}
                  {driftDelta(r).toFixed(2)})
                  {changesBand(r) && (
                    <> · band {r.stored_rating ?? '—'} → {r.computed_rating ?? '—'}</>
                  )}
                </li>
              ))}
            </ul>
            {rows.length > PREVIEW && (
              <p className="text-xs text-muted-foreground">…and {rows.length - PREVIEW} more.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

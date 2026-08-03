import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

interface OrphanRow {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
  template_name: string | null;
  orphan_keys: string[] | null;
  orphan_points: number | null;
  total_score: number | null;
  expected_total_score: number | null;
}

/**
 * ADR-234 — Orphan system-score monitor.
 * Lists reviews whose stored `system_scores` still carry slots that no longer
 * exist on the effective template. Those points are already excluded from the
 * final score, but the rows should be pruned so the stored snapshot matches the
 * template. Read-only; repair runs through
 * `annual_review_prune_orphan_system_scores`.
 */
export function OrphanSystemScoreCard({ cycleId }: { cycleId?: string | null }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['annual-review-orphan-system-scores', cycleId ?? 'all'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'annual_review_orphan_system_scores' as never,
        { p_cycle_id: cycleId ?? null } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as OrphanRow[];
    },
  });

  const rows = data ?? [];
  const clean = !isLoading && rows.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {clean
              ? <ShieldCheck className="h-4 w-4 text-primary" />
              : <TriangleAlert className="h-4 w-4 text-destructive" />}
            Orphan system-score slots
          </CardTitle>
          <CardDescription>
            Stored scores must only contain slots declared by the employee's current
            template (ADR-234).
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning stored system scores…
          </div>
        ) : clean ? (
          <p className="text-sm text-muted-foreground">
            No orphan slots — every stored score belongs to the effective template.
          </p>
        ) : (
          <div className="space-y-2">
            <Badge variant="destructive">{rows.length} review(s) with orphan slots</Badge>
            <ul className="space-y-1 text-sm">
              {rows.slice(0, 20).map((r) => (
                <li key={r.instance_id} className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {r.employee_name ?? '—'} ({r.employee_code ?? '—'})
                  </span>{' '}
                  · {(r.orphan_keys ?? []).length} slot(s), +
                  {Number(r.orphan_points ?? 0).toFixed(2)} pts · stored{' '}
                  {r.total_score === null ? '—' : Number(r.total_score).toFixed(2)} → correct{' '}
                  {r.expected_total_score === null ? '—' : Number(r.expected_total_score).toFixed(2)}
                </li>
              ))}
            </ul>
            {rows.length > 20 && (
              <p className="text-xs text-muted-foreground">…and {rows.length - 20} more.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
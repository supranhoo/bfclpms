import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertOctagon, Loader2 } from 'lucide-react';
import { useSafetyAtRiskRoster } from '@/hooks/useSafetyAnalytics';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

/**
 * AtRiskWidget
 * ------------
 * Per-assignee at-risk roster. An assignee is "at risk" when they have any
 * red-SLA open incident OR ≥ p_threshold open incidents. Reads
 * `safety_dashboard_at_risk` RPC.
 */
export default function AtRiskWidget({ threshold = 3 }: { threshold?: number }) {
  const { data = [], isLoading } = useSafetyAtRiskRoster(threshold);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertOctagon className="h-4 w-4" /> At-risk roster
        </CardTitle>
        <CardDescription>Assignees with overdue SLAs or {threshold}+ open incidents.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading roster…
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No assignees flagged — workload is healthy.
          </p>
        ) : (
          data.map((r) => (
            <div
              key={r.assigned_to}
              className="flex items-center gap-3 p-3 rounded-lg border min-h-[56px]"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {r.assigned_to.slice(0, 8)}…
                </div>
                <div className="text-xs text-muted-foreground">
                  Oldest open: {formatDistanceToNowStrict(parseISO(r.oldest_open_at))} ago
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.red_count > 0 && (
                  <Badge variant="destructive" className="tabular-nums">{r.red_count} red</Badge>
                )}
                {r.amber_count > 0 && (
                  <Badge variant="outline" className="tabular-nums text-amber-600 border-amber-500/40">
                    {r.amber_count} amber
                  </Badge>
                )}
                <Badge variant="secondary" className="tabular-nums">{r.open_count} open</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
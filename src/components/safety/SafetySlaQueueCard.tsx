/**
 * Phase 11 — Safety SLA v2: at-risk queue card.
 * --------------------------------------------
 * Read-only derivation off the cached `useSafetyIncidents()` query.
 * No new fetch, no new realtime channel, no writers. Flag-gated by
 * caller (`ui_safety_sla_v2`).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { useSafetyIncidents } from '@/hooks/useSafetyIncidents';
import {
  badgeToneFor,
  classifySla,
  formatSlaCountdown,
  prioritizeSlaQueue,
} from '@/lib/safetySla';

export function SafetySlaQueueCard() {
  const { data, isLoading } = useSafetyIncidents();

  const queue = useMemo(() => {
    if (!data) return [];
    const enriched = data
      .filter((r) => r.status !== 'closed')
      .map((r) => ({ row: r, classification: classifySla(r) }))
      .filter((e) => e.classification.state === 'red' || e.classification.state === 'amber');
    return prioritizeSlaQueue(enriched);
  }, [data]);

  const redCount   = queue.filter((q) => q.classification.state === 'red').length;
  const amberCount = queue.filter((q) => q.classification.state === 'amber').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> At-Risk Queue
        </CardTitle>
        <CardDescription>
          Open incidents currently inside the amber window or already overdue.
          Sorted red → amber. Updates as the incidents cache refreshes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-3 text-xs">
          <Badge variant="destructive">Red {redCount}</Badge>
          <Badge variant="secondary">Amber {amberCount}</Badge>
        </div>
        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading incidents…
          </div>
        ) : queue.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No incidents currently breaching SLA. 🎉
          </p>
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <ul className="space-y-2">
              {queue.slice(0, 100).map(({ row, classification }) => (
                <li
                  key={row.id}
                  className="rounded-md border p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.incident_number ?? row.id.slice(0, 8)}
                      </span>
                      <Badge variant={badgeToneFor(classification.state)}>
                        {classification.state.toUpperCase()} · {formatSlaCountdown(classification)}
                      </Badge>
                      <Badge variant="outline">{row.severity}</Badge>
                      <Badge variant="outline">{row.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="text-sm font-medium truncate mt-1">{row.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.location}</div>
                  </div>
                  <Link
                    to={`/safety/incidents/${row.id}`}
                    className="text-primary hover:underline text-xs flex items-center gap-1 shrink-0 pt-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
            {queue.length > 100 && (
              <p className="text-xs text-muted-foreground text-center pt-3">
                Showing first 100 of {queue.length}.
              </p>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
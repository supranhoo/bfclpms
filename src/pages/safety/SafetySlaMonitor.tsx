import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Timer } from 'lucide-react';
import { useRunSafetySlaCheck } from '@/hooks/useSafetyNotifications';

/**
 * SafetySlaMonitor — /safety/settings/sla
 * ---------------------------------------
 * Phase 1.D admin page. Shows the latest SLA escalation history (one row
 * per incident+level) and exposes a "Run now" button that calls the
 * `check-safety-sla` edge function on demand. The same engine runs every
 * 5 minutes via pg_cron.
 */
export default function SafetySlaMonitor() {
  const { toast } = useToast();
  const runCheck = useRunSafetySlaCheck();

  const escalations = useQuery({
    queryKey: ['safety', 'sla_escalations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_sla_escalations' as any)
        .select(
          'id, incident_id, level, notified_at, recipient_count, safety_incidents(incident_number, title, status, severity)',
        )
        .order('notified_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const onRun = async () => {
    try {
      const r = await runCheck.mutateAsync();
      toast({
        title: 'SLA check complete',
        description: `Amber escalated: ${r.amber_escalated ?? 0} · Red escalated: ${r.red_escalated ?? 0}`,
      });
      escalations.refetch();
    } catch (e: any) {
      toast({
        title: 'SLA check failed',
        description: e.message ?? 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" /> SLA Monitor
            </CardTitle>
            <CardDescription>
              The escalation engine runs automatically every 5 minutes.
              Each incident is escalated at most once per level (Amber, Red).
            </CardDescription>
          </div>
          <Button onClick={onRun} disabled={runCheck.isPending}>
            {runCheck.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run now
          </Button>
        </CardHeader>
        <CardContent>
          {escalations.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading escalations…
            </div>
          ) : (escalations.data ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No SLA escalations have fired yet. Open incidents are healthy.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(escalations.data ?? []).map((row: any) => {
                  const inc = row.safety_incidents ?? {};
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {inc.incident_number ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {inc.title ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{inc.severity ?? '—'}</Badge>
                      </TableCell>
                      <TableCell>{inc.status ?? '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.level === 'red' ? 'destructive' : 'secondary'}
                        >
                          {row.level.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.recipient_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.notified_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
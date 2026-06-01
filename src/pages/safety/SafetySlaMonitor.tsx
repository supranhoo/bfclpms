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
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { useSafetyRealtimeSync } from '@/hooks/useSafetyRealtimeSync';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { SafetySlaQueueCard } from '@/components/safety/SafetySlaQueueCard';

type SlaRow = {
  id: string;
  incident_id: string;
  level: 'amber' | 'red';
  notified_at: string;
  recipient_count: number;
  safety_incidents?: {
    incident_number?: string;
    title?: string;
    status?: string;
    severity?: string;
  } | null;
};

async function fetchSlaPage({
  range,
}: ManualQueryFetcherArgs<Record<string, never>>): Promise<{ rows: SlaRow[]; total: number }> {
  const { data, error, count } = await supabase
    .from('safety_sla_escalations' as never)
    .select(
      'id, incident_id, level, notified_at, recipient_count, safety_incidents(incident_number, title, status, severity)',
      { count: 'exact' },
    )
    .order('notified_at', { ascending: false })
    .range(range[0], range[1]);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as SlaRow[], total: count ?? 0 };
}

/**
 * SafetySlaMonitor — /safety/settings/sla
 * ---------------------------------------
 * Manual-fetch + paginated escalation history (POLICY §113 / ADR-050).
 * Click "Load" to fetch the latest escalations; the engine still runs
 * automatically every 5 minutes via pg_cron — this page is just a viewer.
 */
export default function SafetySlaMonitor() {
  // Scoped realtime: only SLA escalation rows.
  useSafetyRealtimeSync(true, ['safety_sla_escalations']);
  const { toast } = useToast();
  const runCheck = useRunSafetySlaCheck();
  const { data: settings } = useSafetySettings();
  const slaV2Enabled =
    settings?.find((r) => r.key === 'ui_safety_sla_v2')?.value === true;

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize, refetchLast,
  } = useManualQuery<SlaRow, Record<string, never>>(
    ['safety', 'sla_escalations', 'list'],
    fetchSlaPage,
  );

  const onRun = async () => {
    try {
      const r = await runCheck.mutateAsync();
      toast({
        title: 'SLA check complete',
        description: `Amber escalated: ${r.amber_escalated ?? 0} · Red escalated: ${r.red_escalated ?? 0}`,
      });
      refetchLast();
    } catch (e: unknown) {
      toast({
        title: 'SLA check failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 p-6">
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
        <CardContent />
      </Card>

      {slaV2Enabled ? <SafetySlaQueueCard /> : null}

      <SafetyFilterBar
        title="Escalation history"
        description="Click Load to fetch the latest SLA escalations."
        onSubmit={() => submit({})}
        onReset={() => reset()}
        isSubmitting={isFetching}
        submitLabel="Load"
      >
        <p className="text-xs text-muted-foreground md:col-span-3 lg:col-span-4 self-center">
          No filters — paginated chronological view.
        </p>
      </SafetyFilterBar>

      <SafetyDataTable
        title="SLA escalations"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rowCount={rows.length}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      >
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
            {rows.map((row) => {
              const inc = row.safety_incidents ?? {};
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {inc.incident_number ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{inc.title ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{inc.severity ?? '—'}</Badge>
                  </TableCell>
                  <TableCell>{inc.status ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={row.level === 'red' ? 'destructive' : 'secondary'}>
                      {row.level.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.recipient_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(row.notified_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SafetyDataTable>
    </div>
  );
}
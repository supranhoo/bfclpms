import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldCheck, Activity, Info } from 'lucide-react';
import { useCanonicalAutolinkSetting } from '@/hooks/useCanonicalAutolink';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface AutolinkLogRow {
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

/**
 * Phase 2b Governance tab: feature flag + recent auto-link audit feed.
 * Pure read on audit_logs filtered to KPI_CANONICAL_AUTOLINKED.
 */
export function GovernanceTab() {
  const { enabled, loading: settingLoading, saving, setSetting } = useCanonicalAutolinkSetting();
  const [logs, setLogs] = useState<AutolinkLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLogsLoading(true);
      const { data, error } = await (supabase as any)
        .from('audit_logs')
        .select('id, created_at, metadata, new_value')
        .eq('action', 'KPI_CANONICAL_AUTOLINKED')
        .order('created_at', { ascending: false })
        .limit(25);
      if (cancelled) return;
      if (error) {
        console.warn('[GovernanceTab] audit fetch failed', error);
        setLogs([]);
      } else {
        setLogs((data ?? []) as unknown as AutolinkLogRow[]);
      }
      setLogsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Auto-link KPIs to Canonical Registry
          </CardTitle>
          <CardDescription>
            When enabled, every KPI created or edited for May 2026 onward is automatically
            stamped with its canonical definition if a registered alias matches. Historical
            KPIs (before May 2026) are never modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="autolink-toggle" className="text-sm font-medium">
                Canonical Auto-link
              </Label>
              <p className="text-xs text-muted-foreground">
                Soft enforcement — custom KPI names remain allowed and save unlinked.
              </p>
            </div>
            {settingLoading ? (
              <Skeleton className="h-6 w-11" />
            ) : (
              <div className="flex items-center gap-3">
                <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
                  {enabled ? 'ON' : 'OFF'}
                </Badge>
                <Switch
                  id="autolink-toggle"
                  checked={enabled}
                  disabled={saving}
                  onCheckedChange={setSetting}
                />
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/40 p-3">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              The toggle controls a database trigger. Disabling does not unlink existing KPIs;
              it only stops future inserts from being auto-stamped. Previously linked rows
              remain linked.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Recent Auto-link Activity
          </CardTitle>
          <CardDescription>
            Last 25 KPIs that the trigger automatically linked to a canonical definition.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No auto-links recorded yet. They will appear here once KPIs are created
              for May 2026 or later that match a registry alias.
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">When</TableHead>
                    <TableHead className="text-xs">KRA / KPI</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(row => {
                    const meta = (row.metadata ?? {}) as Record<string, unknown>;
                    const kra = String(meta.kra_name ?? '—');
                    const kpi = String(meta.kpi_name ?? '—');
                    const period = String(meta.review_period ?? '—');
                    const year = String(meta.review_year ?? '');
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {format(new Date(row.created_at), 'dd MMM, HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{kra}</div>
                          <div className="text-muted-foreground">{kpi}</div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {period} {year}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
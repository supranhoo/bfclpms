import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Client = { id: string; client_key: string; display_name: string; is_active: boolean };

type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  after: any;
};

const PAGE_SIZE = 25;

function maskEmail(email?: string | null): string {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local[0] ?? '*'}***@${domain}`;
}

function rangeForFilter(f: '24h' | '7d' | '30d' | 'all'): Date | null {
  if (f === 'all') return null;
  const d = new Date();
  if (f === '24h') d.setHours(d.getHours() - 24);
  if (f === '7d') d.setDate(d.getDate() - 7);
  if (f === '30d') d.setDate(d.getDate() - 30);
  return d;
}

export function DeliveryLogsTab({ client }: { client?: Client }) {
  const { hasRole } = useAuth();
  const isOwner = hasRole('platform_owner');
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failed'>('all');
  const [tplKey, setTplKey] = useState('');
  const [since, setSince] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [page, setPage] = useState(0);

  // Reset to first page when filters/client change.
  useEffect(() => { setPage(0); }, [outcome, tplKey, since, client?.id]);

  const sinceDate = useMemo(() => rangeForFilter(since), [since]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['impl-console', 'delivery-logs', client?.id, outcome, tplKey, since, page],
    queryFn: async () => {
      if (!client) return { rows: [] as AuditRow[], count: 0, actors: {} as Record<string, { full_name: string | null; email: string | null }> };
      let q = supabase
        .from('entitlement_audit')
        .select('id, created_at, actor_id, after', { count: 'exact' })
        .eq('client_id', client.id)
        .eq('entity_type', 'client_smtp')
        .eq('reason', 'impl_console_test_email_send_client_smtp')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (sinceDate) q = q.gte('created_at', sinceDate.toISOString());
      if (outcome === 'success') q = q.eq('after->>success', 'true');
      if (outcome === 'failed') q = q.eq('after->>success', 'false');
      if (tplKey.trim()) q = q.ilike('after->>template_key', `%${tplKey.trim()}%`);
      const { data: rows, count, error } = await q;
      if (error) throw error;
      const auditRows = (rows ?? []) as AuditRow[];
      const actorIds = Array.from(new Set(auditRows.map((r) => r.actor_id).filter(Boolean) as string[]));
      let actors: Record<string, { full_name: string | null; email: string | null }> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds);
        actors = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
      }
      return { rows: auditRows, count: count ?? 0, actors };
    },
    enabled: !!client?.id,
  });

  if (!client) return <Alert><AlertDescription>Select a client to view delivery logs.</AlertDescription></Alert>;
  if (isError) return <Alert variant="destructive"><AlertDescription>Access denied or failed to load delivery logs for this client.</AlertDescription></Alert>;

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const from = rows.length ? page * PAGE_SIZE + 1 : 0;
  const to = page * PAGE_SIZE + rows.length;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Delivery Logs — {client.display_name}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertDescription className="text-xs">
            Read-only view of test emails sent from the Implementation Console. PMS notification engine logs are not surfaced here. Export is not available in this phase.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Outcome</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Template key contains</Label>
            <Input value={tplKey} onChange={(e) => setTplKey(e.target.value)} placeholder="welcome_test" />
          </div>
          <div>
            <Label className="text-xs">Since</Label>
            <Select value={since} onValueChange={(v) => setSince(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No test sends match these filters. Send one from the Test Email tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2 pr-2">When</th>
                  <th className="text-left py-2 pr-2">Recipient</th>
                  <th className="text-left py-2 pr-2">Template</th>
                  <th className="text-left py-2 pr-2">Provider</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2 pr-2">Actor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.after ?? {};
                  const actor = r.actor_id ? data?.actors[r.actor_id] : null;
                  const actorEmailShown = isOwner ? (actor?.email ?? '—') : maskEmail(actor?.email);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-2 whitespace-nowrap" title={r.created_at}>
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">{a.recipient_masked ?? '—'}</td>
                      <td className="py-2 pr-2">
                        {a.template_key ? (
                          <div className="flex items-center gap-1">
                            <code className="text-xs">{a.template_key}</code>
                            <Badge variant={a.template_resolved ? 'secondary' : 'outline'} className="text-[10px]">
                              {a.template_resolved ? 'template' : 'default'}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">default</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-2">{a.provider ?? '—'}</td>
                      <td className="py-2 pr-2">
                        {a.success ? (
                          <Badge variant="secondary">success</Badge>
                        ) : (
                          <Badge variant="destructive">failed{a.status ? ` (${a.status})` : ''}</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="text-xs">{actor?.full_name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{actorEmailShown}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <div>Showing {from}–{to} of {total}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || isFetching}>Previous</Button>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || isFetching}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
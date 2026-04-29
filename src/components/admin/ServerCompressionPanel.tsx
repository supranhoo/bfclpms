import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, AlertTriangle } from 'lucide-react';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Admin diagnostic + controls for the server-side WebP compression job (Phase B).
 * - Master toggle (`server_compression_enabled`) — pauses the cron worker.
 * - PMS-rewrite flag (`server_compression_pms_rewrite`) — gated OFF by default
 *   because rewriting `review_submissions.*_evidence_urls` touches scoring data.
 * - Live counts of pending / done / failed jobs across both queues.
 */
function parseBool(raw: unknown, dflt: boolean): boolean {
  if (raw === null || raw === undefined) return dflt;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).replace(/^"|"$/g, '').toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return dflt;
}

function useCompressionStats() {
  return useQuery({
    queryKey: ['admin', 'compression-stats'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const safety = await supabase
        .from('safety_incident_evidence')
        .select('compression_status', { count: 'exact', head: false })
        .limit(1000);
      const pms = await supabase
        .from('pms_evidence_compression_jobs')
        .select('status', { count: 'exact', head: false })
        .limit(1000);
      const tally = (rows: Array<{ compression_status?: string; status?: string }> | null, key: 'compression_status' | 'status') => {
        const t = { pending: 0, processing: 0, done: 0, skipped: 0, failed: 0 } as Record<string, number>;
        for (const r of rows ?? []) {
          const v = (r[key] ?? 'pending') as string;
          t[v] = (t[v] ?? 0) + 1;
        }
        return t;
      };
      return {
        safety: tally(safety.data ?? [], 'compression_status'),
        pms: tally(pms.data ?? [], 'status'),
      };
    },
  });
}

export function ServerCompressionPanel() {
  const enabledQ = useSystemSetting('server_compression_enabled');
  const rewriteQ = useSystemSetting('server_compression_pms_rewrite');
  const update = useUpdateSystemSetting();
  const stats = useCompressionStats();

  const enabled = useMemo(() => parseBool(enabledQ.data?.setting_value, true), [enabledQ.data?.setting_value]);
  const rewrite = useMemo(() => parseBool(rewriteQ.data?.setting_value, false), [rewriteQ.data?.setting_value]);

  const setBool = async (key: string, val: boolean, label: string) => {
    try {
      await update.mutateAsync({ key, value: String(val) });
      toast.success(`${label} ${val ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Failed to update: ${(err as Error).message}`);
    }
  };

  const StatRow = ({ title, t }: { title: string; t: Record<string, number> | undefined }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium min-w-24">{title}</span>
      {t ? (
        <>
          <Badge variant="secondary">pending {t.pending ?? 0}</Badge>
          <Badge variant="outline">processing {t.processing ?? 0}</Badge>
          <Badge variant="default">done {t.done ?? 0}</Badge>
          <Badge variant="outline">skipped {t.skipped ?? 0}</Badge>
          <Badge variant={t.failed ? 'destructive' : 'outline'}>failed {t.failed ?? 0}</Badge>
        </>
      ) : (
        <Skeleton className="h-5 w-40" />
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" /> Background Server Compression
        </CardTitle>
        <CardDescription>
          Re-encodes uploaded evidence images to WebP every 2 minutes via a background job.
          Originals are preserved on the storage bucket; only the active reference is rewritten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Master switch</Label>
            <p className="text-xs text-muted-foreground">
              When OFF the scheduled worker exits immediately. Pending jobs queue up for the next run.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => setBool('server_compression_enabled', v, 'Server compression')} />
        </div>

        <div className="flex items-start justify-between p-3 rounded-lg border bg-amber-50/40 dark:bg-amber-950/20">
          <div className="space-y-1">
            <Label className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Rewrite PMS evidence URLs
            </Label>
            <p className="text-xs text-muted-foreground max-w-prose">
              When ON, after a PMS image is re-encoded the original JSONB URL on review_submissions
              is replaced with the WebP URL. Default OFF — leave disabled until the queue stabilises.
              Safety evidence is always rewritten because it lives in a dedicated table.
            </p>
          </div>
          <Switch checked={rewrite} onCheckedChange={(v) => setBool('server_compression_pms_rewrite', v, 'PMS URL rewrite')} />
        </div>

        <div className="space-y-2 p-3 rounded-lg border">
          <Label className="text-sm font-semibold">Queue status</Label>
          <StatRow title="Safety" t={stats.data?.safety} />
          <StatRow title="PMS" t={stats.data?.pms} />
          <p className="text-xs text-muted-foreground">Auto-refreshes every 30s. Failures retry up to 3 times.</p>
        </div>
      </CardContent>
    </Card>
  );
}
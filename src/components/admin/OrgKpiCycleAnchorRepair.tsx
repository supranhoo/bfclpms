import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { CalendarSync, Search, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface RepairResult {
  success: boolean;
  dry_run: boolean;
  total_scanned: number;
  total_drift: number;
  total_repaired: number;
  by_frequency: Record<string, number>;
}

export function OrgKpiCycleAnchorRepair() {
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<RepairResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runRepair = async (dry: boolean) => {
    if (dry) setScanning(true); else setApplying(true);
    try {
      const { data, error } = await supabase.rpc('repair_org_kpi_cycle_anchors', { p_dry_run: dry });
      if (error) throw error;
      const r = data as unknown as RepairResult;
      setResult(r);
      toast({
        title: dry ? 'Anchor scan complete' : 'Anchor repair complete',
        description: dry
          ? `Scanned ${r.total_scanned}; ${r.total_drift} row(s) have stale cycle anchors.`
          : `Repaired ${r.total_repaired} row(s). Multi-month KPIs are now anchored to the correct cycle.`,
      });
    } catch (err: any) {
      toast({ title: dry ? 'Scan failed' : 'Repair failed', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
      setApplying(false);
      setConfirmOpen(false);
    }
  };

  const byFreq = result?.by_frequency ?? {};
  const freqEntries = Object.entries(byFreq);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSync className="h-5 w-5" />
          Repair Frequency Cycle Anchors
        </CardTitle>
        <CardDescription>
          Re-anchor multi-month Org KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) whose <code>frequency_cycle_start</code> drifted during rollover. Without this, KPIs in a new cycle (e.g. April Bi-Monthly anchored to "Feb-Mar") are silently hidden by the v2.66.7 cycle lock. Idempotent — safe to re-run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={() => runRepair(true)} disabled={scanning || applying} variant="outline">
            {scanning ? <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</> : <><Search className="h-4 w-4" /> Scan Anchors</>}
          </Button>
          {result && result.total_drift > 0 && !applying && (
            <Button onClick={() => setConfirmOpen(true)} disabled={applying}>
              <CalendarSync className="h-4 w-4" /> Repair {result.total_drift} Row(s)
            </Button>
          )}
        </div>

        {result && result.total_drift === 0 && (
          <div className="flex items-center gap-2 p-4 rounded-lg border text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>All Org KPI cycle anchors match their review periods. Nothing to repair.</span>
          </div>
        )}

        {result && (result.total_drift > 0 || result.total_repaired > 0) && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Scanned {result.total_scanned}</Badge>
              <Badge variant={result.dry_run ? 'outline' : 'default'}>
                {result.dry_run ? `${result.total_drift} drift` : `${result.total_repaired} repaired`}
              </Badge>
            </div>
            {freqEntries.length > 0 && (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">By frequency</div>
                {freqEntries.map(([freq, count]) => (
                  <div key={freq} className="flex items-center justify-between">
                    <span>{freq}</span>
                    <Badge variant="outline" className="text-xs">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onConfirm={() => runRepair(false)}
        onCancel={() => setConfirmOpen(false)}
        title={`Repair ${result?.total_drift ?? 0} cycle anchor(s)?`}
        description={`This updates kpis.frequency_cycle_start on ${result?.total_drift ?? 0} Org-level multi-month row(s) to match the cycle each row's review period belongs to. Each correction is audit-logged with action KPI_CYCLE_ANCHOR_REPAIRED. Values, status, and workflow state are not touched.`}
        confirmLabel="Repair Anchors"
        isLoading={applying}
      />
    </Card>
  );
}
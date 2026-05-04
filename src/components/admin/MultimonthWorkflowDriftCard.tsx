import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { AlertCircle, RefreshCw, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface DriftResult {
  mode: 'dry_run' | 'apply' | 'apply_detect_only';
  detected?: number;
  detected_groups?: number;
  repaired?: number;
  audit_entries_written?: number;
  samples: unknown[];
  ran_at: string;
}

/**
 * POLICY §54 v5 — Repair Multi-Month Workflow Drift.
 *
 * Surfaces sibling rows whose stored chain disagrees with the terminal's
 * effective workflow (e.g. terminal switched HR PMS → Audit after approval).
 * Dry-run first; apply only after admin confirmation.
 */
export function MultimonthWorkflowDriftCard() {
  const [busy, setBusy] = useState(false);
  const [dry, setDry] = useState<DriftResult | null>(null);
  const [freqDry, setFreqDry] = useState<DriftResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const runScan = async () => {
    setBusy(true);
    try {
      const [{ data: wfData, error: wfErr }, { data: fqData, error: fqErr }] = await Promise.all([
        supabase.rpc('repair_multimonth_workflow_drift_v5', { p_apply: false }),
        supabase.rpc('repair_sibling_frequency_drift_v5', { p_apply: false }),
      ]);
      if (wfErr) throw wfErr;
      if (fqErr) throw fqErr;
      setDry(wfData as unknown as DriftResult);
      setFreqDry(fqData as unknown as DriftResult);
      toast({
        title: 'Multi-month drift scan complete',
        description: `Workflow drift: ${(wfData as { detected?: number })?.detected ?? 0} sibling(s). Frequency drift: ${(fqData as { detected_groups?: number })?.detected_groups ?? 0} group(s).`,
      });
    } catch (e) {
      toast({ title: 'Scan failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setShowConfirm(false);
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('repair_multimonth_workflow_drift_v5', { p_apply: true });
      if (error) throw error;
      const result = data as unknown as DriftResult;
      toast({ title: 'Repair applied', description: `${result.repaired ?? 0} sibling row(s) re-stamped.` });
      setDry(result);
    } catch (e) {
      toast({ title: 'Repair failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Multi-Month Workflow Drift</CardTitle>
            <Badge variant="outline" className="text-[10px]">POLICY §54 v5</Badge>
          </div>
          <CardDescription>
            Detects approved Quarterly / Bi-Monthly / Half-Yearly / Yearly cycles whose sibling rows
            were percolated under a different reviewer chain than the terminal currently uses
            (e.g. terminal switched HR&nbsp;PMS&nbsp;→ Audit after approval). Defaults to dry-run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Button onClick={runScan} disabled={busy} size="sm" variant="outline">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? 'animate-spin' : ''}`} />
              Scan (dry-run)
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={busy || !dry || (dry.detected ?? 0) === 0}
              size="sm"
              variant="default"
            >
              <Wrench className="h-3.5 w-3.5 mr-1.5" />
              Apply repair
            </Button>
          </div>

          {dry && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>
                  Workflow drift detected: <strong>{dry.detected ?? 0}</strong> sibling row(s)
                  {dry.mode === 'apply' && <> · repaired: <strong>{dry.repaired ?? 0}</strong></>}
                </span>
              </div>
              {freqDry && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>
                    Frequency drift groups: <strong>{freqDry.detected_groups ?? 0}</strong>{' '}
                    (detection-only — remediate via Org KPI tools)
                  </span>
                </div>
              )}
              <p className="pt-1">Last run: {new Date(dry.ran_at).toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={showConfirm}
        title="Apply multi-month workflow drift repair?"
        description={`This will write BACKFILL_MULTIMONTH_PERCOLATION_V5 audit entries for ${dry?.detected ?? 0} sibling row(s) so the Review Journey renders the terminal month's chain. Final scores are NOT changed.`}
        confirmLabel="Apply repair"
        onConfirm={runApply}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { UserPlus, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLateJoinerBackfill, LateJoinerBackfillResult } from '@/hooks/useLateJoinerBackfill';

/**
 * Phase B2 — Repair UI for historical late-joiner Org KPIs created BEFORE the
 * auto-pull trigger shipped. Dry-run scan + confirmed apply.
 */
export function LateJoinerBackfillSection() {
  const [scanResult, setScanResult] = useState<LateJoinerBackfillResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const backfill = useLateJoinerBackfill();

  const handleScan = async () => {
    const result = await backfill.mutateAsync({ dryRun: true });
    setScanResult(result);
  };

  const handleApply = async () => {
    setShowConfirm(false);
    const result = await backfill.mutateAsync({ dryRun: false });
    setScanResult(result);
  };

  const processable = scanResult?.processed ?? 0;

  return (
    <>
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Repair Late-Joiner Org KPIs (Bucket K)
          </CardTitle>
          <CardDescription>
            For employees onboarded after a Data Owner clicked "Propagate". This auto-pulls
            the propagated achieved value into their submission and advances them to Self Review.
            Run scan first to preview impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleScan} disabled={backfill.isPending} variant="outline">
              <Search className="h-4 w-4 mr-2" />
              {backfill.isPending && scanResult === null ? 'Scanning…' : 'Scan Late-Joiners'}
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={backfill.isPending || processable === 0 || scanResult?.dry_run !== true}
            >
              Auto-Pull {processable} late-joiner(s)
            </Button>
          </div>

          {scanResult && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {scanResult.dry_run ? (
                  <Badge variant="secondary">Preview</Badge>
                ) : (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Applied
                  </Badge>
                )}
                <Badge variant="outline">{scanResult.processed} eligible</Badge>
                <Badge variant="outline">{scanResult.skipped} skipped</Badge>
              </div>
              {scanResult.processed === 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  No late-joiners detected. All org-level KPIs in <code>kra_set</code> have no matching propagated value.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDestructiveDialog
        open={showConfirm}
        onConfirm={handleApply}
        onCancel={() => setShowConfirm(false)}
        title={`Auto-pull ${processable} late-joiner Org KPI(s)?`}
        description={`This will pre-fill submissions with the propagated achieved value, compute self-scores from each KPI's thresholds, and advance ${processable} KPI(s) from "KRA Set" to "Self Review". Each row is audit-logged with action ORG_KPI_AUTOPULLED_FOR_LATE_JOINER and is reversible via Step Back.`}
        confirmLabel="Auto-Pull"
        isLoading={backfill.isPending}
      />
    </>
  );
}
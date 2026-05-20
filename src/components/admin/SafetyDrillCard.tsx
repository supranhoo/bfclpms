import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useSafetyDrill, type SafetyDrillResult } from '@/hooks/useSafetyDrill';
import { useLatestSafetyDrillRun } from '@/hooks/useLatestSafetyDrillRun';

export function SafetyDrillCard() {
  const drill = useSafetyDrill();
  const queryClient = useQueryClient();
  const { data: latestRun } = useLatestSafetyDrillRun();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<SafetyDrillResult | null>(null);

  const handleRun = () => {
    setConfirmOpen(false);
    drill.mutate(undefined, {
      onSuccess: (res) => {
        setLastResult(res);
        queryClient.invalidateQueries({ queryKey: ['safety-drill-runs', 'latest'] });
      },
    });
  };

  // Prefer the in-session manual result, then fall back to the persisted latest run.
  const display = lastResult
    ? {
        finished_at: lastResult.finished_at,
        ok: lastResult.ok,
        deltas: lastResult.deltas,
        errors: lastResult.errors,
        system_run: false,
      }
    : latestRun
      ? {
          finished_at: latestRun.finished_at,
          ok: latestRun.ok,
          deltas: latestRun.deltas,
          errors: latestRun.errors,
          system_run: latestRun.system_run,
        }
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Safety Backup → Restore Drill
        </CardTitle>
        <CardDescription>
          Round-trips <code>safety_incidents</code>, <code>safety_permits</code>, and{' '}
          <code>safety_audit_runs</code> through storage into the isolated{' '}
          <code>safety_drill</code> schema. Live data is never modified. Runs
          automatically every Sunday 02:00 UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {display ? (
              <>
                Last run: {format(new Date(display.finished_at), 'PPpp')}{' '}
                <Badge variant={display.ok ? 'default' : 'destructive'} className="ml-2">
                  {display.ok ? 'passed' : 'failed'}
                </Badge>
                {display.system_run && (
                  <Badge variant="outline" className="ml-2">scheduled</Badge>
                )}
              </>
            ) : (
              <>No drill runs recorded yet.</>
            )}
          </div>
          <Button onClick={() => setConfirmOpen(true)} disabled={drill.isPending}>
            {drill.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running drill…
              </>
            ) : (
              <>Run drill</>
            )}
          </Button>
        </div>

        {display && (
          <Alert variant={display.ok ? 'default' : 'destructive'}>
            {display.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>
              {display.ok ? 'Round-trip verified' : 'Drift detected'}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1 text-sm">
                {display.deltas.map((d) => (
                  <li key={d.table} className="flex items-center gap-2">
                    <span className="font-mono">{d.table}</span>
                    <span className="text-muted-foreground">
                      baseline {d.baseline} → after {d.after}
                    </span>
                    <Badge variant={d.ok ? 'secondary' : 'destructive'}>
                      {d.ok ? 'ok' : 'mismatch'}
                    </Badge>
                  </li>
                ))}
              </ul>
              {display.errors?.length ? (
                <p className="mt-2 text-destructive">
                  Errors: {display.errors.join('; ')}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Run Safety drill
            </AlertDialogTitle>
            <AlertDialogDescription>
              This seeds the isolated <code>safety_drill</code> schema with up to 5
              rows from each live Safety table, snapshots them to storage, then
              re-inserts them and verifies counts match. The live{' '}
              <code>public</code> schema is never modified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRun}>Run drill</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
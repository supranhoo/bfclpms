import { useState } from 'react';
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

export function SafetyDrillCard() {
  const drill = useSafetyDrill();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<SafetyDrillResult | null>(null);

  const handleRun = () => {
    setConfirmOpen(false);
    drill.mutate(undefined, {
      onSuccess: (res) => setLastResult(res),
    });
  };

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
          <code>safety_drill</code> schema. Live data is never modified.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {lastResult ? (
              <>
                Last run: {format(new Date(lastResult.finished_at), 'PPpp')}{' '}
                <Badge variant={lastResult.ok ? 'default' : 'destructive'} className="ml-2">
                  {lastResult.ok ? 'passed' : 'failed'}
                </Badge>
              </>
            ) : (
              <>No drill run in this session yet.</>
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

        {lastResult && (
          <Alert variant={lastResult.ok ? 'default' : 'destructive'}>
            {lastResult.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>
              {lastResult.ok ? 'Round-trip verified' : 'Drift detected'}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1 text-sm">
                {lastResult.deltas.map((d) => (
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
              {lastResult.errors?.length ? (
                <p className="mt-2 text-destructive">
                  Errors: {lastResult.errors.join('; ')}
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
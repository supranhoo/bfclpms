/**
 * ADR-232 — surfaces completed Annual Review instances that carry no stored
 * final score (the cause of blank Final Rating / Slab % cells) and lets an
 * admin / HR PMS user repair them. Presentation only: detection and the
 * recompute call live in `services/annualReview/finalScoreIntegrity`.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import {
  missingFinalScoreRows,
  recomputeFinalScores,
} from '@/services/annualReview/finalScoreIntegrity';

interface Row {
  instance_id: string;
  overall_status?: string | null;
  is_excluded?: boolean | null;
  total_score?: number | null;
  employee_code?: string | null;
  employee_name?: string | null;
}

const REASON = 'Repair: completed review finalised without a final score write-back (ADR-232).';

export function MissingFinalScoreBanner({
  rows, cycleId,
}: { rows: readonly Row[]; cycleId: string | undefined }) {
  const { effectiveRole } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const missing = useMemo(() => missingFinalScoreRows(rows), [rows]);
  const canRepair = effectiveRole === 'admin' || effectiveRole === 'hr_pms';

  if (!missing.length) return null;

  const names = missing
    .slice(0, 5)
    .map((m) => `${m.employee_code ?? '—'} ${m.employee_name ?? ''}`.trim())
    .join(', ');

  const run = async () => {
    setBusy(true);
    try {
      const res = await recomputeFinalScores({
        instanceIds: missing.map((m) => m.instance_id),
        reason: REASON,
      });
      toast.success(
        `Recomputed ${res.applied} review${res.applied === 1 ? '' : 's'}` +
          (res.skipped.length ? ` · ${res.skipped.length} skipped (no score source)` : ''),
      );
      await queryClient.invalidateQueries({ queryKey: ['annual-review-comprehensive', cycleId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not recompute the final scores.');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>{missing.length}</strong> completed review{missing.length === 1 ? ' has' : 's have'} no
          final score, so Final Rating (/5), Slab % and Rating show blank
          {names ? <> — e.g. {names}{missing.length > 5 ? ' …' : ''}</> : null}.
        </span>
      </span>
      {canRepair && (
        <>
          <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => setOpen(true)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recompute final scores
          </Button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recompute {missing.length} final score{missing.length === 1 ? '' : 's'}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The final score and rating are recalculated from the scores already recorded
                  against each review. Reviews that already hold a final score are never changed,
                  and every recomputation is written to the audit trail.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
                  Recompute
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
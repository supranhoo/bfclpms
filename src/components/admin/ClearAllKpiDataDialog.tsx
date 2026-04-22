import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const CONFIRM_PHRASE = 'DELETE ALL KPI DATA';
const COOLDOWN_SECONDS = 3;

interface ClearAllKpiDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isClearing: boolean;
}

interface RowCounts {
  kpis: number;
  submissions: number;
  reviews: number;
  imports: number;
}

export function ClearAllKpiDataDialog({
  open,
  onOpenChange,
  onConfirm,
  isClearing,
}: ClearAllKpiDataDialogProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(COOLDOWN_SECONDS);

  // Reset state whenever dialog opens/closes
  useEffect(() => {
    if (open) {
      setStage(1);
      setConfirmText('');
      setAckChecked(false);
      setCooldownLeft(COOLDOWN_SECONDS);
    }
  }, [open]);

  // Cooldown ticker for stage 1
  useEffect(() => {
    if (!open || stage !== 1 || cooldownLeft <= 0) return;
    const t = setTimeout(() => setCooldownLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, stage, cooldownLeft]);

  // Live row counts (fetched on open)
  const { data: counts, isLoading: countsLoading } = useQuery<RowCounts>({
    queryKey: ['clear-kpi-data-counts'],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const [kpis, subs, revs, imps] = await Promise.all([
        supabase.from('kpis').select('id', { count: 'exact', head: true }),
        supabase.from('review_submissions').select('id', { count: 'exact', head: true }),
        supabase.from('performance_reviews').select('id', { count: 'exact', head: true }),
        supabase.from('import_progress').select('id', { count: 'exact', head: true }),
      ]);
      return {
        kpis: kpis.count ?? 0,
        submissions: subs.count ?? 0,
        reviews: revs.count ?? 0,
        imports: imps.count ?? 0,
      };
    },
  });

  const phraseMatches = confirmText === CONFIRM_PHRASE;
  const canConfirm = phraseMatches && ackChecked && !isClearing;

  const totalRows = useMemo(
    () => (counts ? counts.kpis + counts.submissions + counts.reviews + counts.imports : 0),
    [counts],
  );

  const handleClose = (next: boolean) => {
    if (isClearing) return;
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-xl">
        {stage === 1 ? (
          <>
            <AlertDialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <AlertDialogTitle className="text-destructive">
                    Danger: This will erase all PMS data
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-2">
                    This action is irreversible. The following records will be permanently deleted across the entire organisation:
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-2 text-sm">
              {countsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating blast radius…
                </div>
              ) : (
                <ul className="space-y-1.5">
                  <li className="flex items-center justify-between">
                    <span>KPIs</span>
                    <span className="font-mono font-semibold text-destructive">
                      {counts?.kpis.toLocaleString() ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Review submissions</span>
                    <span className="font-mono font-semibold text-destructive">
                      {counts?.submissions.toLocaleString() ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Performance reviews</span>
                    <span className="font-mono font-semibold text-destructive">
                      {counts?.reviews.toLocaleString() ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>Import progress logs</span>
                    <span className="font-mono font-semibold text-destructive">
                      {counts?.imports.toLocaleString() ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between border-t border-destructive/30 pt-2 mt-2">
                    <span className="font-semibold">Total rows</span>
                    <span className="font-mono font-bold text-destructive">
                      {totalRows.toLocaleString()}
                    </span>
                  </li>
                </ul>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                Sub-period evidence, KPI observations, queries and audit references attached to these
                records will also be cascaded as configured by the database.
              </p>
            </div>

            <AlertDialogFooter className="mt-2">
              <Button variant="outline" onClick={() => handleClose(false)} autoFocus>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={cooldownLeft > 0 || countsLoading}
                onClick={() => setStage(2)}
              >
                {cooldownLeft > 0
                  ? `I understand, continue (${cooldownLeft}s)`
                  : 'I understand, continue'}
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <ShieldAlert className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <AlertDialogTitle className="text-destructive">
                    Final confirmation required
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-2">
                    To proceed, type the phrase below exactly and acknowledge responsibility.
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-phrase">
                  Type <span className="font-mono font-semibold text-destructive">{CONFIRM_PHRASE}</span> to confirm
                </Label>
                <Input
                  id="confirm-phrase"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isClearing}
                  className={
                    confirmText && !phraseMatches
                      ? 'border-destructive focus-visible:ring-destructive'
                      : ''
                  }
                />
                {confirmText && !phraseMatches && (
                  <p className="text-xs text-destructive">Phrase does not match exactly (case-sensitive).</p>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
                <Checkbox
                  id="ack-responsibility"
                  checked={ackChecked}
                  onCheckedChange={(c) => setAckChecked(c === true)}
                  disabled={isClearing}
                  className="mt-0.5"
                />
                <Label htmlFor="ack-responsibility" className="cursor-pointer text-sm leading-snug">
                  I have taken a backup or accept full responsibility for this irreversible action.
                </Label>
              </div>
            </div>

            <AlertDialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setStage(1)} disabled={isClearing}>
                Back
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isClearing}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={!canConfirm} onClick={onConfirm}>
                {isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  'Permanently Delete'
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * ADR-217 — Admin correction of System Score raw values from the review page.
 *
 * Admin-only. Edits the RAW achievement value (LTI count, 5S %, trainings…)
 * and derives appraisal points from the template bands via `scoreFromRaw`.
 * Corrections are allowed in both directions and on completed reviews; a
 * reason is mandatory and every change is audit-logged server-side.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TemplateSystemScore } from '@/types/annualReview';
import {
  adminUpdateSystemScoresRaw, buildEditPayload, editableSystemScoreSlots, pointsForRaw,
} from '@/services/annualReview/adminSystemScores';
import { annualReviewKeys } from '@/hooks/useAnnualReview';

export interface AdminSystemScoresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  employeeLabel?: string;
  overallStatus?: string;
  systemScores: TemplateSystemScore[];
  storedRaw: Record<string, number>;
  storedPoints: Record<string, number>;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');

export function AdminSystemScoresDialog({
  open, onOpenChange, instanceId, employeeLabel, overallStatus,
  systemScores, storedRaw, storedPoints,
}: AdminSystemScoresDialogProps) {
  const slots = useMemo(() => editableSystemScoreSlots(systemScores), [systemScores]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const qc = useQueryClient();

  const payload = useMemo(
    () => buildEditPayload({ instanceId, slots, storedRaw, drafts, reason }),
    [instanceId, slots, storedRaw, drafts, reason],
  );
  const changedCount = Object.keys(payload.raw).length;
  const isCompleted = overallStatus === 'completed';

  const save = useMutation({
    mutationFn: () => adminUpdateSystemScoresRaw(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: annualReviewKeys.all });
      toast.success(
        res?.changed
          ? `System scores updated${res.total_score != null ? ` — final score ${Number(res.total_score).toFixed(2)}` : ''}`
          : 'No changes to apply',
      );
      setDrafts({});
      setReason('');
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update system scores'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update System Scores — {employeeLabel ?? 'Employee'}</DialogTitle>
          <DialogDescription>
            Enter the measured achievement value. Appraisal points are derived from the
            template scoring bands. All changes are audit-logged.
          </DialogDescription>
        </DialogHeader>

        {isCompleted && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This review is already completed</AlertTitle>
            <AlertDescription>
              Saving will recompute the final score, final rating and increment slab
              for this employee.
            </AlertDescription>
          </Alert>
        )}

        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This template has no editable System Score items.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {slots.map((s) => {
              const currentRaw = storedRaw?.[s.id];
              const entered = drafts[s.id];
              const effective = entered !== undefined && entered !== ''
                ? Number(entered)
                : (currentRaw ?? null);
              const preview = effective !== null && Number.isFinite(effective)
                ? pointsForRaw(s, Number(effective))
                : null;
              const changed = payload.raw[s.id] !== undefined;
              return (
                <div key={s.id} className="space-y-2 rounded-lg border p-3">
                  <Label htmlFor={`sys-${s.id}`} className="text-sm font-medium">
                    {s.name}
                  </Label>
                  <Input
                    id={`sys-${s.id}`}
                    type="number"
                    step="any"
                    className="h-10"
                    placeholder={currentRaw !== undefined && currentRaw !== null ? String(currentRaw) : 'Not entered'}
                    value={entered ?? (currentRaw !== undefined && currentRaw !== null ? String(currentRaw) : '')}
                    onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {currentRaw ?? '—'} → {fmt(storedPoints?.[s.id] ?? 0)} / {s.weight} pts
                  </p>
                  <p className={`text-xs ${changed ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    New: {preview ? `${fmt(preview.rating)} /5 → ${fmt(preview.points)} / ${s.weight} pts` : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="sys-reason">Reason for correction (required)</Label>
          <Textarea
            id="sys-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. 5S departmental score restated by Safety team on 30 Jul 2026"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={changedCount === 0 || reason.trim().length === 0 || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save {changedCount > 0 ? `${changedCount} change${changedCount > 1 ? 's' : ''}` : 'changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

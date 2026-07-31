import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, TriangleAlert } from 'lucide-react';
import {
  DEFAULT_RATING_SLABS, formatRating5, formatSlabPercent, resolveSlabPercent, type RatingSlab,
} from '@/lib/annualReview/ratingSlab';
import {
  bulkCalibrateFinalRating, calibrateFinalRating, clearFinalRatingCalibration,
} from '@/services/annualReview/calibration';

export interface CalibrationTarget {
  instance_id: string;
  employee_name: string | null;
  employee_code?: string | null;
  computed_rating: number | null;
  calibrated_rating?: number | null;
}

/**
 * ADR-220 — admin-only calibration of the Annual Review Final Rating (/5).
 * Handles both a single employee and a bulk selection with the same form.
 */
export function CalibrateRatingDialog({
  open, onOpenChange, targets, slabs = DEFAULT_RATING_SLABS, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targets: CalibrationTarget[];
  slabs?: ReadonlyArray<RatingSlab>;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const single = targets.length === 1 ? targets[0] : null;
  const [rating, setRating] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(
      single?.calibrated_rating !== null && single?.calibrated_rating !== undefined
        ? String(single.calibrated_rating)
        : single?.computed_rating !== null && single?.computed_rating !== undefined
          ? String(single.computed_rating)
          : '',
    );
    setReason('');
  }, [open, single]);

  const parsed = useMemo(() => {
    const n = Number(rating);
    return rating.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
  }, [rating]);

  const invalidateReports = () => {
    qc.invalidateQueries({ queryKey: ['annual-review-comprehensive'] });
    qc.invalidateQueries({ queryKey: ['annual-review-report'] });
    qc.invalidateQueries({ queryKey: ['annual-review-instance'] });
  };

  const save = async () => {
    if (parsed === null) { toast.error('Enter a rating between 0 and 5'); return; }
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setSaving(true);
    try {
      if (single) {
        await calibrateFinalRating(single.instance_id, parsed, reason);
        toast.success(`Calibrated ${single.employee_name ?? 'employee'} to ${parsed.toFixed(2)}`);
      } else {
        const n = await bulkCalibrateFinalRating(targets.map((t) => t.instance_id), parsed, reason);
        toast.success(`Calibrated ${n} employees to ${parsed.toFixed(2)}`);
      }
      invalidateReports();
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Calibration failed');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!single) return;
    if (!reason.trim()) { toast.error('A reason is required to clear a calibration'); return; }
    setSaving(true);
    try {
      await clearFinalRatingCalibration(single.instance_id, reason);
      toast.success('Calibration cleared — the computed rating applies again');
      invalidateReports();
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear calibration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calibrate final rating</DialogTitle>
          <DialogDescription>
            {single
              ? `${single.employee_name ?? 'Employee'}${single.employee_code ? ` (${single.employee_code})` : ''}`
              : `${targets.length} employees selected`}
            {' — '}the computed score is never overwritten; the calibrated rating drives the slab and every report.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {single && (
            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Computed rating</p>
                <p className="font-medium tabular-nums">{formatRating5(single.computed_rating)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Computed slab</p>
                <p className="font-medium tabular-nums">
                  {formatSlabPercent(resolveSlabPercent(single.computed_rating, slabs))}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="calibrated-rating">Calibrated rating (out of 5)</Label>
            <Input
              id="calibrated-rating"
              inputMode="decimal"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              placeholder="e.g. 3.60"
              className="h-10"
            />
            {rating.trim() !== '' && parsed === null && (
              <p className="text-xs text-destructive">Enter a number between 0 and 5.</p>
            )}
            {parsed !== null && (
              <p className="text-xs text-muted-foreground">
                Resulting slab: <span className="font-medium tabular-nums">{formatSlabPercent(resolveSlabPercent(parsed, slabs))}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calibration-reason">Reason (required)</Label>
            <Textarea
              id="calibration-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this rating being calibrated?"
              rows={3}
            />
          </div>

          <p className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Calibration changes the rating and increment slab shown in the Annual Review report,
            the Bell Curve analysis and the employee's review page. Every change is logged.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {single && single.calibrated_rating !== null && single.calibrated_rating !== undefined ? (
            <Button variant="destructive" onClick={clear} disabled={saving} className="h-10">
              Clear calibration
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="h-10">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || parsed === null || !reason.trim()} className="h-10">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {single ? 'Save calibration' : `Calibrate ${targets.length}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

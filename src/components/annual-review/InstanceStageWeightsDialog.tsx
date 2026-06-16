import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StageWeightsEditor } from './StageWeightsEditor';
import { isValidStageWeights, resolveStageWeights, type StageWeights } from '@/lib/annualReview/finalScore';
import * as svc from '@/services/annualReview/annualReviewService';
import type { AnnualReviewInstance, AnnualReviewTemplate } from '@/types/annualReview';

/**
 * Per-employee override editor for the final-score weight blend (Phase 2).
 * Reason is mandatory; the change is audit-logged server-side.
 * Admin / HR PMS only — enforced by the RPC.
 */
export function InstanceStageWeightsDialog({
  open,
  onOpenChange,
  instance,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Pick<AnnualReviewInstance, 'id' | 'stage_weights_override'> | null;
  template: AnnualReviewTemplate | null;
  onSaved?: () => void;
}) {
  const [weights, setWeights] = useState<StageWeights>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && instance) {
      // Seed with the effective resolved blend so the user sees the current basis.
      setWeights(resolveStageWeights(instance as AnnualReviewInstance, template));
      setReason('');
    }
  }, [open, instance, template]);

  const valid = isValidStageWeights(weights);
  const reasonOk = reason.trim().length >= 3;

  const submit = async (clear: boolean) => {
    if (!instance) return;
    if (!reasonOk) { toast.error('Reason is required (min 3 chars).'); return; }
    if (!clear && !valid) { toast.error('Weights must sum to exactly 100%.'); return; }
    setSaving(true);
    try {
      await svc.setInstanceStageWeightsOverride({
        instanceId: instance.id,
        weights: clear ? null : weights,
        reason: reason.trim(),
      });
      toast.success(clear ? 'Override cleared — template default restored.' : 'Custom weights applied.');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Customise final score weights</DialogTitle>
          <DialogDescription>
            Override the template\u2019s blend for this employee only. Audit-logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <StageWeightsEditor
            value={weights}
            onChange={setWeights}
            helperText="Example: Self 20% \u00b7 Manager (R1) 50% \u00b7 BU head 30%. Disable a stage by leaving it blank or 0."
          />

          <div className="grid gap-2">
            <Label>Reason for override <span className="text-destructive">*</span></Label>
            <Textarea
              rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this employee need a different weight blend?"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="outline"
            disabled={saving || !instance?.stage_weights_override || !reasonOk}
            onClick={() => submit(true)}
          >
            Clear override
          </Button>
          <Button disabled={saving || !valid || !reasonOk} onClick={() => submit(false)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
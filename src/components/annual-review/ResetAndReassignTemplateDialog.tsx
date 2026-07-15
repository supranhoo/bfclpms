import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTemplates } from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

/**
 * Single-employee destructive reset + template swap for instances that are
 * already past `pending_self`. Wraps `bulkForceResetInstances` (n=1). Archives
 * the employee's + reviewers' responses, wipes them, swaps the template, and
 * restarts the instance at `pending_self`. Audit-logged server-side as
 * `annual_review.instance_force_reset`.
 */
export function ResetAndReassignTemplateDialog({
  instance, onClose, onDone,
}: {
  instance: InstanceWithEmployee | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: templates = [] } = useTemplates();
  const activeTemplates = useMemo(() => templates.filter((t) => t.is_active), [templates]);
  const [tplId, setTplId] = useState('');
  const [reason, setReason] = useState('');
  const [gate, setGate] = useState('');
  const qc = useQueryClient();

  const currentId = svc.resolveTemplateId(instance) ?? '';
  const currentName = activeTemplates.find((t) => t.id === currentId)?.name
    ?? templates.find((t) => t.id === currentId)?.name ?? '—';

  // Reset local state when opening on a new instance.
  useEffect(() => {
    setTplId('');
    setReason('');
    setGate('');
  }, [instance?.id]);

  const reset = useMutation({
    mutationFn: async () => {
      if (!instance) throw new Error('No instance');
      const res = await svc.bulkForceResetInstances(
        [{ instanceId: instance.id, templateId: tplId }],
        reason.trim(),
      );
      if (res.failed.length > 0) throw new Error(res.failed[0].error);
      return res;
    },
    onSuccess: () => {
      toast.success('Instance reset. Employee can now re-submit the self-review.');
      qc.invalidateQueries({ queryKey: ['annual-review'] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!tplId &&
    reason.trim().length >= 10 &&
    gate.trim().toUpperCase() === 'RESET' &&
    !reset.isPending;

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && !reset.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reset &amp; reassign template
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                <strong>{instance?.employee?.full_name ?? '—'}</strong> is past the
                self-review stage (<code>{instance?.overall_status}</code>). This action
                will:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Archive every response saved by the employee and reviewers</li>
                <li>Wipe the current responses on this instance</li>
                <li>Swap the template to the one selected below</li>
                <li>Restart the instance at <code>pending_self</code> so the employee re-fills the form</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Archived data remains readable in the audit archive. Action is audit-logged.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Current template: <span className="font-medium text-foreground">{currentName}</span>
          </div>

          <div className="space-y-1">
            <Label>New template</Label>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {activeTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reason (min 10 chars)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Employee role changed; earlier self-review is invalid and needs to be redone on the new template."
            />
          </div>

          <div className="space-y-1">
            <Label>Type <code>RESET</code> to confirm</Label>
            <Input value={gate} onChange={(e) => setGate(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={reset.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!canSubmit}
            onClick={(e) => { e.preventDefault(); reset.mutate(); }}
          >
            {reset.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reset &amp; reassign
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ResetAndReassignTemplateDialog;
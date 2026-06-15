import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import type { AnnualReviewerRole } from '@/types/annualReview';
import { enabledChain, describeChain } from '@/lib/annualReview/stageChain';

/**
 * Per-employee workflow override dialog.
 * Admin / hr_pms only. RPC enforces stage gate, role, and audit log.
 * Allowed only while instance is `not_started` or `pending_self`.
 */
const TOGGLABLE: Array<{ key: AnnualReviewerRole; label: string }> = [
  { key: 'manager',      label: 'Manager Review' },
  { key: 'skip_manager', label: 'Skip Manager Review' },
  { key: 'bu_head',      label: 'BU Head Review' },
  { key: 'hr',           label: 'HR Finalization' },
];

export function ChangeWorkflowDialog({
  instance, onClose, onDone,
}: {
  instance: InstanceWithEmployee | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = enabledChain(instance?.enabled_stages);
  const [enabled, setEnabled] = useState<Set<AnnualReviewerRole>>(new Set(current));
  const [reason, setReason] = useState('');

  useEffect(() => {
    setEnabled(new Set(enabledChain(instance?.enabled_stages)));
    setReason('');
  }, [instance?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = enabledChain(Array.from(enabled));
  const isDirty = JSON.stringify(next) !== JSON.stringify(current);

  const save = useMutation({
    mutationFn: () => {
      if (!instance) throw new Error('No instance');
      return svc.setEnabledStages({
        instanceId: instance.id,
        enabledStages: next,
        reason: reason.trim(),
      });
    },
    onSuccess: () => { toast.success('Workflow updated.'); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: AnnualReviewerRole) => {
    const ns = new Set(enabled);
    ns.has(key) ? ns.delete(key) : ns.add(key);
    ns.add('self');
    setEnabled(ns);
  };

  const canSave = isDirty && reason.trim().length >= 3 && enabled.has('self');

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change workflow</AlertDialogTitle>
          <AlertDialogDescription>
            Pick which review stages apply to <strong>{instance?.employee?.full_name ?? '—'}</strong> for
            this cycle only. <em>Self Review</em> is mandatory. Allowed before the review starts. The
            change is audit-logged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Current chain: <span className="font-medium text-foreground">{describeChain(current)}</span>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 opacity-70">
              <Checkbox checked disabled aria-label="Self review (always required)" />
              <span className="text-sm">Self Review</span>
              <Badge variant="outline" className="ml-auto">Required</Badge>
            </div>
            {TOGGLABLE.map((s) => (
              <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={enabled.has(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                  aria-label={s.label}
                />
                <span className="text-sm">{s.label}</span>
              </label>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            New chain: <span className="font-medium text-foreground">{describeChain(next)}</span>
          </div>
          <div className="space-y-1">
            <Label>Reason (min 3 chars)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why does this employee need a different workflow?"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); save.mutate(); }}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
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
import { AlertTriangle } from 'lucide-react';

/**
 * Per-employee workflow override dialog.
 * Admin / hr_pms only. RPC enforces stage gate, role, and audit log.
 * Allowed pre-start, or while no reviewer has yet submitted (no responses).
 * Any stage (including Self) may be disabled — chain must keep ≥1 stage.
 */
const TOGGLABLE: Array<{ key: AnnualReviewerRole; label: string }> = [
  { key: 'self',         label: 'Self Review' },
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

  const hasAny = enabled.size > 0;
  const next = hasAny ? enabledChain(Array.from(enabled)) : [];
  const isDirty = JSON.stringify(next) !== JSON.stringify(current);
  const selfDisabled = hasAny && !enabled.has('self');
  const firstStageLabel = next[0]
    ? ({ self: 'Self', manager: 'Manager', skip_manager: 'Skip Manager', bu_head: 'BU Head', hr: 'HR' } as const)[next[0]]
    : '—';

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
    if (ns.has(key)) ns.delete(key); else ns.add(key);
    setEnabled(ns);
  };

  const canSave = isDirty && reason.trim().length >= 3 && hasAny;

  return (
    <AlertDialog open={!!instance} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change workflow</AlertDialogTitle>
          <AlertDialogDescription>
            Pick which review stages apply to <strong>{instance?.employee?.full_name ?? '—'}</strong> for
            this cycle only. Any stage may be disabled but at least one stage must remain.
            Allowed before the review starts or while no reviewer has acted. The change is audit-logged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Current chain: <span className="font-medium text-foreground">{describeChain(current)}</span>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            {TOGGLABLE.map((s) => (
              <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={enabled.has(s.key)}
                  onCheckedChange={() => toggle(s.key)}
                  aria-label={s.label}
                />
                <span className="text-sm">{s.label}</span>
                {s.key === 'self' && (
                  <Badge variant="outline" className="ml-auto">Optional</Badge>
                )}
              </label>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            New chain: <span className="font-medium text-foreground">{hasAny ? describeChain(next) : '— (at least one stage required)'}</span>
          </div>
          {selfDisabled && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Self Review is disabled — <strong>{instance?.employee?.full_name ?? 'the employee'}</strong> will
                not submit self ratings; the cycle starts at <strong>{firstStageLabel}</strong>.
              </span>
            </div>
          )}
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
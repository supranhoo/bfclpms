/**
 * ADR-302 — the approval ladder, rendered in order.
 *
 * Reads the effective chain plus the immutable decision trail and shows, per
 * step, who holds it, what they decided and when. Approve / Send back appear
 * only for the actor whose step is current (mirrors `org_kpi_decide`).
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Clock, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrgKpiDecide } from '@/hooks/useOrgKpiCentralWorkflow';
import {
  ageingDays, canDecide, formatAgeing, stepHolderLabel, stepStatus,
  type CentralActor, type CentralChainStep, type CentralDecision, type CentralValueRow,
} from '@/lib/review/centralApprovalModel';

interface Props {
  steps: CentralChainStep[];
  row: CentralValueRow | null;
  decisions: CentralDecision[];
  actor: CentralActor;
  isLoading?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  done: { label: 'Done', variant: 'secondary' },
  current: { label: 'Here now', variant: 'default' },
  sent_back: { label: 'Sent back', variant: 'destructive' },
  pending: { label: 'Waiting', variant: 'outline' },
};

export function CentralApprovalRail({ steps, row, decisions, actor, isLoading }: Props) {
  const { toast } = useToast();
  const decideMut = useOrgKpiDecide();
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No approval steps are configured yet, so a submitted value is approved immediately.
      </p>
    );
  }

  const mayDecide = !!row && canDecide(steps, row, actor);

  const runDecision = async (decision: 'approved' | 'sent_back', comment: string | null) => {
    if (!row) return;
    const dry = await decideMut.mutateAsync({ okvId: row.id, decision, comment, dryRun: true });
    if (dry?.ok === false) {
      toast({
        title: 'Cannot record this decision',
        description: String(dry.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    const res = await decideMut.mutateAsync({ okvId: row.id, decision, comment, dryRun: false });
    if (res?.ok === false) {
      toast({
        title: 'Cannot record this decision',
        description: String(res.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    setSendBackOpen(false);
    setReason('');
    toast({
      title: decision === 'approved' ? 'Approved' : 'Sent back to the data provider',
      description:
        decision === 'approved' && res?.applied !== undefined
          ? `Propagated to ${res.applied} employee${res.applied === 1 ? '' : 's'}` +
            (res.skipped ? `, ${res.skipped} skipped.` : '.')
          : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map(step => {
          const status = stepStatus(step, row, decisions);
          const last = decisions
            .filter(d => d.step_no === step.step_no)
            .slice(-1)[0];
          const badge = STATUS_BADGE[status];
          const waiting =
            status === 'current' && step.step_kind === 'approver'
              ? formatAgeing(ageingDays(lastMovedAt(row, decisions)))
              : '';
          return (
            <li
              key={step.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {step.step_no}
              </span>
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">{stepHolderLabel(step)}</span>
              <Badge variant={badge.variant} className="ml-auto">
                {status === 'done' && <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />}
                {status === 'current' && <Clock className="mr-1 h-3 w-3" aria-hidden />}
                {status === 'sent_back' && <Undo2 className="mr-1 h-3 w-3" aria-hidden />}
                {badge.label}
                {waiting ? ` · ${waiting}` : ''}
              </Badge>
              {last && (
                <p className="w-full text-xs text-muted-foreground">
                  {last.decision.replace(/_/g, ' ')} on{' '}
                  {new Date(last.decided_at).toLocaleString()}
                  {last.comment ? ` — ${last.comment}` : ''}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {mayDecide && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          {!sendBackOpen ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-10"
                onClick={() => runDecision('approved', null)}
                disabled={decideMut.isPending}
              >
                {decideMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Approve this step
              </Button>
              <Button
                className="h-10"
                variant="outline"
                onClick={() => setSendBackOpen(true)}
                disabled={decideMut.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Send back
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="central-send-back-reason">Reason for sending back</Label>
              <Textarea
                id="central-send-back-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Tell the data provider what needs to change"
              />
              {reason.trim() === '' && (
                <p className="text-xs text-destructive">A reason is required to send a value back.</p>
              )}
              <div className="flex gap-2">
                <Button
                  className="h-10"
                  variant="destructive"
                  disabled={reason.trim() === '' || decideMut.isPending}
                  onClick={() => runDecision('sent_back', reason.trim())}
                >
                  {decideMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Send back to provider
                </Button>
                <Button
                  className="h-10"
                  variant="ghost"
                  onClick={() => { setSendBackOpen(false); setReason(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** When the row last changed hands — submission, or the newest decision. */
function lastMovedAt(row: CentralValueRow | null, decisions: CentralDecision[]): string | null {
  const last = decisions[decisions.length - 1];
  return last?.decided_at ?? row?.submitted_at ?? null;
}

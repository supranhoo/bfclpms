import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { formatActual, formatExpected } from '@/lib/annualReview/eligibilityFormat';
import type { EffectiveEligibility } from '@/lib/annualReview/effectiveEligibility';
import { useExemptionMutations } from '@/hooks/annualReview/useEligibilityExemptions';

/**
 * ADR-221 — request / approve / reject an eligibility exemption.
 * Non-exemptable criteria (disciplinary action, month-completion window) are
 * shown but locked; the database guard rejects them too.
 */
export function ExemptionDialog({
  open, onOpenChange, instanceId, cycleId, employeeId, employeeName, result, canApprove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instanceId: string;
  cycleId?: string | null;
  employeeId?: string | null;
  employeeName: string;
  result: EffectiveEligibility;
  canApprove: boolean;
}) {
  const { request, decide, revoke } = useExemptionMutations(cycleId ?? undefined);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const busy = request.isPending || decide.isPending || revoke.isPending;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message || 'Action failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Eligibility exemption — {employeeName}</DialogTitle>
          <DialogDescription>
            Absent days and LWP can be exempted with an approved reason. Disciplinary action and the
            service / month-completion window can never be exempted.
          </DialogDescription>
        </DialogHeader>

        {result.failures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failing eligibility criteria for this employee.</p>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {result.failures.map((f) => {
              const ex = f.exemption;
              return (
                <div key={f.criterion.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{f.criterion.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatActual(f.actual, f.criterion.type)} (needs {formatExpected(f.criterion)})
                    </span>
                    {!f.exemptable && <Badge variant="destructive" className="text-[10px]">Not exemptable</Badge>}
                    {ex && <Badge variant="outline" className="text-[10px] capitalize">{ex.status}</Badge>}
                  </div>

                  {f.exemptable && ex?.status !== 'approved' && (
                    <div className="space-y-2">
                      <Label className="text-xs" htmlFor={`reason-${f.criterion.id}`}>Reason</Label>
                      <Textarea
                        id={`reason-${f.criterion.id}`}
                        rows={2}
                        placeholder="Why should this criterion be waived?"
                        value={reasons[f.criterion.id] ?? ex?.reason ?? ''}
                        onChange={(e) => setReasons((s) => ({ ...s, [f.criterion.id]: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm" variant="outline" disabled={busy}
                          onClick={() => {
                            const reason = (reasons[f.criterion.id] ?? ex?.reason ?? '').trim();
                            if (!reason) { toast.error('A reason is required'); return; }
                            run(() => request.mutateAsync({
                              instance_id: instanceId, cycle_id: cycleId, employee_id: employeeId,
                              criterion_id: f.criterion.id, criterion_name: f.criterion.name, reason,
                            }), 'Exemption requested');
                          }}
                        >
                          Request exemption
                        </Button>
                        {canApprove && (
                          <Button
                            size="sm" className="gap-1" disabled={busy}
                            onClick={() => {
                              const reason = (reasons[f.criterion.id] ?? ex?.reason ?? '').trim();
                              if (!reason) { toast.error('A reason is required'); return; }
                              if (ex?.id) {
                                run(() => decide.mutateAsync({ id: ex.id!, status: 'approved', note: reason }), 'Exemption approved');
                              } else {
                                run(() => request.mutateAsync({
                                  instance_id: instanceId, cycle_id: cycleId, employee_id: employeeId,
                                  criterion_id: f.criterion.id, criterion_name: f.criterion.name, reason, approve: true,
                                }), 'Exemption approved');
                              }
                            }}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {canApprove && ex?.id && ex.status === 'pending' && (
                          <Button
                            size="sm" variant="ghost" className="gap-1" disabled={busy}
                            onClick={() => run(
                              () => decide.mutateAsync({ id: ex.id!, status: 'rejected', note: reasons[f.criterion.id] }),
                              'Exemption rejected',
                            )}
                          >
                            <ShieldX className="h-3.5 w-3.5" /> Reject
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {ex?.status === 'approved' && (
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>Waived{ex.reason ? ` — ${ex.reason}` : ''}</span>
                      {canApprove && ex.id && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy}
                          onClick={() => run(() => revoke.mutateAsync(ex.id!), 'Exemption revoked')}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}

                  {!f.exemptable && (
                    <p className="text-xs text-muted-foreground">
                      Policy blocks exemptions for this criterion.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
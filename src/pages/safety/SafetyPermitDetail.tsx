import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, FileSignature, Loader2, CheckCircle2, XCircle, PauseCircle,
  PlayCircle, Lock, Send, AlertTriangle, ShieldCheck, ListChecks,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  useSafetyPermit, useSafetyPermitApprovals, useSafetyPermitHira, useSafetyPermitLotoSteps,
  useSubmitPermit, useDecidePermitLevel, useActivatePermit, useSuspendPermit, useClosePermit,
} from '@/hooks/useSafetyPermits';
import {
  SAFETY_PERMIT_TYPE_LABEL, isPermitTerminal,
} from '@/lib/safetyPermits';
import { SAFETY_ROLE_LABEL } from '@/lib/safetyRoles';
import { PermitStatusBadge } from '@/components/safety/PermitStatusBadge';
import { useMySafetyRoles } from '@/hooks/useSafetyRoles';
import { useAuth } from '@/contexts/AuthContext';
import { SafetySkeletonBlock } from '@/components/safety/SafetySkeletonBlock';

/**
 * Permit detail — single source for inspecting and acting on a permit.
 * All mutating actions go through RPCs and refresh the cache via the
 * mutation `onSuccess` paths. UI affordances are role-gated client-side
 * (server-side checks are still authoritative).
 */
export default function SafetyPermitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: roles = [] } = useMySafetyRoles();

  const { data: permit, isLoading, error } = useSafetyPermit(id);
  const { data: approvals = [] } = useSafetyPermitApprovals(id);
  const { data: hira = [] } = useSafetyPermitHira(id);
  const { data: loto = [] } = useSafetyPermitLotoSteps(id);

  const submit = useSubmitPermit();
  const decide = useDecidePermitLevel();
  const activate = useActivatePermit();
  const suspend = useSuspendPermit();
  const close = useClosePermit();

  const [actionDialog, setActionDialog] = useState<null | 'approve' | 'reject' | 'suspend' | 'close'>(null);
  const [actionNotes, setActionNotes] = useState('');

  if (isLoading) {
    return (
      <SafetySkeletonBlock variant="detail" />
    );
  }
  if (error || !permit) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-10 text-center space-y-2">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Permit not found or you don't have access.
          </p>
          <Button variant="outline" asChild>
            <Link to="/safety/permits"><ArrowLeft className="h-4 w-4 mr-2" /> Back</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isOwner = user?.id === permit.requested_by;
  const currentApproval = approvals.find((a) => a.level === permit.current_level && a.decision == null);
  const canApproveCurrent =
    !!currentApproval && roles.includes(currentApproval.approver_role);

  const canSubmit = permit.status === 'draft' && isOwner;
  const canActivate = permit.status === 'approved'; // server validates time window + asset checks
  const canSuspend = permit.status === 'active';
  const canClose = permit.status === 'active' || permit.status === 'suspended';

  const openDialog = (kind: 'approve' | 'reject' | 'suspend' | 'close') => {
    setActionNotes('');
    setActionDialog(kind);
  };

  const runAction = async () => {
    if (!permit) return;
    try {
      if (actionDialog === 'approve') {
        await decide.mutateAsync({ permitId: permit.id, decision: 'approved', notes: actionNotes });
        toast.success('Approval recorded');
      } else if (actionDialog === 'reject') {
        if (actionNotes.trim().length < 5) { toast.error('Rejection reason is required'); return; }
        await decide.mutateAsync({ permitId: permit.id, decision: 'rejected', notes: actionNotes });
        toast.success('Permit rejected');
      } else if (actionDialog === 'suspend') {
        if (actionNotes.trim().length < 5) { toast.error('Suspension reason is required'); return; }
        await suspend.mutateAsync({ permitId: permit.id, reason: actionNotes });
        toast.success('Permit suspended');
      } else if (actionDialog === 'close') {
        await close.mutateAsync({ permitId: permit.id, notes: actionNotes });
        toast.success('Permit closed');
      }
      setActionDialog(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Action failed');
    }
  };

  const onSubmitForApproval = async () => {
    try {
      await submit.mutateAsync(permit.id);
      toast.success('Submitted for approval');
    } catch (e: any) {
      toast.error(e?.message ?? 'Submission failed');
    }
  };

  const onActivate = async () => {
    try {
      await activate.mutateAsync(permit.id);
      toast.success('Permit activated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Activation failed');
    }
  };

  const busy =
    submit.isPending || decide.isPending || activate.isPending ||
    suspend.isPending || close.isPending;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/safety/permits')}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to permits
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {permit.permit_number ?? 'Draft permit'} · {SAFETY_PERMIT_TYPE_LABEL[permit.permit_type]}
                </CardTitle>
                <CardDescription>
                  {permit.location} · {format(new Date(permit.start_at), 'dd MMM yyyy HH:mm')} → {format(new Date(permit.end_at), 'dd MMM yyyy HH:mm')}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PermitStatusBadge status={permit.status} />
              <Badge variant="outline">L{permit.current_level}/{permit.total_levels}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Scope</div>
            <p className="text-sm whitespace-pre-wrap">{permit.scope}</p>
          </div>
          {permit.hira_summary && (
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">HIRA Summary</div>
              <p className="text-sm whitespace-pre-wrap">{permit.hira_summary}</p>
            </div>
          )}
          {permit.rejection_reason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <strong>Rejected:</strong> {permit.rejection_reason}
            </div>
          )}
          {permit.suspended_reason && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <strong>Suspended:</strong> {permit.suspended_reason}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {canSubmit && (
              <Button onClick={onSubmitForApproval} disabled={busy}>
                {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit for Approval
              </Button>
            )}
            {canApproveCurrent && (
              <>
                <Button onClick={() => openDialog('approve')} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve L{permit.current_level}
                </Button>
                <Button variant="destructive" onClick={() => openDialog('reject')} disabled={busy}>
                  <XCircle className="h-4 w-4 mr-2" /> Reject
                </Button>
              </>
            )}
            {canActivate && (
              <Button onClick={onActivate} disabled={busy}>
                {activate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Activate
              </Button>
            )}
            {canSuspend && (
              <Button variant="outline" onClick={() => openDialog('suspend')} disabled={busy}>
                <PauseCircle className="h-4 w-4 mr-2" /> Suspend
              </Button>
            )}
            {canClose && (
              <Button variant="secondary" onClick={() => openDialog('close')} disabled={busy}>
                <Lock className="h-4 w-4 mr-2" /> Close Permit
              </Button>
            )}
            {isPermitTerminal(permit.status) && (
              <Badge variant="outline">Lifecycle complete</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approval Ladder
          </CardTitle>
          <CardDescription>
            Materialised from the type configuration when the permit was submitted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              The ladder will appear after the permit is submitted.
            </p>
          ) : (
            <div className="space-y-2">
              {approvals.map((a) => {
                const isCurrent = a.level === permit.current_level && a.decision == null;
                const isApproved = a.decision === 'approved';
                const isRejected = a.decision === 'rejected';
                return (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between rounded-md border p-3 ${
                      isCurrent ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-mono w-8 text-muted-foreground">L{a.level}</div>
                      <div>
                        <div className="text-sm font-medium">{SAFETY_ROLE_LABEL[a.approver_role]}</div>
                        {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      {isApproved && <Badge variant="default">Approved</Badge>}
                      {isRejected && <Badge variant="destructive">Rejected</Badge>}
                      {isCurrent && <Badge variant="secondary">Pending</Badge>}
                      {a.decided_at && (
                        <div className="text-muted-foreground mt-1">
                          {format(new Date(a.decided_at), 'dd MMM HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {hira.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Hazard ID & Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Hazard</th>
                    <th className="text-left py-2">Before</th>
                    <th className="text-left py-2">Controls</th>
                    <th className="text-left py-2">After</th>
                  </tr>
                </thead>
                <tbody>
                  {hira.map((h) => (
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="py-2">{h.hazard}</td>
                      <td className="py-2"><Badge variant="outline">{h.risk_before}</Badge></td>
                      <td className="py-2">{h.controls}</td>
                      <td className="py-2"><Badge variant="secondary">{h.risk_after}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {loto.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> LOTO Isolation Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {loto.map((s) => (
                <li key={s.id} className="flex items-start gap-3 p-2 rounded border">
                  <span className="text-xs font-mono mt-0.5 text-muted-foreground">#{s.step_no}</span>
                  <span className="flex-1">{s.description}</span>
                  {s.isolated_at && <Badge variant="default" className="text-[10px]">Isolated</Badge>}
                  {s.verified_at && <Badge variant="secondary" className="text-[10px]">Verified</Badge>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Action dialog */}
      <Dialog open={actionDialog !== null} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' && `Approve L${permit.current_level}`}
              {actionDialog === 'reject' && 'Reject permit'}
              {actionDialog === 'suspend' && 'Suspend permit'}
              {actionDialog === 'close' && 'Close permit'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'approve' && 'Add an optional note for the audit trail.'}
              {actionDialog === 'reject' && 'A reason is required (≥ 5 characters). The permit will move to Rejected.'}
              {actionDialog === 'suspend' && 'A reason is required. Work must stop immediately.'}
              {actionDialog === 'close' && 'Add closure notes (optional). The permit becomes immutable.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder={actionDialog === 'reject' || actionDialog === 'suspend' ? 'Reason…' : 'Notes (optional)'}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={runAction}
              variant={actionDialog === 'reject' || actionDialog === 'suspend' ? 'destructive' : 'default'}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
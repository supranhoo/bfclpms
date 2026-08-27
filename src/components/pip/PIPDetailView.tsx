/**
 * Full-page PIP detail view (extracted from the legacy PIPDetailSheet).
 *
 * Presentation only: same hooks, same transition SSOT (`availableActions`),
 * same action dialogs. Layout is a wide two-column grid instead of a narrow
 * side sheet so long policy text and milestones are readable.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePIPDetails,
  usePIPAuditLogs,
  useSubmitPIPForApproval,
  useApprovePIP,
  useRejectPIP,
  useCompletePIP,
  useExtendPIP,
  useCancelPIP,
  useUpdateMilestone,
  useRM2ApprovePIP,
  useAcknowledgePIP,
  PIPStatus,
  PIPOutcome,
  MilestoneStatus
} from '@/hooks/usePIP';
import { useAuth } from '@/contexts/AuthContext';
import {
  pipStatusLabel,
  pipStatusVariant,
  pipOutcomeLabel,
  pipOutcomeVariant,
  pipMilestoneLabel,
  pipMilestoneVariant,
  PIP_OUTCOME_ORDER,
  PIP_OUTCOME_DESCRIPTIONS,
} from '@/lib/pip/pipVocabulary';
import { availableActions, type PIPAction } from '@/lib/pip/pipTransitions';
import {
  AlertTriangle,
  CalendarIcon,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Send,
  Ban,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// ADR-205: labels/variants come from the vocabulary SSOT; only the icon is local.
const STATUS_ICONS: Record<PIPStatus, React.ElementType> = {
  draft: FileText,
  pending_hr_approval: Clock,
  active: AlertTriangle,
  completed: CheckCircle2,
  extended: Clock,
  terminated: Ban,
};

export interface PIPDetailViewProps {
  pipId: string;
  /** Rendered next to the page title by the host page (status badge). */
  onStatus?: (node: { label: string; variant: ReturnType<typeof pipStatusVariant> }) => void;
}

export function PIPDetailView({ pipId }: PIPDetailViewProps) {
  const { user, effectiveRole: role } = useAuth();
  const { data: pip, isLoading } = usePIPDetails(pipId);
  const { data: auditLogs } = usePIPAuditLogs(pipId);

  const submitForApproval = useSubmitPIPForApproval();
  const approvePIP = useApprovePIP();
  const rejectPIP = useRejectPIP();
  const completePIP = useCompletePIP();
  const extendPIP = useExtendPIP();
  const cancelPIP = useCancelPIP();
  const updateMilestone = useUpdateMilestone();
  const rm2Approve = useRM2ApprovePIP();
  const acknowledge = useAcknowledgePIP();
  const [rm2Remarks, setRm2Remarks] = useState('');
  const [ackComments, setAckComments] = useState('');

  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | 'complete' | 'extend' | 'cancel' | 'milestone' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [outcome, setOutcome] = useState<PIPOutcome>('improved');
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>('met');
  const [actualOutcome, setActualOutcome] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // ADR-205: action visibility is derived from the transition SSOT, which also
  // mirrors the server-side segregation-of-duties guard.
  const actorCtx = {
    userId: user?.id ?? '',
    roles: role ? [role] : [],
    initiatedBy: pip?.initiated_by ?? '',
  };
  const actions: PIPAction[] = pip ? availableActions(pip.status, actorCtx) : [];
  const can = (a: PIPAction) => actions.includes(a);
  const canManage = can('complete') || can('extend');

  const handleAction = async () => {
    if (!pip) return;

    switch (actionDialog) {
      case 'approve':
        await approvePIP.mutateAsync({ pipId: pip.id, remarks });
        break;
      case 'reject':
        await rejectPIP.mutateAsync({ pipId: pip.id, remarks });
        break;
      case 'complete':
        await completePIP.mutateAsync({ pipId: pip.id, outcome, remarks });
        break;
      case 'extend':
        if (newEndDate) {
          await extendPIP.mutateAsync({
            pipId: pip.id,
            newEndDate: format(newEndDate, 'yyyy-MM-dd'),
            remarks
          });
        }
        break;
      case 'cancel':
        await cancelPIP.mutateAsync({ pipId: pip.id, reason: remarks });
        break;
      case 'milestone':
        if (selectedMilestone) {
          await updateMilestone.mutateAsync({
            milestoneId: selectedMilestone,
            pipId: pip.id,
            status: milestoneStatus,
            actualOutcome,
            remarks,
          });
        }
        break;
    }

    setActionDialog(null);
    setRemarks('');
  };

  const handleDownloadLetter = async () => {
    if (!pip || isDownloading) return;
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pip-letter', {
        body: { pip_id: pip.id },
      });
      if (error) throw error;

      const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PIP_Letter_${pip.employee?.employee_code || pip.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to download PIP letter:', err);
      const { toast } = await import('@/hooks/use-toast');
      toast({
        title: 'Download failed',
        description: err.message || 'Could not generate PIP letter. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2 min-w-0">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-4 min-w-0">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!pip) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This improvement plan could not be found, or you do not have access to it.
        </CardContent>
      </Card>
    );
  }

  const StatusIcon = STATUS_ICONS[pip.status] ?? FileText;
  const effectiveEndDate = pip.extended_end_date || pip.end_date;

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      {can('submit_for_approval') && (
        <Button onClick={() => submitForApproval.mutate(pip.id)} disabled={submitForApproval.isPending}>
          <Send className="h-4 w-4 mr-2" />
          Submit for Approval
        </Button>
      )}

      {can('approve') && (
        <Button onClick={() => setActionDialog('approve')}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Approve
        </Button>
      )}

      {can('reject') && (
        <Button variant="destructive" onClick={() => setActionDialog('reject')}>
          <XCircle className="h-4 w-4 mr-2" />
          Reject
        </Button>
      )}

      {can('complete') && (
        <Button onClick={() => setActionDialog('complete')}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Complete PIP
        </Button>
      )}

      {can('extend') && (
        <Button variant="outline" onClick={() => setActionDialog('extend')}>
          <Clock className="h-4 w-4 mr-2" />
          Extend
        </Button>
      )}

      {can('cancel') && (
        <Button variant="outline" className="text-destructive" onClick={() => setActionDialog('cancel')}>
          <Ban className="h-4 w-4 mr-2" />
          Cancel PIP
        </Button>
      )}

      {pip.status !== 'draft' && (
        <Button variant="outline" onClick={handleDownloadLetter} disabled={isDownloading}>
          {isDownloading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          {isDownloading ? 'Generating...' : 'Download Letter'}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3 pb-24 lg:pb-0">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2 min-w-0">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Reason for PIP</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="whitespace-pre-wrap break-words">{pip.reason}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Areas for Improvement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(pip.improvement_areas as string[]).map((area, i) => (
                  <Badge key={i} variant="outline" className="max-w-full whitespace-normal break-words text-left">
                    {area}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Success Criteria</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="whitespace-pre-wrap break-words">{pip.success_criteria}</p>
            </CardContent>
          </Card>

          {/* Support provided — POLICY §15.6 */}
          {pip.support_provided && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Support &amp; Resources Provided</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="whitespace-pre-wrap break-words">{pip.support_provided}</p>
              </CardContent>
            </Card>
          )}

          {/* Milestones */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pip.milestones?.slice().sort((a, b) =>
                new Date(a.milestone_date).getTime() - new Date(b.milestone_date).getTime()
              ).map((milestone) => (
                <div key={milestone.id} className="border rounded-lg p-3 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {format(new Date(milestone.milestone_date), 'dd MMM yyyy')}
                      </span>
                      <Badge variant={pipMilestoneVariant(milestone.status)} className="text-xs">
                        {pipMilestoneLabel(milestone.status)}
                      </Badge>
                    </div>
                    {canManage && (pip.status === 'active' || pip.status === 'extended') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedMilestone(milestone.id);
                          setMilestoneStatus(milestone.status);
                          setActualOutcome(milestone.actual_outcome || '');
                          setRemarks(milestone.remarks || '');
                          setActionDialog('milestone');
                        }}
                      >
                        Update
                      </Button>
                    )}
                  </div>
                  <p className="text-sm font-medium break-words">{milestone.description}</p>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    Expected: {milestone.expected_outcome}
                  </p>
                  {milestone.actual_outcome && (
                    <p className="text-xs mt-1 break-words">
                      <span className="text-muted-foreground">Actual:</span> {milestone.actual_outcome}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Skip-level (RM2) approval — POLICY §15.5 */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Skip-Level (RM2) Approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {pip.rm2_approved_at ? (
                <>
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Approved on {format(new Date(pip.rm2_approved_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                  {pip.rm2_remarks && <p className="text-muted-foreground italic break-words">"{pip.rm2_remarks}"</p>}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Pending. A plan cannot become Active without skip-level sign-off.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="rm2-remarks">Remarks (optional)</Label>
                    <Textarea
                      id="rm2-remarks"
                      value={rm2Remarks}
                      onChange={(e) => setRm2Remarks(e.target.value)}
                      placeholder="Context for the approval..."
                    />
                    <Button
                      className="h-10"
                      disabled={rm2Approve.isPending}
                      onClick={() => rm2Approve.mutate({ pipId: pip.id, remarks: rm2Remarks })}
                    >
                      Record skip-level approval
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Employee acknowledgement — POLICY §15.9 */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Employee Acknowledgement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {pip.employee_acknowledged_at ? (
                <>
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Acknowledged on {format(new Date(pip.employee_acknowledged_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                  {pip.employee_ack_comments && (
                    <p className="text-muted-foreground italic break-words">"{pip.employee_ack_comments}"</p>
                  )}
                </>
              ) : user?.id === pip.employee_id ? (
                <div className="space-y-2">
                  <Label htmlFor="pip-ack">Your comments (optional)</Label>
                  <Textarea
                    id="pip-ack"
                    value={ackComments}
                    onChange={(e) => setAckComments(e.target.value)}
                    placeholder="I have discussed this plan with my manager..."
                  />
                  <Button
                    className="h-10"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate({ pipId: pip.id, comments: ackComments })}
                  >
                    Acknowledge plan
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Awaiting the employee's acknowledgement.</p>
              )}
            </CardContent>
          </Card>

          {/* HR Remarks */}
          {pip.hr_remarks && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">HR Remarks</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="break-words">{pip.hr_remarks}</p>
                {pip.hr_reviewer && (
                  <p className="text-xs text-muted-foreground mt-2">
                    By {pip.hr_reviewer.full_name} on {format(new Date(pip.hr_approved_at!), 'dd MMM yyyy')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Audit Trail */}
          {auditLogs && auditLogs.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditLogs.slice(0, 10).map(log => (
                    <div key={log.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                      <p className="font-medium">{log.action.replace(/_/g, ' ')}</p>
                      <p className="text-muted-foreground">
                        {log.performer?.full_name || 'System'} · {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                Employee Details
                <Badge variant={pipStatusVariant(pip.status)}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {pipStatusLabel(pip.status)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1 break-words">
              <p><span className="text-muted-foreground">Name:</span> {pip.employee?.full_name}</p>
              <p><span className="text-muted-foreground">Code:</span> {pip.employee?.employee_code}</p>
              <p><span className="text-muted-foreground">Designation:</span> {pip.employee?.designation}</p>
              <p><span className="text-muted-foreground">Initiated by:</span> {pip.initiator?.full_name}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Duration</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-xs">Start Date</p>
                  <p className="font-medium">{format(new Date(pip.start_date), 'dd MMM yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">End Date</p>
                  <p className="font-medium">{format(new Date(effectiveEndDate), 'dd MMM yyyy')}</p>
                  {pip.extended_end_date && (
                    <p className="text-xs text-warning">Extended from {format(new Date(pip.end_date), 'dd MMM yyyy')}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Post-PIP monitoring — POLICY §15.12 */}
          {pip.monitoring_until && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Post-PIP Monitoring</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  Sustained-performance monitoring runs until{' '}
                  <span className="font-medium">{format(new Date(pip.monitoring_until), 'dd MMM yyyy')}</span>.
                  A drop below the threshold in this window is treated as a relapse.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Outcome */}
          {pip.status === 'completed' && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Outcome</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Badge variant={pipOutcomeVariant(pip.outcome)}>
                  {pipOutcomeLabel(pip.outcome)}
                </Badge>
                {pip.completion_remarks && (
                  <p className="mt-2 break-words">{pip.completion_remarks}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Desktop action panel */}
          <Card className="hidden lg:block lg:sticky lg:top-4">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent>{actionButtons}</CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {actionButtons}
      </div>

      {/* Action Dialogs */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' && 'Approve PIP'}
              {actionDialog === 'reject' && 'Reject PIP'}
              {actionDialog === 'complete' && 'Complete PIP'}
              {actionDialog === 'extend' && 'Extend PIP'}
              {actionDialog === 'cancel' && 'Cancel PIP'}
              {actionDialog === 'milestone' && 'Update Milestone'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'approve' && 'This will activate the PIP and notify the employee.'}
              {actionDialog === 'reject' && 'This will send the PIP back to draft for revision.'}
              {actionDialog === 'complete' && 'Mark this PIP as complete with an outcome.'}
              {actionDialog === 'extend' && 'Extend the PIP end date.'}
              {actionDialog === 'cancel' && 'This closes the plan as Cancelled. A reason is required and is recorded in the audit trail.'}
              {actionDialog === 'milestone' && 'Update the milestone progress.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog === 'complete' && (
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as PIPOutcome)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIP_OUTCOME_ORDER.map(o => (
                      <SelectItem key={o} value={o}>{pipOutcomeLabel(o)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{PIP_OUTCOME_DESCRIPTIONS[outcome]}</p>
              </div>
            )}

            {actionDialog === 'extend' && (
              <div className="space-y-2">
                <Label>New End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !newEndDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newEndDate ? format(newEndDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={newEndDate} onSelect={setNewEndDate} />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {actionDialog === 'milestone' && (
              <>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={milestoneStatus} onValueChange={(v) => setMilestoneStatus(v as MilestoneStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="met">Met</SelectItem>
                      <SelectItem value="partially_met">Partially Met</SelectItem>
                      <SelectItem value="not_met">Not Met</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Actual Outcome</Label>
                  <Textarea
                    placeholder="What was actually achieved..."
                    value={actualOutcome}
                    onChange={(e) => setActualOutcome(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>
                {actionDialog === 'cancel' ? 'Reason' : 'Remarks'}
                {(actionDialog === 'reject' || actionDialog === 'cancel') && ' *'}
              </Label>
              <Textarea
                placeholder="Add any remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={
                (actionDialog === 'reject' && !remarks) ||
                (actionDialog === 'cancel' && !remarks) ||
                (actionDialog === 'extend' && !newEndDate)
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

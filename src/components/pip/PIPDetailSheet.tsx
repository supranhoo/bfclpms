import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

interface PIPDetailSheetProps {
  pipId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PIPDetailSheet({ pipId, open, onOpenChange }: PIPDetailSheetProps) {
  const { user, effectiveRole: role } = useAuth();
  const { data: pip, isLoading } = usePIPDetails(pipId || undefined);
  const { data: auditLogs } = usePIPAuditLogs(pipId || undefined);
  
  const submitForApproval = useSubmitPIPForApproval();
  const approvePIP = useApprovePIP();
  const rejectPIP = useRejectPIP();
  const completePIP = useCompletePIP();
  const extendPIP = useExtendPIP();
  const cancelPIP = useCancelPIP();
  const updateMilestone = useUpdateMilestone();

  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | 'complete' | 'extend' | 'cancel' | 'milestone' | null>(null);
  const [remarks, setRemarks] = useState('');
  const [outcome, setOutcome] = useState<PIPOutcome>('improved');
  const [newEndDate, setNewEndDate] = useState<Date>();
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [milestoneStatus, setMilestoneStatus] = useState<MilestoneStatus>('met');
  const [actualOutcome, setActualOutcome] = useState('');

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

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadLetter = async () => {
    if (!pip || isDownloading) return;
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-pip-letter', {
        body: { pip_id: pip.id },
      });
      if (error) throw error;

      // The edge function returns a PDF blob
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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!pip) return null;

  const statusConfig = STATUS_CONFIG[pip.status];
  const StatusIcon = statusConfig.icon;
  const effectiveEndDate = pip.extended_end_date || pip.end_date;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>Performance Improvement Plan</SheetTitle>
              <Badge variant={statusConfig.variant}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <SheetDescription>
              {pip.employee?.full_name} ({pip.employee?.employee_code})
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Employee Info */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Employee Details</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Name:</span> {pip.employee?.full_name}</p>
                <p><span className="text-muted-foreground">Code:</span> {pip.employee?.employee_code}</p>
                <p><span className="text-muted-foreground">Designation:</span> {pip.employee?.designation}</p>
                <p><span className="text-muted-foreground">Initiated by:</span> {pip.initiator?.full_name}</p>
              </CardContent>
            </Card>

            {/* Duration */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Duration</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="flex justify-between">
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

            {/* Reason */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Reason for PIP</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{pip.reason}</p>
              </CardContent>
            </Card>

            {/* Improvement Areas */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Areas for Improvement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(pip.improvement_areas as string[]).map((area, i) => (
                    <Badge key={i} variant="outline">{area}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Success Criteria */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Success Criteria</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{pip.success_criteria}</p>
              </CardContent>
            </Card>

            {/* Milestones */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Milestones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pip.milestones?.sort((a, b) => 
                  new Date(a.milestone_date).getTime() - new Date(b.milestone_date).getTime()
                ).map((milestone, index) => {
                  const msConfig = MILESTONE_STATUS_CONFIG[milestone.status];
                  return (
                    <div key={milestone.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {format(new Date(milestone.milestone_date), 'dd MMM yyyy')}
                          </span>
                          <Badge variant={msConfig.variant} className="text-xs">
                            {msConfig.label}
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
                      <p className="text-sm font-medium">{milestone.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected: {milestone.expected_outcome}
                      </p>
                      {milestone.actual_outcome && (
                        <p className="text-xs mt-1">
                          <span className="text-muted-foreground">Actual:</span> {milestone.actual_outcome}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* HR Remarks */}
            {pip.hr_remarks && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">HR Remarks</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p>{pip.hr_remarks}</p>
                  {pip.hr_reviewer && (
                    <p className="text-xs text-muted-foreground mt-2">
                      By {pip.hr_reviewer.full_name} on {format(new Date(pip.hr_approved_at!), 'dd MMM yyyy')}
                    </p>
                  )}
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
                  <Badge variant={pip.outcome === 'improved' ? 'default' : 'destructive'}>
                    {pip.outcome?.replace('_', ' ')}
                  </Badge>
                  {pip.completion_remarks && (
                    <p className="mt-2">{pip.completion_remarks}</p>
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
                    {auditLogs.slice(0, 5).map(log => (
                      <div key={log.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                        <p className="font-medium">{log.action.replace('_', ' ')}</p>
                        <p className="text-muted-foreground">
                          {log.performer?.full_name || 'System'} · {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {pip.status === 'draft' && isInitiator && (
                <Button onClick={() => submitForApproval.mutate(pip.id)} disabled={submitForApproval.isPending}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Approval
                </Button>
              )}

              {pip.status === 'pending_hr_approval' && isHR && (
                <>
                  <Button onClick={() => setActionDialog('approve')}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setActionDialog('reject')}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}

              {(pip.status === 'active' || pip.status === 'extended') && canManage && (
                <>
                  <Button onClick={() => setActionDialog('complete')}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Complete PIP
                  </Button>
                  <Button variant="outline" onClick={() => setActionDialog('extend')}>
                    <Clock className="h-4 w-4 mr-2" />
                    Extend
                  </Button>
                </>
              )}

              {pip.status !== 'draft' && (
                <Button variant="outline" onClick={handleDownloadLetter} disabled={isDownloading}>
                  {isDownloading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  {isDownloading ? 'Generating...' : 'Download Letter'}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Action Dialogs */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog === 'approve' && 'Approve PIP'}
              {actionDialog === 'reject' && 'Reject PIP'}
              {actionDialog === 'complete' && 'Complete PIP'}
              {actionDialog === 'extend' && 'Extend PIP'}
              {actionDialog === 'milestone' && 'Update Milestone'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === 'approve' && 'This will activate the PIP and notify the employee.'}
              {actionDialog === 'reject' && 'This will send the PIP back to draft for revision.'}
              {actionDialog === 'complete' && 'Mark this PIP as complete with an outcome.'}
              {actionDialog === 'extend' && 'Extend the PIP end date.'}
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
                    <SelectItem value="improved">Improved</SelectItem>
                    <SelectItem value="not_improved">Not Improved</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
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
              <Label>Remarks {actionDialog === 'reject' && '*'}</Label>
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

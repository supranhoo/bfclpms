import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCreateRollbackRequest } from '@/hooks/useKpiRollbackRequests';
import { useToast } from '@/hooks/use-toast';

interface RollbackRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiId: string;
  kpiName: string;
  currentStatus: string;
  workflowStages: string[];
  notifyUserId?: string;
  stagesLoading?: boolean;
}

export function RollbackRequestDialog({
  open,
  onOpenChange,
  kpiId,
  kpiName,
  currentStatus,
  workflowStages,
  notifyUserId,
  stagesLoading,
}: RollbackRequestDialogProps) {
  const [reason, setReason] = useState('');
  const createRequest = useCreateRollbackRequest();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason.trim()) return;

    // Pre-submit validation: ensure currentStatus exists in workflowStages
    if (!workflowStages.includes(currentStatus)) {
      toast({
        title: 'Workflow stages not ready',
        description: 'The workflow configuration is still loading or does not include the current status. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    await createRequest.mutateAsync({
      kpi_id: kpiId,
      reason: reason.trim(),
      current_status: currentStatus,
      workflow_stages: workflowStages,
      notify_user_id: notifyUserId,
    });
    setReason('');
    onOpenChange(false);
  };

  const isSubmitDisabled = !reason.trim() || createRequest.isPending || !!stagesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Request Rollback
          </DialogTitle>
          <DialogDescription>
            Request to roll back <strong>{kpiName}</strong> to the previous stage for corrections.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
            The next-level reviewer will see your request and can approve or dismiss it.
          </div>
          <div className="space-y-2">
            <Label htmlFor="rollback-reason">
              Reason for Rollback <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rollback-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you need to make changes..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
          >
            {stagesLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Loading stages...</>
            ) : createRequest.isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
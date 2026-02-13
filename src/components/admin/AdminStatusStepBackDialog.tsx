import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { getStageLabel } from '@/hooks/useWorkflowConfig';
import { useAdminStatusStepBack, getPreviousStatus } from '@/hooks/useAdminDataEntry';
import type { Database } from '@/integrations/supabase/types';

type ReviewStatus = Database['public']['Enums']['review_status'];

interface AdminStatusStepBackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpiId: string;
  kpiName: string;
  kraName: string;
  employeeId: string;
  employeeName: string;
  currentStatus: ReviewStatus;
}

export function AdminStatusStepBackDialog({
  isOpen,
  onClose,
  kpiId,
  kpiName,
  kraName,
  employeeId,
  employeeName,
  currentStatus,
}: AdminStatusStepBackDialogProps) {
  const [reason, setReason] = useState('');
  const stepBackMutation = useAdminStatusStepBack();
  const previousStatus = getPreviousStatus(currentStatus);

  const handleSubmit = () => {
    if (!previousStatus || !reason.trim()) return;

    stepBackMutation.mutate(
      {
        kpi_id: kpiId,
        employee_id: employeeId,
        current_status: currentStatus,
        target_status: previousStatus,
        reason: reason.trim(),
        kpi_name: kpiName,
      },
      {
        onSuccess: () => {
          setReason('');
          onClose();
        },
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Step Back KPI Status
          </DialogTitle>
          <DialogDescription>
            Move this KPI one step backward in the workflow. A mandatory reason is required for the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* KPI Info */}
          <div className="p-3 bg-muted rounded-md space-y-1">
            <div className="text-sm font-medium text-foreground">{kraName}</div>
            <div className="text-sm text-muted-foreground">{kpiName}</div>
            <div className="text-xs text-muted-foreground">Employee: {employeeName}</div>
          </div>

          {/* Status Transition */}
          <div className="flex items-center justify-center gap-3 py-2">
            <Badge variant="outline" className="text-sm">
              {getStageLabel(currentStatus)}
            </Badge>
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary" className="text-sm">
              {previousStatus ? getStageLabel(previousStatus) : '—'}
            </Badge>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Reason for Step Back <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="Explain why this KPI needs to be moved back..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || stepBackMutation.isPending}
          >
            {stepBackMutation.isPending ? 'Processing...' : 'Confirm Step Back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

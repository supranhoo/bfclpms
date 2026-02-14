import { AlertTriangle, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RollbackRequest, useApproveRollbackRequest, useRejectRollbackRequest } from '@/hooks/useKpiRollbackRequests';

interface RollbackRequestBannerProps {
  request: RollbackRequest;
}

export function RollbackRequestBanner({ request }: RollbackRequestBannerProps) {
  const approveRollback = useApproveRollbackRequest();
  const rejectRollback = useRejectRollbackRequest();

  const requesterName = request.requester_profile?.full_name
    || 'A user';

  const handleApprove = () => {
    approveRollback.mutate({
      request_id: request.id,
      kpi_id: request.kpi_id,
      target_status: request.target_status,
      requested_by: request.requested_by,
    });
  };

  const handleReject = () => {
    rejectRollback.mutate({
      request_id: request.id,
      kpi_id: request.kpi_id,
      requested_by: request.requested_by,
    });
  };

  const isPending = approveRollback.isPending || rejectRollback.isPending;

  return (
    <div className="border border-destructive/30 bg-destructive/10 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-destructive">
            {requesterName} has requested a rollback
          </p>
          <p className="text-sm text-muted-foreground">
            &ldquo;{request.reason}&rdquo;
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleReject}
          disabled={isPending}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleApprove}
          disabled={isPending}
        >
          <Undo2 className="h-4 w-4 mr-1" />
          {approveRollback.isPending ? 'Rolling back...' : 'Roll Back'}
        </Button>
      </div>
    </div>
  );
}

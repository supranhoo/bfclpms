import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X, Check } from 'lucide-react';
import { useAuditorsList, useAssignKpiToAuditor, useRemoveKpiAuditAssignment, type AuditKpiAssignment } from '@/hooks/useAuditKpiAssignments';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface AuditKpiAssignPopoverProps {
  kpiId: string;
  currentAssignment?: AuditKpiAssignment | null;
}

export function AuditKpiAssignPopover({ kpiId, currentAssignment }: AuditKpiAssignPopoverProps) {
  const { data: auditors } = useAuditorsList();
  const assignMutation = useAssignKpiToAuditor();
  const removeMutation = useRemoveKpiAuditAssignment();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  const handleAssign = (auditorId: string) => {
    assignMutation.mutate(
      { kpiId, auditorId },
      {
        onSuccess: () => {
          toast({ title: 'KPI assigned' });
          setOpen(false);
        },
        onError: (e: Error) => toast({ title: 'Failed to assign', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleRemove = () => {
    removeMutation.mutate(
      { kpiId },
      {
        onSuccess: () => {
          toast({ title: 'Assignment removed' });
          setOpen(false);
        },
        onError: (e: Error) => toast({ title: 'Failed to remove', description: e.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {currentAssignment ? (
          <Badge
            variant="outline"
            className="cursor-pointer text-[10px] px-1.5 py-0 h-5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 border-indigo-300 dark:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
          >
            → {currentAssignment.auditor_name?.split(' ')[0]}
          </Badge>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Assign to auditor">
            <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Assign to Auditor</p>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {(auditors || []).map((a) => (
            <button
              key={a.id}
              onClick={() => handleAssign(a.id)}
              className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent flex items-center justify-between"
              disabled={assignMutation.isPending}
            >
              <span>{a.full_name}</span>
              {currentAssignment?.auditor_id === a.id && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
          ))}
        </div>
        {currentAssignment && (
          <button
            onClick={handleRemove}
            className="w-full mt-1 text-left px-2 py-1.5 text-sm rounded-md hover:bg-destructive/10 text-destructive flex items-center gap-1.5"
            disabled={removeMutation.isPending}
          >
            <X className="h-3 w-3" />
            Remove Assignment
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

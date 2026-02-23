import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { RatingBadge } from '@/components/ui/RatingBadge';

interface OrgKpiRatingOverrideWarningProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  kpiName: string;
  originalScore: number;
  originalEnteredBy: string | null;
  newScore: number;
}

export function OrgKpiRatingOverrideWarning({
  open,
  onConfirm,
  onCancel,
  kpiName,
  originalScore,
  originalEnteredBy,
  newScore,
}: OrgKpiRatingOverrideWarningProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Org KPI Rating Override
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                You are changing the rating for <strong className="text-foreground">{kpiName}</strong>, 
                an Organization KPI{originalEnteredBy ? ` originally entered by ${originalEnteredBy}` : ''}.
              </p>
              <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Original:</span>
                    <RatingBadge score={originalScore} />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">New:</span>
                    <RatingBadge score={newScore} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This override will be recorded in the audit trail.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep Original Rating</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Proceed with Override
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

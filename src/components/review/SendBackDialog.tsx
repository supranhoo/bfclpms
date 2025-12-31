/**
 * Shared send-back dialog component for review pages
 */

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Undo2 } from 'lucide-react';
import { KPI } from '@/hooks/useKpis';

interface SendBackTarget {
  value: string;
  label: string;
}

interface SendBackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  target: string;
  onTargetChange: (target: string) => void;
  targets: SendBackTarget[];
  onSubmit: () => void;
  isLoading?: boolean;
}

export function SendBackDialog({
  open,
  onOpenChange,
  kpi,
  reason,
  onReasonChange,
  target,
  onTargetChange,
  targets,
  onSubmit,
  isLoading = false,
}: SendBackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-orange-500" />
            Send Back for Revision
          </DialogTitle>
          <DialogDescription>
            Send this KPI back for revision. Please provide a reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="font-medium">KPI</Label>
            <p className="text-sm text-muted-foreground">{kpi?.kpi_name}</p>
          </div>

          {targets.length > 1 && (
            <div className="space-y-2">
              <Label>Send Back To</Label>
              <Select value={target} onValueChange={onTargetChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason for Sending Back *</Label>
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Please explain why this KPI needs revision..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onSubmit}
            disabled={!reason.trim() || isLoading}
          >
            <Undo2 className="h-4 w-4 mr-2" />
            {isLoading ? 'Sending...' : 'Send Back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Undo2, AlertTriangle } from 'lucide-react';
import { KPI } from '@/hooks/useKpis';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useRequestOrgKpiRevision } from '@/hooks/useRequestOrgKpiRevision';

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
  const [requestRevisionMode, setRequestRevisionMode] = useState(false);
  const requestRevision = useRequestOrgKpiRevision();
  const isOrgLevel = !!(kpi as any)?.is_org_level;

  const handleRequestRevision = async () => {
    if (!kpi || reason.trim().length < 5) return;
    await requestRevision.mutateAsync({
      kpiId: kpi.id,
      reason: reason.trim(),
      kraName: kpi.kra_name,
      kpiName: kpi.kpi_name,
      categoryId: (kpi as any).category_id,
    });
    setRequestRevisionMode(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {requestRevisionMode ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <Undo2 className="h-5 w-5 text-orange-500" />
            )}
            {requestRevisionMode ? 'Request Revision from Data Owner' : 'Send Back for Revision'}
          </DialogTitle>
          <DialogDescription>
            {requestRevisionMode
              ? 'Reverts the source org KPI value to draft. Employees still in early review stages will be rolled back; later-stage scores will be flagged.'
              : 'Send this KPI back for revision. Please provide a reason.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="font-medium">KPI</Label>
            <p className="text-sm text-muted-foreground">{kpi?.kpi_name}</p>
          </div>

          {isOrgLevel && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-900 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="rev-mode" className="text-sm font-medium">
                  Issue is with the source value (not the score)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Notify the Data Owner to correct the org KPI value instead of sending it back through the review chain.
                </p>
              </div>
              <Switch
                id="rev-mode"
                checked={requestRevisionMode}
                onCheckedChange={setRequestRevisionMode}
              />
            </div>
          )}

          {!requestRevisionMode && targets.length > 1 && (
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
            <Label>{requestRevisionMode ? 'Reason for Revision *' : 'Reason for Sending Back *'}</Label>
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={
                requestRevisionMode
                  ? 'Explain what is wrong with the source org KPI value (e.g. Plant Availability is 88%, not 90%)...'
                  : 'Please explain why this KPI needs revision...'
              }
              rows={4}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/2000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {requestRevisionMode ? (
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleRequestRevision}
              disabled={reason.trim().length < 5 || requestRevision.isPending}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {requestRevision.isPending ? 'Requesting...' : 'Request Revision'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={onSubmit}
              disabled={!reason.trim() || isLoading}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {isLoading ? 'Sending...' : 'Send Back'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

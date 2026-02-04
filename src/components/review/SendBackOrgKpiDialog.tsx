import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSendBackOrgKpiValue } from '@/hooks/useSendBackOrgKpiValue';
import { AlertTriangle, Building2, Send } from 'lucide-react';

interface SendBackOrgKpiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgValue: {
    id: string;
    category_id: string;
    kra_name: string;
    kpi_name: string;
    achieved_value: number | null;
    data_source: string | null;
  } | null;
  owners?: Array<{ owner?: { full_name: string | null; email: string } }>;
}

export function SendBackOrgKpiDialog({
  open,
  onOpenChange,
  orgValue,
  owners,
}: SendBackOrgKpiDialogProps) {
  const [reason, setReason] = useState('');
  const sendBack = useSendBackOrgKpiValue();

  const handleSubmit = () => {
    if (!orgValue || !reason.trim()) return;

    sendBack.mutate({
      orgValueId: orgValue.id,
      categoryId: orgValue.category_id,
      kraName: orgValue.kra_name,
      kpiName: orgValue.kpi_name,
      reason: reason.trim(),
    }, {
      onSuccess: () => {
        setReason('');
        onOpenChange(false);
      },
    });
  };

  if (!orgValue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Send Back Org-Level KPI Data
          </DialogTitle>
          <DialogDescription>
            Request the data owner to resubmit this organization-level KPI value
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* KPI Info */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Org-Level KPI</span>
            </div>
            <div>
              <p className="font-medium">{orgValue.kra_name}</p>
              <p className="text-sm text-muted-foreground">{orgValue.kpi_name}</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Current Value: </span>
                <span className="font-semibold">
                  {orgValue.achieved_value !== null ? orgValue.achieved_value : 'Not set'}
                </span>
              </div>
              {orgValue.data_source && (
                <div>
                  <span className="text-muted-foreground">Source: </span>
                  <span>{orgValue.data_source}</span>
                </div>
              )}
            </div>
          </div>

          {/* Data Owners */}
          {owners && owners.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Data Owner(s) to Notify</Label>
              <div className="flex flex-wrap gap-2">
                {owners.map((owner, idx) => (
                  <Badge key={idx} variant="secondary">
                    {owner.owner?.full_name || owner.owner?.email}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Send Back *</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this value needs to be resubmitted..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || sendBack.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sendBack.isPending ? 'Sending...' : 'Send Back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

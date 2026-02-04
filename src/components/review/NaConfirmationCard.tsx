import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

interface NaConfirmationCardProps {
  selfRemarks: string | null;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  remarks: string;
  onRemarksChange: (remarks: string) => void;
  reviewerLevel: 'Manager' | 'Auditor' | 'Management';
}

export function NaConfirmationCard({
  selfRemarks,
  confirmed,
  onConfirmChange,
  remarks,
  onRemarksChange,
  reviewerLevel,
}: NaConfirmationCardProps) {
  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-4">
            <div>
              <p className="font-medium text-foreground">
                This KPI was marked as Not Applicable
              </p>
              {selfRemarks && (
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium">Employee Reason:</span> {selfRemarks}
                </p>
              )}
              {!selfRemarks && (
                <p className="text-sm text-muted-foreground mt-1 italic">
                  No reason provided by employee
                </p>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="confirm-na"
                  checked={confirmed}
                  onCheckedChange={(checked) => onConfirmChange(checked === true)}
                />
                <Label htmlFor="confirm-na" className="text-sm cursor-pointer">
                  I confirm this KPI is correctly marked as N/A
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{reviewerLevel} Remarks (Optional)</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => onRemarksChange(e.target.value)}
                  placeholder="Add any notes about this N/A classification..."
                  rows={2}
                  className="bg-background"
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

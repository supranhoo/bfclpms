import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Ban, RefreshCw } from 'lucide-react';

interface NaConfirmationCardProps {
  selfRemarks: string | null;
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
  remarks: string;
  onRemarksChange: (remarks: string) => void;
  reviewerLevel: 'Manager' | 'Functional Manager' | 'Auditor' | 'Management';
  /** If true, show the "Mark as N/A" toggle for reviewer-initiated N/A */
  canMarkNa?: boolean;
  /** Whether the reviewer has toggled N/A on */
  reviewerMarkedNa?: boolean;
  /** Callback when reviewer toggles N/A */
  onReviewerMarkNa?: (marked: boolean) => void;
  /** Remarks for reviewer-initiated N/A (mandatory) */
  markNaRemarks?: string;
  /** Callback for reviewer N/A remarks */
  onMarkNaRemarksChange?: (remarks: string) => void;
  /** Which role originally marked this N/A (for display) */
  naMarkedByRole?: string | null;
  /** Whether the reviewer has overridden N/A (making KPI applicable again) */
  naOverridden?: boolean;
  /** Callback when reviewer toggles override */
  onOverrideNa?: (overridden: boolean) => void;
  /** Remarks for overriding N/A (mandatory) */
  overrideRemarks?: string;
  /** Callback for override remarks */
  onOverrideRemarksChange?: (remarks: string) => void;
}

export function NaConfirmationCard({
  selfRemarks,
  confirmed,
  onConfirmChange,
  remarks,
  onRemarksChange,
  reviewerLevel,
  canMarkNa,
  reviewerMarkedNa,
  onReviewerMarkNa,
  markNaRemarks,
  onMarkNaRemarksChange,
  naMarkedByRole,
  naOverridden,
  onOverrideNa,
  overrideRemarks,
  onOverrideRemarksChange,
}: NaConfirmationCardProps) {
  // If this is the "reviewer wants to mark N/A" variant (KPI is NOT already N/A)
  if (canMarkNa && onReviewerMarkNa) {
    return (
      <Card className={`border-amber-500/50 ${reviewerMarkedNa ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-muted/30'}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Ban className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground text-sm">
                    Mark this KPI as Not Applicable
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Override the employee's score and treat this KPI as N/A
                  </p>
                </div>
                <Switch
                  checked={reviewerMarkedNa || false}
                  onCheckedChange={onReviewerMarkNa}
                />
              </div>

              {reviewerMarkedNa && (
                <div className="space-y-2 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
                  <Label className="text-sm">
                    {reviewerLevel} Justification <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={markNaRemarks || ''}
                    onChange={(e) => onMarkNaRemarksChange?.(e.target.value)}
                    placeholder="Provide a mandatory reason for marking this KPI as N/A..."
                    rows={3}
                    className="bg-background"
                  />
                  {markNaRemarks !== undefined && markNaRemarks.trim() === '' && (
                    <p className="text-xs text-destructive">A reason is required to mark this KPI as N/A</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Original "confirm existing N/A" variant — now with override option
  return (
    <Card className={`border-amber-500/50 ${naOverridden ? 'bg-green-50/50 dark:bg-green-950/20 border-green-500/50' : 'bg-amber-50/50 dark:bg-amber-950/20'}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {naOverridden ? (
            <RefreshCw className="h-5 w-5 text-green-600 dark:text-green-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-4">
            <div>
              <p className="font-medium text-foreground">
                This KPI was marked as Not Applicable
                {naMarkedByRole && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    (by {naMarkedByRole.charAt(0).toUpperCase() + naMarkedByRole.slice(1).replace('_', ' ')})
                  </span>
                )}
              </p>
              {selfRemarks && (
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium">Reason:</span> {selfRemarks}
                </p>
              )}
              {!selfRemarks && (
                <p className="text-sm text-muted-foreground mt-1 italic">
                  No reason provided
                </p>
              )}
            </div>

            {/* Override N/A toggle — only shown if callbacks provided */}
            {onOverrideNa && (
              <div className="space-y-3 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      Override: This KPI is applicable
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reverse the N/A decision and provide your own score
                    </p>
                  </div>
                  <Switch
                    checked={naOverridden || false}
                    onCheckedChange={(checked) => {
                      onOverrideNa(checked);
                      // Clear confirm when overriding
                      if (checked) onConfirmChange(false);
                    }}
                  />
                </div>

                {naOverridden && (
                  <div className="space-y-2">
                    <Label className="text-sm">
                      {reviewerLevel} Override Justification <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={overrideRemarks || ''}
                      onChange={(e) => onOverrideRemarksChange?.(e.target.value)}
                      placeholder="Provide a mandatory reason for overriding the N/A decision..."
                      rows={3}
                      className="bg-background"
                    />
                    {overrideRemarks !== undefined && overrideRemarks.trim() === '' && (
                      <p className="text-xs text-destructive">A reason is required to override N/A</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Confirm N/A — hidden when overriding */}
            {!naOverridden && (
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
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

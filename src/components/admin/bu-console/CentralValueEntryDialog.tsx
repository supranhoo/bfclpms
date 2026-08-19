/**
 * ADR-302 — central value entry.
 *
 * The designated data provider enters the month's number (or the Yes/No /
 * tiered outcome for a qualitative KPI) with remarks, then submits it into the
 * approval ladder. Submit runs the server dry-run first and only commits when
 * the server says the row can move; failures keep the dialog open with the
 * typed value intact.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrgKpiSubmitValue } from '@/hooks/useOrgKpiCentralWorkflow';
import { KPI_TYPE_LABELS, type KpiScoringModel } from '@/lib/kpiScoringModel';
import type { CentralValueRow } from '@/lib/review/centralApprovalModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: CentralValueRow | null;
  kpiName: string;
  scoringModel?: KpiScoringModel | null;
  /** Opens the shared Org KPI evidence manager for this row. */
  onManageEvidence: () => void;
  evidenceCount: number;
}

export function CentralValueEntryDialog({
  open, onOpenChange, row, kpiName, scoringModel, onManageEvidence, evidenceCount,
}: Props) {
  const { toast } = useToast();
  const submitMut = useOrgKpiSubmitValue();
  const [value, setValue] = useState('');
  const [remarks, setRemarks] = useState('');

  const isQualitative = scoringModel?.type === 'binary' || scoringModel?.type === 'tiered';

  useEffect(() => {
    if (!open) return;
    if (isQualitative) {
      const match = scoringModel?.options.find(o => o.rating === row?.achieved_value);
      setValue(match?.label ?? '');
    } else {
      setValue(row?.achieved_value == null ? '' : String(row.achieved_value));
    }
    setRemarks(row?.remarks ?? '');
  }, [open, row?.id, row?.achieved_value, row?.remarks, isQualitative, scoringModel]);

  const selectedOption = isQualitative
    ? scoringModel!.options.find(o => o.label === value) ?? null
    : null;
  // Qualitative KPIs are stored as their 0-5 rating (ADR-271), never the label.
  const numericValue = isQualitative
    ? (selectedOption ? selectedOption.rating : null)
    : (value.trim() === '' ? null : Number(value));
  const invalid = numericValue === null || Number.isNaN(numericValue);

  const submit = async () => {
    if (!row || invalid) return;
    const dry = await submitMut.mutateAsync({
      okvId: row.id,
      achievedValue: numericValue,
      remarks: remarks.trim() || null,
      dryRun: true,
    });
    if (dry?.ok === false) {
      toast({
        title: 'Cannot submit this value',
        description: String(dry.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    const res = await submitMut.mutateAsync({
      okvId: row.id,
      achievedValue: numericValue,
      remarks: remarks.trim() || null,
      dryRun: false,
    });
    if (res?.ok === false) {
      toast({
        title: 'Cannot submit this value',
        description: String(res.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Submitted for approval',
      description: dry?.has_chain === false
        ? 'No approvers are configured, so the value is approved immediately.'
        : 'The first approver now holds this value.',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter the central value</DialogTitle>
          <DialogDescription>{kpiName}</DialogDescription>
        </DialogHeader>

        {!row && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertDescription>
              No organisation-level value row exists for this period yet. Enter the value once from
              Org KPI data entry, then submit it here.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="central-value">
              {isQualitative ? 'Outcome' : 'Actual value'}
              {scoringModel && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {KPI_TYPE_LABELS[scoringModel.uomType]}
                </span>
              )}
            </Label>
            {isQualitative ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="central-value">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {scoringModel!.options.map(o => (
                    <SelectItem key={o.label} value={o.label}>{o.label} — R{o.rating}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="central-value"
                inputMode="decimal"
                value={value}
                placeholder="e.g. 104320"
                onChange={e => setValue(e.target.value)}
              />
            )}
            {invalid && (
              <p className="text-xs text-destructive">Enter a value before submitting.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="central-remarks">Remarks (optional)</Label>
            <Textarea
              id="central-remarks"
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Context the approvers should see"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span className="text-muted-foreground">
              Supporting files: {evidenceCount}
            </span>
            <Button variant="outline" className="h-10" onClick={onManageEvidence} disabled={!row}>
              <Paperclip className="mr-2 h-4 w-4" aria-hidden />
              Manage evidence
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-10" onClick={submit} disabled={!row || invalid || submitMut.isPending}>
            {submitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

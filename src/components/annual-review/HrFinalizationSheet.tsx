import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { FINAL_RATINGS } from '@/lib/annualReview/constants';
import { computeCriteriaScore, computeOverallScore } from '@/lib/annualReview/scoring';
import { useFinalizeInstance, useInstanceResponses } from '@/hooks/useAnnualReview';
import { SystemScoresPanel } from './SystemScoresPanel';
import type { AnnualReviewInstance, AnnualReviewTemplate } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

export function HrFinalizationSheet({
  open,
  onOpenChange,
  instance,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: InstanceWithEmployee | AnnualReviewInstance | null;
  template: AnnualReviewTemplate | null;
}) {
  const finalize = useFinalizeInstance();
  const { data: responses = [] } = useInstanceResponses(instance?.id);
  const [rating, setRating] = useState<string>('Average');
  const [remarks, setRemarks] = useState('');
  const [systemOverrides, setSystemOverrides] = useState<Record<string, number>>({});

  const sysCfg = template?.sections.system_scores ?? [];
  const criteria = template?.sections.criteria ?? [];

  const merged: Record<string, number> = useMemo(
    () => ({ ...(instance?.system_scores ?? {}), ...systemOverrides }),
    [instance, systemOverrides],
  );

  const sumCriteria = useMemo(() => {
    // Use HR's response if present, else cascade to the highest reviewer.
    const order = ['hr', 'bu_head', 'skip_manager', 'manager', 'self'] as const;
    for (const role of order) {
      const r = responses.find((x) => x.reviewer_role === role);
      if (r) return computeCriteriaScore(criteria, r.criteria_scores ?? {});
    }
    return computeCriteriaScore(criteria, {});
  }, [criteria, responses]);

  const overall = computeOverallScore(sysCfg, merged, sumCriteria);

  const missingStages = useMemo(() => {
    const need = ['self', 'manager', 'skip_manager', 'bu_head'] as const;
    return need.filter((r) => !responses.find((x) => x.reviewer_role === r && x.is_locked));
  }, [responses]);

  const canFinalize = missingStages.length === 0;

  const submit = async () => {
    if (!instance) return;
    try {
      await finalize.mutateAsync({
        id: instance.id,
        finalRating: rating,
        hrRemarks: remarks,
        systemScores: merged,
        totalScore: overall,
        criteriaWeightedScore: sumCriteria.totalCriteriaScore,
      });
      toast.success('Annual review finalized.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>HR Finalization</SheetTitle>
          <SheetDescription>
            Review the comparison across all reviewers, override system scores if needed,
            pick a final rating, then finalize.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {!canFinalize && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Cannot finalize yet</AlertTitle>
              <AlertDescription>
                Missing locked responses for: {missingStages.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <SystemScoresPanel
            systemScores={sysCfg}
            values={merged}
            onChangeValue={(id, v) => setSystemOverrides((p) => ({ ...p, [id]: v }))}
            eligibility={template?.sections.eligibility_criteria}
            eligibilityInputs={instance?.eligibility_inputs}
          />

          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Criteria weighted score</span>
              <span className="font-semibold tabular-nums">
                {sumCriteria.totalCriteriaScore.toFixed(2)} / {sumCriteria.maxCriteriaScore.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-muted-foreground">Overall (capped at 100)</span>
              <span className="font-semibold text-lg tabular-nums text-primary">{overall.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Final rating</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FINAL_RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>HR remarks</Label>
            <Textarea rows={5} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Justification for any overrides and the final rating." />
          </div>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canFinalize || finalize.isPending}>
            {finalize.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Finalize
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
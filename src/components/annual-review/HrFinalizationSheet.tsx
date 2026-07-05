import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, UserCog } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { FINAL_RATINGS } from '@/lib/annualReview/constants';
import { computeCriteriaScore, computeOverallScore } from '@/lib/annualReview/scoring';
import { resolveStageWeights, computeFinalScore, responsesToRoleMap } from '@/lib/annualReview/finalScore';
import { useFinalizeInstance, useInstanceResponses, useReassignReviewer, useUpdateSystemScores } from '@/hooks/useAnnualReview';
import { SystemScoresPanel } from './SystemScoresPanel';
import { EligibilityInputsEditor } from './EligibilityInputsEditor';
import { InstanceTimeline } from './InstanceTimeline';
import { ReassignReviewerDialog } from './ReassignReviewerDialog';
import type { AnnualReviewInstance, AnnualReviewTemplate } from '@/types/annualReview';
import type { AnnualReviewerRole } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

export function HrFinalizationSheet({
  open,
  onOpenChange,
  instance,
  template,
  fiscalYear,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: InstanceWithEmployee | AnnualReviewInstance | null;
  template: AnnualReviewTemplate | null;
  fiscalYear?: number | null;
}) {
  const finalize = useFinalizeInstance();
  const saveSystemScores = useUpdateSystemScores();
  const { data: responses = [] } = useInstanceResponses(instance?.id);
  const [rating, setRating] = useState<string>('Average');
  const [remarks, setRemarks] = useState('');
  const [systemOverrides, setSystemOverrides] = useState<Record<string, number>>({});
  const [reassignOpen, setReassignOpen] = useState(false);

  const sysCfg = template?.sections.system_scores ?? [];
  const criteria = template?.sections.criteria ?? [];

  const merged: Record<string, number> = useMemo(
    () => ({ ...(instance?.system_scores ?? {}), ...systemOverrides }),
    [instance, systemOverrides],
  );

  /**
   * Effective reviewer stages for THIS instance (per-employee workflow).
   * Derived from `enabled_stages` and pruned to stages whose reviewer slot
   * on the instance is actually mapped — mirrors the workflow engine's
   * auto-skip behaviour (see `effectiveStages`). Never hardcode the chain.
   */
  const effectiveChain = useMemo<AnnualReviewerRole[]>(() => {
    const enabled = (instance?.enabled_stages ?? []) as AnnualReviewerRole[];
    const reviewerId: Record<AnnualReviewerRole, string | null | undefined> = {
      self: instance?.employee_id ?? null,
      manager: (instance as any)?.manager_id ?? null,
      skip_manager: (instance as any)?.skip_id ?? null,
      dept_head: (instance as any)?.dept_head_id ?? null,
      bu_head: (instance as any)?.bu_head_id ?? null,
      hr: (instance as any)?.hr_id ?? null,
    };
    return enabled.filter((s) => s === 'self' || !!reviewerId[s]);
  }, [instance]);

  const sumCriteria = useMemo(() => {
    // Cascade from highest → lowest across the effective chain only.
    const HIGH_TO_LOW: AnnualReviewerRole[] = ['hr', 'bu_head', 'dept_head', 'skip_manager', 'manager', 'self'];
    for (const role of HIGH_TO_LOW) {
      if (!effectiveChain.includes(role)) continue;
      const r = responses.find((x) => x.reviewer_role === role);
      if (r) return computeCriteriaScore(criteria, r.criteria_scores ?? {});
    }
    return computeCriteriaScore(criteria, {});
  }, [criteria, responses, effectiveChain]);

  const overall = computeOverallScore(sysCfg, merged, sumCriteria);

  // Phase 2 — blended final score preview using configurable stage weights.
  const stageWeights = useMemo(
    () => resolveStageWeights(instance ?? null, template ?? null),
    [instance, template],
  );
  const blended = useMemo(() => {
    const systemSum = Object.values(merged ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);
    return computeFinalScore({
      stageWeights,
      responsesByRole: responsesToRoleMap(responses ?? []),
      systemScoreTotal: systemSum,
      criteriaWeightedScore: sumCriteria.totalCriteriaScore,
    });
  }, [stageWeights, responses, merged, sumCriteria.totalCriteriaScore]);
  const usingBlend =
    (Object.values(stageWeights).some((v) => (v ?? 0) > 0)) &&
    !(stageWeights.criteria === 100 && Object.keys(stageWeights).length === 1);

  const missingStages = useMemo(() => {
    // Required = every effective stage EXCEPT `hr` (HR is the finalizer).
    const need = effectiveChain.filter((s) => s !== 'hr');
    return need.filter((r) => !responses.find((x) => x.reviewer_role === r && x.is_locked));
  }, [responses, effectiveChain]);

  const canFinalize = missingStages.length === 0;

  const onSaveSystemScores = async () => {
    if (!instance) return;
    try {
      await saveSystemScores.mutateAsync({ instanceId: instance.id, systemScores: merged });
      setSystemOverrides({});
      toast.success('System scores saved.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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
      <SheetContent
        side="right"
        className="w-screen max-w-none sm:max-w-none p-0 flex flex-col"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="max-w-6xl mx-auto w-full">
            <SheetTitle>HR Finalization</SheetTitle>
            <SheetDescription>
              Review the comparison across all reviewers, override system scores if needed,
              pick a final rating, then finalize.
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-6xl mx-auto w-full space-y-4">
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
            eligibilityRemark={instance?.eligibility_remark}
            employeeId={instance?.employee_id}
            fiscalYear={fiscalYear ?? undefined}
          />

          {instance && sysCfg.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={onSaveSystemScores}
                disabled={saveSystemScores.isPending}
              >
                {saveSystemScores.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save system scores
              </Button>
            </div>
          )}

          {instance && (template?.sections.eligibility_criteria?.length ?? 0) > 0 && (
            <EligibilityInputsEditor
              instanceId={instance.id}
              criteria={template!.sections.eligibility_criteria!}
              initial={(instance.eligibility_inputs ?? {}) as Record<string, string | number | boolean>}
              initialRemark={instance.eligibility_remark ?? ''}
            />
          )}

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
            {usingBlend && (
              <div className="mt-2 border-t pt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Blended final score (configured weights)</span>
                  <span className="font-semibold tabular-nums">
                    {blended.rawScore_0_100 != null ? blended.rawScore_0_100.toFixed(2) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rating axis (out of 5)</span>
                  <span className="font-semibold tabular-nums">
                    {blended.scaled_0_5 != null ? blended.scaled_0_5.toFixed(2) : '—'} / 5
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Blend:{' '}
                  {Object.entries(stageWeights)
                    .filter(([, v]) => (v ?? 0) > 0)
                    .map(([k, v]) => `${k} ${v}%`)
                    .join(' · ')}
                  {blended.renormalised && ' · weights renormalised (some stages missing)'}
                  {instance?.stage_weights_override ? ' · per-employee override active' : ''}
                </p>
              </div>
            )}
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

          {instance && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Activity timeline</Label>
                <Button
                  variant="ghost" size="sm" className="gap-1.5 h-7 text-xs"
                  onClick={() => setReassignOpen(true)}
                >
                  <UserCog className="h-3.5 w-3.5" /> Reassign reviewer
                </Button>
              </div>
              <InstanceTimeline instanceId={instance.id} />
            </div>
          )}
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-10 bg-background border-t px-6 py-3">
          <div className="max-w-6xl mx-auto w-full flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!canFinalize || finalize.isPending}>
              {finalize.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Finalize
            </Button>
          </div>
        </SheetFooter>
        {instance && (
          <ReassignReviewerDialog
            open={reassignOpen}
            onOpenChange={setReassignOpen}
            instance={instance}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
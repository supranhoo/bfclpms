import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { StageWeightKey } from '@/lib/annualReview/finalScore';
import type { RunningFinalScoreOutput } from '@/lib/annualReview/runningFinalScore';

const LABELS: Record<StageWeightKey, string> = {
  self: 'Self',
  manager: 'Manager',
  skip_manager: 'Skip',
  dept_head: 'Dept Head',
  bu_head: 'BU Head',
  hr: 'HR',
  system: 'System',
  criteria: 'Criteria',
};

/**
 * Muted read-only card shown on Dept Head / BU Head detail pages that projects
 * the employee's cycle-final score from the stages already locked. Uses the
 * same math the HR finalization RPC will use — pending stages are re-normalised
 * out until they're submitted.
 *
 * Hides itself when no stage has been locked yet (nothing meaningful to show).
 */
export function RunningFinalScoreCard({
  running,
}: {
  running: RunningFinalScoreOutput;
}) {
  if (!running.hasLockedStage || running.score_0_100 == null) return null;

  const contribLabels = running.contributing
    .map((k) => LABELS[k])
    .filter(Boolean);
  const pendingLabels = running.pending.map((k) => LABELS[k]).filter(Boolean);
  const totalBuckets = contribLabels.length + pendingLabels.length;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">
            Projected final score to date
          </CardTitle>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How this score is calculated"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Projected using the same weights HR will apply. Pending stages
                are re-normalised until they're submitted, so this number will
                shift as later reviewers weigh in.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-3">
          <p className="text-3xl font-semibold tabular-nums">
            {running.score_0_100.toFixed(1)}
            <span className="text-base font-normal text-muted-foreground"> / 100</span>
          </p>
          {running.scaled_0_5 != null && (
            <Badge variant="outline" className="text-xs">
              {running.scaled_0_5.toFixed(2)} / 5
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Based on <strong>{contribLabels.length}</strong> of{' '}
          <strong>{totalBuckets}</strong> stages submitted so far.
          {pendingLabels.length > 0 && (
            <> Pending: {pendingLabels.join(', ')}.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
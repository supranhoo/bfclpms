import { Check } from 'lucide-react';
import { STAGE_LABEL, STAGE_TO_STATUS } from '@/lib/annualReview/constants';
import { enabledChain } from '@/lib/annualReview/stageChain';
import type { AnnualReviewStatus, AnnualReviewerRole } from '@/types/annualReview';

function stageState(
  stage: AnnualReviewerRole,
  status: AnnualReviewStatus,
  chain: AnnualReviewerRole[],
): 'done' | 'active' | 'pending' {
  if (status === 'completed') return 'done';
  const target = STAGE_TO_STATUS[stage];
  const idxStage = chain.indexOf(stage);
  const idxCurrent = chain.findIndex((s) => STAGE_TO_STATUS[s] === status);
  if (idxCurrent < 0) return 'pending';
  if (idxStage < idxCurrent) return 'done';
  if (target === status) return 'active';
  return 'pending';
}

export function AnnualReviewStageTracker({
  status,
  enabledStages,
}: {
  status: AnnualReviewStatus;
  /** Per-instance enabled chain. Omit to render the full 5-stage chain. */
  enabledStages?: AnnualReviewerRole[];
}) {
  const chain = enabledChain(enabledStages);
  return (
    <ol className="flex items-center w-full gap-2 md:gap-4 overflow-x-auto py-2" aria-label="Annual review progress">
      {chain.map((stage, i) => {
        const s = stageState(stage, status, chain);
        const circle =
          s === 'done'
            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
            : s === 'active'
            ? 'bg-orange-500/20 border-orange-500 text-orange-400 animate-pulse border-2'
            : 'bg-muted border-border text-muted-foreground';
        const line = s === 'done' ? 'bg-emerald-500/60' : 'bg-border';
        return (
          <li key={stage} className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 last:flex-none">
            <div className={`h-10 w-10 shrink-0 rounded-full border flex items-center justify-center text-sm font-semibold ${circle}`}>
              {s === 'done' ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-xs md:text-sm truncate ${s === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>
              {STAGE_LABEL[stage]}
            </span>
            {i < chain.length - 1 && <div className={`hidden md:block h-px flex-1 ${line}`} />}
          </li>
        );
      })}
    </ol>
  );
}
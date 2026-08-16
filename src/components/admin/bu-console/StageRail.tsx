/**
 * ADR-289 — the pipeline, folded into the console surface.
 *
 * What used to be a Pipeline tab is now a single rail of stage chips above the
 * tree: how much work is waiting where (items + distinct people, POLICY
 * §CONSOLE-DISTINCT-PEOPLE), and clicking a chip sets the stage the review
 * worksheet works at. Read-only data — the acting happens in the worksheet.
 */
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBuConsolePipeline, type BuConsoleScope } from '@/hooks/useBuConsole';
import { sortStages, stageLabel } from './pipelineStages';

interface Props {
  scope: BuConsoleScope | null;
  stage: string;
  onStageChange: (stage: string) => void;
}

export function StageRail({ scope, stage, onStageChange }: Props) {
  const args = useMemo(
    () => (scope ? { ...scope, stage: null as string | null, page: 1, pageSize: 1 } : null),
    [scope],
  );
  const { data, isFetching } = useBuConsolePipeline(args);

  if (!scope) return null;
  if (isFetching && !data) return <Skeleton className="h-[52px] w-full rounded-lg" />;
  if (data && !data.authorized) return null;

  const stages = sortStages(data?.stages ?? []).filter(s => s.stage !== 'approved');
  if (stages.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Review stages"
      className="flex snap-x gap-1.5 overflow-x-auto rounded-lg border bg-card p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {stages.map(s => {
        const active = s.stage === stage;
        return (
          <button
            key={s.stage}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onStageChange(s.stage)}
            className={cn(
              'min-h-11 shrink-0 snap-start rounded-md border px-3 py-1 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted',
            )}
          >
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {stageLabel(s.stage)}
            </span>
            <span className="block text-xs font-semibold tabular-nums">
              {s.kpi_count}
              <span className="ml-1 font-normal text-muted-foreground">
                items · {s.employee_count} people
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
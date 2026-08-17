/**
 * ADR-297 — the review counters for an open KRA, on one line.
 *
 * The old worksheet printed its own header (stage, KPI count, people, pending,
 * scored) above a duplicate KPI list. The list is gone; these counters stay, as
 * a single slim line under the KRA row. It reuses the same cached
 * `bu_console_run_snapshot` query the people strips read, so it costs no extra
 * round-trip.
 */
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { BuConsoleScope } from '@/hooks/useBuConsole';
import { useRunSnapshot } from '@/hooks/useBuConsoleRun';
import { runCounters } from './reviewRunModel';
import { stageLabel } from './pipelineStages';

const PAGE_SIZE = 100;

interface Props {
  scope: BuConsoleScope;
  categoryId: string | null;
  kraName: string;
  stage: string;
}

export function KraReviewBar({ scope, categoryId, kraName, stage }: Props) {
  const args = useMemo(
    () => ({ ...scope, stage, categoryId, kraName, page: 1, pageSize: PAGE_SIZE }),
    [scope, stage, categoryId, kraName],
  );
  const { data } = useRunSnapshot(args);
  const counters = useMemo(() => runCounters(data?.cells ?? []), [data]);

  if (!data?.authorized) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">
        Review · {stageLabel(stage)}
      </span>
      <Badge variant="outline">{data.employee_total} people</Badge>
      <Badge variant="outline" className="border-warning/40 text-warning">
        {counters.pending} pending
      </Badge>
      <Badge variant="outline" className="border-success/40 text-success">
        {counters.done} scored
      </Badge>
      {counters.locked > 0 && <Badge variant="outline">{counters.locked} approved</Badge>}
    </div>
  );
}

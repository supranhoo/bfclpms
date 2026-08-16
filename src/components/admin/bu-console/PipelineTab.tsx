/**
 * ADR-284 — Review Pipeline tab of the Performance Console.
 *
 * Shows where the current scope's review work is sitting: a stage rail with
 * pending counts (items + distinct people, POLICY §CONSOLE-DISTINCT-PEOPLE),
 * and a server-paged employee list that deep-links into the existing
 * scorecard. Read-only for every tier — actions stay on the scorecard.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBuConsolePipeline, type BuConsoleScope } from '@/hooks/useBuConsole';
import { ArrowUpRight } from 'lucide-react';

const STAGE_LABEL: Record<string, string> = {
  self_review: 'Self review',
  manager_check: 'Manager',
  functional_manager_check: 'Functional manager',
  skip_level_check: 'Skip level',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
  approved: 'Approved',
};

/** Display order of the rail — unknown stages are appended, never dropped. */
const STAGE_ORDER = [
  'self_review', 'manager_check', 'functional_manager_check',
  'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved',
];

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ');
}

export function sortStages<T extends { stage: string }>(stages: T[]): T[] {
  const idx = (s: string) => {
    const i = STAGE_ORDER.indexOf(s);
    return i === -1 ? STAGE_ORDER.length : i;
  };
  return [...stages].sort((a, b) => idx(a.stage) - idx(b.stage) || a.stage.localeCompare(b.stage));
}

interface Props {
  scope: BuConsoleScope | null;
}

export function PipelineTab({ scope }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const args = useMemo(
    () => (scope ? { ...scope, stage, page, pageSize: 50 } : null),
    [scope, stage, page],
  );
  const { data, isFetching } = useBuConsolePipeline(args);

  if (!scope) {
    return (
      <Alert>
        <AlertTitle>Apply a scope first</AlertTitle>
        <AlertDescription>
          Pick a review period and any business units, then load the console to see the pipeline.
        </AlertDescription>
      </Alert>
    );
  }

  if (isFetching && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (data && !data.authorized) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You do not have permission to open this console.</AlertDescription>
      </Alert>
    );
  }

  const stages = sortStages(data?.stages ?? []);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size || 50)));

  return (
    <div className="space-y-3">
      {/* Stage rail */}
      <div className="flex snap-x gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => { setStage(null); setPage(1); }}
          className={`snap-start shrink-0 rounded-lg border px-3 py-2 text-left transition ${
            stage === null ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">All stages</p>
          <p className="text-sm font-semibold">{data?.employee_total ?? 0} people</p>
        </button>
        {stages.map(s => (
          <button
            key={s.stage}
            type="button"
            onClick={() => { setStage(s.stage); setPage(1); }}
            aria-pressed={stage === s.stage}
            className={`snap-start shrink-0 rounded-lg border px-3 py-2 text-left transition ${
              stage === s.stage ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            } ${s.stage === 'approved' ? 'opacity-80' : ''}`}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {stageLabel(s.stage)}
            </p>
            <p className="text-sm font-semibold">
              {s.kpi_count}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                items · {s.employee_count} people
              </span>
            </p>
          </button>
        ))}
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground">No review items in this scope.</p>
        )}
      </div>

      {/* Employee list */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Waiting with</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map(r => (
              <TableRow key={r.employee_id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {r.employee_name ?? '—'}
                  {r.employee_code && (
                    <span className="ml-1 text-xs text-muted-foreground">({r.employee_code})</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.department_name ?? '—'}</TableCell>
                <TableCell><Badge variant="outline">{stageLabel(r.pending_stage)}</Badge></TableCell>
                <TableCell className="text-right">{r.pending_kpis}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.total_kpis}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.last_activity_at ? format(new Date(r.last_activity_at), 'dd MMM yyyy') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      navigate(
                        `/dashboard?employee=${r.employee_id}&period=${encodeURIComponent(scope.period)}&year=${scope.year}`,
                      )
                    }
                  >
                    Open <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(data?.rows.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Nothing pending here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span>Page {data?.page ?? page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

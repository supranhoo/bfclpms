/**
 * ADR-208 — pick the employee's low-scoring KPIs as PIP improvement areas.
 * Shows KRA → KPI name and the stored score only; never the formula or the
 * rating-band scoring logic.
 */
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ShieldCheck, Target } from 'lucide-react';
import { useLowScoringKpis } from '@/hooks/useLowScoringKpis';
import { kpiAreaLabel, monthLabel } from '@/lib/pip/lowScoringKpis';
import type { MonthKey } from '@/hooks/useMonthlyTrend';

interface LowScoringKpiPickerProps {
  employeeId?: string;
  months: MonthKey[];
  /** Currently selected improvement areas (KPI labels included). */
  selected: string[];
  onToggle: (label: string) => void;
}

export function LowScoringKpiPicker({ employeeId, months, selected, onToggle }: LowScoringKpiPickerProps) {
  const { groups, threshold, isLoading, error } = useLowScoringKpis(employeeId, months);

  const windowLabel =
    months.length > 0
      ? `${monthLabel(months[0].month, months[0].year)} – ${monthLabel(months[months.length - 1].month, months[months.length - 1].year)}`
      : '—';

  if (!employeeId) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Select an employee to list their low-scoring KPIs.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center">
        <ShieldCheck className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">No KPIs below the threshold in this window</p>
        <p className="text-xs text-muted-foreground">
          Window {windowLabel}{threshold != null ? ` · threshold ${threshold.toFixed(2)}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Target className="h-3.5 w-3.5" />
        Window {windowLabel}{threshold != null ? ` · scoring below ${threshold.toFixed(2)}` : ''}
      </div>

      {groups.map(group => (
        <div key={group.kraName} className="space-y-2">
          <div className="text-sm font-medium">{group.kraName}</div>
          <div className="space-y-1">
            {group.rows.map(row => {
              const label = kpiAreaLabel(row);
              const id = `kpi-area-${row.kpiId}`;
              return (
                <label
                  key={row.kpiId}
                  htmlFor={id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    id={id}
                    checked={selected.includes(label)}
                    onCheckedChange={() => onToggle(label)}
                  />
                  <span className="flex-1 text-sm">{row.kpiName}</span>
                  <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
                    {monthLabel(row.month, row.year)} · {row.score.toFixed(2)}
                  </Badge>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

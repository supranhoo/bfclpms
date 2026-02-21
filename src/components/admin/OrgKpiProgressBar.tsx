import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, ArrowUpRight } from 'lucide-react';

interface CategoryProgress {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  entered: number;
  propagated: number;
}

interface OrgKpiProgressBarProps {
  totalKpis: number;
  enteredKpis: number;
  propagatedKpis: number;
  categoryProgress: CategoryProgress[];
}

export function OrgKpiProgressBar({ totalKpis, enteredKpis, propagatedKpis, categoryProgress }: OrgKpiProgressBarProps) {
  const pendingKpis = totalKpis - enteredKpis - propagatedKpis;
  const enteredPct = totalKpis > 0 ? (enteredKpis / totalKpis) * 100 : 0;
  const propagatedPct = totalKpis > 0 ? (propagatedKpis / totalKpis) * 100 : 0;
  const allDone = propagatedKpis === totalKpis && totalKpis > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allDone ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Clock className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {propagatedKpis + enteredKpis} of {totalKpis} KPIs Entered
          </span>
        </div>
        <span className="text-sm font-semibold">
          {totalKpis > 0 ? Math.round(((propagatedKpis + enteredKpis) / totalKpis) * 100) : 0}%
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {/* Propagated segment (green) */}
        <div
          className="absolute left-0 top-0 h-full bg-green-500 transition-all"
          style={{ width: `${propagatedPct}%` }}
        />
        {/* Entered segment (primary/blue) */}
        <div
          className="absolute top-0 h-full bg-primary transition-all"
          style={{ left: `${propagatedPct}%`, width: `${enteredPct}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-secondary border border-border" />
          Pending ({pendingKpis})
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          Entered ({enteredKpis})
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Propagated ({propagatedKpis})
        </span>
      </div>

      {categoryProgress.length > 1 && (
        <div className="flex flex-wrap gap-2 min-w-0">
          {categoryProgress.map(cat => {
            const catPending = cat.total - cat.entered - cat.propagated;
            return (
              <Badge
                key={cat.categoryId}
                variant={cat.propagated === cat.total ? 'default' : 'outline'}
                className="gap-1.5 text-xs"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color || '#6B7280' }}
                />
                {cat.categoryName}: {catPending}P / {cat.entered}E / {cat.propagated}Pr
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

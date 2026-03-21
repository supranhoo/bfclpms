import { User } from 'lucide-react';
import { RatingBadge } from '@/components/ui/RatingBadge';
import { useManagerKpiScore } from '@/hooks/useManagerKpiScore';
import { KPI } from '@/hooks/useKpis';

interface ManagerKpiBenchmarkProps {
  kpi: KPI;
}

export function ManagerKpiBenchmark({ kpi }: ManagerKpiBenchmarkProps) {
  const { managerName, finalScore, achievedValue, isLoading } = useManagerKpiScore({
    employeeId: kpi.employee_id,
    kpiName: kpi.kpi_name,
    reviewPeriod: kpi.review_period,
    reviewYear: kpi.review_year,
  });

  if (isLoading || !managerName) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <User className="h-3.5 w-3.5" />
        <span>Manager's Score</span>
        <span className="text-foreground font-semibold">({managerName})</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        {achievedValue !== null && (
          <span className="text-muted-foreground">
            Value: <span className="text-foreground font-medium">{achievedValue}</span>
          </span>
        )}
        <RatingBadge score={finalScore} />
      </div>
    </div>
  );
}

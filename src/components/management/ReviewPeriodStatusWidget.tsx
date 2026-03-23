import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, Lock, Unlock } from 'lucide-react';
import { STAGE_LABELS } from '@/hooks/useReviewPeriodGovernance';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface PeriodStatus {
  id: string;
  period_name: string;
  review_year: number;
  current_stage: string;
  completion_percentage: number;
  is_locked: boolean;
  lock_count: number;
}

interface Props {
  fiscalStartYear: number;
  selectedMonths: string[];
}

export function ReviewPeriodStatusWidget({ fiscalStartYear, selectedMonths }: Props) {
  // Map selected months to their calendar years
  const monthYearPairs = selectedMonths.map(month => {
    const monthIndex = MONTHS.indexOf(month);
    const calendarYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
    return { month, year: calendarYear };
  });

  // Group by year for queries
  const yearMonthMap = new Map<number, string[]>();
  monthYearPairs.forEach(({ month, year }) => {
    if (!yearMonthMap.has(year)) yearMonthMap.set(year, []);
    yearMonthMap.get(year)!.push(month);
  });

  const { data: periods, isLoading } = useQuery({
    queryKey: ['review-period-status-widget', fiscalStartYear, selectedMonths],
    queryFn: async () => {
      // Fetch review periods for all relevant years
      const allPeriods: any[] = [];
      for (const [year, months] of yearMonthMap.entries()) {
        const { data, error } = await supabase
          .from('review_periods')
          .select('*')
          .eq('review_year', year)
          .in('period_name', months)
          .order('period_name');
        if (error) throw error;
        if (data) allPeriods.push(...data);
      }

      // Get KPI statuses for completion calculation, filtered to selected months
      const kpiPromises = Array.from(yearMonthMap.entries()).map(async ([year, months]) => {
        const { data } = await supabase
          .from('kpis')
          .select('review_period, review_year, status')
          .eq('review_year', year)
          .in('review_period', months);
        return data || [];
      });
      const kpiResults = await Promise.all(kpiPromises);
      const kpiData = kpiResults.flat();

      const kpiCounts: Record<string, number> = {};
      const kpiApproved: Record<string, number> = {};
      kpiData.forEach(kpi => {
        const key = `${kpi.review_period}-${kpi.review_year}`;
        kpiCounts[key] = (kpiCounts[key] || 0) + 1;
        if (kpi.status === 'approved') {
          kpiApproved[key] = (kpiApproved[key] || 0) + 1;
        }
      });

      // Get lock counts per period
      const periodIds = allPeriods.map(p => p.id);
      let lockCounts: Record<string, number> = {};
      if (periodIds.length > 0) {
        const { data: locks } = await supabase
          .from('review_period_locks')
          .select('review_period_id')
          .in('review_period_id', periodIds)
          .eq('is_locked', true);
        (locks || []).forEach(l => {
          lockCounts[l.review_period_id] = (lockCounts[l.review_period_id] || 0) + 1;
        });
      }

      return allPeriods.map(rp => {
        const key = `${rp.period_name}-${rp.review_year}`;
        const total = kpiCounts[key] || 0;
        const approved = kpiApproved[key] || 0;
        return {
          id: rp.id,
          period_name: rp.period_name,
          review_year: rp.review_year,
          current_stage: (rp as any).current_stage || 'planning',
          completion_percentage: total > 0 ? Math.round((approved / total) * 100) : 0,
          is_locked: rp.is_locked || false,
          lock_count: lockCounts[rp.id] || 0,
        };
      }) as PeriodStatus[];
    },
    staleTime: 60_000,
  });

  if (isLoading || !periods || periods.length === 0) return null;

  // Show last 3 periods
  const recent = periods.slice(-3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Review Periods</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.map(p => (
          <div key={p.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{p.period_name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {STAGE_LABELS[p.current_stage] || p.current_stage}
                </Badge>
                {p.is_locked ? (
                  <Lock className="h-3 w-3 text-destructive" />
                ) : (
                  <Unlock className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </div>
            <Progress value={p.completion_percentage} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{p.completion_percentage}% complete</span>
              {p.lock_count > 0 && <span>{p.lock_count} active lock(s)</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

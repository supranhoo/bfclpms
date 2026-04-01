import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Get the previous N months as { month, year } tuples */
function getPreviousMonths(currentMonth: string, currentYear: number, count: number) {
  const idx = MONTHS.indexOf(currentMonth);
  if (idx === -1) return [];
  const results: { month: string; year: number }[] = [];
  for (let i = 1; i <= count; i++) {
    let mi = idx - i;
    let yr = currentYear;
    while (mi < 0) { mi += 12; yr -= 1; }
    results.push({ month: MONTHS[mi], year: yr });
  }
  return results;
}

/** 8-stage fallback */
function getBestScore(sub: {
  final_score: number | null;
  management_score: number | null;
  auditor_score: number | null;
  hr_pms_score: number | null;
  skip_level_score: number | null;
  manager_score: number | null;
  self_score: number | null;
}): number | null {
  return sub.final_score
    ?? sub.management_score
    ?? sub.auditor_score
    ?? sub.hr_pms_score
    ?? sub.skip_level_score
    ?? sub.manager_score
    ?? sub.self_score
    ?? null;
}

function scoreColor(pct: number): string {
  if (pct >= 80) return 'text-green-600 dark:text-green-400';
  if (pct >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function progressColor(pct: number): string {
  if (pct >= 80) return '[&>div]:bg-green-500';
  if (pct >= 60) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-red-500';
}

interface PreviousMonthsScoreMiniProps {
  employeeId: string;
  currentMonth: string;
  currentYear: number;
  currentScore?: number | null;
}

interface PrevMonthResult {
  month: string;
  year: number;
  score: number | null;
  percentage: number | null;
}

export function PreviousMonthsScoreMini({
  employeeId,
  currentMonth,
  currentYear,
  currentScore,
}: PreviousMonthsScoreMiniProps) {
  const prevMonths = useMemo(
    () => getPreviousMonths(currentMonth, currentYear, 2),
    [currentMonth, currentYear],
  );

  const { data: results } = useQuery({
    queryKey: ['prev-months-score', employeeId, currentMonth, currentYear],
    queryFn: async (): Promise<PrevMonthResult[]> => {
      if (prevMonths.length === 0) return [];

      const out: PrevMonthResult[] = [];

      for (const pm of prevMonths) {
        // 1. Fetch KPIs for this employee + period
        const { data: kpis, error: kErr } = await supabase
          .from('kpis')
          .select('id, weightage')
          .eq('employee_id', employeeId)
          .eq('review_period', pm.month)
          .eq('review_year', pm.year);

        if (kErr || !kpis || kpis.length === 0) {
          out.push({ month: pm.month, year: pm.year, score: null, percentage: null });
          continue;
        }

        const kpiIds = kpis.map(k => k.id);

        // 2. Fetch submissions
        const { data: subs } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na')
          .in('kpi_id', kpiIds);

        if (!subs || subs.length === 0) {
          out.push({ month: pm.month, year: pm.year, score: null, percentage: null });
          continue;
        }

        const subMap = new Map(subs.map(s => [s.kpi_id, s]));

        let totalWeight = 0;
        let weightedSum = 0;
        let hasAny = false;

        kpis.forEach(kpi => {
          const sub = subMap.get(kpi.id);
          if (!sub || sub.is_na) return;
          const sc = getBestScore(sub);
          if (sc === null) return;
          const w = kpi.weightage || 0;
          if (w <= 0) return;
          weightedSum += sc * w;
          totalWeight += w;
          hasAny = true;
        });

        if (hasAny && totalWeight > 0) {
          const avg = Math.round((weightedSum / totalWeight) * 100) / 100;
          out.push({
            month: pm.month,
            year: pm.year,
            score: avg,
            percentage: Math.round((avg / 5) * 1000) / 10,
          });
        } else {
          out.push({ month: pm.month, year: pm.year, score: null, percentage: null });
        }
      }

      return out;
    },
    enabled: prevMonths.length > 0 && !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  // Don't render if no data at all
  if (!results || results.every(r => r.score === null)) return null;

  return (
    <div className="w-full mt-2 pt-2 border-t border-border">
      <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
        Previous Months
      </p>
      <div className="space-y-1.5">
        {results.map(r => {
          if (r.score === null) {
            return (
              <div key={`${r.month}-${r.year}`} className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-muted-foreground truncate">
                  {r.month.slice(0, 3)} {r.year}
                </span>
                <span className="text-[10px] text-muted-foreground italic">No data</span>
              </div>
            );
          }

          const pct = r.percentage!;
          const trendVsCurrent = currentScore != null
            ? r.score! < currentScore ? 'up' : r.score! > currentScore ? 'down' : 'same'
            : 'same';

          return (
            <div key={`${r.month}-${r.year}`} className="space-y-0.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-muted-foreground font-medium truncate">
                  {r.month.slice(0, 3)} {r.year}
                </span>
                <div className="flex items-center gap-1">
                  <span className={cn('text-xs font-semibold', scoreColor(pct))}>
                    {pct.toFixed(1)}%
                  </span>
                  {trendVsCurrent === 'up' && (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  )}
                  {trendVsCurrent === 'down' && (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  {trendVsCurrent === 'same' && (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </div>
              <Progress
                value={pct}
                className={cn('h-1.5', progressColor(pct))}
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {r.score!.toFixed(2)}/5
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

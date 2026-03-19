import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, ExternalLink } from 'lucide-react';

const FISCAL_MONTHS = [
  'July', 'August', 'September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May', 'June',
];

const MONTHS_ALL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DirectReporteesMonitorProps {
  fiscalStartYear: number;
  selectedMonths: string[];
}

const getScoreBg = (score: number) => {
  if (score >= 4.25) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
  if (score >= 3.5) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
  if (score >= 2.5) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
  return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
};

export function DirectReporteesMonitor({ fiscalStartYear, selectedMonths }: DirectReporteesMonitorProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['direct-reportees-monitor', user?.id, fiscalStartYear, selectedMonths],
    queryFn: async () => {
      if (!user?.id) return { reportees: [], monthScores: new Map() };

      // Get direct reports
      const { data: reportees, error: repError } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation, departments (name)')
        .eq('reporting_manager_id', user.id);

      if (repError) throw repError;
      if (!reportees || reportees.length === 0) return { reportees: [], monthlyData: [] };

      const reporteeIds = reportees.map(r => r.id);

      // Get fiscal period ranges
      const periodRanges = selectedMonths.map(month => {
        const monthIndex = MONTHS_ALL.indexOf(month);
        const calYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
        return { month, year: calYear };
      });

      // Group by year for querying
      const monthsByYear = new Map<number, string[]>();
      periodRanges.forEach(({ month, year }) => {
        if (!monthsByYear.has(year)) monthsByYear.set(year, []);
        monthsByYear.get(year)!.push(month);
      });

      // Fetch KPIs
      const allKpis: any[] = [];
      await Promise.all(
        Array.from(monthsByYear.entries()).map(async ([calYear, months]) => {
          const { data, error } = await supabase
            .from('kpis')
            .select('employee_id, weightage, review_period, review_year, status, review_submissions (final_score, management_score, auditor_score, manager_score, self_score)')
            .eq('review_year', calYear)
            .in('review_period', months)
            .in('employee_id', reporteeIds);
          if (error) throw error;
          if (data) allKpis.push(...data);
        })
      );

      // Build monthly scores per reportee
      // Map<employeeId, Map<month, { total, weightage }>>
      const empMonthly = new Map<string, Map<string, { total: number; weightage: number }>>();

      allKpis.forEach(kpi => {
        const s = kpi.review_submissions;
        const score = s?.final_score ?? s?.management_score ?? s?.auditor_score ?? s?.manager_score ?? s?.self_score ?? null;
        if (score === null) return;

        const w = kpi.weightage || 100;
        if (!empMonthly.has(kpi.employee_id)) empMonthly.set(kpi.employee_id, new Map());
        const monthMap = empMonthly.get(kpi.employee_id)!;
        const existing = monthMap.get(kpi.review_period) || { total: 0, weightage: 0 };
        existing.total += score * w;
        existing.weightage += w;
        monthMap.set(kpi.review_period, existing);
      });

      // Build table data
      const monthlyData = reportees.map(rep => {
        const monthMap = empMonthly.get(rep.id);
        const scores: Record<string, number | null> = {};
        selectedMonths.forEach(m => {
          const data = monthMap?.get(m);
          scores[m] = data && data.weightage > 0 ? data.total / data.weightage : null;
        });
        return { ...rep, scores };
      });

      return { reportees, monthlyData };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-40" /></CardContent>
      </Card>
    );
  }

  const hasData = data?.monthlyData?.length > 0;

  // Only show months that have at least one score across all reportees
  const activeMonths = hasData
    ? selectedMonths.filter(m =>
        data.monthlyData.some((r: any) => r.scores[m] !== null)
      )
    : [];

  const handleRowClick = (employeeId: string, month: string, year: number) => {
    navigate(`/dashboard?employee=${employeeId}&period=${month}&year=${year}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Direct Reportees — Score Trend
        </CardTitle>
        <CardDescription>
          Month-by-month weighted average (0-5 scale). Click a score to view details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData || activeMonths.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">
              {!hasData
                ? 'No direct reportees found for your account.'
                : 'No scored data available for the selected months.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">Employee</TableHead>
                  {activeMonths.map(m => (
                    <TableHead key={m} className="text-center min-w-[60px]">
                      {m.substring(0, 3)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthlyData.map((rep: any) => (
                  <TableRow key={rep.id}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <div>
                        <p className="text-sm font-medium">{rep.full_name}</p>
                        <p className="text-xs text-muted-foreground">{rep.employee_code} · {(rep.departments as any)?.name || '-'}</p>
                      </div>
                    </TableCell>
                    {activeMonths.map(m => {
                      const score = rep.scores[m];
                      const monthIndex = MONTHS_ALL.indexOf(m);
                      const calYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
                      return (
                        <TableCell key={m} className="text-center p-1">
                          {score !== null ? (
                            <button
                              onClick={() => handleRowClick(rep.id, m, calYear)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all ${getScoreBg(score)}`}
                            >
                              {score.toFixed(1)}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

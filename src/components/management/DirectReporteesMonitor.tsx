import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, ExternalLink } from 'lucide-react';

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
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isPrivileged = role === 'admin' || role === 'management' || role === 'hr_pms';

  const [reportingManagerId, setReportingManagerId] = useState<string>('__self__');
  const [businessUnitId, setBusinessUnitId] = useState<string>('__all__');

  // Fetch managers who have direct reports
  const { data: managers } = useQuery({
    queryKey: ['reportee-monitor-managers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, reporting_manager_id')
        .eq('is_active', true)
        .order('full_name');
      const mgrIds = new Set(data?.map(p => p.reporting_manager_id).filter(Boolean));
      return data?.filter(p => mgrIds.has(p.id)).map(p => ({
        id: p.id,
        name: p.employee_code ? `${p.full_name || 'Unknown'} (${p.employee_code})` : (p.full_name || 'Unknown'),
      })) || [];
    },
    enabled: isPrivileged,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch business units
  const { data: businessUnits } = useQuery({
    queryKey: ['reportee-monitor-bus'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name').order('name');
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const effectiveManagerId = reportingManagerId === '__self__' ? user?.id : reportingManagerId;

  const { data, isLoading } = useQuery({
    queryKey: ['direct-reportees-monitor', effectiveManagerId, businessUnitId, fiscalStartYear, selectedMonths],
    queryFn: async () => {
      if (!effectiveManagerId) return { reportees: [], monthlyData: [] };

      // Build profiles query
      let profilesQuery = supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation, department_id, departments (name, business_unit_id)')
        .eq('reporting_manager_id', effectiveManagerId)
        .eq('is_active', true);

      // Filter by business unit if selected
      if (businessUnitId !== '__all__') {
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .eq('business_unit_id', businessUnitId);
        const deptIds = depts?.map(d => d.id) || [];
        if (deptIds.length === 0) return { reportees: [], monthlyData: [] };
        profilesQuery = profilesQuery.in('department_id', deptIds);
      }

      const { data: reportees, error: repError } = await profilesQuery;
      if (repError) throw repError;
      if (!reportees || reportees.length === 0) return { reportees: [], monthlyData: [] };

      const reporteeIds = reportees.map(r => r.id);

      // Get fiscal period ranges
      const monthsByYear = new Map<number, string[]>();
      selectedMonths.forEach(month => {
        const monthIndex = MONTHS_ALL.indexOf(month);
        const calYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
        if (!monthsByYear.has(calYear)) monthsByYear.set(calYear, []);
        monthsByYear.get(calYear)!.push(month);
      });

      // Fetch KPIs
      // Fetch KPIs with batching for large reportee sets
      const allKpis: any[] = [];
      const idBatchSize = 100;
      const idBatches: string[][] = [];
      for (let i = 0; i < reporteeIds.length; i += idBatchSize) {
        idBatches.push(reporteeIds.slice(i, i + idBatchSize));
      }

      // Paginated fetch to avoid Supabase 1000-row default limit
      const pageBatchSize = 1000;
      await Promise.all(
        Array.from(monthsByYear.entries()).flatMap(([calYear, months]) =>
          idBatches.map(async (idBatch) => {
            let offset = 0;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await supabase
                .from('kpis')
                .select('employee_id, weightage, review_period, review_year, status, review_submissions (final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na)')
                .eq('review_year', calYear)
                .in('review_period', months)
                .in('employee_id', idBatch)
                .range(offset, offset + pageBatchSize - 1);
              if (error) throw error;
              if (data && data.length > 0) {
                allKpis.push(...data);
                offset += pageBatchSize;
                hasMore = data.length === pageBatchSize;
              } else {
                hasMore = false;
              }
            }
          })
        )
      );

      // Build monthly scores per reportee
      const empMonthly = new Map<string, Map<string, { total: number; weightage: number }>>();
      allKpis.forEach(kpi => {
        const s = kpi.review_submissions;
        if (s?.is_na) return;
        const score = (kpi.status === 'approved' ? s?.final_score : null)
          ?? s?.management_score ?? s?.auditor_score
          ?? s?.hr_pms_score ?? s?.skip_level_score
          ?? s?.manager_score ?? s?.self_score ?? null;
        if (score === null) return;
        const w = kpi.weightage || 100;
        if (!empMonthly.has(kpi.employee_id)) empMonthly.set(kpi.employee_id, new Map());
        const monthMap = empMonthly.get(kpi.employee_id)!;
        const existing = monthMap.get(kpi.review_period) || { total: 0, weightage: 0 };
        existing.total += score * w;
        existing.weightage += w;
        monthMap.set(kpi.review_period, existing);
      });

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
    enabled: !!effectiveManagerId,
    staleTime: 5 * 60 * 1000,
  });

  const hasData = (data?.monthlyData?.length ?? 0) > 0;

  const activeMonths = useMemo(() => hasData
    ? selectedMonths.filter(m => data!.monthlyData.some((r: any) => r.scores[m] !== null))
    : [], [hasData, data, selectedMonths]);

  // Compute average and sort
  const sortedData = useMemo(() => {
    if (!hasData) return [];
    return [...data!.monthlyData].map((rep: any) => {
      const vals = activeMonths.map(m => rep.scores[m]).filter((v: any) => v !== null) as number[];
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { ...rep, avg };
    }).sort((a: any, b: any) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [data, activeMonths, hasData]);

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
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3">
          {isPrivileged && (
            <Select value={reportingManagerId} onValueChange={setReportingManagerId}>
              <SelectTrigger className="w-[220px] h-9 text-xs">
                <SelectValue placeholder="Reporting Manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__self__">My Direct Reports</SelectItem>
                {managers?.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={businessUnitId} onValueChange={setBusinessUnitId}>
            <SelectTrigger className="w-[180px] h-9 text-xs">
              <SelectValue placeholder="Business Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Business Units</SelectItem>
              {businessUnits?.map(bu => (
                <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Skeleton className="h-40" />
        ) : !hasData || activeMonths.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">
              {!hasData
                ? 'No direct reportees found for the selected manager.'
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
                    <TableHead key={m} className="text-center min-w-[60px]">{m.substring(0, 3)}</TableHead>
                  ))}
                  <TableHead className="text-center min-w-[60px] font-semibold">Avg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((rep: any) => (
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
                    <TableCell className="text-center p-1">
                      {rep.avg !== null ? (
                        <Badge variant="outline" className={`text-xs font-semibold ${getScoreBg(rep.avg)}`}>
                          {rep.avg.toFixed(2)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
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

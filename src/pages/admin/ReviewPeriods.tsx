import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Lock, Unlock, AlertTriangle, FileText } from 'lucide-react';
import { format } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ReviewPeriodData {
  period_name: string;
  review_year: number;
  kpi_count: number;
  is_locked: boolean;
  locked_at: string | null;
  period_id: string | null;
}

export default function ReviewPeriods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch distinct periods from KPIs table
  const { data: kpiPeriods, isLoading: loadingKpis } = useQuery({
    queryKey: ['kpi-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('review_period, review_year')
        .not('review_period', 'is', null)
        .not('review_year', 'is', null);
      
      if (error) throw error;
      
      // Count KPIs per period
      const periodCounts: Record<string, number> = {};
      data?.forEach(kpi => {
        const key = `${kpi.review_period}-${kpi.review_year}`;
        periodCounts[key] = (periodCounts[key] || 0) + 1;
      });
      
      // Get unique periods
      const uniquePeriods = Object.keys(periodCounts).map(key => {
        const [period, year] = key.split('-');
        return {
          period_name: period,
          review_year: parseInt(year),
          kpi_count: periodCounts[key]
        };
      });
      
      return uniquePeriods;
    },
  });

  // Fetch existing review_periods for lock status
  const { data: reviewPeriods, isLoading: loadingPeriods } = useQuery({
    queryKey: ['review-periods-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('*');
      
      if (error) throw error;
      return data;
    },
  });

  // Combine KPI periods with lock status from review_periods
  const combinedPeriods: ReviewPeriodData[] = (kpiPeriods || []).map(kp => {
    const existing = reviewPeriods?.find(
      rp => rp.period_name === kp.period_name && rp.review_year === kp.review_year
    );
    return {
      period_name: kp.period_name,
      review_year: kp.review_year,
      kpi_count: kp.kpi_count,
      is_locked: existing?.is_locked || false,
      locked_at: existing?.locked_at || null,
      period_id: existing?.id || null
    };
  });

  // Toggle lock mutation - creates review_period record if it doesn't exist
  const toggleLock = useMutation({
    mutationFn: async ({ periodName, year, lock, periodId }: { periodName: string; year: number; lock: boolean; periodId: string | null }) => {
      if (periodId) {
        // Update existing record
        const updateData = lock
          ? { is_locked: true, locked_at: new Date().toISOString(), locked_by: user?.id }
          : { is_locked: false, locked_at: null, locked_by: null };
        
        const { error } = await supabase
          .from('review_periods')
          .update(updateData)
          .eq('id', periodId);
        
        if (error) throw error;
      } else {
        // Create new record with lock status
        const { error } = await supabase
          .from('review_periods')
          .insert({
            period_name: periodName,
            review_year: year,
            is_locked: lock,
            locked_at: lock ? new Date().toISOString() : null,
            locked_by: lock ? user?.id : null
          });
        
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-periods-admin'] });
      toast({ title: variables.lock ? 'Period locked' : 'Period unlocked' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update period', description: error.message, variant: 'destructive' });
    },
  });

  // Group periods by year
  const periodsByYear = combinedPeriods.reduce((acc, period) => {
    const year = period.review_year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(period);
    return acc;
  }, {} as Record<number, ReviewPeriodData[]>);

  const years = Object.keys(periodsByYear).map(Number).sort((a, b) => b - a);
  const isLoading = loadingKpis || loadingPeriods;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Calendar className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review Periods</h1>
            <p className="text-muted-foreground">All months with KRAs assigned</p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Locking Review Periods
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                When a period is locked, employees and managers cannot modify KPI submissions for that period. 
                Only admins can unlock periods. Use this to finalize completed review cycles.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Periods List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Loading review periods...
          </CardContent>
        </Card>
      ) : years.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No KRAs found in the system.</p>
            <p className="text-sm mt-1">Review periods will appear here once KRAs are assigned to employees.</p>
          </CardContent>
        </Card>
      ) : (
        years.map(year => (
          <Card key={year}>
            <CardHeader>
              <CardTitle className="text-lg">{year}</CardTitle>
              <CardDescription>
                {periodsByYear[year].length} period(s) • 
                {periodsByYear[year].filter(p => p.is_locked).length} locked • 
                {periodsByYear[year].reduce((sum, p) => sum + p.kpi_count, 0)} total KRAs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>KRAs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Locked At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodsByYear[year]
                    .sort((a, b) => MONTHS.indexOf(b.period_name) - MONTHS.indexOf(a.period_name))
                    .map(period => (
                    <TableRow key={`${period.period_name}-${period.review_year}`}>
                      <TableCell className="font-medium">{period.period_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{period.kpi_count} KRAs</Badge>
                      </TableCell>
                      <TableCell>
                        {period.is_locked ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            <Lock className="h-3 w-3 mr-1" />
                            Locked
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <Unlock className="h-3 w-3 mr-1" />
                            Open
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {period.locked_at ? format(new Date(period.locked_at), 'dd MMM yyyy, hh:mm a') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={period.is_locked ? 'outline' : 'destructive'}
                          size="sm"
                          onClick={() => toggleLock.mutate({ 
                            periodName: period.period_name, 
                            year: period.review_year, 
                            lock: !period.is_locked,
                            periodId: period.period_id 
                          })}
                          disabled={toggleLock.isPending}
                        >
                          {period.is_locked ? (
                            <>
                              <Unlock className="h-4 w-4 mr-1.5" />
                              Unlock
                            </>
                          ) : (
                            <>
                              <Lock className="h-4 w-4 mr-1.5" />
                              Lock
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
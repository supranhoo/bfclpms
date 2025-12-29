import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Lock, Unlock, Plus, Settings, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ReviewPeriod {
  id: string;
  period_name: string;
  review_year: number;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export default function ReviewPeriods() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPeriodMonth, setNewPeriodMonth] = useState('');
  const [newPeriodYear, setNewPeriodYear] = useState(new Date().getFullYear().toString());
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');

  // Fetch review periods
  const { data: periods, isLoading } = useQuery({
    queryKey: ['review-periods-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('*')
        .order('review_year', { ascending: false })
        .order('period_name', { ascending: false });
      
      if (error) throw error;
      return data as ReviewPeriod[];
    },
  });

  // Create period mutation
  const createPeriod = useMutation({
    mutationFn: async (period: { period_name: string; review_year: number; start_date?: string; end_date?: string }) => {
      const { error } = await supabase
        .from('review_periods')
        .insert(period);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-periods-admin'] });
      toast({ title: 'Review period created' });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create period', description: error.message, variant: 'destructive' });
    },
  });

  // Toggle lock mutation
  const toggleLock = useMutation({
    mutationFn: async ({ id, lock }: { id: string; lock: boolean }) => {
      const updateData = lock
        ? { is_locked: true, locked_at: new Date().toISOString(), locked_by: user?.id }
        : { is_locked: false, locked_at: null, locked_by: null };
      
      const { error } = await supabase
        .from('review_periods')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['review-periods-admin'] });
      toast({ title: variables.lock ? 'Period locked' : 'Period unlocked' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update period', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setNewPeriodMonth('');
    setNewPeriodYear(new Date().getFullYear().toString());
    setNewStartDate('');
    setNewEndDate('');
  };

  const handleCreatePeriod = () => {
    if (!newPeriodMonth || !newPeriodYear) return;
    
    createPeriod.mutate({
      period_name: newPeriodMonth,
      review_year: parseInt(newPeriodYear),
      start_date: newStartDate || undefined,
      end_date: newEndDate || undefined,
    });
  };

  // Group periods by year
  const periodsByYear = periods?.reduce((acc, period) => {
    const year = period.review_year;
    if (!acc[year]) acc[year] = [];
    acc[year].push(period);
    return acc;
  }, {} as Record<number, ReviewPeriod[]>) || {};

  const years = Object.keys(periodsByYear).map(Number).sort((a, b) => b - a);

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // Check if period already exists
  const periodExists = (month: string, year: string) => {
    return periods?.some(p => p.period_name === month && p.review_year === parseInt(year));
  };

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
            <p className="text-muted-foreground">Configure and manage monthly review periods</p>
          </div>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Period
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Review Period</DialogTitle>
              <DialogDescription>Add a new monthly review period</DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Month</Label>
                <Select value={newPeriodMonth} onValueChange={setNewPeriodMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(month => (
                      <SelectItem 
                        key={month} 
                        value={month}
                        disabled={periodExists(month, newPeriodYear)}
                      >
                        {month} {periodExists(month, newPeriodYear) && '(exists)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Year</Label>
                <Select value={newPeriodYear} onValueChange={setNewPeriodYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Start Date (Optional)</Label>
                  <Input 
                    type="date" 
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>End Date (Optional)</Label>
                  <Input 
                    type="date" 
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleCreatePeriod}
                disabled={!newPeriodMonth || !newPeriodYear || createPeriod.isPending}
              >
                Create Period
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            No review periods configured. Create your first period to get started.
          </CardContent>
        </Card>
      ) : (
        years.map(year => (
          <Card key={year}>
            <CardHeader>
              <CardTitle className="text-lg">{year}</CardTitle>
              <CardDescription>
                {periodsByYear[year].length} period(s) • 
                {periodsByYear[year].filter(p => p.is_locked).length} locked
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Locked At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodsByYear[year]
                    .sort((a, b) => MONTHS.indexOf(b.period_name) - MONTHS.indexOf(a.period_name))
                    .map(period => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.period_name}</TableCell>
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
                        {period.start_date ? format(new Date(period.start_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {period.end_date ? format(new Date(period.end_date), 'MMM d, yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {period.locked_at ? format(new Date(period.locked_at), 'MMM d, yyyy h:mm a') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={period.is_locked ? 'outline' : 'destructive'}
                          size="sm"
                          onClick={() => toggleLock.mutate({ id: period.id, lock: !period.is_locked })}
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

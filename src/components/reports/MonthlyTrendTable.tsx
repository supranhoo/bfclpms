import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { MonthKey, TrendEmployee } from '@/hooks/useMonthlyTrend';

function scoreClass(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  const pct = (score / 5) * 100;
  if (pct >= 80) return 'text-green-600 dark:text-green-400 font-semibold';
  if (pct >= 60) return 'text-yellow-600 dark:text-yellow-400 font-semibold';
  return 'text-red-600 dark:text-red-400 font-semibold';
}

function TrendIcon({ trend }: { trend: TrendEmployee['trend'] }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
  if (trend === 'flat') return <Minus className="h-4 w-4 text-muted-foreground" />;
  return <span className="text-xs text-muted-foreground">-</span>;
}

interface Props {
  months: MonthKey[];
  employees: TrendEmployee[];
  isLoading?: boolean;
}

export function MonthlyTrendTable({ months, employees, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No employee data found for the selected range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Employee</TableHead>
            <TableHead className="min-w-[140px]">Department</TableHead>
            <TableHead className="min-w-[180px]">Reporting Manager</TableHead>
            {months.map(m => (
              <TableHead key={m.key} className="text-center whitespace-nowrap">
                {m.label}
              </TableHead>
            ))}
            <TableHead className="text-center font-semibold">Avg</TableHead>
            <TableHead className="text-center">Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map(emp => (
            <TableRow key={emp.id}>
              <TableCell className="sticky left-0 bg-background z-10">
                <div className="font-medium">{emp.fullName}</div>
                <div className="text-xs text-muted-foreground">
                  {emp.employeeCode}{emp.designation ? ` • ${emp.designation}` : ''}
                </div>
              </TableCell>
              <TableCell className="text-sm">{emp.departmentName || '-'}</TableCell>
              <TableCell className="text-sm">{emp.reportingManagerName || '—'}</TableCell>
              {months.map(m => {
                const v = emp.monthlyScores[m.key];
                return (
                  <TableCell key={m.key} className={cn('text-center', scoreClass(v))}>
                    {v === null ? '-' : v.toFixed(2)}
                  </TableCell>
                );
              })}
              <TableCell className={cn('text-center', scoreClass(emp.avg))}>
                {emp.avg === null ? '-' : emp.avg.toFixed(2)}
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center">
                  <TrendIcon trend={emp.trend} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

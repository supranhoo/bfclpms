import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useSafetyDeptRiskTrend } from '@/hooks/useSafetyAnalytics';
import { format, parseISO } from 'date-fns';

/**
 * DeptRiskWidget
 * --------------
 * 12-month rolling per-department high-severity (high+critical) trend.
 * Renders a compact heat row per department; cell intensity scales to the
 * max value in the matrix. Reads `safety_analytics_dept_risk_trend` RPC.
 */
export default function DeptRiskWidget({ months = 6 }: { months?: number }) {
  const { data = [], isLoading } = useSafetyDeptRiskTrend(months);

  const { departments, monthLabels, matrix, max } = useMemo(() => {
    const deps = Array.from(new Set(data.map((r) => r.department_id ?? '(unassigned)')));
    const months = Array.from(new Set(data.map((r) => r.month))).sort();
    const m = new Map<string, Map<string, number>>();
    for (const r of data) {
      const key = r.department_id ?? '(unassigned)';
      if (!m.has(key)) m.set(key, new Map());
      m.get(key)!.set(r.month, r.high_severity);
    }
    const mat = deps.map((d) => months.map((mo) => m.get(d)?.get(mo) ?? 0));
    const max = Math.max(1, ...mat.flat());
    return { departments: deps, monthLabels: months, matrix: mat, max };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Department risk trend
        </CardTitle>
        <CardDescription>High-severity incidents per department over the last {months} months.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : departments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No high-severity incidents in the window — good news.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-muted-foreground font-normal pr-2">Department</th>
                  {monthLabels.map((m) => (
                    <th key={m} className="text-muted-foreground font-normal text-center">
                      {format(parseISO(m), 'MMM')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((dep, i) => (
                  <tr key={dep}>
                    <td className="pr-2 truncate max-w-[160px] font-mono text-[10px] text-muted-foreground">
                      {dep.slice(0, 8)}
                    </td>
                    {matrix[i].map((v, j) => {
                      const intensity = v / max;
                      const bg = v === 0
                        ? 'bg-muted'
                        : `bg-destructive`;
                      return (
                        <td key={j} className="text-center">
                          <div
                            className={`h-7 min-w-[28px] rounded flex items-center justify-center font-medium tabular-nums ${bg}`}
                            style={v > 0 ? { opacity: 0.25 + intensity * 0.75, color: 'white' } : undefined}
                            title={`${v} high-severity in ${monthLabels[j]}`}
                          >
                            {v || ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
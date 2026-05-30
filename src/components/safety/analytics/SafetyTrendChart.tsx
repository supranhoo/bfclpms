/**
 * Phase 10 — Safety Analytics v2: monthly trend chart
 * ---------------------------------------------------
 * Read-only chart fed by `mv_safety_incident_monthly_trend`. Pure
 * presentational component; all aggregation is done by
 * `aggregateMonthlyTrend()` in `@/lib/safetyAnalytics`.
 */
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { aggregateMonthlyTrend, type MonthlyTrendRow } from '@/lib/safetyAnalytics';

interface Props {
  rows: MonthlyTrendRow[];
}

export function SafetyTrendChart({ rows }: Props) {
  const data = useMemo(() => aggregateMonthlyTrend(rows), [rows]);
  const hasData = data.some((d) => d.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Incident Trend (12 months)
        </CardTitle>
        <CardDescription>
          Monthly incident volume by severity — aggregated across all business units.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No incident history in the last 12 months.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" stackId="sev" dataKey="critical" name="Critical"
                      stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.55} />
                <Area type="monotone" stackId="sev" dataKey="high"     name="High"
                      stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} />
                <Area type="monotone" stackId="sev" dataKey="medium"   name="Medium"
                      stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                <Area type="monotone" stackId="sev" dataKey="low"      name="Low"
                      stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { differenceInHours, differenceInDays, format, startOfDay, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { Activity, Clock, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { PersonalProductivityInsights } from './PersonalProductivityInsights';
import { useSlaTargetDays } from '@/hooks/useWorkflowSettings';

export interface QueryData {
  id: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  raised_by: string;
  raised_to: string;
  kpiName?: string | null;
  kraName?: string | null;
}

interface InboxInsightsProps {
  allQueries: QueryData[];
  teamQueries?: QueryData[];
  currentUserId?: string;
  notificationsCount: number;
  unreadCount: number;
  isLoading?: boolean;
}

function computeMetrics(queries: QueryData[], slaTargetDays: number) {
  const resolved = queries.filter(q => q.status === 'resolved' && q.resolved_at);
  const open = queries.filter(q => q.status === 'open');
  const responded = queries.filter(q => q.status === 'responded');

  // Response times in hours
  const responseTimes = resolved.map(q => {
    const created = new Date(q.created_at);
    const resolvedAt = new Date(q.resolved_at!);
    return differenceInHours(resolvedAt, created);
  }).filter(h => h >= 0);

  const avgResponseHours = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;
  const fastestHours = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const slowestHours = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

  // SLA compliance (resolved within target days)
  const withinSla = resolved.filter(q => {
    const hours = differenceInHours(new Date(q.resolved_at!), new Date(q.created_at));
    return hours <= slaTargetDays * 24;
  }).length;
  const slaPercent = resolved.length > 0 ? Math.round((withinSla / resolved.length) * 100) : null;

  // Volume by day (last 14 days)
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const day = startOfDay(subDays(new Date(), 13 - i));
    return { date: day, label: format(day, 'MMM dd'), count: 0 };
  });
  queries.forEach(q => {
    const created = startOfDay(new Date(q.created_at));
    const entry = last14Days.find(d => d.date.getTime() === created.getTime());
    if (entry) entry.count++;
  });

  // Status distribution
  const statusDist = [
    { name: 'Open', value: open.length, color: 'hsl(30 80% 55%)' },
    { name: 'Responded', value: responded.length, color: 'hsl(45 80% 55%)' },
    { name: 'Resolved', value: resolved.length, color: 'hsl(142 70% 45%)' },
  ].filter(s => s.value > 0);

  // Weekly comparison
  const thisWeekQueries = queries.filter(q => {
    const d = differenceInDays(new Date(), new Date(q.created_at));
    return d <= 7;
  }).length;
  const lastWeekQueries = queries.filter(q => {
    const d = differenceInDays(new Date(), new Date(q.created_at));
    return d > 7 && d <= 14;
  }).length;
  const weeklyChange = lastWeekQueries > 0
    ? Math.round(((thisWeekQueries - lastWeekQueries) / lastWeekQueries) * 100)
    : 0;

  // Health score (0-100)
  const slaScore = slaPercent ?? 80; // neutral when no data
  const backlogPenalty = Math.min(open.length * 5, 40);
  const responsePenalty = avgResponseHours > slaTargetDays * 24 ? 20 : 0;
  const healthScore = Math.max(0, Math.min(100, slaScore - backlogPenalty - responsePenalty));

  return {
    avgResponseHours, fastestHours, slowestHours,
    slaPercent, withinSla, totalResolved: resolved.length,
    openCount: open.length, respondedCount: responded.length,
    volumeByDay: last14Days.map(d => ({ label: d.label, count: d.count })),
    statusDist,
    thisWeekQueries, lastWeekQueries, weeklyChange,
    healthScore, totalQueries: queries.length,
  };
}

function formatHours(hours: number): string {
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return days < 2 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

export function InboxInsights({ allQueries, teamQueries = [], currentUserId, notificationsCount, unreadCount, isLoading }: InboxInsightsProps) {
  const slaTargetDays = useSlaTargetDays();
  const metrics = useMemo(() => computeMetrics(allQueries, slaTargetDays), [allQueries, slaTargetDays]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const healthColor = metrics.healthScore >= 80 ? 'text-green-600' : metrics.healthScore >= 50 ? 'text-amber-600' : 'text-destructive';
  const slaColor = metrics.slaPercent === null ? 'text-muted-foreground' : metrics.slaPercent >= 90 ? 'text-green-600' : metrics.slaPercent >= 70 ? 'text-amber-600' : 'text-destructive';

  return (
    <div className="space-y-6">
      {/* Health Score Banner */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className={cn('h-14 w-14 rounded-full flex items-center justify-center bg-primary/10')}>
                <Activity className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inbox Health Score</p>
                <p className={cn('text-3xl font-bold', healthColor)}>{metrics.healthScore}<span className="text-lg text-muted-foreground">/100</span></p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center sm:text-right">
              <div>
                <div className="flex items-center justify-center sm:justify-end gap-1">
                  {metrics.slaPercent !== null && metrics.slaPercent >= 90 ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                  <p className="text-xs text-muted-foreground">SLA Compliance</p>
                </div>
                <p className={cn('text-lg font-bold', slaColor)}>{metrics.slaPercent !== null ? `${metrics.slaPercent}%` : 'N/A'}</p>
                <p className="text-[10px] text-muted-foreground">Target: 90%</p>
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-end gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Avg Response</p>
                </div>
                <p className="text-lg font-bold text-foreground">{formatHours(metrics.avgResponseHours)}</p>
                <p className="text-[10px] text-muted-foreground">Target: {slaTargetDays}d</p>
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-end gap-1">
                  {metrics.weeklyChange > 0 ? <TrendingUp className="h-3.5 w-3.5 text-destructive" /> : <TrendingDown className="h-3.5 w-3.5 text-green-600" />}
                  <p className="text-xs text-muted-foreground">Open Queries</p>
                </div>
                <p className="text-lg font-bold text-foreground">{metrics.openCount}</p>
                <p className="text-[10px] text-muted-foreground">
                  {metrics.weeklyChange !== 0 ? `${metrics.weeklyChange > 0 ? '+' : ''}${metrics.weeklyChange}% vs last week` : 'Same as last week'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Queries" value={metrics.totalQueries} sublabel={`${metrics.totalResolved} resolved`} />
        <MetricCard label="Fastest Resolution" value={formatHours(metrics.fastestHours)} sublabel="Best case" />
        <MetricCard label="Slowest Resolution" value={formatHours(metrics.slowestHours)} sublabel="Worst case" />
        <MetricCard label="Notifications" value={notificationsCount} sublabel={`${unreadCount} unread`} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Query Volume (Last 14 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="count" name="Queries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.statusDist.length > 0 ? (
              <div className="h-48 flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={metrics.statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3}>
                      {metrics.statusDist.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-3 mt-1">
                  {metrics.statusDist.map(s => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.name} ({s.value})
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No query data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SLA & Completion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SLA Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Resolved within {slaTargetDays} days</span>
              <span className={cn('font-semibold', slaColor)}>{metrics.withinSla}/{metrics.totalResolved}</span>
            </div>
            <Progress value={metrics.slaPercent ?? 0} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metrics.slaPercent === null ? '— No resolved queries to measure' : metrics.slaPercent >= 90 ? '✅ Meeting SLA target of 90%' : `⚠️ Below SLA target of 90% (currently ${metrics.slaPercent}%)`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resolution Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Queries resolved</span>
              <span className="font-semibold text-foreground">
                {metrics.totalQueries > 0 ? Math.round((metrics.totalResolved / metrics.totalQueries) * 100) : 0}%
              </span>
            </div>
            <Progress value={metrics.totalQueries > 0 ? (metrics.totalResolved / metrics.totalQueries) * 100 : 0} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{metrics.openCount} open</span>
              <span>{metrics.respondedCount} responded</span>
              <span>{metrics.totalResolved} resolved</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal Productivity Insights */}
      {currentUserId && (
        <PersonalProductivityInsights
          allQueries={allQueries}
          teamQueries={teamQueries}
          currentUserId={currentUserId}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string | number; sublabel: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

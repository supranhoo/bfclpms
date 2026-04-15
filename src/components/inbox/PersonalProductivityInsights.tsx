import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { differenceInHours, differenceInDays, subDays } from 'date-fns';
import { Trophy, Zap, Target, Clock, TrendingUp, TrendingDown, Minus, AlertTriangle, Award, Shield, Flame } from 'lucide-react';
import { useSlaTargetDays } from '@/hooks/useWorkflowSettings';
interface QueryData {
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

interface PersonalProductivityInsightsProps {
  allQueries: QueryData[];
  teamQueries: QueryData[];
  currentUserId: string;
  isLoading?: boolean;
}

// SLA_HOURS removed — now configurable via useSlaTargetDays()

interface BadgeInfo {
  icon: React.ReactNode;
  label: string;
  description: string;
  earned: boolean;
  color: string;
}

function computePersonalMetrics(queries: QueryData[], currentUserId: string, slaHours: number) {
  const received = queries.filter(q => q.raised_to === currentUserId);
  const sent = queries.filter(q => q.raised_by === currentUserId);

  const resolvedReceived = received.filter(q => q.status === 'resolved' && q.resolved_at);
  const openReceived = received.filter(q => q.status === 'open');

  // Personal response times (for queries I resolved)
  const myResponseTimes = resolvedReceived.map(q => {
    return differenceInHours(new Date(q.resolved_at!), new Date(q.created_at));
  }).filter(h => h >= 0);

  const myAvgHours = myResponseTimes.length > 0
    ? myResponseTimes.reduce((a, b) => a + b, 0) / myResponseTimes.length
    : 0;

  // This week's resolutions
  const thisWeekResolved = resolvedReceived.filter(q => {
    return differenceInDays(new Date(), new Date(q.resolved_at!)) <= 7;
  }).length;
  const lastWeekResolved = resolvedReceived.filter(q => {
    const d = differenceInDays(new Date(), new Date(q.resolved_at!));
    return d > 7 && d <= 14;
  }).length;
  const weeklyChangePercent = lastWeekResolved > 0
    ? Math.round(((thisWeekResolved - lastWeekResolved) / lastWeekResolved) * 100)
    : 0;

  // SLA compliance (my resolved within SLA)
  const myWithinSla = resolvedReceived.filter(q => {
    return differenceInHours(new Date(q.resolved_at!), new Date(q.created_at)) <= slaHours;
  }).length;
  const mySlaPercent = resolvedReceived.length > 0 ? Math.round((myWithinSla / resolvedReceived.length) * 100) : null;

  // All within 24h check (for badge)
  const allWithin24h = myResponseTimes.length > 0 && myResponseTimes.every(h => h <= 24);

  // Bottleneck: group received queries by KRA name, find most delayed
  const kraDelays: Record<string, { total: number; count: number }> = {};
  received.forEach(q => {
    const kra = q.kraName || 'Uncategorized';
    if (!kraDelays[kra]) kraDelays[kra] = { total: 0, count: 0 };
    if (q.status === 'resolved' && q.resolved_at) {
      kraDelays[kra].total += differenceInHours(new Date(q.resolved_at), new Date(q.created_at));
      kraDelays[kra].count++;
    } else if (q.status === 'open') {
      kraDelays[kra].total += differenceInHours(new Date(), new Date(q.created_at));
      kraDelays[kra].count++;
    }
  });

  const bottlenecks = Object.entries(kraDelays)
    .filter(([, v]) => v.count > 0)
    .map(([kra, v]) => ({ kra, avgHours: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 3);

  return {
    totalReceived: received.length,
    totalSent: sent.length,
    totalResolved: resolvedReceived.length,
    openCount: openReceived.length,
    myAvgHours,
    thisWeekResolved,
    lastWeekResolved,
    weeklyChangePercent,
    mySlaPercent,
    allWithin24h,
    bottlenecks,
    myResponseTimes,
  };
}

function computeTeamAvg(teamQueries: QueryData[], slaHours: number) {
  const resolved = teamQueries.filter(q => q.status === 'resolved' && q.resolved_at);
  const times = resolved.map(q => differenceInHours(new Date(q.resolved_at!), new Date(q.created_at))).filter(h => h >= 0);
  const avgHours = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const slaCount = resolved.filter(q => differenceInHours(new Date(q.resolved_at!), new Date(q.created_at)) <= slaHours).length;
  const slaPercent = resolved.length > 0 ? Math.round((slaCount / resolved.length) * 100) : null;
  return { avgHours, slaPercent, totalResolved: resolved.length };
}

function formatHours(hours: number): string {
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return days < 2 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

export function PersonalProductivityInsights({ allQueries, teamQueries, currentUserId, isLoading }: PersonalProductivityInsightsProps) {
  const slaTargetDays = useSlaTargetDays();
  const slaHours = slaTargetDays * 24;
  const personal = useMemo(() => computePersonalMetrics(allQueries, currentUserId, slaHours), [allQueries, currentUserId, slaHours]);
  const team = useMemo(() => computeTeamAvg(teamQueries, slaHours), [teamQueries, slaHours]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><div className="h-24 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }

  // Comparison to team
  const fasterThanTeam = team.avgHours > 0 && personal.myAvgHours > 0
    ? Math.round(((team.avgHours - personal.myAvgHours) / team.avgHours) * 100)
    : 0;

  // Badges
  const badges: BadgeInfo[] = [
    {
      icon: <Zap className="h-5 w-5" />,
      label: 'Speed Demon',
      description: 'Responded to all queries within 24h',
      earned: personal.allWithin24h && personal.myResponseTimes.length >= 3,
      color: 'text-amber-500',
    },
    {
      icon: <Shield className="h-5 w-5" />,
      label: 'SLA Champion',
      description: '100% SLA compliance',
      earned: personal.mySlaPercent !== null && personal.mySlaPercent === 100 && personal.totalResolved >= 3,
      color: 'text-blue-500',
    },
    {
      icon: <Flame className="h-5 w-5" />,
      label: 'On Fire',
      description: 'Resolved 5+ queries this week',
      earned: personal.thisWeekResolved >= 5,
      color: 'text-orange-500',
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      label: 'Zero Backlog',
      description: 'No open queries remaining',
      earned: personal.openCount === 0 && personal.totalReceived > 0,
      color: 'text-green-500',
    },
  ];

  const earnedBadges = badges.filter(b => b.earned);

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">My Productivity</h3>
      </div>

      {/* Personal Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">My Avg Response</p>
            </div>
            <p className="text-xl font-bold text-foreground">{formatHours(personal.myAvgHours)}</p>
            {fasterThanTeam > 0 ? (
              <p className="text-[10px] text-green-600 font-medium">{fasterThanTeam}% faster than team avg</p>
            ) : fasterThanTeam < 0 ? (
              <p className="text-[10px] text-amber-600 font-medium">{Math.abs(fasterThanTeam)}% slower than team avg</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">Team avg: {formatHours(team.avgHours)}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">My SLA Compliance</p>
            </div>
            <p className={cn('text-xl font-bold', personal.mySlaPercent === null ? 'text-muted-foreground' : personal.mySlaPercent >= 90 ? 'text-green-600' : personal.mySlaPercent >= 70 ? 'text-amber-600' : 'text-destructive')}>
              {personal.mySlaPercent !== null ? `${personal.mySlaPercent}%` : 'N/A'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Team avg: {team.slaPercent !== null ? `${team.slaPercent}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              {personal.weeklyChangePercent > 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
              ) : personal.weeklyChangePercent < 0 ? (
                <TrendingDown className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">This Week</p>
            </div>
            <p className="text-xl font-bold text-foreground">{personal.thisWeekResolved} resolved</p>
            <p className="text-[10px] text-muted-foreground">
              {personal.weeklyChangePercent !== 0
                ? `${personal.weeklyChangePercent > 0 ? '↑' : '↓'} ${Math.abs(personal.weeklyChangePercent)}% vs last week`
                : `Same as last week (${personal.lastWeekResolved})`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Open Backlog</p>
            </div>
            <p className={cn('text-xl font-bold', personal.openCount > 0 ? 'text-amber-600' : 'text-green-600')}>
              {personal.openCount}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {personal.totalResolved} of {personal.totalReceived} resolved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Badges & Bottlenecks Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Badges */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-primary" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {badges.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {badges.map(badge => (
                  <div
                    key={badge.label}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                      badge.earned
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-muted/30 border-border opacity-50'
                    )}
                  >
                    <div className={cn(badge.earned ? badge.color : 'text-muted-foreground')}>
                      {badge.icon}
                    </div>
                    <div className="min-w-0">
                      <p className={cn('text-xs font-semibold truncate', badge.earned ? 'text-foreground' : 'text-muted-foreground')}>
                        {badge.earned ? '🏆 ' : ''}{badge.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No badges available yet</p>
            )}
            {earnedBadges.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {earnedBadges.length} of {badges.length} badges earned
              </p>
            )}
          </CardContent>
        </Card>

        {/* Bottleneck Identification */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Bottleneck Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {personal.bottlenecks.length > 0 ? (
              <div className="space-y-3">
                {personal.bottlenecks.map((b, i) => {
                  const maxHours = personal.bottlenecks[0].avgHours;
                  const pct = maxHours > 0 ? (b.avgHours / maxHours) * 100 : 0;
                  return (
                    <div key={b.kra} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium truncate max-w-[60%]">{b.kra}</span>
                        <span className="text-muted-foreground">{formatHours(b.avgHours)} avg · {b.count} queries</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground">
                  Most delays in "{personal.bottlenecks[0].kra}" category
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No bottleneck data available yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Comparison Summary */}
      {team.totalResolved > 0 && (
        <Card className="border-l-4 border-l-primary/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Your avg:</span>
                <span className="font-semibold text-foreground">{formatHours(personal.myAvgHours)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Team avg:</span>
                <span className="font-semibold text-foreground">{formatHours(team.avgHours)}</span>
              </div>
              <div className="flex items-center gap-2">
                {fasterThanTeam > 0 ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    ↑ {fasterThanTeam}% faster
                  </Badge>
                ) : fasterThanTeam < 0 ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                    ↓ {Math.abs(fasterThanTeam)}% slower
                  </Badge>
                ) : (
                  <Badge variant="outline">On par with team</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

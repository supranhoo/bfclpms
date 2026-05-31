import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, AlertTriangle, Activity, ArrowRight, Plus,
  TrendingUp, Clock, CheckCircle2, AlertOctagon, Loader2,
} from 'lucide-react';
import { useSafetyDashboardStats } from '@/hooks/useSafetyDashboardStats';
import { SafetyStickyActionBar } from '@/components/safety/SafetyStickyActionBar';
import {
  SAFETY_STATUS_LABELS,
  SAFETY_SEVERITY_LABELS,
  SAFETY_INCIDENT_STAGES,
} from '@/lib/safetyIncidents';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import { format } from 'date-fns';

/**
 * SafetyHome
 * ----------
 * Live HSE dashboard. Aggregates whatever incidents the caller can see (RLS
 * already restricts this) into KPI tiles, severity/stage breakdowns, an
 * overdue queue, and a "recent reports" feed. All data flows through the
 * `['safety', ...]` cache prefix per POLICY §110.
 */
export default function SafetyHome() {
  const { data, isLoading } = useSafetyDashboardStats();

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 rounded-xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">Safety Dashboard</h1>
          <p className="text-xs sm:text-base text-muted-foreground">
            Live incident posture across reporting, investigation, and closure.
          </p>
        </div>
        <Button asChild className="hidden md:inline-flex">
          <Link to="/safety/incidents/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Report Incident
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading safety posture…
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label="Open Incidents"
              value={data.open}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="warning"
            />
            <KpiTile
              label="Overdue (SLA Red)"
              value={data.bySla.red}
              icon={<AlertOctagon className="h-4 w-4" />}
              tone="destructive"
            />
            <KpiTile
              label="At Risk (SLA Amber)"
              value={data.bySla.amber}
              icon={<Clock className="h-4 w-4" />}
              tone="amber"
            />
            <KpiTile
              label="Closed"
              value={data.byStatus['closed'] ?? 0}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">By Stage</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>Open work distributed across the FSM.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {SAFETY_INCIDENT_STAGES.map((s) => {
                  const count = data.byStatus[s] ?? 0;
                  const pct = data.total ? Math.round((count / data.total) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-3 text-sm">
                      <div className="w-24 sm:w-36 shrink-0 text-xs sm:text-sm text-muted-foreground truncate">
                        {SAFETY_STATUS_LABELS[s]}
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-10 text-right tabular-nums font-medium">{count}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">By Severity</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>Risk profile of all visible incidents.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                  <div
                    key={sev}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {SAFETY_SEVERITY_LABELS[sev]}
                      </div>
                      <div className="text-2xl font-bold tabular-nums">
                        {data.bySeverity[sev] ?? 0}
                      </div>
                    </div>
                    <Badge
                      variant={sev === 'critical' || sev === 'high' ? 'destructive' : 'secondary'}
                    >
                      {sev}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Overdue queue</CardTitle>
                <CardDescription>SLA breached — needs attention now.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/safety/incidents" className="flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.overdue.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No overdue incidents — well done.
                </p>
              ) : (
                data.overdue.map((inc) => (
                  <Link
                    key={inc.id}
                    to={`/safety/incidents/${inc.id}`}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors min-h-[64px]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {inc.incident_number ?? '—'} · {inc.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inc.location} · {format(new Date(inc.created_at), 'dd MMM yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <SafetyStatusBadge status={inc.status} />
                      <SlaBadge state={inc.sla_state} />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Recent reports</CardTitle>
                <CardDescription>Last 5 incidents reported.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/safety/incidents" className="flex items-center gap-1">
                  Open list <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No incidents reported yet.
                </p>
              ) : (
                data.recent.map((inc) => (
                  <Link
                    key={inc.id}
                    to={`/safety/incidents/${inc.id}`}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors min-h-[64px]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {inc.incident_number ?? '—'} · {inc.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {SAFETY_SEVERITY_LABELS[inc.severity]} · {inc.location}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <SafetyStatusBadge status={inc.status} />
                      <SlaBadge state={inc.sla_state} />
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      <SafetyStickyActionBar>
        <Button asChild className="h-11">
          <Link to="/safety/incidents/new" className="flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Report Incident
          </Link>
        </Button>
      </SafetyStickyActionBar>
    </div>
  );
}

function KpiTile({
  label, value, icon, tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'warning' | 'destructive' | 'amber' | 'success';
}) {
  const toneClass = {
    warning: 'bg-primary/10 text-primary',
    destructive: 'bg-destructive/10 text-destructive',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
          </div>
          <div className={`p-2 rounded-lg ${toneClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

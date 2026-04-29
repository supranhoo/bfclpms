import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSafetyAnalytics, useRefreshSafetyAnalytics } from '@/hooks/useSafetyAnalytics';
import { aggregateTotals, complianceBand, trirBand, toCsv } from '@/lib/safetyAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3, RefreshCw, Loader2, Download, AlertTriangle,
  CheckCircle2, GraduationCap, ClipboardCheck, FileSignature, Activity, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * SafetyAnalytics — Phase 7 dashboard
 * -----------------------------------
 * Reads from materialized views via `useSafetyAnalytics`. KPI tiles +
 * BU heatmap + severity stack + CSV export. Admin/safety_head can
 * trigger an immediate MV refresh.
 */
export default function SafetyAnalytics() {
  const { data, isLoading } = useSafetyAnalytics();
  const refresh = useRefreshSafetyAnalytics();

  const totals = useMemo(() => (data ? aggregateTotals(data) : null), [data]);

  function handleExport() {
    if (!data) return;
    const rows = data.trir.map((t) => {
      const sev = data.severity.find((s) => s.business_unit_id === t.business_unit_id);
      const oc = data.open_vs_closed.find((o) => o.business_unit_id === t.business_unit_id);
      const aud = data.audit_scoreboard.find((a) => a.business_unit_id === t.business_unit_id);
      const pt = data.permit_throughput.find((p) => p.business_unit_id === t.business_unit_id);
      return {
        business_unit_id: t.business_unit_id ?? '(unassigned)',
        hours_worked: t.hours_worked,
        recordable_cases: t.recordable_cases,
        trir: t.trir ?? '',
        critical: sev?.critical_count ?? 0,
        high: sev?.high_count ?? 0,
        medium: sev?.medium_count ?? 0,
        low: sev?.low_count ?? 0,
        open: oc?.open_count ?? 0,
        closed: oc?.closed_count ?? 0,
        audit_avg: aud?.avg_score ?? '',
        permits_active: pt?.active_count ?? 0,
      };
    });
    const csv = toCsv(rows, [
      'business_unit_id', 'hours_worked', 'recordable_cases', 'trir',
      'critical', 'high', 'medium', 'low', 'open', 'closed',
      'audit_avg', 'permits_active',
    ]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safety-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || !data || !totals) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading analytics…
      </div>
    );
  }

  const trirInfo = trirBand(totals.orgTrir);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-7 w-7" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Analytics</h1>
          <p className="text-muted-foreground">
            TRIR, severity, training, audit, and permit performance — last 12 months.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/safety/settings/hours-worked" className="flex items-center gap-1">
              <Activity className="h-4 w-4" /> Hours Entry
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: (r) => {
                  if (r?.ok) toast.success('Analytics refreshed');
                  else toast.error(r?.error ?? 'Refresh failed');
                },
                onError: (e: unknown) =>
                  toast.error((e as Error).message ?? 'Refresh failed'),
              })
            }
            disabled={refresh.isPending}
          >
            {refresh.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiTile
          label="Org TRIR (12mo)"
          value={totals.orgTrir == null ? '—' : totals.orgTrir.toFixed(2)}
          sub={trirInfo.label}
          tone={trirInfo.tone}
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Open Incidents"
          value={totals.openIncidents}
          tone="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiTile
          label="Closed Incidents"
          value={totals.closedIncidents}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiTile
          label="Critical Severity"
          value={totals.criticalSev}
          tone="destructive"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiTile
          label="Training %"
          value={totals.trainingPct == null ? '—' : `${totals.trainingPct}%`}
          tone="primary"
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <KpiTile
          label="Active Permits"
          value={totals.activePermits}
          tone="primary"
          icon={<FileSignature className="h-4 w-4" />}
        />
      </div>

      {/* BU heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Business Unit Heatmap
          </CardTitle>
          <CardDescription>
            TRIR, audit average, and incident posture per business unit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.trir.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No business unit data yet. Add hours-worked entries to start TRIR tracking.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">BU</th>
                    <th className="py-2 pr-4 text-right">Hours</th>
                    <th className="py-2 pr-4 text-right">Recordables</th>
                    <th className="py-2 pr-4 text-right">TRIR</th>
                    <th className="py-2 pr-4 text-right">Open</th>
                    <th className="py-2 pr-4 text-right">Closed</th>
                    <th className="py-2 pr-4 text-right">Audit Avg</th>
                    <th className="py-2 pr-4 text-right">Active PTW</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trir.map((row) => {
                    const oc = data.open_vs_closed.find((o) => o.business_unit_id === row.business_unit_id);
                    const aud = data.audit_scoreboard.find((a) => a.business_unit_id === row.business_unit_id);
                    const pt = data.permit_throughput.find((p) => p.business_unit_id === row.business_unit_id);
                    const ti = trirBand(row.trir);
                    const ab = complianceBand(aud?.avg_score ?? null);
                    return (
                      <tr key={row.business_unit_id ?? 'na'} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.business_unit_id?.slice(0, 8) ?? '(unassigned)'}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {Number(row.hours_worked).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.recordable_cases}</td>
                        <td className="py-2 pr-4 text-right">
                          <Badge variant={ti.tone === 'destructive' ? 'destructive' : 'secondary'}>
                            {row.trir == null ? '—' : row.trir} · {ti.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{oc?.open_count ?? 0}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{oc?.closed_count ?? 0}</td>
                        <td className="py-2 pr-4 text-right">
                          <Badge variant={ab.tone === 'destructive' ? 'destructive' : 'secondary'}>
                            {aud?.avg_score ?? '—'} · {ab.label}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pt?.active_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Severity & Audit summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Severity Mix (12mo)</CardTitle>
            <CardDescription>Aggregated across all business units.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
              const total = data.severity.reduce((a, r) => a + Number(r[`${sev}_count` as 'critical_count']) || 0, 0);
              const grand = data.severity.reduce((a, r) => a + Number(r.total_count || 0), 0);
              const pct = grand ? Math.round((total / grand) * 100) : 0;
              const tone = sev === 'critical' || sev === 'high' ? 'bg-destructive' : 'bg-primary';
              return (
                <div key={sev} className="flex items-center gap-3 text-sm">
                  <div className="w-20 capitalize text-muted-foreground">{sev}</div>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-10 text-right tabular-nums font-medium">{total}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Audit Compliance
            </CardTitle>
            <CardDescription>
              Avg score: {totals.avgAuditScore == null ? '—' : `${totals.avgAuditScore}/100`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.audit_scoreboard.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No audit runs in the last 12 months.
              </p>
            ) : (
              data.audit_scoreboard.map((a) => {
                const band = complianceBand(a.avg_score);
                return (
                  <div
                    key={a.business_unit_id ?? 'na'}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {a.business_unit_id?.slice(0, 8) ?? '(unassigned)'}
                      </div>
                      <div className="text-sm">
                        {a.run_count} run{a.run_count === 1 ? '' : 's'} · avg {a.avg_score ?? '—'}
                      </div>
                    </div>
                    <Badge variant={band.tone === 'destructive' ? 'destructive' : 'secondary'}>
                      {band.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety" className="flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Safety Home
          </Link>
        </Button>
      </div>
    </div>
  );
}

function KpiTile({
  label, value, sub, icon, tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  tone: 'primary' | 'amber' | 'destructive' | 'success' | 'muted';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    muted: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          <div className={`p-2 rounded-lg ${toneClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
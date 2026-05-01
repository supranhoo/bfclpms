import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, AlertTriangle, GitMerge, RefreshCw, Database, Link2, Unlink } from 'lucide-react';
import { useRegistryHealth } from '@/hooks/useRegistryHealth';
import { format } from 'date-fns';

/**
 * Phase 2c: Health & Coverage dashboard.
 * Read-only — promotion of unlinked signatures is performed via the existing
 * Build/Review tabs, keeping action surfaces consolidated.
 */
export function HealthCoverageTab() {
  const { stats, unlinked, drift, loading, error, refresh } = useRegistryHealth();

  const coveragePct = stats?.coverage_pct ?? 0;
  const coverageTone = useMemo(() => {
    if (coveragePct >= 90) return 'text-emerald-600';
    if (coveragePct >= 60) return 'text-amber-600';
    return 'text-destructive';
  }, [coveragePct]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Registry Health & Coverage</h2>
          <p className="text-xs text-muted-foreground">
            Live metrics for canonical KPI coverage across May 2026+ data.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load registry health: {error}
          </CardContent>
        </Card>
      )}

      {/* KPI summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<Database className="h-4 w-4" />}
          label="Definitions"
          value={stats?.total_definitions}
          loading={loading}
        />
        <MetricCard
          icon={<GitMerge className="h-4 w-4" />}
          label="Aliases"
          value={stats?.total_aliases}
          loading={loading}
        />
        <MetricCard
          icon={<Link2 className="h-4 w-4" />}
          label="Linked KPIs (May 2026+)"
          value={stats?.inscope_kpis_linked}
          sub={stats ? `of ${stats.inscope_kpis_total}` : undefined}
          loading={loading}
        />
        <MetricCard
          icon={<Unlink className="h-4 w-4" />}
          label="Unlinked KPIs"
          value={stats?.inscope_kpis_unlinked}
          sub={stats ? `${stats.inscope_distinct_signatures} unique signatures` : undefined}
          loading={loading}
          tone={stats && stats.inscope_kpis_unlinked > 0 ? 'warn' : undefined}
        />
      </div>

      {/* Coverage gauge */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Canonical Coverage
          </CardTitle>
          <CardDescription>
            Percentage of in-scope KPIs already linked to a canonical definition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className={`text-3xl font-bold tabular-nums ${coverageTone}`}>
                  {coveragePct}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {stats?.inscope_kpis_linked ?? 0} / {stats?.inscope_kpis_total ?? 0} KPIs
                </span>
              </div>
              <Progress value={coveragePct} className="h-2" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Unlinked queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Unlink className="h-4 w-4 text-amber-600" />
            Unlinked Signatures Queue
          </CardTitle>
          <CardDescription>
            Distinct (KRA, KPI) tuples in May 2026+ data that are not linked to the registry.
            Promote them via the <strong>Build Registry</strong> or <strong>Review Registry</strong> tabs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              All in-scope KPIs are linked. 🎉
            </p>
          ) : (
            <div className="rounded-md border overflow-auto max-h-[480px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">KRA</TableHead>
                    <TableHead className="text-xs">KPI</TableHead>
                    <TableHead className="text-xs text-right">Rows</TableHead>
                    <TableHead className="text-xs text-right">Employees</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unlinked.map((r, idx) => (
                    <TableRow key={`${r.category_id}-${r.kra_name}-${r.kpi_name}-${idx}`}>
                      <TableCell className="text-xs text-muted-foreground">{r.category_name}</TableCell>
                      <TableCell className="text-xs font-medium">{r.kra_name}</TableCell>
                      <TableCell className="text-xs">{r.kpi_name}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{r.occurrence_count}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{r.employee_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.last_seen), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alias drift */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Alias Drift Detection
          </CardTitle>
          <CardDescription>
            Canonical definitions whose aliases span multiple KRA names — a possible sign
            of mis-grouping. Review and split if the variants are not truly the same KPI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : drift.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No drift detected. All alias clusters share a single KRA.
            </p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Canonical KRA / KPI</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Variant KRAs</TableHead>
                    <TableHead className="text-xs text-right">Aliases</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drift.map(d => (
                    <TableRow key={d.definition_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{d.canonical_kra_name}</div>
                        <div className="text-muted-foreground">{d.canonical_kpi_name}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.category_name}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {d.variant_kra_names.map(name => (
                            <Badge key={name} variant="outline" className="text-[10px] font-normal">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{d.alias_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon, label, value, sub, loading, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  sub?: string;
  loading: boolean;
  tone?: 'warn';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          <span>{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className={`text-2xl font-semibold tabular-nums ${tone === 'warn' && (value ?? 0) > 0 ? 'text-amber-600' : ''}`}>
            {value ?? 0}
          </div>
        )}
        {sub && !loading && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}
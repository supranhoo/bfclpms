import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useActiveCycle, useReviewerInstances, useTemplate,
} from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowLeft } from 'lucide-react';
import { computeCriteriaScore } from '@/lib/annualReview/scoring';
import type { AnnualReviewResponse } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

type Row = InstanceWithEmployee & {
  selfScore: number | null;
  myScore: number | null;
  delta: number | null;
};

/**
 * Manager calibration worksheet — a side-by-side comparison across the manager's
 * direct reports with self vs manager weighted scores, a rating-distribution
 * panel, and quick navigation back into the review detail to adjust scores.
 */
export default function ManagerCalibration() {
  const { user } = useAuth();
  const { data: cycle } = useActiveCycle();
  const { data: instances = [], isLoading } = useReviewerInstances(user?.id, cycle?.id);

  // Only my direct reports (where I'm the manager).
  const mine = useMemo(
    () => instances.filter((i) => i.manager_id === user?.id),
    [instances, user?.id],
  );

  const templateId = mine[0]?.template_id;
  const { data: template } = useTemplate(templateId);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch responses per instance and compute self vs manager weighted scores.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!template || mine.length === 0) { setRows([]); return; }
      setLoading(true);
      const computed: Row[] = await Promise.all(
        mine.map(async (i) => {
          let responses: AnnualReviewResponse[] = [];
          try { responses = await svc.listResponses(i.id); } catch { /* ignore */ }
          const self = responses.find((r) => r.reviewer_role === 'self');
          const mgr  = responses.find((r) => r.reviewer_role === 'manager');
          const selfScore = self
            ? computeCriteriaScore(template.sections.criteria ?? [], self.criteria_scores ?? {}).totalCriteriaScore
            : null;
          const myScore = mgr
            ? computeCriteriaScore(template.sections.criteria ?? [], mgr.criteria_scores ?? {}).totalCriteriaScore
            : null;
          const delta = selfScore != null && myScore != null ? myScore - selfScore : null;
          return { ...i, selfScore, myScore, delta };
        }),
      );
      if (!cancelled) { setRows(computed); setLoading(false); }
    }
    run();
    return () => { cancelled = true; };
  }, [template, mine]);

  const filtered = useMemo(
    () => rows.filter((r) => !search || (r.employee?.full_name ?? '').toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  );

  const distribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const rating = r.final_rating?.trim();
      if (!rating) continue;
      map.set(rating, (map.get(rating) ?? 0) + 1);
    }
    const total = rows.length || 1;
    return Array.from(map.entries())
      .map(([rating, count]) => ({ rating, count, pct: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const avgSelf = useMemo(() => avg(rows.map((r) => r.selfScore)), [rows]);
  const avgMgr  = useMemo(() => avg(rows.map((r) => r.myScore)), [rows]);

  if (!cycle) return <div className="p-6">No active annual review cycle.</div>;
  if (isLoading) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calibration Worksheet</h1>
          <p className="text-sm text-muted-foreground">{cycle.name} · {mine.length} direct report{mine.length === 1 ? '' : 's'}</p>
        </div>
        <Button variant="outline" asChild className="gap-1.5">
          <Link to="/annual-review/team"><ArrowLeft className="h-4 w-4" /> Back to team reviews</Link>
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Reports" value={mine.length} />
        <StatCard label="Average self-score" value={avgSelf != null ? avgSelf.toFixed(2) : '—'} />
        <StatCard label="Average manager-score" value={avgMgr != null ? avgMgr.toFixed(2) : '—'} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rating distribution (your team)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Helps you spot bunching before submitting. Adjust individual scores from the report's row.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {distribution.length === 0
            ? <p className="text-sm text-muted-foreground">No final ratings on your team yet.</p>
            : distribution.map((d) => (
              <div key={d.rating} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{d.rating}</span>
                  <span className="tabular-nums text-muted-foreground">{d.count} · {d.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))
          }
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {loading && <span className="text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Computing scores…</span>}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Self score</TableHead>
                <TableHead className="text-right">My score</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead>Final rating</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="min-h-10">
                  <TableCell>
                    <div className="font-medium">{r.employee?.full_name ?? r.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{r.employee?.employee_code} · {r.employee?.designation ?? '—'}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.overall_status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.selfScore != null ? r.selfScore.toFixed(2) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.myScore != null ? r.myScore.toFixed(2) : '—'}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.delta != null && Math.abs(r.delta) >= 1 ? 'text-amber-500 font-medium' : 'text-muted-foreground'}`}>
                    {r.delta != null ? (r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2)) : '—'}
                  </TableCell>
                  <TableCell>{r.final_rating ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/annual-review/team`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No reports.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function avg(xs: (number | null)[]): number | null {
  const vals = xs.filter((v): v is number => typeof v === 'number');
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Clock, Ban, TrendingUp, TrendingDown } from 'lucide-react';
import type { ComprehensiveRow } from '@/services/annualReview/comprehensiveReport';

function MiniTable({ rows, showScore = false, showDays = false, showReason = false }: {
  rows: ComprehensiveRow[]; showScore?: boolean; showDays?: boolean; showReason?: boolean;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-2">None.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Dept</TableHead>
          <TableHead>BU</TableHead>
          {showScore && <TableHead className="text-right">Final</TableHead>}
          {showDays && <TableHead className="text-right">Days</TableHead>}
          {showReason && <TableHead>Reason</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.instance_id}>
            <TableCell>
              <div className="font-medium">{r.employee_name}</div>
              <div className="text-xs text-muted-foreground">{r.employee_code}</div>
            </TableCell>
            <TableCell className="text-sm">{r.department_name ?? '—'}</TableCell>
            <TableCell className="text-sm">{r.business_unit_name ?? '—'}</TableCell>
            {showScore && <TableCell className="text-right tabular-nums">{r.total_score?.toFixed(2) ?? '—'}</TableCell>}
            {showDays && <TableCell className="text-right tabular-nums">{r.days_pending ?? '—'}</TableCell>}
            {showReason && <TableCell className="text-sm">{r.excluded_reason ?? '—'}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function HighlightsPanel({ rows }: { rows: ComprehensiveRow[] }) {
  const missing = useMemo(
    () => rows.filter((r) => !r.is_excluded && r.total_score == null && r.overall_status !== 'excluded').slice(0, 20),
    [rows],
  );
  const stale = useMemo(
    () => rows
      .filter((r) => !['completed','excluded'].includes(r.overall_status) && (r.days_pending ?? 0) > 15)
      .sort((a, b) => (b.days_pending ?? 0) - (a.days_pending ?? 0))
      .slice(0, 20),
    [rows],
  );
  const excluded = useMemo(() => rows.filter((r) => r.is_excluded), [rows]);
  const scored = useMemo(
    () => rows.filter((r) => !r.is_excluded && r.total_score != null),
    [rows],
  );
  const top10 = useMemo(
    () => [...scored].sort((a, b) => Number(b.total_score) - Number(a.total_score)).slice(0, 10),
    [scored],
  );
  const bottom10 = useMemo(
    () => [...scored].sort((a, b) => Number(a.total_score) - Number(b.total_score)).slice(0, 10),
    [scored],
  );

  const sections: Array<{ key: string; icon: JSX.Element; title: string; count: number; body: JSX.Element }> = [
    { key: 'missing', icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, title: 'Missing scores', count: missing.length, body: <MiniTable rows={missing} /> },
    { key: 'stale', icon: <Clock className="h-4 w-4 text-amber-500" />, title: 'Pending > 15 days', count: stale.length, body: <MiniTable rows={stale} showDays /> },
    { key: 'excluded', icon: <Ban className="h-4 w-4 text-muted-foreground" />, title: 'Excluded', count: excluded.length, body: <MiniTable rows={excluded} showReason /> },
    { key: 'top', icon: <TrendingUp className="h-4 w-4 text-emerald-600" />, title: 'Top 10 final scores', count: top10.length, body: <MiniTable rows={top10} showScore /> },
    { key: 'bottom', icon: <TrendingDown className="h-4 w-4 text-rose-600" />, title: 'Bottom 10 final scores', count: bottom10.length, body: <MiniTable rows={bottom10} showScore /> },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {s.icon} {s.title} <Badge variant="secondary" className="ml-auto">{s.count}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">{s.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}
/**
 * RPT-REC-001 — Recommendation & cost roll-up report (ADR-226 Phase 2).
 *
 * Reads the same server-paginated queue RPC used by the governance tab, so the
 * report can never drift from the decision surface (single source of truth).
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Download, Loader2 } from 'lucide-react';
import { useActiveCycle } from '@/hooks/useAnnualReview';
import {
  useRecommendationQueue, useRecommendationTypes,
} from '@/hooks/useAnnualReviewRecommendations';
import {
  RECOMMENDATION_STATUS_LABEL,
  formatRecommendationAmount,
  type RecommendationStatus,
} from '@/services/annualReview/recommendations';
import { canDownload } from '@/lib/reports/accessCatalog';

const PAGE_SIZE = 50;
const ALL = '__all__';

export default function RecommendationsReport() {
  const { data: cycle } = useActiveCycle();
  const { data: types = [] } = useRecommendationTypes();
  const [status, setStatus] = useState<string>(ALL);
  const [typeKey, setTypeKey] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filters = useMemo(
    () => ({
      cycleId: cycle?.id ?? '',
      status: status === ALL ? null : (status as RecommendationStatus),
      typeKey: typeKey === ALL ? null : typeKey,
      monetaryOnly: false,
      search: search.trim() || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [cycle?.id, status, typeKey, search, page],
  );

  const { data, isLoading, isFetching } = useRecommendationQueue(filters, !!cycle?.id);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportAllowed = canDownload('recommendations');

  const rollup = useMemo(() => {
    const acc = {
      askedAbsolute: 0, approvedAbsolute: 0,
      askedPercentCount: 0, approvedPercentCount: 0,
      pending: 0, approved: 0, rejected: 0,
    };
    for (const r of rows) {
      if (r.amount_kind === 'absolute' && r.amount_value != null) acc.askedAbsolute += Number(r.amount_value);
      if (r.amount_kind === 'percent' && r.amount_value != null) acc.askedPercentCount += 1;
      if (r.approved_amount_kind === 'absolute' && r.approved_amount_value != null) {
        acc.approvedAbsolute += Number(r.approved_amount_value);
      }
      if (r.approved_amount_kind === 'percent' && r.approved_amount_value != null) {
        acc.approvedPercentCount += 1;
      }
      if (r.status === 'submitted' || r.status === 'needs_classification') acc.pending += 1;
      if (r.status === 'approved' || r.status === 'approved_modified' || r.status === 'implemented') acc.approved += 1;
      if (r.status === 'rejected') acc.rejected += 1;
    }
    return acc;
  }, [rows]);

  const exportCsv = () => {
    const head = [
      'Employee code', 'Employee', 'Department', 'Business unit', 'Recommended by',
      'Stage', 'Types', 'Asked', 'Approved', 'Rating', 'Status', 'Source',
    ];
    const body = rows.map((r) => [
      r.employee_code ?? '', r.employee_name ?? '', r.department_name ?? '',
      r.business_unit_name ?? '', r.reviewer_name ?? '', r.reviewer_role,
      (r.type_labels ?? []).join('; '),
      formatRecommendationAmount(r.amount_kind, r.amount_value),
      formatRecommendationAmount(r.approved_amount_kind, r.approved_amount_value),
      r.final_rating ?? '', RECOMMENDATION_STATUS_LABEL[r.status] ?? r.status,
      r.source === 'legacy_import' ? 'Legacy import' : 'Review form',
    ]);
    const csv = [head, ...body]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `recommendation-costing-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!cycle?.id) {
    return (
      <div className="p-4 md:p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No active annual review cycle.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Recommendation &amp; Cost Roll-up</h1>
        <p className="text-sm text-muted-foreground">
          Promotion, special hike and other monetary asks raised by Dept / BU / Management heads
          for {cycle.name ?? 'the active cycle'}, with HR decisions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Pending decision (page)" value={String(rollup.pending)} />
        <SummaryTile label="Approved (page)" value={String(rollup.approved)} />
        <SummaryTile label="Rejected (page)" value={String(rollup.rejected)} />
        <SummaryTile
          label="Absolute ask vs approved (page)"
          value={`₹${rollup.askedAbsolute.toLocaleString('en-IN')} → ₹${rollup.approvedAbsolute.toLocaleString('en-IN')}`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommendations</CardTitle>
          <CardDescription>
            Percentage-based asks are counted separately from absolute amounts and are not summed
            into a rupee figure: {rollup.askedPercentCount} asked, {rollup.approvedPercentCount} approved on this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {(Object.keys(RECOMMENDATION_STATUS_LABEL) as RecommendationStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{RECOMMENDATION_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeKey} onValueChange={(v) => { setTypeKey(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[220px]">
              <Label className="text-xs text-muted-foreground" htmlFor="rec-rpt-search">Search</Label>
              <Input id="rec-rpt-search" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Employee, code or narrative…" />
            </div>
            {exportAllowed && (
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
                <Download className="h-4 w-4 mr-2" />Export page
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept / BU</TableHead>
                  <TableHead>Recommended by</TableHead>
                  <TableHead>Types</TableHead>
                  <TableHead className="text-right">Asked</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  </TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No recommendations match these filters.
                  </TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.employee_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.department_name ?? '—'}</div>
                      <div className="text-muted-foreground">{r.business_unit_name ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.reviewer_name ?? '—'}</div>
                      <div className="text-muted-foreground">{r.reviewer_role.replace('_', ' ')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.type_labels ?? []).map((l) => (
                          <Badge key={l} variant="outline" className="text-[11px]">{l}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRecommendationAmount(r.amount_kind, r.amount_value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRecommendationAmount(r.approved_amount_kind, r.approved_amount_value)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {RECOMMENDATION_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {total} recommendation(s) · page {page + 1} of {pages}
              {isFetching && <Loader2 className="h-3 w-3 animate-spin inline ml-2" />}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
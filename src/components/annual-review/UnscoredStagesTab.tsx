import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, ClipboardCheck, FileWarning } from 'lucide-react';
import { ORPHAN_STAGE_LABEL } from '@/lib/annualReview/orphanReview';

/**
 * ADR-197 / POLICY §AR-STAGE-SUBMIT-SCORE-COMPLETENESS.
 *
 * Read-only HR console listing reviewer stages that hold a response with no
 * criteria scores. `unscored` rows must be re-scored by the reviewer;
 * `narrative_only` rows are correct (template scores nothing at that stage).
 */
export interface UnscoredStageRow {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
  stage: string;
  reviewer_name: string | null;
  overall_status: string;
  is_locked: boolean;
  has_recommendation: boolean;
  scoreable_criteria: number;
  classification: 'unscored' | 'narrative_only';
  sweep_touched: boolean;
  response_updated_at: string | null;
}

const PAGE_SIZE = 25;

export function UnscoredStagesTab() {
  const [classification, setClassification] = useState<'unscored' | 'narrative_only' | 'all'>('unscored');
  const [stage, setStage] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['annual-review-unscored-stages'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('annual_review_unscored_stage_diagnostic', { p_cycle_id: null });
      if (error) throw error;
      return (data ?? []) as UnscoredStageRow[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (
      (classification === 'all' || r.classification === classification)
      && (stage === 'all' || r.stage === stage)
      && (!q
        || (r.employee_name ?? '').toLowerCase().includes(q)
        || (r.employee_code ?? '').toLowerCase().includes(q))
    ));
  }, [rows, classification, stage, search]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const defects = rows.filter((r) => r.classification === 'unscored').length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-destructive" />
            Unscored reviewer stages
            <Badge variant={defects ? 'destructive' : 'secondary'}>{defects}</Badge>
          </CardTitle>
          <CardDescription>
            Stages where a reviewer saved a recommendation but no criterion scores. “Unscored”
            rows block completion and must be re-scored by the reviewer; “narrative only” rows are
            correct because the template scores nothing at that stage.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Classification</Label>
            <Select value={classification} onValueChange={(v) => { setClassification(v as typeof classification); setPage(0); }}>
              <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unscored">Needs re-scoring</SelectItem>
                <SelectItem value="narrative_only">Narrative only (OK)</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={(v) => { setStage(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="self">Self</SelectItem>
                {Object.entries(ORPHAN_STAGE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Input
              className="h-9 w-56"
              placeholder="Name or code…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="h-6 w-6 mx-auto mb-2" />
            Nothing to review here.
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Criteria</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Classification</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow key={r.instance_id + r.stage}>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{r.employee_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                      </TableCell>
                      <TableCell>
                        {ORPHAN_STAGE_LABEL[r.stage as keyof typeof ORPHAN_STAGE_LABEL] ?? r.stage}
                      </TableCell>
                      <TableCell className="text-sm">{r.reviewer_name ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.overall_status}
                        {r.sweep_touched && (
                          <Badge variant="outline" className="ml-2">Rewound by sweep</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.scoreable_criteria}</TableCell>
                      <TableCell className="text-sm">{r.has_recommendation ? 'Saved' : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={r.classification === 'unscored' ? 'destructive' : 'secondary'}>
                          {r.classification === 'unscored' ? 'Needs re-scoring' : 'Narrative only'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {filtered.length} finding(s) · page {page + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
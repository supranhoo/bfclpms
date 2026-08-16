/**
 * ADR-260 — De-duplication proposal queue.
 * Nothing merges automatically: the scanner only files proposals, an admin
 * approves or rejects each one, and a decision never touches historical scores.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Check, Loader2, ScanSearch, X } from 'lucide-react';
import {
  useMergeProposals,
  useGenerateMergeProposals,
  useDecideMergeProposal,
} from '@/hooks/useBuConsole';

type StatusTab = 'pending' | 'approved' | 'rejected';

export function MergeProposalsTab() {
  const [status, setStatus] = useState<StatusTab>('pending');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMergeProposals(status, page);
  const generate = useGenerateMergeProposals();
  const decide = useDecideMergeProposal();
  const scanError = generate.error as Error | null;

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 200;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Duplicate KPI merge queue</CardTitle>
          <CardDescription>
            Near-identical KPI names (spelling, spacing, punctuation) are proposed here.
            Approving a proposal records the decision — it never edits past scores.
          </CardDescription>
        </div>
        {canWrite && (
          <Button onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
            {generate.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <ScanSearch className="mr-2 h-4 w-4" />}
            Scan for duplicates
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={status} onValueChange={(v) => { setStatus(v as StatusTab); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        {scanError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Duplicate scan could not run</p>
              <p className="text-destructive/90">
                {scanError.message || 'Unexpected error while scanning for duplicate KPI names.'}
              </p>
              <p className="text-destructive/80">
                The queue below may be incomplete — it is not confirmation that there are no duplicates.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {!isLoading && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keep</TableHead>
                  <TableHead>Merge in</TableHead>
                  <TableHead className="text-right">KPI rows</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead>Match</TableHead>
                  {status === 'pending' && <TableHead className="text-right">Decision</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{p.canonical_kpi_name}</p>
                      <p className="text-xs text-muted-foreground">{p.canonical_kra_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{p.variant_kpi_name}</p>
                      <p className="text-xs text-muted-foreground">{p.variant_kra_name}</p>
                    </TableCell>
                    <TableCell className="text-right">{p.affected_kpi_count}</TableCell>
                    <TableCell className="text-right">{p.affected_employee_count}</TableCell>
                    <TableCell>
                      <Badge variant={p.match_type === 'exact' ? 'secondary' : 'outline'}>
                        {p.match_type}
                        {p.similarity != null && ` · ${Math.round(Number(p.similarity) * 100)}%`}
                      </Badge>
                    </TableCell>
                    {status === 'pending' && canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: p.id, approve: true })}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: p.id, approve: false })}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={status === 'pending' ? 6 : 5} className="text-center text-sm text-muted-foreground">
                      {scanError
                        ? 'The list could not be refreshed because the last scan failed.'
                        : 'Nothing in this list. Run a scan to look for duplicates.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {rows.length} of {total} proposal{total === 1 ? '' : 's'} · page {data?.page ?? 1} of {totalPages}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
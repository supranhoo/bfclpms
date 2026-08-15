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
import { Check, Loader2, ScanSearch, X } from 'lucide-react';
import {
  useMergeProposals,
  useGenerateMergeProposals,
  useDecideMergeProposal,
} from '@/hooks/useBuConsole';

type StatusTab = 'pending' | 'approved' | 'rejected';

export function MergeProposalsTab() {
  const [status, setStatus] = useState<StatusTab>('pending');
  const { data, isLoading } = useMergeProposals(status);
  const generate = useGenerateMergeProposals();
  const decide = useDecideMergeProposal();

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
        <Button onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
          {generate.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <ScanSearch className="mr-2 h-4 w-4" />}
          Scan for duplicates
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={status} onValueChange={(v) => setStatus(v as StatusTab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

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
                {(data ?? []).map(p => (
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
                    {status === 'pending' && (
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
                {(data ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={status === 'pending' ? 6 : 5} className="text-center text-sm text-muted-foreground">
                      Nothing in this list. Run a scan to look for duplicates.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, ShieldCheck } from 'lucide-react';

interface Row {
  bucket: 'will_create' | 'skip_existing' | 'manual_review' | 'orphan_no_kpis';
  source_config_id: string;
  config_type: string;
  config_value: string;
  review_period: string | null;
  review_year: number | null;
  global_template_id: string;
  existing_period_template_id: string | null;
  reason: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MigrateGlobalDefaultsDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ run_id: string; rows_inserted: number; rows_skipped: number } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workflow-global-default-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('analyze_workflow_global_default_migration');
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: open,
    staleTime: 0,
  });

  const summary = (data || []).reduce(
    (acc, r) => {
      acc[r.bucket] = (acc[r.bucket] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const willCreate = (data || []).filter((r) => r.bucket === 'will_create');

  const handleApply = async () => {
    setApplying(true);
    try {
      const { data: rpc, error } = await supabase.rpc('apply_workflow_global_default_migration');
      if (error) throw error;
      const row = Array.isArray(rpc) ? rpc[0] : rpc;
      setResult(row);
      toast({
        title: 'Migration complete',
        description: `Created ${row.rows_inserted} period-specific mapping(s).`,
      });
      qc.invalidateQueries({ queryKey: ['workflow-configs'] });
      qc.invalidateQueries({ queryKey: ['workflow-global-default-analysis'] });
      refetch();
    } catch (e: any) {
      toast({ title: 'Migration failed', description: e.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ['bucket', 'config_type', 'config_value', 'review_period', 'review_year', 'global_template_id', 'existing_period_template_id', 'reason'];
    const lines = [header.join(',')].concat(
      data.map((r) =>
        header
          .map((h) => {
            const v = (r as any)[h];
            const s = v == null ? '' : String(v);
            return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(',')
      )
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-global-default-migration-analysis.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Convert Global Defaults to Period-Specific</DialogTitle>
          <DialogDescription>
            Read-only analysis first. Only safe rows (where the resolved workflow template stays the same) will be created.
            Existing period-specific mappings are never overwritten. Global Default rows are kept as internal fallback.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">Will create: {summary.will_create || 0}</Badge>
              <Badge variant="secondary">Skip (exists): {summary.skip_existing || 0}</Badge>
              <Badge variant="outline">Orphan (no KPIs): {summary.orphan_no_kpis || 0}</Badge>
              <Badge variant="destructive">Manual review: {summary.manual_review || 0}</Badge>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Migration is idempotent. Resolved templates remain identical, so re-percolation triggers are no-ops.
                Audit trail is written to <code>workflow_config_migration_log</code>.
              </AlertDescription>
            </Alert>

            <ScrollArea className="h-72 rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data || []).slice(0, 500).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant="outline">{r.bucket}</Badge></TableCell>
                      <TableCell className="text-xs">{r.config_type}</TableCell>
                      <TableCell className="text-xs font-mono">{r.config_value.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs">{r.review_period ? `${r.review_period} ${r.review_year}` : '—'}</TableCell>
                      <TableCell className="text-xs">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {result && (
              <Alert>
                <AlertDescription className="text-sm">
                  Run ID: <code className="text-xs">{result.run_id}</code> · Inserted: {result.rows_inserted} · Skipped: {result.rows_skipped}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={exportCsv} disabled={!data?.length}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleApply} disabled={applying || !willCreate.length}>
            {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Apply migration ({willCreate.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Layers, Search, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Candidate {
  kpi_id: string;
  kpi_name: string;
  kra_name: string;
  review_period: string;
  review_year: number;
  employee_id: string;
  employee_name: string | null;
  sibling_id: string;
  inherit_scope: string | null;
}

interface ReconcileResult {
  dry_run: boolean;
  candidate_count: number;
  candidates: Candidate[];
  updated: number;
}

export function OrgKpiInheritanceReconciler() {
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('reconcile_org_kpi_inheritance', { p_dry_run: true });
      if (error) throw error;
      const r = data as unknown as ReconcileResult;
      setResult(r);
      toast({
        title: 'Inheritance scan complete',
        description: `Found ${r.candidate_count} KPI(s) that should inherit Org-level status.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc('reconcile_org_kpi_inheritance', { p_dry_run: false });
      if (error) throw error;
      const r = data as unknown as ReconcileResult;
      setResult(r);
      toast({
        title: 'Reconciliation complete',
        description: `Updated ${r.updated} KPI(s) to Org-level. Auto-pull will fire for any with propagated values.`,
      });
    } catch (err: any) {
      toast({ title: 'Reconciliation failed', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const candidates = result?.candidates ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Reconcile Org KPI Inheritance
        </CardTitle>
        <CardDescription>
          Find existing KPIs that should be Org-level (because a sibling KPI with the same signature already is) but aren't, and bulk-promote them. Use this to back-fill KPIs created before the auto-inherit trigger was active.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={handleScan} disabled={scanning || applying} variant="outline">
            {scanning ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
            ) : (
              <><Search className="h-4 w-4" /> Scan Inheritance Gaps</>
            )}
          </Button>
          {result && result.candidate_count > 0 && !applying && (
            <Button onClick={() => setConfirmOpen(true)} disabled={applying}>
              <Layers className="h-4 w-4" /> Reconcile {result.candidate_count} KPI(s)
            </Button>
          )}
        </div>

        {result && result.candidate_count === 0 && (
          <div className="flex items-center gap-2 p-4 rounded-lg border text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>All KPIs are correctly inheriting Org-level status. Nothing to reconcile.</span>
          </div>
        )}

        {candidates.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{result?.candidate_count ?? 0} candidates</Badge>
              {result?.updated ? <Badge variant="default">{result.updated} updated</Badge> : null}
            </div>
            <div className="rounded-md border max-h-[480px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>KRA</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Inherit Scope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.kpi_id}>
                      <TableCell className="text-sm">{c.employee_name ?? '—'}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{c.kra_name}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{c.kpi_name}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{c.review_period} {c.review_year}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{c.inherit_scope ?? 'organization'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onConfirm={handleApply}
        onCancel={() => setConfirmOpen(false)}
        title={`Reconcile ${result?.candidate_count ?? 0} KPI(s) to Org-level?`}
        description={`This sets is_org_level=true and inherits org_level_scope from the matching sibling for ${result?.candidate_count ?? 0} KPI(s). Each row is audit-logged with action ORG_KPI_INHERITANCE_RECONCILED. The existing auto-pull trigger will fire afterwards for KPIs whose OKVs are already propagated.`}
        confirmLabel="Reconcile Now"
        isLoading={applying}
      />
    </Card>
  );
}

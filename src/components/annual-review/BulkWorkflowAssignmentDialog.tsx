import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { AnnualReviewCycle, AnnualReviewStatus, AnnualReviewerRole } from '@/types/annualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import { describeChain, enabledChain } from '@/lib/annualReview/stageChain';

/**
 * Bulk per-employee workflow assignment (mirrors BulkTemplateAssignmentDialog).
 *
 * Workbook columns:
 *   Employee Code | Full Name | Current Stages |
 *   Manager (Y/N) | Skip (Y/N) | BU (Y/N) | HR (Y/N) | Reason
 *
 * Self is always enabled. Rows where the resulting chain == current chain
 * are skipped. Server-side RPC enforces stage gate + admin/hr_pms role.
 */

const ELIGIBLE_STAGES: AnnualReviewStatus[] = ['not_started', 'pending_self'];

type RowOutcome =
  | { kind: 'apply'; instanceId: string; enabledStages: AnnualReviewerRole[]; reason: string; employeeCode: string; from: string; to: string }
  | { kind: 'noop'; employeeCode: string; reason: string }
  | { kind: 'error'; employeeCode: string; reason: string };

const TRUTHY = new Set(['Y', 'YES', 'TRUE', '1', 'X', '✓']);
const FALSY  = new Set(['N', 'NO', 'FALSE', '0', '']);

function parseFlag(raw: unknown, fallback: boolean): boolean | null {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === '') return fallback;
  if (TRUTHY.has(v)) return true;
  if (FALSY.has(v)) return false;
  return null;
}

export function BulkWorkflowAssignmentDialog({
  open, onOpenChange, cycle, instances, onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: AnnualReviewCycle;
  instances: svc.InstanceWithEmployee[];
  onDone?: () => void;
}) {
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const applies = (outcomes ?? []).filter((o) => o.kind === 'apply') as Extract<RowOutcome, { kind: 'apply' }>[];
  const noops = (outcomes ?? []).filter((o) => o.kind === 'noop') as Extract<RowOutcome, { kind: 'noop' }>[];
  const errors = (outcomes ?? []).filter((o) => o.kind === 'error') as Extract<RowOutcome, { kind: 'error' }>[];

  const byCode = useMemo(() => {
    const m = new Map<string, svc.InstanceWithEmployee>();
    for (const i of instances) {
      const c = (i.employee?.employee_code ?? '').trim();
      if (c) m.set(c, i);
    }
    return m;
  }, [instances]);

  const reset = () => { setOutcomes(null); setProgress(null); };

  const handleExport = () => {
    const headers = ['Employee Code', 'Full Name', 'Current Stages', 'Manager (Y/N)', 'Skip (Y/N)', 'BU (Y/N)', 'HR (Y/N)', 'Reason'];
    const data = instances.map((i) => {
      const chain = enabledChain(i.enabled_stages);
      const has = (s: AnnualReviewerRole) => (chain.includes(s) ? 'Y' : 'N');
      return {
        'Employee Code': i.employee?.employee_code ?? '',
        'Full Name': i.employee?.full_name ?? '',
        'Current Stages': describeChain(i.enabled_stages),
        'Manager (Y/N)': has('manager'),
        'Skip (Y/N)': has('skip_manager'),
        'BU (Y/N)': has('bu_head'),
        'HR (Y/N)': has('hr'),
        'Reason': '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Workflows');
    XLSX.writeFile(wb, `annual-review-${cycle.review_year}-bulk-workflow-assignment.xlsx`);
  };

  const handleParse = async (file: File) => {
    reset();
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      const res: RowOutcome[] = [];
      for (const rec of records) {
        const code = String(rec['Employee Code'] ?? '').trim();
        const reason = String(rec['Reason'] ?? '').trim();
        if (!code) continue;

        const inst = byCode.get(code);
        if (!inst) { res.push({ kind: 'error', employeeCode: code, reason: 'Employee not in this cycle' }); continue; }

        const currChain = enabledChain(inst.enabled_stages);
        const cur = (s: AnnualReviewerRole) => currChain.includes(s);
        const m = parseFlag(rec['Manager (Y/N)'], cur('manager'));
        const s = parseFlag(rec['Skip (Y/N)'], cur('skip_manager'));
        const b = parseFlag(rec['BU (Y/N)'], cur('bu_head'));
        const h = parseFlag(rec['HR (Y/N)'], cur('hr'));
        if (m === null || s === null || b === null || h === null) {
          res.push({ kind: 'error', employeeCode: code, reason: 'Invalid Y/N value in one of the stage columns' });
          continue;
        }

        const nextStages: AnnualReviewerRole[] = ['self'];
        if (m) nextStages.push('manager');
        if (s) nextStages.push('skip_manager');
        if (b) nextStages.push('bu_head');
        if (h) nextStages.push('hr');
        const next = enabledChain(nextStages);

        if (JSON.stringify(next) === JSON.stringify(currChain)) {
          res.push({ kind: 'noop', employeeCode: code, reason: 'Already on this workflow' });
          continue;
        }
        if (!ELIGIBLE_STAGES.includes(inst.overall_status)) {
          res.push({ kind: 'error', employeeCode: code, reason: `Stage ${inst.overall_status} — review already started` });
          continue;
        }
        if (reason.length < 3) {
          res.push({ kind: 'error', employeeCode: code, reason: 'Reason missing or < 3 chars' });
          continue;
        }

        res.push({
          kind: 'apply',
          instanceId: inst.id,
          enabledStages: next,
          reason,
          employeeCode: code,
          from: describeChain(currChain),
          to: describeChain(next),
        });
      }
      setOutcomes(res);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleApply = async () => {
    if (applies.length === 0) return;
    setApplying(true);
    setProgress({ done: 0, total: applies.length });
    try {
      const results = await svc.bulkSetEnabledStages(
        applies.map((a) => ({ instanceId: a.instanceId, enabledStages: a.enabledStages, reason: a.reason, rowKey: a.employeeCode })),
        (done, total) => setProgress({ done, total }),
      );
      const okN = results.filter((r) => r.ok).length;
      const failN = results.length - okN;
      if (failN === 0) toast.success(`Updated ${okN} workflow${okN === 1 ? '' : 's'}.`);
      else toast.warning(`Updated ${okN}, failed ${failN}. See report.`);

      if (failN > 0) {
        const failByKey = new Map(results.filter((r) => !r.ok).map((r) => [r.rowKey ?? r.instanceId, r.error ?? 'Failed']));
        setOutcomes((prev) => (prev ?? []).map((o) => {
          if (o.kind === 'apply' && failByKey.has(o.employeeCode)) {
            return { kind: 'error', employeeCode: o.employeeCode, reason: failByKey.get(o.employeeCode) ?? 'Failed' };
          }
          return o;
        }));
      } else {
        onDone?.();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk workflow assignment</DialogTitle>
          <DialogDescription>
            Download the workbook, mark <strong>Y</strong> or <strong>N</strong> in each stage column,
            add a <strong>Reason</strong>, then upload to preview &amp; apply. Self Review is always required.
            Only rows in <em>not started</em> or <em>pending self</em> are eligible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" /> Download template ({instances.length} rows)
            </Button>
            <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer text-sm">
              <Upload className="h-4 w-4" />
              <span>Upload &amp; preview</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (f) handleParse(f);
                }}
              />
            </label>
            {outcomes && (
              <div className="ml-auto flex items-center gap-2 text-xs">
                <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {applies.length} to apply</Badge>
                <Badge variant="secondary">{noops.length} skipped</Badge>
                {errors.length > 0 && (
                  <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {errors.length} errors</Badge>
                )}
              </div>
            )}
          </div>

          {outcomes && (
            <div className="border rounded-md max-h-80 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>From → To / Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outcomes.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No actionable rows.</TableCell></TableRow>
                  )}
                  {outcomes.map((o, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{o.employeeCode}</TableCell>
                      <TableCell>
                        {o.kind === 'apply' && <Badge variant="default">Apply</Badge>}
                        {o.kind === 'noop' && <Badge variant="secondary">Skip</Badge>}
                        {o.kind === 'error' && <Badge variant="destructive">Error</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {o.kind === 'apply'
                          ? <span>{o.from} → <strong>{o.to}</strong> · <span className="text-muted-foreground">{o.reason}</span></span>
                          : o.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {progress && (
            <p className="text-xs text-muted-foreground">Applying… {progress.done} / {progress.total}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>Close</Button>
          <Button
            onClick={handleApply}
            disabled={applying || !outcomes || applies.length === 0}
            className="gap-2"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            Apply {applies.length} workflow{applies.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
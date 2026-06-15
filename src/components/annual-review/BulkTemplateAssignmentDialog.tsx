import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { AnnualReviewTemplate, AnnualReviewCycle, AnnualReviewStatus } from '@/types/annualReview';
import * as svc from '@/services/annualReview/annualReviewService';

/**
 * Part C — Bulk CSV/XLSX-driven template assignment.
 *
 * Workflow:
 *   1. Download a template populated with current cycle rows (Employee Code,
 *      Full Name, Current Template, New Template = blank, Reason = blank).
 *   2. Edit it offline; only fill `New Template` + `Reason` for rows you want
 *      to change. Use `CLEAR` in New Template to remove an existing override.
 *   3. Upload — the dialog runs a dry-run preview classifying each row, then
 *      a single click applies via batched `setTemplateOverride` RPC calls.
 *
 * Validation per row:
 *   - Employee Code must resolve to an instance in this cycle.
 *   - Instance overall_status MUST be `not_started` or `pending_self`
 *     (server-side RPC enforces; client classifies for preview).
 *   - New Template must match an active template name (case-insensitive trim),
 *     OR the literal value `CLEAR` to remove an override.
 *   - Reason min 3 chars.
 *   - Rows where the resolved target == current effective template are skipped.
 */

const ELIGIBLE_STAGES: AnnualReviewStatus[] = ['not_started', 'pending_self'];

type RowOutcome =
  | { kind: 'apply'; instanceId: string; targetId: string | null; reason: string; employeeCode: string; employeeName: string; from: string; to: string }
  | { kind: 'noop'; employeeCode: string; reason: string }
  | { kind: 'error'; employeeCode: string; reason: string };

export function BulkTemplateAssignmentDialog({
  open,
  onOpenChange,
  cycle,
  instances,
  templates,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: AnnualReviewCycle;
  instances: svc.InstanceWithEmployee[];
  templates: AnnualReviewTemplate[];
  onDone?: () => void;
}) {
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const activeTemplates = useMemo(() => templates.filter((t) => t.is_active), [templates]);
  const tplByName = useMemo(() => {
    const m = new Map<string, AnnualReviewTemplate>();
    for (const t of activeTemplates) m.set(t.name.trim().toLowerCase(), t);
    return m;
  }, [activeTemplates]);
  const tplById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const applies = (outcomes ?? []).filter((o) => o.kind === 'apply') as Extract<RowOutcome, { kind: 'apply' }>[];
  const noops = (outcomes ?? []).filter((o) => o.kind === 'noop') as Extract<RowOutcome, { kind: 'noop' }>[];
  const errors = (outcomes ?? []).filter((o) => o.kind === 'error') as Extract<RowOutcome, { kind: 'error' }>[];

  const reset = () => { setOutcomes(null); setProgress(null); };

  const handleExport = () => {
    const headers = ['Employee Code', 'Full Name', 'Current Template', 'Stage', 'New Template', 'Reason'];
    const data = instances.map((i) => {
      const currentId = svc.resolveTemplateId(i);
      return {
        'Employee Code': i.employee?.employee_code ?? '',
        'Full Name': i.employee?.full_name ?? '',
        'Current Template': currentId ? tplById.get(currentId)?.name ?? '' : '',
        'Stage': i.overall_status,
        'New Template': '',
        'Reason': '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, `annual-review-${cycle.review_year}-bulk-template-assignment.xlsx`);
  };

  const handleParse = async (file: File) => {
    reset();
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      const byCode = new Map<string, svc.InstanceWithEmployee>();
      for (const i of instances) {
        const c = (i.employee?.employee_code ?? '').trim();
        if (c) byCode.set(c, i);
      }

      const res: RowOutcome[] = [];
      for (const rec of records) {
        const code = String(rec['Employee Code'] ?? '').trim();
        const newTplRaw = String(rec['New Template'] ?? '').trim();
        const reason = String(rec['Reason'] ?? '').trim();
        if (!code) continue;
        if (!newTplRaw) continue; // user didn't request a change

        const inst = byCode.get(code);
        if (!inst) { res.push({ kind: 'error', employeeCode: code, reason: 'Employee not in this cycle' }); continue; }
        if (!ELIGIBLE_STAGES.includes(inst.overall_status)) {
          res.push({ kind: 'error', employeeCode: code, reason: `Stage ${inst.overall_status} — review already started` });
          continue;
        }
        if (reason.length < 3) {
          res.push({ kind: 'error', employeeCode: code, reason: 'Reason missing or < 3 chars' });
          continue;
        }

        let targetId: string | null;
        let targetName: string;
        if (newTplRaw.toUpperCase() === 'CLEAR') {
          if (!inst.template_override_id) { res.push({ kind: 'noop', employeeCode: code, reason: 'No override to clear' }); continue; }
          targetId = null;
          targetName = `(clear → ${tplById.get(inst.template_id)?.name ?? '—'})`;
        } else {
          const tpl = tplByName.get(newTplRaw.toLowerCase());
          if (!tpl) { res.push({ kind: 'error', employeeCode: code, reason: `Unknown template "${newTplRaw}"` }); continue; }
          targetId = tpl.id;
          targetName = tpl.name;
        }

        const currentEffectiveId = svc.resolveTemplateId(inst);
        const finalEffectiveId = targetId ?? inst.template_id;
        if (currentEffectiveId === finalEffectiveId) {
          res.push({ kind: 'noop', employeeCode: code, reason: 'Already on this template' });
          continue;
        }

        res.push({
          kind: 'apply',
          instanceId: inst.id,
          targetId,
          reason,
          employeeCode: code,
          employeeName: inst.employee?.full_name ?? '',
          from: currentEffectiveId ? tplById.get(currentEffectiveId)?.name ?? '—' : '—',
          to: targetName,
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
      const results = await svc.bulkSetTemplateOverrides(
        applies.map((a) => ({ instanceId: a.instanceId, templateId: a.targetId, reason: a.reason, rowKey: a.employeeCode })),
        (done, total) => setProgress({ done, total }),
      );
      const okN = results.filter((r) => r.ok).length;
      const failN = results.length - okN;
      if (failN === 0) toast.success(`Applied ${okN} override${okN === 1 ? '' : 's'}.`);
      else toast.warning(`Applied ${okN}, failed ${failN}. See report.`);

      // Surface failures back into the outcomes table.
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
          <DialogTitle>Bulk template assignment</DialogTitle>
          <DialogDescription>
            Download the workbook, fill <strong>New Template</strong> and <strong>Reason</strong> for rows you want
            to change (use <code>CLEAR</code> to remove an existing override), then upload to preview &amp; apply.
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
                      <TableCell className="font-mono text-xs">{o.kind === 'apply' ? o.employeeCode : o.employeeCode}</TableCell>
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
            Apply {applies.length} override{applies.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import type { AnnualReviewCycle } from '@/types/annualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import {
  isValidStageWeights, resolveStageWeights, STAGE_WEIGHT_KEYS,
  type StageWeights, type StageWeightKey,
} from '@/lib/annualReview/finalScore';

/**
 * Phase 3 — Bulk per-employee final-score weight override via Excel.
 *
 * Workbook columns (one row per employee, downloaded pre-populated):
 *   Employee Code | Full Name | Current Blend |
 *   Self % | Manager % | Skip % | BU Head % | HR % | System % | Criteria % | Reason
 *
 * Rules:
 *   - Leave a stage blank or 0 to disable it for this employee.
 *   - Active values must sum to exactly 100 (±0.01) — enforced client-side
 *     (preview) and server-side (RPC + trigger).
 *   - Use literal `CLEAR` in the Self % column (and leave others blank) to
 *     remove an existing override and restore the template default.
 *   - Reason is mandatory (≥3 chars). Admin / HR PMS only — enforced by RPC.
 *
 * Mirrors the Bulk Template / Workflow dialog pattern: dry-run preview,
 * then a single Apply click with progress.
 */

const COL: Record<StageWeightKey, string> = {
  self: 'Self %',
  manager: 'Manager %',
  skip_manager: 'Skip %',
  dept_head: 'Dept Head %',
  bu_head: 'BU Head %',
  hr: 'HR %',
  system: 'System %',
  criteria: 'Criteria %',
};

type RowOutcome =
  | { kind: 'apply'; instanceId: string; weights: StageWeights | null; reason: string; employeeCode: string; from: string; to: string }
  | { kind: 'noop'; employeeCode: string; reason: string }
  | { kind: 'error'; employeeCode: string; reason: string };

function describeBlend(w: StageWeights | null | undefined): string {
  if (!w) return '—';
  const parts = STAGE_WEIGHT_KEYS
    .map((k) => ({ k, v: Number(w[k] ?? 0) }))
    .filter((x) => x.v > 0)
    .map((x) => `${x.k} ${x.v}%`);
  return parts.length ? parts.join(' · ') : '—';
}

function parseNumCell(raw: unknown): { ok: true; value: number } | { ok: false } {
  const s = String(raw ?? '').trim();
  if (s === '') return { ok: true, value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

export function BulkStageWeightsAssignmentDialog({
  open, onOpenChange, cycle, instances, templatesById, onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: AnnualReviewCycle;
  instances: svc.InstanceWithEmployee[];
  /** Map of template id → template for resolving the current effective blend. */
  templatesById: Map<string, { sections?: { stage_weights?: StageWeights } }>;
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

  const effectiveBlend = (inst: svc.InstanceWithEmployee): StageWeights => {
    const tplId = svc.resolveTemplateId(inst);
    const tpl = tplId ? templatesById.get(tplId) ?? null : null;
    return resolveStageWeights(inst, tpl as never);
  };

  const handleExport = () => {
    const headers = [
      'Employee Code', 'Full Name', 'Current Blend',
      ...STAGE_WEIGHT_KEYS.map((k) => COL[k]),
      'Reason',
    ];
    const data = instances.map((i) => {
      const eff = effectiveBlend(i);
      const row: Record<string, unknown> = {
        'Employee Code': i.employee?.employee_code ?? '',
        'Full Name': i.employee?.full_name ?? '',
        'Current Blend': describeBlend(eff),
      };
      for (const k of STAGE_WEIGHT_KEYS) {
        row[COL[k]] = eff[k] ?? '';
      }
      row['Reason'] = '';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stage Weights');
    XLSX.writeFile(wb, `annual-review-${cycle.review_year}-bulk-stage-weights.xlsx`);
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
        if (!inst) {
          res.push({ kind: 'error', employeeCode: code, reason: 'Employee not in this cycle' });
          continue;
        }

        // CLEAR sentinel: literal "CLEAR" anywhere in Self % column clears the override.
        const selfRaw = String(rec[COL.self] ?? '').trim().toUpperCase();
        const isClear = selfRaw === 'CLEAR';

        if (!isClear) {
          // Parse weights — every non-blank cell must be a non-negative finite number.
          const next: StageWeights = {};
          let bad = false;
          for (const k of STAGE_WEIGHT_KEYS) {
            const parsed = parseNumCell(rec[COL[k]]);
            if (!parsed.ok) {
              res.push({ kind: 'error', employeeCode: code, reason: `Invalid number for "${COL[k]}"` });
              bad = true;
              break;
            }
            if (parsed.value > 0) next[k] = parsed.value;
          }
          if (bad) continue;

          if (Object.keys(next).length === 0) {
            // All blanks — treat as no-op (use CLEAR if you actually want to drop the override).
            res.push({ kind: 'noop', employeeCode: code, reason: 'All weights blank — use CLEAR to remove override' });
            continue;
          }
          if (!isValidStageWeights(next)) {
            const total = Object.values(next).reduce((a, n) => a + (n ?? 0), 0);
            res.push({ kind: 'error', employeeCode: code, reason: `Weights must sum to 100 (got ${Math.round(total * 100) / 100})` });
            continue;
          }
          if (reason.length < 3) {
            res.push({ kind: 'error', employeeCode: code, reason: 'Reason missing or < 3 chars' });
            continue;
          }

          const cur = effectiveBlend(inst);
          const same = STAGE_WEIGHT_KEYS.every((k) => (cur[k] ?? 0) === (next[k] ?? 0));
          if (same) {
            res.push({ kind: 'noop', employeeCode: code, reason: 'Already on this blend' });
            continue;
          }

          res.push({
            kind: 'apply',
            instanceId: inst.id,
            weights: next,
            reason,
            employeeCode: code,
            from: describeBlend(cur),
            to: describeBlend(next),
          });
        } else {
          if (!inst.stage_weights_override) {
            res.push({ kind: 'noop', employeeCode: code, reason: 'No override to clear' });
            continue;
          }
          if (reason.length < 3) {
            res.push({ kind: 'error', employeeCode: code, reason: 'Reason required to clear override' });
            continue;
          }
          res.push({
            kind: 'apply',
            instanceId: inst.id,
            weights: null,
            reason,
            employeeCode: code,
            from: describeBlend(inst.stage_weights_override as StageWeights),
            to: '(template default)',
          });
        }
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
      const results = await svc.bulkSetStageWeightsOverrides(
        applies.map((a) => ({
          instanceId: a.instanceId,
          weights: a.weights,
          reason: a.reason,
          rowKey: a.employeeCode,
        })),
        (done, total) => setProgress({ done, total }),
      );
      const okN = results.filter((r) => r.ok).length;
      const failN = results.length - okN;
      if (failN === 0) toast.success(`Applied ${okN} weight override${okN === 1 ? '' : 's'}.`);
      else toast.warning(`Applied ${okN}, failed ${failN}. See report.`);

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
          <DialogTitle>Bulk final-score weight assignment</DialogTitle>
          <DialogDescription>
            Download the workbook (pre-filled with the current effective blend per employee),
            edit only the rows you want to override, ensure the per-row total is exactly
            <strong> 100%</strong>, then upload to preview &amp; apply. Use literal
            <code> CLEAR </code> in <strong>Self %</strong> to remove an existing override
            and restore the template default. Reason is mandatory.
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
            Apply {applies.length} override{applies.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
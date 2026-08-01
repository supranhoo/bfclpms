import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { EligibilityCriterion } from '@/types/annualReview';
import {
  applyBulkExemption, BULK_OPERATOR_LABELS, exemptableCriteria, fetchBulkExemptionRuns,
  matchesBulkRule, revokeBulkExemptionRun, type BulkExemptionRun, type BulkOperator,
} from '@/services/annualReview/bulkExemption';
import type { EffectiveEligibility, ExemptionPolicyRow } from '@/lib/annualReview/effectiveEligibility';

interface Candidate {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
  actual: string;
  otherFailures: number;
}

/**
 * ADR-224 — bulk exemption of one eligibility criterion for a whole cycle.
 * The preview mirrors the on-screen grid; the apply path re-evaluates
 * server-side and records an auditable, revocable run.
 */
export function BulkExemptionDialog({
  open, onOpenChange, cycleId, cycleName, eligMaps, policy, eligibilityByInstance, rows,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycleId: string;
  cycleName: string;
  eligMaps: Record<string, EligibilityCriterion[] | undefined>;
  policy: ReadonlyArray<ExemptionPolicyRow>;
  eligibilityByInstance: Map<string, EffectiveEligibility>;
  rows: ReadonlyArray<{ instance_id: string; employee_code: string | null; employee_name: string | null }>;
}) {
  const qc = useQueryClient();
  const criteria = useMemo(() => exemptableCriteria(eligMaps, policy), [eligMaps, policy]);

  const [criterionId, setCriterionId] = useState<string>('');
  const [operator, setOperator] = useState<BulkOperator>('lte');
  const [threshold, setThreshold] = useState('');
  const [onlySoleFailure, setOnlySoleFailure] = useState(true);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revokeRun, setRevokeRun] = useState<BulkExemptionRun | null>(null);

  const criterion = criteria.find((c) => c.id === criterionId) ?? null;

  const preview = useMemo<Candidate[]>(() => {
    if (!criterion || threshold.trim() === '') return [];
    const out: Candidate[] = [];
    for (const r of rows) {
      const elig = eligibilityByInstance.get(r.instance_id);
      if (!elig) continue;
      const m = matchesBulkRule({
        eligibility: elig, criterionId: criterion.id, operator, threshold, onlySoleFailure,
      });
      if (!m.matched) continue;
      out.push({
        instance_id: r.instance_id,
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        actual: m.actual ?? '',
        otherFailures: m.otherFailures,
      });
    }
    return out;
  }, [criterion, rows, eligibilityByInstance, operator, threshold, onlySoleFailure]);

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['ar-bulk-exemption-runs', cycleId],
    queryFn: () => fetchBulkExemptionRuns(cycleId),
    enabled: open && Boolean(cycleId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ar-eligibility-exemptions', cycleId] });
    qc.invalidateQueries({ queryKey: ['ar-bulk-exemption-runs', cycleId] });
  };

  const applyMut = useMutation({
    mutationFn: () => applyBulkExemption({
      cycleId, criterionId: criterion!.id, operator, threshold, onlySoleFailure, reason: reason.trim(),
    }),
    onSuccess: (res) => {
      const applied = res.filter((r) => r.action === 'exempted').length;
      const skipped = res.length - applied;
      invalidate();
      setConfirmOpen(false);
      toast.success(`Bulk exemption applied to ${applied} employee${applied === 1 ? '' : 's'}${skipped > 0 ? ` · ${skipped} skipped` : ''}`);
    },
    onError: (e: Error) => { setConfirmOpen(false); toast.error(e.message); },
  });

  const revokeMut = useMutation({
    mutationFn: (runId: string) => revokeBulkExemptionRun(runId),
    onSuccess: (n) => { invalidate(); setRevokeRun(null); toast.success(`Revoked ${n} exemption${n === 1 ? '' : 's'}`); },
    onError: (e: Error) => { setRevokeRun(null); toast.error(e.message); },
  });

  const canApply = Boolean(criterion) && threshold.trim() !== '' && reason.trim().length >= 5 && preview.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Bulk exempt an eligibility criterion</DialogTitle>
            <DialogDescription>
              {cycleName} — waive one criterion for every employee that meets the threshold.
              The configured exemption penalty still applies to their increment slab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">Criterion</Label>
                <Select value={criterionId} onValueChange={setCriterionId}>
                  <SelectTrigger><SelectValue placeholder="Select an exemptable criterion" /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {criteria.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {criteria.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No exemptable criteria found. Enable them in Annual Review → Admin → Settings.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Select value={operator} onValueChange={(v) => setOperator(v as BulkOperator)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {(Object.keys(BULK_OPERATOR_LABELS) as BulkOperator[]).map((op) => (
                      <SelectItem key={op} value={op}>{BULK_OPERATOR_LABELS[op]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Threshold</Label>
                <Input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={criterion?.type === 'boolean' ? 'true / false' : 'e.g. 10'}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Only sole failure</Label>
                <div className="flex h-10 items-center gap-2">
                  <Switch checked={onlySoleFailure} onCheckedChange={setOnlySoleFailure} />
                  <span className="text-xs text-muted-foreground">
                    {onlySoleFailure ? 'Skip employees blocked by other criteria' : 'Include employees with other failures'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Reason (recorded on every exemption)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. FY25 absenteeism relaxation approved by management"
              />
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b p-2 text-sm">
                <span className="font-medium">Preview</span>
                <Badge variant="secondary">{preview.length} employee{preview.length === 1 ? '' : 's'}</Badge>
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="p-2 text-left font-medium">Code</th>
                      <th className="p-2 text-left font-medium">Name</th>
                      <th className="p-2 text-right font-medium">Actual</th>
                      <th className="p-2 text-right font-medium">Other failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 200).map((c) => (
                      <tr key={c.instance_id} className="border-b last:border-0">
                        <td className="p-2 tabular-nums">{c.employee_code ?? '—'}</td>
                        <td className="p-2">{c.employee_name ?? '—'}</td>
                        <td className="p-2 text-right tabular-nums">{c.actual || '—'}</td>
                        <td className="p-2 text-right tabular-nums">{c.otherFailures}</td>
                      </tr>
                    ))}
                    {preview.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No employees match this rule yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {preview.length > 200 && (
                <p className="border-t p-2 text-xs text-muted-foreground">Showing first 200 of {preview.length}.</p>
              )}
            </div>

            <div className="rounded-md border">
              <div className="border-b p-2 text-sm font-medium">Previous bulk runs</div>
              <div className="max-h-40 overflow-y-auto">
                {runsLoading ? (
                  <p className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </p>
                ) : runs.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No bulk exemptions have been applied for this cycle.</p>
                ) : runs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b p-2 text-xs last:border-0">
                    <div>
                      <p className="font-medium">
                        {r.criterion_label ?? r.criterion_key} {r.operator} {r.threshold}
                        {r.status === 'revoked' && <Badge variant="outline" className="ml-2 text-[10px]">Revoked</Badge>}
                      </p>
                      <p className="text-muted-foreground">
                        {r.applied_count} applied · {new Date(r.created_at).toLocaleString()} · {r.reason}
                      </p>
                    </div>
                    {r.status !== 'revoked' && (
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRevokeRun(r)}>
                        <Undo2 className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button disabled={!canApply || applyMut.isPending} onClick={() => setConfirmOpen(true)}>
              {applyMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply to {preview.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => applyMut.mutate()}
        isLoading={applyMut.isPending}
        title="Apply bulk exemption?"
        description={`This waives "${criterion?.name ?? ''}" for the matching employees and applies the configured exemption penalty to their increment slab. The run is recorded and can be revoked.`}
        confirmLabel="Apply exemption"
      />

      <ConfirmDestructiveDialog
        open={Boolean(revokeRun)}
        onCancel={() => setRevokeRun(null)}
        onConfirm={() => revokeRun && revokeMut.mutate(revokeRun.id)}
        isLoading={revokeMut.isPending}
        title="Revoke this bulk exemption?"
        description="Every exemption created by this run will be removed and the affected employees return to their original eligibility status."
        confirmLabel="Revoke run"
      />
    </>
  );
}
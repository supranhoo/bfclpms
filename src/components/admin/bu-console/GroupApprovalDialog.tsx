/**
 * ADR-262 Phase 4 — group stage approval.
 *
 * The admin picks the stage to complete for the whole scoped group. The dialog
 * always runs the dry-run RPC first and shows who will move forward (with the
 * score carried into the stage) and who will be skipped, with the reason.
 * Final approval is never available here — approved rows stay immutable
 * (POLICY §88) and the last stage remains a per-employee decision.
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  useGroupAdvancePreview,
  useGroupAdvanceCommit,
  GROUP_ADVANCE_STAGES,
  GROUP_ADVANCE_SKIP_LABELS,
  type GroupAdvanceResult,
  type KpiDetailArgs,
} from '@/hooks/useBuConsole';
import {
  resolveSkipSummary,
  previewTruncation,
  skippedTruncation,
  needsTypedConfirmation,
  confirmationSatisfied,
  affectedCount,
  GROUP_ACTION_CONFIRM_WORD,
} from '@/lib/review/groupPreviewSummary';

interface Props {
  args: KpiDetailArgs | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(2);

export function GroupApprovalDialog({ args, open, onOpenChange }: Props) {
  const [stage, setStage] = useState<string>('manager_check');
  const [remarks, setRemarks] = useState('');
  const [preview, setPreview] = useState<GroupAdvanceResult | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const previewMut = useGroupAdvancePreview();
  const commitMut = useGroupAdvanceCommit();

  const basePayload = useMemo(() => {
    if (!args) return null;
    return {
      categoryId: args.categoryId,
      kraName: args.kraName,
      kpiName: args.kpiName,
      period: args.period,
      year: args.year,
      buIds: args.buIds,
      deptIds: args.deptIds,
      divisionIds: args.divisionIds,
      managerIds: args.managerIds,
      targetStage: stage,
      remarks: remarks.trim() || null,
    };
  }, [args, stage, remarks]);

  const reset = () => {
    setStage('manager_check'); setRemarks(''); setPreview(null); setConfirmText('');
    previewMut.reset(); commitMut.reset();
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const runPreview = async () => {
    if (!basePayload) return;
    setConfirmText('');
    setPreview(await previewMut.mutateAsync(basePayload));
  };

  const runCommit = async () => {
    if (!basePayload) return;
    await commitMut.mutateAsync(basePayload);
    handleClose(false);
  };

  const skipGroups = useMemo(() => resolveSkipSummary(preview), [preview]);
  const previewNote = useMemo(() => previewTruncation(preview), [preview]);
  const skippedNote = useMemo(() => skippedTruncation(preview), [preview]);
  const affected = affectedCount(preview);
  const bigScope = needsTypedConfirmation(preview);
  const confirmed = confirmationSatisfied(preview, confirmText);

  const canCommit = affected > 0 && !commitMut.isPending && confirmed;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve this KPI for the whole group</DialogTitle>
          <DialogDescription>
            {args?.kpiName} · {args?.kraName} · {args?.period} {args?.year}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Stage to complete</Label>
            <Select value={stage} onValueChange={(v) => { setStage(v); setPreview(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GROUP_ADVANCE_STAGES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only employees whose next stage is exactly this one move forward.
              Final approval stays a per-employee decision.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bu-approve-remarks">Remarks (optional)</Label>
            <Textarea
              id="bu-approve-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Recorded against every employee in this batch"
            />
          </div>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{preview.will_advance ?? 0} will move forward</Badge>
              <Badge variant="outline">{preview.will_skip ?? 0} will be skipped</Badge>
            </div>

            {skipGroups.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skipGroups.map(({ reason, count }) => (
                  <Badge key={reason} variant="outline" className="font-normal">
                    {GROUP_ADVANCE_SKIP_LABELS[reason] ?? reason}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {previewNote.message && (
              <p className="text-xs text-muted-foreground">{previewNote.message}</p>
            )}

            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Weightage</TableHead>
                    <TableHead className="text-right">Score carried</TableHead>
                    <TableHead>Now</TableHead>
                    <TableHead>Moves to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(preview.preview ?? []).map(r => (
                    <TableRow key={r.kpi_id}>
                      <TableCell className="font-medium">
                        {r.employee_name ?? '—'}
                        {r.employee_code && (
                          <span className="ml-1 text-xs text-muted-foreground">({r.employee_code})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.department_name ?? '—'}</TableCell>
                      <TableCell className="text-right">{fmt(r.weightage)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {r.is_na ? 'N/A' : fmt(r.carry_forward_score)}
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.current_status ?? '—'}</Badge></TableCell>
                      <TableCell><Badge>{r.next_status ?? '—'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(preview.preview ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No employee in this scope is waiting at that stage.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {(preview.skipped_details ?? []).length > 0 && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Skipped employees ({preview.will_skip ?? preview.skipped_details!.length})
                </summary>
                {skippedNote.message && (
                  <p className="mt-2 text-xs text-muted-foreground">{skippedNote.message}</p>
                )}
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {preview.skipped_details!.map((s, i) => (
                    <li key={`${s.kpi_id}-${i}`}>
                      {s.employee_name ?? s.kpi_id} — {GROUP_ADVANCE_SKIP_LABELS[s.reason] ?? s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {bigScope && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p>
                    This will advance <strong>{affected}</strong> employees in one go. Type{' '}
                    <strong>{GROUP_ACTION_CONFIRM_WORD}</strong> to confirm.
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={GROUP_ACTION_CONFIRM_WORD}
                    className="max-w-[200px]"
                  />
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button variant="secondary" onClick={runPreview} disabled={!args || previewMut.isPending}>
            {previewMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Preview
          </Button>
          <Button
            onClick={runCommit}
            disabled={!canCommit}
            title={
              !preview
                ? 'Run the preview first'
                : bigScope && !confirmed
                  ? `Type ${GROUP_ACTION_CONFIRM_WORD} to confirm this large approval`
                  : undefined
            }
          >
            {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve {affected} employees
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

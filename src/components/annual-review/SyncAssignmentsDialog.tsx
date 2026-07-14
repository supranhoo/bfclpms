import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { SeededConflict } from '@/services/annualReview/formMapping';

/**
 * Shared dialog for reassigning already-seeded employees onto a new template
 * via the per-employee override RPC. Used from the Form Mapping Save flow AND
 * the per-rule "Sync assignments" action on the Rules tab.
 */
export function SyncAssignmentsDialog({
  open, onOpenChange, conflicts, targetTemplateName, onConfirm, submitting,
  onForceReset, forceResetting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conflicts: SeededConflict[];
  targetTemplateName: string;
  onConfirm: () => void;
  submitting: boolean;
  /**
   * Destructive path. When provided, past-self rows get a per-row
   * "Force reset" checkbox. Selected rows are archived server-side and
   * restarted at pending_self on the target template. Called after the
   * caller has passed the second-confirm gate below.
   */
  onForceReset?: (instanceIds: string[], reason: string) => Promise<void> | void;
  forceResetting?: boolean;
}) {
  const eligible = conflicts.filter((c) => c.eligible_for_reassign);
  const ineligible = conflicts.filter((c) => !c.eligible_for_reassign);
  const canForceReset = typeof onForceReset === 'function';

  const [forceSelected, setForceSelected] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typedGate, setTypedGate] = useState('');

  const forceIds = useMemo(
    () => ineligible.filter((c) => forceSelected[c.instance_id]).map((c) => c.instance_id),
    [ineligible, forceSelected],
  );
  const forceNames = useMemo(
    () => ineligible
      .filter((c) => forceSelected[c.instance_id])
      .map((c) => c.full_name || c.employee_code || c.instance_id),
    [ineligible, forceSelected],
  );
  const allForceChecked = ineligible.length > 0 && ineligible.every((c) => forceSelected[c.instance_id]);

  const gateOk = reason.trim().length >= 10 && typedGate.trim().toUpperCase() === 'RESET';

  const closeAll = (o: boolean) => {
    if (!o) {
      setForceSelected({});
      setConfirmOpen(false);
      setReason('');
      setTypedGate('');
    }
    onOpenChange(o);
  };

  const handleForceConfirm = async () => {
    if (!onForceReset || forceIds.length === 0 || !gateOk) return;
    await onForceReset(forceIds, reason.trim());
    setConfirmOpen(false);
    setReason('');
    setTypedGate('');
    setForceSelected({});
  };

  return (
    <Dialog open={open} onOpenChange={closeAll}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Move already-seeded employees to {targetTemplateName || 'the new template'}?</DialogTitle>
          <DialogDescription>
            {conflicts.length} employee{conflicts.length === 1 ? '' : 's'} in this
            audience already have a review instance on a different template. Mapping
            rules only affect <strong>future</strong> seed runs — moving existing
            instances requires an explicit per-employee override, which is
            audit-logged and only applied to employees still in{' '}
            <code>not_started</code> or <code>pending_self</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Currently on</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conflicts.map((c) => (
                <TableRow key={c.instance_id}>
                  <TableCell className="font-mono text-xs">{c.employee_code ?? '—'}</TableCell>
                  <TableCell>{c.full_name ?? '—'}</TableCell>
                  <TableCell>{c.current_template_name}</TableCell>
                  <TableCell className="text-xs">{c.overall_status}</TableCell>
                  <TableCell>
                    {c.eligible_for_reassign ? (
                      <Badge variant="default">Will move</Badge>
                    ) : canForceReset ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={!!forceSelected[c.instance_id]}
                          onCheckedChange={(v) =>
                            setForceSelected((prev) => ({ ...prev, [c.instance_id]: v === true }))
                          }
                          aria-label={`Force reset ${c.full_name ?? c.employee_code ?? 'employee'}`}
                        />
                        <span className="text-xs text-destructive">Force reset</span>
                      </label>
                    ) : (
                      <Badge variant="outline" title="Past pending_self — locked">Skipped</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {conflicts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No conflicts. Everyone in the audience is already on this template
                    (or has no instance yet).
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="default">{eligible.length} will move</Badge>
          {ineligible.length > 0 && !canForceReset && (
            <Badge variant="outline">{ineligible.length} locked (past self stage)</Badge>
          )}
          {ineligible.length > 0 && canForceReset && (
            <>
              <Badge variant="outline">{ineligible.length} past self stage</Badge>
              {forceIds.length > 0 && (
                <Badge variant="destructive">{forceIds.length} will be reset (destructive)</Badge>
              )}
              <label className="ml-auto flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={allForceChecked}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    const next: Record<string, boolean> = { ...forceSelected };
                    ineligible.forEach((c) => { next[c.instance_id] = on; });
                    setForceSelected(next);
                  }}
                  aria-label="Select all locked instances for destructive reset"
                />
                <span>Select all locked (reset &amp; swap)</span>
              </label>
            </>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => closeAll(false)} disabled={submitting || forceResetting}>
            Keep as-is (future seeds only)
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || forceResetting || eligible.length === 0}
          >
            {submitting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Reassign {eligible.length} now
          </Button>
          {canForceReset && (
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || forceResetting || forceIds.length === 0}
              title="Wipe prior responses and restart these instances on the new template"
            >
              {forceResetting
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <AlertTriangle className="h-4 w-4 mr-2" />}
              Force reset {forceIds.length} & swap
            </Button>
          )}
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Destroy {forceIds.length} submitted self-review{forceIds.length === 1 ? '' : 's'}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    This will archive and then <strong>wipe</strong> every response
                    already saved by the employee (and their reviewers) on the old
                    template, swap the instance to{' '}
                    <strong>{targetTemplateName || 'the new template'}</strong>, and
                    restart it at <code>pending_self</code>. Archived data stays
                    readable in the audit archive.
                  </p>
                  <div className="max-h-32 overflow-auto rounded border bg-muted/50 p-2 text-xs">
                    {forceNames.map((n) => <div key={n}>{n}</div>)}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="force-reset-reason">Reason (min 10 characters)</Label>
                    <Textarea
                      id="force-reset-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Employee moved to a new role; earlier self-review is invalid."
                      className="min-h-[80px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="force-reset-gate">
                      Type <code>RESET</code> to confirm
                    </Label>
                    <Input
                      id="force-reset-gate"
                      value={typedGate}
                      onChange={(e) => setTypedGate(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={forceResetting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!gateOk || forceResetting}
                onClick={(e) => { e.preventDefault(); void handleForceConfirm(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {forceResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset &amp; reassign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

export default SyncAssignmentsDialog;
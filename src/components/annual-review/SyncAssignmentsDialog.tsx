import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { SeededConflict } from '@/services/annualReview/formMapping';

/**
 * Shared dialog for reassigning already-seeded employees onto a new template.
 *
 * Policy: a template remap must move ALL affected employees to the new
 * template — no partial state, no per-row opt-in. Instances still in
 * `not_started` / `pending_self` are non-destructively overridden; instances
 * that have already submitted (past `pending_self`) are archived + wiped and
 * restarted at `pending_self` on the new template so the employee sees and
 * refills the blank form.
 *
 * When any past-self instance is present the admin must supply a reason
 * (min 10 chars) and type `RESET` to confirm the destructive portion. When
 * every conflict is eligible the dialog reduces to a simple confirm.
 */
export function SyncAssignmentsDialog({
  open, onOpenChange, conflicts, targetTemplateName, onSyncAll, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conflicts: SeededConflict[];
  targetTemplateName: string;
  /**
   * Single-action handler. Receives the split (eligible vs past-self) and
   * the admin-supplied reason. Callers are expected to run both server calls
   * (`bulkReassignViaOverride` for eligible + `bulkForceResetInstances` for
   * past-self) and aggregate the results.
   */
  onSyncAll: (args: {
    eligibleInstanceIds: string[];
    resetInstanceIds: string[];
    reason: string;
  }) => Promise<void> | void;
  submitting: boolean;
}) {
  const eligible = useMemo(
    () => conflicts.filter((c) => c.eligible_for_reassign),
    [conflicts],
  );
  const pastSelf = useMemo(
    () => conflicts.filter((c) => !c.eligible_for_reassign),
    [conflicts],
  );
  const needsResetGate = pastSelf.length > 0;

  const [reason, setReason] = useState('');
  const [gate, setGate] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('');
      setGate('');
    }
  }, [open]);

  const reasonOk = needsResetGate
    ? reason.trim().length >= 10
    : reason.trim().length >= 3;
  const gateOk = needsResetGate ? gate.trim().toUpperCase() === 'RESET' : true;
  const canSubmit = conflicts.length > 0 && reasonOk && gateOk && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void onSyncAll({
      eligibleInstanceIds: eligible.map((c) => c.instance_id),
      resetInstanceIds: pastSelf.map((c) => c.instance_id),
      reason: reason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Move already-seeded employees to {targetTemplateName || 'the new template'}?</DialogTitle>
          <DialogDescription>
            {conflicts.length} employee{conflicts.length === 1 ? '' : 's'} in this
            audience already have a review instance on a different template.
            Confirming will move <strong>all</strong> of them onto{' '}
            <strong>{targetTemplateName || 'the new template'}</strong>. Employees
            still in <code>not_started</code> / <code>pending_self</code> are moved
            non-destructively. Employees who have already submitted are archived,
            their responses are wiped, and they restart at <code>pending_self</code>
            {' '}so they refill the blank new form.
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
                    ) : (
                      <Badge variant="destructive" title="Already submitted — will be archived and reset to pending_self">
                        Will reset (destructive)
                      </Badge>
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
          {pastSelf.length > 0 && (
            <Badge variant="destructive">{pastSelf.length} will be reset (destructive)</Badge>
          )}
        </div>

        {needsResetGate && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>{pastSelf.length}</strong>{' '}
                {pastSelf.length === 1 ? 'employee has' : 'employees have'}{' '}
                already submitted. Their responses will be archived and they
                will refill the blank new form. This cannot be undone.
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="sync-reason">
              Reason {needsResetGate ? '(min 10 characters)' : '(min 3 characters)'}
            </Label>
            <Textarea
              id="sync-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                needsResetGate
                  ? 'e.g. Template updated; syncing all employees so submitted forms are refilled on the latest version.'
                  : 'Reason for reassigning (audit-logged).'
              }
              className="min-h-[70px]"
            />
          </div>
          {needsResetGate && (
            <div className="space-y-1">
              <Label htmlFor="sync-gate">Type <code>RESET</code> to confirm the destructive portion</Label>
              <Input
                id="sync-gate"
                value={gate}
                onChange={(e) => setGate(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={needsResetGate ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {submitting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : needsResetGate
                ? <AlertTriangle className="h-4 w-4 mr-2" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync all {conflicts.length} to {targetTemplateName || 'new template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SyncAssignmentsDialog;
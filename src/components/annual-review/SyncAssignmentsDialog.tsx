import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw } from 'lucide-react';
import type { SeededConflict } from '@/services/annualReview/formMapping';

/**
 * Shared dialog for reassigning already-seeded employees onto a new template
 * via the per-employee override RPC. Used from the Form Mapping Save flow AND
 * the per-rule "Sync assignments" action on the Rules tab.
 */
export function SyncAssignmentsDialog({
  open, onOpenChange, conflicts, targetTemplateName, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conflicts: SeededConflict[];
  targetTemplateName: string;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const eligible = conflicts.filter((c) => c.eligible_for_reassign);
  const ineligible = conflicts.filter((c) => !c.eligible_for_reassign);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    {c.eligible_for_reassign
                      ? <Badge variant="default">Will move</Badge>
                      : <Badge variant="outline" title="Past pending_self — locked">Skipped</Badge>}
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
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="default">{eligible.length} will move</Badge>
          {ineligible.length > 0 && (
            <Badge variant="outline">{ineligible.length} locked (past self stage)</Badge>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep as-is (future seeds only)
          </Button>
          <Button onClick={onConfirm} disabled={submitting || eligible.length === 0}>
            {submitting
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Reassign {eligible.length} now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SyncAssignmentsDialog;
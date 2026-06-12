import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useCloseDuplicateIncident, type SafetyIncidentRow } from '@/hooks/useSafetyIncidents';

/**
 * Phase 2 — Safety Head / Admin action to formally close an incident that
 * has been marked as a duplicate. Bypasses verification-evidence checks;
 * server-side RPC enforces role + duplicate-flag preconditions.
 */
export function CloseDuplicateDialog({
  open,
  onOpenChange,
  incident,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: SafetyIncidentRow;
}) {
  const [notes, setNotes] = useState('');
  const close = useCloseDuplicateIncident();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setNotes('');
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close duplicate incident</DialogTitle>
          <DialogDescription>
            This will close <span className="font-mono">{incident.incident_number}</span> and
            stop its SLA clock. The link to the master incident is preserved
            on the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="close-dup-notes">Closure notes (optional)</Label>
          <Textarea
            id="close-dup-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any closure context for the audit log…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={close.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              close.mutate(
                { incidentId: incident.id, notes: notes.trim() || undefined },
                {
                  onSuccess: () => {
                    setNotes('');
                    onOpenChange(false);
                  },
                },
              )
            }
            disabled={close.isPending}
          >
            {close.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Close duplicate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
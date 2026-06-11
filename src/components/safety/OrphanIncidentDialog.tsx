import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useActiveProfilesLite, formatSafetyProfileLabel } from '@/hooks/useSafetyOrg';
import { useReviveOrphanedIncident } from '@/hooks/useSafetyIncidents';
import { useMySafetyRoles } from '@/hooks/useSafetyRoles';
import type { SafetyIncidentRow } from '@/hooks/useSafetyIncidents';

/**
 * Phase 1 / ADR-089 — Orphan Incident Triage Dialog.
 * Lets a Safety Admin / Head reassign an `orphaned` incident back into the
 * FSM (-> assigned) via the dedicated `revive_orphaned_safety_incident` RPC.
 * Generic stage transitions remain blocked for orphaned incidents.
 */
export function OrphanIncidentDialog({
  incident, open, onOpenChange,
}: {
  incident: SafetyIncidentRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: profiles = [], isLoading } = useActiveProfilesLite();
  const { data: myRoles = [] } = useMySafetyRoles();
  const canRevive = myRoles.includes('admin') || myRoles.includes('safety_head');
  const revive = useReviveOrphanedIncident();

  const [assignee, setAssignee] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles.slice(0, 50);
    return profiles
      .filter((p) =>
        (p.full_name ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.employee_code ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [profiles, search]);

  const onSubmit = async () => {
    if (!incident || !assignee) return;
    await revive.mutateAsync({ incidentId: incident.id, assignedTo: assignee, notes });
    setAssignee('');
    setNotes('');
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Revive Orphaned Incident
          </DialogTitle>
          <DialogDescription>
            {incident?.incident_number
              ? `${incident.incident_number} · ${incident.title}`
              : 'Assign an active owner to bring this incident back into the workflow.'}
          </DialogDescription>
        </DialogHeader>

        {!canRevive ? (
          <p className="text-sm text-muted-foreground py-4">
            Only Safety Admin or Safety Head can revive orphaned incidents. Please contact your Safety Head.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="orphan-search">Search employee</Label>
              <Input
                id="orphan-search"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Label>New owner *</Label>
              <Select value={assignee} onValueChange={setAssignee} disabled={isLoading}>
                <SelectTrigger><SelectValue placeholder={isLoading ? 'Loading…' : 'Select assignee'} /></SelectTrigger>
                <SelectContent>
                  {filtered.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatSafetyProfileLabel(p)}
                      {p.email && p.full_name ? ` · ${p.email}` : ''}
                    </SelectItem>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matches.</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="orphan-notes">Notes (optional)</Label>
              <Textarea
                id="orphan-notes"
                rows={3}
                placeholder="Why is this being reassigned?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {canRevive && (
            <Button onClick={onSubmit} disabled={!assignee || revive.isPending}>
              {revive.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revive & Assign
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}